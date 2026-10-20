// 界面层：侧栏、标签页、消息渲染、输入框、账号与设置
const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag); e.__anc = 1;   // 客户端自己建的元素：浏览器模式里挂到悬浮层（见 WebLayer）
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) if (sv != null) { if (sk.startsWith('--')) e.style.setProperty(sk, String(sv)); else e.style[sk] = sv; } } else e.setAttribute(k, v === true ? '' : v);
  }
  if (e.classList?.contains('spin') && !e.style.animationDelay) e.style.animationDelay = '-' + (Math.floor(typeof performance !== 'undefined' ? performance.now() : Date.now()) % 800) + 'ms';
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>', ext: '<path d="M12 2.2a2.1 2.1 0 0 1 2.1 2.1c0 .55-.2 1.05-.55 1.4H17.5a2 2 0 0 1 2 2v3.95c.35-.35.85-.55 1.4-.55a2.1 2.1 0 0 1 0 4.2c-.55 0-1.05-.2-1.4-.55V18.7a2 2 0 0 1-2 2h-3.95c.35-.35.55-.85.55-1.4a2.1 2.1 0 0 0-4.2 0c0 .55.2 1.05.55 1.4H6.5a2 2 0 0 1-2-2v-3.95c-.35.35-.85.55-1.4.55a2.1 2.1 0 0 1 0-4.2c.55 0 1.05.2 1.4.55V7.7a2 2 0 0 1 2-2h3.95c-.35-.35-.55-.85-.55-1.4A2.1 2.1 0 0 1 12 2.2z"/>', pin: '<path d="M8 3h8l-1 7 3 3v2h-5v6l-1 2-1-2v-6H6v-2l3-3z"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', send: '<path d="M12 19V5M5 12l7-7 7 7"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', halfc: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>', dots: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  house: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>', server: '<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="16.5" r="1" fill="currentColor" stroke="none"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>', retry: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>', brain: '<path d="M9 4a3 3 0 0 0-3 3v.3A3 3 0 0 0 4 10v1a3 3 0 0 0 1 2.2V15a3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3v.3a3 3 0 0 1 2 2.7v1a3 3 0 0 1-1 2.2V15a3 3 0 0 1-3 3h-1V4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
};
ICON.queue = '<path d="M4 6h12M4 11h12M4 16h7"/><path d="M17.5 14v6M14.5 17h6"/>';
ICON.undo = '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
ICON.pen = '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>';
ICON.sort = '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>';
ICON.mic = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>';
ICON.github = '<path fill="currentColor" stroke="none" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>';   // 账号卡片的「已登录 GitHub」标记（GitHub 官方标志，实心）
const isMob = () => document.body.classList.contains('m');
const K = (...a) => a.flat().filter(x => x != null && x !== false);
const icon = (n, cls = '') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic ' + cls); s.innerHTML = ICON[n] || ''; return s; };

function toast(msg, kind = '') {
  let box = $('#anc-toasts'); if (!box) { box = h('div', { id: 'anc-toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind }, msg); box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5000 : 2600);
}
// ---------- 弹窗 / 菜单 / 底部面板的关闭动画 ----------
// 各处关闭弹窗都是直接 el.remove()：这里在真正移除的同时放一个「影子」（克隆、不可交互、没有 id）淡出 / 滑下，约 0.2 秒后自动消失。
// 原元素立即移除（代码里的状态判断不受影响）；影子带 anc-gh 类，查询时排除。
(() => {
  const SEL = '.modal-back,.dlg-back,.menu,.asheet-back', SKIP = '.att-zoom,.anc-gh,.out,[data-noghost]';
  const orig = Element.prototype.remove;
  Element.prototype.remove = function () {
    try {
      if (this.parentNode === document.body && !document.hidden && this.matches(SEL) && !this.matches(SKIP)) {
        const all = this.getElementsByTagName('*');
        if (all.length < 2500) {
          const r = this.getBoundingClientRect();
          if (r.width && r.height) {
            const g = this.cloneNode(true), gall = g.getElementsByTagName('*');
            const sc = []; for (let i = 0; i < all.length; i++) { const e = all[i]; if (e.scrollTop) sc.push([i, e.scrollTop]); }
            const fs = this.querySelectorAll('input,textarea,select'), fd = g.querySelectorAll('input,textarea,select');
            fs.forEach((s, i) => { const d = fd[i]; if (!d) return; if (s.type === 'checkbox' || s.type === 'radio') d.checked = s.checked; else d.value = s.value; });
            g.removeAttribute('id'); g.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
            g.classList.add('anc-gh'); g.inert = true; g.setAttribute('aria-hidden', 'true');
            const top = this.scrollTop;
            orig.call(this);
            document.body.appendChild(g);
            if (top) g.scrollTop = top; for (const [i, t] of sc) if (gall[i]) gall[i].scrollTop = t;
            let dead = false; const kill = () => { if (dead) return; dead = true; try { orig.call(g); } catch {} };
            g.addEventListener('animationend', e => { if (e.target === g) kill(); });
            setTimeout(kill, 280);
            return;
          }
        }
      }
    } catch {}
    return orig.call(this);
  };
})();
// 消息时间：uuid v7 的前 48 位就是毫秒时间戳（用户消息 / 回复的 id 都是 v7）
const idTime = id => { const x = String(id || '').replace(/-/g, ''); if (!/^[0-9a-f]{32}$/i.test(x) || x[12] !== '7') return 0; const t = parseInt(x.slice(0, 12), 16); return t > 1.6e12 && t < 4.2e12 ? t : 0; };
// 今天：14:05；今年：9月28日 14:05；更早：2025/9/28 14:05
const clock = ms => {
  if (!ms) return ''; const d = new Date(ms), n = new Date(), p = x => String(x).padStart(2, '0'), hm = p(d.getHours()) + ':' + p(d.getMinutes());
  if (d.toDateString() === n.toDateString()) return hm;
  const y = new Date(n); y.setDate(n.getDate() - 1); if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
  return d.getFullYear() === n.getFullYear() ? (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
};
const clockFull = ms => { if (!ms) return ''; const d = new Date(ms), p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
const durTxt = s => s < 60 ? s.toFixed(1) + 's' : s < 3600 ? Math.floor(s / 60) + '分' + Math.round(s % 60) + '秒' : Math.floor(s / 3600) + '小时' + Math.round(s % 3600 / 60) + '分';
const fmtTime = s => {
  const d = new Date(String(s).replace(' ', 'T').replace(/\+00$/, 'Z')); if (isNaN(d)) return '';
  const diff = (now() - d) / 1000;
  if (diff < 60) return '刚刚'; if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return `${d.getMonth() + 1}-${d.getDate()}`;
};
const pad = n => String(n).padStart(2, '0');
// 版本号统一写成带点的：fable-5-1-spirit → fable-5.1-spirit（和 fable-5.1-low 一致）；只改显示，不改会话名
const dotVer = n => String(n || '').replace(/(^|[-_ ])(\d{1,2})-(\d)(?=$|[-_ ·])/, '$1$2.$3');
// 有厂商图标的地方不再写厂商名（图标就是厂商）：gpt-6-astra-spirit → 6-astra-spirit、claude-opus-5-max → opus-5-max
const cardName = n => { n = Strength.canon(n); if (!Brand.of(n)) return n; return dotVer(Brand.short(n)); };
// ---------- 队列发送：对话进行中时输入的内容先排队，本轮结束后合并成一条（每次的内容换行隔开）自动发出 ----------
// ---------- 输入框草稿 / 队列 / 发出但服务器还没确认收到的消息：怎么都不丢 ----------
// 每次改动立即写本机（localStorage），再写一份到宿主（安卓：SharedPreferences 同步写盘；电脑：配置文件）——
// 退出、闪退、被系统杀掉、切换账号回来都还在。发出的消息在服务器确认收到（已接单 / 对话记录里有）之前一直留一份：
// 服务器没收到（比如刚点发送就闪退了）→ 下次打开这个对话时放回它的输入框
const Drafts = {
  d: null, pt: 0, ready: false, sess: new Set(), chk: new Set(), wait: new Set(),
  acct() { return UI.host?.account?.id || null; },
  load() {
    const account = this.acct() || 'web';
    if (!this.d || (this.scope && this.scope !== account)) {
      let v = Store.get('drafts@' + account, null);
      if (!v) { const owner = Store.get('drafts:owner', null); if (!owner || owner === account) { v = Store.get('drafts', null); if (v && typeof v === 'object') Store.set('drafts:owner', account); } }
      this.d = v && typeof v === 'object' ? v : {};
    }
    this.scope = account;
    const d = this.d; if (!d.t || typeof d.t !== 'object') d.t = {}; if (!d.q || typeof d.q !== 'object') d.q = {}; if (!Array.isArray(d.o)) d.o = [];
    return d;
  },
  /* 对话被删除 / 归档：它的待发送队列不再保留 */
  dropChats(sids) { const d = this.load(); let n = 0; for (const k of sids) if (d.q[k]) { delete d.q[k]; n++; } if (n) this.write(false); return n; },
  write(push, requireLocal = false) { const d = this.load(), ok = Store.set('drafts@' + this.scope, d) !== false; if (!ok && requireLocal) return false; clearTimeout(this.pt); if (push) this.push(); else this.pt = setTimeout(() => this.push(), 300); return ok; },
  push() { clearTimeout(this.pt); this.pt = 0; const id = this.acct(); if (!id || !Host.shared) return; const value = JSON.parse(JSON.stringify(this.load())); return this.pushTail = (this.pushTail || Promise.resolve()).catch(() => {}).then(() => Host.shared('draft@' + id, value)).catch(e => { console.warn('draft backup', e); }); },
  attOut(a) { return a?.res && a.res.key ? { key: a.res.key, filename: a.res.filename || a.name || 'file', mediaType: a.res.mediaType || a.type || '', size: a.res.size || a.size || 0, hash: a.res.hash || '', url: a.res.url || '' } : null; },
  attIn(r) { return { name: r.filename || 'file', size: r.size || 0, type: r.mediaType || '', state: 'ok', stage: '', pct: 1, res: r, p: Promise.resolve(r), url: /^image\//.test(r.mediaType || '') && r.hash ? Uploads.webPath(r.hash) : null, subs: new Set() }; },
  missing(atts) { return (atts || []).filter(a => !this.attOut(a)).map(a => ({ name: a.name, size: a.size, type: a.type })); },
  entryAtts(e) { return [...(e?.atts || []).map(a => this.attIn(a)), ...(e?.missing || []).map(a => ({ ...a, state: 'bad', err: '附件未上传完成即退出，请重新添加', p: Promise.resolve(null), subs: new Set() }))]; },
  // 启动：宿主那份和本机那份合并（每个标签 / 每个对话的队列按修改时间取新的；未确认的消息取并集，反正都会再向服务器核对）
  async pull() {
    const d = this.load(), id = this.acct(); let r = null;
    if (id && Host.shared) try { r = await Host.shared('draft@' + id); } catch {}
    if (r && typeof r === 'object') {
      for (const [k, v] of Object.entries(r.t || {})) if (v && (!d.t[k] || (v.at || 0) > (d.t[k].at || 0))) d.t[k] = v;
      for (const [k, v] of Object.entries(r.q || {})) if (v && (!d.q[k] || (v.at || 0) > (d.q[k].at || 0))) d.q[k] = v;
      const ids = new Set(d.o.map(x => x.id)); for (const x of Array.isArray(r.o) ? r.o : []) if (x?.id && !ids.has(x.id)) d.o.push(x);
    }
    const keys = new Set(Tabs.list.map(t => t.key));
    for (const t of Tabs.list) { const e = d.t[t.key]; if (e && typeof e.v === 'string' && e.v !== (t.draft || '')) t.draft = e.v; }
    for (const k of Object.keys(d.t)) if (!k.startsWith('sid:') && !keys.has(k)) delete d.t[k];
    for (const [k, v] of Object.entries(d.q)) if (!v?.items?.length && now() - (v?.at || 0) > 7 * 864e5) delete d.q[k];
    this.ready = true; Tabs.save(); this.write(true);
  },
  // 输入框：打字立即记下；附件只记已经上传完的
  setTab(tab, atts) {
    if (!tab?.key || tab.kind || !this.ready) return;
    const d = this.load(), old = d.t[tab.key];
    const A = atts ? atts.map(a => this.attOut(a)).filter(Boolean) : (old?.atts || []), missing = atts ? this.missing(atts) : (old?.missing || []);
    if (old && old.v === (tab.draft || '') && JSON.stringify(old.atts || []) === JSON.stringify(A) && JSON.stringify(old.missing || []) === JSON.stringify(missing)) return;
    d.t[tab.key] = { v: tab.draft || '', sid: tab.sid || null, at: now(), atts: A, missing }; this.write();
  },
  syncTabs() { if (!this.ready) return; for (const t of Tabs.list) if (!t.kind) this.setTab(t, UI.atts.get(t.key)); },
  // 打开输入框时：这个对话有被放回来的内容（标签关掉了 / 当时不在这个标签）就合进去
  intoTab(tab) {
    const d = this.load(); let ch = false;
    if (tab?.sid && d.t['sid:' + tab.sid]) { const e = d.t['sid:' + tab.sid]; delete d.t['sid:' + tab.sid]; if (e.v && !(tab.draft || '').includes(e.v)) tab.draft = e.v + (tab.draft ? '\n' + tab.draft : ''); if (e.atts?.length || e.missing?.length) { const A = UI.atts.get(tab.key) || []; A.push(...this.entryAtts(e)); UI.atts.set(tab.key, A); } ch = true; }
    if (!UI.atts.has(tab.key) && (d.t[tab.key]?.atts?.length || d.t[tab.key]?.missing?.length)) UI.atts.set(tab.key, this.entryAtts(d.t[tab.key]));
    if (ch) { this.write(); Tabs.save(); }
  },
  // 队列
  qsig(chat) { return JSON.stringify([chat._qPaused || '', (chat.queue || []).map(i => [i.id, i.text, (i.atts || []).map(a => [a.name, a.state, a.res?.key])])]); },
  queueRecord(chat, items = chat.queue || []) {
    return { at: Math.max(now(), (+this.load().q[chat.sid]?.at || 0) + 1), paused: chat._qPaused || '', items: items.map(i => ({ id: i.id, text: i.text || '', at: i.at || now(),
      atts: (i.atts || []).map(a => this.attOut(a)).filter(Boolean),
      missing: this.missing(i.atts) })) };
  },
  hydrateQ(chat) {
    if (chat._qh || !chat.sid || chat.gacha) return; chat._qh = 1;
    const d = this.load(), e = d.q[chat.sid], q = (chat.queue ||= []);
    const claimed = new Set(d.o.filter(o => o.sid === chat.sid).flatMap(o => o.queueIds || []));
    if (e?.items?.length && !q.length) for (const i of e.items) if (!i.id || !claimed.has(i.id)) q.push({ id: i.id || uuid7(), text: i.text || '', at: i.at || now(),
      atts: this.entryAtts(i) });
    chat._qPaused = e?.paused || ''; chat._qsig = this.qsig(chat);
  },
  setQ(chat, requireLocal = false) {
    if (!chat?.sid || chat.gacha) return;
    const d = this.load(), q = chat.queue || [], previous = d.q[chat.sid];
    d.q[chat.sid] = this.queueRecord(chat); const saved = this.write(true, requireLocal);
    if (!saved && requireLocal) { if (previous) d.q[chat.sid] = previous; else delete d.q[chat.sid]; return false; }
    for (const i of q) for (const a of i.atts || []) if (!a.res && a.p && !a._dq) { a._dq = 1; a.p.then(() => { chat._qsig = null; this.onChat(chat); }, () => {}); }
    return saved;
  },
  // 发出的消息：服务器确认收到之前一直留着
  out(chat, msg, text, opt = {}) {
    if (!chat?.sid || chat.gacha || opt.parts || !msg?.id) return;
    const d = this.load(), previous = d.o.find(x => x.id === msg.id); this.sess.add(msg.id);
    const previews = opt.previews || (opt.files || msg.metadata?.uploads || []).map(res => ({ res }));
    const atts = previews.map(a => this.attOut(a)).filter(Boolean), missing = this.missing(previews), queueIds = opt.queueIds || previous?.queueIds;
    d.o = d.o.filter(x => x.id !== msg.id); d.o.push({ id: msg.id, sid: chat.sid, text: text || '', at: now(), atts, missing, ...(queueIds ? { queueIds: queueIds.slice() } : {}) });
    if (opt.queueIds) { const ids = new Set(opt.queueIds); d.q[chat.sid] = this.queueRecord(chat, (chat.queue || []).filter(i => !ids.has(i.id))); }
    if (!this.write(true, true)) { d.o = d.o.filter(x => x.id !== msg.id); if (previous) d.o.push(previous); if (opt.queueIds) d.q[chat.sid] = this.queueRecord(chat); this.sess.delete(msg.id); this.push(); return false; }
    for (const a of opt.previews || []) if (!a.res && a.p) a.p.then(() => { const e = this.load().o.find(x => x.id === msg.id); if (e) { e.atts = opt.previews.map(x => this.attOut(x)).filter(Boolean); e.missing = this.missing(opt.previews); this.write(); } }, () => {});
    return true;
  },
  accepted(id) { const e = this.load().o.find(x => x.id === id); if (e && !e.acc) { e.acc = now(); this.write(true); } },
  ack(id) {
    const d = this.load(), hit = d.o.find(x => x.id === id), n = d.o.length;
    d.o = d.o.filter(x => x.id !== id);
    if (d.o.length !== n) {
      this.write(true);
      const c = hit?.sid && typeof Chats !== 'undefined' ? Chats.get(hit.sid) : null;
      if (c && typeof SendQ !== 'undefined' && (c.queue || []).length) try { SendQ.check(c); } catch {}
    }
  },
  check(chat) {
    const d = this.load(); if (!d.o.length || !chat?.sid || chat.gacha) return;
    const doneAt = Math.max(chat.tcAt || 0, chat.endAt || 0, chat.finAt || 0);
    for (const e of d.o.filter(x => x.sid === chat.sid)) {
      // 服务器已收下（POST 成功）且之后有一轮已经结束：输入已被处理，不管服务器用什么 id / 正文怎么存，都算送达
      const hasFinishedReplyAfter = !chat.busy && doneAt > (e.at || 0) && (chat.messages || []).some(x => x.role === 'assistant' && !x._local && !x.metadata?.pending && ((typeof idTime === 'function' ? idTime(x.id) : 0) || doneAt) >= (e.at || 0) - 5000);
      if (!chat.busy && ((e.acc && doneAt > e.acc) || hasFinishedReplyAfter)) { const mm = chat.messages?.find(x => x.id === e.id); if (mm?.deliveryUnknown) { mm.deliveryUnknown = false; mm.failed = false; } if (mm) mm._local = false; this.ack(e.id); continue; }
      if (chat.awaitId === e.id && (chat.busy || chat.live)) { if (chat.dlv === 'taken' && chat.turnInput === e.id) this.ack(e.id); continue; }   // 一轮结束后不再因旧 awaitId 跳过核对
      const m = chat.messages?.find(x => x.id === e.id);
      if (m && !m._local) { this.ack(e.id); continue; }                  // 服务器的对话记录里已经有这条
      if (!chat.loaded || chat.busy || this.chk.has(e.id)) continue;
      if (m && m.failed && !m.deliveryUnknown) continue;                                      // 这次打开时发送失败：消息上有「重试」，先不动
      const age = now() - (e.at || 0);
      if (age < 30000 && !(doneAt > (e.at || 0))) { if (!this.wait.has(e.id)) { this.wait.add(e.id); setTimeout(() => { this.wait.delete(e.id); this.check(chat); }, 30500 - age); } continue; }
      this.chk.add(e.id);
      chat.inDb(e.id, e.text, e.at).then(r => this.settle(chat, e, m, r));
    }
  },
  settle(chat, e, m, r) {
    this.chk.delete(e.id);
    if (!this.load().o.some(x => x.id === e.id)) return 'done';   // 另一路核对已处理（避免重复放回队列）
    if (r === true) { this.ack(e.id); if (m?.deliveryUnknown) { m.deliveryUnknown = false; m.failed = false; m._local = false; chat.emit(); } return 'ok'; }
    if (r === false && !m) { this.restore(e); return 'restored'; }   // 服务器确实没有，而且不是这次打开时发的 → 放回输入框
    // 服务器确实没有、本地还留着这条：标成发送失败（消息上有「重试」）并清掉待确认记录。
    // 以前这里什么都不做，队列会一直卡在「上一条输入尚未确认」，每次刷新还会再读一次整个对话
    if (r === false && m) { m.deliveryUnknown = false; m.failed = true; this.ack(e.id); chat.emit(); toast('有一条消息服务器没有收到：已标为发送失败，可点「重试」；队列继续'); return 'failed'; }
    setTimeout(() => this.check(chat), 20000); return 'unknown';      // 查不到（网络）：稍后再查
  },
  // 立即核对这个对话所有待确认的消息（「立即发送」被挡住时用，不等 30 秒）
  async verify(chat) {
    const list = this.load().o.filter(x => x.sid === chat?.sid); if (!list.length) return true;
    if (chat.busy) return false;
    let restored = false;
    for (const e of list) { this.chk.add(e.id); const m = chat.messages?.find(x => x.id === e.id); if (this.settle(chat, e, m, await chat.inDb(e.id, e.text, e.at)) === 'restored') restored = true; }
    // 有旧消息被放回队列最前（服务器确实没收到）→ 先让用户核对，不在同一次点击里直接发出去
    return !restored && !this.load().o.some(x => x.sid === chat.sid);
  },
  restore(e) {
    const chat = Chats.get(e.sid);
    if (chat?.queue?.length) {
      chat.queue.unshift({ id: uuid7(), text: e.text || '', at: e.at || now(), atts: this.entryAtts(e) });
      chat._qPaused = '已恢复上一条未送达消息，请核对后手动继续';
      this.load().o = this.load().o.filter(x => x.id !== e.id); this.setQ(chat); chat.emit(); toast('未送达消息已放回队首，请核对后继续'); return;
    }
    this.ack(e.id);
    const d = this.load(), tab = Tabs.list.find(t => t.sid === e.sid && !t.kind);
    const add = cur => !e.text || (cur || '').includes(e.text) ? (cur || '') : e.text + (cur ? '\n' + cur : '');
    if (tab) {
      tab.draft = add(tab.draft);
      if (e.atts?.length || e.missing?.length) { const A = UI.atts.get(tab.key) || []; A.push(...this.entryAtts(e)); UI.atts.set(tab.key, A); }
      document.querySelectorAll('textarea[data-tab="' + tab.key + '"]').forEach(ta => { if (ta.value !== tab.draft) { ta.value = tab.draft; ta.dispatchEvent(new Event('input')); } });
      this.setTab(tab, UI.atts.get(tab.key)); Tabs.save();
    } else { const k = 'sid:' + e.sid, o = d.t[k]; d.t[k] = { v: add(o?.v), at: now(), atts: [...(o?.atts || []), ...(e.atts || [])], missing: [...(o?.missing || []), ...(e.missing || [])] }; this.write(true); }
    toast('有一条消息服务器没有收到，已放回这个对话的输入框');
  },
  onChat(chat) {
    if (!chat?.sid || chat.gacha) return;
    if (!chat._qh) this.hydrateQ(chat);
    const sig = this.qsig(chat); if (sig !== chat._qsig) { chat._qsig = sig; this.setQ(chat); }
    this.check(chat);
  },
};
addEventListener('visibilitychange', () => { if (document.hidden && Drafts.d) Drafts.write(true); });
addEventListener('pagehide', () => { if (Drafts.d) Drafts.write(true); });
Object.assign(SendQ, {
  // 查看窗口：完整显示每条排队内容（换行保留），可以逐条移出 / 清空 / 立即发送
  view(chat) {
    document.querySelector('.modal-back:not(.anc-gh).sq-back')?.remove();
    const q = SendQ.of(chat), body = h('div', { class: 'sq-list' });
    let back = null;
    const paint = () => {
      if (!q.length) { back?.remove(); return; }
      const mMode = SendQ.mode(chat);
      back?.querySelector('.modal-h')?.replaceChildren(
        h('button', { type: 'button', class: 'q-mode ' + (mMode === 'split' ? 'is-split' : 'is-merge'), title: mMode === 'split' ? '当前：分列逐条发送（点击切换为合并发送）' : '当前：合并全部发送（点击切换为分列发送）', onclick: e => { e.stopPropagation(); SendQ.toggleMode(chat); paint(); } }, mMode === 'split' ? '分列' : '合并'),
        h('span', {}, '队列 ' + q.length + ' 条')
      );
      body.classList.toggle('is-split', mMode === 'split');
      body.classList.toggle('is-merge', mMode !== 'split');
      const sqRows = q.map((it, i) => h('div', { class: 'sq-it ' + (mMode === 'split' ? 'q-split-card' : 'q-merge-row') },
        h('div', { class: 'sq-top' }, h('b', {}, '#' + (i + 1)), h('span', { class: 'dim' }, fmtClock(it.at)), it.atts.length ? h('span', { class: 'q-a' }, icon('file'), it.atts.map(a => a.name).join('、')) : null, h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'q-act q-ib q-copy', title: '复制该条内容', 'aria-label': '复制该条内容', onclick: e => { e.stopPropagation(); void SendQ.copy(chat, it); } }, icon('copy')),
          h('button', { type: 'button', class: 'q-act q-ib q-recall', title: '撤回至输入框（连带附件一起恢复）', 'aria-label': '撤回至输入框', onclick: e => { e.stopPropagation(); SendQ.recall(chat, it); paint(); } }, icon('undo')),
          h('button', { class: 'q-x q-ib', title: '移出队列', 'aria-label': '移出队列', onclick: e => { e.stopPropagation(); SendQ.remove(chat, it); paint(); } }, icon('x'))),
        h('div', { class: 'sq-t' }, it.text || '（附件）')));
      body.replaceChildren(
        ...(mMode === 'split' ? sqRows : [h('div', { class: 'q-merge-card' }, ...sqRows)]),
        h('div', { class: 'sq-note dim' }, SendQ.status(chat)));
    };
    const foot = K(h('button', { class: 'btn ghost', onclick: () => { SendQ.clear(chat); back.remove(); } }, '清空'), h('span', { class: 'grow' }),
      !chat.busy || chat.status === 'error' ? h('button', { class: 'btn ghost', onclick: () => { back.remove(); SendQ.flush(chat, { manual: true }); } }, '立即发送') : null,
      h('button', { class: 'btn', onclick: () => back.remove() }, '关闭'));
    back = modal('队列 ' + q.length + ' 条', body, foot, 'sq-modal'); back.classList.add('sq-back');
    paint();
    // 队列变了（本轮结束自动发出 / 输入框里又加了一条）→ 跟着刷新；发完了自动关闭
    const sig = () => q.map(i => i.id).join(',') + '|' + SendQ.mode(chat) + '|' + SendQ.status(chat); let last = sig();
    const off = Bus.on('chat', c => { if (c !== chat) return; if (!back.isConnected) { off(); return; } const k = sig(); if (k !== last) { last = k; paint(); } });
  }
});
Bus.on('chat', c => { try { Drafts.onChat(c); } catch (e) { console.warn(e); } if (c?.queue?.length) SendQ.check(c); });

// 按顺序把 box 的子节点变成 nodes：相同节点原地保留，只插入 / 移动 / 删除差异部分（避免整块重建引起的重排和卡顿）
const patchKids = (box, nodes) => {
  const keep = new Set(nodes);
  for (const c of [...box.children]) if (!keep.has(c)) c.remove();
  for (let i = 0; i < nodes.length; i++) { const cur = box.children[i]; if (cur !== nodes[i]) box.insertBefore(nodes[i], cur || null); }
  while (box.children.length > nodes.length) box.lastElementChild.remove();
};
// 附件显示（输入框 / 对话里共用）：图片 = 缩略图（上传中叠加进度环），其他 = 文件名 chip；点图片看大图
const attView = (u, mine, onDel) => {
  const a = u.a, up = a && a.state === 'up', bad = a && a.state === 'bad', pct = Math.round((a?.pct || 0) * 100);
  const del = onDel ? h('button', { class: 'att-del', title: '移除', onclick: e => { e.stopPropagation(); onDel(); } }, '×') : null;
  const st = up ? h('span', { class: 'att-prog' }, h('i', { style: { '--p': pct } }), h('b', {}, a.stage === '上传' ? pct + '%' : (a.stage || '…'))) : bad ? h('span', { class: 'att-prog bad', title: a.err || '' }, '!') : null;
  if (u.src && /^image\//.test(u.type || '')) {
    const img = h('img', { class: 'zimg', src: u.src, alt: u.name, 'data-name': u.name || '', loading: 'lazy', draggable: 'false', onerror: () => { img.replaceWith(h('span', { class: 'att-noimg' }, icon('file'))); } });
    return h('span', { class: 'att-img' + (up ? ' up' : '') + (bad ? ' bad' : ''), title: (a?.err || u.name), onclick: e => { if (e.target.closest('.att-del')) return; ImgView.open(u.src, u.name, e.currentTarget); } }, img, st, del);
  }
  return h('span', { class: 'att-chip ' + (a?.state || ''), title: a?.err || u.name },
    up ? h('i', { class: 'spin' }) : bad ? h('span', { class: 'att-x' }, '!') : icon('file'),
    h('span', { class: 'att-n' }, u.name), a ? h('span', { class: 'att-s' }, up ? (a.stage === '上传' ? pct + '%' : a.stage || '上传中') : bad ? '失败' : fmtBytes(a.size)) : null, del);
};
// 用户消息的附件：本地预览优先；服务端的消息里 metadata.uploads 和 file 部件常常是同一张图（重进 / 刷新后会显示两张）→ 按内容哈希 / 文件名一一去重
const hashOfUrl = u => (/([A-Za-z0-9_-]{43})(?=$|[?#])/.exec(String(u || '')) || [])[1] || null;
const userAtts = m => {
  if (m._prev?.length) return m._prev.map(a => ({ name: a.name, type: a.type, src: a.url, a }));
  const ups = (m.metadata?.uploads || []).map(u => { const hs = Uploads.hashOfKey(u.key) || u.hash || hashOfUrl(u.url); return { name: u.filename, type: u.mediaType, hs, src: hs && /^image\//.test(u.mediaType || '') ? Uploads.webPath(hs) : null }; });
  const used = new Set();
  const files = (m.parts || []).filter(p => p.type === 'file').map(p => ({ name: p.filename || p.name || 'file', type: p.mediaType, hs: hashOfUrl(p.url), src: /^image\//.test(p.mediaType || '') && /^(https?:|\/|data:|blob:)/.test(p.url || '') ? p.url : null }))
    .filter(f => {
      let i = f.hs ? ups.findIndex((u, k) => !used.has(k) && u.hs === f.hs) : -1;
      if (i < 0) i = ups.findIndex((u, k) => !used.has(k) && (!f.hs || !u.hs) && u.name === f.name && (u.type || '') === (f.type || ''));
      if (i < 0) return true;
      used.add(i); if (!ups[i].src && f.src) ups[i].src = f.src; return false;
    });
  // 同一个来源里重复的也去掉（同一张图同时出现两次）
  const seen = new Set();
  return [...ups, ...files].filter(u => { const k = u.hs || (u.src ? u.src : null); if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; });
};
// 看大图：当前对话里所有图片组成相册，左右滑动 / 方向键切换上一张 / 下一张，下滑 / 点空白 / Esc 关闭
const attZoom = (src, name, from) => {
  const scope = (from && (from.closest?.('.thread') || from.closest?.('.att-row'))) || document.querySelector('#view .thread') || document.body;
  let list = [...scope.querySelectorAll('.att-img img, img.file-img')].map(i => ({ src: i.getAttribute('src'), name: i.alt || '' })).filter(x => x.src);
  let idx = list.findIndex(x => x.src === src);
  if (idx < 0) { list = [{ src, name }]; idx = 0; }
  const img = h('img', { alt: '', draggable: 'false' }), img2 = h('img', { alt: '', draggable: 'false', class: 'att-z2' });
  const cnt = h('div', { class: 'att-zc' }), nameEl = h('div', { class: 'att-zn' });
  const prev = h('button', { class: 'att-zb l', title: '上一张（←）', onclick: e => { e.stopPropagation(); go(-1); } }, '‹');
  const next = h('button', { class: 'att-zb r', title: '下一张（→）', onclick: e => { e.stopPropagation(); go(1); } }, '›');
  const close = () => { back.remove(); removeEventListener('keydown', key, true); };
  // 右上角：复制 / 保存 / 关闭（桌面也可以在图片上右键）
  const tb = h('div', { class: 'att-ztb', onclick: e => e.stopPropagation() },
    ImgAct.canCopy() ? h('button', { title: '复制图片', onclick: () => ImgAct.copy(list[idx].src) }, icon('copy'), h('span', {}, '复制')) : null,
    h('button', { title: Host.platform === 'android' ? '保存到相册' : '图片另存为', onclick: () => ImgAct.save(list[idx].src, list[idx].name) }, icon('dl'), h('span', {}, '保存')),
    h('button', { title: '关闭（Esc）', onclick: () => close() }, icon('x')));
  const back = h('div', { class: 'modal-back att-zoom' + (list.length > 1 ? ' multi' : ''), onclick: () => { if (moved) return; close(); } }, img, img2, prev, next, cnt, nameEl, tb);
  img.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); ImgAct.menu(e, list[idx].src, list[idx].name, true); });
  let show = () => { img.src = list[idx].src; img.style.transform = ''; img2.style.display = 'none'; cnt.textContent = list.length > 1 ? (idx + 1) + ' / ' + list.length : ''; nameEl.textContent = list[idx].name || ''; prev.disabled = idx <= 0; next.disabled = idx >= list.length - 1; };
  const go = d => { const j = idx + d; if (j < 0 || j >= list.length) { img.animate?.([{ transform: `translateX(${d * -24}px)` }, { transform: 'none' }], { duration: 180 }); return; } idx = j; show(); img.animate?.([{ opacity: 0.2, transform: `translateX(${d * 60}px)` }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' }); };
  const key = e => { if (!back.isConnected) { removeEventListener('keydown', key, true); return; } if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(1); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener('keydown', key, true);
  // 触摸：横向拖动跟手，松开超过 1/5 屏宽切换；向下拖超过 90px 关闭。
  // 整个 App 禁止双指缩放，只有这里（看大图）可以：双指缩放 1~5 倍、放大后单指拖动查看、双击放大 / 还原
  let sx = 0, sy = 0, dx = 0, dy = 0, axis = '', moved = false, touching = false;
  let zs = 1, zx = 0, zy = 0, pinch = null, pan = null, lastTap = 0;
  const zApply = anim => { img.style.transition = anim ? 'transform .2s' : 'none'; img.style.transform = zs > 1.01 ? `translate(${zx}px,${zy}px) scale(${zs})` : ''; };
  const zClamp = () => { const r = img.getBoundingClientRect(), bw = r.width / (zs || 1), bh = r.height / (zs || 1), mx = Math.max(0, (bw * zs - innerWidth) / 2), my = Math.max(0, (bh * zs - innerHeight) / 2); zx = Math.max(-mx, Math.min(mx, zx)); zy = Math.max(-my, Math.min(my, zy)); };
  const zReset = anim => { zs = 1; zx = zy = 0; pinch = pan = null; zApply(anim); };
  const show0 = show; show = () => { zs = 1; zx = zy = 0; show0(); };
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), mid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
  back.addEventListener('touchstart', e => {
    if (e.touches.length === 2) { touching = false; pan = null; moved = true; const [mx, my] = mid(e.touches); pinch = { d: dist(e.touches) || 1, s: zs, x: zx, y: zy, mx, my }; return; }
    if (e.touches.length !== 1) { touching = false; return; }
    const t = e.touches[0];
    if (zs > 1.01) { pan = { x: t.clientX - zx, y: t.clientY - zy }; touching = false; moved = false; return; }
    touching = true; moved = false; axis = ''; dx = dy = 0; sx = t.clientX; sy = t.clientY; img.style.transition = 'none';
  }, { passive: true });
  back.addEventListener('touchmove', e => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault(); const [mx, my] = mid(e.touches), cx = innerWidth / 2, cy = innerHeight / 2;
      const ns = Math.max(1, Math.min(5, pinch.s * dist(e.touches) / pinch.d)), k = ns / pinch.s;
      // 以两指中点为中心缩放，并跟随两指平移
      zx = (pinch.mx - cx) - ((pinch.mx - cx) - pinch.x) * k + (mx - pinch.mx); zy = (pinch.my - cy) - ((pinch.my - cy) - pinch.y) * k + (my - pinch.my); zs = ns; zApply(false); return;
    }
    if (pan && e.touches.length === 1) { e.preventDefault(); moved = true; zx = e.touches[0].clientX - pan.x; zy = e.touches[0].clientY - pan.y; zApply(false); return; }
    if (!touching || e.touches.length !== 1) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (!axis && Math.hypot(dx, dy) > 10) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (!axis) return; moved = true; e.preventDefault();
    if (axis === 'x') { const edge = (dx > 0 && idx <= 0) || (dx < 0 && idx >= list.length - 1); img.style.transform = `translateX(${edge ? dx / 3 : dx}px)`; }
    else if (dy > 0) { img.style.transform = `translateY(${dy}px) scale(${Math.max(0.7, 1 - dy / 900)})`; back.style.background = `rgba(0,0,0,${Math.max(0.25, 0.85 - dy / 500)})`; }
  }, { passive: false });
  back.addEventListener('touchend', e => {
    if (pinch || pan) {
      if (e.touches.length === 0) { pinch = null; pan = null; if (zs < 1.05) zReset(true); else { zClamp(); zApply(true); } setTimeout(() => { moved = false; }, 60); }
      else if (pinch && e.touches.length === 1) { pinch = null; const t = e.touches[0]; if (zs > 1.01) pan = { x: t.clientX - zx, y: t.clientY - zy }; }
      return;
    }
    if (!touching) return; touching = false; img.style.transition = ''; back.style.background = '';
    if (axis === 'x' && Math.abs(dx) > Math.min(120, innerWidth / 5)) go(dx < 0 ? 1 : -1);
    else if (axis === 'y' && dy > 90) { close(); return; }
    else img.style.transform = '';
    // 双击图片：放大 2.5 倍 / 还原
    if (!axis && e.target === img) { const t = now(); if (t - lastTap < 300) { lastTap = 0; moved = true; if (zs > 1.01) zReset(true); else { zs = 2.5; const r = img.getBoundingClientRect(), p = e.changedTouches[0]; zx = (innerWidth / 2 - p.clientX) * 1.5; zy = (innerHeight / 2 - p.clientY) * 1.5; zClamp(); zApply(true); } } else lastTap = t; }
    setTimeout(() => { moved = false; }, 60);
  });
  document.body.append(back); show();
  return back;
};
// ---------- 看图：电脑 → 右侧预览窗格（跟官方一样，不再盖住整个窗口）；手机 → 看大图（双指缩放）----------
const ImgView = {
  // 当前对话里能看的图（附件 / 文件图 / 抽卡候选），给窗格顶上的下拉用；同名的加序号
  list() {
    const seen = new Map();
    return [...document.querySelectorAll('#view .zimg')].filter(x => x.isConnected && (x.dataset.src || x.src)).map(x => {
      const src = x.dataset.src || x.src, base = x.dataset.name || ImgAct.name(src, '', '').replace(/\.png$/, '') || '图片';
      const k = seen.get(base) || 0; seen.set(base, k + 1);
      return { path: k ? base + ' (' + (k + 1) + ')' : base, img: { src, sub: x.dataset.sub || '', thumb: x.src } };
    }).filter((x, i, a) => a.findIndex(y => y.img.src === x.img.src) === i);
  },
  open(src, name, from, o = {}) {
    if (!src) return;
    if (isMob() || typeof HtmlPreview === 'undefined' || !document.getElementById('pv')) { attZoom(src, name, from); return; }
    let path = String(name || '').trim() || ImgAct.name(src, '', '').replace(/\.png$/, '');
    if (!o.revoke && from) { const it = this.list().find(x => x.img.src === src); if (it) path = it.path; }
    HtmlPreview.image({ src, path, revoke: o.revoke, sub: o.sub, list: o.revoke ? null : () => this.list() });
  },
};
// ---------- 图片：复制 / 另存为（查看大图的按钮 + 图片右键菜单）----------
const ImgAct = {
  canCopy: () => Host.platform !== 'android' && (!!Host.copyImage || (!!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined')),
  async blob(src) { const r = await rawFetch(src, { credentials: 'same-origin' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); },
  b64: b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error || new Error('读取失败')); fr.readAsDataURL(b); }),
  async png(b) {
    if (b.type === 'image/png') return b;
    const bm = await createImageBitmap(b), cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; cv.getContext('2d').drawImage(bm, 0, 0);
    return await new Promise((res, rej) => cv.toBlob(x => x ? res(x) : rej(new Error('转换失败')), 'image/png'));
  },
  name(src, name, type) {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' }[type] || 'png';
    let n = String(name || '').trim() || (String(src || '').split(/[?#]/)[0].split('/').pop() || '').slice(0, 40) || 'image';
    if (!/\.[a-z0-9]{2,5}$/i.test(n)) n += '.' + ext; return n;
  },
  async copy(src) {
    try {
      const b = await this.blob(src);
      if (Host.copyImage && Host.platform !== 'android') { const p = /^image\/(png|jpeg)$/.test(b.type) ? b : await this.png(b); const r = await Host.copyImage(await this.b64(p)); if (!r?.ok) throw new Error(r?.error || '复制失败'); }
      else await navigator.clipboard.write([new ClipboardItem({ 'image/png': await this.png(b) })]);
      toast('图片已复制');
    } catch (e) { toast('复制图片失败：' + describe(e), 'err'); }
  },
  async save(src, name) {
    try {
      const b = await this.blob(src), nm = this.name(src, name, b.type);
      if (Host.saveImage) { const r = await Host.saveImage(nm, await this.b64(b), b.type || 'image/png'); if (r?.canceled) return; if (!r?.ok) throw new Error(r?.error || '保存失败'); toast(Host.platform === 'android' ? '已保存到相册（' + (r.path || 'Pictures/BranaAi') + '）' : '已保存：' + (r.path || nm)); return; }
      saveBlob(b, nm);
    } catch (e) { toast('保存图片失败：' + describe(e), 'err'); }
  },
  menu(e, src, name, zoomed) {
    document.querySelectorAll('.menu:not(.anc-gh).imenu').forEach(m => m.remove());
    const m = h('div', { class: 'menu imenu', style: { left: Math.min(e.clientX, innerWidth - 180) + 'px', top: Math.min(e.clientY, innerHeight - 130) + 'px', zIndex: 400 } },
      zoomed ? null : h('button', { onclick: () => { m.remove(); ImgView.open(src, name, e.target); } }, icon('expand'), '查看大图'),
      this.canCopy() ? h('button', { onclick: () => { m.remove(); this.copy(src); } }, icon('copy'), '复制图片') : null,
      h('button', { onclick: () => { m.remove(); this.save(src, name); } }, icon('dl'), Host.platform === 'android' ? '保存到相册' : '图片另存为…'));
    document.body.append(m);
    if (typeof placeInward === 'function') placeInward(m, { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 }, { pad: 8, gap: 4 });
    setTimeout(() => { const off = ev => { if (!m.isConnected) { document.removeEventListener('pointerdown', off, true); return; } if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
};
// 电脑端所有输入框支持右键聚焦并弹出粘贴/复制菜单
document.addEventListener('contextmenu', e => {
  const path = e.composedPath ? e.composedPath() : [e.target];
  const el = path.find(n => n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable));
  if (el && document.activeElement !== el && typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch {}
  }
}, true);
// 对话 / 附件里的图片：右键（手机长按）弹出 查看 / 复制 / 保存
document.addEventListener('contextmenu', e => {
  const t = e.target; if (t?.tagName !== 'IMG' || t.closest('.att-zoom,.pane')) return;
  if (!(t.closest('.att-img,.att-row,.md,.msg,.thread') || t.classList.contains('file-img'))) return;
  const src = t.currentSrc || t.getAttribute('src'); if (!src || /^data:image\/svg/.test(src)) return;
  e.preventDefault(); ImgAct.menu(e, src, t.alt || '');
});
const copyText = async t => { try { await navigator.clipboard.writeText(t); toast('已复制'); } catch { const ta = h('textarea', {}, t); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制'); } };
// 对话状态：run 进行中（图标顺时针转）/ bad 出错（红）/ ok 正常完成（绿）/ '' 未知
const chatState = c => { if (!c) return ''; if (c.busy) return 'run'; const last = c.messages?.at(-1); if (c.error || last?.failed || (last?.parts || []).some(p => p.type === 'error')) return 'bad'; return c.loaded && last?.role === 'assistant' ? 'ok' : ''; };
const stLogo = (vid, size, st) => { const l = vid ? vlogo(vid, size) : h('span', { class: 'vlogo none', style: { width: size + 'px', height: size + 'px' } }, st === 'run' ? '' : '·'); if (st) { l.classList.add('st-' + st); if (st === 'run') l.style.animationDelay = '-' + (Math.floor(typeof performance !== 'undefined' ? performance.now() : Date.now()) % 1100) + 'ms'; } return l; };
const tabName = m => { m = Strength.canon(m); return Brand.of(m) ? dotVer(Brand.short(m)) : m; };
// 名称里的「置信度 / 推理分 / 平均用时」拆成小号彩色片段：和型号名分开，三者同一色系、深浅不同
const metricName = (text, nameFn = x => x, bare = false) => {
  const raw = String(text || ''); if (!raw) return '';
  const p = typeof ConversationLabels !== 'undefined' ? ConversationLabels.parse(raw) : null;
  if (!p || (p.confidence == null && !Number.isFinite(p.score) && !Number.isFinite(p.average) && !p.tier) || !p.name || /[()（）]/.test(p.name)) return nameFn(raw);
  if (bare) return [h('span', { class: 'mn' }, nameFn(p.name))];   // 侧栏卡片：名字里不带数字，置信度用填充、其余悬停显示
  const bits = [];
  if (p.confidence != null) bits.push(h('span', { class: 'mt mt-c', title: '指纹匹配置信度' }, p.confidence + '%'));
  if (p.tier) bits.push(h('span', { class: 'mt mt-t', title: '推理档位' }, p.tier + '≈' + (p.tierConfidence ? p.tierConfidence + '%' : '')));
  if (Number.isFinite(p.score)) bits.push(h('span', { class: 'mt mt-s', title: '推理分' }, p.score + '分'));
  return [h('span', { class: 'mn' }, nameFn(p.name)), h('span', { class: 'mts' }, ...bits)];
};
const modelLabel = m => m ? (m.pendingConfirm ? '请继续沟通' : (m.name ? ((typeof cardName === 'function' ? cardName(m.name) : Strength.canon(m.name)) || m.name) + (m.partial ? '?' : '') : '')) : '';

// ---------- 标签页 ----------
// 对话列表下拉刷新：手机在列表顶部往下拉；电脑在列表顶部按住（约 0.3 秒）再往下拖，出现同样的刷新圆圈。
// 松手 = 刷新列表（前 50 条），随后后台完整复扫一遍（名称同步 / 归档状态都会更新）。
const ListPull = {
  PULL: 80, busy: false,
  show(dy, box) {
    const el = TabPress.ring(), r = box.getBoundingClientRect();
    const k = Math.max(0, Math.min(1.25, dy / this.PULL)), y = Math.min(dy, this.PULL * 1.35) * 0.62;
    el.style.left = Math.round(r.left + r.width / 2 - 20) + 'px'; el.style.top = Math.round(r.top - 44 + y) + 'px';
    el.style.setProperty('--p', Math.min(1, k).toFixed(3)); el.style.setProperty('--r', Math.round(k * 300) + 'deg');
    el.classList.toggle('ready', k >= 1); el.classList.remove('spin', 'out'); el.classList.add('on');
  },
  async spin(box) {
    if (this.busy) return; this.busy = true;
    const el = TabPress.ring(), r = box.getBoundingClientRect(); el.classList.add('spin', 'ready', 'on'); el.classList.remove('out'); el.style.setProperty('--p', '0.72'); el.style.top = Math.round(r.top + 12) + 'px';
    try { navigator.vibrate?.(15); } catch {}
    const t0 = now();
    try {
      await History.refresh();
      const left = History.limited() ? Math.ceil((Math.max(History.retryAt || 0, ReadLimit.until || 0) - now()) / 1000) : 0;
      toast(left ? '服务器限流冷却中，约 ' + left + ' 秒后自动刷新列表（不影响对话）' : History.err ? '列表刷新失败：' + History.err : '列表已刷新 · ' + ((now() - t0) / 1000).toFixed(1) + ' 秒', History.err && !left ? 'err' : '');
    } finally { await sleep(Math.max(0, 450 - (now() - t0))); TabPress.hide(true); this.busy = false; }
  },
  bind(box) {
    let st = null;
    const top = () => box.scrollTop <= 2;
    const end = fire => { if (!st) return; const s0 = st; st = null; clearTimeout(s0.timer); box.classList.remove('lp-armed'); if (s0.pull && fire && s0.dy >= this.PULL) { box.__lpSkip = now(); void this.spin(box); } else if (s0.pull) TabPress.hide(); };
    const move = (x, y, e) => {
      if (!st) return;
      const dx = x - st.x, dy = y - st.y;
      if (!st.pull) {
        if (st.mouse && !st.armed) { if (Math.hypot(dx, dy) > 6) { clearTimeout(st.timer); st = null; } return; }   // 没按够就移动 = 普通拖动 / 选择
        if (Math.hypot(dx, dy) < 8) return;
        if (dy > 0 && Math.abs(dx) < dy && top()) st.pull = true; else { end(false); return; }
      }
      st.dy = Math.max(0, dy); this.show(st.dy, box); if (e?.cancelable) e.preventDefault();
    };
    box.addEventListener('touchstart', e => { const t = e.touches[0]; if (this.busy || e.touches.length > 1 || !t || !top()) { st = null; return; } st = { x: t.clientX, y: t.clientY, dy: 0, mouse: false }; }, { passive: true });
    box.addEventListener('touchmove', e => { const t = e.touches[0]; if (st && t) move(t.clientX, t.clientY, e); }, { passive: false });
    box.addEventListener('touchend', () => end(true)); box.addEventListener('touchcancel', () => end(false));
    box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0 || this.busy || !top()) return;
      st = { x: e.clientX, y: e.clientY, dy: 0, mouse: true, armed: false };
      const s0 = st; s0.timer = setTimeout(() => { if (st === s0) { s0.armed = true; box.classList.add('lp-armed'); } }, 300);
    });
    addEventListener('pointermove', e => { if (st?.mouse && e.pointerType !== 'touch') move(e.clientX, e.clientY, e); }, true);
    addEventListener('pointerup', e => { if (st?.mouse && e.pointerType !== 'touch') { if (st.pull) box.__lpSkip = now(); end(true); } }, true);
    addEventListener('pointercancel', () => { if (st?.mouse) end(false); }, true);
    // 下拉之后松手的那一下 click 不打开对话
    box.addEventListener('click', e => { if (now() - (box.__lpSkip || 0) < 400) { e.stopPropagation(); e.preventDefault(); box.__lpSkip = 0; } }, true);
  },
};
// 标签按住往下拉：出现一个圆圈，跟着手指 / 鼠标往下走、转圈并画满；拉够距离松手 = 重新载入这个窗口的对话
// （和保活的「刷新」一样：丢掉本地状态，重新拉取 + 接上实时通道）；没拉够就松手 / 拉回去 = 取消。
// 电脑版：按住标签往左右 / 往上拖 = 移动窗口（整个顶部都能拖动窗口，不只是右上角那一小块空白）
const TabPress = {
  PULL: 86,
  ring() {
    let el = document.getElementById('ptr'); if (el) return el;
    el = h('div', { id: 'ptr', 'aria-hidden': 'true' });
    el.innerHTML = '<svg viewBox="0 0 36 36"><circle class="ptr-bg" cx="18" cy="18" r="11"/><circle class="ptr-arc" cx="18" cy="18" r="11" pathLength="100"/><path class="ptr-head" d="M18 3.6l3.2 3.2-3.2 3.2"/></svg>';
    document.body.append(el); return el;
  },
  // 圆圈的位置：内容区顶部居中，往下拉多少走多少（有阻尼）
  show(dy) {
    const el = this.ring(), bar = document.getElementById('tabs')?.getBoundingClientRect(), v = document.getElementById('view')?.getBoundingClientRect() || document.body.getBoundingClientRect();
    const k = Math.max(0, Math.min(1.25, dy / this.PULL)), y = Math.min(dy, this.PULL * 1.35) * 0.62;
    el.style.left = Math.round(v.left + v.width / 2 - 20) + 'px';
    el.style.top = Math.round((bar ? bar.bottom : 0) - 44 + y) + 'px';
    el.style.setProperty('--p', Math.min(1, k).toFixed(3)); el.style.setProperty('--r', Math.round(k * 300) + 'deg');
    el.classList.toggle('ready', k >= 1); el.classList.remove('spin', 'out'); el.classList.add('on');
  },
  hide(done) {
    const el = document.getElementById('ptr'); if (!el) return;
    el.classList.remove('ready'); el.classList.add('out');
    setTimeout(() => { if (el.classList.contains('out')) el.classList.remove('on', 'out', 'spin'); }, done ? 260 : 200);
  },
  async spin(key) {
    const el = this.ring(); el.classList.add('spin', 'ready'); el.style.setProperty('--p', '0.72');
    const bar = document.getElementById('tabs')?.getBoundingClientRect(); el.style.top = Math.round((bar ? bar.bottom : 0) + 12) + 'px';
    try { navigator.vibrate?.(15); } catch {}
    const t0 = now();
    try { await TabPress.reload(key, { quiet: true }); } finally { await sleep(Math.max(0, 450 - (now() - t0))); this.hide(true); }
  },
  bind(box) {
    let st = null;
    const desk = Host.platform === 'desktop' && typeof Host.winDrag === 'function';
    const reset = () => { if (!st) return; if (st.mode === 'pull' && !st.fired) this.hide(); if (st.mode === 'move') Host.winDrag('end').catch?.(() => {}); st = null; arm(false); };
    const release = () => {
      if (!st) return;
      const s0 = st;
      if (s0.mode === 'pull') { if (s0.dy >= this.PULL) { s0.fired = true; box.__skip = s0.key; setTimeout(() => { box.__skip = null; }, 350); this.spin(s0.key); } else this.hide(); }
      else if (s0.mode === 'move') { Host.winDrag('end').catch?.(() => {}); box.__skip = s0.key; setTimeout(() => { box.__skip = null; }, 350); }
      st = null; arm(false);
    };
    const move = (x, y) => {
      if (!st) return false;
      const dx = x - st.x, dy = y - st.y;
      if (!st.mode) {
        if (Math.hypot(dx, dy) < (st.mouse ? 7 : 10)) return false;
        if (dy > 0 && Math.abs(dx) < dy) st.mode = 'pull';                               // 往下拉 = 重新载入
        else if (st.mouse && desk) { st.mode = 'move'; Host.winDrag('start').catch?.(() => {}); }   // 电脑：往左右 / 往上拖 = 移动窗口
        else { st = null; arm(false); return false; }                                   // 手机：横向滑动标签栏 = 取消
      }
      if (st.mode === 'pull') { st.dy = Math.max(0, dy); this.show(st.dy); return true; }
      return st.mode === 'move';
    };
    // 按下之后的移动 / 松手都挂在 window 上：标签栏中途重绘（标签元素被换掉）或拖出标签栏也收得到
    const onPM = e => { if (e.pointerType !== 'touch' && st?.mouse) move(e.clientX, e.clientY); };
    const onPU = e => { if (e.pointerType !== 'touch' && st?.mouse) release(); };
    const onPC = e => { if (e.pointerType !== 'touch' && st?.mouse) reset(); };
    const onTM = e => { const t = e.touches[0]; if (st && !st.mouse && t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault(); };
    const onTE = e => { if (st && !st.mouse && !e.touches.length) release(); };
    const arm = on => {
      const f = on ? addEventListener : removeEventListener;
      f('pointermove', onPM, true); f('pointerup', onPU, true); f('pointercancel', onPC, true);
      f('touchmove', onTM, { capture: true, passive: false }); f('touchend', onTE, true); f('touchcancel', onTE, true);
    };
    const start = (el, x, y, mouse) => { if (document.getElementById('ptr')?.classList.contains('spin')) return; if (st) reset(); st = { key: el.dataset.key, x, y, dy: 0, mode: '', mouse }; arm(true); };
    box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || e.button !== 0 || e.target.closest('.x')) return;
      const el = e.target.closest('.tab[data-key]'); if (el) start(el, e.clientX, e.clientY, true);
    });
    addEventListener('blur', () => { if (st?.mode === 'move') reset(); });
    // 触屏（手机 / 平板）：用 touch 事件，浏览器把横向滑动接走时也能收到
    box.addEventListener('touchstart', e => {
      const t = e.touches[0]; if (e.touches.length > 1 || !t || e.target.closest('.x')) { reset(); return; }
      const el = e.target.closest('.tab[data-key]'); if (el) start(el, t.clientX, t.clientY, false);
    }, { passive: true });
    // 下拉 / 拖动窗口之后，松手那一下的 click 不再切换标签
    box.addEventListener('click', e => { if (box.__skip && e.target.closest('.tab[data-key]')?.dataset.key === box.__skip) { e.stopPropagation(); e.preventDefault(); box.__skip = null; } }, true);
    box.addEventListener('contextmenu', e => { if (e.target.closest('.tab[data-key]')) e.preventDefault(); });
  },
  async reload(key, { quiet } = {}) {
    const t = Tabs.list.find(x => x.key === key); if (!t) return;
    if (t.kind === 'power') { Strength.pull(true); if (Tabs.active === key) PView.render(); toast('已刷新推理分排行'); return; }
    if (!t.sid) { toast('新对话没有可重新载入的内容'); return; }
    if (Tabs.active !== key) Tabs.focus(key);
    const c = chatOf(t.sid); if (!quiet) toast('正在重新载入…');
    UI.cache?.clear?.(); UI.tabCaches?.delete?.(key);
    const ok = await c.reload('手动重新载入');
    if (!ok || !quiet) toast(ok ? '已重新载入' : '重新载入失败：' + (c.error || ''), ok ? '' : 'err');
  },
};
ICON.dollar = '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';
const Tabs = {
  list: Store.get('tabs', []).filter(t => t && t.kind !== 'gacha'),
  active: Store.get('tab', null),
  maxCount() { const n = parseInt(Prefs?.maxTabs, 10); return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 6; },
  convTime(t) {
    if (!t) return 0;
    if (!t.sid && !t.kind) return t.touchedAt || now();
    if (t.kind) return t.touchedAt || 0;
    const sid = t.sid, nt = typeof Notes !== 'undefined' ? (Notes.all?.[sid]?.t || 0) : 0;
    const ch = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    const ct = Math.max(ch?.sentAt || 0, ch?.endAt || 0, ch?.progAt || 0);
    const he = typeof History !== 'undefined' ? History.byId?.(sid) : null;
    const ht = he ? (Date.parse(String(he.updatedAt || he.createdAt || '').replace(' ', 'T').replace(/\+00$/, 'Z')) || 0) : 0;
    return Math.max(t.touchedAt || 0, nt, ct, ht);
  },
  enforceLimit(keepKey = this.active) {
    const max = this.maxCount();
    const convs = this.list.filter(t => !t.kind);
    if (convs.length > max) {
      const dropCount = convs.length - max;
      const evictable = convs
        .filter(t => t.key !== keepKey && t.key !== this.active)
        .sort((a, b) => this.convTime(a) - this.convTime(b));
      const dropKeys = new Set(evictable.slice(0, dropCount).map(t => t.key));
      if (dropKeys.size < dropCount) {
        for (const t of convs.slice().sort((a, b) => this.convTime(a) - this.convTime(b))) {
          if (dropKeys.size >= dropCount) break;
          if (t.key !== keepKey) dropKeys.add(t.key);
        }
      }
      this.list = this.list.filter(t => !dropKeys.has(t.key));
    }
    this.list.sort((a, b) => {
      if (!!a.kind !== !!b.kind) return a.kind ? 1 : -1;
      return this.convTime(b) - this.convTime(a);
    });
    if (this.active && !this.list.some(t => t.key === this.active)) {
      this.active = this.list[0]?.key || null;
    }
  },
  touchSid(sid, ts = now()) {
    const t = sid ? this.list.find(x => x.sid === sid) : null;
    if (!t) return;
    t.touchedAt = Math.max(t.touchedAt || 0, ts);
    this.enforceLimit(this.active);
    this.save();
    UI.renderTabs?.();
  },
  save() { Store.set('tabs', this.list.map(t => ({ key: t.key, sid: t.sid, title: t.title, draft: t.draft || '', kind: t.kind || undefined, touchedAt: t.touchedAt || 0 }))); Store.set('tab', this.active); try { Drafts.syncTabs(); } catch {} },
  get cur() { return this.list.find(t => t.key === this.active) || null; },
  open(sid, { focus = true, title } = {}) {
    let t = sid ? this.list.find(x => x.sid === sid) : null;
    if (!t) {
      t = { key: uuid7(), sid: sid || null, title: title || (sid ? (History.byId(sid)?.title || '对话') : '新对话'), draft: '', touchedAt: now() };
      this.list.unshift(t);
    } else {
      t.touchedAt = Math.max(t.touchedAt || 0, now());
    }
    if (focus) this.active = t.key;
    this.enforceLimit(t.key);
    this.save(); UI.renderTabs(); if (focus) UI.showTab();
    return t;
  },
  newChat() { const blank = this.list.find(t => !t.sid && !t.draft && !t.kind); if (blank) { blank.touchedAt = now(); this.active = blank.key; this.enforceLimit(blank.key); this.save(); UI.renderTabs(); UI.showTab(); return blank; } return this.open(null); },
  close(key) {
    const i = this.list.findIndex(t => t.key === key); if (i < 0) return;
    this.list.splice(i, 1);
    if (this.active === key) this.active = (this.list[i] || this.list[i - 1])?.key || null;
    if (!this.list.length) { this.save(); this.newChat(); return; }
    this.save(); UI.renderTabs(); UI.showTab();
  },
  // 抽卡不再单独开标签页：直接弹出和油猴脚本一样的抽卡面板
  openGacha() { if (!UI.me) { UI.loginGate('请先登录，再开始抽卡'); return null; } GPop.openAny(); return null; },
  openPower(mode) {
    if (mode && typeof PView !== 'undefined') PView.mode = mode;
    const titles = { rank: '模型排行榜', power: '推理分排行', price: '价格排行榜' };
    const curMode = (typeof PView !== 'undefined' && PView.mode) || mode || 'power';
    let t = this.list.find(x => x.kind === 'power');
    if (!t) { t = { key: 'power', kind: 'power', sid: null, title: titles[curMode] || '推理分排行', draft: '' }; this.list.push(t); }
    else if (titles[curMode]) t.title = titles[curMode];
    UI.saveScroll(); this.active = t.key; this.save(); UI.renderTabs(); UI.showTab(); UI.closeDrawer(); try { PView?.render?.(); } catch {} return t;
  },
  focus(key) { if (this.active === key) return; UI.saveScroll(); this.active = key; this.save(); UI.renderTabs(); UI.showTab(); },
  cycle(d) { const i = this.list.findIndex(t => t.key === this.active); const n = this.list[(i + d + this.list.length) % this.list.length]; if (n) this.focus(n.key); },
};

// ---------- 消息增量渲染（#66）----------
// 每条助手消息拆成「段」（正文 / 思考 / 工具组 / 提问卡片 …），每段按指纹缓存：指纹没变就原样复用同一个节点，
// 流式时只重画变了的那一段；消息外壳和 msg-body 也保持同一个节点，所以思考过程的展开状态、提问卡片里正在输入的文字都不会被重置。
const Seg = {
  all: new Map(),
  of(mid) { let s = this.all.get(mid); if (!s) { s = new Map(); this.all.set(mid, s); if (this.all.size > 600) this.all.delete(this.all.keys().next().value); } return s; },
  // off = 临时渲染（离屏预览等）：一律新建节点、不进缓存，绝不把正在界面上用的节点挪走
  off: false,
  use(mid, key, sig, make) { if (this.off) return make(); const s = this.of(mid), c = s.get(key); if (c && c.sig === sig) return c.el; const el = make(c?.el); if (el) s.set(key, { sig, el }); else s.delete(key); return el; },
  box(mid, key, make) { if (this.off) return make(); const s = this.of(mid); let c = s.get(key); if (!c) { c = { sig: 'box', el: make() }; s.set(key, c); } return c.el; },
  clear() { this.all.clear(); },
};
// 长文本流式渲染：分成「已闭合的头部块」和「活动尾部」。头部每块只渲染一次、以后原样复用；每帧只重新渲染尾部那一小段。
// 切分点只放在代码块 / 公式块之外的空行处，且下一行不是列表 / 缩进 / 表格（避免把一个列表或表格切成两半）
const StreamMD = {
  MIN: 360,
  safeCut(text, from) {
    // Linear prefix scans: never split the entire remaining text or rescan every preceding paragraph.
    let j=text.indexOf('\n\n',from);if(j<0)return -1;
    const fences=/^\s*(```|~~~)/gm,dollars=/\$\$/g;let f=fences.exec(text),d=dollars.exec(text),fp=0,dp=0,best=-1;
    while(j>=0){
      const at=j+2;j=text.indexOf('\n\n',at);if(at-from<this.MIN)continue;
      while(f&&f.index+f[0].length<=at){fp^=1;f=fences.exec(text);}
      while(d&&d.index+2<=at){dp^=1;d=dollars.exec(text);}
      if(fp||dp)continue;
      let start=at;while(start<text.length&&/\s/.test(text[start]))start++;
      if(start===text.length||/[ \t]/.test(text.slice(at,start).replace(/\n/g,'')))continue;
      const end=text.indexOf('\n',start),line=text.slice(start,end<0?text.length:end);
      if(/^([-*+]\s|\d+[.)]\s|\||>|<\/)/.test(line))continue;
      // A leading pipe is already rejected above, including table continuations.
      best=at;
    }
    return best;
  },
  chunk(src) { const d = h('div', { class: 'mdc' }); d.innerHTML = MD.render(src); return d; },
  // 逐字显示（打字机）：网络一次来一大段，界面按帧匀速吐字。速度跟积压量走——积压越多吐得越快，最多落后约 0.3 秒；
  // 回复结束后用更快的速度补完。后台 / 关掉「逐字显示」/ 重新打开的长回复：直接整段显示。只重画这一个正文块，不重画整个对话。
  tw: new Set(), twRaf: 0, twCost: 0,
  paint(box, text, streaming) {
    const smooth = Prefs.smoothStream !== false && !document.hidden;
    let tw = box.__tw;
    if (smooth && streaming && !tw) tw = box.__tw = { shown: box.__st ? (box.__st.shownLen ?? text.length) : (text.length > 600 ? text.length : 0), at: 0 };
    if (tw && smooth && (streaming || tw.shown < text.length)) {
      tw.text = text; tw.live = !!streaming;
      if (tw.shown > text.length || (box.__st && box.__st.head && !text.startsWith(box.__st.head))) tw.shown = Math.min(tw.shown, text.length);
      if (tw.shown < text.length) { this.tw.add(box); this.twTick(); }
      return this.paint0(box, this.cut(text, tw.shown), true);
    }
    if (tw) { delete box.__tw; this.tw.delete(box); }
    return this.paint0(box, text, streaming);
  },
  cut(text, n) { n = Math.floor(n); if (n >= text.length) return text; const c = text.charCodeAt(n - 1); if (c >= 0xd800 && c <= 0xdbff) n++; return text.slice(0, n); },
  twTick() {
    if (this.twRaf) return;
    this.twRaf = requestAnimationFrame(t => {
      this.twRaf = 0; const t0 = performance.now();
      for (const box of this.tw) {
        const tw = box.__tw;
        if (!tw || !box.isConnected || document.hidden || Prefs.smoothStream === false) { this.tw.delete(box); if (tw && box.isConnected) { tw.shown = tw.text.length; this.paint0(box, tw.text, tw.live); } continue; }
        const dt = Math.min(100, tw.at ? t - tw.at : 16); tw.at = t;
        // 节流：渲染一次很贵（长代码块）时降到 30fps 左右
        if (this.twCost > 8 && dt < 30) { tw.at -= dt; continue; }
        const left = tw.text.length - tw.shown;
        const cps = tw.live ? Math.max(45, left / 0.3) : Math.max(600, left / 0.15);
        tw.shown = Math.min(tw.text.length, tw.shown + Math.max(1, cps * dt / 1000));
        const sc = box.closest('.scroller'), atBot = sc && sc.scrollTop + sc.clientHeight > sc.scrollHeight - 80;
        this.paint0(box, this.cut(tw.text, tw.shown), tw.live || tw.shown < tw.text.length);
        if (atBot) sc.scrollTop = sc.scrollHeight;
        if (tw.shown >= tw.text.length) { this.tw.delete(box); if (!tw.live) { delete box.__tw; this.paint0(box, tw.text, false); } }
      }
      this.twCost = this.twCost * .8 + (performance.now() - t0) * .2;
      if (this.tw.size) this.twTick();
    });
  },
  // box 是持久的 .md 容器；text 只会在末尾追加（流式）；不是追加（被整条替换）时从头重建
  paint0(box, text, streaming) {
    let st = box.__st;
    if (!st || text.length < st.end || (st.end && text.slice(0, st.end) !== st.head)) { st = box.__st = { end: 0, head: '', els: [], tail: null, tailSrc: null }; }
    for (;;) { const c = this.safeCut(text, st.end); if (c < 0) break; st.els.push(this.chunk(text.slice(st.end, c))); st.end = c; st.head = text.slice(0, c); }
    const tail = text.slice(st.end);
    if (tail !== st.tailSrc) { st.tailSrc = tail; if (!st.tail) st.tail = h('div', { class: 'mdc' }); st.tail.innerHTML = tail.trim() ? MD.render(tail) : ''; }
    patchKids(box, tail.trim() ? [...st.els, st.tail] : st.els);
    box.classList.toggle('streaming', !!streaming);
    return box;
  },
};

// ---------- 消息渲染 ----------
const R = {
  text(p, streaming, m = null, chat = null, keyPrefix = 'txt') {
    const htmlSegs = R.extractInlineHtmlSegments(p?.text, streaming);
    if (htmlSegs) {
      const wrap = h('div', { class: 'inline-html-flow' });
      htmlSegs.forEach((hs, hi) => {
        if (hs.type === 'html') {
          wrap.append(R.inlineHtmlCard(hs, keyPrefix + ':ih:' + hs.idx, m, chat));
        } else if (hs.text && hs.text.trim()) {
          const d = h('div', { class: 'md prose' + (streaming && hi === htmlSegs.length - 1 ? ' streaming' : ''), lang: '', translate: 'no' });
          d.innerHTML = MD.render(hs.text);
          wrap.append(d);
        }
      });
      return wrap;
    }
    const d = h('div', { class: 'md prose' + (streaming ? ' streaming' : ''), lang: '', translate: 'no' });
    d.innerHTML = MD.render(p.text);
    return d;
  },
  reasoning(p, open, key, labels=null, live=true) {
    if (!p.text && p.state === 'done') return null;
    const openThink = ThinkingStatus.visible(p);
    const defOpen = openThink ? false : open;
    if (key) open = R.openOf(key, defOpen); else open = defOpen;
    let lbl = (labels?.of ? labels.of(p, live && p.state === 'streaming') : labels?.[live && p.state === 'streaming' ? 'live' : 'done']) || ThinkingStatus.label(null, null, live && p.state === 'streaming', undefined, p);
    if (openThink) { lbl = String(lbl || '').replace(/^闭源思考/, '开源思考'); if (!/^开源/.test(lbl)) lbl = '开源思考 · ' + lbl; }
    const d = h('details', { class: 'reason not-prose' + (openThink ? ' open-think' : ''), 'data-state': open ? 'open' : 'closed', open: open || null, title: '有可见思考文字 = 开源模型；思考为空（只有「…」）= 闭源模型。已从运行记录确认型号时以型号为准。' }, h('summary', { role: 'button', 'aria-expanded': open ? 'true' : 'false', 'data-state': open ? 'open' : 'closed' }, icon('brain'), openThink ? h('span', { class: 'rs-open-badge' }, '开源思考') : null, h('span', { class: 'rs-t' }, lbl)));
    if (key) R.keep(d, key);
    const b = h('div', { class: 'md prose muted', lang: '', translate: 'no' }); b.innerHTML = MD.render(p.text || '…'); d.append(b); return d;
  },
  tool(p) {
    const name = p.toolName || String(p.type).replace(/^tool-/, '');
    const inp = R.tinput(p);
    const st = p.state === 'output-available' ? (p.preliminary ? 'run' : (p.output?.exit_code != null && p.output.exit_code !== 0 ? 'bad' : 'ok')) : p.state === 'output-error' || p.state === 'output-denied' ? 'bad' : 'run';
    const lab = { ok: '完成', bad: '失败', run: p.state === 'input-streaming' ? '准备中' : '执行中' }[st];
    const sum = typeof inp === 'object' && inp ? (inp.command || inp.path || inp.url || inp.query || inp.file_path || Object.values(inp).find(v => typeof v === 'string') || '') : String(inp || '');
    const d = h('details', { class: 'tool ' + st }, h('summary', {}, icon('tool'), h('b', {}, name), h('code', { class: 'tool-sum' }, String(sum).split('\n')[0].slice(0, 140)), h('span', { class: 'tool-st' }, st === 'run' ? h('i', { class: 'spin' }) : null, lab)));
    const body = h('div', { class: 'tool-b' });
    if (inp !== undefined) body.append(h('div', { class: 'tool-l' }, '输入'), h('pre', {}, typeof inp === 'string' ? inp : JSON.stringify(inp, null, 2)));
    if (p.output !== undefined) {
      const o = p.output;
      if (o && typeof o === 'object' && ('stdout' in o || 'stderr' in o)) {
        if (o.stdout) body.append(h('div', { class: 'tool-l' }, 'stdout'), h('pre', {}, o.stdout));
        if (o.stderr) body.append(h('div', { class: 'tool-l' }, 'stderr'), h('pre', { class: 'err' }, o.stderr));
        body.append(h('div', { class: 'tool-l dim' }, `exit ${o.exit_code ?? '—'} · ${o.status || ''}${o.duration_ms != null ? ' · ' + (o.duration_ms / 1000).toFixed(1) + 's' : ''}`));
      } else body.append(h('div', { class: 'tool-l' }, '输出'), h('pre', {}, typeof o === 'string' ? o : JSON.stringify(o, null, 2)));
    }
    if (p.errorText) body.append(h('div', { class: 'tool-l' }, '错误'), h('pre', { class: 'err' }, p.errorText));
    d.append(body); return d;
  },
  // ---- 工具调用：参考 Brana 官方，连续的调用合并成可折叠的一组，写文件单独显示成文件卡片 ----
  tname(p) { return p.toolName || String(p.type).replace(/^tool-/, ''); },
  parsePartialStr(raw, key) {
    const m = new RegExp('"' + key + '"\\s*:\\s*"').exec(raw);
    if (!m) return undefined;
    let i = m.index + m[0].length, out = '';
    while (i < raw.length) {
      const ch = raw[i++];
      if (ch === '"') break;
      if (ch === '\\') {
        if (i >= raw.length) break;
        const esc = raw[i++];
        if (esc === 'n') out += '\n';
        else if (esc === 'r') out += '\r';
        else if (esc === 't') out += '\t';
        else if (esc === 'b') out += '\b';
        else if (esc === 'f') out += '\f';
        else if (esc === 'u' && i + 4 <= raw.length) {
          const hex = raw.slice(i, i + 4);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 4; }
          else out += 'u';
        } else out += esc;
      } else out += ch;
    }
    return out;
  },
  parsePartialInput(raw) {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch {}
    const out = {};
    for (const k of ['path', 'file_path', 'content', 'text', 'command', 'url', 'query', 'pattern', 'old_text', 'new_text']) {
      const v = R.parsePartialStr(raw, k);
      if (v !== undefined) out[k] = v;
    }
    return Object.keys(out).length ? out : raw;
  },
  tinput(p) { return p.input ?? (p.inputText ? R.parsePartialInput(p.inputText) : undefined); },
  normPath(pth) { return String(pth || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, ''); },
  latestFileText(sid, targetPath, fallbackPart) {
    const norm = R.normPath(targetPath);
    const chat = (sid && typeof Chats !== 'undefined' && Chats.get?.(sid)) || (typeof Chats !== 'undefined' ? Chats.cur : null);
    let text = '', found = false;
    for (const m of chat?.messages || []) {
      for (const p of m.parts || []) {
        if (!p || !(String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool')) continue;
        const n = R.tname(p).toLowerCase(), inp = R.tinput(p);
        if (!inp || typeof inp !== 'object') continue;
        const pth = R.normPath(inp.path || inp.file_path || '');
        if (!pth || (norm && pth !== norm)) continue;
        if (/^(write_?file|create_?file|write)$/.test(n)) {
          const c = typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '';
          if (c || !found) { text = c; found = true; }
        } else if (found && /^(edit_file|str_replace|edit)$/.test(n)) {
          const oldT = inp.old_text ?? inp.old_str, newT = inp.new_text ?? inp.new_str;
          if (typeof oldT === 'string' && typeof newT === 'string' && oldT && text.includes(oldT)) text = text.replace(oldT, newT);
        }
      }
    }
    if (found && text) return text;
    if (fallbackPart) {
      const i = R.tinput(fallbackPart) || {};
      return typeof i.content === 'string' ? i.content : typeof i.text === 'string' ? i.text : text;
    }
    return text;
  },
  tstate(p) { return p.state === 'output-available' ? (p.preliminary ? 'run' : (p.output?.exit_code != null && p.output.exit_code !== 0 ? 'bad' : 'ok')) : p.state === 'output-error' || p.state === 'output-denied' ? 'bad' : 'run'; },
  isWrite(p) { const n = R.tname(p).toLowerCase(), i = R.tinput(p); return /^(write_?file|create_?file|write)$/.test(n) && i && typeof i === 'object' && (i.path || i.file_path); },
  tlabel(n) { const m = { bash: 'Bash', shell: 'Bash', run_command: 'Bash', read_file: 'Read', edit_file: 'Edit', str_replace: 'Edit', write_file: 'Write', web_search: 'Search', fetch_page: 'Fetch', fetch: 'Fetch', list_files: 'List', glob: 'Glob', grep: 'Grep', image_search: 'Image search', generate_image: 'Generate image', generate_speech: 'Speech', add_voice: 'Voice', present_file: 'Present', start_process: 'Start process', stop_process: 'Stop process', get_process_output: 'Process output', ask_user: 'Ask', propose_plan: 'Plan', python: 'Python', code_interpreter: 'Python' }; return m[n.toLowerCase()] || n.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()); },
  toolStarts: new Map(),
  toolDurs: new Map(),
  nudgedTools: new Set(),
  fmtDurMs(ms, live = false) {
    if (ms == null || !Number.isFinite(+ms) || +ms < 0) return '';
    ms = +ms;
    if (ms < 1000) return live ? '⏱ 00:00' : Math.round(ms) + 'ms';
    const sec = Math.floor(ms / 1000), m = Math.floor(sec / 60), s = sec % 60, h = Math.floor(m / 60), mm = m % 60;
    const p2 = n => String(n).padStart(2, '0');
    if (live) return '⏱ ' + (h > 0 ? h + ':' + p2(mm) + ':' + p2(s) : p2(m) + ':' + p2(s));
    return h > 0 ? h + 'h ' + mm + 'm' : m > 0 ? m + 'm ' + s + 's' : s + 's';
  },
  tdur(p, tid = '') {
    const o = p?.output;
    let ms = o && typeof o === 'object' ? (o.duration_ms ?? o.durationMs) : null;
    if (ms == null && p?._durMs != null) ms = p._durMs;
    if (ms == null && tid && R.toolDurs.has(tid)) ms = R.toolDurs.get(tid);
    return R.fmtDurMs(ms, false);
  },
  async nudgeBash(el, p, tid, why = 'manual') {
    const c = (typeof Tabs !== 'undefined' && Tabs.cur) ? Tabs.cur : null;
    const curP = el?.__curPart || p;
    if (!c) return;
    if (why === 'timeout' && (!c.busy || !c.live || R.tstate(curP) !== 'run' || R.nudgedTools.has(tid))) return;
    if (tid) R.nudgedTools.add(tid);
    toast(why === 'timeout' ? '检测到 Bash 执行满 1 小时卡住，正在自动暂停并发送「继续」…' : '正在暂停当前卡住的回合，并自动发送「继续」…', 'ok');
    try {
      if (c.busy && typeof c.stop === 'function') await c.stop();
    } catch {}
    setTimeout(() => {
      try {
        if (why === 'timeout') {
          if (typeof c.send === 'function' && !c.busy) void c.send('继续', [], null, { autoContinue: true });
        } else if (typeof Drafts !== 'undefined' && typeof Drafts.sendNow === 'function') {
          void Drafts.sendNow(c, '继续', []);
        } else if (typeof c.send === 'function') {
          void c.send('继续', []);
        }
      } catch {}
    }, 650);
  },
  tsum(inp) { return typeof inp === 'object' && inp ? (inp.command || inp.path || inp.file_path || inp.url || inp.query || inp.pattern || Object.values(inp).find(v => typeof v === 'string') || '') : String(inp || ''); },
  openOf(key, def) { return UI.opens.has(key) ? UI.opens.get(key) : def; },
  // 只记住用户自己点开 / 收起的状态；进行中自动展开的不记（否则跑完以后一直保持展开，不会自动收起）
  extPart(p, key) {
    const n = R.tname(p);
    return { ...p, type: String(p?.type || '').startsWith('tool-') ? p.type : 'tool-' + n, toolCallId: p?.toolCallId || p?.id || String(key || '') };
  },
  keep(el, key) {
    const syncAria = () => {
      const sm = el.querySelector(':scope > summary');
      const st = el.open ? 'open' : 'closed';
      el.dataset.state = st;
      if (sm) { sm.setAttribute('role', 'button'); sm.setAttribute('aria-expanded', el.open ? 'true' : 'false'); sm.dataset.state = st; }
    };
    syncAria();
    el.addEventListener('click', e => { const sm = e.target.closest('summary'); if (sm && sm.parentElement === el) el.__user = true; });
    el.addEventListener('toggle', () => { syncAria(); if (el.__user) { el.__user = false; UI.opens.set(key, el.open); } });
    return el;
  },
  // 原生工具的专门展示（编辑 = 差异、搜索 = 结果列表、文件类 = 可点开的路径），其余走通用的输入 / 输出
  fpathEl(pth) { const short = String(pth).replace(/^\/home\/user\//, ''); return h('code', { class: 'fpath', 'data-fpath': short, title: '在工作区打开' }, short); },
  toolSpecial(p) {
    const n = R.tname(p).toLowerCase(), inp = R.tinput(p), o = p.output, box = h('div', { class: 'tool-b' });
    const I = inp && typeof inp === 'object' ? inp : {};
    const err = () => { if (p.errorText) box.append(h('pre', { class: 'err' }, p.errorText)); return box; };
    const outText = () => o === undefined ? '' : typeof o === 'string' ? o : o && typeof o === 'object' && typeof (o.content ?? o.text ?? o.result) === 'string' ? (o.content ?? o.text ?? o.result) : JSON.stringify(o, null, 2);
    if (/^(edit_file|str_replace|edit)$/.test(n) && (I.old_text != null || I.new_text != null || I.old_str != null)) {
      const pth = I.path || I.file_path; if (pth) box.append(h('div', { class: 'tool-l' }, R.fpathEl(pth)));
      const oldT = String(I.old_text ?? I.old_str ?? ''), newT = String(I.new_text ?? I.new_str ?? '');
      box.append(h('pre', { class: 'tdiff' }, ...oldT.split('\n').map(l => h('span', { class: 'd-del' }, '- ' + l)), ...newT.split('\n').map(l => h('span', { class: 'd-add' }, '+ ' + l))));
      if (o !== undefined && typeof o === 'string' && o.length < 400) box.append(h('div', { class: 'tool-l dim' }, o));
      return err();
    }
    if (/^(web_search|search)$/.test(n)) {
      if (I.query) box.append(h('div', { class: 'tool-l' }, '搜索：' + I.query));
      const arr = Array.isArray(o) ? o : Array.isArray(o?.results) ? o.results : Array.isArray(o?.items) ? o.items : null;
      if (arr) box.append(h('div', { class: 'tsearch' }, ...arr.slice(0, 20).map(r => h('a', { href: r.url || r.link || '#', target: '_blank', title: r.url || '' }, h('b', {}, r.title || r.url || '结果'), h('small', {}, String(r.url || '').replace(/^https?:\/\//, '').slice(0, 80)), r.content || r.snippet ? h('span', {}, String(r.content || r.snippet).slice(0, 220)) : null))));
      else if (o !== undefined) box.append(h('pre', {}, outText().slice(0, 20000)));
      return err();
    }
    if (/^(fetch_page|fetch)$/.test(n)) {
      if (I.url) box.append(h('div', { class: 'tool-l' }, h('a', { href: I.url, target: '_blank' }, I.url)));
      if (o !== undefined) box.append(h('pre', {}, outText().slice(0, 20000)));
      return err();
    }
    if (/^(read_file|present_file|generate_image|generate_speech|image_search|write_file)$/.test(n)) {
      const paths = new Set(); const pth = I.path || I.file_path; if (pth) paths.add(pth);
      const scan = v => { if (typeof v === 'string') { for (const m of v.matchAll(/(\/home\/user\/[^\s"',;)]+|~\/[^\s"',;)]+)/g)) paths.add(m[1]); } else if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
      scan(o);
      if (paths.size) box.append(h('div', { class: 'tool-l tpaths' }, ...[...paths].slice(0, 12).map(x => R.fpathEl(x))));
      const rest = { ...I }; delete rest.path; delete rest.file_path;
      if (Object.keys(rest).length) box.append(h('pre', {}, JSON.stringify(rest, null, 2).slice(0, 4000)));
      if (o !== undefined && n === 'read_file') box.append(h('pre', {}, outText().slice(0, 40000)));
      else if (o !== undefined && !paths.size) box.append(h('pre', {}, outText().slice(0, 8000)));
      return err();
    }
    return null;
  },
  toolBody(p) {
    const sp = R.toolSpecial(p); if (sp) return sp;
    const inp = R.tinput(p), body = h('div', { class: 'tool-b' });
    if (inp !== undefined) { const cmd = typeof inp === 'object' && inp && typeof inp.command === 'string' ? inp.command : null; body.append(h('pre', { class: cmd ? 'cmd' : '' }, cmd ? '$ ' + cmd : typeof inp === 'string' ? inp : JSON.stringify(inp, null, 2))); }
    if (p.output !== undefined) {
      const o = p.output;
      if (o && typeof o === 'object' && ('stdout' in o || 'stderr' in o)) {
        if (o.stdout) body.append(h('pre', {}, o.stdout));
        if (o.stderr) body.append(h('pre', { class: 'err' }, o.stderr));
        body.append(h('div', { class: 'tool-l dim' }, `exit ${o.exit_code ?? '—'}${o.duration_ms != null ? ' · ' + R.tdur(p) : ''}`));
      } else body.append(h('pre', {}, typeof o === 'string' ? o : JSON.stringify(o, null, 2)));
    }
    if (p.errorText) body.append(h('pre', { class: 'err' }, p.errorText));
    return body;
  },
  toolRow(p, key) {
    const st = R.tstate(p), n = R.tname(p), inp = R.tinput(p);
    const tid = String(p?.toolCallId || p?.id || key || ''), isBash = /^(bash|shell|run_command)$/i.test(n);
    if (st === 'run') {
      if (!R.toolStarts.has(tid)) R.toolStarts.set(tid, Number(p?._startAt) > 0 ? Number(p._startAt) : Date.now());
      if (R.toolStarts.size > 600) R.toolStarts.delete(R.toolStarts.keys().next().value);
    } else if (R.toolStarts.has(tid) && !R.toolDurs.has(tid)) {
      R.toolDurs.set(tid, Math.max(0, Date.now() - R.toolStarts.get(tid)));
      if (R.toolDurs.size > 600) R.toolDurs.delete(R.toolDurs.keys().next().value);
    }
    const startAt = R.toolStarts.get(tid) || Number(p?._startAt) || Date.now();
    const durSpan = h('span', { class: 'tr-dur' + (st === 'run' ? ' is-live' : '') }, st === 'run' ? R.fmtDurMs(Date.now() - startAt, true) : R.tdur(p, tid));
    let d = null;
    const nudgeBtn = (st === 'run' && isBash) ? h('button', {
      type: 'button',
      class: 'tr-nudge',
      title: '暂停当前卡住的 Bash 回合，并自动发送「继续」推进后续执行',
      onclick: e => { e.preventDefault(); e.stopPropagation(); void R.nudgeBash(d, p, tid, 'manual'); }
    }, '⏹ 中断并继续') : null;
    const routeStartTag = p?._routeStart
      ? h('span', {
          class: 'tr-route-tag',
          title: `路由提示：对话疑似 ${p._routeStart.toLabel}`,
        }, `路由提示：对话疑似 ${p._routeStart.toLabel}`)
      : null;
    const sm = h('summary', {}, icon('term', 'ti'), h('span', { class: 'min-w-0 tr-main' }, h('span', { class: 'tr-used' }, 'used'), h('b', {}, R.tlabel(n)),
      st === 'run' ? h('i', { class: 'spin' }) : h('span', { class: 'tr-st' }, st === 'ok' ? '✓' : '✗'),
      durSpan, h('code', { class: 'tr-sum' }, String(R.tsum(inp)).split('\n')[0].slice(0, 160))), routeStartTag, nudgeBtn, icon('chev', 'tr-chev'));
    sm.__reactFiber = { memoizedProps: { part: R.extPart(p, key) }, return: null };
    const isOpen = !!R.openOf(key, false);
    d = R.keep(h('details', { class: 'trow ' + st + (isBash ? ' is-bash' : '') + (p?._routeStart ? ' is-route-start' : ''), open: isOpen || null }, sm), key);
    if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
    d.__curPart = p;
    if (st === 'run') {
      const mountAt = Date.now();
      const timeoutMs = ((typeof Prefs !== 'undefined' && Number(Prefs.bashTimeoutMin) > 0) ? Number(Prefs.bashTimeoutMin) : 60) * 60000;
      const tickDur = () => {
        const curP = d.__curPart || p;
        const chat = (typeof Tabs !== 'undefined' && Tabs.cur) ? Tabs.cur : null;
        if (!d.isConnected && Date.now() - mountAt > 3000) { if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; } return; }
        if (R.tstate(curP) !== 'run' || (chat && !chat.busy && !chat.live)) {
          if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
          durSpan.className = 'tr-dur';
          durSpan.textContent = R.tdur(curP, tid);
          d.classList.remove('is-stuck');
          nudgeBtn?.remove();
          return;
        }
        const elap = Math.max(0, Date.now() - startAt);
        const isStuck = elap >= timeoutMs, isWarn = !isStuck && elap >= 300000;
        durSpan.className = 'tr-dur is-live' + (isStuck ? ' is-stuck' : isWarn ? ' is-warn' : '');
        durSpan.textContent = R.fmtDurMs(elap, true) + (isStuck ? ' · 超时卡住' : '');
        d.classList.toggle('is-stuck', isStuck);
        if (isStuck && isBash && chat?.busy && chat?.live) {
          if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
          void R.nudgeBash(d, curP, tid, 'timeout');
        }
      };
      d.__durTm = setInterval(tickDur, 1000);
      tickDur();
    }
    if (isOpen) {
      d.append(R.toolBody(p)); d.__bodyBuilt = true;
    } else {
      d.addEventListener('toggle', () => {
        if (d.open && !d.__bodyBuilt) { d.__bodyBuilt = true; d.append(R.toolBody(p)); }
      });
    }
    return d;
  },
  // 工具组：前序已经跑完的收在折叠组里（默认收起）；始终把最新的一条工具/命令单行露在折叠组下面（不展开具体内容）
  group(g, key, live, labels) {
    const items = g.items, tools = items.filter(p => p.type !== 'reasoning');
    let cut = items.length;
    if (live) { const i = items.findIndex(p => p.type !== 'reasoning' && R.tstate(p) === 'run'); if (i >= 0) cut = i; }
    let lastToolIdx = -1;
    for (let k = items.length - 1; k >= 0; k--) { if (items[k]?.type !== 'reasoning') { lastToolIdx = k; break; } }
    if (lastToolIdx >= 0 && cut > lastToolIdx) cut = lastToolIdx;
    const doneItems = items.slice(0, cut), doneTools = doneItems.filter(p => p.type !== 'reasoning'), n = doneTools.length;
    const bad = doneTools.filter(p => R.tstate(p) === 'bad').length;
    const hasRouteStart = doneTools.some(p => p?._routeStart);
    const allBash = tools.every(p => /^(bash|shell|run_command)$/i.test(R.tname(p)));
    const what = allBash ? '命令' : '工具';
    const wrap = h('div', { class: 'tg-wrap' });
    if (n) {
      const gsm = h('summary', {}, icon('chevr', 'tg-chev'), icon('term', 'ti'), h('span', {}, '已运行' + what), h('span', { class: 'tg-n' }, String(n)), bad ? h('span', { class: 'tg-bad' }, bad + ' 个失败') : null, hasRouteStart ? h('span', { class: 'tg-bad tg-route' }, '⚠️ 含路由转折') : null);
      gsm.__reactFiber$extcompat = { memoizedProps: { parts: doneTools.map((x, j) => R.extPart(x, key + ':' + j)), isActive: cut < items.length }, return: null };
      const isOpen = !!R.openOf(key, false);
      const d = R.keep(h('details', { class: 'tgroup', open: isOpen || null }, gsm), key);
      const box = h('div', { class: 'tg-list' });
      const buildRows = () => {
        if (box.__builtCount === doneItems.length) return;
        box.replaceChildren();
        doneItems.forEach((p, j) => {
          if (p.type === 'reasoning') { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) box.append(r); }
          else {
            const rowKey = key + ':' + j, rowSig = R.tstate(p) + ':' + (p.errorText ? 1 : 0) + ':' + (R.openOf(rowKey, false) ? 1 : 0) + ':' + (p._routeStart ? 'R' : '');
            box.append(Seg.use(key, 'tr:' + j, rowSig, () => R.toolRow(p, rowKey)));
          }
        });
        box.__builtCount = doneItems.length;
      };
      if (isOpen || doneItems.length <= 8) buildRows();
      else d.addEventListener('toggle', () => { if (d.open) buildRows(); });
      d.append(box); wrap.append(d);
    } else doneItems.forEach((p, j) => { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) wrap.append(r); });
    if (cut < items.length) {
      const tail = h('div', { class: 'tg-live' });
      items.slice(cut).forEach((p, k) => { if (p.type === 'reasoning') { const r = R.reasoning(p, false, key + ':r' + (cut + k), labels, live); if (r) tail.append(r); } else tail.append(R.toolRow(p, key + ':' + (cut + k))); });
      wrap.append(tail);
    }
    return wrap;
  },
  wraps: new Map(),
  classifyInlineHtml(code, lang = '', running = false) {
    const t = String(code || '').trim();
    if (t.length < 100) return null;
    const lg = String(lang || '').trim().toLowerCase();
    if (lg && !/^(html?|svg|xml)$/.test(lg)) return null;
    if (/^\s*(?:import\s+[\w{*\s,]+from\s+|export\s+(?:default|const|function|class)\s+|package\s+[\w.]+;|#include\s+<)/m.test(t)) return null;
    const isSvg = (lg === 'svg' || /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t)) && !/<html[\s>]/i.test(t) && (running || /<\/svg\s*>/i.test(t));
    if (isSvg && (t.length >= 120 || t.split('\n').length >= 4)) {
      const mTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t);
      return { ext: 'svg', kind: 'SVG', title: mTitle ? mTitle[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '' };
    }
    const isFullDoc = /(?:<!doctype\s+html|<html[\s>])/i.test(t) && (running || /<\/(?:html|body|head|style|script|svg)\s*>/i.test(t));
    const hasRichTags = (lg === 'html' || lg === 'htm' || (!lg && /^\s*</.test(t))) &&
      /<(?:head|body|style|script|canvas|main|section|article|header|footer|nav|table|form|div|svg)\b/i.test(t) &&
      (running || /<\/(?:html|body|style|script|canvas|main|section|article|div|svg|table|form)\s*>/i.test(t)) &&
      (t.length >= 160 || t.split('\n').length >= 6);
    if (isFullDoc || hasRichTags) {
      const mTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t) || /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t);
      return { ext: 'html', kind: 'HTML', title: mTitle ? mTitle[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 48) : '' };
    }
    return null;
  },
  extractInlineHtmlSegments(text, streaming = false) {
    const raw = String(text || '');
    if (raw.length < 100 || !/<(?:!doctype|html|svg|head|body|style|script|canvas|div|main|section|article|header|table|form)\b/i.test(raw)) return null;
    const out = [];
    let htmlIdx = 0;
    const pushUnfencedOrMd = (chunk, isTail) => {
      if (!chunk) return;
      if (chunk.length < 120 || !/<(?:!doctype\s+html|html[\s>]|svg[\s>])/i.test(chunk)) {
        out.push({ type: 'md', text: chunk });
        return;
      }
      const docRe = /(?:<!doctype\s+html[^>]*>[\s\S]*?<\/html\s*>|<html\b[^>]*>[\s\S]*?<\/html\s*>|(?:<\?xml[^>]*>\s*)?<svg\b[^>]*>[\s\S]*?<\/svg\s*>)/gi;
      let pos = 0, m;
      while ((m = docRe.exec(chunk)) !== null) {
        const info = R.classifyInlineHtml(m[0], '', false);
        if (!info) continue;
        if (m.index > pos) out.push({ type: 'md', text: chunk.slice(pos, m.index) });
        out.push({ type: 'html', code: m[0].trim(), ext: info.ext, kind: info.kind, title: info.title, running: false, idx: htmlIdx++ });
        pos = m.index + m[0].length;
      }
      const rem = chunk.slice(pos);
      if (isTail && streaming && rem.length >= 140) {
        const openMatch = /(?:<!doctype\s+html|<html[\s>]|<svg\b[^>]*>)/i.exec(rem);
        if (openMatch) {
          const cand = rem.slice(openMatch.index);
          const info = R.classifyInlineHtml(cand, '', true);
          if (info) {
            if (openMatch.index > 0) out.push({ type: 'md', text: rem.slice(0, openMatch.index) });
            out.push({ type: 'html', code: cand.trim(), ext: info.ext, kind: info.kind, title: info.title, running: true, idx: htmlIdx++ });
            return;
          }
        }
      }
      if (rem) out.push({ type: 'md', text: rem });
    };
    const fenceRe = /(`{3,}|~{3,})[ \t]*([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\1[ \t]*(?=\r?\n|$)/g;
    let lastPos = 0, fm;
    while ((fm = fenceRe.exec(raw)) !== null) {
      const lang = fm[2] || '', body = fm[3] || '';
      const info = R.classifyInlineHtml(body, lang, false);
      if (!info) continue;
      if (fm.index > lastPos) pushUnfencedOrMd(raw.slice(lastPos, fm.index), false);
      out.push({ type: 'html', code: body.trim(), ext: info.ext, kind: info.kind, title: info.title, running: false, idx: htmlIdx++ });
      lastPos = fm.index + fm[0].length;
    }
    const tail = raw.slice(lastPos);
    const openFence = /(`{3,}|~{3,})[ \t]*(html?|svg|xml)?[ \t]*\r?\n([\s\S]{100,})$/i.exec(tail);
    if (openFence) {
      const info = R.classifyInlineHtml(openFence[3], openFence[2] || '', true);
      if (info) {
        if (openFence.index > 0) pushUnfencedOrMd(tail.slice(0, openFence.index), false);
        out.push({ type: 'html', code: openFence[3].trim(), ext: info.ext, kind: info.kind, title: info.title, running: Boolean(streaming), idx: htmlIdx++ });
        return htmlIdx > 0 ? out : null;
      }
    }
    pushUnfencedOrMd(tail, true);
    return htmlIdx > 0 ? out : null;
  },
  inlineHtmlPath(m, seg) {
    const midShort = String(m?.id || 'msg').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'msg';
    return `inline-${midShort}-${(seg?.idx ?? 0) + 1}.${seg?.ext || 'html'}`;
  },
  inlineHtmlCard(seg, key, m, chat) {
    const vpath = R.inlineHtmlPath(m, seg);
    const text = String(seg?.code || '');
    const lines = text ? text.split('\n').length : 0;
    const running = !!seg?.running;
    const ext = String(seg?.ext || 'html').toUpperCase();
    const dispTitle = seg?.title ? `${seg.title} (${vpath})` : `内嵌 ${ext} 页面 (${vpath})`;
    let d = null;
    const sidOf = el => el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || chat?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
    const getTxt = () => d?.__inlineCode || text;
    const openPv = (mode = 'run') => {
      if (typeof HtmlPreview === 'undefined' || !HtmlPreview.open) return;
      const sid = sidOf(d);
      HtmlPreview.open({ sid, path: vpath, get: getTxt, wsid: sid, mode });
    };
    const pvBtn = h('button', {
      type: 'button',
      class: 'btn ghost xs wc-pv-btn',
      title: '点击在预览窗口中运行查看',
      onclick: e => { e.preventDefault(); e.stopPropagation(); openPv('run'); }
    }, icon('pvplay'), h('span', {}, '预览'));
    const codeBtn = h('button', {
      type: 'button',
      class: 'btn ghost xs wc-code-btn',
      title: '点击在预览窗口中查看完整代码',
      onclick: e => { e.preventDefault(); e.stopPropagation(); openPv('code'); }
    }, icon('pvcode'), h('span', {}, '代码'));
    const wsm = h('summary', {},
      h('span', { class: 'wc-w' }, ext),
      h('code', { class: 'wc-p', title: '点击在预览窗口展开查看' }, dispTitle),
      h('span', { class: 'dim' }, lines ? lines + ' 行' : ''),
      running ? h('i', { class: 'spin' }) : null,
      h('span', { class: 'grow' }),
      pvBtn,
      codeBtn,
      icon('chevr', 'tg-chev')
    );
    d = R.keep(h('details', { class: 'wcard ' + (running ? 'run' : 'ok') + ' pvable inline-html-card', open: R.openOf(key, false) || null }, wsm), key);
    d.__inlineCode = text;
    if (typeof HtmlPreview !== 'undefined' && HtmlPreview.bindRow) {
      HtmlPreview.bindRow(wsm, { path: vpath, get: getTxt, getWsid: () => sidOf(d) });
    }
    d.append(h('div', { class: 'wc-card' },
      h('div', { class: 'wc-h' }, icon('file'), h('span', {}, dispTitle), h('span', { class: 'grow' }), h('span', { class: 'wc-lang' }, ext),
        h('button', { class: 'ib xs', title: '复制代码', onclick: e => { e.preventDefault(); e.stopPropagation(); copyText(getTxt()); } }, icon('copy'))),
      h('pre', { class: 'wc-code' }, text.length > 60000 ? text.slice(0, 60000) + '\n…' : text || '（空）')
    ));
    if (Seg.off || typeof HtmlPreview === 'undefined' || !HtmlPreview.card) return d;
    const card = HtmlPreview.card(key, { path: vpath, running, get: getTxt, getWsid: () => sidOf(d) });
    let wrap = R.wraps.get(key);
    if (!wrap) {
      wrap = h('div', { class: 'wc-wrap inline-html-wrap' }, d, card);
      R.wraps.set(key, wrap);
      if (R.wraps.size > 200) R.wraps.delete(R.wraps.keys().next().value);
    } else {
      wrap.firstElementChild?.replaceWith(d);
      const old = wrap.querySelector(':scope>.pvc');
      if (old !== card) old ? old.replaceWith(card) : wrap.append(card);
    }
    return wrap;
  },
  // 这个对话里 Write 出来的所有可预览文件（含对话正文内嵌的完整 HTML/SVG）：预览面板的「文件」下拉与自动截图共用
  writes(sid) {
    const chat = Chats.get(sid), seen = new Map();
    for (const m of chat?.messages || []) for (const p of m.parts || []) {
      if (!p) continue;
      if ((String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && R.isWrite(p)) {
        const inp = R.tinput(p) || {}, path = R.normPath(inp.path || inp.file_path || '');
        if (!path || !HtmlPreview.previewable(path)) continue;
        seen.set(path, { path, running: R.tstate(p) === 'run', get: () => R.latestFileText(sid, path, p) });
      } else if (m.role === 'assistant' && p.type === 'text' && p.text) {
        const segs = R.extractInlineHtmlSegments(p.text, false);
        if (segs) {
          for (const hs of segs) {
            if (hs.type !== 'html') continue;
            const vpath = R.inlineHtmlPath(m, hs);
            seen.set(vpath, { path: vpath, running: !!hs.running, get: () => hs.code });
          }
        }
      }
    }
    return [...seen.values()];
  },
  writeCard(p, key) {
    const inp = R.tinput(p) || {}, path = String(inp.path || inp.file_path || ''), short = R.normPath(path);
    const sidOf = el => el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
    const getTxt = () => R.latestFileText(sidOf(d), short, p);
    const text = (typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '') || R.latestFileText(null, short, p);
    const lines = text ? text.split('\n').length : 0, st = R.tstate(p), name = path.split('/').pop() || path;
    const ext = (/\.([\w]+)$/.exec(name)?.[1] || 'plain').toUpperCase();
    const pv = HtmlPreview.previewable(path);   // html / svg：点这一行在右侧内嵌预览（箭头仍是展开代码）
    const wsm = h('summary', {}, h('span', { class: 'wc-w' }, 'Write'), pv ? h('code', { class: 'wc-p', title: '点击在右侧预览' }, short) : h('code', { class: 'wc-p fpath', 'data-fpath': short, title: '在工作区打开' }, short), h('span', { class: 'dim' }, lines ? lines + ' 行' : ''), st === 'run' ? h('i', { class: 'spin' }) : st === 'bad' ? h('span', { class: 'tr-st bad' }, '✗') : null, h('span', { class: 'grow' }), icon('chevr', 'tg-chev'));
    wsm.__reactFiber$extcompat = { memoizedProps: { part: R.extPart(p, key) }, return: null };
    const d = R.keep(h('details', { class: 'wcard ' + st + (pv ? ' pvable' : ''), open: R.openOf(key, false) || null }, wsm), key);
    if (pv) HtmlPreview.bindRow(d.querySelector('summary'), { path: short, get: getTxt, getWsid: () => sidOf(d) });
    d.append(h('div', { class: 'wc-card' }, h('div', { class: 'wc-h' }, icon('file'), h('span', {}, name), h('span', { class: 'grow' }), h('span', { class: 'wc-lang' }, ext.length > 6 ? 'PLAIN' : ext), h('button', { class: 'ib xs', title: '复制', onclick: e => { e.preventDefault(); copyText(getTxt() || text); } }, icon('copy'))),
      h('pre', { class: 'wc-code' }, text.length > 60000 ? text.slice(0, 60000) + '\n…' : text || '（空）'),
      p.errorText ? h('pre', { class: 'err' }, p.errorText) : null));
    // html / svg：和网页版一样，在这一行下面直接显示页面缩略图（点一下放大）；其它文件仍然只有这一行
    if (!pv || Seg.off || HtmlPreview.kindOf(path) !== 'html') return d;
    const card = HtmlPreview.card(key, { path: short, running: st === 'run', get: getTxt, getWsid: () => sidOf(d) });
    let wrap = R.wraps.get(key);
    if (!wrap) { wrap = h('div', { class: 'wc-wrap' }, d, card); R.wraps.set(key, wrap); if (R.wraps.size > 200) R.wraps.delete(R.wraps.keys().next().value); }
    else { wrap.firstElementChild?.replaceWith(d); const old = wrap.querySelector(':scope>.pvc'); if (old !== card) old ? old.replaceWith(card) : wrap.append(card); }
    return wrap;
  },
  // ---- 人在回路：ask_user 交互式问答（和官方卡片一致）/ propose_plan / 选声音 / 选图片 ----
  findPart(chat, id) { for (let i = chat.messages.length - 1; i >= 0; i--) { const p = (chat.messages[i].parts || []).find(x => x.toolCallId === id); if (p) return p; } return null; },
  hitlBrief(r, chat) {
    const o = r?.output || {}, p = R.findPart(chat, r?.toolCallId), inp = p ? Hitl.input(p) || {} : {};
    if (r.tool === 'ask_user') {
      if (o.skipped) return '已跳过提问';
      const qs = inp.questions || [];
      return (o.answers || []).map(a => { const q = qs.find(x => x.id === a.questionId); const op = q?.options?.find(x => x.id === a.selectedOptionId); return [op?.label, a.customResponse].filter(Boolean).join(' · ') || '（空）'; }).join('；') || '已回答';
    }
    if (r.tool === 'propose_plan') return '计划：' + ({ accepted: '已接受', revise: '需要修改', rejected: '已拒绝', no_decision: '未决定' }[o.decision] || o.decision || '已回应');
    if (r.tool === 'add_voice' || r.tool === 'generate_image') return (r.tool === 'add_voice' ? '声音' : '图片') + '：' + (o.selection_method === 'skip' ? '跳过' : '选了第 ' + ((o.selected_index ?? 0) + 1) + ' 个');
    return '已回应';
  },
  hitlSend(chat, p, out, opt = {}) {
    if (!UI.me) { UI.loginGate('请先登录'); return Promise.resolve(); }
    const d = UI.hitlDraft.get(p.toolCallId) || {}; d.sending = true; d.err = ''; UI.hitlDraft.set(p.toolCallId, d); chat.emit(); scheduleChat(chat);
    return chat.submitHitl(p, out, opt).then(r => {
      if (r?.staged) {
        // 同一步里模型发了好几个提问：先记下这个（草稿保留，点「修改」可以改），滚到下一个还没回答的
        d.sending = false; toast(`已记下，还有 ${r.left} 个提问待回答，答完后一起提交`); chat.emit(); scheduleChat(chat);
        setTimeout(() => { const nx = Hitl.pending(chat).find(x => !chat.hitlStage?.has(x.toolCallId)); const el = nx && [...document.querySelectorAll('#view .hitl.ask')].find(x => x.dataset.tc === nx.toolCallId); el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 80);
        return;
      }
      UI.hitlDraft.delete(p.toolCallId);
    })
      .catch(async e => {
        if (e?.status === 403 && /recaptcha/i.test(e.body || '') && !opt.v2) { toast('需要人机验证', 'err'); const tok = await Recaptcha.v2().catch(() => null); if (tok) { d.sending = false; return R.hitlSend(chat, p, out, { ...opt, v2: tok }); } }
        // 失败原因留在卡片上（toast 几秒就没了，看不到就没法判断是哪一步出的问题）；选项草稿还在，直接再点提交即可
        d.sending = false; d.err = describe(e) + (e?.status ? '（HTTP ' + e.status + '）' : ''); toast('提交失败：' + describe(e), 'err'); chat.emit(); scheduleChat(chat);
      });
  },
  // 卡片底部状态行：提交中显示卡在哪一步（等服务器 / 人机验证 / 发送中…），失败显示原因
  hitlNote(chat, p) {
    const d = UI.hitlDraft.get(p.toolCallId) || {};
    if (d.err) return h('div', { class: 'hq-note err' }, '没有发出去：' + d.err + '。选项已保留，可以直接再点提交。');
    if (d.sending && chat.phase) return h('div', { class: 'hq-note' }, h('i', { class: 'spin' }), chat.phase);
    return null;
  },
  hitl(p, chat, m, isLast) {
    const n = Hitl.name(p), inp = Hitl.input(p) || {}, ans = Hitl.answerOf(chat, p);
    const waiting = ans === undefined && Hitl.awaiting(p) && isLast;
    const staged = chat.hitlStage?.has(p.toolCallId);
    const off = !waiting || Hitl.blocked(chat) || !chat.loaded || staged || UI.hitlDraft.get(p.toolCallId)?.sending;
    // 卡片已经不在等回答、本地却找不到回答（多半是在网页 / 别的设备上回答的，本地没同步到）：向服务器补一次
    if (ans === undefined && !waiting && !staged && chat.loaded && !chat.gacha && Hitl.awaiting(p) && !chat.recP && now() - (chat.recoAt || 0) > 15000) setTimeout(() => chat.reconcile(), 0);
    const card = n === 'ask_user' ? R.askCard(p, chat, inp, ans, waiting, off, staged) : n === 'propose_plan' ? R.planCard(p, chat, inp, ans, waiting, off) : R.battleCard(p, chat, n, inp, ans, waiting, off);
    { const note = card && ans === undefined ? R.hitlNote(chat, p) : null; if (note) card.append(note); }
    // 输入框带固定标识：卡片不得不重建时，把焦点和光标位置搬到新卡片的同一个输入框（正在输入的内容不丢）
    card?.querySelectorAll?.('textarea,input').forEach((x, j) => { x.dataset.fk = p.toolCallId + ':' + j; });
    if (card?.dataset) card.dataset.tc = p.toolCallId;
    return card;
  },
  hitlSig(p, chat, isLast) {
    const ans = Hitl.answerOf(chat, p), d = UI.hitlDraft.get(p.toolCallId);
    let a = ''; try { a = ans === undefined ? 'u' : JSON.stringify(ans); } catch { a = 'x'; }
    let i = ''; try { i = JSON.stringify(Hitl.input(p) || {}); } catch {}
    let o = ''; try { const n = Hitl.norm(p.output); o = n && typeof n === 'object' ? JSON.stringify({ status: n.status || '', candidates: n.candidates || [], voice_id: n.voice_id || '' }) : String(n ?? ''); } catch {}
    return [p.state, a, i, isLast, chat.hitlStage?.has(p.toolCallId), Hitl.blocked(chat), chat.loaded, !!chat.recP, d?.sending, d?.err || '', p.output ? 1 : 0, o].join('|');
  },
  askCard(p, chat, inp, ans, waiting, off, staged) {
    const qs = Array.isArray(inp.questions) ? inp.questions.filter(q => q && typeof q === 'object') : [];
    if (!qs.length) return h('div', { class: 'hitl muted' }, h('div', { class: 'hq-h' }, h('span', { class: 'hq-q' }, p.state === 'input-streaming' ? '正在准备问题…' : '提问')));
    // 题目 / 选项没有 id 时用序号兜底（否则几道题会共用同一个选择）
    const qk = (q, i) => q.id != null && q.id !== '' ? String(q.id) : 'q' + (i + 1);
    const ok = (op, i) => op.id != null && op.id !== '' ? String(op.id) : String(op.label ?? i);
    // 已回答：紧凑摘要
    if (!waiting || staged) {
      const o = staged ? chat.hitlStage.get(p.toolCallId).output : ans || {};
      const box = h('div', { class: 'hitl done' });
      const syncing = ans === undefined && !staged && !!chat.recP;
      if (o.skipped) box.append(h('div', { class: 'hq-h' }, h('span', { class: 'hq-q' }, qs[0].question), h('span', { class: 'hq-tag' }, '已跳过')));
      else qs.forEach((q, qi) => {
        const a = (o.answers || []).find(x => String(x.questionId) === qk(q, qi)), op = (q.options || []).find((x, oi) => ok(x, oi) === String(a?.selectedOptionId));
        const txt = [op?.label, a?.customResponse].filter(Boolean).join(' · ');
        box.append(h('div', { class: 'hq-sum' }, h('div', { class: 'hq-q' }, q.question), h('div', { class: 'hq-a' + (txt ? '' : ' dim') }, txt ? icon('check') : null, txt || (ans === undefined && !staged ? (syncing ? '同步中…' : '（未回答）') : '（空）'))));
      });
      if (staged) box.append(h('div', { class: 'hq-foot dim' }, h('span', { class: 'grow' }, '已记下，回答完其余提问后一起提交'),
        h('button', { class: 'hq-skip', onclick: () => { chat.hitlStage.delete(p.toolCallId); chat.messages.forEach(x => x.v = (x.v || 0) + 1); chat.emit(); scheduleChat(chat); } }, '修改')));
      return box;
    }
    const d = UI.hitlDraft.get(p.toolCallId) || { sel: {}, txt: {} }; UI.hitlDraft.set(p.toolCallId, d); d.sel ||= {}; d.txt ||= {};
    const card = h('div', { class: 'hitl ask' + (off ? ' off' : '') });
    const secs = [];
    const done = (q, i) => !!d.sel[qk(q, i)] || !!String(d.txt[qk(q, i)] || '').trim();
    const left = () => qs.map((q, i) => done(q, i) ? 0 : i + 1).filter(Boolean);
    const build = () => ({ skipped: false, answers: qs.map((q, i) => ({ questionId: qk(q, i), selectedOptionId: d.sel[qk(q, i)] || null, customResponse: String(d.txt[qk(q, i)] || '').trim().slice(0, 2000) || null })) });
    // 提交：没答完的题标红并滚过去（按钮不再「点了没反应」）
    const go = () => {
      if (off) { if (Hitl.blocked(chat)) toast('这一轮还在进行中，结束后才能提交', 'err'); return; }
      const miss = left();
      secs.forEach((sec, i) => sec.classList.toggle('miss', miss.includes(i + 1)));
      if (miss.length) { toast(qs.length > 1 ? `还有第 ${miss.join('、')} 题没回答` : '请先选择一个选项或填写回答', 'err'); secs[miss[0] - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      R.hitlSend(chat, p, build());
    };
    const submit = h('button', { class: 'hq-submit' + (left().length ? ' part' : ''), disabled: off || null, onclick: go }, d.sending ? '提交中…' : qs.length > 1 ? `Submit ${qs.length - left().length}/${qs.length}` : 'Submit');
    const refresh = () => { const n = left().length; submit.classList.toggle('part', !!n); if (qs.length > 1 && !d.sending) submit.textContent = `Submit ${qs.length - n}/${qs.length}`; secs.forEach((sec, i) => { if (done(qs[i], i)) sec.classList.remove('miss'); }); };
    qs.forEach((q, qi) => {
      const k = qk(q, qi), sec = h('div', { class: 'hq' }); secs.push(sec);
      sec.append(h('div', { class: 'hq-h' }, qs.length > 1 ? h('span', { class: 'hq-n' }, (qi + 1) + '/' + qs.length) : null, h('span', { class: 'hq-q' }, q.question),
        qi === 0 ? h('button', { class: 'hq-skip', disabled: off || null, title: '跳过这次提问', onclick: () => R.hitlSend(chat, p, { skipped: true, answers: [] }) }, 'Skip') : null));
      (q.options || []).forEach((op, oi) => {
        const oid = ok(op, oi);
        const row = h('label', { class: 'hq-opt' + (d.sel[k] === oid ? ' on' : '') },
          h('input', { type: 'radio', name: 'hq-' + p.toolCallId + '-' + k, checked: d.sel[k] === oid || null, disabled: off || null, onchange: () => {
            d.sel[k] = oid; sec.querySelectorAll('.hq-opt').forEach(x => x.classList.toggle('on', x === row)); refresh();
            // 和网页一致：只有一道题时点选项就是回答（没写补充说明的话）；多道题时自动滚到下一道没答的
            if (qs.length === 1 && !String(d.txt[k] || '').trim()) { setTimeout(go, 120); return; }
            const nx = left()[0]; if (nx && nx > qi + 1) secs[nx - 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } }),
          h('span', { class: 'hq-dot' }, icon('check')),
          h('span', { class: 'hq-l' }, h('span', {}, op.label ?? oid), op.description ? h('span', { class: 'hq-d' }, op.description) : null));
        sec.append(row);
      });
      if (q.allowCustomResponse !== false) {
        const ta = h('textarea', { class: 'hq-in', rows: 1, maxlength: 2000, placeholder: 'Revise options or write your own...', disabled: off || null,
          oninput: e => { d.txt[k] = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; refresh(); },
          onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMob()) { e.preventDefault(); go(); } } });
        ta.value = d.txt[k] || '';
        sec.append(h('div', { class: 'hq-cus' }, icon('pen'), ta, qi === qs.length - 1 ? submit : null));
      } else if (qi === qs.length - 1) sec.append(h('div', { class: 'hq-cus end' }, h('span', { class: 'grow' }), submit));
      card.append(sec);
    });
    return card;
  },
  planCard(p, chat, inp, ans, waiting, off) {
    const path = String(inp.path || ''), short = path.replace(/^\/home\/user\/(workspace\/)?/, '');
    const card = h('div', { class: 'hitl plan' + (off ? ' off' : '') },
      h('div', { class: 'hq-h' }, icon('file'), h('span', { class: 'hq-q' }, '计划'), path ? h('code', { class: 'fpath', 'data-fpath': short, title: '在工作区打开' }, short) : null,
        ans !== undefined ? h('span', { class: 'hq-tag' }, { accepted: '已接受', revise: '需要修改', rejected: '已拒绝', no_decision: '未决定' }[ans?.decision] || '已回应') : null),
      Array.isArray(inp.highlights) && inp.highlights.length ? h('ul', { class: 'hp-hl' }, inp.highlights.map(x => h('li', {}, x))) : null);
    if (waiting) {
      const d = UI.hitlDraft.get(p.toolCallId) || {}; UI.hitlDraft.set(p.toolCallId, d);
      const ta = h('textarea', { class: 'hq-in', rows: 1, placeholder: '修改意见（可选，选「修改」时一起发送）', disabled: off || null, oninput: e => { d.txt = e.target.value; } }); ta.value = d.txt || '';
      const go = dec => R.hitlSend(chat, p, { decision: dec }, { text: dec === 'accepted' ? '' : d.txt });
      card.append(h('div', { class: 'hq-cus' }, icon('pen'), ta),
        h('div', { class: 'hp-act' }, h('button', { class: 'btn sm', disabled: off || null, onclick: () => go('accepted') }, '接受'), h('button', { class: 'btn sm ghost', disabled: off || null, onclick: () => go('revise') }, '修改'), h('button', { class: 'btn sm danger', disabled: off || null, onclick: () => go('rejected') }, '拒绝')));
    }
    return card;
  },
  // 卡片每次刷新都会重建：图片 / 音频节点按地址复用（不再每次重新加载 → 不闪、不跳高度，播放中的声音不被打断）
  media(key, mk) { const m = R._media ||= new Map(); let el = m.get(key); if (el) { m.delete(key); m.set(key, el); return el; } el = mk(); m.set(key, el); if (m.size > 240) m.delete(m.keys().next().value); return el; },
  battleCard(p, chat, n, inp, ans, waiting, off) {
    const o = p.output && typeof p.output === 'object' ? p.output : {}, cands = Array.isArray(o.candidates) ? o.candidates : [];
    const voice = n === 'add_voice', url = hsh => ORIGIN + '/api/chat/workspace/cas/user/' + encodeURIComponent(hsh);
    if (!voice) {
      const wsUrl = fp => {
        const short = String(fp || '').replace(/^\/home\/user\//, '').replace(/^~\//, '');
        if (!short) return '';
        const wf = (typeof WS !== 'undefined' && WS.sid === chat?.sid && Array.isArray(WS.data)) ? WS.data.find(f => String(f.path || '').replace(/^\/home\/user\//, '') === short) : null;
        if (wf?.hash) return url(wf.hash);
        return chat?.sid ? ORIGIN + '/api/agent/sessions/' + encodeURIComponent(chat.sid) + '/files/' + short.split('/').map(encodeURIComponent).join('/') : '';
      };
      const candUrl = c => {
        if (!c) return '';
        if (c.url || c.src) return String(c.url || c.src).startsWith('/') ? ORIGIN + String(c.url || c.src) : String(c.url || c.src);
        if (c.hash) return url(c.hash);
        if (c.path || c.file_path) return wsUrl(c.path || c.file_path);
        return '';
      };
      const singlePath = o.path || o.file_path || inp.file_path || inp.path || '';
      const singleItem = (!cands.length && p.state === 'output-available' && o.status !== 'error' && (o.hash || o.url || singlePath))
        ? [{ hash: o.hash, url: o.url, path: singlePath }]
        : [];
      const list = cands.length ? cands : singleItem;
      const isMulti = cands.length > 1 || (!list.length && inp.offer_options !== false);
      const headTxt = list.length > 1 || (waiting && isMulti) ? 'Which image do you prefer?' : (p.state !== 'output-available' ? 'Generating image…' : 'Generated image');
      const card = h('div', { class: 'hitl battle img-official text-text-primary rounded-md border border-border-faint bg-surface-primary my-4 max-w-[680px] p-4 shadow-none' + (off ? ' off' : '') },
        h('div', { class: 'img-off-head flex items-start justify-between gap-3' },
          h('p', { class: 'img-off-title text-text-primary text-base leading-snug' }, headTxt),
          waiting ? h('button', { class: 'img-off-skip inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors text-text-secondary hover:bg-surface-raised hover:text-text-primary h-7 shrink-0 rounded-md px-2 text-xs', type: 'button', 'aria-label': 'Skip image selection', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', selected_index: 0, selection_method: 'skip' }) }, 'Skip')
            : ans !== undefined ? h('span', { class: 'hq-tag' }, ans?.selection_method === 'skip' ? 'Skipped' : 'Selected #' + ((ans?.selected_index ?? 0) + 1)) : null));
      if (p.state === 'output-available' && o.status === 'error') { card.append(h('pre', { class: 'err' }, o.message || '出错')); return card; }
      if (!list.length) {
        if (!ans && p.state !== 'output-available') {
          const skelGrid = h('div', { class: 'img-off-grid mt-3 grid grid-cols-2 gap-2' + (isMulti ? '' : ' single') });
          for (let k = 0; k < (isMulti ? 2 : 1); k++) skelGrid.append(h('div', { class: 'img-off-item' }, h('div', { class: 'img-off-skel' }, h('i', { class: 'spin' }), h('span', {}, 'Generating image ' + (isMulti ? (k + 1) : '') + '…'))));
          card.append(skelGrid);
        }
        return card;
      }
      const eyeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye size-3" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      const grid = h('div', { class: 'hb-grid img-off-grid mt-3 grid grid-cols-2 gap-2' + (list.length === 1 ? ' single' : '') });
      list.forEach((c, i) => {
        const sel = ans && ans.selection_method !== 'skip' && ans.selected_index === i;
        const u = candUrl(c);
        const label = list.length > 1 ? 'Candidate image ' + (i + 1) : (singlePath.split('/').pop() || 'Generated image');
        const imgEl = R.media('i:' + (c.hash || u) + ':' + i, () => h('img', { alt: label, class: 'zimg file-img h-full w-full object-cover transition-transform duration-150 group-hover:scale-[1.02]', src: u, 'data-name': label, 'data-sub': String(inp.prompt || '').slice(0, 60), loading: 'lazy' }));
        const viewBtn = h('button', { type: 'button', 'aria-label': 'View image ' + (i + 1), class: 'img-off-view bg-surface-secondary group relative aspect-square w-full overflow-hidden rounded', onclick: e => { e.stopPropagation(); ImgView.open(imgEl.src || u, label, imgEl); } },
          imgEl,
          h('div', { class: 'img-off-ov pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/35 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100' },
            h('span', { class: 'img-off-pill inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white', html: eyeSvg + 'View' })));
        const item = h('div', { class: 'hb-c img-off-item border-border-faint bg-surface-secondary/20 flex flex-col gap-2 rounded-md border p-2' + (sel ? ' on' : '') }, viewBtn);
        if (waiting) {
          item.append(h('button', { class: 'img-off-sel inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors border border-border-medium bg-surface-primary text-text-primary hover:bg-surface-raised h-8 w-full rounded-md px-3 text-xs', type: 'button', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', selected_index: i, selection_method: 'user', ...(c.id ? { selected_candidate_id: c.id } : {}) }) }, 'Select'));
        } else if (ans !== undefined && list.length > 1) {
          item.append(h('button', { class: 'img-off-sel' + (sel ? ' on' : ''), type: 'button', disabled: true }, sel ? 'Selected ✓' : 'Select'));
        }
        grid.append(item);
      });
      card.append(grid);
      if (singlePath) card.append(h('div', { class: 'img-off-foot' }, R.fpathEl(singlePath), inp.prompt ? h('span', { class: 'dim', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(inp.prompt).slice(0, 80)) : null));
      return card;
    }
    const title = '选择声音';
    const card = h('div', { class: 'hitl battle' + (off ? ' off' : '') }, h('div', { class: 'hq-h' }, icon('mic'), h('span', { class: 'hq-q' }, title), h('code', { class: 'dim' }, String(inp.text || '').slice(0, 80)),
      ans !== undefined ? h('span', { class: 'hq-tag' }, ans?.selection_method === 'skip' ? '已跳过' : '已选第 ' + ((ans?.selected_index ?? 0) + 1) + ' 个') : null,
      waiting ? h('button', { class: 'hq-skip', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', candidates: cands, selected_index: 0, selection_method: 'skip', ...(o.voice_id ? { voice_id: o.voice_id } : {}) }) }, 'Skip') : null));
    if (p.state === 'output-available' && o.status === 'error') card.append(h('pre', { class: 'err' }, o.message || '出错'));
    if (!cands.length) { if (!ans && p.state !== 'output-available') card.append(h('div', { class: 'dim hq-foot' }, h('i', { class: 'spin' }), '正在生成候选声音…')); return card; }
    const grid = h('div', { class: 'hb-grid voice' });
    cands.forEach((c, i) => {
      const sel = ans && ans.selection_method !== 'skip' && ans.selected_index === i;
      grid.append(h('div', { class: 'hb-c' + (sel ? ' on' : '') },
        h('div', { class: 'hb-n' }, '声音 ' + (i + 1)),
        R.media('a:' + c.hash, () => h('audio', { controls: true, preload: 'none', src: url(c.hash) })),
        waiting ? h('button', { class: 'btn sm primary', disabled: off || null, onclick: () => R.hitlSend(chat, p, { status: 'completed', candidates: cands, selected_index: i, selection_method: 'user', ...(o.voice_id ? { voice_id: o.voice_id } : {}) }) }, '选这个') : null));
    });
    card.append(grid);
    return card;
  },
  part(p, ctx) {
    if (!p || !p.type) return null;
    if (p.type === 'text') return p.text ? R.text(p, p.state === 'streaming') : null;
    if (p.type === 'reasoning') return R.reasoning(p, ctx.live && p.state === 'streaming');
    if (p.type === 'step-start') return null;
    if (p.type === 'error') return h('div', { class: 'part-err' }, '⚠ ' + (typeof formatOfficialErrorText === 'function' ? formatOfficialErrorText(p.text) : p.text));
    if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') return R.tool(p);
    if (p.type === 'source-url') return h('a', { class: 'src', href: p.url, target: '_blank' }, p.title || p.url);
    if (p.type === 'file') return /^image\//.test(p.mediaType || '') ? R.media('f:' + p.url, () => h('img', { class: 'file-img zimg', src: p.url, 'data-name': p.filename || '', onclick: e => ImgView.open(p.url, p.filename || '', e.currentTarget) })) : h('a', { class: 'src', href: p.url, target: '_blank' }, p.filename || '文件');
    if (p.type.startsWith('data-')) return null;
    return null;
  },
  // prev：上一次渲染的同一条消息节点。助手消息原地更新（外壳 / 正文节点不换），只替换变了的部分
  message(m, chat, isLast, prev, seg) {
    if (!prev || m.role === 'user' || prev.dataset.id !== m.id) return R.message0(m, chat, isLast, null, seg);
    const out = {}, el = R.message0(m, chat, isLast, out, seg);
    if (!out.kids) return el;
    prev.className = out.cls;
    const liveNow = chat.live === m || !!(isLast && m.role === 'assistant' && chat?.busy && !chat?.waitingForeign);
    if (liveNow) prev.setAttribute('data-streaming', 'true'); else prev.removeAttribute('data-streaming');
    patchKids(prev, out.kids);
    return prev;
  },
  message0(m, chat, isLast, out, seg) {
    const live = chat.live === m || !!(isLast && m.role === 'assistant' && chat?.busy && !chat?.waitingForeign);
    const segCls = m.role === 'assistant' && seg ? (seg.head ? ' seg-head' : seg.mid ? ' seg-mid' : seg.tail ? ' seg-tail' : '') : '';
    const isAutoCont = m.role === 'user' && !!(m._autoContinue || m.metadata?.autoContinue);
    const el = h('div', {
      id: m.id ? 'chat-message-' + m.id : null,
      tabindex: '-1',
      class: 'msg ' + m.role + (m.failed ? ' failed' : '') + segCls + (isAutoCont ? ' auto-cont-msg' : ''),
      'data-id': m.id,
      'data-message-id': m.id || null,
      'data-chat-message-id': m.id || null,
      'data-agent-transcript-message': 'true',
      'data-message-author-role': m.role,
      'data-role': m.role,
      'data-streaming': live ? 'true' : null,
      'data-user-message-layout': m.role === 'user' ? 'true' : null
    });
    if (m.role === 'user') {
      if (isAutoCont) {
        el.append(h('span', { class: 'auto-cont-pill', title: '检测到官方工具链中途停顿，已自动无感续接' }, h('i', { class: 'auto-cont-dot' }), h('span', {}, '⚡ 自动续接')));
        return el;
      }
      const txt = (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
      const ups = userAtts(m);
      if (ups.length) el.append(h('div', { class: 'att-row mine' }, ups.map(u => attView(u, true))));
      const tr = (m.parts || []).filter(p => p.type === 'data-tool-results' && Array.isArray(p.data)).flatMap(p => p.data);
      if (tr.length) el.append(h('div', { class: 'hitl-chip' }, icon('check'), tr.map(r => R.hitlBrief(r, chat)).join('；')));
      if (txt) el.append(h('div', { class: 'bubble prose', lang: '', translate: 'no', 'data-user-message-body-row': 'true' }, txt));
      if (!txt && tr.length) return el;
      const st = m._sentAt || idTime(m.id);
      el.append(h('div', { class: 'msg-act', 'data-user-message-action': 'true' }, h('button', { class: 'ib', type: 'button', title: '复制', 'aria-label': 'Copy', onclick: () => copyText(txt) }, icon('copy')), st ? h('span', { class: 'mtime', title: '发送时间 ' + clockFull(st) }, clock(st)) : null));
      return el;
    }
    // 正文区域保持同一个节点，段落按指纹复用（见 Seg）
    if (chat?.sid) el.setAttribute('data-wsid', chat.sid);
    const reasonAccess=ThinkingStatus.access(chat,m),reasonLabels={live:ThinkingStatus.label(chat,m,chat.phase==='思考中',reasonAccess),done:ThinkingStatus.label(chat,m,false,reasonAccess),of:(p,s)=>ThinkingStatus.label(chat,m,s,reasonAccess,p)};
    if (live) m._streamed = true;
    const body = Seg.box(m.id, 'body', () => h('div', { class: 'msg-body' })), segs = [], mid = m.id;
    const running = p => p.state !== 'output-available' && p.state !== 'output-error' && p.state !== 'output-denied' || !!p.preliminary;
    const outSig = p => p.output === undefined ? -1 : typeof p.output === 'string' ? p.output.length : (p.output?.stdout?.length || 0) + (p.output?.stderr?.length || 0) + (p.output?.exit_code ?? 0);
    const pSig = p => p.type + ':' + (p.state || '') + ':' + (p.text?.length || 0) + ':' + (p.inputText?.length || 0) + ':' + (p.input ? 1 : 0) + ':' + outSig(p) + ':' + (p.preliminary ? 1 : 0) + ':' + (p.errorText ? 1 : 0);
    let grp = null;
    const flush = () => {
      if (!grp) return; const g = grp; grp = null;
      const sig = (live ? 'L' : '') + '|' + g.items.map(pSig).join(',');
      segs.push(Seg.use(mid, 'g:' + g.start, sig, () => R.group(g, mid + ':' + g.start, live, reasonLabels)));
    };
    (m.parts || []).forEach((p, i) => {
      if (!p || !p.type) return;
      const isTool = p.type.startsWith('tool-') || p.type === 'dynamic-tool';
      if (isTool && Hitl.name(p)) { flush(); segs.push(Seg.use(mid, 'h:' + (p.toolCallId || i), R.hitlSig(p, chat, isLast), () => R.hitl(p, chat, m, isLast))); return; }
      if (isTool && !R.isWrite(p)) { (grp ||= { start: i, items: [] }).items.push(p); return; }
      if (p.type === 'step-start' || p.type.startsWith('data-') || (p.type === 'text' && !p.text)) return;
      // 开源思考（有可见思考文字）绝不能像 bash 一样被折叠进「已运行工具」中：先 flush 工具组，再独立标红展示
      if (p.type === 'reasoning' && !ThinkingStatus.visible(p) && grp) return;
      flush();
      if (isTool) { segs.push(Seg.use(mid, 'w:' + i, pSig(p), () => R.writeCard(p, mid + ':' + i))); return; }
      if (p.type === 'text') {
        const streaming = live && p.state === 'streaming';
        const htmlSegs = R.extractInlineHtmlSegments(p.text, streaming);
        if (htmlSegs) {
          htmlSegs.forEach((hs, hi) => {
            if (hs.type === 'html') {
              const hKey = mid + ':ih:' + i + ':' + hs.idx;
              const hSig = (hs.running ? 'R' : 'D') + ':' + hs.code.length + ':' + hs.code.slice(-24);
              segs.push(Seg.use(mid, 'ih:' + i + ':' + hs.idx, hSig, () => R.inlineHtmlCard(hs, hKey, m, chat)));
            } else if (hs.text && hs.text.trim()) {
              const tKey = 't:' + i + ':m' + hi;
              if (m._streamed) segs.push(StreamMD.paint(Seg.box(mid, tKey, () => h('div', { class: 'md prose', lang: '', translate: 'no' })), hs.text, streaming && hi === htmlSegs.length - 1));
              else segs.push(Seg.use(mid, tKey, hs.text.length + ':' + hs.text.slice(-24), () => R.text({ text: hs.text }, false)));
            }
          });
          return;
        }
        if (m._streamed) segs.push(StreamMD.paint(Seg.box(mid, 't:' + i, () => h('div', { class: 'md prose', lang: '', translate: 'no' })), p.text, streaming));
        else segs.push(Seg.use(mid, 't:' + i, p.text.length + ':' + p.text.slice(-24), () => R.text(p, false)));
        return;
      }
      if (p.type === 'reasoning') {
        if (!p.text && p.state === 'done') return;
        const key = mid + ':r' + i, d = Seg.box(mid, 'r:' + i, () => { const b = h('div', { class: 'md prose muted', lang: '', translate: 'no' }); const badge = h('span', { class: 'rs-open-badge', hidden: true }, '开源思考'); const x = R.keep(h('details', { class: 'reason not-prose' }, h('summary', { role: 'button' }, icon('brain'), badge, h('span', { class: 'rs-t' })), b), key); x.__b = b; x.__badge = badge; return x; });
        const streaming = live && p.state === 'streaming', isClosedTurn = reasonAccess?.type === 'closed' || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(chat)), openThink = !isClosedTurn && ThinkingStatus.visible(p);
        d.classList.toggle('open-think', openThink);
        if (d.__badge) d.__badge.hidden = !openThink;
        let lbl = reasonLabels.of(p, streaming);
        if (openThink) { lbl = String(lbl || '').replace(/^闭源思考/, '开源思考'); if (!/^开源/.test(lbl)) lbl = '开源思考 · ' + lbl; }
        d.querySelector('.rs-t').textContent = lbl;
        d.querySelector('summary').title = '有可见思考文字 = 开源模型；思考为空（只有「…」）= 闭源模型。已从运行记录确认型号时以型号为准。';
        // 开源思考默认保持展开并标红强烈凸显（除非用户手动点过收起）；闭源思考按流式状态自动展开/收起
        const wantOpen = openThink ? false : streaming;
        if (UI.opens.has(key)) { d.open = !!UI.opens.get(key); d.__auto = null; }
        else if (d.__auto !== wantOpen) { d.__auto = wantOpen; d.open = wantOpen; }
        const st = d.open ? 'open' : 'closed'; d.dataset.state = st;
        const sm = d.querySelector(':scope > summary'); if (sm) { sm.setAttribute('aria-expanded', d.open ? 'true' : 'false'); sm.dataset.state = st; }
        StreamMD.paint(d.__b, p.text || '…', false);
        segs.push(d); return;
      }
      const n = Seg.use(mid, 'p:' + i, pSig(p) + ':' + (p.url || '') + (live ? 'L' : ''), () => R.part(p, { live }));
      if (n) segs.push(n);
    });
    flush();
    const miRoute = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
    const stripTierV = s => String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const validNotice = n => {
      if (!n) return null;
      const fl = String(n.fromShort || n.fromLabel || miRoute?.routeFrom || '').trim();
      const tl = String(n.toShort || n.toLabel || miRoute?.routeTo || '').trim();
      if (fl && tl && ((n.type === 'model' && stripTierV(fl) === stripTierV(tl)) || fl.toLowerCase() === tl.toLowerCase())) return null;
      return n;
    };
    const rn = !seg?.hideFoot ? validNotice(m._routeNotice || (m.id && miRoute?.routeNotices?.[m.id]) || null) : null;
    let prevNotice = (!seg?.hideFoot && !rn && m.id && miRoute?.routed && miRoute?.routeNotices)
      ? Object.values(miRoute.routeNotices).map(validNotice).find(n => n && n.prevMessageId === m.id) || null
      : null;
    if (!seg?.hideFoot && !rn && !prevNotice && m.id && Array.isArray(chat?.messages)) {
      const assts = chat.messages.filter(x => x && x.role === 'assistant' && x.id);
      const myIdx = assts.findIndex(x => x.id === m.id);
      const nextAsst = myIdx >= 0 ? assts[myIdx + 1] : null;
      if (nextAsst) {
        prevNotice = validNotice(nextAsst._routeNotice || (nextAsst.id && miRoute?.routeNotices?.[nextAsst.id]) || null);
      }
    }
    const isPivotPrev = !seg?.hideFoot && !rn && (m._routePivotRole === 'prev' || Boolean(prevNotice));
    const isPivotNext = !seg?.hideFoot && (m._routePivotRole === 'next' || Boolean(rn));
    if (rn) {
      const suspectedModel = String(rn.toLabel || rn.toShort || miRoute?.routeTo || miRoute?.reverseLabel || miRoute?.candidateName || miRoute?.name || '其他模型')
        .replace(/(\s*\((?:None|Minimal|Low|Medium|High|xHigh|Max)\))(?:\s*\1)+/gi, '$1')
        .trim();
      const rText = `路由提示：对话疑似 ${suspectedModel}`;
      segs.push(Seg.use(mid, 'route-alert', rText, () => h('div', { class: 'msg-route-alert', role: 'status' }, icon('alert'), h('span', {}, rText))));
    }
    if (live) segs.push(Seg.box(mid, 'typing', () => h('div', { class: 'typing', title: '正在生成与执行中…' }, h('i'), h('i'), h('i'))));
    patchKids(body, segs);
    const kids = [body];
    if (!live && !(seg?.hideFoot && !(m.metadata?.aborted || m.metadata?.feedback?.interruption === 'stop'))) {
      const md = m.metadata || {}, tm = md.timing, txt = (seg?.fullText || (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n\n')).trim();
      const foot = h('div', { class: 'msg-act' });
      const pivotLabel = isPivotPrev
        ? String(m._turnModelLabel || prevNotice?.fromShort || prevNotice?.fromLabel || miRoute?.routeFrom || '').trim()
        : isPivotNext
          ? String(m._turnModelLabel || rn?.toShort || rn?.toLabel || miRoute?.routeTo || '').trim()
          : '';
      if (pivotLabel) {
        const cleanPivot = typeof Strength !== 'undefined' && Strength.canon ? String(Strength.canon(pivotLabel)).replace(/[?？]+$/, '') : pivotLabel;
        foot.append(h('span', {
          class: 'badge msg-turn-model' + (isPivotNext ? ' is-routed' : ' is-route-prev'),
          title: isPivotPrev
            ? `路由转折前（上一句回复）模型：${cleanPivot}`
            : `路由转折后（下一句回复）模型：${cleanPivot}`,
        }, cleanPivot));
      }
      // 结束时间 + 用时（多段连续工具合并显示总时长，避免同一结束时间重复刷屏）
      const meta=h('div',{class:'msg-meta','aria-label':'Message cost'}), tools=h('div',{class:'msg-tools'});
      const rawT0 = tm?.startedAt || idTime(m.id), t0 = (seg?.turnStartAt && (!rawT0 || seg.turnStartAt < rawT0)) ? seg.turnStartAt : rawT0, t1 = tm?.completedAt || 0;
      if (t1) meta.append(h('span', { class: 'mtime', title: (t0 ? '开始 ' + clockFull(t0) + '\n' : '') + '结束 ' + clockFull(t1) }, '结束 ' + clock(t1)));
      if (t0 && t1 && t1 > t0) meta.append(h('span', { class: 'dim' }, durTxt((t1 - t0) / 1000)));
      if (md.aborted || md.feedback?.interruption === 'stop') {
        const isOpenThinkStop = Boolean(
          md.openThinkStopped ||
          chat.thinkStopped ||
          (miRoute?.fingerprint?.skipped === 'compat-thinking' || miRoute?.fingerprint?.skipped === 'visible-thinking') ||
          ((m.parts || []).some(p => (p?.type === 'reasoning' || p?.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || ''))) && !(typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(chat)))
        );
        if (isOpenThinkStop) md.openThinkStopped = true;
        meta.append(h('span', { class: 'dim' }, isOpenThinkStop ? '开源思考已停止' : '已停止'));
        if (isLast && !chat.busy && isOpenThinkStop) {
          meta.append(h('button', {
            class: 'btn ghost xs',
            style: { marginLeft: '6px' },
            title: '本对话已被官方服务端路由为开源模型：点击允许本对话继续执行（不再因开源思考自动暂停，以便让 AI 执行完搬运文件/清理工作区等指令）',
            onclick: () => {
              chat._allowOpenThink = true;
              toast('已允许本对话使用当前模型继续执行（不再因开源思考自动暂停），正在重发…');
              void UI.retry(chat, null, false);
            }
          }, '▶ 允许继续执行（不暂停）'));
        }
      }
      if (txt || isLast) tools.append(h('button', { class: 'ib', type: 'button', title: '复制', 'aria-label': 'Copy', onclick: () => copyText(txt) }, icon('copy')));
      if (typeof FingerprintReview !== 'undefined' && FingerprintReview.isReviewable(chat, m)) {
        tools.append(h('button', {
          class: 'btn ghost xs fp-calib-btn',
          title: '校准指纹（仅分析已有回复，不发送新消息）',
          onclick: () => FingerprintReview.calibrate(chat, m)
        }, '校准指纹'));
      }
      if (isLast && !chat.busy) tools.append(h('button', { class: 'ib', title: '重新生成', onclick: () => UI.regen(chat) }, icon('retry')));
      foot.append(h('div',{class:'msg-tail'},meta,tools));
      kids.push(foot);
    }
    if (out) { out.cls = el.className; out.kids = kids; return el; }
    el.append(...kids);
    return el;
  },
};

// ---------- 浏览器扩展挂进页面的节点 ----------
// 扩展的内容脚本在 document_start / document_idle 运行，比客户端脚本（dom-ready 之后才注入）更早，可能已经往页面里
// 挂了自己的节点（悬浮面板、样式）。UI.build() 用 innerHTML 整页重建会把它们一起清掉，于是扩展"装上了、没报错、却完全
// 没效果"。按 robots.txt 原始文档的形状识别外来节点：<html> 下 head / body 以外的元素、<body> 下 <pre> 以外的元素、
// <head> 里的 style / link；重建后挂回原来的层级。脚本节点不挂回（已经执行过，挪回去也不会再跑）。
const ExtensionNodes = {
  detach(doc) {
    const out = { html: [], head: [], body: [] }, root = doc?.documentElement; if (!root) return out;
    const take = (parent, list, keep) => { for (const el of [...(parent?.children || [])]) if (!keep(el)) { list.push(el); el.remove(); } };
    take(root, out.html, el => el.tagName === 'HEAD' || el.tagName === 'BODY');
    take(doc.head, out.head, el => el.tagName !== 'STYLE' && el.tagName !== 'LINK');
    take(doc.body, out.body, el => el.tagName === 'PRE' || el.tagName === 'SCRIPT');
    return out;
  },
  restore(doc, kept) {
    if (!kept || !doc?.documentElement) return;
    try { if (doc.head) doc.head.append(...kept.head); if (doc.body) doc.body.append(...kept.body); doc.documentElement.append(...kept.html); } catch {}
  },
};

// ---------- 主界面 ----------
const UI = {
  modelIds:new WeakMap(),modelSeq:0,
  modelStamp(model){if(!model)return 0;let id=this.modelIds.get(model);if(!id){id=++this.modelSeq;this.modelIds.set(model,id);}return id;},
  me: null, host: null, accounts: [], scrolls: new Map(), modelsV: 0, opens: new Map(), hitlDraft: new Map(), atts: new Map(),
  build() {
    // 先摘下扩展挂进来的节点（见上方 ExtensionNodes），界面搭好后挂回去
    const kept = ExtensionNodes.detach(document);
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"><title>Brana AI</title></head><body></body>';
    this.watchDrawer?.();   // <body> 刚被整个换掉：把抽屉监听重新挂到新 body 上
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    window.__ANC_CLIENT_SHELL = true;
    document.documentElement.dataset.platform = Host.platform + (/Mac/.test(navigator.platform) ? ' mac' : '');
    this.applyTheme();
    const logo = h('button', { type: 'button', class: 'brand brand-btn nodrag', title: '切换为浏览器模式：用当前账号的网络环境和指纹直接打开官网原生页面', 'aria-label': '切换为浏览器模式', onclick: () => this.browserModeAsk() }); logo.innerHTML = BRANA_LOGO;
    document.body.append(h('div', { id: 'app' },
      h('div', { id: 'row' },
        h('aside', { id: 'sb', 'data-sidebar': 'sidebar' },
          h('div', { class: 'sb-top drag' }, logo, h('div', { class: 'sb-actions' }, this.archDelBtn()), h('span', { class: 'grow' })),
          h('div', { class: 'sb-nav', style: { position: 'relative' } },
            h('button', { class: 'nav', onclick: () => { Tabs.newChat(); this.closeDrawer(); } }, icon('plus'), h('span', {}, '新对话'), h('kbd', {}, 'Ctrl T')),
            h('a', { href: '/agent', 'aria-label': 'New Chat', class: 'ext-newchat-link', tabindex: '-1', onclick: e => { e.preventDefault(); e.stopPropagation(); Tabs.newChat(); this.closeDrawer(); } }, 'New Chat'),
            h('div',{class:'history-search'},h('label', { class: 'nav search' }, icon('search'), h('input', { id: 'q', placeholder: '搜索名称、备注', 'aria-label':'搜索对话名称、备注', oninput: () => this.searchListSoon() }),
              h('select',{id:'history-scope','aria-label':'搜索范围',title:'搜索普通对话还是归档',onchange:e=>{SideTools.setScope(e.target.value);document.querySelector('#q')?.focus();}},h('option',{value:'active'},'对话'),h('option',{value:'archived'},'归档'))))),
          h('div',{id:'selection-bar',hidden:true,'aria-label':'批量操作'}),
          h('div', { class: 'list', id: 'list', role:'listbox', 'aria-label':'对话列表','aria-multiselectable':'true', onscroll: e => { const l = e.target; if (SideTools.scope==='active' && l.scrollTop + l.clientHeight > l.scrollHeight - 200) History.more(); } }),
          h('div', { id: 'sbgrip', title: '拖动调整侧栏宽度（双击恢复默认）' }),
          h('div', { class: 'sb-foot' },
            h('button', { class: 'acct', id: 'acct', onclick: e => this.acctMenu(e) }, h('div', { class: 'av' }, 'A'), h('div', { class: 'acct-t' }, h('div', { class: 'acct-n' }, '…'), h('div', { class: 'acct-s' }, ''))),
            // 手机：账号旁边放调色板和设置
            h('button', { class: 'ib sbf-m sbf-thm', title: '切换主题（自动 / 浅色 / 深色）', 'aria-label': '切换主题', onclick: () => { const order = ['auto', 'light', 'dark']; Prefs.theme = order[(order.indexOf(Prefs.theme || 'auto') + 1) % order.length]; savePrefs(); this.applyTheme(); } }, icon('sun')),
            h('button', { class: 'ib sbf-m sbf-pal', title: '调色板：给窗口染色（按对话保存）', 'aria-label': '调色板', onclick: e => Palette.open(e.currentTarget) }, icon('palette')),
            h('button', { class: 'ib sbf-m sbf-ext', title: '扩展程序（客户端与浏览器模式通用）', 'aria-label': '扩展程序', onclick: e => ExtPop.open(e.currentTarget) }, icon('ext')),
            h('button', { class: 'ib sbf-m sbf-set', title: '设置', 'aria-label': '设置', onclick: () => { this.closeDrawer(); this.settings(); } }, icon('gear')))),   // 刷新在底部栏（额度旁）
        h('div', { id: 'scrim', onclick: () => this.closeDrawer() }),
        h('main', { id: 'main' },
          h('div', { id: 'tabs', class: 'drag' }, h('button', { class: 'ib burger nodrag', id: 'sbbtn', title: '收起 / 展开侧栏', onclick: () => { if (isMob()) { document.body.classList.toggle('drawer'); if (Dock.mOpen) { Dock.mOpen = false; this.layout(); } } else this.toggleSidebar(); } }, icon('side')), h('div', { id: 'tablist', class: 'nodrag' }), h('button', { class: 'ib nodrag', id: 'newtabbtn', title: '新标签 (Ctrl+T)', onclick: () => Tabs.newChat() }, icon('plus')),
            h('button', { class: 'ib nodrag', id: 'swbtn', title: '已打开的窗口（切换 / 关闭）', onclick: () => TabSw.open() }, icon('dots')), h('span', { class: 'grow' }),
            this.themeSeg(),
            h('button', { class: 'ib nodrag', id: 'palbtn', title: '调色板：给窗口染色（按对话保存）', onclick: e => Palette.open(e.currentTarget) }, icon('palette')),
            h('div', { id: 'extpins', class: 'ext-pins nodrag' }),
            h('button', { class: 'ib nodrag', id: 'extbtn', title: '扩展程序（客户端与浏览器模式通用）', 'aria-label': '扩展程序', onclick: e => ExtPop.open(e.currentTarget) }, icon('ext')),
            h('button', { class: 'ib nodrag', id: 'themebtn', title: '切换深色 / 浅色', onclick: () => { Prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; savePrefs(); this.applyTheme(); } }, icon('moon')),
            h('button', { class: 'ib nodrag', id: 'dockbtn', title: '模型信息面板', onclick: () => Dock.toggle() }, icon('panel'))),
          h('div', { id: 'body' },
            h('div', { id: 'view' }),
            h('aside', { id: 'ws' }),
            h('aside', { id: 'pv', 'aria-label': '内嵌预览' }),
            h('div', { id: 'dockwrap' }, h('button', { id: 'dockfold', title: '收起 / 展开模型信息', onclick: () => Dock.toggle() }, icon('chevr')), h('div', { id: 'dockgrip', title: '拖动调整宽度' }), h('aside', { id: 'dock' }))))),
      h('div', { id: 'bar' }),
      // 手机：模型信息面板收在右边缘，平时只露一个小圆点头，点一下 / 从右边缘往左滑展开
      h('button', { id: 'dockhandle', type: 'button', title: '模型信息', 'aria-label': '模型信息', onclick: () => Dock.toggle(true) })));
    ExtensionNodes.restore(document, kept);
    this.paintThemeSeg(); try { ExtPop.refreshPins(); } catch {} try { WS.mount($('#ws')); } catch (e) { console.error(e); } try { HtmlPreview.mount($('#pv')); } catch (e) { console.error(e); } try { Dock.mount($('#dock')); } catch (e) { console.error(e); } try { Bar.mount($('#bar')); } catch (e) { console.error(e); } try { Mag.bind($('#list')); } catch (e) { console.error(e); }
    this.grip(); this.sbGrip(); this.dragBar(); this.layout(); ActiveFrame.mount();
    document.addEventListener('keydown', e => this.keys(e));
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-copy]'); if (c) { copyText(c.closest('.code').querySelector('code').textContent); return; }
      const a = e.target.closest('a[href]');
      if (a && !a.hasAttribute('download')) {
        const raw = a.getAttribute('href') || '';
        if (!raw || raw.startsWith('#')) { e.preventDefault(); return; }
        if (/^(https?:|mailto:)/i.test(a.href) && !a.href.startsWith(location.origin + '/robots.txt')) {
          e.preventDefault();
          // Brana 对话链接直接在客户端里打开
          const m = /^https:\/\/(?:www\.)?(?:arena\.ai|lmarena\.ai)\/(?:agent|c)\/([0-9a-f][0-9a-f-]{15,})/i.exec(a.href);
          if (m) { Tabs.open(m[1]); return; }
          if (/^https:\/\/(?:www\.)?(?:arena\.ai|lmarena\.ai)\/agent\/?$/i.exec(a.href)) { Tabs.newChat(); return; }
          Host.openExternal(a.href);
          return;
        }
      }
      if (!e.target.closest('.menu, #gpop, .rv')) document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.applyTheme());
    addEventListener('resize', () => { clearTimeout(this.rsT); this.rsT = setTimeout(() => this.layout(), 100); });
  },
  // 布局：侧栏 / 工作区 / 模型信息面板的显示与宽度
  layout() {
    const b = document.body, t = Tabs.cur, chat = t && !t.kind && t.sid;
    // 手机：竖屏按宽度；横屏（触屏且短边 ≤ 540）也按手机布局
    const coarse = matchMedia('(pointer:coarse)').matches, m = innerWidth <= 760 || (coarse && Math.min(innerWidth, innerHeight) <= 540), wide = !m;
    b.classList.toggle('m', m); b.classList.toggle('m-land', m && innerWidth > innerHeight && innerHeight <= 540);
    // 手机 ↔ 桌面布局切换（平板旋转 / 拉宽窗口）：相邻的预搭页只在手机布局里存在
    if (m !== this.wasM) { const was = this.wasM; this.wasM = m; try { if (!m) { if (Mob.busy()) Mob.flush(); Pager.clear(); } else Pager.ensureSoon(); if (was !== undefined) Palette.apply(); } catch {} }
    if (!m) b.classList.remove('drawer');
    b.classList.toggle('sb-off', wide && Prefs.sbOff === true);
    if (HtmlPreview.on() && HtmlPreview.sid() !== (chat || null)) HtmlPreview.close();   // 换了窗口：预览收起，面板恢复
    b.classList.toggle('pv-on', HtmlPreview.on());
    b.classList.toggle('dock-off', wide ? !Dock.open : !Dock.mOpen);
    b.classList.toggle('ws-off', !WS.shown || !chat || (wide && innerWidth < 900));   // 工作区悬浮，不再挤对话列，窄一些的窗口也能开
    document.documentElement.style.setProperty('--sbw', Math.max(200, Math.min(520, Prefs.sbW || 252)) + 'px');
    document.documentElement.style.setProperty('--dockw', Math.max(260, Math.min(520, Prefs.dockW || 300)) + 'px');
    $('#dockbtn')?.classList.toggle('on', wide ? Dock.open : !!Dock.mOpen);
    Dock.render(); WS.render();
  },
  sbGrip() {
    const g = $('#sbgrip'); if (!g) return;
    g.addEventListener('dblclick', () => { Prefs.sbW = 252; savePrefs(); this.layout(); });
    g.addEventListener('pointerdown', e => {
      if (isMob()) return;
      e.preventDefault(); g.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = Prefs.sbW || 252; document.body.classList.add('resizing');
      const mv = ev => { Prefs.sbW = Math.max(200, Math.min(520, w0 + (ev.clientX - x0))); document.documentElement.style.setProperty('--sbw', Prefs.sbW + 'px'); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); savePrefs(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  },
  toggleSidebar() { Prefs.sbOff = !Prefs.sbOff; savePrefs(); this.layout(); },
  grip() {
    const g = $('#dockgrip'); if (!g) return;
    g.addEventListener('pointerdown', e => {
      e.preventDefault(); g.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = Prefs.dockW || 300; document.body.classList.add('resizing');
      const mv = ev => { Prefs.dockW = Math.max(260, Math.min(520, w0 + (x0 - ev.clientX))); document.documentElement.style.setProperty('--dockw', Prefs.dockW + 'px'); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); savePrefs(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  },
  applyTheme() { const dark = Prefs.theme === 'dark' || (Prefs.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; const tb = $('#themebtn'); if (tb) tb.replaceChildren(icon(dark ? 'sun' : 'moon')); try { Palette.apply(); } catch {} this.paintThemeSeg?.(); setTimeout(() => Chrome.apply(), 0); },
  // 主题：一个按钮，点一下轮流切换 跟随系统 → 浅色 → 深色（手机在侧栏顶部 logo 右边；默认跟随系统）
  THEMES: [['auto', 'halfc', '跟随'], ['light', 'sun', '浅色'], ['dark', 'moon', '深色']],
  themeSeg() {
    const btn = h('button', { type: 'button', class: 'on', title: '主题', 'aria-label': '主题', onclick: () => {
      const L = this.THEMES, i = L.findIndex(x => x[0] === this.themeKey()), n = L[(i + 1) % L.length];
      Prefs.theme = n[0]; savePrefs(); this.applyTheme();
      try { if (isMob()) Mob.hint('主题：' + (n[0] === 'auto' ? '跟随系统' : n[2])); } catch {}
    } });
    const seg = h('div', { class: 'thseg nodrag', id: 'thseg' }, btn);
    return seg;
  },
  themeKey() { return ['light', 'dark'].includes(Prefs.theme) ? Prefs.theme : 'auto'; },
  // 主题按钮旁边：一键删除本账号所有已归档的对话（先统计数量，确认后批量删除）
  // 电脑：整个顶栏（logo、主题 / 归档 / 删除按钮、标签栏两边的按钮）都能按住拖动窗口。
  // 空白处走系统拖动区域；按钮上按下后移动超过 6px 就改成移动窗口（松手那一下不算点击），不动就是正常点击。标签自己由 TabPress 处理。
  dragBar() {
    if (Host.platform !== 'desktop' || typeof Host.winDrag !== 'function') return;
    let st = null;
    const end = () => {
      if (!st) return; const s0 = st; st = null;
      try { s0.el.releasePointerCapture?.(s0.pid); } catch {}
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', end, true); removeEventListener('blur', end);
      if (s0.on) { Host.winDrag('end')?.catch?.(() => {}); document.body.classList.remove('wdrag'); }
      return s0;
    };
    const mv = e => { if (!st) return; if (!e.buttons) { up(); return; } if (st.on) return; if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) { st.on = true; document.body.classList.add('wdrag'); Host.winDrag('start')?.catch?.(() => {}); } };
    const up = () => {
      const s0 = end(); if (!s0?.on) return;
      const kill = ev => { ev.stopPropagation(); ev.preventDefault(); };
      addEventListener('click', kill, true); setTimeout(() => removeEventListener('click', kill, true), 80);
    };
    const down = e => {
      if (e.button !== 0 || e.pointerType === 'touch' || isMob() || st) return;
      const t = e.target;
      if (!(t instanceof Element) || t.closest('.tab, input, textarea, select, [contenteditable], .menu, .dlg-back, #sbgrip')) return;
      st = { x: e.clientX, y: e.clientY, on: false, el: t, pid: e.pointerId };
      try { t.setPointerCapture(e.pointerId); } catch {}
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', end, true); addEventListener('blur', end);
    };
    for (const z of [$('#sb .sb-top'), $('#tabs')]) z?.addEventListener('pointerdown', down);
  },
  // 左上角：一键归档（按归档黑名单关键词）+ 删除归档（按厂商选）；跑的时候按钮上显示进度
  archDelBtn() {
    const al = h('span', { class: 'sr-only', hidden: true }, ''), dl = h('span', { class: 'sr-only', hidden: true }, '');
    const tb = h('button', { type: 'button', class: 'on icon-only mob-thm-btn', id: 'thbtn-mob', title: '切换主题', 'aria-label': '切换主题', onclick: () => {
      const L = this.THEMES, i = L.findIndex(x => x[0] === this.themeKey()), n = L[(i + 1) % L.length];
      Prefs.theme = n[0]; savePrefs(); this.applyTheme();
      try { if (isMob()) Mob.hint('主题：' + (n[0] === 'auto' ? '跟随系统' : n[2])); } catch {}
    } }, icon('halfc'));
    const ab = h('button', { type: 'button', class: 'on icon-only', title: '一键归档：名称含归档黑名单关键词的对话全部归档', 'aria-label': '一键归档', onclick: () => Bulk.archBl() }, icon('archive'), al);
    const db = h('button', { type: 'button', class: 'on icon-only', title: '删除已归档的对话（按厂商选择）', 'aria-label': '删除归档', onclick: () => Bulk.delArchived() }, icon('trash'), dl);
    this.adLab = { arch: al, del: dl }; this.adPaintBtn?.();
    return h('div', { class: 'thseg arseg nodrag' }, tb, ab, db);
  },
  delArchived() { return Bulk.delArchived(); },
  get ad() { return Bulk.running('del'); },
  adStart(ids, resumed) { return Bulk.start('del', ids, resumed); },
  adDialog() { Bulk.dialog('del'); },
  adPaintBtn() {
    const L = this.adLab; if (!L) return;
    for (const kind of ['arch', 'del']) {
      const q = Bulk.running(kind), lab = L[kind], K = Bulk.K[kind]; if (!lab) continue;
      const btn = lab.parentElement;
      const pct = q && q.total > 0 ? Math.min(100, Math.round(((q.done + q.fail) / q.total) * 100)) : 0;
      lab.textContent = '';
      btn?.classList.toggle('bj-run', !!q);
      if (btn) {
        if (q) btn.style.setProperty('--bj-pct', pct + '%');
        else btn.style.removeProperty('--bj-pct');
        btn.setAttribute('title', q ? '正在' + K.verb + ' ' + (q.done + q.fail) + '/' + q.total + ' (' + pct + '%)' + (q.until > now() ? ' · 等待限流解除' : '') + '，点开查看进度' : kind === 'arch' ? '一键归档：名称含归档黑名单关键词的对话全部归档' : '删除已归档的对话（按厂商选择）');
      }
    }
  },
  paintThemeSeg() {
    const L = this.THEMES, i = L.findIndex(x => x[0] === this.themeKey()), [k, ic, lab] = L[i], nx = L[(i + 1) % L.length];
    const ttl = '主题：' + (k === 'auto' ? '跟随系统' : lab) + '（点一下切换为' + (nx[0] === 'auto' ? '跟随系统' : nx[2]) + '）';
    document.querySelectorAll('#thseg button').forEach(b => { b.dataset.k = k; b.replaceChildren(icon(ic), h('span', {}, lab)); b.title = ttl; });
    document.querySelectorAll('#thbtn-mob').forEach(b => { b.dataset.k = k; b.replaceChildren(icon(ic)); b.title = ttl; });
  },
  closeDrawer() { document.body.classList.remove('drawer'); if (Dock.mOpen) { Dock.mOpen = false; this.layout(); } },
  keys(e) {
    if(e.key==='Escape'&&CardSelect.mode&&!document.querySelector('.dlg-back:not(.anc-gh),.modal-back:not(.anc-gh),.menu:not(.anc-gh)')){CardSelect.clear();this.renderList();return;}
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); Tabs.newChat(); }
    else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); Tabs.openGacha(); }
    else if (e.ctrlKey && e.altKey && /^Digit[1-9]$/.test(e.code)) { e.preventDefault(); this.switchNth(+e.code.slice(5)); }
    else if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); if (Tabs.active) Tabs.close(Tabs.active); }
    else if (mod && e.key === 'Tab') { e.preventDefault(); Tabs.cycle(e.shiftKey ? -1 : 1); }
    else if (mod && /^[1-9]$/.test(e.key)) { const t = Tabs.list[+e.key - 1]; if (t) { e.preventDefault(); Tabs.focus(t.key); } }
    else if (e.key === 'Escape') {
      const ms = document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)'); ms.forEach(m => m.remove());
      // 没有菜单、没有对话框时 Esc 关最上面的弹窗（正在输入框里打字时不关，免得丢掉填了一半的内容）
      if (!ms.length && !document.querySelector('.dlg-back:not(.anc-gh)')) {
        const all = document.querySelectorAll('.modal-back:not(.anc-gh):not(.out)'), m = all[all.length - 1], a = document.activeElement;
        if (m && !m.dataset.busy && !(a && m.contains(a) && a.matches('input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable]'))) {
          const b = [...m.querySelectorAll('.modal-f button, .modal-h button')].find(x => /^(取消|关闭|完成|×)$/.test(x.textContent.trim()) || x.classList.contains('x'));
          if (b) b.click(); else m.remove();
        }
      }
    }
  },

  // ----- 账号区 -----
  renderAcct() {
    const a = this.host?.account || {}, me = this.me, cur = typeof Bar !== 'undefined' ? Bar.cur : null;
    const email = a.email || me?.email || cur?.email || '';
    // 头像 = 余额饼图、第二行 = 备注 + 余额：由 Bar.paintCard 画（余额变化时跟着底栏一起刷新）
    $('#acct .acct-n').textContent = email ? emailUser({ email }) : (a.name || cur?.name || 'Brana');
    Bar.render();
  },
  renderPulse() { Bar.render(); },
  renderGachaBadge() {
    document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => GPop.paint(b));
    Bar.render();
    if (Tabs.list.some(t => t.kind === 'gacha')) { clearTimeout(this.gtT); this.gtT = setTimeout(() => this.renderTabs(), 120); }
  },
  settings() {
    const back = h('div', { class: 'modal-back' });
    const chk = (k, label, desc) => h('label', { class: 'set' }, h('input', { type: 'checkbox', checked: Prefs[k] || null, onchange: e => { Prefs[k] = e.target.checked; savePrefs(); } }), h('span', {}, h('b', {}, label), desc ? h('small', {}, desc) : null));
    const theme = h('select', { onchange: e => { Prefs.theme = e.target.value; savePrefs(); this.applyTheme(); } }, ...[['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => h('option', { value: v, selected: Prefs.theme === v || null }, l)));
    back.append(h('div', { class: 'modal' }, h('div', { class: 'modal-h' }, '设置'),
      h('div', { class: 'modal-b' },
        chk('autoTitle', '口令加密同步会话名', '云端固定 100 字符口令编码；同一口令恢复型号、匹配权重、分数、平均耗时和时间，备注和收藏一并加密同步（Qx 格式）；两端需新版'),
        TitleSync.row('set'),
        chk('enterSend', 'Enter 发送', '关闭后 Ctrl+Enter 发送，Enter 换行'),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '会话标签上限'), h('small', {}, '顶部标签栏最多保留最近交流的对话数量（默认 6 个，按最近对话时间排序，新开标签自动淘汰最旧标签）')),
          h('input', { type: 'number', min: 1, max: 20, value: Tabs.maxCount(), style: { width: '64px', textAlign: 'center' }, onchange: e => { const v = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 6)); Prefs.maxTabs = v; e.target.value = v; savePrefs(); Tabs.enforceLimit(Tabs.active); Tabs.save(); this.renderTabs(); } })),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '账号状态检测间隔（小时）'), h('small', {}, '每次打开客户端及每隔指定小时自动检测全部账号可用状态（默认 6 小时，0 表示仅启动时检测；异常卡片标红）')),
          h('input', { type: 'number', min: 0, max: 168, step: 0.5, value: Number.isFinite(Number(Prefs.acctCheckHours)) ? Number(Prefs.acctCheckHours) : 6, style: { width: '68px', textAlign: 'center' }, onchange: e => { const raw = parseFloat(e.target.value); const v = Number.isFinite(raw) ? Math.max(0, Math.min(168, raw)) : 6; Prefs.acctCheckHours = v; e.target.value = v; savePrefs(); Bus.emit('prefs'); if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(false); } })),
        (() => {
          const dplNote = h('small', {}, '手动输入并锁定 /cost 账单接口的 Vercel 部署编号（dpl_…，支持直接粘贴含 dpl_ 的链接）。当前生效：' + Pin.dpl() + (Pin.lockedDpl() ? '（已手动锁定）' : '（默认在线部署）'));
          const dplInput = h('input', { type: 'text', class: 'dk-pin-id', value: Pin.lockedDpl() || Pin.dpl(), spellcheck: 'false', placeholder: 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', style: { width: '240px', fontFamily: 'var(--mono)' } });
          const applyLock = raw => {
            const res = Pin.lockCostDpl(raw);
            if (!res.ok) { toast(res.error || '部署编号格式不对（dpl_ 开头）', 'err'); dplInput.value = Pin.dpl(); return; }
            dplInput.value = res.dpl;
            dplNote.textContent = '手动输入并锁定 /cost 账单接口的 Vercel 部署编号（dpl_…，支持直接粘贴含 dpl_ 的链接）。当前生效：' + Pin.dpl() + (Pin.lockedDpl() ? '（已手动锁定）' : '（默认在线部署）');
            toast(res.locked ? '已手动锁定计费部署：' + res.dpl : '已恢复默认计费部署：' + res.dpl, 'ok');
            try { Dock.render?.(); } catch {}
          };
          dplInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); applyLock(dplInput.value); } };
          return h('div', { class: 'set' },
            h('span', {}, h('b', {}, '计费接口部署锁定（/cost）'), dplNote),
            h('div', { class: 'set-btns', style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              dplInput,
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => applyLock(dplInput.value) }, '锁定'),
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => applyLock('') }, '默认')));
        })(),
        h('label', { class: 'set' }, h('input', { type: 'checkbox', checked: Prefs.notify !== false || null, onchange: e => { Prefs.notify = e.target.checked; savePrefs(); if (e.target.checked) Host.notifyPerm?.(true)?.catch?.(() => {}); } }), h('span', {}, h('b', {}, '任务完成通知'), h('small', {}, 'App 在后台时，对话回复完成 / 等待你回答 / 出错时弹系统通知，点通知直接打开那个对话；抽卡（包括抽到金色）不通知'))),
        h('div', { class: 'set' }, h('span', {}, h('b', {}, '金色'), h('small', {}, Gold.manual ? '手动点亮：已点亮 ' + (Prefs.goldSet || []).length + ' 个型号（金色 + 侧栏置顶）' : '自动：最高版本里最强的一档；可改为手动打勾点亮')), h('button', { class: 'btn ghost sm', onclick: () => { back.remove(); GoldBoard.open(); } }, '设置')),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '主题')), theme),
        AutoRoute.adapter ? AutoRoute.row() : null,
        Update.row('set'),
        Cap.row('set'),
        h('div', { class: 'set' }, h('span', {}, h('b', {}, 'ProxyIP 列表'), h('small', {}, '按地区的出口 IP · 纯净度自动过滤 · 429 自动换 IP')), h('button', { class: 'btn ghost sm', onclick: () => { back.remove(); ProxySet.open(); } }, icon('globe'), '打开')),
        (()=>{const info=h('small',{},'Google / 人机验证与 Brana 共用账号代理，禁用本机绕行与 WebRTC。');
          Host.info().then(r=>{const p=r?.privacy||{},expected=r?.account?.region||'';info.textContent='Google / 人机验证共用账号代理（最终公网出口仍取决于节点服务端）。'+(p.blocked?'当前网络已阻断。':'')+'时区：'+(p.timezone||currentTimezone())+' · 语言：'+(p.locale||navigator.language)+'。'+(p.warning||'')+(expected&&IP.loc&&expected!==IP.loc?' ⚠ 实测出口 '+IP.loc+' 与绑定地区 '+expected+' 不符，请核查线路。':'')+' 手动打开的系统浏览器不在保护范围；安卓全局 DNS / 出口保护需配合系统 VPN-TUN。';}).catch(()=>{});
          return h('div',{class:'set'},h('span',{},h('b',{},'统一出口与隐私保护'),info));})(),
        h('label', { class: 'set' }, h('span', {}, h('b', {}, '人机验证语言', tipI('只改人机验证弹窗（reCAPTCHA 勾选框 / 图片题）的文字语言。\n不改浏览器语言、时区、Accept-Language，也不影响后台静默验证（v3）；指纹和环境不变。\n「跟随系统」= 和以前一样（推荐，语言与环境保持一致）。'))),
          h('select', { onchange: e => { Prefs.rcLang = e.target.value; savePrefs(); } }, ...Recaptcha.LANGS.map(([v, l]) => h('option', { value: v, selected: (Prefs.rcLang || '') === v || null }, l)))),
        Host.bgStatus ? (() => {
          // 安卓：后台运行状态（前台服务 / 电池优化）+ 去系统设置里放开
          const sm = h('small', {}, '检查中…');
          const upd = () => Host.bgStatus().then(r => { if (!r) { sm.textContent = '需要更新 App'; return; } sm.textContent = (r.service ? '服务运行中' : '服务未运行') + ' · 电池优化：' + (r.battery ? '已放开' : '未放开（熄屏后可能暂停）') + ' · ' + String(r.text || '').replace(/^后台/, '') + '。小米等机型另需开「自启动」和「省电策略：无限制」'; }).catch(() => {});
          upd(); const iv = setInterval(() => { if (!sm.isConnected) clearInterval(iv); else upd(); }, 3000);
          return h('div', { class: 'set' }, h('span', {}, h('b', {}, '后台运行'), sm), h('div', { class: 'set-btns' }, h('button', { class: 'btn ghost sm', onclick: () => Host.bgAllow('battery') }, '电池优化'), h('button', { class: 'btn ghost sm', onclick: () => Host.bgAllow('autostart') }, '自启动')));
        })() : null,
        h('p', { class: 'dim' }, `Brana AI v${VERSION} · ${Host.platform} · 所有请求直接发往 arena.ai 接口，不加载 Brana 网页。`)),
      h('div', { class: 'modal-f' }, h('button', { class: 'btn', onclick: () => back.remove() }, '完成'))));
    document.body.append(back);
  },

  // ----- 侧栏列表 -----
  searchListSoon() {
    clearTimeout(this.searchListT);this.searchListT=0;SideTools.filter(($('#q').value||'').trim().toLowerCase(),Prefs.vf||'');SideTools.paintToolbar();SideTools.searchOn();
    if(SideTools.rows().length<300){this.renderList();return;}
    this.searchListT=setTimeout(()=>{this.searchListT=0;this.renderList();},80);
  },
  renderList() {
    clearTimeout(this.searchListT);this.searchListT=0;
    if(document.hidden){this.listDirty=true;return;}
    const box = $('#list'); if (!box) return;
    if (!box.__pull) { box.__pull = 1; ListPull.bind(box); }
    this.listDirty = false; SideTools.ensure();
    const q = ($('#q').value || '').trim().toLowerCase();
    const cur = Tabs.cur?.sid, vf = Prefs.vf || '';
    const vidOf = e => Brand.of(Models.get(e.id)?.name) || Brand.of(e.title) || '';
    SideTools.filter(q,vf);
    const archived=SideTools.scope==='archived';
    let items = SideTools.rows().filter(e => SideTools.matches(e,q));
    if (vf) items = items.filter(e => (vidOf(e) || 'other') === vf);
    // 增量更新：内容没变的卡片直接复用原来的 DOM 节点，只插入 / 移动 / 删除有变化的，流式回复时侧栏不再整块重建
    const frag = { list: [], append(...n) { this.list.push(...n); }, prepend(n) { this.list.unshift(n); } };
    const old = this._cards || new Map(); this._cards = new Map();
    this._cardOld = old;
    if (vf) frag.append(h('button', { class: 'vfbar', title: '点一下显示全部', onclick: () => { Prefs.vf = ''; savePrefs(); this.renderList(); } }, VIcon.el(vf, 12), '只看 ' + (Brand.NAME[vf] || vf), h('span', { class: 'grow' }), icon('x')));
    if (!archived && History.retrying) frag.prepend(h('div', { class: 'lnote', role: 'status' }, h('i', { class: 'spin' }), '列表刷新较慢，正在自动重试…'));
    else if (!archived && History.err && History.items.length && (History.limited() || History.errKind === 'limit')) { const left = Math.max(0, Math.ceil((Math.max(History.retryAt || 0, ReadLimit.until || 0) - now()) / 1000)); frag.prepend(h('div', { class: 'lnote', role: 'status', title: History.err }, left ? '列表暂缓刷新：服务器限流冷却中，约 ' + left + ' 秒后自动更新（不影响对话）' : '列表稍后自动更新（不影响对话）')); }
    else if (!archived && History.err) { const retry = h('button', { class: 'btn ghost sm', onclick: async () => { retry.disabled = true; retry.textContent = '刷新中…'; await History.refresh(); if (!History.err) await History.loadAll(); } }, '刷新重试'); frag.prepend(h('div', { class: History.items.length ? 'lnote bad' : 'empty', role: 'status' }, (History.items.length ? '列表刷新失败（已显示本地列表，稍后自动重试）：' : '') + History.err, retry)); }
    const groups=Side.build(items);CardSelect.reconcile(groups.flatMap(g=>g.rows.map(r=>r.e.id)));
    for (const g of groups) {
      if (g.group && g.rows.length && !g.pinned) { const k = 'g|' + (g.fav ? '\u2605fav' : g.group); const el = (!this._cards.has(k) && old.get(k)?.el) || h('div', { class: 'lgroup' + (g.gold ? ' gold' : '') + (g.fav ? ' fav' : '') }, g.gold || g.fav ? '★ ' + g.group : g.group); this._cards.set(k, { el }); frag.append(el); }
      for (const r of g.rows) {
        // 型号组之间一条细线（第一张卡上面不画）
        if (r.gStart && frag.list.some(x => x?.dataset?.sid !== undefined)) { const k = 'm|' + r.e.id; const el = (!this._cards.has(k) && old.get(k)?.el) || h('div', { class: 'mline', role: 'separator' }); this._cards.set(k, { el }); frag.append(el); }
        frag.append(this.card(r, cur));
      }
    }
    if (archived) {
      const a=ArchiveHistory;
      frag.prepend(h('div',{class:'archive-status'},h('span',{role:'status'},a.loading?'正在检索归档 · 已加载 '+a.items.length+' 条':a.error||('归档 · '+items.length+' 个结果'+(a.hasMore?'（尚未全部加载）':''))),h('button',{class:'ib',title:'刷新归档',disabled:a.loading,onclick:()=>void a.load(true)},icon('refresh'))));
      if(!items.length&&!a.loading)frag.append(h('div',{class:'empty'},a.error?'读取失败，可点击刷新重试':q?'没有匹配的归档对话':'暂无归档对话'));
      if(a.hasMore&&!a.loading&&!a.error)frag.append(h('button',{class:'btn ghost',onclick:()=>void a.load()},'继续加载归档'));
    }
    if (!archived && History.fullLoading) frag.prepend(h('div', { class: 'lfull' }, h('i', { class: 'spin' }), '正在拉取全部历史 · 已 ' + History.items.length + ' 条，拉完后统一排序'));
    else if (!archived && History.loading) frag.append(h('div', { class: 'empty' }, '加载中…'));
    patchKids(box, frag.list);
    this._cardOld = null; SideTools.paintToolbar();
  },
  // 切换窗口时立刻把侧栏「当前对话」高亮挪过去：真正的重绘（renderList）手机上要等抽屉打开才画，这一步不依赖它
  markCur() {
    const box = $('#list'); if (!box) return; const sid = Tabs.cur?.kind ? null : Tabs.cur?.sid;
    for (const c of box.children) if (c.dataset?.sid !== undefined) c.classList.toggle('on', !!sid && c.dataset.sid === sid);
  },
  // 侧栏卡片（油猴格式）：logo 圆 · 型号短名 + 备注（小字、不加粗）· 右侧 MM-DD HH:MM；进行中 logo 顺时针转，出错红、完成绿
  card(r, cur) {
    if (r.e?._pending) return h('div', { class: 'card pending gstep-card', role: 'status', title: '抽卡：正在创建对话（reCAPTCHA + 服务器创建），拿到 ID 后自动替换' }, h('i', { class: 'spin' }), h('span', { class: 'grow' }, r.e.title), h('span', { class: 'gstep-tag' }, '建连'), h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: '12%' } })));
    const e = r.e, c = Chats.get(e.id), v = Titles.view(e.id, e.title), mi = Models.get(e.id);
    const shown = cardName(v.model || v.plain) || '未命名', note = v.note;
    const at = entAt(e);
    const d = new Date(at), tm = Number.isFinite(at) ? pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
    const gstep0 = typeof Gacha !== 'undefined' && Gacha.stepOf ? Gacha.stepOf(e.id) : null;
    const hasKnownModel = !!(r.vid || v.vid || (v.model && !/^(未识别|未知型号|待定)$/.test(String(v.model).trim())) || (mi?.name && !/^(未识别|未知型号|待定)$/.test(String(mi.name).trim()) && !mi?.pendingConfirm));
    const identSt = (!gstep0 && !hasKnownModel && typeof BillingProbe !== 'undefined' && BillingProbe.identStatus) ? BillingProbe.identStatus(e.id, mi) : null;
    const gstep = gstep0 || identSt;
    const isRunStep = !!(c?.busy || gstep0?.active || identSt?.status === 'running');
    const on = e.id === cur, st = isRunStep ? 'run' : c && chatState(c) === 'bad' ? 'bad' : '';
    const topConfSig = typeof BillingProbe !== 'undefined' && BillingProbe.topConfidence ? BillingProbe.topConfidence(e.id, mi) : null;
    const goldChat = typeof Gold !== 'undefined' && typeof Gold.hasChat === 'function' ? Gold.hasChat(e.id) : false;
    const sig = [CardSelect.mode,CardSelect.ids.has(e.id),SideTools.scope,on, !!c?.busy, st, gstep?.text || '', gstep?.pct || 0, gstep?.status || '', r.vip, r.hit, r.tint, r.vid || v.vid, shown, note, tm, v.title, mi?.name, mi?.routed, mi?.reverseMatch, mi?.reverseScore, mi?.confidence, topConfSig, e.title, e.updatedAt, Fav.has(e.id), goldChat, mi?.fingerprint?.thinkSec, mi?.fingerprint?.reasoning?.score].join('\u0001');
    if (this._cards?.has(e.id)) return this.cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep });   // 同一会话出现两次（分页重叠）：第二个单独建
    const prev = this._cardOld?.get(e.id);
    if (prev && prev.sig === sig) { this._cards?.set(e.id, prev); return prev.el; }
    const el = this.cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep });
    this._cards?.set(e.id, { sig, el });
    return el;
  },
  // 卡片指标：联合识别排名置信度百分比（决定背景填充长度 --cp）/ 推理分 / 思考时长（悬停小字）
  cardMetrics(shown, mi, sid) {
    const p = typeof ConversationLabels !== 'undefined' ? ConversationLabels.parse(shown) : null;
    const fd = mi?.fingerprint && typeof ConversationLabels !== 'undefined' ? ConversationLabels.fingerprintData(mi) : null;
    const fpPct = fd?.confidence != null ? (fd.confidence <= 1 ? fd.confidence * 100 : +fd.confidence) : null;
    const revRaw = Number.isFinite(+mi?.reverseMatch) ? +mi.reverseMatch : (Number.isFinite(+mi?.confidence) ? +mi.confidence : null);
    const revPct = revRaw != null && revRaw > 0 ? (revRaw <= 1 ? revRaw * 100 : revRaw) : null;
    let liveTop = null;
    try {
      if (typeof BillingProbe !== 'undefined' && BillingProbe.topConfidence) {
        const tc = BillingProbe.topConfidence(sid || mi?.sid, mi);
        if (Number.isFinite(tc) && tc > 0) liveTop = tc;
      }
    } catch {}
    const mergedPcts = [liveTop, revPct, fpPct].filter(x => Number.isFinite(x) && x > 0);
    const pct = mergedPcts.length
      ? Math.max(...mergedPcts)
      : (mi?.fingerprint ? null : (p?.confidence != null ? +p.confidence : null));
    const conf = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    const score = (mi?.routed && Number.isFinite(mi?.reverseScore))
      ? mi.reverseScore
      : (mi?.fingerprint ? (Number.isFinite(fd?.score) ? fd.score : null) : (Number.isFinite(mi?.reverseScore) ? mi.reverseScore : (Number.isFinite(p?.score) ? p.score : null)));
    const think = !mi?.fingerprint?.skipped && Number.isFinite(mi?.fingerprint?.thinkSec) ? mi.fingerprint.thinkSec : null;
    const bits = [];
    if (conf != null) bits.push('置信度 ' + +conf.toFixed(1) + '%');
    if (score != null) bits.push('推理分 ' + +score.toFixed(1)); else if (mi?.fingerprint && !mi.fingerprint.skipped && fpPct != null) bits.push('未测');
    if (think != null) bits.push('思考 ' + think + 's');
    return { conf, tip: bits.join(' · ') };
  },
  cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep }) {
    const cm = this.cardMetrics(shown, mi, e.id);
    return h('div', { 'data-sid':e.id, role:'option', 'aria-selected':String(CardSelect.ids.has(e.id)), tabindex:'0', class: 'card' + (CardSelect.ids.has(e.id)?' selected':'') + (CardSelect.mode?' selecting':'') + (on ? ' on' : '') + ((c?.busy || gstep?.active) ? ' busy' : '') + (gstep?.active ? ' gstep-card' : '') + (r.vip ? ' vip' : r.hit ? ' hit' : '') + (Fav.has(e.id) ? ' fv' : '') + (cm.conf != null ? ' cf' : ''), style: r.tint || cm.conf != null ? { ...(r.tint ? { '--tint': r.tint } : {}), ...(cm.conf != null ? { '--cp': cm.conf + '%' } : {}) } : null, title: [v.title, mi?.fingerprint ? Fingerprint.details(mi) : '', mi?.name && mi.name !== v.model ? '型号：' + mi.name : '', note ? '备注：' + note : ''].filter(Boolean).join('\n'),
      onmousedown: ev=>{if(ev.ctrlKey||ev.metaKey||ev.shiftKey)ev.preventDefault();},
      onkeydown:ev=>{if(ev.target!==ev.currentTarget)return;if(ev.key===' '){ev.preventDefault();CardSelect.toggle(e.id);this.renderList();}else if(ev.key==='Enter'){ev.preventDefault();ev.currentTarget.click();}},
      onclick: ev => { if (ev.target.closest('.more,.card-check')) return; if(CardSelect.click(e.id,ev)){ev.preventDefault();this.renderList();return;} this.saveScroll(); Tabs.open(e.id, { title: e.title }); this.closeDrawer(); },
      onmouseenter: () => { if(CardSelect.mode)return; clearTimeout(this._pfT); this._pfT = setTimeout(() => { try { chatOf(e.id).prefetch(); } catch {} }, 400); },
      onmouseleave: () => clearTimeout(this._pfT),
      onauxclick: ev => { if (ev.button === 1) Tabs.open(e.id, { focus: false, title: e.title }); },
      oncontextmenu: ev => { ev.preventDefault(); this.itemMenu(ev, e); } },
      r.vid || v.vid ? stLogo(r.vid || v.vid, 16, st) : st === 'run' ? h('span', { class: 'vlogo busy' }, h('i', { class: 'spin' })) : h('span', { class: 'vlogo none' + (st ? ' st-' + st : '') }, (shown[0] || '?').toUpperCase()),
      h('span', { class: 'cn' }, ...[].concat(metricName(shown, undefined, true))),
      Fav.has(e.id) ? h('span', { class: 'cfav', title: '已收藏' }, '★') : null,
      gstep?.active ? h('span', { class: 'gstep-tag' + (gstep.status === 'queued' ? ' ident-queue' : gstep.status === 'pending' ? ' ident-wait' : gstep.status === 'running' ? ' ident-run' : ''), title: gstep.phase || gstep.text }, gstep.text) : (cm.tip ? h('span', { class: 'cstat' }, cm.tip) : null),
      // 电脑上和原来一样排成一行（外层不占布局）；手机上备注在上、时间在下，靠右对齐
      h('span', { class: 'cside' }, note ? h('span', { class: 'cnote' }, note) : null, h('span', { class: 'ctime' }, tm)),
      h('a', { href: '/agent/' + e.id, 'data-sidebar': 'menu-button', class: 'ext-sb-link', tabindex: '-1', onclick: ev => { ev.preventDefault(); } }, h('span', { class: 'truncate' }, e.title || shown)),
      h('button', { class: 'more', onclick: ev => { ev.stopPropagation(); this.itemMenu(ev, e); } }, icon('dots')),
      gstep?.active ? h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: gstep.pct + '%' } })) : null);
  },
  async editNote(e) {
    const v = Titles.view(e.id, e.title);
    const t = await Dialog.ask({ title: '备注', value: Notes.get(e.id), placeholder: '例：脚本修改', hint: '备注和收藏随口令加密的 100 字符标题跨端同步（Qx 格式，最多 59 个字）。显示在型号名后面；留空删除备注。'+(Notes.all[e.id]?.legacyNote&&Notes.all[e.id].legacyNote!==Notes.get(e.id)?' 旧版云端备注备份：'+Notes.all[e.id].legacyNote:''), max: 59,
      extra: val => '会话名：' + (Titles.model(e.id) || v.model || '未识别') + '/' + noteFmt((Notes.all[e.id]?.t) || Date.parse(String(e.updatedAt || '').replace(' ', 'T').replace(/\+00$/, 'Z')) || now()) + (val.trim() ? '/' + val.trim().replace(/\s+/g, ' ') : '') });
    if (t === null) return;
    const saved=Notes.set(e.id,t);toast(saved?(t.trim()?'备注已保存，后台加密同步到云端标题':'备注已清空，后台同步'):'备注仅在当前窗口，尚未写入本机，请勿关闭',saved?'':'err');
  },
  itemMenu(ev, e) {
    ev.stopPropagation(); document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
    const r = ev.type === 'contextmenu' ? { left: ev.clientX, bottom: ev.clientY } : ev.currentTarget.getBoundingClientRect();
    const isGoldLegend = typeof Gold !== 'undefined' && typeof Gold.hasChat === 'function' && Gold.hasChat(e.id);
    const m = h('div', { class: 'menu', style: { left: Math.min(r.left, innerWidth - 190) + 'px', top: Math.min(r.bottom + 4, innerHeight - 250) + 'px' } },
      h('button', { onclick: () => { m.remove(); const on = Fav.toggle(e.id); toast(on ? '已收藏并标金（同步特殊前缀）' : '已取消收藏'); } }, h('span', { class: 'mfav' + (Fav.has(e.id) ? ' on' : '') }, Fav.has(e.id) ? '★' : '☆'), Fav.has(e.id) ? '取消收藏' : '收藏（标金）'),
      typeof Gold !== 'undefined' && typeof Gold.toggleChat === 'function'
        ? h('button', { onclick: () => { m.remove(); const on = Gold.toggleChat(e.id); toast(on ? '已标注为金色传说（同步特殊前缀）' : '已取消金色传说标记'); } }, h('span', { class: 'mfav' + (isGoldLegend ? ' on' : '') }, isGoldLegend ? '✦' : '✧'), isGoldLegend ? '取消金色传说' : '标注金色传说')
        : null,
      h('button', { onclick: () => { m.remove(); this.editNote(e); } }, icon('edit'), '备注'),
      h('button', { title: '电脑上也可以 Ctrl / Cmd 点击加选，Shift 点击连续选', onclick: () => { m.remove(); CardSelect.toggle(e.id); this.renderList(); } }, icon('check'), CardSelect.ids.has(e.id) ? '取消选择' : '选择（多选）'),
      h('button', { onclick: () => { m.remove(); Tabs.open(e.id, { focus: false, title: e.title }); } }, icon('plus'), '在新标签打开'),
      h('button', { onclick: () => { m.remove(); copyText('https://arena.ai/agent/' + e.id); } }, icon('copy'), '复制链接'),
      (e.isArchived || e.archivedAt || (typeof SideTools !== 'undefined' && SideTools.scope === 'archived'))
        ? h('button', { onclick: async () => { m.remove(); try { await History.unarchive(e.id); toast('已恢复到对话'); } catch (err) { toast('恢复失败：' + describe(err), 'err'); } } }, icon('refresh'), '恢复到对话')
        : h('button', { onclick: async () => { m.remove(); try { await History.archive(e.id); toast('已归档'); const t = Tabs.list.find(x => x.sid === e.id); if (t) Tabs.close(t.key); } catch (err) { toast('归档失败：' + describe(err), 'err'); } } }, icon('archive'), '归档'),
      h('button', { class: 'danger', onclick: () => { m.remove(); deleteChat(e); } }, icon('trash'), '删除（含本机记录）'));
    document.body.append(m);
    if (typeof placeInward === 'function') placeInward(m, ev.type === 'contextmenu' ? { left: ev.clientX, top: ev.clientY, right: ev.clientX, bottom: ev.clientY, width: 0, height: 0 } : r, { pad: 8, gap: 4 });
  },

  // ----- 标签栏 -----
  renderTabs() {
    if(document.hidden){this.tabsDirty=true;return;}this.tabsDirty=false;
    if (isMob()) Pager.ensureSoon(250);   // 窗口增减 / 顺序变了：相邻的预搭页跟着调整
    const box = $('#tablist'); if (!box) return;
    // 内容没变就不重建（流式回复时每帧都会调用这里）
    const tsig = Tabs.list.map(t => { if (t.kind === 'gacha') { const r = Gacha.run; return 'g' + (t.key === Tabs.active) + Gacha.busy() + (r ? r.completed + '/' + (r.settings?.endless ? '∞' : r.settings?.maxAttempts) : ''); } if (t.kind === 'power') return 'p' + (t.key === Tabs.active);
      const c = t.sid ? Chats.get(t.sid) : null, title = (t.sid && (History.byId(t.sid)?.title || c?.title)) || t.title || '', v = t.sid ? Titles.view(t.sid, title) : null;
      return [t.key, t.key === Tabs.active, chatState(c), title, v?.note, v?.model, v?.plain, v?.pendingConfirm, v?.time, v?.vid, Models.get(t.sid || '')?.name, Models.get(t.sid || '')?.pendingConfirm, Palette.chip(t)?.sig].join('\u0001'); }).join('\u0002') + '|' + (this.host?.account ? emailUser(this.host.account) : '') + '|' + (IP.ip || '');
    clearTimeout(this.barT); this.barT = setTimeout(() => Bar.render(), 200);
    if (!box.__lp) { box.__lp = 1; TabPress.bind(box); }
    if (tsig === this._tabSig && box.children.length) return;
    const activeChanged = this._tabAct !== Tabs.active; this._tabSig = tsig; this._tabAct = Tabs.active;
    const frag = document.createDocumentFragment();
    for (const t of Tabs.list) {
      if (t.kind === 'gacha') {
        const r = Gacha.run, busy = Gacha.busy(), lab = '抽卡' + (r ? ` ${r.completed}/${r.settings?.endless ? '∞' : r.settings?.maxAttempts}` : '');
        frag.append(h('div', { class: 'tab gtab' + (t.key === Tabs.active ? ' on' : '') + (busy ? ' busy' : ''), title: '抽卡', onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
          busy ? h('i', { class: 'spin' }) : icon('slot'), h('span', { class: 'tab-t' }, lab), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
        continue;
      }
      if (t.kind === 'power') {
        frag.append(h('div', { class: 'tab gtab' + (t.key === Tabs.active ? ' on' : ''), 'data-key': t.key, title: '推理分排行', onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
          icon('bolt'), h('span', { class: 'tab-t' }, '推理分排行'), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
        continue;
      }
      const c = t.sid ? Chats.get(t.sid) : null, mi = t.sid ? Models.get(t.sid) : null;
      const title = (t.sid && (History.byId(t.sid)?.title || c?.title)) || t.title || '新对话';
      t.title = title;
      // 标签：厂商图标 + 备注（有备注只显示备注）/ 型号全名（不写厂商名）；图标转 = 进行中，红 = 出错，绿 = 完成
      const v = t.sid ? Titles.view(t.sid, title) : null, st = chatState(c);
      const label = !t.sid ? '新对话' : v.note || (v.model ? tabName(v.model) : '') || v.plain || '对话';
      const tip = [label, v?.model && v.model !== label ? v.model : '', v?.time ? '最近对话 ' + v.time : '', st === 'run' ? '进行中' : st === 'bad' ? '出错了' : st === 'ok' ? '已完成' : ''].filter(Boolean).join('\n');
      const pc = Palette.chip(t);   // 每个窗口有自己的颜色：标签小卡片也用它，一眼能分清
      const isSel = t.key === Tabs.active;
      const hasLamp = isSel && !!t.sid;
      frag.append(h('div', { class: 'tab' + (isSel ? ' on' : '') + (hasLamp ? ' tab-lamp-on' : '') + (!t.sid ? ' tab-blank' : '') + (st ? ' st-' + st : '') + (pc ? ' tinted' : ''), style: pc ? { '--tc': pc.bg, '--tco': pc.on } : null, 'data-key': t.key, title: tip + (t.sid ? '\n长按 / 下拉：重新载入' : ''), onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
        !t.sid ? icon('plus', 'tab-new') : stLogo(v.vid, 15, st), h('span', { class: 'tab-t' }, ...[].concat(v?.note || !v?.model ? label : metricName(label))), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
    }
    box.replaceChildren(frag);
    if (activeChanged) box.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const cur = Tabs.cur, cv = cur?.sid ? Titles.view(cur.sid, cur.title) : null; Host.setTitle(`${cv ? (cv.note || tabName(cv.model) || cv.plain || 'Brana') : 'Brana'} · ${this.host?.account ? emailUser(this.host.account) : 'Brana'}${IP.ip ? ' · ' + IP.ip : ''}`);
  },

  // ----- 对话视图 -----
  saveScroll() { const sc = $('#view .scroller'), t = Tabs.cur; if (sc && t) this.scrolls.set(t.key, { top: sc.scrollTop, stick: sc.scrollTop + sc.clientHeight > sc.scrollHeight - 40 }); const ta = $('#view textarea'); if (ta && t) { t.draft = ta.value; Tabs.save(); } },
  showTab() {
    const t = Tabs.cur, prevKey = this.pane.key; let view = $('#view');
    // 手机：切换窗口不影响输入法。原来在打字（输入框有焦点）→ 焦点先交给一个看不见的占位输入框，换完页面再交回新输入框，
    // 输入法全程不收起、不跳；原来没在打字 → 切换后也不自动选中输入框（不弹输入法）
    const kbWas = isMob() && !!view && document.activeElement?.tagName === 'TEXTAREA' && view.contains(document.activeElement);
    if (kbWas) KB.hold();
    this.viewKey = t?.key; this.markCur(); this.renderListSoon?.();
    // 手机：左右相邻的窗口在后台预热，并搭成真正的页停在当前页下面（横向画卷）
    if (isMob() && t) { clearTimeout(this.warmT); this.warmT = setTimeout(() => { try { Warm.near(Warm.around(Tabs.active, 3).slice(1)); } catch {} }, 700); }
    GPop.close?.(); try { Palette.show(); } catch {}
    const sidNow = t && !t.kind ? t.sid : null; try { ExtCompat.syncUrl(sidNow); } catch {} if (WS.sid !== sidNow || !WS.data) WS.load(sidNow);
    setTimeout(() => { try { Sync.tick(); } catch {} }, 300);
    setTimeout(() => { try { const c = t?.sid && !t.kind ? Chats.get(t.sid) : null; if (c) { FingerprintReview.auto(c); FingerprintBatch.autoVerify?.(c); } } catch {} }, 1500);   // 切回一个已经读完的对话：没有指纹信息就按历史里的指纹测试自动校准
    setTimeout(() => { this.layout(); Bar.render(); }, 0);
    // 手机：目标窗口已经有搭好的页 → 只换角色（那一页拿走 id="view"，当前页退到旁边），不重建、不挪任何节点
    if (Pager.on() && t && prevKey !== t.key) {
      if (Pager.adopt(t, kbWas)) return;
      view = Pager.shelve(t) || view;
    }
    this.fillView(t, view, kbWas);
    Pager.ensureSoon();
  },
  // 把窗口 t 的完整页面搭进 view（当前页，或 side = 相邻的预搭页：由 withPane 切好 this.pane）
  fillView(t, view, kbWas, side) {
    const P = this.pane; P.resizeObserver?.disconnect();P.resizeObserver=null; P.key = t?.key || null; P.el = view; P.dirty = false;
    try { Palette.paintPage(view, t); } catch {}   // 手机：这一页自带自己窗口的颜色（滑动时各自带着颜色平移）
    // 每个标签的消息节点缓存保留（最近 6 个标签）：来回切换 / 左右滑动时不用重新渲染整串长对话
    { const TC = this.tabCaches ||= new Map(); let cc = t ? TC.get(t.key) : null; if (t) { TC.delete(t.key); if (!cc) cc = new Map(); TC.set(t.key, cc); } while (TC.size > 6) TC.delete(TC.keys().next().value); this.cache = cc || new Map(); }
    if (!t) { view.replaceChildren(); this.els = null; return; }
    if (t.kind === 'gacha') { this.els = null; PView.el = null; GView.mount(view); return; }
    if (!side) GView.el = null;
    if (t.kind === 'power') { this.els = null; PView.mount(view); return; }
    if (!side) PView.el = null;
    const chat = t.sid ? chatOf(t.sid) : null;
    const thread = h('div', { class: 'thread', 'data-agent-transcript-thread': 'true' });
    // 回到底部按钮（电脑 / 手机都有）：离底部超过大半屏时出现在输入框上方，点一下平滑滚到最新；有新内容时带个小点
    const toBot = h('button', { class: 'tobot', type: 'button', title: '回到底部', 'aria-label': '回到底部', onclick: () => { P.stick = true; scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }); toBot.classList.remove('show', 'new'); } }, icon('chev'));
    const scroller = h('div', { class: 'scroller', 'data-custom-scrollbar': 'true', role: 'log', 'aria-live': 'polite', onscroll: () => { const sc = scroller; P.stick = sc.scrollTop + sc.clientHeight > sc.scrollHeight - 60; this.paintToBot(false, P); if (chat && sc.scrollTop < 80 && chat.hasMore) chat.loadOlder(true); } }, thread);
    scroller.__reactFiber$extcompat = { memoizedProps: { get value() { const c = t?.sid ? Chats.get(t.sid) : null; return { id: c?.sid || '', status: !c ? 'ready' : c.busy ? 'streaming' : c.status === 'error' ? 'error' : 'ready', messages: c?.messages || [] }; } }, return: null };
    const head = h('div', { class: 'chead' });
    const errbar = h('div', { class: 'errbar' });
    const composer = this.composer(t, chat);
    composer.prepend(toBot);
    view.replaceChildren(head, scroller, errbar, composer);
    this.els = { head, scroller, thread, errbar, composer, chat, toBot };
    if (!chat) {
      thread.append(h('div', { class: 'hero' }, h('div', { class: 'hero-t' }, '有什么可以帮你？'), h('div', { class: 'hero-s' }, (this.host?.account ? emailUser(this.host.account) : '') + (IP.ip ? ' · 出口 ' + IP.ip + (IP.loc ? ' ' + ccF(IP.loc) : '') : '') + ' · 新对话随机分配模型')));
      head.append(h('div', { class: 'chead-t' }, '新对话'));
      if (!side) this.autoFocus(composer, kbWas);
      return;
    }
    // 可视高度变了（手机弹出输入法把输入框顶上去、输入框变高）：聊天内容跟着一起往上顶，保持底部对齐，不是原地不动被盖住
    { let lastH = 0; const ro = new ResizeObserver(() => { if (!scroller.isConnected) { ro.disconnect(); return; } const hh = scroller.clientHeight; if (lastH && hh && hh !== lastH) { if (P.stick !== false) scroller.scrollTop = scroller.scrollHeight; else scroller.scrollTop += lastH - hh; } if (hh) lastH = hh; }); ro.observe(scroller); P.resizeObserver=ro; }
    const sv = this.scrolls.get(t.key); P.stick = sv ? sv.stick : true;
    this.renderChat(chat, true);
    if (sv && !sv.stick) scroller.scrollTop = sv.top;
    if (!chat.loaded && !chat.loading) chat.load().catch(() => {}); else if (chat.loaded && !chat.loading) chat.quickSync?.();
    if (!side) this.autoFocus(composer, kbWas);
  },
  // 桌面：切换后自动聚焦输入框；手机：只有切换前就在打字才把焦点交回（不自己弹输入法）
  autoFocus(composer, kb) {
    const ta = composer.querySelector('textarea'); if (!ta) return;
    if (!isMob()) { setTimeout(() => ta.focus(), 0); return; }
    if (kb) { try { ta.focus({ preventScroll: true }); } catch { ta.focus(); } }
  },
  renderChat(chat, full) {
    const E = this.els; if (!E || E.chat !== chat) return;
    // 头部
    const mi = Models.get(chat.sid), v = Titles.view(chat.sid, chat.title), st = chatState(chat);
    const modelVersion=this.modelStamp(mi);
    const tip = [v.title, mi && [mi.internal && '内部：' + mi.internal, mi.request && '请求：' + mi.request, mi.provider && '提供方：' + mi.provider, mi.routed && 'Brana 已改派'].filter(Boolean).join('\n')].filter(Boolean).join('\n');
    // 打开对话后自动识别（不用手动点）：1 小时内有运行记录的，自动读取模型信息
    if (this.pane.el?.id === 'view' && chat.loaded && !chat.autoTried && chat.messages.some(m => m.role === 'assistant')) { chat.autoTried = true; setTimeout(() => AutoId.run(chat), 400); }
    const phase=ThinkingStatus.phase(chat);
    const hsig = [phase, chat.sid, typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat), PelicanTest.isRunning(chat), !!mi?.fingerprint, !!chat.probeNumbers?.length, FingerprintBatch.busy, !!chat.gacha, Fingerprint.isRunning(chat), chat.probeProgress, tip, v.vid, st, v.note, v.model, v.plain, v.time, mi?.routed, chat.identifying, !mi && chat.idErr, WS.shown, chat.busy, chat.phase, chat.sentAt].join('\u0001');
    if (E.hsig !== hsig) E.hsig = hsig, E.head.replaceChildren(...K(h('div', { class: 'chead-t', title: tip, 'aria-label': 'Session cumulative cost' }, stLogo(v.vid, 18, st), h('span', { class: 'chead-n' }, ...[].concat(v.note || metricName(v.model, cardName) || v.plain || '对话')), v.note && v.model ? h('span', { class: 'chead-md' }, '-', ...[].concat(metricName(v.model, cardName))) : null),
      window.__BRANA_BROWSE_MODE ? h('button', { type: 'button', class: 'badge warn browse-badge', title: '当前处于离线/免登查阅模式，点击返回登录或重连', onclick: () => { window.__BRANA_BROWSE_MODE = false; UI.loginGate('已退出查阅模式，请登录或刷新连接'); } }, '查阅模式 · 退出') : null,
      mi?.routed ? h('button', { type: 'button', class: 'badge warn route-warn-btn', title: mi?.lastRouteNotice?.text || tip || '检测到模型改派或强度削弱（点击查看详情）', 'aria-label': '改派详情', onclick: e => { e.stopPropagation(); toast(mi?.lastRouteNotice?.text || tip || '检测到模型改派或思考强度削弱', 'err'); } }, icon('alert')) : null,
      chat.identifying ? h('span', { class: 'badge dim' }, h('i', { class: 'spin' }), '识别模型…')
        : !mi && chat.idErr ? h('button', { class: 'badge dim link', title: chat.idErr + '（点一下重试）', onclick: () => chat.identifyOld() }, '未识别') : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'ib revbtn' + (typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? ' run' : ''), 'aria-label': typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '停止反推' : '费用反推', disabled: (chat.busy && !(typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat))) || PelicanTest.isRunning(chat), title: typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '停止反推识别' + (chat.probeProgress ? '（' + chat.probeProgress + '）' : '') : '反推识别：点一下读取账单与对话记录/工具调用，按最高置信度反推并锁定当前对话的真实模型与推理分。', onclick: () => void BillingProbe.reverseIdentify(chat, { interactive: true }) }, icon('pulse')),
      h('button', { class: 'ib pelbtn' + (PelicanTest.isRunning(chat) ? ' run' : ''), 'aria-label': PelicanTest.isRunning(chat) ? '停止鹈鹕' : '鹈鹕测试', disabled: (chat.busy && !PelicanTest.isRunning(chat)), title: PelicanTest.isRunning(chat) ? '停止鹈鹕测试' + (chat.probeProgress ? '（' + chat.probeProgress + '）' : '') : '鹈鹕测试：点一下直接开测：发 1 条英文鹈鹕 SVG 标准题，量思考时长算推理分（没思考不计分），思考一结束就停。再点一下停止。', onclick: () => void PelicanTest.start(chat) }, icon('pelican')),
      h('button', { class: 'ib mdbtn', title: '导出这个对话的全部内容（正文、思考、bash 命令和输出、工具调用）为 Markdown，自己选保存位置', onclick: () => void ChatExport.run(chat) }, icon('doc')),
      h('button', { class: 'ib wsbtn', title: WS.shown ? '收起工作区' : '显示工作区（沙盒文件）', onclick: () => { WS.set(!WS.shown); scheduleChat(chat); } }, icon('folder')),
      chat.busy ? h('span', { class: 'phase' }, h('i', { class: 'spin' }), h('span', { class: 'ph-t' }, phase), chat.sentAt ? h('span', { class: 'dim anc-since', 'data-since': chat.sentAt }, '') : null) : null));
    // 消息
    const T = E.thread, sc = E.scroller;
    const stick = this.stick !== false;
    if (!chat.loaded && !chat.messages.length) { if (!T.querySelector('.loading')) T.replaceChildren(h('div', { class: 'loading' }, chat.error ? chat.error : '加载中…')); }
    else {
      // 提问卡片等输入框：重建前记下焦点和光标，重建后搬到同一个输入框（data-fk 相同）
      const ae = document.activeElement, fk = ae && T.contains(ae) ? ae.dataset?.fk : null, fsel = fk ? [ae.selectionStart, ae.selectionEnd] : null;
      const els = [];
      if (chat.hasMore) { const b = this.cache.get('__older') || (() => { const b = h('button', { class: 'older', onclick: () => chat.loadOlder() }, '加载更早的消息'); this.cache.set('__older', b); return b; })(); const t = chat.olderLoading ? '正在加载更早的消息…' : chat.allLoading ? '正在后台补全更早的消息（点此立即加载）' : '加载更早的消息'; if (b.textContent !== t) b.textContent = t; b.classList.toggle('busy', !!chat.olderLoading); els.push(b); }
      // _held：已按发送、但要等服务器上一轮结束才真正发出的消息，在输入框上方的队列条里显示，不进对话区
      let lastIdx = chat.messages.length - 1; while (lastIdx >= 0 && chat.messages[lastIdx]._held) lastIdx--;
      const isVisibleUser = u => u && u.role === 'user' && !u._held && !u._autoContinue && !u.metadata?.autoContinue && (((u.parts || []).some(p => p.type === 'text' && String(p.text || '').trim())) || userAtts(u).length > 0);
      const segMeta = new Array(chat.messages.length);
      for (let i = 0; i <= lastIdx; i++) {
        const m = chat.messages[i];
        if (!m || m._held || m.role !== 'assistant') continue;
        let prevAsst = -1, nextAsst = -1, firstIdx = i;
        for (let j = i - 1; j >= 0; j--) {
          const mj = chat.messages[j]; if (!mj || mj._held) continue;
          if (isVisibleUser(mj)) break;
          if (mj.role === 'assistant') { if (prevAsst < 0) prevAsst = j; firstIdx = j; }
        }
        for (let j = i + 1; j <= lastIdx; j++) {
          const mj = chat.messages[j]; if (!mj || mj._held) continue;
          if (isVisibleUser(mj)) break;
          if (mj.role === 'assistant') { nextAsst = j; break; }
        }
        // Also merge consecutive tool-only segments that share the exact same completion minute even if separated by non-text records
        const curT1 = m.metadata?.timing?.completedAt || 0;
        const nextM = nextAsst >= 0 ? chat.messages[nextAsst] : null;
        const nextT1 = nextM?.metadata?.timing?.completedAt || 0;
        const hasText = (m.parts || []).some(p => p.type === 'text' && String(p.text || '').trim());
        const sameClockAsNext = !!(nextM && curT1 && nextT1 && clock(curT1) === clock(nextT1));
        const hasPrev = prevAsst >= 0, hasNext = nextAsst >= 0;
        const firstMsg = chat.messages[firstIdx];
        const turnStartAt = firstMsg?.metadata?.timing?.startedAt || idTime(firstMsg?.id) || 0;
        segMeta[i] = {
          head: !hasPrev && hasNext,
          mid: hasPrev && hasNext,
          tail: hasPrev && !hasNext,
          hideFoot: hasNext && (!hasText || sameClockAsNext),
          turnStartAt
        };
      }
      chat.messages.forEach((m, i) => {
        if (m._held) return;
        const isLast = i === lastIdx || (i === lastIdx - 1 && chat.messages[lastIdx]?.role === 'user' && false);
        const seg = segMeta[i] || null;
        const segKey = seg ? (seg.head ? 'H' : seg.mid ? 'M' : seg.tail ? 'T' : '') + (seg.hideFoot ? '0' : '1') + ':' + (seg.turnStartAt || 0) : '';
        const isRunningTail = chat.live === m || !!(i === lastIdx && m.role === 'assistant' && chat.busy && !chat.waitingForeign);
        const key = (m.v || 0) + '|' + segKey + '|' + (i === lastIdx ? 'L' + chat.status + (chat.hitlStage?.size || 0) : '') + '|' + (m.failed ? 'f' : '') + '|' + (isRunningTail ? 'live' : '') + '|' + this.modelsV + ':' + modelVersion + '|' + ((m.parts||[]).some(p=>p.type==='reasoning')?ThinkingStatus.label(chat,m,isRunningTail):'');
        let c = this.cache.get(m.id);
        if (!c || c.key !== key) { const el = R.message(m, chat, i === lastIdx, c?.el, seg); c = { key, el }; this.cache.set(m.id, c); }
        els.push(c.el);
      });
      // 「正在输入」占位复用同一个节点：否则每帧都换新节点，整串消息被重新挂载、整页重排
      if (chat.busy && chat.messages[lastIdx]?.role === 'user' && !chat.waitingForeign) {
        const t = this.cache.get('__typing') || (() => { const t = h('div', { class: 'msg assistant' }, h('div', { class: 'msg-body typing-row' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')), h('span', { class: 'typing-st' }))); this.cache.set('__typing', t); return t; })();
        const st = t.querySelector('.typing-st'); if (st) st.textContent = chat.dlvText?.() || ''; els.push(t);
      }
      // 前面插入了更早的消息：以当前看到的第一条消息为锚点保持位置，不跳动
      const structureChanged=els.length!==T.childElementCount||els.some((e,i)=>T.children[i]!==e);
      const prevTop=structureChanged&&!stick?sc.scrollTop:0;let anchor=null,anchorOff=0;
      if (structureChanged&&!stick) for (const c of T.children) { if (c.offsetTop + c.offsetHeight > prevTop) { anchor = c; anchorOff = c.offsetTop - prevTop; break; } }
      if (structureChanged) {
        patchKids(T, els);
        const ids=new Set(chat.messages.map(m=>m.id));for(const id of this.cache.keys())if(id!=='__older'&&id!=='__typing'&&!ids.has(id))this.cache.delete(id);
        if (!stick && anchor && anchor.isConnected) { const d = anchor.offsetTop - prevTop - anchorOff; if (d) sc.scrollTop = prevTop + d; }
      }
      if (fk && document.activeElement !== ae) { const n = [...T.querySelectorAll('[data-fk]')].find(x => x.dataset.fk === fk); if (n && !n.disabled) { try { n.focus({ preventScroll: true }); if (fsel && n.setSelectionRange) n.setSelectionRange(fsel[0], fsel[1]); } catch {} } }
    }
    if (stick || full) sc.scrollTop = sc.scrollHeight;
    { const hh = sc.scrollHeight, grew = !!E.lastSH && hh > E.lastSH + 4; E.lastSH = hh; this.paintToBot(grew && !stick); }
    // 错误条
    E.errbar.replaceChildren();
    if (chat.error && !chat.busy) {
      const cap = /recaptcha|captcha|人机验证/i.test(chat.error), lastUser = chat.messages.at(-1)?.role === 'user' ? chat.messages.at(-1) : null;
      const isRejected = /rejected this request|拒绝请求|死节点|超限/i.test(chat.error || '');
      E.errbar.append(...K(h('span', {}, '⚠ ' + chat.error), h('span', { class: 'grow' }),
        cap ? h('button', { class: 'btn sm', onclick: () => this.retry(chat, lastUser, true) }, '人机验证后重试') : null,
        isRejected ? h('button', { class: 'btn sm ghost', title: '跳过导致超限或死锁的上一轮，回退到再上一轮正常节点重发', onclick: () => this.rewindAndRetry(chat, lastUser) }, '⏪ 回退上一节点') : null,
        isRejected ? h('button', { class: 'btn sm ghost', title: '在当前对话内开启全新空工作区分支（清空沙盒与报错历史，保留当前模型）', onclick: () => this.resetWsBranch(chat, lastUser) }, '🧹 重置工作区救活') : null,
        h('button', { class: 'btn sm ghost', onclick: () => this.retry(chat, lastUser, false) }, '重试'),
        h('button', { class: 'ib', onclick: () => { chat.error = null; chat.emit(); } }, icon('x'))));
    }
    // 输入框按钮状态
    this.syncComposer(chat);
    try { HtmlPreview.syncLive?.(chat.sid); } catch {}
    try { window.__arenaBashTranslate?.scan?.(); } catch {}
  },
  paintToBot(grew, P = this.pane) {
    const E = P?.els, b = E?.toBot, sc = E?.scroller; if (!b || !sc) return;
    const far = sc.scrollHeight - sc.scrollTop - sc.clientHeight > Math.max(240, sc.clientHeight * 0.6);
    b.classList.toggle('show', far);
    if (!far) b.classList.remove('new'); else if (grew) b.classList.add('new');
  },
  async rewindAndRetry(chat, lastUser) {
    if (!chat || chat.busy || chat._qBusy) return;
    try {
      if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      const curHealthy = typeof findHealthyLastUser === 'function' ? findHealthyLastUser(chat.messages, null, chat._rejectedHealthyNodeIds) : null;
      if (curHealthy) {
        const key = String(curHealthy.metadata?.nodeId || curHealthy.id || '');
        if (key) (chat._rejectedHealthyNodeIds ||= new Set()).add(key);
        if (curHealthy.id) (chat._rejectedHealthyNodeIds ||= new Set()).add(String(curHealthy.id));
        if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      } else {
        chat._forceResetWorkspaceBranch = true;
      }
      toast('已回退至更早一轮正常节点，正在重发…');
      await this.retry(chat, lastUser, false);
    } catch (e) { toast(describe(e), 'err'); }
  },
  async resetWsBranch(chat, lastUser) {
    if (!chat || chat.busy || chat._qBusy) return;
    if (!await Dialog.confirm({
      title: '重置工作区并救活当前对话',
      text: '将清理末尾卡死/开源思考已停止的异常轮次，并回退到第 1 轮正常闭源节点开启全新干净工作区分支（清空 /home/user 满载工作区与死节点历史，完整保留当前对话 ID 与已锁定的闭源模型）。是否立即重置并重发？',
      ok: '重置工作区并重发'
    })) return;
    try {
      if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      const getText = u => (u?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n').trim();
      const isContinueFiller = u => /^(?:继续|continue|go on|keep going|接着|继续执行)[。.!！?？\s]*$/i.test(getText(u)) && !(u?.metadata?.uploads?.length > 0);
      const users = (chat.messages || []).filter(m => m && m.role === 'user');
      const picked = [...users].reverse().find(u => !isContinueFiller(u) && getText(u)) || lastUser || users.at(-1);
      const text = getText(picked) || '你好';
      const firstU = typeof findFirstHealthyUser === 'function' ? findFirstHealthyUser(chat.messages) : null;
      if (firstU) {
        const uIdx = chat.messages.indexOf(firstU);
        let cutIdx = uIdx;
        for (let j = uIdx + 1; j < chat.messages.length; j++) {
          const m = chat.messages[j];
          if (!m) continue;
          if (m.role === 'user') break;
          if (m.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(m))) cutIdx = j;
        }
        const removed = chat.messages.slice(cutIdx + 1);
        const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
        for (const m of removed) if (m?.id) prunedSet.add(m.id);
        chat.messages.splice(cutIdx + 1);
      } else {
        const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
        for (const m of (chat.messages || [])) if (m?.id) prunedSet.add(m.id);
        chat.messages.length = 0;
      }
      if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(chat, { pruneTail: false });
      const targetU = typeof findHealthyLastUser === 'function' ? findHealthyLastUser(chat.messages) : firstU;
      chat._forceResetWorkspaceBranch = true;
      chat._resetBranchTargetUserId = targetU ? (targetU.metadata?.nodeId || targetU.id || null) : null;
      chat._rejectedHealthyNodeIds?.clear?.();
      chat.error = null;
      chat.errText = '';
      try { Workspace.cache.delete(chat.sid); if (typeof WS !== 'undefined' && WS.sid === chat.sid) { WS.data = null; WS.render(); } } catch {}
      toast('已回退至初始闭源节点并重置工作区分支，正在发送…');
      await chat.send(text, {});
    } catch (e) { toast(describe(e), 'err'); }
  },
  async retry(chat, lastUser, captcha) {
    if (chat.busy || chat._qBusy) { toast('上一条仍在处理，请稍候','err'); return; }
    try {
      const uncertain = lastUser || [...chat.messages].reverse().find(m => m.role === 'user');
      if (uncertain?.deliveryUnknown && !await Dialog.confirm({ title: '发送状态尚未确认', text: '服务器可能已经收到这条消息。建议先刷新对话核对；现在重发可能产生重复消息。', ok: '仍要重发' })) return;
      const v2 = captcha ? await Recaptcha.v2() : null;
      if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
      // 人机验证失败时服务端会回一条只有 error 的助手消息：去掉它，把上一条用户消息带着验证重新发出去
      const tail = chat.messages.at(-1);
      const pruned = typeof pruneDeadTailTurns === 'function' ? pruneDeadTailTurns(chat) : null;
      try { if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(chat, { pruneTail: false }); } catch {}
      const removedErrTail = !!(pruned || (tail?.role === 'assistant' && ((typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tail)) || ((tail.parts || []).length && tail.parts.every(p => p.type === 'error' || p.type === 'step-start')))));
      if (!pruned && removedErrTail && chat.messages.at(-1) === tail) chat.messages.pop();
      if (pruned?.lastUser) lastUser = pruned.lastUser;
      else if (!lastUser && chat.messages.at(-1)?.role === 'user') lastUser = chat.messages.at(-1);
      if (lastUser && removedErrTail) lastUser._streamRejected = true;
      const capFail = /recaptcha|captcha|人机验证|prompt failed/i.test(chat.error || '');
      if (lastUser && (lastUser.failed || capFail || removedErrTail)) { await chat.send(lastUser.parts.filter(p => p.type === 'text').map(p => p.text).join('\n'), { v2, files: lastUser.metadata?.uploads, retryOf: lastUser }); }
      else await chat.regenerate({ v2 });
    } catch (e) { if (!/取消/.test(e.message)) toast(describe(e), 'err'); }
  },
  async regen(chat) {
    try {
      const tail = chat?.messages?.at(-1);
      const isErrTail = !!(tail?.role === 'assistant' && ((typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tail)) || ((tail.parts || []).length && tail.parts.every(p => p.type === 'error' || p.type === 'step-start'))));
      if (isErrTail) { await this.retry(chat, null, false); return; }
      await chat.regenerate();
    } catch (e) { toast('重新生成失败：' + describe(e), 'err'); }
  },
  inputHistory: {
    KEY: 'inputHistory:v1',
    MAX: 100,
    _mem: null,
    load() {
      if (this._mem) return this._mem;
      try {
        const a = typeof Store !== 'undefined' && Store.get ? Store.get(this.KEY, []) : [];
        this._mem = Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : [];
      } catch { this._mem = []; }
      return this._mem;
    },
    push(text) {
      const t = String(text || '');
      if (!t.trim()) return;
      const list = this.load();
      const idx = list.lastIndexOf(t);
      if (idx >= 0) list.splice(idx, 1);
      list.push(t);
      if (list.length > this.MAX) list.splice(0, list.length - this.MAX);
      try { if (typeof Store !== 'undefined' && Store.set) Store.set(this.KEY, list); } catch {}
    },
    forChat(chat) {
      const out = [];
      const add = s => {
        const t = String(s || '');
        if (!t.trim()) return;
        const idx = out.lastIndexOf(t);
        if (idx >= 0) out.splice(idx, 1);
        out.push(t);
      };
      for (const m of (chat?.messages || [])) {
        if (!m || m.role !== 'user' || m._autoContinue || m.metadata?.autoContinue) continue;
        const txt = (m.parts || []).filter(p => p && p.type === 'text' && p.text).map(p => p.text).join('\n');
        if (txt) add(txt);
      }
      for (const t of this.load()) add(t);
      return out.length > this.MAX ? out.slice(-this.MAX) : out;
    },
  },
  composer(tab, chat) {
    let slash;
    const P = this.pane;   // 这个输入框属于哪一页（手机上相邻窗口的页也有自己的输入框）：按钮状态 / 队列只改这一页
    try { Drafts.intoTab(tab); } catch {}
    const rcAct = () => chat ? (chat.real ? 'chat_submit' : 'agentic_chat_submit') : 'agentic_chat_submit';
    let histIdx = -1, histSavedDraft = tab.draft || '', histApplying = false;
    const ta = h('textarea', { rows: 1, 'data-tab': tab.key, placeholder: chat ? '继续对话…' : '想让它做什么？（Enter 发送）', onfocus: () => Recaptcha.warm(rcAct()), oninput: () => { if (!histApplying) { histIdx = -1; histSavedDraft = ta.value; } autosize(); tab.draft = ta.value; Drafts.setTab(tab); if (tab.sid && Chats.get(tab.sid)?.busy) this.withPane(P, () => this.syncComposer(Chats.get(tab.sid))); if (ta.value.trim()) Recaptcha.warm(rcAct()); clearTimeout(this.draftT); this.draftT = setTimeout(() => Tabs.save(), 400); } });
    ta.value = tab.draft || '';
    // 手机：文字快碰到厂商按钮（这一行放不下、要换行了）时，厂商按钮才移到发送按钮上方（带动画），输入框横向让出这一格；
    // 字数少、一行放得下时厂商按钮留在原位
    const LIFT = 38;   // 厂商按钮宽 36 + 间距 2
    const fits = (b) => {
      const v = ta.value; if (!v.trim()) return true; if (/\n/.test(v)) return false;
      const cs = getComputedStyle(ta), cv = UI._mcv ||= document.createElement('canvas').getContext('2d');
      cv.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const room = ta.clientWidth - pad - (b.classList.contains('has-txt') ? LIFT : 0) - 6;   // 按「厂商按钮在原位」时的宽度算，留一点余量：挨到按钮前就上移
      return cv.measureText(v).width <= room;
    };
    const autosize = () => {
      const b = ta.parentElement;
      if (b && b.classList.contains('cbox') && isMob()) {
        const lift = !fits(b);
        if (b.classList.contains('has-txt') !== lift) { b.classList.toggle('has-txt', lift); b.classList.remove('g-up', 'g-down'); void b.offsetWidth; b.classList.add(lift ? 'g-up' : 'g-down'); }
      }
      // 输入框跟着内容长高（最多约半屏），再多才出现滚动条；带附件时也一样，不会被挤压
      const maxH = Math.round(Math.max(160, Math.min(innerHeight * (isMob() ? 0.35 : 0.45), 520)));
      ta.style.maxHeight = maxH + 'px'; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px'; ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden'; };
    const btn = h('button', { class: 'sendbtn', type: 'submit', title: '发送', 'aria-label': 'Send message', onclick: () => go() }, icon('send'));
    const chint = h('span', { class: 'chint' }, chat ? '' : '受 reCAPTCHA 保护');
    // 附件：每个标签页各自一组。选中 / 粘贴 / 拖入的瞬间就在输入框里显示本地预览，同时后台开始上传（显示进度）；
    // 按发送不用等上传：消息立即出现在对话里，上传完成后自动发出（新对话需要附件才能创建，会等上传完成）
    const atts = this.atts.get(tab.key) || []; this.atts.set(tab.key, atts);
    const chips = h('div', { class: 'att-row' });
    // 排队中的消息（对话进行中时按「队列」加入；本轮结束后合并自动发出）
    const qrow = h('div', { class: 'q-row' });
    const paintQ = () => {
      const c = tab.sid ? Chats.get(tab.sid) : null, q = c?.queue || [], held = (c?.messages || []).filter(m => m._held);
      const qMode = SendQ.mode(c);
      const sig = q.map(i => i.id || i.at).join(',') + '|' + qMode + '|' + SendQ.status(c) + '|' + held.map(m => m.id).join(',');
      if (qrow._sig === sig) return; qrow._sig = sig;
      qrow.style.display = q.length || held.length ? '' : 'none';
      if (!q.length && !held.length) { qrow.replaceChildren(); return; }
      const heldText = m => (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ') || '（附件）';
      const heldRows = held.length ? [h('div', { class: 'q-h' }, h('i', { class: 'spin' }), h('b', {}, '等上一轮结束后发送'), h('span', { class: 'dim' }, '回复完会自动发出'), h('span', { class: 'grow' })),
        ...held.map(m => h('div', { class: 'q-it q-held' }, h('span', { class: 'q-t' }, heldText(m).replace(/\s*\n\s*/g, ' ⏎ ')), m._prev?.length ? h('span', { class: 'q-a' }, icon('file'), m._prev.length) : null))] : [];
      if (!q.length) { qrow.replaceChildren(...K(...heldRows)); return; }
      qrow.classList.toggle('q-split-mode', qMode === 'split');
      qrow.classList.toggle('q-merge-mode', qMode !== 'split');
      const renderQRowItem = (it, i) => h('div', { class: 'q-it ' + (qMode === 'split' ? 'q-split-card' : 'q-merge-row'), title: '点击查看完整队列', onclick: e => { if (!e.target.closest('.q-x, .q-act')) SendQ.view(c); } },
        h('span', { class: 'q-idx' }, String(i + 1)),
        h('span', { class: 'q-t' }, (it.text || '（附件）').replace(/\s*\n\s*/g, ' ⏎ ')), it.atts.length ? h('span', { class: 'q-a' }, icon('file'), it.atts.length) : null,
        h('button', { type: 'button', class: 'q-act q-ib q-copy', title: '复制该条内容', 'aria-label': '复制该条内容', onclick: e => { e.stopPropagation(); void SendQ.copy(c, it); } }, icon('copy')),
        h('button', { type: 'button', class: 'q-act q-ib q-recall', title: '撤回至输入框（连带附件一起恢复）', 'aria-label': '撤回至输入框', onclick: e => { e.stopPropagation(); SendQ.recall(c, it); } }, icon('undo')),
        h('button', { class: 'q-x q-ib', title: '移出队列', 'aria-label': '移出队列', onclick: () => { SendQ.remove(c, it); } }, icon('x')));
      const visibleItems = q.slice(0, 2).map(renderQRowItem);
      qrow.replaceChildren(...K(...heldRows,
        h('div', { class: 'q-h' },
          h('button', { type: 'button', class: 'q-mode ' + (qMode === 'split' ? 'is-split' : 'is-merge'), title: qMode === 'split' ? '当前：分列发送（每条单独卡片展示，等上一轮真正完成后逐条发出）；点击切换为合并发送' : '当前：合并发送（合并在一个长条框内展示并发送）；点击切换为分列发送', onclick: e => { e.stopPropagation(); SendQ.toggleMode(c); } }, qMode === 'split' ? '分列' : '合并'),
          icon('queue'), h('b', {}, '队列 ' + q.length + ' 条'), h('span', { class: 'dim' }, SendQ.status(c)), h('span', { class: 'grow' }),
          c.status === 'error' || !c.busy ? h('button', { class: 'q-now', onclick: () => SendQ.flush(c, { manual: true }) }, '立即发送') : null,
          h('button', { class: 'q-clr', title: '清空队列', onclick: () => { SendQ.clear(c); } }, '清空')),
        ...(qMode === 'split' ? visibleItems : [h('div', { class: 'q-merge-card' }, ...visibleItems)]),
        q.length > 2 ? h('button', { class: 'q-more', onclick: () => SendQ.view(c) }, '还有 ' + (q.length - 2) + ' 条 · 查看全部') : null));
    };
    this.paintQ = paintQ;
    this.paintAtt = () => { try { paintAtt(); } catch {} };
    const paintAtt = () => {
      chips.replaceChildren(...atts.map(a => attView({ name: a.name, type: a.type, src: a.url, a }, false, () => { atts.splice(atts.indexOf(a), 1); try { a.url && URL.revokeObjectURL(a.url); } catch {} paintAtt(); })));
      chips.style.display = atts.length ? '' : 'none';
      Drafts.setTab(tab, atts);
      this.withPane(P, () => this.syncComposer(tab.sid ? Chats.get(tab.sid) : null));
    };
    const addFiles = list => {
      for (const f of list) {
        if (!f) continue;
        if (f.size > 100 * 1024 * 1024) { toast(f.name + ' 超过 100MB', 'err'); continue; }
        const type = Uploads.type(f), a = { name: f.name || 'file', size: f.size, type, state: 'up', stage: '', pct: 0, url: /^image\//.test(type) ? URL.createObjectURL(f) : null, subs: new Set() };
        // 进度刷新节流到 ~8 次/秒，带尾随刷新（不丢最后一次状态）
        let pt = 0, tt = 0; const fire = () => { tt = 0; pt = now(); for (const fn of a.subs) try { fn(); } catch {} };
        const tick = () => { if (a.state !== 'up') { clearTimeout(tt); return fire(); } if (tt) return; const d = 120 - (now() - pt); if (d <= 0) fire(); else tt = setTimeout(fire, d); };
        a.subs.add(() => { if (chips.isConnected) paintAtt(); });
        a.p = Uploads.upload(f, st => { a.stage = st; tick(); }, p => { a.pct = p; tick(); })
          .then(r => { a.res = r; a.state = 'ok'; a.pct = 1; tick(); return r; }, e => { a.state = 'bad'; a.err = describe(e); tick(); toast(a.name + '：' + a.err, 'err'); return null; });
        atts.push(a);
      }
      paintAtt(); Recaptcha.warm(chat ? undefined : 'agentic_chat_submit');
    };
    const fin = h('input', { type: 'file', multiple: true, style: 'display:none', onchange: () => { addFiles([...fin.files]); fin.value = ''; } });
    const plus = h('button', { class: 'ib attbtn', type: 'button', title: '添加附件（也可以粘贴或拖进来）', 'aria-label': 'Add files and connections', onclick: e => { e.stopPropagation(); fin.click(); } }, icon('plus'));
    ta.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
    const go = async () => {
      if (slash?.submit()) return;
      slash?.close();
      const c = tab.sid ? chatOf(tab.sid) : null;
      const command = Fingerprint.command(c, ta.value, { attachments: !!atts.length });
      if (command.handled) { if (command.accepted) { ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); } else toast(command.error, 'err'); return; }
      // 交互卡片（提问 / 计划 / 选图 / 选声音）没点：直接发这条消息时自动按官方 Skip 提交卡片并附带发送文字
      if (c && !c._qBusy && !this.sending && (ta.value.trim() || atts.length) && Hitl.skippable(c)) {
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再发送', 'err'); return; }
        if (!UI.me) { UI.loginGate('请先登录'); return; }
        let text = ta.value.trim(); const list = atts.slice();
        if (!text && list.length) text = '请查看附件：' + list.map(a => a.name).join('、');
        const filesP = list.length ? Promise.all(list.map(a => a.p)).then(rs => { if (rs.some(r => !r)) throw new Error('附件上传失败'); return rs; }) : null;
        this.sending = true; btn.disabled = true;
        const restore = { v: ta.value };
        if (restore.v.trim()) this.inputHistory.push(restore.v);
        histIdx = -1; histSavedDraft = '';
        ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); P.stick = true; atts.length = 0; paintAtt();
        const run = v2 => c.skipHitlSend(text, { ...(filesP ? { filesP, previews: list } : {}), ...(v2 ? { v2 } : {}) });
        try { await run().catch(async e => { if (e?.status === 403 && /recaptcha/i.test(e.body || '')) { toast('需要人机验证', 'err'); const tok = await Recaptcha.v2().catch(() => null); if (tok) return run(tok); } throw e; }); }
        catch (e) {
          toast(describe(e), 'err');
          if (!ta.value) { ta.value = restore.v; tab.draft = restore.v; autosize(); Tabs.save(); } if (!atts.length) { atts.push(...list); paintAtt(); }
        }
        finally { this.sending = false; btn.disabled = false; this.withPane(P, () => this.syncComposer(c)); }
        return;
      }
      if (Hitl.blocked(c) || c?._qBusy) {
        // 进行中：输入框有内容 = 加入队列；没内容 = 停止
        const qt = ta.value.trim();
        // 刚发出 0.7 秒内的再次点击（双击 / 连点）不当成停止：停止会打断这一轮回复
        if (!qt && !atts.length) { if (!c.busy || now() - (c.sentAt || 0) < 700) return; c.stop(); return; }
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再加入队列', 'err'); return; }
        if (qt) this.inputHistory.push(ta.value);
        if (!SendQ.add(c, qt, atts.slice())) return; histIdx = -1; histSavedDraft = ''; ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); atts.length = 0; paintAtt(); paintQ();
        return;
      }
      // 空闲但还有排队的（比如上一轮出错暂停了）：和这次输入合并一起发
      if (c?.queue?.length) {
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，请先移除', 'err'); return; }
        if (ta.value.trim() || atts.length) { if (ta.value.trim()) this.inputHistory.push(ta.value); if (!SendQ.add(c, ta.value.trim(), atts.slice())) return; histIdx = -1; histSavedDraft = ''; ta.value = ''; tab.draft = ''; atts.length = 0; autosize(); Tabs.save(); paintAtt(); }
        await SendQ.flush(c, { manual: true }); paintQ(); return;
      }
      const rawDraft = ta.value;
      let text = ta.value.trim(); if ((!text && !atts.length) || this.sending) return;
      if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再发送', 'err'); return; }
      if (rawDraft.trim()) this.inputHistory.push(rawDraft);
      histIdx = -1; histSavedDraft = '';
      if (!text && atts.length) text = '请查看附件：' + atts.map(a => a.name).join('、');
      this.sending = true; btn.disabled = true; (this.sendKeys ||= new Set()).add(tab.key); this.withPane(P, () => this.syncComposer(c || null));
      try {
        const list = atts.slice();
        const filesP = list.length ? Promise.all(list.map(a => a.p)).then(rs => { if (rs.some(r => !r)) throw new Error('附件上传失败：' + list.filter(a => a.state === 'bad').map(a => a.name + (a.err ? '（' + a.err + '）' : '')).join('、')); return rs; }) : null;
        if (c) {
          // 已有对话：立即清空输入框、消息立即显示，上传完成后自动发出
          await c.send(text, { ...(filesP ? { filesP, previews: list } : {}), onPrepared: () => {
            ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); P.stick = true; atts.length = 0; paintAtt();
            this.sending = false; btn.disabled = false;
          } });
        } else {
          let files = null;
          if (filesP) {
            const hint = chint, show = () => { if (hint && list.some(a => a.state === 'up')) hint.textContent = '上传附件 ' + Math.round(list.reduce((x, a) => x + (a.pct || 0), 0) / list.length * 100) + '%，完成后自动创建对话…'; };
            for (const a of list) a.subs.add(show); show();
            files = await filesP;
            if (hint) hint.textContent = '受 reCAPTCHA 保护';
          }
          await this.startNew(tab, text, ta, null, files);
        }
      } catch (e) {
        toast(describe(e), 'err');
        if (!ta.value && rawDraft.trim()) {
          ta.value = rawDraft; tab.draft = rawDraft; Drafts.setTab(tab); autosize(); syncPmFromTa(); Tabs.save();
        }
      }
      finally { this.sending = false; btn.disabled = false; this.sendKeys?.delete(tab.key); this.withPane(P, () => this.syncComposer(tab.sid ? Chats.get(tab.sid) : null)); }
    };
    ta.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const curChat = tab.sid ? Chats.get(tab.sid) : chat;
        const items = this.inputHistory.forChat(curChat);
        if (items.length) {
          const val = ta.value || '';
          const selStart = typeof ta.selectionStart === 'number' ? ta.selectionStart : 0;
          const selEnd = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : val.length;
          const onFirstLine = !val.slice(0, selStart).includes('\n');
          const onLastLine = !val.slice(selEnd).includes('\n');
          if (e.key === 'ArrowUp' && (histIdx >= 0 || onFirstLine)) {
            e.preventDefault();
            if (histIdx < 0) {
              histSavedDraft = val;
              histIdx = items.length - 1;
            } else if (histIdx > 0) {
              histIdx = Math.min(items.length - 1, histIdx - 1);
            } else {
              histIdx = 0;
            }
            const nextVal = items[histIdx] ?? '';
            histApplying = true;
            try {
              ta.value = nextVal; tab.draft = nextVal; Drafts.setTab(tab); autosize(); syncPmFromTa();
              try { ta.setSelectionRange(nextVal.length, nextVal.length); } catch {}
              this.withPane(P, () => this.syncComposer(curChat || null));
            } finally { histApplying = false; }
            return;
          }
          if (e.key === 'ArrowDown' && histIdx >= 0 && onLastLine) {
            e.preventDefault();
            let nextVal = '';
            if (histIdx < items.length - 1) {
              histIdx++;
              nextVal = items[histIdx] ?? '';
            } else {
              histIdx = -1;
              nextVal = histSavedDraft || '';
            }
            histApplying = true;
            try {
              ta.value = nextVal; tab.draft = nextVal; Drafts.setTab(tab); autosize(); syncPmFromTa();
              try { ta.setSelectionRange(nextVal.length, nextVal.length); } catch {}
              this.withPane(P, () => this.syncComposer(curChat || null));
            } finally { histApplying = false; }
            return;
          }
        }
      }
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && ((Prefs.enterSend && !e.shiftKey && !e.ctrlKey && !e.metaKey) || (!Prefs.enterSend && (e.ctrlKey || e.metaKey)))) { e.preventDefault(); if (!ta.value.trim() && !atts.length && tab.sid && Chats.get(tab.sid)?.busy) return; go(); }   // 进行中按回车：有内容 = 加入队列；空的不做任何事（停止只能点按钮）
    });
    setTimeout(() => { if (isMob() && ta.value.trim() && !fits(ta.parentElement)) ta.parentElement?.classList.add('has-txt'); autosize(); }, 0);
    setTimeout(paintAtt, 0); setTimeout(paintQ, 0);
    const pm = h('div', { contenteditable: 'true', role: 'textbox', translate: 'no', class: 'tiptap ProseMirror prose prose-sm', tabindex: '-1', 'data-placeholder': 'What would you like to do?' }, h('p', { dir: 'auto', 'data-placeholder': 'What would you like to do?', class: 'is-empty is-editor-empty' }, h('br', { class: 'ProseMirror-trailingBreak' })));
    const pmWrap = h('div', { class: 'editor-content ext-pm-bridge' }, pm);
    let syncingPm = false, pmObserver = null;
    const syncPmFromTa = () => {
      if (syncingPm) return;
      syncingPm = true;
      try {
        const val = ta.value || '';
        const cur = (pm.textContent ?? '').replace(/\u200B/g, '');
        if (cur !== val) {
          if (!val) pm.innerHTML = '<p dir="auto" data-placeholder="What would you like to do?" class="is-empty is-editor-empty"><br class="ProseMirror-trailingBreak"></p>';
          else pm.textContent = val;
        }
        try { pmObserver?.takeRecords(); } catch {}
      } finally {
        queueMicrotask(() => { syncingPm = false; });
      }
    };
    const syncTaFromPm = () => {
      if (syncingPm || document.activeElement === ta) return;
      syncingPm = true;
      try {
        const raw = (pm.textContent ?? pm.innerText ?? '').replace(/\u200B/g, '').replace(/\r\n?/g, '\n');
        if (ta.value !== raw) {
          ta.value = raw; tab.draft = raw; Drafts.setTab(tab); autosize();
          this.withPane(P, () => this.syncComposer(tab.sid ? Chats.get(tab.sid) : null));
        }
      } finally { syncingPm = false; }
    };
    pm.addEventListener('input', syncTaFromPm);
    pmObserver = new MutationObserver(syncTaFromPm);
    pmObserver.observe(pm, { childList: true, subtree: true, characterData: true });
    ta.addEventListener('input', syncPmFromTa);
    syncPmFromTa();
    const box = h('div', { class: 'cbox', onclick: e => { if (e.target === e.currentTarget) ta.focus(); },
      ondragover: e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); box.classList.add('drop'); } },
      ondragleave: () => box.classList.remove('drop'),
      ondrop: e => { box.classList.remove('drop'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } } },
      qrow, chips, ta, pmWrap, h('div', { class: 'crow' }, plus, fin, chint, h('span', { class: 'grow' }), Cap.btn(), GPop.btn(), btn));
    const composer = h('div', { class: 'composer' }, box);
    slash = SlashCommands.bind(composer, ta, { fingerprint: () => {
      const c = tab.sid ? chatOf(tab.sid) : null;
      const r = Fingerprint.command(c, '/测指纹', { attachments: !!atts.length });
      if (!r.accepted) toast(r.error, 'err');
      return !!r.accepted;
    } });
    return composer;
  },
  syncComposer(chat) {
    const comp = this.els?.composer || $('#view .composer'), btn = comp?.querySelector('.sendbtn'); if (!btn) return;
    const skipOk = !!chat && !chat._qBusy && !!Hitl.skippable(chat), key = this.pane.key || Tabs.cur?.key, busy = !skipOk && (Hitl.blocked(chat) || chat?._qBusy), ta = comp.querySelector('textarea'), atts = key ? this.atts.get(key) || [] : [];
    const typed = !!(ta?.value.trim() || atts.length);
    // 进行中：没输入 = 停止键；有输入 = 「队列」键（点了进队列，本轮结束后自动发）
    // 发送中（新对话创建 / 附件上传 / 已发出还没开始回复）：按钮里转圈，不然看起来像卡住了
    const submitting = (!busy && !!key && !!this.sendKeys?.has(key)) || (!typed && ((!!chat && chat.status === 'submitted' && !chat.live) || !!chat?._qBusy));
    const mode = submitting ? 'sending' : !busy ? 'send' : typed ? 'queue' : 'stop';
    if (btn.dataset.mode !== mode) {
      btn.dataset.mode = mode;
      btn.classList.toggle('stop', mode === 'stop'); btn.classList.toggle('queue', mode === 'queue'); btn.classList.toggle('sending', mode === 'sending');
      btn.replaceChildren(mode === 'sending' ? h('i', { class: 'spin' }) : icon(mode === 'queue' ? 'queue' : mode === 'stop' ? 'stop' : 'send'));
      btn.title = mode === 'sending' ? (busy ? '发送中…（再点一下可停止）' : '发送中…') : mode === 'queue' ? '加入队列：本轮结束后自动发送（可多次加入，合并成一条）' : mode === 'stop' ? '停止' : '发送';
      btn.setAttribute('aria-label', mode === 'stop' ? 'Stop generating' : 'Send message');
      btn.setAttribute('aria-busy', mode === 'sending' ? 'true' : 'false');
      const pmEl = comp.querySelector('.tiptap.ProseMirror');
      if (pmEl && ta && !ta.value && pmEl.textContent) {
        pmEl.innerHTML = '<p dir="auto" data-placeholder="What would you like to do?" class="is-empty is-editor-empty"><br class="ProseMirror-trailingBreak"></p>';
      }
    }
    this.paintQ?.();
  },
  async startNew(tab, text, ta, v2, files) {
    const hint = this.els?.composer?.querySelector('.chint') || $('#view .chint'); if (hint) hint.textContent = '正在创建对话…';
    // 像网页一样：点发送后立刻把自己的消息和「正在思考」放进对话区（乐观显示），不用干等 reCAPTCHA + create-chat 返回才有反应。
    // 创建成功后 showTab 会整页换成真实对话；失败就撤掉，恢复原来的欢迎页（输入框里的文字没清，可以直接重发）。
    const thread = this.els?.thread, hero = thread?.querySelector(':scope > .hero');
    const pend = thread && !thread.querySelector('.msg.pending') ? h('div', { class: 'pend-wrap' }, h('div', { class: 'msg user pending' }, h('div', { class: 'bubble' }, text)), h('div', { class: 'msg assistant pending' }, h('div', { class: 'msg-body typing-row' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')), h('span', { class: 'typing-st' }, '正在创建对话…')))) : null;
    if (pend) { hero?.remove(); thread.append(pend); if (this.els?.scroller) this.els.scroller.scrollTop = this.els.scroller.scrollHeight; }
    const unpend = () => { if (pend?.isConnected) { pend.remove(); if (hero && !thread.querySelector(':scope > .hero')) thread.append(hero); } };
    try {
      const c = await createChat(text, { v2, files });
      ta.value = ''; tab.draft = ''; this.atts.delete(tab.key); tab.sid = c.sid; tab.title = text.slice(0, 40); tab.touchedAt = now(); Tabs.enforceLimit(tab.key); Tabs.save();
      // createChat 已经把新对话放进侧栏了：这里只在没有时补一条（以前重复 unshift，侧栏出现两条一样的）
      if (!History.byId(c.sid)) History.items.unshift({ type: 'agentic', id: c.sid, title: text.slice(0, 60), updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), _local: true });
      History.dedupe();
      this.renderList(); this.renderTabs(); this.showTab();
      History.auto('new');   // 新对话：20 秒内最多拉一次（第一轮回复完成时还会再排一次拿服务器标题）
    } catch (e) {
      unpend();
      if (hint) hint.textContent = '受 reCAPTCHA 保护';
      if (e.status === 403 && /recaptcha/i.test(e.body || '')) {
        toast('需要人机验证', 'err');
        const tok = await Recaptcha.v2().catch(() => null);
        if (tok) return this.startNew(tab, text, ta, tok, files);
        return;
      }
      if (e.status === 429) { const q = Quota.chat; const wait = q?.retryAt ? Math.max(0, Math.ceil((q.retryAt - now()) / 60000)) : null; throw new Error('新对话额度用完（429）' + (wait ? `，约 ${wait} 分钟后恢复` : '')); }
      throw e;
    } finally { if (hint && hint.textContent === '正在创建对话…') hint.textContent = '受 reCAPTCHA 保护'; }
  },
  renderQuota() { Bar.render(); },
  renderIP() { this.renderAcct(); },
};

// ---- 页（pane）：手机上当前页和左右相邻的页都是完整的真页面。UI.els / cache / stick / paintQ 指向「当前正在渲染的页」----
UI.pane = { key: null, el: null, els: null, cache: new Map(), stick: true, paintQ: null };
for (const k of ['els', 'cache', 'stick', 'paintQ']) { const v0 = UI[k]; delete UI[k]; Object.defineProperty(UI, k, { configurable: true, get() { return this.pane[k]; }, set(v) { this.pane[k] = v; } }); if (v0 !== undefined) UI.pane[k] = v0; }
UI.withPane = function (P, fn) { const o = this.pane; this.pane = P; try { return fn(); } finally { this.pane = o; } };

// Coalesce presentation work, not chat events. Hidden windows keep receiving/persisting messages without repainting.
const ChatPaint=RenderWork.create({
  visible:()=>!document.hidden,mobile:()=>isMob(),current:()=>UI.els?.chat,
  state:c=>c.status+'|'+(c.error||''),
  stamp:c=>[chatState(c),c.title,!!c.loaded,Models.get(c.sid)],
  park:c=>{if(UI.els?.chat===c)UI.pane.dirty=true;else Pager.dirty(c);},
  paint:c=>{if(UI.els?.chat===c){UI.renderChat(c);UI.pane.dirty=false;}else Pager.dirty(c);},
  metadata:()=>{UI.renderTabs();UI.renderListSoon();},error:e=>console.warn('Chat paint:',e),
});
function scheduleChat(chat){ChatPaint.add(chat);}
// 侧栏重绘（1500 条会话一次 20~30ms，手机上更慢）：手机抽屉没打开 / 窗口在后台时不画，只记脏，空闲时补画；打开抽屉前一定补上
UI.listDirty = false;
UI.listIdle = () => { if (UI.listIdleT) return; const run = () => { UI.listIdleT = 0; if (UI.listDirty && !document.hidden && (!isMob()||document.body.classList.contains('drawer'))) UI.renderList(); }; UI.listIdleT = window.requestIdleCallback ? requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 1500); };
UI.renderListSoon = () => {
  if (UI.listT) return;   // 节流（不是防抖）：连续来事件（拉全部历史每页一次）也保证按时画，不会一直往后推
  UI.listT = setTimeout(() => {
    UI.listT = 0;
    if (document.hidden || (isMob() && !document.body.classList.contains('drawer'))) { UI.listDirty = true; return; }
    UI.renderList();
  }, History.fullLoading ? 1200 : 250);
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && UI.listDirty) UI.listIdle(); });
// 手机抽屉打开时补画侧栏。注意：UI.build() 会用 documentElement.innerHTML 重建整个 <body>，
// 之前挂在旧 body 上的 MutationObserver 随之失效（抽屉打开不再触发补画 → 侧栏空白、改名不同步，只有搜索才会直接 renderList）。
// 所以每次 build 之后都要重新挂到当前的 body 上。
UI.watchDrawer = () => {
  const body = document.body; if (!body) return;
  if (UI._drawerMO && UI._drawerBody === body) return;
  try { UI._drawerMO?.disconnect(); } catch {}
  UI._drawerBody = body; UI.drawerWas = body.classList.contains('drawer');
  UI._drawerMO = new MutationObserver(() => {
    const dr = body.classList.contains('drawer');
    if (dr === UI.drawerWas) return; UI.drawerWas = dr; if (!dr) return;
    if (UI.listDirty || ($('#list') && !$('#list').children.length && History.items.length)) UI.renderList();
    try { if (now() - LaunchPick.cacheAt > 15e3) setTimeout(() => LaunchPick.preload(), 260); } catch {}
  });
  UI._drawerMO.observe(body, { attributes: true, attributeFilter: ['class'] });
};
if (document.body) UI.watchDrawer(); else document.addEventListener('DOMContentLoaded', () => UI.watchDrawer(), { once: true });
// No hidden-window DOM timer. On return, present the latest state once and then resume normal scheduling.
document.addEventListener('visibilitychange',()=>{if(document.hidden)ChatPaint.hide();else{ChatPaint.resume();Pager.ensureSoon();if(!Pager.dT)Pager.dT=setTimeout(()=>Pager.flushDirty(),800);}});
// 已用时
// 计时：用实时的 class 集合（不用每秒全文档按属性查一遍），后台 / 没有计时的时候什么都不做
try { Tabs.enforceLimit(Tabs.active); Tabs.save(); } catch {}
if (typeof Bus !== 'undefined') Bus.on('history', () => { try { Tabs.enforceLimit(Tabs.active); Tabs.save(); UI.renderTabs?.(); } catch {} });
const SINCE = document.getElementsByClassName('anc-since');
setInterval(() => { if (document.hidden || !SINCE.length) return; for (const e of [...SINCE]) { const t = ' ' + Math.floor((now() - +e.dataset.since) / 1000) + 's'; if (e.textContent !== t) e.textContent = t; } }, 1000);
