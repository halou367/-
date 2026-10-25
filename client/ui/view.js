// 界面层：侧栏、标签页、消息渲染、输入框、账号与设置
const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag); e.__anc = 1;   // 客户端自己建的元素：浏览器模式里挂到悬浮层（见 WebLayer）
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v, k === 'onscroll' ? { passive: true } : undefined); else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) if (sv != null) { if (sk.startsWith('--')) e.style.setProperty(sk, String(sv)); else e.style[sk] = sv; } } else e.setAttribute(k, v === true ? '' : v);
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
ICON.qr = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="5.2" y="5.2" width="2.6" height="2.6" rx="0.4" fill="currentColor" stroke="none"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="16.2" y="5.2" width="2.6" height="2.6" rx="0.4" fill="currentColor" stroke="none"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="5.2" y="16.2" width="2.6" height="2.6" rx="0.4" fill="currentColor" stroke="none"/><path d="M14 14h3v3h-3zM18 14h3v3h-3zM14 18h3v3h-3zM18 18h3v3h-3z"/>';
ICON.camera = '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>';
ICON.check = '<path d="M5 12.5 9.5 17 19 7.5"/>';
ICON.eye = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
ICON[' eye'] = ICON.eye;
ICON.RefreshCw = ICON.refresh;
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
const _clockMemo = new Map();
let _clockDayMin = 0;
const clock = ms => {
  if (!ms) return '';
  const nowMin = Math.floor(Date.now() / 60000);
  if (nowMin !== _clockDayMin) { _clockDayMin = nowMin; if (_clockMemo.size > 600) _clockMemo.clear(); }
  const k = Math.floor(ms / 60000);
  const hit = _clockMemo.get(k);
  if (hit !== undefined) return hit;
  const d = new Date(ms), n = new Date(), p = x => String(x).padStart(2, '0'), hm = p(d.getHours()) + ':' + p(d.getMinutes());
  let out;
  if (d.toDateString() === n.toDateString()) out = hm;
  else {
    const y = new Date(n); y.setDate(n.getDate() - 1);
    if (d.toDateString() === y.toDateString()) out = '昨天 ' + hm;
    else out = d.getFullYear() === n.getFullYear() ? (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }
  _clockMemo.set(k, out);
  return out;
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
  dropChats(sids) {
    const d = this.load(); let n = 0;
    const dropped = new Set(Array.isArray(d.droppedSids) ? d.droppedSids : []);
    for (const k of sids) {
      if (k) dropped.add(k);
      if (d.q[k]) { delete d.q[k]; n++; }
    }
    d.droppedSids = [...dropped].slice(-64);
    if (n) this.write(true);
    return n;
  },
  write(push, requireLocal = false) { const d = this.load(), ok = Store.set('drafts@' + this.scope, d) !== false; if (!ok && requireLocal) return false; clearTimeout(this.pt); if (push) this.push(); else this.pt = setTimeout(() => this.push(), 300); return ok; },
  push() { clearTimeout(this.pt); this.pt = 0; const id = this.acct(); if (!id || !Host.shared) return; const value = JSON.parse(JSON.stringify(this.load())); return this.pushTail = (this.pushTail || Promise.resolve()).catch(() => {}).then(() => Host.shared('draft@' + id, value)).catch(e => { console.warn('draft backup', e); }); },
  attOut(a) { return a?.res && a.res.key ? { key: a.res.key, filename: a.res.filename || a.name || 'file', mediaType: a.res.mediaType || a.type || '', size: a.res.size || a.size || 0, hash: a.res.hash || '', url: a.res.url || '' } : null; },
  attIn(r) { return { name: r.filename || 'file', size: r.size || 0, type: r.mediaType || '', state: 'ok', stage: '', pct: 1, res: r, p: Promise.resolve(r), url: /^image\//.test(r.mediaType || '') && r.hash ? Uploads.webPath(r.hash) : null, subs: new Set() }; },
  missing(atts) { return (atts || []).filter(a => !this.attOut(a)).map(a => ({ name: a.name, size: a.size, type: a.type })); },
  entryAtts(e) { return [...(e?.atts || []).map(a => this.attIn(a)), ...(e?.missing || []).map(a => ({ ...a, state: 'bad', err: '附件未上传完成即退出，请重新添加', p: Promise.resolve(null), subs: new Set() }))]; },
  // 启动：宿主那份和本机那份合并（每个标签 / 每个对话的队列按修改时间与移除记录合并；未确认的消息取并集，反正都会再向服务器核对）
  async pull() {
    const d = this.load(), id = this.acct(); let r = null;
    if (id && Host.shared) try { r = await Host.shared('draft@' + id); } catch {}
    if (r && typeof r === 'object') {
      const ackedIds = [...new Set([...(Array.isArray(d.ackedIds) ? d.ackedIds : []), ...(Array.isArray(r.ackedIds) ? r.ackedIds : [])])].slice(-128);
      const acceptedIds = [...new Set([...(Array.isArray(d.acceptedIds) ? d.acceptedIds : []), ...(Array.isArray(r.acceptedIds) ? r.acceptedIds : [])])].slice(-128);
      d.ackedIds = ackedIds;
      d.acceptedIds = acceptedIds;
      const ackedSet = new Set(ackedIds);
      const acceptedSet = new Set(acceptedIds);
      const isProbeTxt = t => typeof SentUserLog !== 'undefined' && typeof SentUserLog.isGachaProbeText === 'function' && SentUserLog.isGachaProbeText(t);
      d.o = (Array.isArray(d.o) ? d.o : []).filter(x => x && x.id && !ackedSet.has(x.id) && !isProbeTxt(x.text));
      const byOutId = new Map(d.o.map(x => [x.id, x]));
      for (const x of Array.isArray(r.o) ? r.o : []) {
        if (!x?.id || ackedSet.has(x.id) || isProbeTxt(x.text)) continue;
        const ex = byOutId.get(x.id);
        if (ex) {
          if (x.acc && !ex.acc) ex.acc = x.acc;
          if (acceptedSet.has(x.id) && !ex.acc) ex.acc = ex.at || now();
        } else {
          if (acceptedSet.has(x.id) && !x.acc) x.acc = x.at || now();
          d.o.push(x);
          byOutId.set(x.id, x);
        }
      }
      for (const x of d.o) {
        if (x && acceptedSet.has(x.id) && !x.acc) x.acc = x.at || now();
      }
      for (const [k, v] of Object.entries(r.t || {})) if (v && (!d.t[k] || (v.at || 0) > (d.t[k].at || 0))) d.t[k] = v;
      for (const [k, v] of Object.entries(r.q || {})) {
        if (!v) continue;
        const sentList = (typeof SentUserLog !== 'undefined' && typeof SentUserLog.readList === 'function') ? SentUserLog.readList(k) : [];
        const sentQIds = new Set();
        const sentTexts = new Set();
        for (const sm of sentList) {
          if (!sm || (!sm._appendAccepted && sm.failed)) continue;
          if (sm.id) sentQIds.add(sm.id);
          if (Array.isArray(sm.queueIds)) for (const qid of sm.queueIds) if (qid) sentQIds.add(qid);
          const st = String(sm.text || '').trim();
          if (st && sm.fromQueue) sentTexts.add(st);
        }
        const lq = d.q[k];
        if (!lq) {
          const vRemoved = new Set([...(v.removedIds || []), ...ackedIds, ...acceptedIds, ...sentQIds]);
          const vClaimed = new Set(d.o.filter(o => o && o.sid === k).flatMap(o => o.queueIds || []));
          const vItems = (Array.isArray(v.items) ? v.items : []).filter(it => it && it.id && !vRemoved.has(it.id) && !vClaimed.has(it.id) && !isProbeTxt(it.text) && !(it.text && sentTexts.has(String(it.text).trim())));
          d.q[k] = { ...v, items: vItems };
          continue;
        }
        const vNewer = (v.at || 0) > (lq.at || 0);
        if (vNewer && (!Array.isArray(v.items) || !v.items.length)) {
          d.q[k] = v;
          continue;
        }
        if (!vNewer && (!Array.isArray(lq.items) || !lq.items.length) && ((lq.at || 0) > 0 || (lq.clearedAt || 0) >= (v.at || 0))) {
          const mergedRem = [...new Set([...(lq.removedIds || []), ...(v.removedIds || [])])].slice(-64);
          if (mergedRem.length) lq.removedIds = mergedRem;
          continue;
        }
        const clearedAt = Math.max(lq.clearedAt || 0, v.clearedAt || 0);
        const removedIds = [...new Set([...(lq.removedIds || []), ...(v.removedIds || [])])].slice(-64);
        const removedSet = new Set([...removedIds, ...ackedIds, ...acceptedIds, ...sentQIds]);
        const claimed = new Set(d.o.filter(o => o && o.sid === k).flatMap(o => o.queueIds || []));
        const mergedMap = new Map();
        const firstList = vNewer ? (lq.items || []) : (v.items || []);
        const secondList = vNewer ? (v.items || []) : (lq.items || []);
        for (const it of [...firstList, ...secondList]) {
          if (!it || !it.id) continue;
          if (removedSet.has(it.id) || claimed.has(it.id) || isProbeTxt(it.text)) continue;
          if (it.text && sentTexts.has(String(it.text).trim())) continue;
          if (clearedAt && (it.at || 0) > 0 && (it.at || 0) <= clearedAt) continue;
          mergedMap.set(it.id, it);
        }
        const mergedItems = [...mergedMap.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
        d.q[k] = {
          ...(vNewer ? lq : v),
          ...(vNewer ? v : lq),
          at: Math.max(lq.at || 0, v.at || 0),
          paused: (vNewer ? v.paused : lq.paused) || '',
          ...(clearedAt ? { clearedAt } : {}),
          ...(removedIds.length ? { removedIds } : {}),
          items: mergedItems,
        };
      }
    }
    const keys = new Set(Tabs.list.map(t => t.key));
    for (const t of Tabs.list) { const e = d.t[t.key]; if (e && typeof e.v === 'string' && e.v !== (t.draft || '')) t.draft = e.v; }
    for (const k of Object.keys(d.t)) if (!k.startsWith('sid:') && !keys.has(k)) delete d.t[k];
    for (const [k, v] of Object.entries(d.q)) if (!v?.items?.length && now() - (v?.at || 0) > 7 * 864e5) delete d.q[k];
    this.ready = true;
    try {
      if (typeof Chats !== 'undefined' && Chats && typeof Chats.values === 'function') {
        for (const c of Chats.values()) {
          if (c && c.sid && !c.gacha) {
            this.hydrateQ(c, true);
            if (Array.isArray(c.messages) && c.messages.length && typeof SentUserLog !== 'undefined' && typeof SentUserLog.restoreInto === 'function') {
              if (SentUserLog.restoreInto(c, { srvPend: Boolean(c.busy || c.streaming) })) {
                try { if (typeof MsgCache !== 'undefined' && typeof MsgCache.put === 'function') MsgCache.put(c); } catch {}
                try { c.emit?.(); } catch {}
              }
            }
          }
        }
      }
      if (typeof UI !== 'undefined') UI.paintQ?.();
    } catch {}
    Tabs.save(); this.write(true);
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
  queueRecord(chat, items = chat.queue || [], extra = {}) {
    const prev = this.load().q[chat.sid];
    const activeIds = new Set((items || []).map(i => i?.id).filter(Boolean));
    const removedIds = [...new Set([...(prev?.removedIds || []), ...(chat._qRemovedIds || []), ...(extra.removedIds || [])])].filter(id => id && !activeIds.has(id)).slice(-32);
    const clearedAt = Math.max(prev?.clearedAt || 0, chat._qClearedAt || 0, extra.clearedAt || 0);
    return { at: Math.max(now(), (+prev?.at || 0) + 1), paused: chat._qPaused || '', ...(clearedAt ? { clearedAt } : {}), ...(removedIds.length ? { removedIds } : {}), items: items.map(i => ({ id: i.id, text: i.text || '', at: i.at || now(),
      atts: (i.atts || []).map(a => this.attOut(a)).filter(Boolean),
      missing: this.missing(i.atts) })) };
  },
  hydrateQ(chat, force = false) {
    if (!chat?.sid || chat.gacha) return;
    const d = this.load();
    if (chat._qh && !force && chat._qhScope === this.scope && (chat._qhReady || !this.ready)) return;
    chat._qh = 1; chat._qhScope = this.scope; chat._qhReady = this.ready;
    const e = d.q[chat.sid], q = (chat.queue ||= []);
    if (e?.clearedAt && (!chat._qClearedAt || e.clearedAt > chat._qClearedAt)) chat._qClearedAt = e.clearedAt;
    if (Array.isArray(e?.removedIds) && e.removedIds.length) {
      chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), ...e.removedIds])].slice(-32);
    }
    const sentList = (typeof SentUserLog !== 'undefined' && typeof SentUserLog.readList === 'function') ? SentUserLog.readList(chat.sid) : [];
    const sentQIds = new Set();
    for (const sm of sentList) {
      if (!sm || (!sm._appendAccepted && sm.failed)) continue;
      if (sm.id) sentQIds.add(sm.id);
      if (Array.isArray(sm.queueIds)) for (const qid of sm.queueIds) if (qid) sentQIds.add(qid);
    }
    const removedSet = new Set([...(chat._qRemovedIds || []), ...(Array.isArray(d.ackedIds) ? d.ackedIds : []), ...(Array.isArray(d.acceptedIds) ? d.acceptedIds : []), ...sentQIds]);
    const claimed = new Set(d.o.filter(o => o && o.sid === chat.sid).flatMap(o => o.queueIds || []));
    const isProbeQ = txt => typeof SentUserLog !== 'undefined' && typeof SentUserLog.isGachaProbeText === 'function' && SentUserLog.isGachaProbeText(txt);
    if (q.length) {
      for (let qi = q.length - 1; qi >= 0; qi--) {
        const qit = q[qi];
        if (isProbeQ(qit?.text)) { changed = true; continue; }
      if (!qit || (qit.id && (claimed.has(qit.id) || removedSet.has(qit.id))) || ((qit.at || 0) > 0 && (chat._qClearedAt || 0) >= (qit.at || 0))) {
          q.splice(qi, 1);
        }
      }
    }
    const existingIds = new Set(q.map(x => x?.id).filter(Boolean));
    if (e?.items?.length) {
      for (const i of e.items) {
        if (!i || isProbeQ(i.text)) continue;
        const iid = i.id || uuid7();
        if (claimed.has(iid) || removedSet.has(iid) || existingIds.has(iid)) continue;
        if ((i.at || 0) > 0 && (chat._qClearedAt || 0) >= (i.at || 0)) continue;
        q.push({ id: iid, text: i.text || '', at: i.at || now(), atts: this.entryAtts(i) });
        existingIds.add(iid);
      }
    }
    if (!chat._qPaused && e?.paused) chat._qPaused = e.paused;
    chat._qsig = this.qsig(chat);
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
    const hasHitlText = Boolean((text && String(text).trim()) || (Array.isArray(opt.parts) && opt.parts.some(p => p?.type === 'text' && String(p.text || '').trim())));
    if (!chat?.sid || chat.gacha || opt.gacha || opt.fingerprint || msg?._gachaProbe || (typeof SentUserLog !== 'undefined' && SentUserLog.isGachaProbeText?.(text)) || (opt.parts && !opt.queueIds?.length && !hasHitlText) || !msg?.id) return;
    const d = this.load(), previous = d.o.find(x => x.id === msg.id); this.sess.add(msg.id);
    const previews = opt.previews || (opt.files || msg.metadata?.uploads || []).map(res => ({ res }));
    const atts = previews.map(a => this.attOut(a)).filter(Boolean), missing = this.missing(previews), queueIds = opt.queueIds || previous?.queueIds;
    const prevAsst = Array.isArray(chat?.messages) ? [...chat.messages].reverse().find(x => x && x !== msg && x.role === 'assistant' && x.id) : null;
    const prevAsstWeight = msg._prevAsstWeight ?? ((prevAsst && typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(prevAsst) : null);
    if (prevAsstWeight != null && msg._prevAsstWeight == null) msg._prevAsstWeight = prevAsstWeight;
    const effText = text || (Array.isArray(opt.parts) ? opt.parts.filter(p => p?.type === 'text').map(p => p.text || '').join('\n') : '') || '';
    d.o = d.o.filter(x => x.id !== msg.id); d.o.push({ id: msg.id, sid: chat.sid, text: effText, at: now(), prevAsstId: msg._prevAsstId || prevAsst?.id || null, prevAsstWeight, atts, missing, ...(queueIds ? { queueIds: queueIds.slice(), fromQueue: true } : {}), ...(msg._held || chat.waitingForeign ? { held: true } : {}) });
    if (opt.queueIds) {
      const ids = new Set(opt.queueIds);
      chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), ...opt.queueIds])].slice(-64);
      const remItems = (chat.queue || []).filter(i => !ids.has(i.id));
      if (!remItems.length) chat._qClearedAt = now();
      d.q[chat.sid] = this.queueRecord(chat, remItems, { removedIds: opt.queueIds, ...(!remItems.length ? { clearedAt: chat._qClearedAt } : {}) });
    }
    if (!this.write(true, true)) { d.o = d.o.filter(x => x.id !== msg.id); if (previous) d.o.push(previous); if (opt.queueIds) d.q[chat.sid] = this.queueRecord(chat); this.sess.delete(msg.id); this.push(); return false; }
    for (const a of opt.previews || []) if (!a.res && a.p) a.p.then(() => { const e = this.load().o.find(x => x.id === msg.id); if (e) { e.atts = opt.previews.map(x => this.attOut(x)).filter(Boolean); e.missing = this.missing(opt.previews); this.write(); } }, () => {});
    return true;
  },
  accepted(id) {
    const d = this.load(), e = d.o.find(x => x.id === id);
    const addAcc = [id, ...(Array.isArray(e?.queueIds) ? e.queueIds : [])].filter(Boolean);
    if (addAcc.length) d.acceptedIds = [...new Set([...(Array.isArray(d.acceptedIds) ? d.acceptedIds : []), ...addAcc])].slice(-128);
    if (e && Array.isArray(e.queueIds) && e.queueIds.length && e.sid && d.q?.[e.sid]) {
      const qRec = d.q[e.sid];
      const qSet = new Set(e.queueIds);
      qRec.removedIds = [...new Set([...(qRec.removedIds || []), ...e.queueIds])].slice(-64);
      if (Array.isArray(qRec.items)) {
        qRec.items = qRec.items.filter(it => it && !qSet.has(it.id));
        if (!qRec.items.length) qRec.clearedAt = Math.max(qRec.clearedAt || 0, now());
      }
      qRec.at = Math.max(now(), (+qRec.at || 0) + 1);
    }
    if (e && !e.acc) e.acc = now();
    this.write(true);
  },
  ack(id) {
    const d = this.load(), hit = d.o.find(x => x.id === id), n = d.o.length;
    const addAck = [id, ...(Array.isArray(hit?.queueIds) ? hit.queueIds : [])].filter(Boolean);
    if (addAck.length) d.ackedIds = [...new Set([...(Array.isArray(d.ackedIds) ? d.ackedIds : []), ...addAck])].slice(-128);
    if (hit && Array.isArray(hit.queueIds) && hit.queueIds.length && hit.sid && d.q?.[hit.sid]) {
      const qRec = d.q[hit.sid];
      const qSet = new Set(hit.queueIds);
      qRec.removedIds = [...new Set([...(qRec.removedIds || []), ...hit.queueIds])].slice(-64);
      if (Array.isArray(qRec.items)) {
        qRec.items = qRec.items.filter(it => it && !qSet.has(it.id));
        if (!qRec.items.length) qRec.clearedAt = Math.max(qRec.clearedAt || 0, now());
      }
      qRec.at = Math.max(now(), (+qRec.at || 0) + 1);
    }
    d.o = d.o.filter(x => x.id !== id);
    if (d.o.length !== n || addAck.length) {
      this.write(true);
      const c = hit?.sid && typeof Chats !== 'undefined' ? Chats.get(hit.sid) : null;
      if (c && typeof SendQ !== 'undefined' && (c.queue || []).length) try { SendQ.check(c); } catch {}
    }
  },
  check(chat) {
    const d = this.load(); if (!d.o.length || !chat?.sid || chat.gacha) return;
    const tailAsst = !chat.busy ? (chat.messages || []).filter(x => x && x.role === 'assistant' && !x._local && !x.metadata?.pending).at(-1) : null;
    const tailAsstAt = tailAsst ? (Date.parse(tailAsst.metadata?.timing?.completedAt || tailAsst.createdAt || '') || (typeof idTime === 'function' ? idTime(tailAsst.id) : 0) || tailAsst._finishedAt || 0) : 0;
    const doneAt = Math.max(chat.tcAt || 0, chat.endAt || 0, chat.finAt || 0, tailAsstAt);
    for (const e of d.o.filter(x => x.sid === chat.sid)) {
      if (typeof SentUserLog !== 'undefined' && SentUserLog.isGachaProbeText?.(e.text)) { this.ack(e.id); continue; }
      const prevAIdx = e.prevAsstId ? (chat.messages || []).findIndex(x => x && x.id === e.prevAsstId) : -1;
      // 服务器已收下（POST 成功）且之后有一轮已经结束：输入已被处理，不管服务器用什么 id / 正文怎么存，都算送达
      const hasFinishedReplyAfter = !chat.busy && doneAt > (e.at || 0) && (chat.messages || []).some((x, idx) => x && x.role === 'assistant' && !x._local && !x.metadata?.pending && idx > prevAIdx && x.id !== e.prevAsstId && ((typeof idTime === 'function' ? idTime(x.id) : 0) || Date.parse(x.metadata?.timing?.completedAt || x.createdAt || '') || doneAt) >= (e.at || 0) - 5000);
      if (!chat.busy && ((e.acc && doneAt > e.acc) || hasFinishedReplyAfter)) {
        try { if (typeof SentUserLog !== 'undefined' && typeof SentUserLog.restoreInto === 'function') SentUserLog.restoreInto(chat); } catch {}
        const mm = chat.messages?.find(x => x.id === e.id);
        if (mm?.deliveryUnknown) { mm.deliveryUnknown = false; mm.failed = false; }
        if (mm) mm._local = false;
        this.ack(e.id);
        continue;
      }
      if (chat.awaitId === e.id && (chat.busy || chat.live)) { if (chat.dlv === 'taken' && chat.turnInput === e.id) this.ack(e.id); continue; }   // 一轮结束后不再因旧 awaitId 跳过核对
      const eTxtNorm = String(e.text || '').trim();
      const m = chat.messages?.find((x, idx) => x && (x.id === e.id || x.metadata?.nodeId === e.id || (x.role === 'user' && eTxtNorm && (x._local || (idx > prevAIdx && (!e.at || !(typeof idTime === 'function' && idTime(x.id)) || idTime(x.id) >= e.at - 15000))) && ((x.parts || []).filter(p => p?.type === 'text').map(p => p.text).join('\n').trim() || String(x.text || '').trim()) === eTxtNorm)));
      if (m && !m._local) { this.ack(e.id); continue; }                  // 服务器的对话记录里已经有这条
      if (!chat.loaded || chat.busy || this.chk.has(e.id)) continue;
      if (m && m.failed && !m.deliveryUnknown && !this.sess.has(e.id)) {
        if ((e.fromQueue || (Array.isArray(e.queueIds) && e.queueIds.length > 0) || e.held) && !e.acc && typeof SendQ !== 'undefined' && typeof SendQ.demoteToQueue === 'function') {
          if (SendQ.demoteToQueue(chat, m, { fromDraft: e, silent: true })) continue;
        }
        this.ack(e.id);
        continue;
      }
      const isCurSess = this.sess.has(e.id);
      const age = now() - (e.at || 0);
      if (isCurSess && age < 30000 && !(doneAt > (e.at || 0))) { if (!this.wait.has(e.id)) { this.wait.add(e.id); setTimeout(() => { this.wait.delete(e.id); this.check(chat); }, 30500 - age); } continue; }
      this.chk.add(e.id);
      chat.inDb(e.id, e.text, e.at).then(r => this.settle(chat, e, m, r));
    }
  },
  settle(chat, e, m, r) {
    this.chk.delete(e.id);
    if (!this.load().o.some(x => x.id === e.id)) return 'done';   // 另一路核对已处理（避免重复放回队列）
    const eTxtNorm = String(e?.text || '').trim();
    if (typeof SentUserLog !== 'undefined' && SentUserLog.isGachaProbeText?.(eTxtNorm)) { this.ack(e.id); return 'ok'; }
    const liveM = chat?.messages?.find(x => x && (x.id === e.id || (x.role === 'user' && x._local && eTxtNorm && ((x.parts || []).filter(p => p?.type === 'text').map(p => p.text).join('\n').trim() || String(x.text || '').trim()) === eTxtNorm))) || (m && chat?.messages?.includes(m) ? m : null);
    if (r === true) {
      this.ack(e.id);
      if (liveM) { liveM.deliveryUnknown = false; liveM.failed = false; liveM._local = false; liveM.v = (liveM.v || 0) + 1; chat.emit(); }
      return 'ok';
    }
    if (r === false) {
      const prevAIdx = e.prevAsstId ? (chat?.messages || []).findIndex(x => x && x.id === e.prevAsstId) : -1;
      const prevA = prevAIdx >= 0 ? chat.messages[prevAIdx] : (!e.prevAsstId ? [...(chat?.messages || [])].reverse().find(x => x && x.role === 'assistant') : null);
      const hasNewAsstAfterPrev = prevAIdx >= 0 && (chat?.messages || []).slice(prevAIdx + 1).some(x => x && x.role === 'assistant' && x.id !== e.prevAsstId);
      if (hasNewAsstAfterPrev) {
        this.ack(e.id);
        return 'ok';
      }
      const prevAW = (prevA && typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(prevA) : 0;
      const prevACompRaw = prevA?.metadata?.timing?.completedAt;
      const prevACompMs = typeof prevACompRaw === 'number' ? prevACompRaw : (typeof prevACompRaw === 'string' ? Date.parse(prevACompRaw) : 0);
      const prevASupplemented = Boolean(prevA && !hasNewAsstAfterPrev && (prevA.metadata?.pending || prevA._incomplete || (e.prevAsstWeight != null && prevAW > e.prevAsstWeight) || (prevACompMs > 0 && (e.at || 0) > 0 && prevACompMs >= (e.at || 0) + 1000 && (typeof idTime === 'function' ? idTime(prevA.id) || 0 : 0) <= (e.at || 0) + 5000)));
      const isPrevSessUnacceptedQueue = Boolean(!this.sess.has(e.id) && !e.acc && (e.fromQueue || (Array.isArray(e.queueIds) && e.queueIds.length > 0) || e.held) && liveM);
      const shouldDemoteToQueue = Boolean(chat && !hasNewAsstAfterPrev && (chat._inDbPrevTurnActive || prevASupplemented || isPrevSessUnacceptedQueue || (!e.acc && (chat.busy || chat.streaming || chat.live))));
      if (shouldDemoteToQueue && typeof SendQ !== 'undefined' && typeof SendQ.demoteToQueue === 'function') {
        if (SendQ.demoteToQueue(chat, liveM || m || e, { fromDraft: e, running: Boolean(chat.busy || chat.streaming || chat.live || prevA?.metadata?.pending) })) {
          return 'queued';
        }
      }
    }
    if (r === false && !liveM) {
      if (m) { m.failed = true; m.deliveryUnknown = false; }
      try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(e.sid, e.id, e.text); } catch {}
      this.restore(e);
      return 'restored';
    }
    // 服务器确实没有、本地还留着这条：标成发送失败（消息上有「重试」）并清掉待确认记录。
    if (r === false && liveM) {
      liveM.deliveryUnknown = false;
      liveM.failed = true;
      delete liveM._appendAccepted;
      liveM.v = (liveM.v || 0) + 1;
      try { if (typeof SentUserLog !== 'undefined' && SentUserLog.markFailed) SentUserLog.markFailed(chat.sid, liveM.id, e.text); } catch {}
      if (!chat.busy) {
        chat.status = 'error';
        if (!chat.error) chat.error = '上一条消息未发出（服务器未收到），请点击重试';
      }
      this.ack(e.id);
      chat.emit();
      toast('有一条消息服务器没有收到：已标为发送失败，可点「重试」');
      return 'failed';
    }
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
    try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(e.sid, e.id, e.text); } catch {}
    const chat = Chats.get(e.sid);
    if (chat && (chat.queue?.length || e?.fromQueue || (Array.isArray(e?.queueIds) && e.queueIds.length > 0) || e?.held)) {
      const q = (chat.queue ||= []);
      const qid = e.queueIds?.[0] || uuid7();
      if (!q.some(x => x && (x.id === qid || (e.text && String(x.text || '').trim() === String(e.text || '').trim())))) {
        q.unshift({ id: qid, text: e.text || '', at: e.at || now(), atts: this.entryAtts(e) });
      }
      if (Array.isArray(chat._qRemovedIds) && chat._qRemovedIds.includes(qid)) {
        chat._qRemovedIds = chat._qRemovedIds.filter(x => x !== qid);
      }
      chat._qPaused = (e?.fromQueue || (Array.isArray(e?.queueIds) && e.queueIds.length > 0)) && !chat.queue.slice(1).length ? '' : '已恢复上一条未送达消息，请核对后手动继续';
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
    if (!chat._qh || chat._qhScope !== this.scope || (!chat._qhReady && this.ready)) this.hydrateQ(chat);
    const sig = this.qsig(chat);
    if (sig !== chat._qsig) {
      const existingQ = this.load().q?.[chat.sid];
      if (!(chat.queue || []).length && existingQ?.items?.length && !chat._qClearedAt && !(chat._qRemovedIds && chat._qRemovedIds.length) && (!this.ready || chat._qhScope !== this.scope)) {
        this.hydrateQ(chat, true);
      } else {
        chat._qsig = sig;
        this.setQ(chat);
      }
    }
    this.check(chat);
  },
};
addEventListener('visibilitychange', () => { if (document.hidden && Drafts.d) Drafts.write(true); });
addEventListener('pagehide', () => { if (Drafts.d) Drafts.write(true); });
addEventListener('beforeunload', () => { try { Drafts.syncTabs(); if (Drafts.d) Drafts.write(true); } catch {} });
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
      !chat.busy || chat.status === 'error' ? h('button', { class: 'btn ghost', onclick: async () => { back.remove(); if (await UI.confirmPureIpBeforeSend()) void SendQ.flush(chat, { manual: true }); } }, '立即发送') : null,
      h('button', { class: 'btn', onclick: () => back.remove() }, '关闭'));
    back = modal('队列 ' + q.length + ' 条', body, foot, 'sq-modal'); back.classList.add('sq-back');
    paint();
    // 队列变了（本轮结束自动发出 / 输入框里又加了一条）→ 跟着刷新；发完了自动关闭
    const sig = () => q.map(i => i.id).join(',') + '|' + SendQ.mode(chat) + '|' + SendQ.status(chat); let last = sig();
    const off = Bus.on('chat', c => { if (c !== chat) return; if (!back.isConnected) { off(); return; } const k = sig(); if (k !== last) { last = k; paint(); } });
  }
});
Bus.on('chat', c => { try { Drafts.onChat(c); } catch (e) { console.warn(e); } if (c && (c.queue?.length || (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length))) SendQ.check(c); });

// 按顺序把 box 的子节点变成 nodes：相同节点原地保留，只插入 / 移动 / 删除差异部分（避免整块重建引起的重排和卡顿）
const patchKids = (box, nodes) => {
  if (!box || typeof box.insertBefore !== 'function') return;
  const list = Array.isArray(nodes) ? nodes.filter(n => n && typeof n === 'object' && typeof n.nodeType === 'number') : [];
  const keep = new Set(list);
  for (const c of [...box.children]) if (!keep.has(c)) c.remove();
  for (let i = 0; i < list.length; i++) { const cur = box.children[i]; if (cur !== list[i]) box.insertBefore(list[i], cur || null); }
  while (box.children.length > list.length) box.lastElementChild.remove();
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
  async blob(src, imgEl) {
    try {
      const r = await rawFetch(src, { credentials: 'same-origin' });
      if (r.ok) return await r.blob();
    } catch {}
    try {
      const r2 = await rawFetch(src, { credentials: 'omit' });
      if (r2.ok) return await r2.blob();
    } catch {}
    const el = (imgEl && imgEl.tagName === 'IMG' && imgEl.naturalWidth > 0)
      ? imgEl
      : [...document.querySelectorAll('img')].find(x => (x.currentSrc === src || x.getAttribute('src') === src) && x.naturalWidth > 0);
    if (el) {
      try {
        const cv = document.createElement('canvas');
        cv.width = el.naturalWidth;
        cv.height = el.naturalHeight;
        cv.getContext('2d').drawImage(el, 0, 0);
        const b = await new Promise(res => cv.toBlob(res, 'image/png'));
        if (b) return b;
      } catch {}
    }
    const r3 = await rawFetch(src);
    if (!r3.ok) throw new Error('HTTP ' + r3.status);
    return r3.blob();
  },
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
  async copy(src, imgEl) {
    try {
      const b = await this.blob(src, imgEl);
      const pngBlob = await this.png(b);
      let copied = false, lastErr = null;
      if (Host.copyImage && Host.platform !== 'android') {
        try {
          const r = await Host.copyImage(await this.b64(pngBlob));
          if (r?.ok) copied = true;
          else lastErr = new Error(r?.error || '复制失败');
        } catch (err) { lastErr = err; }
      }
      if (!copied && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          copied = true;
        } catch (err) { if (!lastErr) lastErr = err; }
      }
      if (!copied) throw (lastErr || new Error('复制失败'));
      toast('图片已复制');
    } catch (e) { toast('复制图片失败：' + describe(e), 'err'); }
  },
  async save(src, name, imgEl) {
    try {
      const b = await this.blob(src, imgEl), nm = this.name(src, name, b.type);
      if (Host.saveImage) { const r = await Host.saveImage(nm, await this.b64(b), b.type || 'image/png'); if (r?.canceled) return; if (!r?.ok) throw new Error(r?.error || '保存失败'); toast(Host.platform === 'android' ? '已保存到相册（' + (r.path || 'Pictures/BranaAi') + '）' : '已保存：' + (r.path || nm)); return; }
      saveBlob(b, nm);
    } catch (e) { toast('保存图片失败：' + describe(e), 'err'); }
  },
  menu(e, src, name, zoomed, imgEl) {
    const targetImg = imgEl || (e?.target?.tagName === 'IMG' ? e.target : null);
    document.querySelectorAll('.menu:not(.anc-gh).imenu').forEach(m => m.remove());
    const m = h('div', { class: 'menu imenu', style: { left: Math.min(e.clientX, innerWidth - 180) + 'px', top: Math.min(e.clientY, innerHeight - 130) + 'px', zIndex: 400 } },
      zoomed ? null : h('button', { onclick: () => { m.remove(); ImgView.open(src, name, targetImg || e.target); } }, icon('expand'), '查看大图'),
      this.canCopy() ? h('button', { onclick: () => { m.remove(); this.copy(src, targetImg); } }, icon('copy'), '复制图片') : null,
      h('button', { onclick: () => { m.remove(); this.save(src, name, targetImg); } }, icon('dl'), Host.platform === 'android' ? '保存到相册' : '图片另存为…'));
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
  const raw = e.target;
  if (!raw || raw.closest?.('.att-zoom,.pane')) return;
  const t = raw.tagName === 'IMG' ? raw : raw.closest?.('.att-img')?.querySelector?.('img');
  if (!t || t.tagName !== 'IMG') return;
  if (!(t.closest('.att-img,.att-row,.md,.msg,.thread') || t.classList.contains('file-img'))) return;
  const src = t.currentSrc || t.getAttribute('src'); if (!src || /^data:image\/svg/.test(src)) return;
  e.preventDefault(); ImgAct.menu(e, src, t.alt || '', false, t);
});
const copyText = async t => { try { await navigator.clipboard.writeText(t); toast('已复制'); } catch { const ta = h('textarea', {}, t); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制'); } };
// 对话状态：run 进行中（图标顺时针转）/ bad 出错（红）/ ok 正常完成（绿）/ '' 未知
const chatState = c => { if (!c) return ''; if (typeof Hitl !== 'undefined' ? Hitl.blocked(c) : c.busy) return 'run'; const last = c.messages?.at(-1); const hasFailedMsg = Boolean(last?.failed || (c.messages || []).some(m => m?.role === 'user' && m.failed) || (typeof SentUserLog !== 'undefined' && SentUserLog.hasFailed?.(c.sid))); if (c.error || hasFailedMsg || (last?.parts || []).some(p => p.type === 'error')) return 'bad'; return c.loaded && last?.role === 'assistant' ? 'ok' : ''; };
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
    if (focus) {
      this.active = t.key;
      if (sid && typeof RunningTracker !== 'undefined') RunningTracker.markViewed(sid);
    }
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
  openGacha() {
    const curChat = this.cur?.sid && typeof Chats !== 'undefined' ? Chats.get(this.cur.sid) : null;
    const isBattle = curChat
      ? Boolean((curChat.isEvaluation && curChat.evalMode === 'battle') || (typeof EvalView !== 'undefined' && EvalView.isBattleChat?.(curChat)))
      : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' && ModeState.getMode() === 'battle');
    if (isBattle) { try { GPop.close?.(); } catch {} return null; }
    if (!UI.me) { UI.loginGate('请先登录，再开始抽卡'); return null; }
    GPop.openAny();
    return null;
  },
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
  of(mid) { let s = this.all.get(mid); if (!s) { s = new Map(); this.all.set(mid, s); if (this.all.size > 2400) this.all.delete(this.all.keys().next().value); } return s; },
  // off = 临时渲染（离屏预览等）：一律新建节点、不进缓存，绝不把正在界面上用的节点挪走
  off: false,
  use(mid, key, sig, make) { if (this.off) return make(); const s = this.of(mid), c = s.get(key); if (c && c.sig === sig && c.el && typeof c.el.nodeType === 'number') return c.el; const el = make(c?.el && typeof c.el.nodeType === 'number' ? c.el : null); if (el && typeof el.nodeType === 'number') s.set(key, { sig, el }); else s.delete(key); return el; },
  box(mid, key, make) { if (this.off) return make(); const s = this.of(mid); let c = s.get(key); if (!c || !c.el || typeof c.el.nodeType !== 'number') { c = { sig: 'box', el: make() }; s.set(key, c); } return c.el; },
  drop(mid) { if (mid) this.all.delete(mid); },
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
    const tailLen = text.length - (box.__st?.end || 0);
    const smooth = Prefs.smoothStream !== false && !document.hidden && tailLen <= 1200 && this.twCost <= 4;
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
      const tasks = [];
      for (const box of this.tw) {
        const tw = box.__tw;
        if (!tw || !box.isConnected || document.hidden || Prefs.smoothStream === false) {
          this.tw.delete(box);
          if (tw && box.isConnected) { tw.shown = tw.text.length; tasks.push({ box, text: tw.text, live: tw.live, sc: null, atBot: false, done: true }); }
          continue;
        }
        const dt = Math.min(100, tw.at ? t - tw.at : 16); tw.at = t;
        if (this.twCost > 6 && dt < 28) { tw.at -= dt; continue; }
        const left = tw.text.length - tw.shown;
        const cps = tw.live ? Math.max(180, left / 0.08) : Math.max(900, left / 0.05);
        tw.shown = Math.min(tw.text.length, tw.shown + Math.max(2, cps * dt / 1000));
        const sc = box.closest('.scroller'), atBot = Boolean(sc && sc.scrollTop + sc.clientHeight > sc.scrollHeight - 80);
        tasks.push({ box, tw, text: this.cut(tw.text, tw.shown), live: tw.live || tw.shown < tw.text.length, sc, atBot, done: tw.shown >= tw.text.length });
      }
      const scrollTargets = new Set();
      for (const k of tasks) {
        this.paint0(k.box, k.text, k.live);
        if (k.atBot && k.sc) scrollTargets.add(k.sc);
        if (k.done && k.tw) { this.tw.delete(k.box); if (!k.tw.live) { delete k.box.__tw; this.paint0(k.box, k.tw.text, false); } }
      }
      for (const sc of scrollTargets) sc.scrollTop = sc.scrollHeight;
      this.twCost = this.twCost * .8 + (performance.now() - t0) * .2;
      if (this.tw.size) this.twTick();
    });
  },
  // box 是持久的 .md 容器；text 只会在末尾追加（流式）；不是追加（被整条替换）时从头重建
  paint0(box, text, streaming) {
    let st = box.__st;
    if (!st || text.length < st.end || (st.end && text.slice(0, st.end) !== st.head)) { st = box.__st = { end: 0, head: '', els: [], tail: null, tailSrc: null, shownLen: 0 }; }
    st.shownLen = text.length;
    for (;;) { const c = this.safeCut(text, st.end); if (c < 0) break; st.els.push(this.chunk(text.slice(st.end, c))); st.end = c; st.head = text.slice(0, c); }
    const tail = text.slice(st.end);
    if (tail !== st.tailSrc) { st.tailSrc = tail; if (!st.tail) st.tail = h('div', { class: 'mdc' }); st.tail.innerHTML = tail.trim() ? MD.render(tail) : ''; }
    patchKids(box, tail.trim() ? [...st.els, st.tail] : st.els);
    box.classList.toggle('streaming', !!streaming);
    return box;
  },
};

// ---------- 消息渲染 ----------
// ---------- 命令翻译（移植并优化自 Arena 命令翻译 v1.2.5，素雅配色 + 辅助习惯识别）----------
const CmdTranslate = (() => {
  const HOME = '/home/user';
  const PUNCT = ';&|<>()';
  const set = s => { const o = Object.create(null); s.split(' ').forEach(k => { if (k) o[k] = 1; }); return o; };
  const OP_READ = set('cat head tail less more bat nl wc jq diff cmp md5sum sha256sum xxd hexdump file strings');
  const OP_SEARCH = set('grep egrep fgrep rg ag find fd ls tree locate');
  const OP_SKIP = set('sudo nice time command exec nohup stdbuf xargs');
  const OP_SEP = set('&& || ; | & |& ;; ( )');
  const VALUE_OPT = set('--state --cwd --room --timeout --port --limit --after --wait-seconds --seq --text --summary --grep --path --checkpoint --base --url --history --level --key');
  const NOT_FILE = set('head tail cut sort uniq grep sed awk cat echo xargs wc tr python3 python node bash sh');
  const HEREDOC = /(?<!<)<<-?(?!<)\s*(['"]?)([A-Za-z_]\w*)\1/g;
  const PY_OPEN = /open\(\s*([^,()]+?)\s*(?:,\s*(?:mode\s*=\s*)?['"]([rwaxbt+]{1,4})['"])?\s*[,)]/g;
  const PY_ASSIGN = /(?:^|[;\s])([A-Za-z_]\w*)\s*=\s*(['"])([^'"\n]{1,300})\2/gm;
  const PY_WTEXT = /Path\(\s*(['"])([^'"]+)\1\s*\)\.write_(?:text|bytes)/g;
  const SK_VALID = /^[\w\u4e00-\u9fff][\w\u4e00-\u9fff.-]{0,63}$/;
  const SK_API = /\/api\/agent\/skill\?(?:[^\s'"]*&)?id=([^&\s'"]{1,200})/g;
  const SK_PATH = /(?:云端本地Agent|agent-lib\/[^/]+)\/skills\/([^/]+)(?:\/|$)/;
  const _partCache = new Map();

  function normpath(p) {
    if (!p) return '.';
    const abs = p.charAt(0) === '/';
    const initial = abs && p.slice(0, 2) === '//' && p.charAt(2) !== '/' ? 2 : (abs ? 1 : 0);
    const out = [];
    p.split('/').forEach(c => {
      if (!c || c === '.') return;
      if (c !== '..' || (!initial && !out.length) || (out.length && out[out.length - 1] === '..')) out.push(c);
      else if (out.length) out.pop();
    });
    const s = (initial ? '/'.repeat(initial) : '') + out.join('/');
    return s || '.';
  }
  function join(a, b) { if (b.charAt(0) === '/') return b; if (!a) return b; return a.charAt(a.length - 1) === '/' ? a + b : a + '/' + b; }
  function basename(p) { const i = p.lastIndexOf('/'); return p.slice(i + 1); }
  function expanduser(p) { return p === '~' ? HOME : (p.slice(0, 2) === '~/' ? HOME + p.slice(1) : p); }
  function scratch(p) { return /^\/(tmp|dev|proc|var\/tmp)\//.test(p) || p === '/tmp' || p === '/dev/null' || p === '-'; }
  function shortName(p) { return basename(String(p || '').replace(/\/+$/, '')) || p; }
  function host(u) { const m = /^[a-z]+:\/\/([^/?#\s]+)/i.exec(u || ''); return m ? m[1] : ''; }

  function shlexSplit(s) {
    const toks = [];
    let tok = '', state = ' ', quoted = false, i = 0;
    const push = () => { if (tok !== '' || quoted) toks.push(tok); tok = ''; quoted = false; };
    while (i <= s.length) {
      const c = i < s.length ? s.charAt(i) : null; i++;
      if (state === "'") { if (c === null) throw new Error('No closing quotation'); if (c === "'") state = 'a'; else tok += c; continue; }
      if (state === '"') {
        if (c === null) throw new Error('No closing quotation');
        if (c === '"') { state = 'a'; continue; }
        if (c === '\\') { const n = i < s.length ? s.charAt(i) : null; if (n === null) throw new Error('No closing quotation'); if (n === '"' || n === '\\') { tok += n; i++; } else { tok += c + n; i++; } continue; }
        tok += c; continue;
      }
      if (state === 'p') {
        if (c !== null && PUNCT.indexOf(c) >= 0) { tok += c; continue; }
        toks.push(tok); tok = ''; state = ' '; i--; continue;
      }
      if (c === null) { if (state === 'a') push(); break; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { if (state === 'a') push(); state = ' '; continue; }
      if (c === '#') { if (state === 'a') push(); state = ' '; while (i < s.length && s.charAt(i) !== '\n') i++; continue; }
      if (PUNCT.indexOf(c) >= 0) { if (state === 'a') push(); tok = c; state = 'p'; continue; }
      if (c === '\\') { if (i >= s.length) throw new Error('No escaped character'); tok += s.charAt(i); i++; state = 'a'; continue; }
      if (c === "'" || c === '"') { quoted = true; state = c; continue; }
      tok += c; state = 'a';
    }
    if (state === 'p' && tok) toks.push(tok);
    return toks;
  }

  function pyFiles(body) {
    const names = Object.create(null), rd = [], wr = [];
    let m;
    PY_ASSIGN.lastIndex = 0; while ((m = PY_ASSIGN.exec(body))) names[m[1]] = m[3];
    PY_OPEN.lastIndex = 0;
    while ((m = PY_OPEN.exec(body))) {
      const arg = m[1].trim(), mode = m[2] || 'r';
      let path;
      if (arg.length > 1 && (arg[0] === "'" || arg[0] === '"') && arg[arg.length - 1] === arg[0]) path = arg.slice(1, -1);
      else if (/^[A-Za-z_]\w*$/.test(arg) && names[arg] !== undefined) path = names[arg];
      else continue;
      (/[wax+]/.test(mode) ? wr : rd).push(path);
    }
    PY_WTEXT.lastIndex = 0; while ((m = PY_WTEXT.exec(body))) wr.push(m[2]);
    return [rd, wr];
  }

  function cmdOps(cmd, cwd) {
    const read = [], edit = [], cnt = { search: 0, push: 0, pull: 0, notes: 0 }, skills = [];
    let cur = cwd || '/';
    const skill = (sid, how) => {
      sid = String(sid || '').trim();
      if (SK_VALID.test(sid) && !skills.some(k => k.id === sid && k.how === how) && skills.length < 8) skills.push({ id: sid, how });
    };
    const norm = p => {
      p = String(p || '').trim();
      if (!p || p.charAt(0) === '-' || p.indexOf('\n') >= 0) return null;
      if (p.slice(0, 2) === '~/') p = expanduser(p);
      if (p.charAt(0) !== '/' && p.charAt(0) !== '$') p = join(cur, p);
      if (p.charAt(0) !== '$') p = normpath(p);
      return scratch(p) ? null : p;
    };
    const add = (lst, p) => { const q = norm(p); if (q && lst.indexOf(q) < 0 && lst.length < 40) lst.push(q); };
    const lines = String(cmd || '').split('\n'), logical = [];
    let i = 0;
    while (i < lines.length) {
      const ln = lines[i++]; const bodies = [];
      let m;
      HEREDOC.lastIndex = 0;
      while ((m = HEREDOC.exec(ln))) {
        const tag = m[2], body = [];
        while (i < lines.length && lines[i].trim() !== tag) { body.push(lines[i]); i++; }
        i++;
        if (/\bpython[\d.]*\b[^|;&]*<</.test(ln)) bodies.push(body.join('\n'));
      }
      logical.push([ln, bodies]);
    }
    logical.forEach(pair => {
      const ln = pair[0].replace(HEREDOC, ' ');
      let toks;
      try { toks = shlexSplit(ln); } catch { toks = ln.split(/\s+/).filter(Boolean); }
      let words = [];
      const segs = [];
      toks.concat([';']).forEach(t => { if (OP_SEP[t]) { segs.push(words); words = []; } else words.push(t); });
      segs.forEach(w => {
        const clean = [];
        let j = 0;
        while (j < w.length) {
          const t = w[j];
          if ((t === '>' || t === '>>' || t === '>|' || t === '&>' || t === '&>>') && j + 1 < w.length) {
            const fd = clean.length && (clean[clean.length - 1] === '1' || clean[clean.length - 1] === '2') ? clean[clean.length - 1] : '';
            if (fd !== '2') add(edit, w[j + 1]);
            if (fd) clean.pop();
            j += 2; continue;
          }
          if (t === '>&' || t === '<&' || t === '<<<') { j += 2; continue; }
          if (t === '<' && j + 1 < w.length) { add(read, w[j + 1]); j += 2; continue; }
          clean.push(t); j++;
        }
        w = clean;
        while (w.length && (/^[A-Za-z_]\w*=[^\n]*$/.test(w[0]) || OP_SKIP[w[0]])) w = w.slice(1);
        if (w.length && w[0] === 'timeout') { w = w.slice(1); while (w.length && (w[0].charAt(0) === '-' || /^[\d.]+[smhd]?$/.test(w[0]))) w = w.slice(1); }
        if (w.length && w[0] === 'env') { w = w.slice(1); while (w.length && (w[0].charAt(0) === '-' || w[0].indexOf('=') >= 0)) w = (w[0] === '-u' || w[0] === '--unset') ? w.slice(2) : w.slice(1); }
        if (!w.length) return;
        const name = basename(w[0]), args = w.slice(1);
        if (name === 'cd') { if (args.length && args[0] !== '-') { const q = args[0].charAt(0) === '/' ? args[0] : join(cur, args[0]); cur = normpath(expanduser(q)); } return; }
        const files = args.filter(a => a.charAt(0) !== '-');
        if (OP_SEARCH[name] || (name === 'diff' && args.some(a => a.charAt(0) === '-' && (a.indexOf('r') >= 0 || a.indexOf('q') >= 0)))) { cnt.search++; return; }
        if (OP_READ[name]) { files.forEach(a => add(read, a)); return; }
        if (name === 'sed' || name === 'awk' || name === 'gawk') {
          const inplace = name === 'sed' && args.some(a => a === '-i' || a.slice(0, 2) === '-i' || a === '--in-place');
          const hasE = args.some(a => a === '-e' || a === '-f' || a === '--expression');
          (hasE ? files : files.slice(1)).forEach(a => add(inplace ? edit : read, a));
          return;
        }
        if (name === 'tee') { files.forEach(a => add(edit, a)); return; }
        if (name === 'cp' || name === 'mv' || name === 'install' || name === 'rsync' || name === 'scp') {
          if (files.length >= 2) {
            files.slice(0, -1).forEach(a => add(read, a));
            const dst = files[files.length - 1];
            if (((name === 'cp' || name === 'mv') && files.length > 2) || dst.charAt(dst.length - 1) === '/') files.slice(0, -1).forEach(a => add(edit, join(dst, basename(a.replace(/\/+$/, '')))));
            else add(edit, dst);
            if (name === 'rsync' || name === 'scp') cnt.push++;
          }
          return;
        }
        if (name === 'touch' || name === 'truncate' || name === 'rm' || name === 'unlink' || name === 'patch') { files.forEach(a => add(edit, a)); return; }
        if (/^python[\d.]*$/.test(name)) {
          const script = files[0] || '';
          const k = args.indexOf('-c');
          if (k >= 0) { if (k + 1 < args.length) { const rw = pyFiles(args[k + 1]); rw[0].forEach(p => add(read, p)); rw[1].forEach(p => add(edit, p)); } return; }
          if (/chatroom\.py$/.test(script)) {
            let rest = args.slice(args.indexOf(script) + 1);
            while (rest.length && rest[0].charAt(0) === '-') rest = rest[0] === '--state' ? rest.slice(2) : rest.slice(1);
            if (rest.length >= 2 && rest[0] === 'skill') {
              if (rest[1] === 'add' && rest.length >= 3 && /^(https?:\/\/|[\w.-]+\/[\w.-]+)/.test(rest[2])) skill(rest[2].replace(/\/+$/, '').split('/').pop().slice(0, 64), 'install');
              else if (rest[1].charAt(0) !== '-' && ['add', 'list', 'ls'].indexOf(rest[1]) < 0) skill(rest[1], 'read');
            }
            return;
          }
          if (/bridge_sync\.py$/.test(script)) {
            const sub = args.slice(args.indexOf(script) + 1).filter(a => a.charAt(0) !== '-')[0] || '';
            if (sub === 'push') cnt.push++; else if (sub === 'pull' || sub === 'restore') cnt.pull++; else if (sub === 'notes') cnt.notes++;
          }
          return;
        }
        if (name === 'curl') {
          const url = args.join(' ');
          let mm;
          SK_API.lastIndex = 0; while ((mm = SK_API.exec(url))) { let id; try { id = decodeURIComponent(mm[1]); } catch { id = mm[1]; } skill(id.slice(0, 64), 'read'); }
          if (url.indexOf('/api/bundle') >= 0) cnt[/(?:^|\s)(?:-X\s*POST|-d|--data\S*|-F|--json)\b/.test(url) ? 'push' : 'pull']++;
          else if (/\/api\/(?:file|read)\b/.test(url)) cnt.pull++;
          return;
        }
      });
      pair[1].forEach(b => { const rw = pyFiles(b); rw[0].forEach(p => add(read, p)); rw[1].forEach(p => add(edit, p)); });
    });
    read.concat(edit).forEach(p => { const m = SK_PATH.exec(p); if (m) skill(m[1], 'read'); });
    const out = {};
    if (skills.length) out.skills = skills;
    if (read.length) out.read = read;
    if (edit.length) out.edit = edit;
    for (const key in cnt) if (cnt[key]) out[key] = cnt[key];
    return out;
  }

  function scriptArgs(a, script) {
    const i = a.indexOf(script), out = [];
    for (let j = i + 1; j < a.length; j++) {
      const x = a[j];
      if (x.length > 1 && x.charAt(0) === '-') { if (x.indexOf('=') < 0 && VALUE_OPT[x]) j++; continue; }
      out.push(x);
    }
    return out;
  }

  function looksLikeFile(p) {
    const b = shortName(p);
    return !!b && !/^\d+$/.test(b) && !/[(){};'"`|<>,$]/.test(b) && !NOT_FILE[b];
  }
  function filterFiles(list) { return (list || []).filter(looksLikeFile); }
  function compactFile(p, maxLen = 18) {
    let b = shortName(p);
    if (!b) return '';
    b = b.replace(/([0-9a-f]{6,8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '$1');
    if (b.length <= maxLen) return b;
    const dot = b.lastIndexOf('.');
    const ext = (dot > 0 && b.length - dot <= 7) ? b.slice(dot) : '';
    const stem = ext ? b.slice(0, dot) : b;
    const keep = Math.max(4, maxLen - ext.length - 1);
    return stem.slice(0, keep) + '…' + ext;
  }
  function disp(p) {
    const b = shortName(p);
    if (/[*?]/.test(b)) { const sg = String(p).replace(/\/+$/, '').split('/'); return sg.slice(-2).join('/'); }
    return compactFile(b, 18);
  }
  function names(list, max) {
    const n = list.map(disp);
    return n.slice(0, max).join('、') + (n.length > max ? ' 等 ' + n.length + ' 个' : '');
  }
  function kindOf(s) {
    if (/^(跑测试|语法检查|类型检查|检查)/.test(s)) return 'test';
    if (/^(构建|打包|编译|安装)/.test(s)) return 'build';
    if (/^(浏览器|网络请求|抓取)/.test(s)) return 'web';
    if (/^(本机终端|聊天室|MCP)/.test(s)) return 'chat';
    if (/^(写回本机|拉取|更新交接笔记|交接笔记|查看本机|检查连接|查看同步)/.test(s)) return 'sync';
    if (/^等待/.test(s)) return 'wait';
    if (/^删除/.test(s)) return 'del';
    if (/^(后台启动|停止后台)/.test(s)) return 'proc';
    return 'act';
  }
  function countLines(t) { return t ? String(t).split('\n').length : 0; }
  function lineDiff(a, b) {
    const x = String(a || '').split('\n'), y = String(b || '').split('\n');
    let i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    let j = 0;
    while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
    return { add: y.length - i - j, del: x.length - i - j };
  }
  function heredocWrites(cmd) {
    const out = {};
    const re = /(?:^|[\n;&|]\s*)(?:cat|tee(?:\s+-a)?)\s*(>>?)?\s*['"]?([^\s'"<>|;&]+)['"]?\s*<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\3[ \t]*(?=\n|$)/g;
    let m;
    while ((m = re.exec(cmd))) out[m[2]] = (out[m[2]] || 0) + countLines(m[4]);
    return out;
  }

  function actions(cmd) {
    const acts = [], seen = Object.create(null), cards = [];
    acts.cards = cards;
    const act = (s, weight = 5, bridge = false) => { if (s && !seen[s]) { seen[s] = 1; acts.push({ s, w: weight, b: !!bridge }); } };
    const card = c => {
      Object.keys(c).forEach(k => { if (c[k] === '' || (k === 'meta' && /\$/.test(c[k]))) delete c[k]; });
      const sig = JSON.stringify(c);
      if (!cards.some(x => JSON.stringify(x) === sig) && cards.length < 3) cards.push(c);
    };
    const optVal = (a, name) => { const i = a.indexOf(name); return i >= 0 && i + 1 < a.length ? a[i + 1] : ''; };
    const optList = (a, name) => { const i = a.indexOf(name), out = []; if (i < 0) return out; for (let j = i + 1; j < a.length && a[j].charAt(0) !== '-'; j++) out.push(a[j]); return out; };
    const body = String(cmd || '').split('\n');
    let lines = [], i = 0, m;
    while (i < body.length) {
      const ln = body[i++]; HEREDOC.lastIndex = 0;
      while ((m = HEREDOC.exec(ln))) { const tag = m[2]; while (i < body.length && body[i].trim() !== tag) i++; i++; }
      lines.push(ln.replace(HEREDOC, ' '));
    }
    const merged = [];
    let buf = null;
    lines.forEach(ln => {
      buf = buf === null ? ln : buf + '\n' + ln;
      let q = '', esc = false;
      for (let c = 0; c < buf.length; c++) {
        const ch = buf.charAt(c);
        if (esc) { esc = false; continue; }
        if (ch === '\\' && q !== "'") { esc = true; continue; }
        if (q) { if (ch === q) q = ''; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (ch === '#' && (c === 0 || /\s/.test(buf.charAt(c - 1)))) break;
      }
      if (!q) { merged.push(buf); buf = null; }
    });
    if (buf !== null) merged.push(buf);
    lines = merged;
    const vars = { HOME }, trivial = [];
    const subst = t => t.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (all, k) => Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : all);
    lines.forEach(ln => {
      let toks;
      try { toks = shlexSplit(ln); } catch { toks = ln.split(/\s+/).filter(Boolean); }
      const segs = [];
      let words = [];
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (OP_SEP[t] || (/^[();&|]+$/.test(t) && /[;&|]/.test(t))) { segs.push(words); words = []; continue; }
        if (/^[<>&]+\|?$/.test(t)) {
          if (words.length && /^\d$/.test(words[words.length - 1])) words.pop();
          if (t !== '<<' && t !== '<<-') k++;
          continue;
        }
        words.push(t);
      }
      segs.push(words);
      segs.forEach(w => {
        if (w[0] === 'command' && w[1] === '-v') { trivial.push('检查命令'); return; }
        while (w.length > 1 && /^(do|then|else|elif|if|while|until|!|\{)$/.test(w[0])) w = w.slice(1);
        while (w.length && (/^[A-Za-z_]\w*=/.test(w[0]) || OP_SKIP[w[0]])) {
          const mv = /^([A-Za-z_]\w*)=(.*)$/.exec(w[0]); if (mv && w.length === 1) vars[mv[1]] = mv[2];
          w = w.slice(1);
        }
        w = [].concat(...w.map(t => { const r = subst(t); if (r !== t && /\s/.test(r)) { try { return shlexSplit(r); } catch { return r.split(/\s+/); } } return [r]; }));
        while (w.length && w[0] === 'env') { w = w.slice(1); while (w.length && (w[0].charAt(0) === '-' || /^[A-Za-z_]\w*=/.test(w[0]))) { if (w[0] === '-u') w = w.slice(1); w = w.slice(1); } }
        if (w.length && w[0] === 'timeout') { w = w.slice(1); while (w.length && (w[0].charAt(0) === '-' || /^[\d.]+[smhd]?$/.test(w[0]))) w = w.slice(1); }
        if (!w.length) return;
        const name = basename(w[0]), a = w.slice(1), plain = a.filter(x => x.charAt(0) !== '-');
        const sub = plain[0] || '', joined = a.join(' ');
        if (/^python[\d.]*$/.test(name)) {
          const script = plain[0] || '', rest = scriptArgs(a, script);
          if (/\.py$/.test(script) && (a.indexOf('--help') >= 0 || a.indexOf('-h') >= 0)) { act('查看用法 ' + shortName(script), 3); return; }
          if (/bridge_sync\.py$/.test(script)) {
            const s = rest[0], lbl = ({ push: '写回本机', pull: '从本机拉取', restore: '从本机拉取', notes: '更新交接笔记', changed: '查看本机改动', ping: '检查连接', status: '查看同步状态',
              connect: '连接本机', clean: '清理', manifest: '查看文件清单', verify: '校验文件', checkpoints: '查看检查点', diff: '对比改动', seal: '封存', plan: '查看计划',
              ask: '请你确认', 'ask-status': '查看确认状态', 'ask-wait': '等你确认', 'ask-images': '取你的图片', ls: '列本机目录', grep: '搜本机文件' })[s] || '同步 ' + (s || '');
            act(lbl, 9, true);
            const nf = optList(a, '--files').length, nd = optList(a, '--delete').length;
            card({ k: s === 'push' ? 'push' : s === 'pull' || s === 'restore' ? 'pull' : s === 'notes' ? 'notes' : 'sync', label: s === 'push' ? '写回本机' : s === 'notes' ? '交接笔记' : lbl,
              code: s === 'grep' || s === 'ls' ? plain.slice(2).join(' ') : '',
              meta: s === 'push' ? [nf ? nf + ' 个文件' : '', nd ? '删 ' + nd + ' 个' : ''].filter(Boolean).join(' · ') : s === 'pull' ? (optList(a, '--files').length ? optList(a, '--files').length + ' 个文件' : (plain[2] ? shortName(plain[2]) : '')) : '',
              tip: optVal(a, '--summary') });
            return;
          }
          if (/chatroom\.py$/.test(script)) {
            const c = rest[0];
            const CR = { history: '翻聊天记录', rooms: '聊天室列表', 'sync-status': '同步状态', restore: '恢复聊天室', caps: '查看可用能力', mcp: 'MCP 管理', pending: '看未读消息', skills: '技能列表', export: '导出聊天记录', monitor: '监视面板', serve: '启动聊天室' };
            act(c === 'say' ? (/--no-wait/.test(joined) ? '聊天室发言' : '聊天室发言并等回复') : c === 'wait' ? '等你回复' : c === 'skill' ? '读技能 ' + (rest[1] || '') : c === 'rules' ? '读规则' : CR[c] || '聊天室 ' + (c || ''), 9, true);
            let said = '';
            if (c === 'say') {
              const hm = /chatroom\.py\b[^\n]*?\ssay\b[^\n]*<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/.exec(cmd);
              if (hm) said = (hm[2].split('\n').filter(x => x.trim())[0] || '').trim();
              if (!said || /^\{/.test(said)) {
                const jm = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cmd);
                if (jm) { try { said = JSON.parse('"' + jm[1] + '"'); } catch { said = jm[1]; } said = (said.split('\n').filter(x => x.trim())[0] || '').trim(); }
              }
            }
            card({ k: c === 'say' || c === 'wait' ? 'chat' : 'lib', label: c === 'say' || c === 'wait' ? '聊天室' : c === 'skill' ? '技能' : c === 'rules' ? '规则' : '聊天室',
              meta: c === 'say' ? (/--no-wait/.test(joined) ? '发言' : '发言 · 等回复') : c === 'wait' ? '等回复' : c === 'skill' ? (rest[1] || '') : c === 'rules' ? (rest[1] || '') : CR[c] || (c || ''),
              quote: said, wait: c === 'wait' || (c === 'say' && !/--no-wait/.test(joined)) });
            return;
          }
          if (/terminal_client\.py$/.test(script)) {
            const inner = rest[1] || rest[0] || '';
            const loop = /^\s*for\b.*?\bdo\s+@?(\S+)/i.exec(inner);
            act('本机终端：' + (loop ? loop[1] : inner.split(/\s+/)[0] || '执行'), 8, true);
            card({ k: 'term', label: '本机终端', code: inner.replace(/\s+/g, ' ').trim() });
            return;
          }
          if (/mcp_client\.py$/.test(script)) {
            if (rest[0] === 'call') {
              const key = rest[1] || '', tool = rest[2] || '';
              const PW = { browser_network_requests: '看网络请求', browser_console_messages: '看控制台', browser_fill_form: '填表单', browser_select_option: '选下拉项', browser_hover: '悬停', browser_drag: '拖动', browser_file_upload: '上传文件', browser_handle_dialog: '处理弹窗', browser_resize: '调窗口大小', browser_navigate_back: '后退', browser_install: '安装浏览器', browser_run_code_unsafe: '运行脚本', browser_run_code: '运行脚本', browser_navigate: '打开网页', browser_evaluate: '执行页面脚本', browser_tabs: '管理标签页', browser_take_screenshot: '截图', browser_snapshot: '读页面结构', browser_click: '点击', browser_type: '输入', browser_press_key: '按键', browser_wait_for: '等待', browser_close: '关闭' };
              act(key === 'mcp_playwright' ? '浏览器 · ' + (PW[tool] || tool.replace(/^browser_/, '')) : 'MCP · ' + key + ' ' + tool, 8, true);
              card(key === 'mcp_playwright' ? { k: 'web', label: '浏览器', meta: PW[tool] || tool.replace(/^browser_/, '') } : { k: 'mcp', label: 'MCP', meta: key.replace(/^mcp_/, '') + ' · ' + tool });
            } else {
              const ML = { tools: '查看工具列表', schema: '查看工具参数', list: '服务列表' };
              act('MCP ' + (ML[rest[0]] || rest[0] || ''), 7, true);
              card({ k: 'mcp', label: 'MCP', meta: (ML[rest[0]] || rest[0] || '') + (rest[1] ? ' · ' + rest[1].replace(/^mcp_/, '') : '') });
            }
            return;
          }
          if (/(^|\/)qj\.py$/.test(script)) {
            const q = rest[0] || '', q1 = rest[1] || '', q2 = rest[2] || '';
            const firstLine = t => (String(t || '').split('\n').filter(x => x.trim())[0] || '').trim();
            const hdoc = () => { const hm = /qj\.py\b[^\n]*<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/.exec(cmd); return hm ? firstLine(hm[2]) : ''; };
            const GIT = { clone: '取岗位代码', save: '保存到岗位 Git', load: '拉岗位代码', undo: '撤销保存', log: '看岗位提交', sync: '同步岗位代码' };
            const DLV = { deliver: '交付', review: '复核交付', accept: '通过交付', reject: '打回交付' };
            const LIB = { brief: '看简报', me: '看门牌', who: '看成员', rules: '读规矩', policy: '看本群开关', index: '看资源地图', skill: '读技能', memory: '看记忆', card: '身份卡', door: '看门牌', history: '翻群记录' };
            const MISC = { join: '接入千机阁', guard: '沙箱守护', relocate: '换 Hub 地址', serve: '常驻进程', disk: '查沙箱占用', get: '取附件', remind: '提醒', plan: '公开计划', meeting: '会议' };
            if (q === 'say') { const qs = q1 && q1 !== '-' ? firstLine(q1) : hdoc(); act('群聊发言', 9, true); card({ k: 'qj', label: '千机阁', meta: '群聊', quote: qs }); return; }
            if (q === 'note' || q === 'call') { const qn = q2 && q2 !== '-' ? firstLine(q2) : hdoc(); act((q === 'note' ? '留言给 ' : '专线叫 ') + q1, 9, true); card({ k: 'qj', label: '千机阁', meta: (q === 'note' ? '留言 → ' : '专线 → ') + q1, quote: qn }); return; }
            if (q === 'read' || q === 'wait') { act(q === 'read' ? '读群消息' : '等群消息', 9, true); card({ k: 'qj', label: '千机阁', meta: q === 'read' ? '读消息' : '等消息', wait: q === 'wait', waitT: '等消息' }); return; }
            if (q === 'status') { act('自报状态 ' + q1, 7, true); card({ k: 'qj', label: '千机阁', meta: '自报 · ' + q1, quote: firstLine(q2) }); return; }
            if (q === 'task') { const tl = ({ add: '新建任务', claim: '领取任务', done: '完成任务', drop: '放下任务' })[q1] || '看任务'; act(tl + (q1 && q1 !== 'add' ? ' ' + q2 : ''), 7, true); card({ k: 'qj', label: '任务', meta: tl + (q1 === 'add' ? '' : q2 ? ' ' + q2 : ''), quote: q1 === 'add' ? firstLine(q2) : '' }); return; }
            if (DLV[q]) { act(DLV[q] + (q1 && q !== 'deliver' ? ' ' + q1 : ''), 8, true); card({ k: 'push', label: DLV[q], meta: q === 'deliver' ? '' : q1, quote: q === 'deliver' ? firstLine(q1) : q === 'reject' ? firstLine(q2) : '' }); return; }
            if (GIT[q]) { act(GIT[q], 8, true); card({ k: q === 'save' || q === 'sync' ? 'push' : 'pull', label: '岗位 Git', meta: GIT[q], quote: q === 'save' ? firstLine(q1) : '' }); return; }
            if (q === 'run') { const rc = rest.slice(1).join(' '); act('本机终端：' + (rc.split(/\s+/)[0] || '执行'), 8, true); card({ k: 'term', label: '本机终端', code: rc.replace(/\s+/g, ' ').trim() }); return; }
            if (q === 'mcp') {
              if (q1 === 'call') { const mk = q2, mt = rest[3] || ''; act(mk === 'mcp_playwright' ? '浏览器 · ' + mt.replace(/^browser_/, '') : 'MCP · ' + mk + ' ' + mt, 8, true); card(mk === 'mcp_playwright' ? { k: 'web', label: '浏览器', meta: mt.replace(/^browser_/, '') } : { k: 'mcp', label: 'MCP', meta: mk.replace(/^mcp_/, '') + ' · ' + mt }); }
              else { const ml = ({ tools: '查看工具列表', host: '常驻进程' })[q1] || '服务列表'; act('MCP ' + ml, 7, true); card({ k: 'mcp', label: 'MCP', meta: ml + (q1 === 'tools' && q2 ? ' · ' + q2 : '') }); }
              return;
            }
            if (LIB[q]) { act(LIB[q] + (q === 'skill' || q === 'rules' ? (q1 ? ' ' + q1 : '') : ''), 7, true); card({ k: 'lib', label: '千机阁', meta: LIB[q] + ((q === 'skill' || q === 'rules') && q1 ? ' · ' + q1 : '') }); return; }
            act(MISC[q] || ('千机阁 ' + q).trim(), 7, true); card({ k: 'qj', label: '千机阁', meta: MISC[q] || q }); return;
          }
          if (a.indexOf('-m') >= 0) { const mod = a[a.indexOf('-m') + 1] || ''; if (mod === 'py_compile' || mod === 'compileall') { act('语法检查 ' + a.slice(a.indexOf('-m') + 2).filter(x => x.charAt(0) !== '-').map(shortName).join('、'), 6); return; } act(/^(pytest|unittest)$/.test(mod) ? '跑测试' : mod === 'pip' ? (/install/.test(joined) ? '安装依赖' : 'pip') : '运行 ' + mod, 7); return; }
          if (/\/api\/handoff\/notes/.test(cmd) && /payload|notes_set/.test(cmd)) { act('更新交接笔记', 9, true); card({ k: 'notes', label: '交接笔记' }); return; }
          if (a.indexOf('-c') >= 0 || script === '-' || !script || /<</.test(ln)) { act('py脚本', 4); return; }
          if (/(^|\/)(pull|push)file\.py$/.test(script)) { act(/pull/.test(script) ? '从本机拉取' : '写回本机', 9, true); return; }
          if (/\$/.test(script)) { act('运行脚本', 6); return; }
          if (/(^|[\/_.-])(tests?|e2e|spec)([\/_.-]|$)|run-tests/i.test(script)) { act('跑测试', 8); return; }
          act('运行 ' + shortName(script), 6); return;
        }
        if (name === 'node') {
          if (a.indexOf('--test') >= 0) { act('跑测试', 8); return; }
          if (a.indexOf('--check') >= 0) { act('语法检查 ' + plain.map(shortName).join('、'), 6); return; }
          if (a.indexOf('-e') >= 0 || a.indexOf('-p') >= 0 || sub === '-' || !sub || /<</.test(ln)) { act('js片段', 4); return; }
          if (/\$/.test(sub)) { act('运行脚本', 6); return; }
          if (/(^|[\/_.-])(tests?|e2e|spec)([\/_.-]|$)|run-tests/i.test(sub)) { act('跑测试', 8); return; }
          act(/build/i.test(sub) ? '构建' : '运行 ' + shortName(sub || 'node'), 6); return;
        }
        if (name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'npx') {
          const task = sub === 'run' ? plain[1] || '' : sub;
          if (/^(i|install|ci|add)$/.test(sub)) act('安装依赖', 7);
          else if (/test/.test(task)) act('跑测试', 8);
          else if (/package|vsce/.test(task) || /vsce/.test(joined)) act('打包', 8);
          else if (/build|compile|tsc/.test(task)) act('构建', 7);
          else act(name + ' ' + task, 5);
          return;
        }
        if (/^(pytest|jest|vitest|mocha)$/.test(name)) { act('跑测试', 8); return; }
        if (name === 'tsc') { act('编译 TypeScript', 7); return; }
        if (name === 'vsce') { act('打包', 8); return; }
        if (/^pip\d?$/.test(name) || name === 'apt' || name === 'apt-get') { act(/install/.test(joined) ? '安装依赖' : name + ' ' + sub, 7); return; }
        if (name === 'git') { let ga = a.slice(); while (ga.length && /^-[Cc]$/.test(ga[0])) ga = ga.slice(2); while (ga.length && ga[0].charAt(0) === '-') ga = ga.slice(1); act('git ' + (ga[0] || ''), 6); return; }
        if (name === 'sleep') { act('等待 ' + (sub || '') + ' 秒', 6); return; }
        if (name === 'curl' || name === 'wget') { const u = a.filter(x => /^https?:\/\//.test(x))[0]; act('网络请求 ' + (host(u) || ''), 5); return; }
        if (name === 'rm') { const rmN = plain.filter(x => !/\$/.test(x)); act(rmN.length ? '删除 ' + rmN.slice(0, 2).map(disp).join('、') : '删除文件', 6); return; }
        if (name === 'mkdir') { act('建目录', 2); return; }
        if (name === 'kill' && a[0] === '-0') { act('检查进程还在不在', 2); return; }
        if (name === 'kill' || name === 'pkill' || name === 'killall') { act('结束进程', 6); return; }
        if (name === 'ps' || name === 'pgrep') { act('查看进程', 3); return; }
        if (/^(ss|netstat|lsof)$/.test(name)) { act('查看端口', 3); return; }
        if (a.length === 1 && /^(--version|-v|-V)$/.test(a[0])) { act('查看 ' + name + ' 版本', 2); return; }
        if (name === 'du' || name === 'df') { act('查看磁盘', 3); return; }
        if (/^(unzip|tar|zip|7z|gzip|gunzip)$/.test(name)) { act(name === 'unzip' || (/x/.test(a[0] || '') && name === 'tar') ? '解压' : '压缩/打包文件', 5); return; }
        if (name === 'base64') { act('编码转换', 2); return; }
        if (/^(ffmpeg|convert|magick)$/.test(name)) { act('处理媒体文件', 5); return; }
        if (/^(echo|printf|true|false|test|\[|export|set|source|\.|cut|sort|uniq|tr|xargs|wc|head|tail|cat|grep|sed|awk|ls|find|cd|tee|cp|mv|touch|chmod|ln|basename|dirname|date|which|type|for|do|done|if|then|fi|else|while|exit|wait|local|read|python3|\{|\}|sh|bash)$/.test(name)) {
          if (name !== 'cd' && name !== '{' && name !== '}') trivial.push(name);
          return;
        }
        act('执行 ' + name, 3);
      });
    });
    if (!acts.length && trivial.length) {
      const u = [];
      trivial.forEach(n => { if (u.indexOf(n) < 0 && /^[\w\u4e00-\u9fff][\w.\-\u4e00-\u9fff]*$/.test(n) && !/^(exit|true|false|then|fi|do|done|else|if|for|while|local|set|export)$/.test(n)) u.push(n); });
      acts.push({ s: u.length ? u.slice(0, 3).join('、') : '检查环境', w: 1 });
    }
    return acts;
  }

  function describe(cmd, cwd) {
    let ops = {}, acts = [];
    try { ops = cmdOps(cmd || '', cwd || ''); } catch {}
    try { acts = actions(cmd || ''); } catch {}
    const cards = acts.cards || [];
    let segs = acts.filter(x => x.w >= 6 && !(cards.length && x.b)).map(x => ({ k: kindOf(x.s), t: x.s }));
    let ed = filterFiles(ops.edit);
    let readOnly = filterFiles(ops.read).filter(p => ed.indexOf(p) < 0);
    const sayIn = /python[\d.]*\s+(?:-\S+\s+)*\S*chatroom\.py\b[^\n]*?\ssay\b[^\n]*?<\s*(['"]?)([^\s'"|;&]+)\1/.exec(cmd || '');
    if (sayIn) {
      const notSay = p => shortName(p) !== shortName(sayIn[2]);
      ed = ed.filter(notSay); readOnly = readOnly.filter(notSay);
      ops = { ...ops, edit: (ops.edit || []).filter(notSay), read: (ops.read || []).filter(notSay) };
    }
    const gone = [];
    acts.forEach(x => { if (/^删除 /.test(x.s)) x.s.slice(3).replace(/ 等 \d+ 个$/, '').split('、').forEach(n => gone.push(n)); });
    ed = ed.filter(p => gone.indexOf(disp(p)) < 0 && !/\.(log|out)$/.test(p));
    const edN = ed.map(shortName);
    readOnly = readOnly.filter(p => edN.indexOf(shortName(p)) < 0);
    if (ops.push && !cards.length && !segs.some(x => x.t === '写回本机')) segs.unshift({ k: 'sync', t: '写回本机' });
    if (ed.length) segs.push({ k: 'edit', t: '改 ' + names(ed, 2) });
    if (readOnly.length) segs.push({ k: 'read', t: '读 ' + names(readOnly, 2) });
    if (ops.search) segs.push({ k: 'search', t: '搜索 ' + ops.search + ' 次' });
    if (!segs.length && !cards.length) segs = acts.map(x => ({ k: kindOf(x.s), t: x.s }));
    const seen = Object.create(null);
    segs = segs.filter(x => { if (seen[x.t]) return false; seen[x.t] = 1; return true; });
    const more = segs.length > 3;
    segs = segs.slice(0, 3);
    let stat = null, hw = {};
    try { hw = heredocWrites(cmd || ''); } catch {}
    let add = 0;
    Object.keys(hw).forEach(f => {
      const abs = f.charAt(0) === '/' ? f : null;
      if (ed.some(p => p === f || shortName(p) === shortName(f) || p === abs)) add += hw[f];
    });
    if (add) stat = { add, del: 0 };
    let all = acts.filter(x => x.w >= 6).map(x => x.s);
    if (ops.push && all.indexOf('写回本机') < 0) all.unshift('写回本机');
    if (ed.length) all.push('改 ' + names(ed, 2));
    if (readOnly.length) all.push('读 ' + names(readOnly, 2));
    if (ops.search) all.push('搜索 ' + ops.search + ' 次');
    if (!all.length) all = acts.map(x => x.s);
    const seenT = Object.create(null);
    all = all.filter(t => { if (seenT[t]) return false; seenT[t] = 1; return true; });
    ops = { ...ops, edit: ed, read: readOnly };
    return { text: all.slice(0, 3).join(' · ') + (all.length > 3 ? ' …' : ''), cards, segs, more, stat, ops, acts: acts.map(x => x.s) };
  }

  function benignExit(p) {
    const o = p?.output, cmd = String((p?.input || {}).command || ''), ec = o && typeof o === 'object' ? o.exit_code : null;
    if (ec !== 2 && ec !== 5) return false;
    const m = /qj\.py["']?\s+(?:--?\S+\s+)*(\w+)/.exec(cmd);
    if (!m) return false;
    return (ec === 2 && m[1] === 'wait') || (ec === 5 && /^(say|note|call)$/.test(m[1]));
  }
  function isTimeout(p) {
    if (!p) return false;
    if (p._superseded) return true;
    const o = p.output && typeof p.output === 'object' ? p.output : {};
    if (o.status === 'timeout' || o.timed_out || o.exit_code === 124) return true;
    const cmd = String((p.input || {}).command || p.inputText || '');
    if (o.exit_code === 137 && /\btimeout\b/.test(cmd)) return true;
    if (o.exit_code === 28 && /\bcurl\b/.test(cmd)) return true;
    if (/\b(?:chatroom\.py|qj\.py|bridge_sync\.py)\b.*\b(?:wait|ask-wait|say)\b/.test(cmd) && typeof o.exit_code === 'number' && o.exit_code !== 0) return true;
    const errStr = String(p.errorText || o.error || o.stderr || '');
    if (p.state === 'output-error' && /timeout|timed?\s*out|etimedout|超时/i.test(errStr)) return true;
    if (typeof o.exit_code === 'number' && o.exit_code !== 0 && /(?:TimeoutError|ReadTimeout|ConnectTimeout|SocketTimeout|timed?\s*out|ETIMEDOUT|ECONNABORTED|请求超时|连接超时|等待超时|执行超时|响应超时)/i.test(errStr)) return true;
    return false;
  }
  function failed(p) {
    const o = p?.output;
    if (benignExit(p) || isTimeout(p)) return false;
    return p?.state === 'output-error' || p?.state === 'output-denied' || (o && typeof o === 'object' && typeof o.exit_code === 'number' && o.exit_code !== 0);
  }
  function endState(p) {
    const o = p?.output && typeof p.output === 'object' ? p.output : {};
    if (o.status === 'timeout' || o.timed_out) return { k: 'timeout', t: '超时（可能还在跑）' };
    if (p?.state === 'output-error' && /abort|cancel|interrupt|stop/i.test(String(p.errorText || o.error || ''))) return { k: 'stop', t: '已中断' };
    if (o.exit_code === 124) return { k: 'timeout', t: '超时（退出码 124）' };
    if (isTimeout(p)) return { k: 'timeout', t: '注意（超时' + (typeof o.exit_code === 'number' ? ' · 退出码 ' + o.exit_code : '') + '）' };
    if (failed(p)) return { k: 'fail', t: '失败' + (typeof o.exit_code === 'number' ? '（退出码 ' + o.exit_code + '）' : '') };
    return null;
  }

  function partInfo(p) {
    if (!p) return { text: '', segs: [], ops: {}, acts: [] };
    const n = String(p.toolName || String(p.type || '').replace(/^tool-/, '')).toLowerCase();
    const inp = (typeof R !== 'undefined' && R.tinput ? R.tinput(p) : p.input) || {};
    const cmdOrPath = typeof inp === 'object' ? (inp.command || inp.path || inp.file_path || inp.query || inp.url || '') : String(inp || '');
    const bodyLen = typeof inp === 'object' ? (inp.content || inp.new_text || inp.new_string || inp.new_str || '').length : 0;
    const key = (p.toolCallId || p.id || '') + '|' + n + '|' + cmdOrPath.length + '|' + bodyLen;
    if (key.length > 4 && _partCache.has(key)) return _partCache.get(key);
    let r;
    if (/^(bash|shell|run_command|execute_command)$/.test(n)) {
      r = describe(inp.command || '', inp.cwd || '');
    } else if (n === 'start_process') {
      const d = describe(inp.command || '', inp.cwd || '');
      const t0 = '后台启动' + (inp.name ? '「' + inp.name + '」' : '');
      r = { text: t0 + (d.text ? ' · ' + d.text : ''), segs: [{ k: 'proc', t: t0 }].concat(d.segs.slice(0, 2)), ops: {}, acts: [] };
    } else if (n === 'stop_process') {
      r = { text: '停止后台进程', segs: [{ k: 'proc', t: '停止后台进程' }], ops: {}, acts: [] };
    } else if (n === 'get_process_output') {
      const wt = inp.wait_for ? ' · 等待 ' + inp.wait_for : '';
      r = { text: '读进程日志' + wt, segs: [{ k: 'read', t: '读进程日志' + wt }], ops: {}, acts: [] };
    } else if (/^(write_file|create_file|write|edit_file|str_replace|edit|read_file)$/.test(n) && (inp.path || inp.file_path)) {
      const pth = inp.path || inp.file_path;
      const isRd = n === 'read_file', isEd = /^(edit_file|str_replace|edit)$/.test(n);
      const verb = isRd ? '读 ' : isEd ? '改 ' : '写 ';
      const st = isEd
        ? lineDiff(inp.old_text ?? inp.old_string ?? inp.old_str, inp.new_text ?? inp.new_string ?? inp.new_str)
        : (!isRd && typeof (inp.content ?? inp.text) === 'string' ? { add: countLines(inp.content ?? inp.text), del: 0 } : null);
      r = {
        text: verb + compactFile(pth, 18),
        segs: [{ k: isRd ? 'read' : 'edit', t: verb + compactFile(pth, 16) }],
        stat: st,
        ops: isRd ? { read: [pth] } : { edit: [pth] },
        acts: [],
      };
    } else if (n === 'present_file' && (inp.path || inp.file_path)) {
      const pth = inp.path || inp.file_path;
      r = { text: '展示 ' + compactFile(pth, 18), segs: [{ k: 'read', t: '展示 ' + compactFile(pth, 16) }], ops: { read: [pth] }, acts: [] };
    } else if (/^(web_search|search|image_search)$/.test(n) && inp.query) {
      const q = String(inp.query).trim().slice(0, 16);
      const lbl = (n === 'image_search' ? '搜图 ' : '搜索 ') + q;
      r = { text: lbl, segs: [{ k: 'search', t: lbl }], ops: { search: 1 }, acts: [] };
    } else if (/^(fetch_page|fetch)$/.test(n) && inp.url) {
      const u = host(inp.url) || String(inp.url).slice(0, 18);
      r = { text: '抓取 ' + u, segs: [{ k: 'web', t: '抓取 ' + u }], ops: {}, acts: [] };
    } else {
      r = { text: '', segs: [], ops: {}, acts: [] };
    }
    if (cmdOrPath && p.state !== 'input-streaming') {
      if (_partCache.size > 800) _partCache.delete(_partCache.keys().next().value);
      _partCache.set(key, r);
    }
    return r;
  }

  function isEnabled() {
    return typeof Prefs === 'undefined' || Prefs.cmdTranslate !== false;
  }

  function compactChipText(raw) {
    let s = String(raw || '').trim();
    s = s
      .replace(/^(?:运行 Python 脚本|Python|py脚本)$/i, 'py脚本')
      .replace(/^(?:运行 JS 片段|运行 node|Node|js片段)$/i, 'js片段')
      .replace(/^运行脚本$/, '脚本')
      .replace(/^编译 TypeScript$/, '编译 TS')
      .replace(/^压缩\/打包文件$/, '打包')
      .replace(/^处理媒体文件$/, '处理媒体')
      .replace(/^检查进程还在不在$/, '查进程')
      .replace(/^查看进程$/, '查进程')
      .replace(/^查看端口$/, '查端口')
      .replace(/^查看磁盘$/, '查磁盘')
      .replace(/^停止后台进程$/, '停进程')
      .replace(/^读进程日志(?:\s*·\s*等待\s*\S+)?$/, '进程日志')
      .replace(/^(?:超时|注意)（[^）]*）$/, '注意')
      .replace(/^超时$/, '注意')
      .replace(/^(\d+)条超时$/, '$1条注意')
      .replace(/^失败（[^）]*）$/, '失败')
      .replace(/^网络请求\s+/, '请求 ')
      .replace(/^语法检查\s+(.+)$/, (_, f) => '检查 ' + compactFile(f.split('、')[0], 12))
      .replace(/^(改|读|写|展示|删除)\s+([^、]+)、.+?\s+等\s+(\d+)\s+个$/, (_, v, f1, cnt) => `${v} ${compactFile(f1, 14)} 等${cnt}个`)
      .replace(/^(改|读|写|展示|删除)\s+([^、]+)、([^、]+)$/, (_, v, f1) => `${v} ${compactFile(f1, 14)} +1`)
      .replace(/^(改|读|写|展示|删除)\s+(\S+)$/, (_, v, f1) => `${v} ${compactFile(f1, 16)}`);
    if (s.length > 20) s = s.slice(0, 19) + '…';
    return s;
  }

  function makeChipEl(seg) {
    const raw = String(seg.t || '');
    const txt = compactChipText(raw);
    const sp = txt.indexOf(' ');
    const verb = /^(改|读|写|搜索|搜图|抓取|展示|删除) /.test(txt) && sp > 0 ? txt.slice(0, sp) : '';
    return h('span', { class: 'ct-c ct-' + (seg.k || 'act') + (seg.sub ? ' ct-sub' : ''), title: raw !== txt ? raw : null },
      verb ? h('b', {}, verb) : null,
      verb ? txt.slice(sp) : txt);
  }

  function makeStatEl(stat) {
    if (!stat || (!stat.add && !stat.del)) return null;
    return h('span', { class: 'ct-stat' },
      stat.add ? h('span', { class: 'ct-add' }, '+' + stat.add) : null,
      stat.del ? h('span', { class: 'ct-del' }, '−' + stat.del) : null);
  }

  function renderRowChips(p, st) {
    if (!isEnabled()) return null;
    const r = partInfo(p);
    let segs = (r.segs || []).slice(0, 2);
    if (!segs.length && r.cards?.length) {
      segs = r.cards.slice(0, 2).map(c => ({ k: c.k === 'push' || c.k === 'pull' || c.k === 'notes' ? 'sync' : c.k === 'web' ? 'web' : 'chat', t: c.label + (c.meta ? ' · ' + c.meta : '') }));
    }
    const e = st === 'run' ? null : endState(p);
    if (e && (e.k === 'timeout' || e.k === 'stop' || (e.k === 'fail' && p?.output && typeof p.output === 'object' && typeof p.output.exit_code === 'number'))) {
      segs = segs.concat([e]);
    }
    const statEl = st === 'run' ? null : makeStatEl(r.stat);
    if (!segs.length && !statEl) return null;
    return h('span', { class: 'ct-x', 'data-ct': r.text || '' },
      ...segs.map(makeChipEl),
      (r.more || (r.segs && r.segs.length > 2)) ? h('span', { class: 'ct-more' }, '…') : null,
      statEl);
  }

  function groupSummary(parts) {
    const fr = Object.create(null), fe = Object.create(null);
    let nS = 0, nP = 0, nL = 0, nN = 0, nT = 0, nB = 0, fails = 0, nTo = 0, nSt = 0, add = 0, del = 0;
    (parts || []).forEach(p => {
      const r = partInfo(p), o = r.ops || {};
      filterFiles(o.read).forEach(x => { fr[x] = 1; });
      filterFiles(o.edit).forEach(x => { fe[x] = 1; });
      nS += o.search || 0; nP += o.push || 0; nL += o.pull || 0; nN += o.notes || 0;
      if (r.stat) { add += r.stat.add || 0; del += r.stat.del || 0; }
      if ((r.acts || []).indexOf('跑测试') >= 0) nT++;
      if ((r.acts || []).some(a => /^(构建|打包|编译)/.test(a))) nB++;
      const isRun = p.state === 'input-streaming' || p.state === 'input-available' || (p.state === 'output-available' && p.preliminary);
      const e2 = isRun ? null : endState(p);
      if (e2) { if (e2.k === 'fail') fails++; else if (e2.k === 'timeout') nTo++; else nSt++; }
    });
    const feN = Object.keys(fe).map(shortName);
    Object.keys(fr).forEach(x => { if (fe[x] || feN.indexOf(shortName(x)) >= 0) delete fr[x]; });
    const nR = Object.keys(fr).length, nE = Object.keys(fe).length;
    const few = (o, n) => n === 1 ? compactFile(Object.keys(o)[0], 14) : n + '个文件';
    const times = n => n > 1 ? ' ' + n + '次' : '';
    const segs = [];
    if (nP) segs.push({ k: 'sync', t: '写回本机' + times(nP) });
    if (nL) segs.push({ k: 'sync', t: '拉取' + times(nL) });
    if (nN) segs.push({ k: 'sync', t: '交接笔记' + times(nN) });
    const nMain = segs.length;
    if (nE) segs.push({ k: 'edit', t: '改 ' + few(fe, nE) });
    if (nR) segs.push({ k: 'read', t: '读 ' + few(fr, nR) });
    if (nS) segs.push({ k: 'search', t: '搜索 ' + nS + '次' });
    if (nT) segs.push({ k: 'test', t: '测试 ' + nT + '次' });
    if (nB) segs.push({ k: 'build', t: '构建 ' + nB + '次' });
    if (nMain) { for (let si = nMain; si < segs.length; si++) segs[si].sub = 1; }
    if (nTo) segs.push({ k: 'timeout', t: nTo + '条注意' });
    if (nSt) segs.push({ k: 'stop', t: nSt + '条中断' });
    const stat = (add || del) ? { add, del } : null;
    return { segs, stat, fails, nTo, nSt, nR, nE, nS, nT, nB, add, del };
  }

  function renderGroupChips(doneTools) {
    if (!isEnabled() || !Array.isArray(doneTools) || !doneTools.length) return null;
    const g = groupSummary(doneTools);
    const statEl = makeStatEl(g.stat);
    if (!g.segs.length && !statEl) return null;
    const topSegs = g.segs.slice(0, 2);
    return h('span', { class: 'ct-x ct-grp' },
      ...topSegs.map(makeChipEl),
      g.segs.length > 2 ? h('span', { class: 'ct-more' }, '…') : null,
      statEl);
  }

  return {
    cmdOps,
    actions,
    describe,
    lineDiff,
    heredocWrites,
    looksLikeFile,
    kindOf,
    endState,
    isTimeout,
    benignExit,
    partInfo,
    groupSummary,
    isEnabled,
    renderRowChips,
    renderGroupChips,
  };
})();
if (typeof globalThis !== 'undefined') globalThis.CmdTranslate = CmdTranslate;

const _mdPartCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
const _toolInputCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

const R = {
  text(p, streaming, m = null, chat = null, keyPrefix = 'txt') {
    const htmlSegs = R.extractInlineHtmlSegments(p?.text, streaming);
    if (htmlSegs) {
      const canSeg = (streaming || keyPrefix !== 'txt') && typeof Seg !== 'undefined' && !Seg.off;
      const sid = m?.id || 'eval';
      const wrap = canSeg ? Seg.box(sid, keyPrefix + ':flow', () => h('div', { class: 'inline-html-flow' })) : h('div', { class: 'inline-html-flow' });
      const kids = [];
      htmlSegs.forEach((hs, hi) => {
        if (hs.type === 'html') {
          const ihKey = keyPrefix + ':ih:' + hs.idx;
          const hSig = (hs.running ? 'R' : 'D') + ':' + hs.code.length + ':' + hs.code.slice(-24);
          kids.push(canSeg ? Seg.use(sid, ihKey, hSig, () => R.inlineHtmlCard(hs, ihKey, m, chat)) : R.inlineHtmlCard(hs, ihKey, m, chat));
        } else if (hs.text && hs.text.trim()) {
          const isTailStream = Boolean(streaming && hi === htmlSegs.length - 1);
          if (canSeg && typeof StreamMD !== 'undefined') {
            const box = Seg.box(sid, keyPrefix + ':m:' + hi, () => h('div', { class: 'md prose', lang: '', translate: 'no' }));
            kids.push(StreamMD.paint(box, hs.text, isTailStream));
          } else {
            const d = h('div', { class: 'md prose' + (isTailStream ? ' streaming' : ''), lang: '', translate: 'no' });
            d.innerHTML = MD.render(hs.text);
            kids.push(d);
          }
        }
      });
      if (typeof patchKids === 'function') patchKids(wrap, kids);
      else wrap.replaceChildren(...kids);
      return wrap;
    }
    const rawText = String(p?.text || '');
    if ((streaming || keyPrefix !== 'txt') && typeof StreamMD !== 'undefined' && typeof Seg !== 'undefined' && !Seg.off && (m?.id || keyPrefix !== 'txt')) {
      const box = Seg.box(m?.id || 'eval', keyPrefix, () => h('div', { class: 'md prose', lang: '', translate: 'no' }));
      return StreamMD.paint(box, rawText, Boolean(streaming));
    }
    if (p && typeof p === 'object') {
      if (p._mdEl !== undefined) delete p._mdEl;
      if (p._mdSrc !== undefined) delete p._mdSrc;
    }
    const cachedMd = (!streaming && p && typeof p === 'object' && _mdPartCache) ? _mdPartCache.get(p) : null;
    if (cachedMd && cachedMd.src === rawText && cachedMd.el && cachedMd.el.nodeType === 1 && !cachedMd.el.isConnected) {
      return cachedMd.el;
    }
    const d = h('div', { class: 'md prose' + (streaming ? ' streaming' : ''), lang: '', translate: 'no' });
    d.innerHTML = MD.render(rawText);
    if (!streaming && p && typeof p === 'object' && _mdPartCache) {
      _mdPartCache.set(p, { src: rawText, el: d });
    }
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
    const b = h('div', { class: 'md prose muted', lang: '', translate: 'no' });
    let mdBuilt = false;
    const ensureMd = () => { if (mdBuilt) return; mdBuilt = true; b.innerHTML = MD.render(p.text || '…'); };
    if (open || (live && p.state === 'streaming')) ensureMd();
    else d.addEventListener('toggle', () => { if (d.open) ensureMd(); });
    d.append(b); return d;
  },
  tool(p) {
    const name = p.toolName || String(p.type).replace(/^tool-/, '');
    const inp = R.tinput(p);
    const st = R.tstate(p);
    const lab = { ok: '完成', warn: '注意', bad: '失败', run: p.state === 'input-streaming' ? '准备中' : '执行中' }[st] || '完成';
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
  tinput(p) {
    if (!p) return undefined;
    if (p._parsedInputRaw !== undefined) delete p._parsedInputRaw;
    if (p._parsedInputVal !== undefined) delete p._parsedInputVal;
    if (p.input != null) return p.input;
    const raw = p.inputText;
    if (!raw) return undefined;
    const cached = _toolInputCache ? _toolInputCache.get(p) : null;
    if (cached && cached.raw === raw) return cached.val;
    const val = R.parsePartialInput(raw);
    if (_toolInputCache) _toolInputCache.set(p, { raw, val });
    return val;
  },
  normPath(pth) { return String(pth || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, ''); },
  _fileTextCache: new Map(),
  _chatWriteStamp(chat) {
    if (!chat || !Array.isArray(chat.messages)) return '';
    const msgs = chat.messages, L = msgs.length, last = L ? msgs[L - 1] : null;
    const lp = last?.parts, lpl = Array.isArray(lp) ? lp.length : 0, tailP = lpl ? lp[lpl - 1] : null;
    let writeInSig = 0, stubCnt = 0;
    if (Array.isArray(lp)) {
      for (let i = 0; i < lpl; i++) {
        const p = lp[i];
        if (!p) continue;
        const cStr = typeof p.input?.content === 'string' ? p.input.content : (typeof p.input?.text === 'string' ? p.input.text : '');
        writeInSig += cStr.length + (p.inputText?.length || 0);
        if (cStr.includes('…[cached]')) stubCnt++;
      }
    }
    const resV = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedVer === 'function') ? HtmlPreview.resolvedVer() : 0;
    const tailLen = (tailP?.inputText?.length || 0) + (tailP?.text?.length || 0) + (tailP?.state || '') + ':' + writeInSig + ':' + stubCnt + ':' + resV;
    return L + ':' + (last?.v || 0) + ':' + lpl + ':' + tailLen + ':' + (chat.busy ? 1 : 0);
  },
  latestFileText(sid, targetPath, fallbackPart) {
    const norm = R.normPath(targetPath);
    const chat = (sid && typeof Chats !== 'undefined' && Chats.get?.(sid)) || (typeof Chats !== 'undefined' ? Chats.cur : null);
    if (chat && norm) {
      const cSid = chat.sid || sid || '_cur', stamp = R._chatWriteStamp(chat);
      let entry = R._fileTextCache.get(cSid);
      if (!entry || entry.stamp !== stamp) {
        const files = new Map();
        for (const m of chat.messages || []) {
          for (const p of m.parts || []) {
            if (!p || !(String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool')) continue;
            const n = R.tname(p).toLowerCase(), inp = R.tinput(p);
            if (!inp || typeof inp !== 'object') continue;
            const pth = R.normPath(inp.path || inp.file_path || '');
            if (!pth) continue;
            if (/^(write_?file|create_?file|write)$/.test(n)) {
              const c = typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '';
              if (c || !files.has(pth)) files.set(pth, c);
            } else if (files.has(pth) && /^(edit_file|str_replace|edit)$/.test(n)) {
              const oldT = inp.old_text ?? inp.old_str, newT = inp.new_text ?? inp.new_str, cur = files.get(pth) || '';
              if (typeof oldT === 'string' && typeof newT === 'string' && oldT && cur.includes(oldT)) files.set(pth, cur.replace(oldT, newT));
            }
          }
        }
        entry = { stamp, files };
        if (R._fileTextCache.size >= 40) R._fileTextCache.delete(R._fileTextCache.keys().next().value);
        R._fileTextCache.set(cSid, entry);
      }
      const hit = entry.files.get(norm);
      const resolved = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedText === 'function') ? HtmlPreview.resolvedText(cSid, norm) : '';
      if (resolved && (!hit || hit.includes('…[cached]') || resolved.length > hit.length)) return resolved;
      if (hit) return hit;
    }
    const resolvedFallback = (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.resolvedText === 'function' && norm) ? HtmlPreview.resolvedText(chat?.sid || sid, norm) : '';
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
    if (found && text) {
      if (resolvedFallback && (text.includes('…[cached]') || resolvedFallback.length > text.length)) return resolvedFallback;
      return text;
    }
    if (fallbackPart) {
      const i = R.tinput(fallbackPart) || {};
      const fb = typeof i.content === 'string' ? i.content : typeof i.text === 'string' ? i.text : text;
      if (resolvedFallback && (!fb || fb.includes('…[cached]') || resolvedFallback.length > fb.length)) return resolvedFallback;
      return fb;
    }
    return resolvedFallback || text;
  },
  tstate(p) {
    if (p?.state === 'output-available') {
      if (p.preliminary) return p._superseded ? 'warn' : 'run';
      if (CmdTranslate.isTimeout(p)) return 'warn';
      if (CmdTranslate.benignExit(p)) return 'ok';
      return (p.output?.exit_code != null && p.output.exit_code !== 0) ? 'bad' : 'ok';
    }
    if (p?._superseded || CmdTranslate.isTimeout(p)) return 'warn';
    return (p?.state === 'output-error' || p?.state === 'output-denied') ? 'bad' : 'run';
  },
  isWrite(p) { const n = R.tname(p).toLowerCase(), i = R.tinput(p); return /^(write_?file|create_?file|write)$/.test(n) && i && typeof i === 'object' && (i.path || i.file_path); },
  tlabel(n) { const m = { bash: 'Bash', shell: 'Bash', run_command: 'Bash', read_file: 'Read', edit_file: 'Edit', str_replace: 'Edit', write_file: 'Write', web_search: 'Search', fetch_page: 'Fetch', fetch: 'Fetch', list_files: 'List', glob: 'Glob', grep: 'Grep', image_search: 'Image search', generate_image: 'Generate image', generate_speech: 'Speech', add_voice: 'Voice', present_file: 'Present', start_process: 'Start process', stop_process: 'Stop process', get_process_output: 'Process output', ask_user: 'Ask', propose_plan: 'Plan', python: 'Python', code_interpreter: 'Python' }; return m[n.toLowerCase()] || n.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()); },
  toolStarts: new Map(),
  toolDurs: new Map(),
  toolEnds: new Map(),
  nudgedTools: new Set(),
  fmtClockSec(ts) {
    const dt = new Date(Number(ts) || Date.now());
    const p2 = v => String(v).padStart(2, '0');
    return p2(dt.getHours()) + ':' + p2(dt.getMinutes()) + ':' + p2(dt.getSeconds());
  },
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
  chatOfEl(el) {
    const sid = el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || (typeof UI !== 'undefined' && UI.els?.chat?.sid) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid) || null;
    if (sid && typeof Chats !== 'undefined' && typeof Chats.get === 'function') {
      const ch = Chats.get(sid);
      if (ch) return ch;
    }
    if (typeof UI !== 'undefined' && UI.els?.chat) return UI.els.chat;
    return (typeof Tabs !== 'undefined' && Tabs.cur && ('busy' in Tabs.cur || 'live' in Tabs.cur || 'streaming' in Tabs.cur)) ? Tabs.cur : null;
  },
  async nudgeBash(el, p, tid, why = 'manual') {
    const c = R.chatOfEl(el);
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
          if (typeof c.send === 'function' && !c.busy) void c.send('继续', { autoContinue: true });
        } else if (typeof Drafts !== 'undefined' && typeof Drafts.sendNow === 'function') {
          void Drafts.sendNow(c, '继续', []);
        } else if (typeof c.send === 'function') {
          void c.send('继续', {});
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
  toolRow(p, key, opts = null) {
    const rawSt = R.tstate(p), n = R.tname(p), inp = R.tinput(p);
    const chatCur = R.chatOfEl(null);
    const chatCurActive = Boolean(chatCur && (typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(chatCur) : (chatCur.busy || chatCur.live)));
    const isStaleToolRun = rawSt === 'run' && !Hitl.name(p) && chatCur && (!chatCurActive || (chatCur.live && Array.isArray(chatCur.live.parts) && !chatCur.live.parts.includes(p)));
    const st = isStaleToolRun ? 'warn' : rawSt;
    const tid = String(p?.toolCallId || p?.id || key || ''), isBash = /^(bash|shell|run_command)$/i.test(n);
    if (st === 'run' || opts?.showAppearTime) {
      if (!R.toolStarts.has(tid)) R.toolStarts.set(tid, Number(p?._startAt) > 0 ? Number(p._startAt) : Date.now());
      if (R.toolStarts.size > 600) R.toolStarts.delete(R.toolStarts.keys().next().value);
    }
    if (st !== 'run' && R.toolStarts.has(tid) && !R.toolDurs.has(tid)) {
      R.toolDurs.set(tid, Math.max(0, Date.now() - R.toolStarts.get(tid)));
      if (R.toolDurs.size > 600) R.toolDurs.delete(R.toolDurs.keys().next().value);
    }
    const startAt = Number(p?._startAt) > 0 ? Number(p._startAt) : (R.toolStarts.get(tid) || Date.now());
    if (opts?.showAppearTime && p && typeof p === 'object' && !p._startAt) p._startAt = startAt;
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
          title: p._routeStart.title || (p._routeStart.fromLabel ? `路由切换：${p._routeStart.fromLabel} → ${p._routeStart.toLabel}` : `路由提示：对话疑似 ${p._routeStart.toLabel}`),
        }, p._routeStart.fromLabel ? `⚠️ 路由切换：${p._routeStart.fromLabel} → ${p._routeStart.toLabel}` : `⚠️ 路由提示：对话疑似 ${p._routeStart.toLabel}`)
      : null;
    if (st !== 'run' && opts?.showAppearTime) {
      if (!R.toolEnds.has(tid)) {
        const initEnd = Number(p?._endAt) > 0 ? Number(p._endAt) : Date.now();
        R.toolEnds.set(tid, initEnd);
        if (R.toolEnds.size > 600) R.toolEnds.delete(R.toolEnds.keys().next().value);
      }
      if (p && typeof p === 'object' && !p._endAt) p._endAt = R.toolEnds.get(tid);
    }
    const isTurnActive = Boolean(opts?.live || st === 'run' || chatCurActive);
    const fmtSec = ms => {
      const v = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      if (v < 60) return v + 's';
      const m = Math.floor(v / 60), sc = v % 60, hr = Math.floor(m / 60), mm = m % 60;
      return hr > 0 ? (hr + 'h ' + mm + 'm ' + sc + 's') : (m + 'm ' + sc + 's');
    };
    const computePhaseInfo = (curPart) => {
      const curSt = R.tstate(curPart);
      if (curSt === 'run') {
        const elap = Math.max(0, Date.now() - startAt);
        return {
          text: '运行 ' + fmtSec(elap),
          tip: '当前命令正在运行中（已运行 ' + fmtSec(elap) + '）',
          mode: 'run',
          elap,
        };
      }
      if (!R.toolEnds.has(tid)) {
        const eTs = Number(curPart?._endAt) > 0 ? Number(curPart._endAt) : Date.now();
        R.toolEnds.set(tid, eTs);
        if (curPart && typeof curPart === 'object' && !curPart._endAt) curPart._endAt = eTs;
      }
      const endAt = Number(curPart?._endAt) > 0 ? Number(curPart._endAt) : (R.toolEnds.get(tid) || Date.now());
      const waitMs = Math.max(0, Date.now() - endAt);
      return {
        text: '等待 ' + fmtSec(waitMs),
        tip: '本条命令已结束，正在等待下一条步骤或回复输出（已等待 ' + fmtSec(waitMs) + '）',
        mode: 'wait',
        elap: waitMs,
      };
    };
    const initPhase = (opts?.showAppearTime && isTurnActive) ? computePhaseInfo(p) : null;
    const appearSpan = initPhase
      ? h('span', {
          class: 'tr-appear-time is-active is-' + initPhase.mode + (initPhase.elap >= 300000 ? ' is-stuck' : initPhase.elap >= 120000 ? ' is-warn' : ''),
          title: initPhase.tip,
        }, initPhase.text)
      : null;
    const stIcon = st === 'run' ? h('i', { class: 'spin' }) : h('span', { class: 'tr-st' + (st === 'warn' ? ' warn' : st === 'bad' ? ' bad' : ''), title: st === 'warn' ? '注意' : null }, st === 'ok' ? '✓' : st === 'warn' ? '!' : '✗');
    const ctChips = CmdTranslate.renderRowChips(p, st);
    const rawCmdTip = (inp && typeof inp === 'object' && (inp.command || inp.path || inp.file_path)) ? String(inp.command || inp.path || inp.file_path) : '';
    const smTitle = rawCmdTip ? ((inp?.cwd ? '（' + inp.cwd + '）\n' : '') + (rawCmdTip.length > 800 ? rawCmdTip.slice(0, 800) + '…' : rawCmdTip)) : null;
    const sm = h('summary', smTitle ? { title: smTitle } : {}, icon('term', 'ti'), h('span', { class: 'min-w-0 tr-main' }, h('span', { class: 'tr-used' }, 'used'), h('b', {}, R.tlabel(n)),
      stIcon,
      durSpan, ctChips, h('code', { class: 'tr-sum' }, String(R.tsum(inp)).split('\n')[0].slice(0, 160))), routeStartTag, nudgeBtn, appearSpan, icon('chev', 'tr-chev'));
    sm.__reactFiber = { memoizedProps: { part: R.extPart(p, key) }, return: null };
    const isOpen = !!R.openOf(key, false);
    d = R.keep(h('details', { class: 'trow ' + st + (isBash ? ' is-bash' : '') + (p?._routeStart ? ' is-route-start' : ''), open: isOpen || null }, sm), key);
    if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
    if (d.__appearTm) { clearInterval(d.__appearTm); d.__appearTm = null; }
    d.__curPart = p;
    if (appearSpan && isTurnActive) {
      const mountAppearAt = Date.now();
      const tickAppear = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!d.isConnected && Date.now() - mountAppearAt > 3000) { if (d.__appearTm) { clearInterval(d.__appearTm); d.__appearTm = null; } return; }
        const curP = d.__curPart || p;
        const cNow = R.chatOfEl(d);
        const cNowActive = Boolean(cNow && (typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(cNow) : (cNow.busy || cNow.live)));
        const stillActive = Boolean(cNow ? cNowActive : R.tstate(curP) === 'run');
        if (!stillActive) {
          appearSpan.remove();
          if (d.__appearTm) { clearInterval(d.__appearTm); d.__appearTm = null; }
          return;
        }
        const ph = computePhaseInfo(curP);
        appearSpan.textContent = ph.text;
        appearSpan.title = ph.tip;
        appearSpan.className = 'tr-appear-time is-active is-' + ph.mode + (ph.elap >= 300000 ? ' is-stuck' : ph.elap >= 120000 ? ' is-warn' : '');
      };
      d.__appearTm = setInterval(tickAppear, 1000);
    }
    if (st === 'run') {
      const mountAt = Date.now();
      const timeoutMs = ((typeof Prefs !== 'undefined' && Number(Prefs.bashTimeoutMin) > 0) ? Number(Prefs.bashTimeoutMin) : 60) * 60000;
      const tickDur = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        const curP = d.__curPart || p;
        const chat = R.chatOfEl(d);
        const chatActive = Boolean(chat && (typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(chat) : (chat.busy || chat.live)));
        if (!d.isConnected && Date.now() - mountAt > 3000) { if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; } return; }
        if (R.tstate(curP, chat ? chatActive : true) !== 'run' || (chat && !chatActive)) {
          if (d.__durTm) { clearInterval(d.__durTm); d.__durTm = null; }
          const rawEnd = R.tstate(curP);
          const endSt = rawEnd === 'ok' ? 'ok' : (rawEnd === 'warn' || rawEnd === 'run') ? 'warn' : 'bad';
          d.classList.remove('run', 'is-stuck');
          d.classList.add(endSt);
          const spinEl = sm.querySelector('i.spin');
          if (spinEl) spinEl.replaceWith(h('span', { class: 'tr-st' + (endSt === 'warn' ? ' warn' : endSt === 'bad' ? ' bad' : ''), title: endSt === 'warn' ? '注意' : null }, endSt === 'ok' ? '✓' : endSt === 'warn' ? '!' : '✗'));
          durSpan.className = 'tr-dur';
          durSpan.textContent = R.tdur(curP, tid);
          const oldCt = sm.querySelector('.ct-x');
          const nextCt = CmdTranslate.renderRowChips(curP, endSt);
          if (oldCt && nextCt) oldCt.replaceWith(nextCt);
          else if (oldCt) oldCt.remove();
          else if (nextCt) durSpan.after(nextCt);
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
    let lastToolIdx = -1;
    for (let k = items.length - 1; k >= 0; k--) { if (items[k]?.type !== 'reasoning') { lastToolIdx = k; break; } }
    for (let k = 0; k < lastToolIdx; k++) {
      const it = items[k];
      if (it && it.type !== 'reasoning' && R.tstate(it) === 'run') it._superseded = true;
    }
    let cut = items.length;
    if (live) { const i = items.findIndex((p, idx) => idx >= lastToolIdx && p.type !== 'reasoning' && R.tstate(p) === 'run'); if (i >= 0) cut = i; }
    if (lastToolIdx >= 0 && cut > lastToolIdx) cut = lastToolIdx;
    const doneItems = items.slice(0, cut), doneTools = doneItems.filter(p => p.type !== 'reasoning'), n = doneTools.length;
    const allBash = tools.every(p => /^(bash|shell|run_command)$/i.test(R.tname(p)));
    const what = allBash ? '命令' : '工具';
    const wrap = h('div', { class: 'tg-wrap' });
    const appendFoldedSegment = (segEntries, segKey) => {
      const segTools = segEntries.filter(e => e.p.type !== 'reasoning').map(e => e.p);
      const segN = segTools.length;
      if (!segN) {
        segEntries.forEach(({ p, j }) => { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) wrap.append(r); });
        return;
      }
      const bad = segTools.filter(p => R.tstate(p) === 'bad').length;
      const warn = segTools.filter(p => R.tstate(p) === 'warn').length;
      const hasRouteStart = segTools.some(p => p?._routeStart);
      const grpChips = CmdTranslate.renderGroupChips(segTools);
      const gsm = h('summary', {}, icon('chevr', 'tg-chev'), icon('term', 'ti'), h('span', { class: 'tg-lbl' }, '已运行' + what), h('span', { class: 'tg-n' }, String(segN)), grpChips, bad ? h('span', { class: 'tg-bad' }, bad + ' 个失败') : null, (!grpChips && warn) ? h('span', { class: 'tg-warn' }, warn + ' 个注意') : null, hasRouteStart ? h('span', { class: 'tg-bad tg-route' }, '⚠️ 含路由转折') : null);
      gsm.__reactFiber$extcompat = { memoizedProps: { parts: segTools.map((x, j) => R.extPart(x, segKey + ':' + j)), isActive: cut < items.length }, return: null };
      const isOpen = !!R.openOf(segKey, false);
      const d = R.keep(h('details', { class: 'tgroup', open: isOpen || null }, gsm), segKey);
      const box = h('div', { class: 'tg-list' });
      const buildRows = () => {
        if (box.__builtCount === segEntries.length) return;
        box.replaceChildren();
        segEntries.forEach(({ p, j }) => {
          if (p.type === 'reasoning') { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) box.append(r); }
          else {
            const rowKey = key + ':' + j, rowSig = R.tstate(p) + ':' + (p.errorText ? 1 : 0) + ':' + (R.openOf(rowKey, false) ? 1 : 0) + ':' + (p._routeStart ? 'R' : '') + ':' + (CmdTranslate.isEnabled() ? 1 : 0);
            box.append(Seg.use(key, 'tr:' + j, rowSig, () => R.toolRow(p, rowKey)));
          }
        });
        box.__builtCount = segEntries.length;
      };
      if (isOpen) buildRows();
      else d.addEventListener('toggle', () => { if (d.open) buildRows(); });
      d.append(box); wrap.append(d);
    };
    if (n) {
      let curSeg = [];
      let segIdx = 0;
      const flushSeg = () => {
        if (!curSeg.length) return;
        const sKey = segIdx === 0 ? key : (key + ':s' + segIdx);
        segIdx++;
        appendFoldedSegment(curSeg, sKey);
        curSeg = [];
      };
      doneItems.forEach((p, j) => {
        if (p.type !== 'reasoning' && R.tstate(p) === 'bad') {
          flushSeg();
          const rowKey = key + ':' + j, rowSig = R.tstate(p) + ':' + (p.errorText ? 1 : 0) + ':' + (R.openOf(rowKey, false) ? 1 : 0) + ':' + (p._routeStart ? 'R' : '') + ':' + (CmdTranslate.isEnabled() ? 1 : 0);
          wrap.append(h('div', { class: 'tg-live tg-fail-out' }, Seg.use(key, 'tr:' + j, rowSig, () => R.toolRow(p, rowKey))));
        } else {
          curSeg.push({ p, j });
        }
      });
      flushSeg();
    } else doneItems.forEach((p, j) => { const r = R.reasoning(p, false, key + ':r' + j, labels, live); if (r) wrap.append(r); });
    if (cut < items.length) {
      const tail = h('div', { class: 'tg-live' });
      const tailSlice = items.slice(cut);
      let lastTailToolIdx = -1;
      for (let tIdx = tailSlice.length - 1; tIdx >= 0; tIdx--) { if (tailSlice[tIdx]?.type !== 'reasoning') { lastTailToolIdx = tIdx; break; } }
      tailSlice.forEach((p, k) => {
        if (p.type === 'reasoning') {
          const r = R.reasoning(p, false, key + ':r' + (cut + k), labels, live);
          if (r) tail.append(r);
        } else {
          tail.append(R.toolRow(p, key + ':' + (cut + k), k === lastTailToolIdx ? { showAppearTime: true, live } : null));
        }
      });
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
  _inlineHtmlMemoKey: '',
  _inlineHtmlMemoVal: null,
  _inlineHtmlMemoMap: new Map(),
  countLinesFast(s) {
    if (!s) return 0;
    let n = 1;
    for (let i = 0, L = s.length; i < L; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  },
  extractInlineHtmlSegments(text, streaming = false) {
    const raw = String(text || '');
    if (raw.length < 100) return null;
    let rawHash = 2166136261 >>> 0;
    for (let hi = 0; hi < raw.length; hi++) { rawHash ^= raw.charCodeAt(hi); rawHash = Math.imul(rawHash, 16777619) >>> 0; }
    const memoKey = (streaming ? '1:' : '0:') + raw.length + ':' + rawHash.toString(36) + ':' + raw.slice(0, 48) + ':' + raw.slice(-48);
    if (this._inlineHtmlMemoKey === memoKey) return this._inlineHtmlMemoVal;
    if (this._inlineHtmlMemoMap.has(memoKey)) {
      const hit = this._inlineHtmlMemoMap.get(memoKey);
      this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = hit;
      return hit;
    }
    if (!/<(?:!doctype\s+html|html[\s>]|svg[\s>]|head[\s>]|body[\s>])|(?:`{3,}|~{3,})[ \t]*(?:html?|svg|xml)\b/i.test(raw)) {
      this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = null;
      if (this._inlineHtmlMemoMap.size >= 256) this._inlineHtmlMemoMap.delete(this._inlineHtmlMemoMap.keys().next().value);
      this._inlineHtmlMemoMap.set(memoKey, null);
      return null;
    }
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
        const res = htmlIdx > 0 ? out : null;
        this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = res;
        if (this._inlineHtmlMemoMap.size >= 256) this._inlineHtmlMemoMap.delete(this._inlineHtmlMemoMap.keys().next().value);
        this._inlineHtmlMemoMap.set(memoKey, res);
        return res;
      }
    }
    pushUnfencedOrMd(tail, true);
    const res = htmlIdx > 0 ? out : null;
    this._inlineHtmlMemoKey = memoKey; this._inlineHtmlMemoVal = res;
    if (this._inlineHtmlMemoMap.size >= 256) this._inlineHtmlMemoMap.delete(this._inlineHtmlMemoMap.keys().next().value);
    this._inlineHtmlMemoMap.set(memoKey, res);
    return res;
  },
  inlineHtmlPath(m, seg) {
    const midShort = String(m?.id || 'msg').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'msg';
    return `inline-${midShort}-${(seg?.idx ?? 0) + 1}.${seg?.ext || 'html'}`;
  },
  inlineHtmlCard(seg, key, m, chat) {
    const vpath = R.inlineHtmlPath(m, seg);
    const text = String(seg?.code || '');
    const lines = R.countLinesFast(text);
    const running = !!seg?.running;
    const ext = String(seg?.ext || 'html').toUpperCase();
    const posTag = m?.participantPosition === 'a' ? 'Model A · ' : m?.participantPosition === 'b' ? 'Model B · ' : '';
    const dispTitle = seg?.title ? `${posTag}${seg.title} (${vpath})` : `${posTag}内嵌 ${ext} 页面 (${vpath})`;
    const existingWrap = !Seg.off ? R.wraps.get(key) : null;
    if (existingWrap && existingWrap._detailsEl) {
      const d = existingWrap._detailsEl;
      d.__inlineCode = text;
      d.classList.toggle('run', running);
      d.classList.toggle('ok', !running);
      if (existingWrap._titleEl && existingWrap._titleEl.textContent !== dispTitle) existingWrap._titleEl.textContent = dispTitle;
      if (existingWrap._linesEl) {
        const lTxt = lines ? lines + ' 行' : '';
        if (existingWrap._linesEl.textContent !== lTxt) existingWrap._linesEl.textContent = lTxt;
      }
      if (existingWrap._spinEl) existingWrap._spinEl.hidden = !running;
      if (d.open && existingWrap._preEl) {
        existingWrap._preEl.textContent = text.length > 60000 ? text.slice(0, 60000) + '\n…' : text || '（空）';
      }
      if (typeof HtmlPreview !== 'undefined' && HtmlPreview.card) {
        const card = HtmlPreview.card(key, { path: vpath, running, get: existingWrap._getTxt, getWsid: existingWrap._getWsid, onOpen: existingWrap._onOpen });
        const old = existingWrap.querySelector(':scope>.pvc');
        if (old !== card) old ? old.replaceWith(card) : existingWrap.append(card);
      }
      return existingWrap;
    }
    let d = null;
    const sidOf = el => el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || chat?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
    const getTxt = () => d?.__inlineCode || text;
    const openPv = (mode = 'run') => {
      if (typeof HtmlPreview === 'undefined' || !HtmlPreview.open) return;
      const sid = sidOf(d);
      const curChat = chat || (sid && typeof Chats !== 'undefined' ? Chats.get?.(sid) : null);
      if (curChat?.isEvaluation && m && typeof HtmlPreview.openEvalMessage === 'function') {
        HtmlPreview.openEvalMessage(curChat, m, { path: vpath, mode });
        return;
      }
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
    const titleEl = h('code', { class: 'wc-p', title: '点击在预览窗口展开查看' }, dispTitle);
    const linesEl = h('span', { class: 'dim' }, lines ? lines + ' 行' : '');
    const spinEl = h('i', { class: 'spin', hidden: !running });
    const wsm = h('summary', {},
      h('span', { class: 'wc-w' }, ext),
      titleEl,
      linesEl,
      spinEl,
      h('span', { class: 'grow' }),
      pvBtn,
      codeBtn,
      icon('chevr', 'tg-chev')
    );
    const isOpen = Boolean(R.openOf(key, false));
    d = R.keep(h('details', { class: 'wcard ' + (running ? 'run' : 'ok') + ' pvable inline-html-card', open: isOpen || null }, wsm), key);
    d.__inlineCode = text;
    wsm.addEventListener('click', ev => {
      if (ev.target.closest('.tg-chev,button')) return;
      ev.preventDefault();
      ev.stopPropagation();
      openPv('run');
    });
    let bodyBuilt = false, preEl = null, wrap = null;
    const ensureBody = () => {
      if (bodyBuilt) return;
      bodyBuilt = true;
      const curTxt = getTxt();
      preEl = h('pre', { class: 'wc-code' }, curTxt.length > 60000 ? curTxt.slice(0, 60000) + '\n…' : curTxt || '（空）');
      if (wrap) wrap._preEl = preEl;
      d.append(h('div', { class: 'wc-card' },
        h('div', { class: 'wc-h' }, icon('file'), h('span', {}, dispTitle), h('span', { class: 'grow' }), h('span', { class: 'wc-lang' }, ext),
          h('button', { class: 'ib xs', title: '复制代码', onclick: e => { e.preventDefault(); e.stopPropagation(); copyText(getTxt()); } }, icon('copy'))),
        preEl
      ));
    };
    if (isOpen) ensureBody();
    else d.addEventListener('toggle', () => { if (d.open) ensureBody(); }, { passive: true });
    if (Seg.off || typeof HtmlPreview === 'undefined' || !HtmlPreview.card) return d;
    const getWsidFn = () => sidOf(d);
    const onOpenFn = mode => openPv(mode || 'run');
    const card = HtmlPreview.card(key, { path: vpath, running, get: getTxt, getWsid: getWsidFn, onOpen: onOpenFn });
    wrap = h('div', { class: 'wc-wrap inline-html-wrap' }, d, card);
    wrap._detailsEl = d;
    wrap._titleEl = titleEl;
    wrap._linesEl = linesEl;
    wrap._spinEl = spinEl;
    wrap._preEl = preEl;
    wrap._getTxt = getTxt;
    wrap._getWsid = getWsidFn;
    wrap._onOpen = onOpenFn;
    R.wraps.set(key, wrap);
    if (R.wraps.size > 200) R.wraps.delete(R.wraps.keys().next().value);
    return wrap;
  },
  // 这个对话里 Write 出来的所有可预览文件（含对话正文内嵌的完整 HTML/SVG）：预览面板的「文件」下拉与自动截图共用
  _writesCache: new Map(),
  writes(sid) {
    const chat = Chats.get(sid);
    if (!chat) return [];
    const stamp = R._chatWriteStamp(chat);
    const cached = R._writesCache.get(sid);
    if (cached && cached.stamp === stamp) return cached.list;
    const seen = new Map();
    for (const m of chat.messages || []) for (const p of m.parts || []) {
      if (!p) continue;
      if ((String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && R.isWrite(p)) {
        const inp = R.tinput(p) || {}, path = R.normPath(inp.path || inp.file_path || '');
        if (!path || !HtmlPreview.previewable(path)) continue;
        seen.set(path, { path, running: Boolean(Hitl.blocked(chat) && R.tstate(p, true) === 'run'), get: () => R.latestFileText(sid, path, p) });
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
    const list = [...seen.values()];
    if (R._writesCache.size >= 40) R._writesCache.delete(R._writesCache.keys().next().value);
    R._writesCache.set(sid, { stamp, list });
    return list;
  },
  writeCard(p, key, live = false) {
    const chatSid = arguments[3] || null;
    const inp = R.tinput(p) || {}, path = String(inp.path || inp.file_path || ''), short = R.normPath(path);
    const sidOf = el => el?.closest?.('[data-wsid]')?.getAttribute('data-wsid') || chatSid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null) || null;
    const getTxt = () => R.latestFileText(sidOf(d), short, p);
    const rawContent = typeof inp.content === 'string' ? inp.content : typeof inp.text === 'string' ? inp.text : '';
    const latestTxt = R.latestFileText(chatSid, short, p);
    const text = (latestTxt && (!rawContent || rawContent.includes('…[cached]') || latestTxt.length > rawContent.length)) ? latestTxt : (rawContent || latestTxt);
    const lines = R.countLinesFast(text), st = R.tstate(p, live), name = path.split('/').pop() || path;
    const ext = (/\.([\w]+)$/.exec(name)?.[1] || 'plain').toUpperCase();
    const pv = HtmlPreview.previewable(path);   // html / svg：点这一行在右侧内嵌预览（箭头仍是展开代码）
    const linesEl = h('span', { class: 'dim' }, lines ? lines + ' 行' : '');
    const wsm = h('summary', {}, h('span', { class: 'wc-w' }, 'Write'), pv ? h('code', { class: 'wc-p', title: '点击在右侧预览' }, short) : h('code', { class: 'wc-p fpath', 'data-fpath': short, title: '在工作区打开' }, short), linesEl, st === 'run' ? h('i', { class: 'spin' }) : st === 'bad' ? h('span', { class: 'tr-st bad' }, '✗') : null, h('span', { class: 'grow' }), icon('chevr', 'tg-chev'));
    wsm.__reactFiber$extcompat = { memoizedProps: { part: R.extPart(p, key) }, return: null };
    const isOpen = Boolean(R.openOf(key, false) || p.errorText);
    const d = R.keep(h('details', { class: 'wcard ' + st + (pv ? ' pvable' : ''), open: isOpen || null }, wsm), key);
    d._linesEl = linesEl; d._filePath = short; d._wsid = chatSid;
    if (pv) HtmlPreview.bindRow(d.querySelector('summary'), { path: short, get: getTxt, getWsid: () => sidOf(d) });
    let bodyBuilt = false;
    const ensureBody = () => {
      if (bodyBuilt) return;
      bodyBuilt = true;
      const curTxt = getTxt() || text;
      d.append(h('div', { class: 'wc-card' }, h('div', { class: 'wc-h' }, icon('file'), h('span', {}, name), h('span', { class: 'grow' }), h('span', { class: 'wc-lang' }, ext.length > 6 ? 'PLAIN' : ext), h('button', { class: 'ib xs', title: '复制', onclick: e => { e.preventDefault(); copyText(getTxt() || text); } }, icon('copy'))),
        h('pre', { class: 'wc-code' }, curTxt.length > 60000 ? curTxt.slice(0, 60000) + '\n…' : curTxt || '（空）'),
        p.errorText ? h('pre', { class: 'err' }, p.errorText) : null));
    };
    if (isOpen) ensureBody();
    else d.addEventListener('toggle', () => { if (d.open) ensureBody(); }, { passive: true });
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
        if (e?.status === 403 && /recaptcha/i.test(e.body || '') && !opt.v2) { const tok = await Recaptcha.v2().catch(() => null); if (tok) { d.sending = false; return R.hitlSend(chat, p, out, { ...opt, v2: tok }); } }
        // 失败原因留在卡片上（toast 几秒就没了，看不到就没法判断是哪一步出的问题）；选项草稿还在，直接再点提交即可
        d.sending = false; d.err = describe(e) + (e?.status ? '（HTTP ' + e.status + '）' : ''); toast('提交失败：' + describe(e), 'err'); chat.emit(); scheduleChat(chat);
      });
  },
  // 卡片底部状态行：提交中显示卡在哪一步（等服务器 / 人机验证 / 发送中…），失败显示原因
  hitlNote(chat, p) {
    const d = UI.hitlDraft.get(p.toolCallId) || {};
    if (d.err) return h('div', { class: 'hq-note err' }, '没有发出去：' + d.err + '。选项已保留，可以直接再点提交。');
    if (d.sending && chat.phase && !Hitl.blocked(chat)) return h('div', { class: 'hq-note' }, h('i', { class: 'spin' }), chat.phase);
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
    const isSettledAsst0 = m.role === 'assistant' && !m.metadata?.pending && !m._incomplete && Boolean(m._finishedAt || m.metadata?.timing?.completedAt || m.metadata?.aborted || m.metadata?.error || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn');
    const liveNow = !m.failed && !Hitl.idleWait(chat) && !(isSettledAsst0 && !chat?.streaming) && (chat.live === m || !!(isLast && m.role === 'assistant' && !isSettledAsst0 && Hitl.blocked(chat) && !chat?.waitingForeign));
    if (liveNow) prev.setAttribute('data-streaming', 'true'); else prev.removeAttribute('data-streaming');
    patchKids(prev, out.kids);
    return prev;
  },
  message0(m, chat, isLast, out, seg) {
    const isUnverifiedCache = Boolean((chat?.cached && !chat?.loaded) || chat?._recoveringIncomplete);
    const isIncTail = Boolean(isLast && m.role === 'assistant' && !m._userStopped && isUnverifiedCache && (
      m.metadata?.pending ||
      m._incomplete ||
      m.status === 'pending' ||
      m.status === 'streaming' ||
      (typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(m))
    ));
    if (isIncTail && chat && !chat.busy && !chat.loading && !chat._incSyncing && !(typeof window !== 'undefined' && window.__BRANA_BROWSE_MODE)) {
      chat._incSyncing = true;
      setTimeout(() => {
        const p = (chat.isEvaluation && typeof EvalEngine !== 'undefined' && typeof EvalEngine.loadChat === 'function')
          ? EvalEngine.loadChat(chat, true)
          : (typeof chat.load === 'function' ? chat.load(true) : null);
        Promise.resolve(p).catch(() => {}).finally(() => { chat._incSyncing = false; });
      }, 30);
    }
    const isSettledAsst = m.role === 'assistant' && !m.metadata?.pending && !m._incomplete && Boolean(m._finishedAt || m.metadata?.timing?.completedAt || m.metadata?.aborted || m.metadata?.error || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn');
    const live = !m.failed && !Hitl.idleWait(chat) && !(isSettledAsst && !chat?.streaming) && (chat.live === m || !!(isLast && m.role === 'assistant' && !isSettledAsst && ((Hitl.blocked(chat) && !chat?.waitingForeign) || isIncTail)));
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
      const txt = (m.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n') || String(m.text || '');
      const ups = userAtts(m);
      if (ups.length) el.append(h('div', { class: 'att-row mine' }, ups.map(u => attView(u, true))));
      const tr = (m.parts || []).filter(p => p.type === 'data-tool-results' && Array.isArray(p.data)).flatMap(p => p.data);
      if (tr.length) el.append(h('div', { class: 'hitl-chip' }, icon('check'), tr.map(r => R.hitlBrief(r, chat)).join('；')));
      if (txt) el.append(h('div', { class: 'bubble prose' + (m.failed ? ' is-unsent' : ''), lang: '', translate: 'no', 'data-user-message-body-row': 'true' }, txt));
      if (!txt && tr.length) return el;
      const st = m._sentAt || idTime(m.id);
      el.append(h('div', { class: 'msg-act' + (m.failed ? ' is-failed' : ''), 'data-user-message-action': 'true' },
        m.failed ? h('span', { class: 'msg-fail-tag', title: '该消息未发出（服务器未收到），点击右侧「重试」重新发送' }, '⚠ 未发出') : null,
        m.failed ? h('button', { class: 'btn sm msg-retry-btn', type: 'button', title: '重新发送这条未发出的消息', onclick: ev => { ev.stopPropagation(); UI.retry(chat, m, false); } }, '↻ 重试') : null,
        h('button', { class: 'ib', type: 'button', title: '复制', 'aria-label': 'Copy', onclick: () => copyText(txt) }, icon('copy')),
        st ? h('span', { class: 'mtime', title: '发送时间 ' + clockFull(st) }, clock(st)) : null));
      return el;
    }
    // 正文区域保持同一个节点，段落按指纹复用（见 Seg）
    if (chat?.sid) el.setAttribute('data-wsid', chat.sid);
    const reasonAccess=ThinkingStatus.access(chat,m),reasonLabels={live:ThinkingStatus.label(chat,m,chat.phase==='思考中',reasonAccess),done:ThinkingStatus.label(chat,m,false,reasonAccess),of:(p,s)=>ThinkingStatus.label(chat,m,s,reasonAccess,p)};
    if (live) m._streamed = true;
    const body = Seg.box(m.id, 'body', () => h('div', { class: 'msg-body' })), segs = [], mid = m.id;
    const running = p => p.state !== 'output-available' && p.state !== 'output-error' && p.state !== 'output-denied' || !!p.preliminary;
    const outSig = p => p.output === undefined ? -1 : typeof p.output === 'string' ? p.output.length : (p.output?.stdout?.length || 0) + (p.output?.stderr?.length || 0) + (p.output?.exit_code ?? 0);
    const pSig = p => {
      const cStr = typeof p.input?.content === 'string' ? p.input.content : (typeof p.input?.text === 'string' ? p.input.text : '');
      const inSig = p.input ? ((cStr.length || 1) + (cStr.includes('…[cached]') ? 'S' : '')) : 0;
      return p.type + ':' + (p.state || '') + ':' + (p.text?.length || 0) + ':' + (p.inputText?.length || 0) + ':' + inSig + ':' + outSig(p) + ':' + (p.preliminary ? 1 : 0) + ':' + (p.errorText ? 1 : 0);
    };
    const isEvalMsg = Boolean(chat?.isEvaluation || m.webdev || m.webdevTemplate || m.activeWorkflowRunId || m.metadata?.workflowRunId);
    let grp = null;
    const flush = () => {
      if (!grp) return; const g = grp; grp = null;
      const sig = (live ? 'L' : '') + (CmdTranslate.isEnabled() ? 'T' : '') + '|' + g.items.map(pSig).join(',');
      if (isEvalMsg && typeof EvalView !== 'undefined' && typeof EvalView.renderToolStepGroup === 'function') {
        segs.push(Seg.use(mid, 'wdg:' + g.start, sig, () => EvalView.renderToolStepGroup(g.items, chat, m, 'a', live)));
        return;
      }
      segs.push(Seg.use(mid, 'g:' + g.start, sig, () => R.group(g, mid + ':' + g.start, live, reasonLabels)));
    };
    (m.parts || []).forEach((p, i) => {
      if (!p || !p.type) return;
      const isTool = p.type.startsWith('tool-') || p.type === 'dynamic-tool';
      if (isTool && Hitl.name(p)) { flush(); segs.push(Seg.use(mid, 'h:' + (p.toolCallId || i), R.hitlSig(p, chat, isLast), () => R.hitl(p, chat, m, isLast))); return; }
      if (isTool && (isEvalMsg || !R.isWrite(p))) { (grp ||= { start: i, items: [] }).items.push(p); return; }
      if (p.type === 'step-start' || p.type.startsWith('data-') || (p.type === 'text' && !p.text)) return;
      // 开源思考（有可见思考文字）绝不能像 bash 一样被折叠进「已运行工具」中：先 flush 工具组，再独立标红展示
      if (p.type === 'reasoning' && !ThinkingStatus.visible(p) && grp && !isEvalMsg) return;
      flush();
      if (isTool) { segs.push(Seg.use(mid, 'w:' + i, pSig(p) + (live ? ':L' : ''), () => R.writeCard(p, mid + ':' + i, live, chat?.sid))); return; }
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
        const key = mid + ':r' + i, d = Seg.box(mid, 'r:' + i, () => {
          const b = h('div', { class: 'md prose muted', lang: '', translate: 'no' });
          const badge = h('span', { class: 'rs-open-badge', hidden: true }, '开源思考');
          const x = R.keep(h('details', { class: 'reason not-prose' }, h('summary', { role: 'button' }, icon('brain'), badge, h('span', { class: 'rs-t' })), b), key);
          x.__b = b; x.__badge = badge;
          x.addEventListener('toggle', () => {
            if (x.open && x.__rawTxt !== undefined) StreamMD.paint(b, x.__rawTxt || '…', !!x.__rawStream);
          });
          return x;
        });
        const streaming = live && p.state === 'streaming';
        const hasVisP = ThinkingStatus.visible(p);
        const isGemBoldP = hasVisP && /^\s*\*\*[^\n*]{2,80}\*\*/.test(String(p?.text || '')) && (m?.parts || []).every(pt => !pt?.id || /^\d+$/.test(String(pt.id)));
        const isExplicitOpenTurn = Boolean(m?.metadata?.openThinkStopped || (hasVisP && !isGemBoldP) || (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(chat)?.kind === 'compat-thinking' && !isGemBoldP));
        const isClosedTurn = !isExplicitOpenTurn && (reasonAccess?.type === 'closed' || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(chat, m)));
        const openThink = !isClosedTurn && (hasVisP || isExplicitOpenTurn);
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
        d.__rawTxt = p.text || '…';
        d.__rawStream = streaming;
        if (d.open) StreamMD.paint(d.__b, d.__rawTxt, streaming);
        segs.push(d); return;
      }
      const n = Seg.use(mid, 'p:' + i, pSig(p) + ':' + (p.url || '') + (live ? 'L' : ''), () => R.part(p, { live }));
      if (n) segs.push(n);
    });
    flush();
    if (isEvalMsg && typeof EvalView !== 'undefined' && typeof EvalView.renderWebDevStatusFooter === 'function') {
      const wdFoot = EvalView.renderWebDevStatusFooter(chat, m, 'a', live);
      if (wdFoot) segs.push(wdFoot);
    }
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
      let nextAsst = seg?.nextAsstMsg !== undefined ? seg.nextAsstMsg : undefined;
      if (nextAsst === undefined) {
        const assts = chat.messages.filter(x => x && x.role === 'assistant' && x.id);
        const myIdx = assts.findIndex(x => x.id === m.id);
        nextAsst = myIdx >= 0 ? (assts[myIdx + 1] || null) : null;
      }
      if (nextAsst) {
        prevNotice = validNotice(nextAsst._routeNotice || (nextAsst.id && miRoute?.routeNotices?.[nextAsst.id]) || null);
      }
    }
    const isPivotPrev = !seg?.hideFoot && !rn && (m._routePivotRole === 'prev' || Boolean(prevNotice));
    const isPivotNext = !seg?.hideFoot && (m._routePivotRole === 'next' || Boolean(rn));
    if (rn) {
      const suspectedModel = String(rn.toLabel || rn.toShort || miRoute?.routeTo || miRoute?.reverseLabel || miRoute?.candidateName || miRoute?.name || '其他模型')
        .replace(/(\s*\((?:None|Minimal|Low|Medium|High|xHigh|Max)\))(?:\s*\1)+/gi, '$1')
        .replace(/[?？]+$/, '')
        .trim();
      const fromModel = String(rn.fromLabel || rn.fromShort || miRoute?.routeFrom || '')
        .replace(/(\s*\((?:None|Minimal|Low|Medium|High|xHigh|Max)\))(?:\s*\1)+/gi, '$1')
        .replace(/[?？]+$/, '')
        .trim();
      const sm = m._routeStepInfo || rn.stepMeta || null;
      const stepSuffix = sm && sm.toolIdx ? `（自本轮第 #${sm.toolIdx} 步 ${sm.toolName || 'tool'} 起）` : '';
      const isFollowup = Boolean(rn.isFollowup);
      const rText = isFollowup
        ? `⚠️ 路由切换提醒：当前回复由切换后的 ${suspectedModel} 生成${fromModel ? '（自第 #' + (rn.toTurn || '?') + ' 轮起由 ' + fromModel + ' 切换）' : ''}`
        : fromModel
          ? `⚠️ 路由切换提醒：本轮起模型已由 ${fromModel} 切换为 ${suspectedModel}${stepSuffix}`
          : `⚠️ 路由提示：对话疑似 ${suspectedModel}${stepSuffix}`;
      const rTitle = [
        fromModel ? `检测到中途路由：${fromModel} → ${suspectedModel}` : `对话疑似切换为 ${suspectedModel}`,
        rn.fromTurn && rn.toTurn ? `切换位置：第 #${rn.fromTurn} 轮 → 第 #${rn.toTurn} 轮` : '',
        rn.reason || miRoute?.routeReason ? `判据：${rn.reason || miRoute?.routeReason}` : ''
      ].filter(Boolean).join(' · ');
      segs.push(Seg.use(mid, 'route-alert', rText, () => h('div', {
        class: `msg-route-alert${isFollowup ? ' is-followup' : ''}`,
        'data-route-pivot': isFollowup ? '0' : '1',
        role: 'status',
        title: rTitle
      }, icon('alert'), h('span', {}, rText))));
    }
    if (!live && isEvalMsg && (m.failed || m.status === 'failed' || m.metadata?.error) && !segs.length) {
      const errMsg = String(m.metadata?.error || chat?.error || '该轮回复生成失败');
      segs.push(Seg.use(mid, 'eval-fail', errMsg, () => h('div', { class: 'msg-route-alert is-eval-fail', role: 'status' },
        icon('alert'),
        h('span', { class: 'grow' }, errMsg),
        h('button', { type: 'button', class: 'btn sm ghost', onclick: ev => { ev.stopPropagation(); void UI.regen(chat); } }, '↻ 重新生成')
      )));
    }
    if (live) {
      const tRow = Seg.box(mid, 'typing', () => h('div', { class: 'typing-row typing-live-row' },
        h('div', { class: 'typing', title: '正在生成与执行中…' }, h('i'), h('i'), h('i')),
        h('span', { class: 'phase typing-phase' }, h('span', { class: 'ph-t' }), h('span', { class: 'dim anc-since' }))
      ));
      const rawPhTxt = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.phase) ? ThinkingStatus.phase(chat) : (chat?.phase || '生成中');
      const lastSegEl = segs.length ? segs[segs.length - 1] : null;
      const activeReasonTitle = (lastSegEl && lastSegEl.classList?.contains('reason') && lastSegEl.querySelector?.('.rs-t')?.textContent) || '';
      const phTxt = (activeReasonTitle && (activeReasonTitle === rawPhTxt || (/思考中/.test(activeReasonTitle) && /思考中/.test(rawPhTxt)))) ? '' : rawPhTxt;
      const phEl = tRow.querySelector('.ph-t');
      if (phEl && phEl.textContent !== phTxt) phEl.textContent = phTxt;
      const sinceEl = tRow.querySelector('.anc-since');
      if (sinceEl) {
        const effSince = Number(chat?.sentAt) || Number(chat?.oursAt) || (typeof getMsgTs === 'function' ? getMsgTs(m) : 0) || (typeof idTime === 'function' ? idTime(m?.id) : 0) || Number(chat?.recAt) || 0;
        if (Number.isFinite(effSince) && effSince > 1e12) {
          const sStr = String(effSince);
          if (sinceEl.dataset.since !== sStr) sinceEl.dataset.since = sStr;
          const secTxt = ' ' + Math.max(0, Math.floor((now() - effSince) / 1000)) + 's';
          if (sinceEl.textContent !== secTxt) sinceEl.textContent = secTxt;
        } else {
          delete sinceEl.dataset.since;
          if (sinceEl.textContent) sinceEl.textContent = '';
        }
      }
      segs.push(tRow);
    }
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
    const isBoot = el => Boolean(el?.hasAttribute?.('data-anc-boot') || el?.id === 'anc-boot-loader');
    const take = (parent, list, keep) => { for (const el of [...(parent?.children || [])]) if (!keep(el)) { list.push(el); el.remove(); } };
    take(root, out.html, el => el.tagName === 'HEAD' || el.tagName === 'BODY' || isBoot(el));
    take(doc.head, out.head, el => (el.tagName !== 'STYLE' && el.tagName !== 'LINK') || isBoot(el));
    take(doc.body, out.body, el => el.tagName === 'PRE' || el.tagName === 'SCRIPT' || isBoot(el));
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
  mountBootView() {
    if (typeof window !== 'undefined' && (window.__fixture || window.__routeFixture)) return;
    const v = $('#view');
    if (!v || v.children.length > 0) return;
    const stepEl = h('div', { id: 'anc-boot-view-step', style: { fontSize: '15px', fontWeight: '600', marginBottom: '6px' } }, '正在初始化客户端环境…');
    const subEl = h('div', { id: 'anc-boot-view-sub', class: 'dim', style: { fontSize: '12px', marginBottom: '14px' } }, '正在准备账号会话与安全代理通道…');
    const barFill = h('div', { style: { width: '42%', height: '100%', borderRadius: '4px', background: 'currentColor', opacity: '0.65', animation: 'ancBootBar 1.3s ease-in-out infinite' } });
    const barWrap = h('div', { style: { width: '220px', height: '4px', borderRadius: '4px', background: 'rgba(128,128,128,0.18)', overflow: 'hidden', margin: '0 auto 14px' } }, barFill);
    const diagEl = h('div', { id: 'anc-boot-view-diag', hidden: true, style: { marginTop: '12px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(128,128,128,0.09)', border: '1px solid rgba(128,128,128,0.2)', maxWidth: '420px', textAlign: 'left', fontSize: '12px', lineHeight: '1.6' } });
    const root = h('div', { class: 'anc-boot-view', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center', userSelect: 'none' } },
      h('style', {}, '@keyframes ancBootBar{0%{transform:translateX(-110%)}100%{transform:translateX(250%)}}@keyframes ancBootPulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.06);opacity:1}}'),
      h('div', { style: { position: 'relative', width: '44px', height: '44px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'ancBootPulse 2s ease-in-out infinite' } },
        h('i', { class: 'spin', style: { width: '36px', height: '36px', borderWidth: '2.5px' } })),
      stepEl,
      subEl,
      barWrap,
      diagEl
    );
    v.appendChild(root);
    clearTimeout(this._bootDiagT);
    const startedAt = Date.now();
    this._bootDiagT = setTimeout(() => {
      if (!root.isConnected) return;
      const acct = this.host?.account || {};
      const errReason = acct.tunErr || (typeof IP !== 'undefined' && IP.err) || (typeof AuthEnv !== 'undefined' && AuthEnv.lastError) || '当前代理节点或网络响应较慢，正在等待远端握手确认';
      const curStep = stepEl.textContent || '初始化中';
      diagEl.hidden = false;
      diagEl.replaceChildren(
        h('div', { style: { fontWeight: '600', marginBottom: '4px', color: '#f59e0b' } }, '⏳ 启动耗时较长（已等待 ' + Math.round((Date.now() - startedAt) / 1000) + ' 秒）'),
        h('div', { class: 'dim', style: { marginBottom: '4px' } }, '当前卡在阶段：' + curStep),
        h('div', { class: 'dim', style: { marginBottom: '10px' } }, '可能原因：' + errReason + (acct.proxyIp ? '（当前 ProxyIP: ' + acct.proxyIp + '）' : '')),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { type: 'button', class: 'btn sm', onclick: () => { try { if (typeof RegionIP !== 'undefined') RegionIP.open({ offlineAlert: true }); } catch {} } }, '切换节点 / ProxyIP'),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { try { this.enterBrowseMode('已手动跳过启动等待 · 可查阅本地对话或切换节点'); } catch {} } }, '离线查阅模式'),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => { try { this.loginGate('已手动跳过等待，请检查代理节点或直接登录'); } catch {} } }, '打开登录页'),
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => location.reload() }, '重新加载'))
      );
    }, 6000);
  },
  setBootStep(step, sub, isErr = false) {
    const stepEl = document.getElementById('anc-boot-view-step');
    const subEl = document.getElementById('anc-boot-view-sub');
    if (stepEl && step) {
      stepEl.textContent = step;
      if (isErr) stepEl.style.color = '#f87171';
    }
    if (subEl && sub !== undefined) subEl.textContent = sub;
  },
  build() {
    // 先摘下扩展挂进来的节点（见上方 ExtensionNodes），界面搭好后挂回去
    const kept = ExtensionNodes.detach(document);
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover"><title>Brana AI</title></head><body></body>';
    this.watchDrawer?.();   // <body> 刚被整个换掉：把抽屉监听重新挂到新 body 上
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); try { CSS = ''; } catch {}
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
      h('button', { id: 'dockhandle', type: 'button', title: '模型信息（可上下拖拽调整位置）', 'aria-label': '模型信息', onclick: e => { if (e.currentTarget?.dataset?.dragged === '1') { e.currentTarget.dataset.dragged = ''; return; } Dock.toggle(true); } }, h('span', { class: 'dh-mark' }, '>'))));
    try { this.mountBootView(); } catch {}
    try { if (typeof Mob !== 'undefined' && typeof Mob.initDockHandle === 'function') Mob.initDockHandle(); } catch {}
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
      if (!e.target.closest('.menu, #gpop, .rv') && now() - (this._menuOpenAt || 0) >= 450) document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
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
    try { Dock.render(); } catch (e) { console.error(e); } try { WS.render(); } catch (e) { console.error(e); }
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
              h('button', { type: 'button', class: 'btn ghost sm', onclick: () => applyLock(dplInput.value) }, '锁定部署'),
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
    if (!box.__pull) {
      box.__pull = 1;
      ListPull.bind(box);
      box.addEventListener('scroll', () => {
        this._scrollingList = true;
        window.__ancLastScrollAt = Date.now();
        clearTimeout(this._scrollListT);
        this._scrollListT = setTimeout(() => {
          this._scrollingList = false;
          if (this._pendingListRender) { this._pendingListRender = false; this.renderListSoon?.(); }
        }, 220);
      }, { passive: true });
    }
    if (this._scrollingList && !($('#q')?.value || '').trim()) {
      this._pendingListRender = true;
      return;
    }
    this.listDirty = false; SideTools.ensure();
    const q = ($('#q').value || '').trim().toLowerCase();
    const cur = Tabs.cur?.sid, vf = Prefs.vf || '';
    const vidOf = e => { const tv = typeof Titles !== 'undefined' && Titles.view ? Titles.view(e.id, e.title, e.localTitle) : null; return Brand.of(tv?.model) || tv?.vid || Brand.of(Models.get(e.id)?.name) || Brand.of(e.localTitle) || Brand.of(e.title) || ''; };
    SideTools.filter(q,vf);
    const archived=SideTools.scope==='archived';
    let items = SideTools.rows().filter(e => SideTools.matches(e,q));
    if (typeof ModeState !== 'undefined' && typeof ModeState.matchesHistoryEntry === 'function') items = items.filter(e => ModeState.matchesHistoryEntry(e));
    if (vf) items = items.filter(e => (vidOf(e) || 'other') === vf);
    // 增量更新：内容没变的卡片直接复用原来的 DOM 节点，只插入 / 移动 / 删除有变化的，流式回复时侧栏不再整块重建
    const frag = { list: [], append(...n) { this.list.push(...n); }, prepend(n) { this.list.unshift(n); } };
    const old = this._cards || new Map(); this._cards = new Map();
    this._cardOld = old;
    if (vf) frag.append(h('button', { class: 'vfbar', title: '点一下显示全部', onclick: () => { Prefs.vf = ''; savePrefs(); this.renderList(); } }, VIcon.el(vf, 12), '只看 ' + (Brand.NAME[vf] || vf), h('span', { class: 'grow' }), icon('x')));
    if (!archived && History.retrying) frag.prepend(h('div', { class: 'lnote', role: 'status' }, h('i', { class: 'spin' }), '列表刷新较慢，正在自动重试…'));
    else if (!archived && History.err && History.items.length && (History.limited() || History.errKind === 'limit')) { const left = Math.max(0, Math.ceil((Math.max(History.retryAt || 0, ReadLimit.until || 0) - now()) / 1000)); frag.prepend(h('div', { class: 'lnote', role: 'status', title: History.err }, left ? '列表暂缓刷新：服务器限流冷却中，约 ' + left + ' 秒后自动更新（不影响对话）' : '列表稍后自动更新（不影响对话）')); }
    else if (!archived && History.err) { const retry = h('button', { class: 'btn ghost sm', onclick: async () => { retry.disabled = true; retry.textContent = '刷新中…'; const is401 = /401|未登录|过期/.test(String(History.err || '')); if (is401 && typeof Auth !== 'undefined' && typeof Auth.relogin === 'function') { const ok = await Auth.relogin({ force: true }).catch(() => false); if (!ok && (!UI.me || UI.me.cached || UI.me.browseOnly || window.__BRANA_BROWSE_MODE)) { UI.loginGate?.('登录会话已过期，请输入密码重新登录'); return; } } await History.refresh({ manual: true }); if (!History.err) await History.loadAll(); } }, '刷新重试'); frag.prepend(h('div', { class: History.items.length ? 'lnote bad' : 'empty', role: 'status' }, (History.items.length ? '列表刷新失败（已显示本地列表，稍后自动重试）：' : '') + History.err, retry)); }
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
    const box = $('#list'); const sid = Tabs.cur?.kind ? null : Tabs.cur?.sid;
    if (sid && typeof RunningTracker !== 'undefined') RunningTracker.markViewed(sid);
    if (!box) return;
    for (const c of box.children) if (c.dataset?.sid !== undefined) c.classList.toggle('on', !!sid && c.dataset.sid === sid);
  },
  // 侧栏卡片（油猴格式）：logo 圆 · 型号短名 + 备注（小字、不加粗）· 右侧 MM-DD HH:MM；进行中 logo 顺时针转，出错红、完成绿
  card(r, cur) {
    if (r.e?._pending) return h('div', { class: 'card pending busy gstep-card', role: 'status', title: '抽卡：正在创建对话（reCAPTCHA + 服务器创建），拿到 ID 后自动替换' }, h('i', { class: 'spin' }), h('span', { class: 'grow' }, r.e.title), h('span', { class: 'gstep-tag' }, '建连'), h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: '12%' } })), h('i', { class: 'pulse-wave', 'aria-hidden': 'true' }));
    const e = r.e, c = Chats.get(e.id), v = r.tv || Titles.view(e.id, e.title), mi = Models.get(e.id);
    const isEvalEntry = Boolean(e.type === 'evaluation' || e.mode === 'battle' || e.mode === 'direct' || c?.isEvaluation);
    const isBattleEntry = Boolean(v?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(e, c)));
    const battleStatus = isBattleEntry && typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function'
      ? EvalView.getBattleStatusLabel(c, e)
      : (v?.battleStatus || '');
    const evalSub = (isEvalEntry && typeof EvalView !== 'undefined' && typeof EvalView.formatHistorySubtitle === 'function') ? EvalView.formatHistorySubtitle(e) : '';
    const shown = isBattleEntry
      ? (battleStatus || '待选择')
      : isEvalEntry
        ? (evalSub || cardName(v.model || v.plain) || e.title || '未命名')
        : (cardName(v.model || v.plain) || '未命名');
    const note = isBattleEntry
      ? (v.note || (evalSub && evalSub !== 'Battle · 匿名盲测' ? evalSub : ''))
      : isEvalEntry
        ? (v.note || (evalSub && e.title ? String(e.title).slice(0, 26) : ''))
        : v.note;
    const at = entAt(e);
    const d = new Date(at), tm = Number.isFinite(at) ? pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
    const gstep0 = typeof Gacha !== 'undefined' && Gacha.stepOf ? Gacha.stepOf(e.id) : null;
    const hasKnownModel = !!(isEvalEntry || r.vid || v.vid || (v.model && !/^(未识别|未知型号|待定)$/.test(String(v.model).trim())) || (mi?.name && !/^(未识别|未知型号|待定)$/.test(String(mi.name).trim()) && !mi?.pendingConfirm));
    const identSt = (!isEvalEntry && !gstep0 && !hasKnownModel && typeof BillingProbe !== 'undefined' && BillingProbe.identStatus) ? BillingProbe.identStatus(e.id, mi) : null;
    const gstep = gstep0 || identSt;
    const isChatSettledIdle = Boolean(c?.loaded && !c?.cached && !c?.loading && !c?.busy && !(c?.streaming && !c?.peeking) && !c?._evalStreaming && !c?.cloudRunning && !c?.midTurnStall && !c?.fakeEnd && !c?._ka?.plan);
    const isTrackedRun = !isChatSettledIdle && Boolean(typeof RunningTracker !== 'undefined' && RunningTracker.isTrackedRunning?.(e.id));
    const isChatBusy = Boolean(c && (typeof Hitl !== 'undefined' ? Hitl.blocked(c) : c.busy));
    const isRunStep = !!(isChatBusy || (c?.streaming && !c?.peeking && !(typeof Hitl !== 'undefined' && Hitl.idleWait(c))) || c?._evalStreaming || c?.cloudRunning || (!isChatSettledIdle && c?._startupResuming) || c?.midTurnStall || c?.fakeEnd || c?._ka?.plan || isTrackedRun || gstep0?.active);
    const on = e.id === cur, st = isRunStep ? 'run' : c && chatState(c) === 'bad' ? 'bad' : '';
    const topConfSig = !isEvalEntry && typeof BillingProbe !== 'undefined' && BillingProbe.topConfidence ? BillingProbe.topConfidence(e.id, mi) : null;
    const goldChat = typeof Gold !== 'undefined' && typeof Gold.hasChat === 'function' ? Gold.hasChat(e.id) : false;
    const hasDoneDot = Boolean(!on && !isRunStep && typeof RunningTracker !== 'undefined' && RunningTracker.isUnread(e.id));
    const sig = [CardSelect.mode,CardSelect.ids.has(e.id),SideTools.scope,on, !!c?.busy, st, hasDoneDot ? 1 : 0, gstep?.text || '', gstep?.pct || 0, gstep?.status || '', r.vip, r.hit, r.tint, isBattleEntry ? 'battle' : (r.vid || v.vid), shown, note, tm, v.title, mi?.name, mi?.reverseLabel, mi?.reverseEffort, mi?.tier, mi?.routed, mi?.reverseMatch, mi?.reverseScore, mi?.confidence, topConfSig, e.title, e.updatedAt, Fav.has(e.id), goldChat, mi?.fingerprint?.thinkSec, mi?.fingerprint?.reasoning?.score, isEvalEntry, isBattleEntry, battleStatus, e.mode, e.modality, e.modelAId, e.modelBId, c?.voteState?.voted, c?.voteState?.modelAName, c?.voteState?.modelBName].join('\u0001');
    if (this._cards?.has(e.id)) return this.cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep, isBattleEntry, battleStatus, hasDoneDot });   // 同一会话出现两次（分页重叠）：第二个单独建
    const prev = this._cardOld?.get(e.id);
    if (prev && prev.sig === sig) { this._cards?.set(e.id, prev); return prev.el; }
    const el = this.cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep, isBattleEntry, battleStatus, hasDoneDot });
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
    const saneSc = v => (typeof ConversationLabels !== 'undefined' && ConversationLabels.sane)
      ? ConversationLabels.sane(v)
      : (Number.isFinite(+v) && +v >= 0 && +v <= 100 ? +v : null);
    const score = (mi?.routed && saneSc(mi?.reverseScore) != null)
      ? saneSc(mi.reverseScore)
      : (mi?.fingerprint ? saneSc(fd?.score) : (saneSc(mi?.reverseScore) ?? saneSc(mi?.habitScore) ?? saneSc(mi?.est?.score) ?? saneSc(p?.score)));
    const think = !mi?.fingerprint?.skipped && Number.isFinite(mi?.fingerprint?.thinkSec) ? mi.fingerprint.thinkSec : null;
    const bits = [];
    if (mi?.routed) bits.push('⚠️换模');
    if (conf != null) bits.push('置信度 ' + +conf.toFixed(1) + '%');
    if (score != null) bits.push('推理分 ' + +score.toFixed(1)); else if (mi?.fingerprint && !mi.fingerprint.skipped && fpPct != null) bits.push('未测');
    if (think != null) bits.push('思考 ' + think + 's');
    return { conf, tip: bits.join(' · ') };
  },
  cardEl(r, cur, { e, c, v, mi, shown, note, tm, on, st, gstep, isBattleEntry, battleStatus, hasDoneDot }) {
    const cm = isBattleEntry ? { conf: null, tip: '' } : this.cardMetrics(shown, mi, e.id);
    const battleSt = isBattleEntry ? (battleStatus === '生成中' ? 'run' : battleStatus === '已完成' ? 'ok' : 'wait') : st;
    return h('div', { 'data-sid':e.id, role:'option', 'aria-selected':String(CardSelect.ids.has(e.id)), tabindex:'0', class: 'card' + (CardSelect.ids.has(e.id)?' selected':'') + (CardSelect.mode?' selecting':'') + (on ? ' on' : '') + (st === 'run' ? ' busy' : '') + (hasDoneDot ? ' has-done-dot' : '') + (gstep?.active ? ' gstep-card' : '') + (r.vip ? ' vip' : r.hit ? ' hit' : '') + (Fav.has(e.id) ? ' fv' : '') + (cm.conf != null ? ' cf' : ''), style: r.tint || cm.conf != null ? { ...(r.tint ? { '--tint': r.tint } : {}), ...(cm.conf != null ? { '--cp': cm.conf + '%' } : {}) } : null, title: [v.title, mi?.routed ? ('⚠️ 检测到中途路由：' + (mi.routeFrom ? mi.routeFrom + ' → ' : '') + (mi.routeTo || mi.name || '')) : '', mi?.fingerprint ? Fingerprint.details(mi) : '', mi?.name && mi.name !== v.model ? '型号：' + mi.name : '', note ? '备注：' + note : ''].filter(Boolean).join('\n'),
      onmousedown: ev=>{if(ev.ctrlKey||ev.metaKey||ev.shiftKey)ev.preventDefault();},
      ontouchstart: ev => {
        if (ev.touches?.length !== 1 || ev.target.closest('.more,.card-check')) return;
        const t = ev.touches[0], el = ev.currentTarget;
        clearTimeout(el._lpT);
        el._lpPos = { x: t.clientX, y: t.clientY };
        el._lpT = setTimeout(() => {
          el._lpT = 0;
          this._menuOpenAt = now();
          try { navigator.vibrate?.(12); } catch {}
          this.itemMenu({ type: 'contextmenu', clientX: el._lpPos.x, clientY: el._lpPos.y, currentTarget: el, stopPropagation() {} }, e);
        }, 460);
      },
      ontouchmove: ev => {
        const el = ev.currentTarget, t = ev.touches?.[0];
        if (el._lpT && t && el._lpPos && Math.hypot(t.clientX - el._lpPos.x, t.clientY - el._lpPos.y) > 10) {
          clearTimeout(el._lpT); el._lpT = 0;
        }
      },
      ontouchend: ev => { const el = ev.currentTarget; if (el._lpT) { clearTimeout(el._lpT); el._lpT = 0; } },
      ontouchcancel: ev => { const el = ev.currentTarget; if (el._lpT) { clearTimeout(el._lpT); el._lpT = 0; } },
      onkeydown:ev=>{if(ev.target!==ev.currentTarget)return;if(ev.key===' '){ev.preventDefault();CardSelect.toggle(e.id);this.renderList();}else if(ev.key==='Enter'){ev.preventDefault();ev.currentTarget.click();}},
      onclick: ev => { if (now() - (this._menuOpenAt || 0) < 500) { ev.preventDefault(); ev.stopPropagation(); return; } if (ev.target.closest('.more,.card-check')) return; if(CardSelect.click(e.id,ev)){ev.preventDefault();this.renderList();return;} this.saveScroll(); const tHit = Tabs.list.find(x => x.sid === e.id); if (tHit) this.scrolls.delete(tHit.key); Tabs.open(e.id, { title: e.title }); const cTarget = Chats.get(e.id); if (cTarget?.loaded && !cTarget.loading) cTarget.quickSync?.(true); this.closeDrawer(); },
      onmouseenter: () => { if(CardSelect.mode || Prefs.hoverPrefetch !== true) return; clearTimeout(this._pfT); this._pfT = setTimeout(() => { try { chatOf(e.id).prefetch(); } catch {} }, 400); },
      onmouseleave: () => clearTimeout(this._pfT),
      onauxclick: ev => { if (ev.button === 1) Tabs.open(e.id, { focus: false, title: e.title }); },
      oncontextmenu: ev => { ev.preventDefault(); const el = ev.currentTarget; if (el?._lpT) { clearTimeout(el._lpT); el._lpT = 0; } this._menuOpenAt = now(); this.itemMenu(ev, e); } },
      isBattleEntry && typeof EvalView !== 'undefined' && typeof EvalView.renderBattleLogo === 'function'
        ? EvalView.renderBattleLogo(16, battleSt)
        : (r.vid || v.vid ? stLogo(r.vid || v.vid, 16, st) : st === 'run' ? h('span', { class: 'vlogo busy' }, h('i', { class: 'spin' })) : h('span', { class: 'vlogo none' + (st ? ' st-' + st : '') }, (shown[0] || '?').toUpperCase())),
      h('span', { class: 'cn' }, ...[].concat(isBattleEntry ? shown : metricName(shown, undefined, true))),
      Fav.has(e.id) ? h('span', { class: 'cfav', title: '已收藏' }, '★') : null,
      gstep?.active ? h('span', { class: 'gstep-tag' + (gstep.status === 'queued' ? ' ident-queue' : gstep.status === 'pending' ? ' ident-wait' : gstep.status === 'running' ? ' ident-run' : ''), title: gstep.phase || gstep.text }, gstep.text) : (cm.tip ? h('span', { class: 'cstat' }, cm.tip) : null),
      // 电脑上和原来一样排成一行（外层不占布局）；手机上备注在上、时间在下，靠右对齐
      h('span', { class: 'cside' }, note ? h('span', { class: 'cnote' }, note) : null, h('span', { class: 'ctime' }, tm)),
      h('a', { href: '/agent/' + e.id, 'data-sidebar': 'menu-button', class: 'ext-sb-link', tabindex: '-1', onclick: ev => { ev.preventDefault(); } }, h('span', { class: 'truncate' }, e.title || shown)),
      h('button', { class: 'more', onclick: ev => { ev.stopPropagation(); this.itemMenu(ev, e); } }, icon('dots')),
      hasDoneDot ? h('i', { class: 'card-done-dot', title: '后台对话已完成（点击查看后消失）' }) : null,
      gstep?.active ? h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: gstep.pct + '%' } })) : null,
      h('i', { class: 'pulse-wave', 'aria-hidden': 'true' }));
  },
  async editNote(e) {
    const v = Titles.view(e.id, e.title);
    const t = await Dialog.ask({ title: '备注', value: Notes.get(e.id), placeholder: '例：脚本修改', hint: '备注和收藏随口令加密的 100 字符标题跨端同步（Qx 格式，最多 59 个字）。显示在型号名后面；留空删除备注。'+(Notes.all[e.id]?.legacyNote&&Notes.all[e.id].legacyNote!==Notes.get(e.id)?' 旧版云端备注备份：'+Notes.all[e.id].legacyNote:''), max: 59,
      extra: val => '会话名：' + (Titles.model(e.id) || v.model || '未识别') + '/' + noteFmt((Notes.all[e.id]?.t) || Date.parse(String(e.updatedAt || '').replace(' ', 'T').replace(/\+00$/, 'Z')) || now()) + (val.trim() ? '/' + val.trim().replace(/\s+/g, ' ') : '') });
    if (t === null) return;
    const saved=Notes.set(e.id,t);toast(saved?(t.trim()?'备注已保存，后台加密同步到云端标题':'备注已清空，后台同步'):'备注仅在当前窗口，尚未写入本机，请勿关闭',saved?'':'err');
  },
  itemMenu(ev, e) {
    this._menuOpenAt = now();
    ev.stopPropagation?.(); document.querySelectorAll('.menu:not(.anc-gh):not(.amenu)').forEach(m => m.remove());
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
    const curGlobalMode = (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function') ? ModeState.getMode() : 'agent';
    const tsig = Tabs.list.map(t => { if (t.kind === 'gacha') { const r = Gacha.run; return 'g' + (t.key === Tabs.active) + Gacha.busy() + (r ? r.completed + '/' + (r.settings?.endless ? '∞' : r.settings?.maxAttempts) : ''); } if (t.kind === 'power') return 'p' + (t.key === Tabs.active);
      const c = t.sid ? Chats.get(t.sid) : null, he = t.sid ? History.byId(t.sid) : null, title = (t.sid && (he?.title || c?.title)) || t.title || '', v = t.sid ? Titles.view(t.sid, title) : null;
      const isBattleTab = Boolean(v?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(he, c, t)));
      const bStat = isBattleTab && typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function' ? EvalView.getBattleStatusLabel(c, he) : (v?.battleStatus || '');
      return [t.key, t.key === Tabs.active, chatState(c), isBattleTab, bStat, title, v?.note, v?.model, v?.plain, v?.pendingConfirm, v?.time, v?.vid, Models.get(t.sid || '')?.name, Models.get(t.sid || '')?.pendingConfirm, Palette.chip(t)?.sig].join('\u0001'); }).join('\u0002') + '|' + curGlobalMode + '|' + (this.host?.account ? emailUser(this.host.account) : '') + '|' + (IP.ip || '');
    if (!box.__lp) { box.__lp = 1; TabPress.bind(box); }
    if (tsig === this._tabSig && box.children.length) return;
    clearTimeout(this.barT); this.barT = setTimeout(() => Bar.render(), 200);
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
      const c = t.sid ? Chats.get(t.sid) : null, he = t.sid ? History.byId(t.sid) : null, mi = t.sid ? Models.get(t.sid) : null;
      const title = (t.sid && (he?.title || c?.title)) || t.title || '新对话';
      t.title = title;
      // 标签：厂商图标 + 备注（有备注只显示备注）/ 型号全名（不写厂商名）；Battle 模式固定显示 Battle 图标 + 状态（生成中 / 待选择 / 已完成）
      const v = t.sid ? Titles.view(t.sid, title) : null, st = chatState(c);
      const isBattleTab = Boolean(v?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(he, c, t)));
      const battleStatus = isBattleTab
        ? ((typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function') ? EvalView.getBattleStatusLabel(c, he) : (v?.battleStatus || '待选择'))
        : '';
      const label = isBattleTab
        ? battleStatus
        : (!t.sid ? '新对话' : v.note || (v.model ? tabName(v.model) : '') || v.plain || '对话');
      const battleSt = isBattleTab ? (battleStatus === '生成中' ? 'run' : battleStatus === '已完成' ? 'ok' : 'wait') : st;
      const tip = isBattleTab
        ? ['Battle 盲测 · ' + battleStatus, v?.time ? '最近对话 ' + v.time : ''].filter(Boolean).join('\n')
        : [label, v?.model && v.model !== label ? v.model : '', v?.time ? '最近对话 ' + v.time : '', st === 'run' ? '进行中' : st === 'bad' ? '出错了' : st === 'ok' ? '已完成' : ''].filter(Boolean).join('\n');
      const pc = Palette.chip(t);   // 每个窗口有自己的颜色：标签小卡片也用它，一眼能分清
      const isSel = t.key === Tabs.active;
      const hasLamp = isSel && !!t.sid;
      const tabLogoEl = isBattleTab && typeof EvalView !== 'undefined' && typeof EvalView.renderBattleLogo === 'function'
        ? EvalView.renderBattleLogo(15, battleSt)
        : (!t.sid ? icon('plus', 'tab-new') : stLogo(v.vid, 15, st));
      const tabTextNodes = isBattleTab ? [label] : [].concat(v?.note || !v?.model ? label : metricName(label));
      frag.append(h('div', { class: 'tab' + (isSel ? ' on' : '') + (hasLamp ? ' tab-lamp-on' : '') + (!t.sid ? ' tab-blank' : '') + (isBattleTab ? ' tab-battle' : '') + (battleSt ? ' st-' + battleSt : '') + (pc ? ' tinted' : ''), style: pc ? { '--tc': pc.bg, '--tco': pc.on } : null, 'data-key': t.key, title: tip + (t.sid ? '\n长按 / 下拉：重新载入' : ''), onclick: e => { if (!e.target.closest('.x')) Tabs.focus(t.key); }, onauxclick: e => { if (e.button === 1) Tabs.close(t.key); } },
        tabLogoEl, h('span', { class: 'tab-t' }, ...tabTextNodes), h('button', { class: 'x', onclick: () => Tabs.close(t.key) }, icon('x'))));
    }
    box.replaceChildren(frag);
    if (activeChanged) box.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const cur = Tabs.cur, curC = cur?.sid ? Chats.get(cur.sid) : null, curHe = cur?.sid ? History.byId(cur.sid) : null, cv = cur?.sid ? Titles.view(cur.sid, cur.title) : null;
    const curIsBattle = Boolean(cv?.isBattle || (typeof EvalView !== 'undefined' && typeof EvalView.isBattleEntry === 'function' && EvalView.isBattleEntry(curHe, curC, cur)));
    const curTitleHead = curIsBattle
      ? ((typeof EvalView !== 'undefined' && typeof EvalView.getBattleStatusLabel === 'function') ? EvalView.getBattleStatusLabel(curC, curHe) : (cv?.battleStatus || '待选择'))
      : (cv ? (cv.note || tabName(cv.model) || cv.plain || 'Brana') : 'Brana');
    Host.setTitle(`${curTitleHead} · ${this.host?.account ? emailUser(this.host.account) : 'Brana'}${IP.ip ? ' · ' + IP.ip : ''}`);
  },

  // ----- 对话视图 -----
  saveScroll() { const sc = $('#view .scroller'), t = Tabs.cur; if (sc && t) { const cCur = t.sid ? Chats.get(t.sid) : null; this.scrolls.set(t.key, { top: sc.scrollTop, stick: Boolean(cCur?._hotOnly || sc.scrollTop + sc.clientHeight > sc.scrollHeight - 40), lastMsgId: cCur?.messages?.at(-1)?.id || '' }); } const ta = $('#view textarea'); if (ta && t) { t.draft = ta.value; Tabs.save(); } },
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
    const sidNow = t && !t.kind ? t.sid : null;
    if (sidNow && typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function') {
      const cNow = Chats.get(sidNow);
      const hNow = typeof History !== 'undefined' ? History.byId?.(sidNow) : null;
      const chatMode = cNow?.isEvaluation
        ? (cNow.evalMode || 'battle')
        : hNow
          ? ModeState.inferEntryMode(hNow)
          : (cNow?.messages?.length ? 'agent' : null);
      if (chatMode && chatMode !== ModeState.getMode()) {
        ModeState.setMode(chatMode, { silent: true });
      }
    }
    try { ExtCompat.syncUrl(sidNow); } catch {} if (WS.sid !== sidNow || !WS.data) WS.load(sidNow);
    setTimeout(() => { try { Sync.tick(); } catch {} }, 300);
    setTimeout(() => { try { const c = t?.sid && !t.kind ? Chats.get(t.sid) : null; if (c) { FingerprintReview.auto(c); FingerprintBatch.autoVerify?.(c); } } catch {} }, 1500);   // 切回一个已经读完的对话：没有指纹信息就按历史里的指纹测试自动校准
    setTimeout(() => { this.layout(); Bar.render(); }, 0);
    // 手机：目标窗口已经有搭好的页 → 只换角色（那一页拿走 id="view"，当前页退到旁边），不重建、不挪任何节点
    if (Pager.on() && t && prevKey !== t.key) {
      if (Pager.adopt(t, kbWas)) { try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(true); } catch (e) { console.error(e); } return; }
      view = Pager.shelve(t) || view;
    }
    if (t && prevKey === t.key && !t.kind && sidNow && view) {
      const curChat = Chats.get(sidNow);
      if (curChat && this.els && this.els.chat === curChat && this.els.scroller?.isConnected && this.els.thread?.isConnected && view.contains(this.els.scroller)) {
        try { Palette.paintPage(view, t); } catch {}
        try { curChat.hydrateSync?.(); } catch {}
        this.renderChat(curChat, false);
        if (!curChat.loaded && !curChat.loading) curChat.load().catch(() => {});
        else if (curChat.loaded && !curChat.loading) curChat.quickSync?.();
        if (kbWas) this.autoFocus(this.els.composer, kbWas);
        try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(true); } catch (e) { console.error(e); }
        Pager.ensureSoon();
        return;
      }
    }
    this.fillView(t, view, kbWas);
    try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(true); } catch (e) { console.error(e); }
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
    const scroller = h('div', { class: 'scroller', 'data-custom-scrollbar': 'true', role: 'log', 'aria-live': 'polite', onscroll: () => { if (P._progScrollAt && Date.now() - P._progScrollAt < 48) return; if (typeof window !== 'undefined') window.__ancLastScrollAt = Date.now(); if (P._scrollRaf) return; P._scrollRaf = requestAnimationFrame(() => { P._scrollRaf = 0; const sc = scroller; if (!sc.isConnected) return; P.stick = sc.scrollTop + sc.clientHeight > sc.scrollHeight - 60; this.paintToBot(false, P); if (chat && sc.scrollTop < 80 && chat.hasMore) chat.loadOlder(true); }); } }, thread);
    scroller.__reactFiber$extcompat = { memoizedProps: { get value() { const c = t?.sid ? Chats.get(t.sid) : null; return { id: c?.sid || '', status: !c ? 'ready' : c.busy ? 'streaming' : c.status === 'error' ? 'error' : 'ready', messages: c?.messages || [] }; } }, return: null };
    const head = h('div', { class: 'chead' });
    const errbar = h('div', { class: 'errbar' });
    const composer = this.composer(t, chat);
    composer.prepend(toBot);
    view.replaceChildren(head, scroller, errbar, composer);
    this.els = { head, scroller, thread, errbar, composer, chat, toBot };
    if (!chat) {
      const defSub = (this.host?.account ? emailUser(this.host.account) : '') + (IP.ip ? ' · 出口 ' + IP.ip + (IP.loc ? ' ' + ccF(IP.loc) : '') : '') + ' · 新对话随机分配模型';
      if (typeof EvalView !== 'undefined' && typeof EvalView.renderHero === 'function') {
        EvalView.renderHero(thread, defSub);
      } else {
        thread.append(h('div', { class: 'hero' }, h('div', { class: 'hero-t' }, '有什么可以帮你？'), h('div', { class: 'hero-s' }, defSub)));
      }
      const curMode = typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent';
      head.replaceChildren(...K(
        h('div', { class: 'chead-t' },
          curMode === 'battle' && typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._icon === 'function' ? ModeSwitcher._icon('swords') : null,
          h('span', { class: 'chead-n' }, curMode === 'battle' ? '新对话 · Battle 盲测' : curMode === 'direct' ? '新对话 · Direct 直连' : '新对话')
        ),
        h('span', { class: 'grow' }),
        this.renderPelicanMenuBtn(t, null, curMode)
      ));
      if (!side) this.autoFocus(composer, kbWas);
      return;
    }
    // 可视高度变了（手机弹出输入法把输入框顶上去、输入框变高）：聊天内容跟着一起往上顶，保持底部对齐，不是原地不动被盖住
    { let lastH = 0; const ro = new ResizeObserver(() => { if (!scroller.isConnected) { ro.disconnect(); return; } const hh = scroller.clientHeight; if (lastH && hh && hh !== lastH) { if (P.stick !== false) scroller.scrollTop = scroller.scrollHeight; else scroller.scrollTop += lastH - hh; } if (hh) lastH = hh; }); ro.observe(scroller); P.resizeObserver=ro; }
    const sv = this.scrolls.get(t.key);
    try { chat.hydrateSync?.(); } catch {}
    const tailIdNow = chat.messages?.at(-1)?.id || '';
    const hasNewTailSinceSave = Boolean(sv && sv.lastMsgId && tailIdNow && sv.lastMsgId !== tailIdNow);
    P.stick = (!sv || chat._hotOnly || !chat.loaded || hasNewTailSinceSave) ? true : sv.stick;
    this.renderChat(chat, true);
    if (sv && !P.stick) scroller.scrollTop = sv.top;
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
    const isBattleChat = Boolean((chat?.isEvaluation && chat?.evalMode === 'battle') || (typeof EvalView !== 'undefined' && EvalView.isBattleChat(chat)));
    const isDirectChat = Boolean((chat?.isEvaluation && chat?.evalMode === 'direct') || (typeof EvalView !== 'undefined' && EvalView.isDirectChat(chat)));
    const isEvalChat = isBattleChat || isDirectChat || Boolean(chat?.isEvaluation);
    if (isDirectChat) {
      const directName = chat.directModelName
        || (chat.modelAId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(chat.modelAId, chat.revealedModels)
          : chat.modelAId)
        || (typeof ModeState !== 'undefined' && typeof ModeState.getDirectModel === 'function'
          ? (ModeState.getDirectModel()?.displayName || ModeState.getDirectModel()?.publicName)
          : '')
        || '';
      if (directName && Models.get(chat.sid)?.name !== directName) {
        Models.set(chat.sid, { name: directName, sure: true, directMode: true, provider: 'Direct 直连锁定' });
      }
    }
    if ((chat._startupResuming || chat._recoveringIncomplete) && chat.loaded && !chat.cached && !chat.loading && chat.status === 'streaming' && !chat.live && !chat.awaitId && !chat.preSend && !chat.sending) {
      const lastVis = (chat.messages || []).filter(m => m && !m._held && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m))).at(-1);
      const isTailSettled = lastVis && lastVis.role === 'assistant' && !lastVis.metadata?.pending && !lastVis._incomplete && Boolean(lastVis._finishedAt || lastVis.metadata?.timing?.completedAt || lastVis.metadata?.aborted || lastVis.metadata?.error || lastVis.metadata?.finishReason === 'stop' || lastVis.metadata?.finishReason === 'end-turn');
      if (isTailSettled && !(typeof Hitl !== 'undefined' && Hitl.idleWait(chat))) {
        chat.status = 'idle';
        chat.phase = '';
        chat._startupResuming = false;
        chat._recoveringIncomplete = false;
        if (typeof RunningTracker !== 'undefined') { try { RunningTracker.onChatUpdate(chat); } catch {} }
        if (typeof SendQ !== 'undefined' && (chat.queue || []).length) setTimeout(() => { try { SendQ.check(chat); } catch {} }, 50);
      }
    }
    const mi = Models.get(chat.sid), v = Titles.view(chat.sid, chat.title), st = chatState(chat);
    const modelVersion=this.modelStamp(mi);
    const tip = [v.title, mi && [mi.internal && '内部：' + mi.internal, mi.request && '请求：' + mi.request, mi.provider && '提供方：' + mi.provider, mi.routed && 'Brana 已改派'].filter(Boolean).join('\n')].filter(Boolean).join('\n');
    // 打开对话后自动识别（不用手动点）：1 小时内有运行记录的，自动读取模型信息
    if (!isEvalChat && this.pane.el?.id === 'view' && chat.loaded && !chat.autoTried && chat.messages.some(m => m.role === 'assistant')) { chat.autoTried = true; setTimeout(() => AutoId.run(chat), 400); }
    const phase=ThinkingStatus.phase(chat);
    const battleTitle = isBattleChat
      ? (chat.voteState?.voted
        ? `${chat.voteState.modelAName || 'Model A'} vs ${chat.voteState.modelBName || 'Model B'}`
        : 'Battle 盲测 · Model A vs Model B')
      : '';
    const hsig = [chat.sid, isBattleChat, isDirectChat, battleTitle, chat.voteState?.voted, chat.voteState?.value, typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat), PelicanTest.isRunning(chat), !!mi?.fingerprint, !!chat.probeNumbers?.length, FingerprintBatch.busy, !!chat.gacha, Fingerprint.isRunning(chat), chat.probeProgress, tip, v.vid, st, v.note, v.model, v.plain, v.time, mi?.routed, chat.identifying, !mi && chat.idErr, WS.shown, chat.busy].join('\u0001');
    if (E.hsig !== hsig) {
      E.hsig = hsig;
      if (isBattleChat) {
        E.head.replaceChildren(...K(
          h('div', { class: 'chead-t', title: chat.title || battleTitle },
            (typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._icon === 'function') ? ModeSwitcher._icon('swords') : null,
            h('span', { class: 'chead-n' }, battleTitle),
            chat.modality ? h('span', { class: 'badge dim' }, String(chat.modality).toUpperCase()) : null,
            chat.voteState?.voted ? h('span', { class: 'badge dim' }, '已揭晓并入库') : h('span', { class: 'badge dim' }, '盲测中')
          ),
          h('span', { class: 'grow' }),
          this.renderPelicanMenuBtn(Tabs.cur, chat, 'battle'),
          h('button', { class: 'ib mdbtn', title: '导出这个对话的全部内容为 Markdown', onclick: () => void ChatExport.run(chat) }, icon('doc'))
        ));
      } else {
        E.head.replaceChildren(...K(h('div', { class: 'chead-t', title: tip, 'aria-label': 'Session cumulative cost' }, stLogo(v.vid || Brand.of(mi?.name), 18, st), h('span', { class: 'chead-n' }, ...[].concat(v.note || metricName(mi?.name || v.model, cardName) || v.plain || '对话')), v.note && (mi?.name || v.model) ? h('span', { class: 'chead-md' }, '-', ...[].concat(metricName(mi?.name || v.model, cardName))) : null),
          isDirectChat ? h('span', { class: 'badge dim' }, 'Direct 直连') : null,
          isDirectChat && chat.modality ? h('span', { class: 'badge dim' }, String(chat.modality).toUpperCase()) : null,
          isDirectChat && typeof EvalView !== 'undefined' && typeof EvalView.renderPreviewHeaderBtns === 'function' ? EvalView.renderPreviewHeaderBtns(chat, (chat.messages || []).findLast(m => m && m.role === 'assistant'), 'a') : null,
          isDirectChat && typeof EvalView !== 'undefined' && typeof EvalView.renderRegenBtn === 'function' ? EvalView.renderRegenBtn(chat, (chat.messages || []).findLast(m => m && m.role === 'assistant'), 'a', Boolean(chat.busy), null) : null,
          window.__BRANA_BROWSE_MODE ? h('button', { type: 'button', class: 'badge warn browse-badge', title: '当前处于离线/免登查阅模式，点击返回登录或重连', onclick: () => { window.__BRANA_BROWSE_MODE = false; UI.loginGate('已退出查阅模式，请登录或刷新连接'); } }, '查阅模式 · 退出') : null,
          mi?.routed ? (() => {
            const rType = mi.routeType === 'effort' ? '强度削弱' : '路由换模';
            const cleanFrom = String(mi.routeFrom || mi.lastRouteNotice?.fromLabel || '').replace(/[?？]+$/, '').trim();
            const cleanTo = String(mi.routeTo || mi.lastRouteNotice?.toLabel || mi.name || '').replace(/[?？]+$/, '').trim();
            const shortM = s => String(s || '').replace(/\s*\((?:None|Minimal|Low|Medium|High|XHigh|Max)\)\s*$/i, '').trim();
            const fromS = shortM(cleanFrom) || '原模型';
            const toS = shortM(cleanTo) || '新模型';
            const turnH = mi.lastRouteNotice?.toTurn ? `（第 #${mi.lastRouteNotice.toTurn} 轮起）` : '';
            const rDesc = (cleanFrom && cleanTo) ? `${cleanFrom} → ${cleanTo}${turnH}` : (cleanTo || mi.lastRouteNotice?.text || '检测到中途路由变化');
            const rReason = mi.routeReason || mi.lastRouteNotice?.reason || '';
            const fullMsg = `⚠️ ${rType}提醒：${rDesc}${rReason ? ' · ' + rReason : ''}`;
            return h('button', {
              type: 'button',
              class: 'badge warn route-warn-btn',
              title: `${fullMsg}（点击定位到对话中的路由切换轮次）`,
              'aria-label': '改派详情',
              onclick: e => {
                e.stopPropagation();
                const alertEl = (E?.thread || document).querySelector('.msg-route-alert[data-route-pivot="1"], .msg-route-alert, .trow.is-route-start');
                if (alertEl) {
                  alertEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  alertEl.classList.add('route-flash');
                  setTimeout(() => alertEl.classList.remove('route-flash'), 1800);
                }
                toast(fullMsg, 'warn');
              }
            }, icon('alert'), h('span', { class: 'route-warn-txt' }, `${rType}: ${fromS} → ${toS}`));
          })() : null,
          !isEvalChat && chat.identifying ? h('span', { class: 'badge dim' }, h('i', { class: 'spin' }), '识别模型…')
            : !isEvalChat && !mi && chat.idErr ? h('button', { class: 'badge dim link', title: chat.idErr + '（点一下重试）', onclick: () => chat.identifyOld() }, '未识别') : null,
          h('span', { class: 'grow' }),
          !isEvalChat ? h('button', { class: 'ib revbtn' + (typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? ' run' : ''), 'aria-label': typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '停止反推' : '费用反推', disabled: (chat.busy && !(typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat))) || PelicanTest.isRunning(chat), title: typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '停止反推识别' + (chat.probeProgress ? '（' + chat.probeProgress + '）' : '') : '反推识别：点一下读取账单与对话记录/工具调用，按最高置信度反推并锁定当前对话的真实模型与推理分。', onclick: () => void BillingProbe.reverseIdentify(chat, { interactive: true }) }, icon('pulse')) : null,
          !isEvalChat ? this.renderProbeTestBtn(Tabs.cur, chat, 'agent') : null,
          !isEvalChat ? h('button', { class: 'ib pelbtn' + (PelicanTest.isRunning(chat) ? ' run' : ''), 'aria-label': PelicanTest.isRunning(chat) ? '停止鹈鹕' : '鹈鹕测试', disabled: (chat.busy && !PelicanTest.isRunning(chat)), title: PelicanTest.isRunning(chat) ? '停止鹈鹕测试' + (chat.probeProgress ? '（' + chat.probeProgress + '）' : '') : '鹈鹕测试：点一下直接发送 2D 鹈鹕骑车动态 SVG 标准测试题', onclick: e => { e.stopPropagation(); void PelicanTest.start(chat); } }, icon('pelican')) : isDirectChat ? this.renderPelicanMenuBtn(Tabs.cur, chat, 'direct') : null,
          h('button', { class: 'ib mdbtn', title: '导出这个对话的全部内容（正文、思考、bash 命令和输出、工具调用）为 Markdown，自己选保存位置', onclick: () => void ChatExport.run(chat) }, icon('doc')),
          !isEvalChat ? h('button', { class: 'ib wsbtn', title: WS.shown ? '收起工作区' : '显示工作区（沙盒文件）', onclick: () => { WS.set(!WS.shown); scheduleChat(chat); } }, icon('folder')) : null));
      }
    }
    // 消息
    const T = E.thread, sc = E.scroller;
    const stick = this.stick !== false;
    const hasVisibleMsgs = chat.messages.some(m => m && !m._held && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)));
    if (!chat.loaded && !hasVisibleMsgs) {
      if (!chat.loading && !chat.error) { try { chat.load().catch(() => {}); } catch {} }
      const loadTxt = chat.loading
        ? ('加载中…' + (chat.loadBytes >= 65536 ? '（已接收 ' + (chat.loadBytes / 1048576).toFixed(2) + ' MB）' : ''))
        : (chat.error ? chat.error : '加载中…');
      const showSlowRetry = Boolean(chat.loading && chat._loadStartedAt && now() - chat._loadStartedAt > 5000);
      const ld = T.querySelector('.loading');
      if (!ld || Boolean(ld.querySelector('button')) !== showSlowRetry) {
        T.replaceChildren(h('div', { class: 'loading' },
          h('span', { class: 'ld-txt' }, loadTxt),
          showSlowRetry ? h('button', { class: 'btn ghost sm', style: { marginLeft: '10px' }, onclick: () => chat.load(true) }, '重新连接') : null));
      } else {
        const sp = ld.querySelector('.ld-txt') || ld;
        if (sp.textContent !== loadTxt) sp.textContent = loadTxt;
      }
    } else if (isBattleChat && typeof EvalView !== 'undefined' && typeof EvalView.renderBattleThread === 'function') {
      EvalView.renderBattleThread(chat, T, sc);
    } else {
      const ae = document.activeElement, fk = ae && T.contains(ae) ? ae.dataset?.fk : null, fsel = fk ? [ae.selectionStart, ae.selectionEnd] : null;
      const els = [];
      if (chat.hasMore) { const b = this.cache.get('__older') || (() => { const b = h('button', { class: 'older', onclick: () => chat.loadOlder() }, '加载更早的消息'); this.cache.set('__older', b); return b; })(); const t = chat.olderLoading ? '正在加载更早的消息…' : chat.allLoading ? '正在后台补全更早的消息（点此立即加载）' : '加载更早的消息'; if (b.textContent !== t) b.textContent = t; b.classList.toggle('busy', !!chat.olderLoading); els.push(b); }
      // _held：已按发送、但要等服务器上一轮结束才真正发出的消息，在输入框上方的队列条里显示，不进对话区
      let lastIdx = chat.messages.length - 1; while (lastIdx >= 0 && chat.messages[lastIdx]._held) lastIdx--;
      const isVisibleUser = u => u && u.role === 'user' && !u._held && !u._autoContinue && !u.metadata?.autoContinue && (((u.parts || []).some(p => (p.type === 'text' && String(p.text || '').trim()) || p.type === 'data-tool-results')) || userAtts(u).length > 0);
      const msgLen = chat.messages.length;
      const lastMsgObj = lastIdx >= 0 ? chat.messages[lastIdx] : null;
      const segMemoSig = `${msgLen}:${lastIdx}:${lastMsgObj?.id || ''}:${lastMsgObj?.role || ''}:${lastMsgObj?.metadata?.timing?.completedAt || 0}:${(lastMsgObj?.parts || []).some(p => p?.type === 'text' && String(p.text || '').trim()) ? 1 : 0}`;
      let segMeta = (chat._segMetaMemo && chat._segMetaMemo.sig === segMemoSig) ? chat._segMetaMemo.arr : null;
      if (!segMeta) {
        segMeta = new Array(msgLen);
        const visUser = new Uint8Array(Math.max(0, lastIdx + 1));
        const prevAsstArr = new Int32Array(Math.max(0, lastIdx + 1)).fill(-1);
        const firstIdxArr = new Int32Array(Math.max(0, lastIdx + 1)).fill(-1);
        const nextAsstArr = new Int32Array(Math.max(0, lastIdx + 1)).fill(-1);
        let runFirstAsst = -1, runLastAsst = -1;
        for (let i = 0; i <= lastIdx; i++) {
          const m = chat.messages[i];
          if (!m || m._held) continue;
          if (isVisibleUser(m)) {
            visUser[i] = 1;
            runFirstAsst = -1;
            runLastAsst = -1;
          } else if (m.role === 'assistant') {
            prevAsstArr[i] = runLastAsst;
            firstIdxArr[i] = runFirstAsst >= 0 ? runFirstAsst : i;
            if (runFirstAsst < 0) runFirstAsst = i;
            runLastAsst = i;
          }
        }
        let nextOverallAsst = null, runNextAsst = -1;
        const nextOverallAsstByIdx = new Array(msgLen).fill(null);
        for (let i = lastIdx; i >= 0; i--) {
          const m = chat.messages[i];
          if (!m || m._held) continue;
          if (visUser[i]) {
            runNextAsst = -1;
            continue;
          }
          if (m.role !== 'assistant') continue;
          nextAsstArr[i] = runNextAsst;
          runNextAsst = i;
          nextOverallAsstByIdx[i] = nextOverallAsst;
          if (m.id) nextOverallAsst = m;
        }
        for (let i = 0; i <= lastIdx; i++) {
          const m = chat.messages[i];
          if (!m || m._held || m.role !== 'assistant') continue;
          const prevAsst = prevAsstArr[i], nextAsst = nextAsstArr[i], firstIdx = firstIdxArr[i] >= 0 ? firstIdxArr[i] : i;
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
            turnStartAt,
            nextAsstMsg: nextOverallAsstByIdx[i]
          };
        }
        chat._segMetaMemo = { sig: segMemoSig, arr: segMeta };
      }
      chat.messages.forEach((m, i) => {
        if (m._held) return;
        if (chat.live !== m && typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)) return;
        const isLast = i === lastIdx || (i === lastIdx - 1 && chat.messages[lastIdx]?.role === 'user' && false);
        const seg = segMeta[i] || null;
        const segKey = seg ? (seg.head ? 'H' : seg.mid ? 'M' : seg.tail ? 'T' : '') + (seg.hideFoot ? '0' : '1') + ':' + (seg.turnStartAt || 0) : '';
        const isUnverifiedCache = Boolean((chat.cached && !chat.loaded) || chat._recoveringIncomplete);
        const isIncTail = Boolean(i === lastIdx && m.role === 'assistant' && !m._userStopped && isUnverifiedCache && (
          m.metadata?.pending ||
          m._incomplete ||
          m.status === 'pending' ||
          m.status === 'streaming' ||
          (typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(m))
        ));
        const isSettledTailAsst = m.role === 'assistant' && !m.metadata?.pending && !m._incomplete && Boolean(m._finishedAt || m.metadata?.timing?.completedAt || m.metadata?.aborted || m.metadata?.error || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn');
        const isRunningTail = !m.failed && !Hitl.idleWait(chat) && !(isSettledTailAsst && !chat?.streaming) && (chat.live === m || !!(i === lastIdx && m.role === 'assistant' && !isSettledTailAsst && ((Hitl.blocked(chat) && !chat.waitingForeign) || isIncTail)));
        const pArr = m.parts || [], pLen = pArr.length, lastP = pLen ? pArr[pLen - 1] : null;
        const cSig = pLen + ':' + (lastP?.type || '') + ':' + (lastP?.text?.length || 0) + ':' + (lastP?.state || '') + ':' + (m.text?.length || 0);
        const key = (m.v || 0) + '|' + cSig + '|' + segKey + '|' + (i === lastIdx ? 'L' + chat.status + (chat.hitlStage?.size || 0) : '') + '|' + (m.failed ? 'f' : '') + '|' + (isRunningTail ? 'live:' + phase : '') + '|' + this.modelsV + ':' + modelVersion + '|' + (pArr.some(p=>p.type==='reasoning')?ThinkingStatus.label(chat,m,isRunningTail):'');
        let c = this.cache.get(m.id);
        if (!c || c.key !== key || !c.el || typeof c.el.nodeType !== 'number') {
          let el = null;
          try {
            el = R.message(m, chat, i === lastIdx, c?.el && typeof c.el.nodeType === 'number' ? c.el : null, seg);
          } catch (err) {
            console.warn('R.message error:', err);
            el = (c?.el && typeof c.el.nodeType === 'number') ? c.el : h('div', { class: 'msg ' + (m.role || 'assistant'), 'data-id': m.id || null });
          }
          c = { key, el };
          this.cache.set(m.id, c);
        }
        if (c?.el && typeof c.el.nodeType === 'number') els.push(c.el);
      });
      // 「正在输入」占位复用同一个节点：否则每帧都换新节点，整串消息被重新挂载、整页重排
      if (Hitl.blocked(chat) && !chat.live && chat.messages[lastIdx]?.role === 'user' && !chat.waitingForeign) {
        const t = this.cache.get('__typing') || (() => { const t = h('div', { class: 'msg assistant' }, h('div', { class: 'msg-body typing-row' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')), h('span', { class: 'typing-st' }), h('span', { class: 'phase typing-phase' }, h('span', { class: 'ph-t' }), h('span', { class: 'dim anc-since' })))); this.cache.set('__typing', t); return t; })();
        const dlvRaw = (chat.dlvText?.() || '').replace(/\s+\d+s$/, '').trim();
        const unifiedPhase = (!phase || phase === '发送中' || phase === '进行中') && dlvRaw ? dlvRaw : phase;
        const st = t.querySelector('.typing-st'); if (st && st.textContent !== '') st.textContent = '';
        const phEl = t.querySelector('.ph-t'); if (phEl && phEl.textContent !== unifiedPhase) phEl.textContent = unifiedPhase;
        const sinceEl = t.querySelector('.anc-since');
        if (sinceEl) {
          const lastM = chat.messages[lastIdx];
          const effSince = Number(chat.sentAt) || Number(chat.oursAt) || Number(lastM?._sentAt) || (typeof getMsgTs === 'function' ? getMsgTs(lastM) : 0) || (typeof idTime === 'function' ? idTime(lastM?.id) : 0) || Number(chat.recAt) || 0;
          if (Number.isFinite(effSince) && effSince > 1e12) {
            const sStr = String(effSince);
            if (sinceEl.dataset.since !== sStr) sinceEl.dataset.since = sStr;
            const secTxt = ' ' + Math.max(0, Math.floor((now() - effSince) / 1000)) + 's';
            if (sinceEl.textContent !== secTxt) sinceEl.textContent = secTxt;
          } else {
            delete sinceEl.dataset.since;
            if (sinceEl.textContent) sinceEl.textContent = '';
          }
        }
        els.push(t);
      }
      if (!els.length) {
        if (!chat.loaded || chat.loading) {
          const loadTxt = chat.loading
            ? ('加载中…' + (chat.loadBytes >= 65536 ? '（已接收 ' + (chat.loadBytes / 1048576).toFixed(2) + ' MB）' : ''))
            : (chat.error ? chat.error : '加载中…');
          els.push(h('div', { class: 'loading' }, loadTxt));
        } else if (!chat.error) {
          els.push(h('div', { class: 'loading dim' }, '暂无消息记录 ', h('button', { class: 'btn ghost sm', style: { marginLeft: '8px' }, onclick: () => chat.load(true) }, '重新加载')));
        }
      }
      // 前面插入了更早的消息：以当前看到的第一条消息为锚点保持位置，不跳动
      const wasHotUpgrade = Boolean(E.wasHotOnly && !chat._hotOnly);
      E.wasHotOnly = Boolean(chat._hotOnly);
      const curTailMsg = chat.messages.at(-1);
      const curTailSig = curTailMsg ? (curTailMsg.id + ':' + (curTailMsg.parts?.length || 0) + ':' + (curTailMsg.parts?.at(-1)?.text?.length || 0)) : '';
      const tailGrewFresh = Boolean(E.lastTailSig && curTailSig && E.lastTailSig !== curTailSig && (!window.__ancLastScrollAt || Date.now() - window.__ancLastScrollAt > 1500));
      E.lastTailSig = curTailSig;
      const effStick = stick || wasHotUpgrade || tailGrewFresh;
      if (wasHotUpgrade || tailGrewFresh) this.pane.stick = true;
      const structureChanged=els.length!==T.childElementCount||els.some((e,i)=>T.children[i]!==e);
      const prevTop=structureChanged&&!effStick?sc.scrollTop:0;let anchor=null,anchorOff=0;
      if (structureChanged&&!effStick) for (const c of T.children) { if (c.offsetTop + c.offsetHeight > prevTop) { anchor = c; anchorOff = c.offsetTop - prevTop; break; } }
      if (structureChanged) {
        patchKids(T, els);
        const ids=new Set(chat.messages.map(m=>m.id));for(const id of this.cache.keys())if(id!=='__older'&&id!=='__typing'&&!ids.has(id))this.cache.delete(id);
        if (!effStick && anchor && anchor.isConnected) { const d = anchor.offsetTop - prevTop - anchorOff; if (d) sc.scrollTop = prevTop + d; }
      }
      if (fk && document.activeElement !== ae) { const n = [...T.querySelectorAll('[data-fk]')].find(x => x.dataset.fk === fk); if (n && !n.disabled) { try { n.focus({ preventScroll: true }); if (fsel && n.setSelectionRange) n.setSelectionRange(fsel[0], fsel[1]); } catch {} } }
      if (isEvalChat && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') {
        try { HtmlPreview.syncEval(chat); } catch {}
      }
    }
    {
      const hh = sc.scrollHeight;
      let pinnedBot = false;
      if (stick || full || E.wasHotOnly === false && E._forceBotOnce) { E._forceBotOnce = false; this.pane._progScrollAt = Date.now(); sc.scrollTop = hh; pinnedBot = true; }
      else if (this.pane.stick !== false) { this.pane._progScrollAt = Date.now(); sc.scrollTop = hh; pinnedBot = true; }
      const grew = !!E.lastSH && hh > E.lastSH + 4; E.lastSH = hh; this.paintToBot(grew && !stick, this.pane, pinnedBot);
    }
    // 错误条
    if ((chat.busy || chat.streaming || chat.live) && Array.isArray(chat.messages) && typeof SendQ !== 'undefined' && typeof SendQ.demoteToQueue === 'function') {
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i]?.role === 'user' && chat.messages[i]?.failed) {
          SendQ.demoteToQueue(chat, chat.messages[i], { silent: true, running: true });
        }
      }
    }
    const failedUserMsg = !chat.busy ? ([...(chat.messages || [])].reverse().find(m => m?.role === 'user' && m.failed) || null) : null;
    if (E.errbar.firstChild) E.errbar.replaceChildren();
    if ((chat.error || failedUserMsg) && !chat.busy) {
      const errText = chat.error || '上一条消息未发出（服务器未收到），请点击重试';
      const cap = /recaptcha|captcha|人机验证/i.test(errText);
      const lastUser = failedUserMsg || (chat.messages.at(-1)?.role === 'user' ? chat.messages.at(-1) : null);
      const isRejected = /rejected this request|拒绝请求|死节点|超限/i.test(errText);
      const isBattleMode = Boolean(chat.evalMode === 'battle' || (typeof EvalView !== 'undefined' && EvalView.isBattleChat?.(chat)));
      const isUnsentOnly = Boolean(failedUserMsg && !cap && !isRejected);
      E.errbar.append(...K(h('span', {}, '⚠ ' + errText), h('span', { class: 'grow' }),
        cap ? h('button', { class: 'btn sm', onclick: () => this.retry(chat, lastUser, true) }, '人机验证后重试') : null,
        !cap && !isRejected && !isBattleMode && !isUnsentOnly ? h('button', { class: 'btn sm', title: '保留当前轮次已有进度，直接发送新消息「继续」推进流程（不回退、不重发长文）', onclick: () => this.continueFlow(chat) }, '⚡ 继续推进') : null,
        isRejected ? h('button', { class: 'btn sm ghost', title: '跳过导致超限或死锁的上一轮，回退到再上一轮正常节点重发', onclick: () => this.rewindAndRetry(chat, lastUser) }, '⏪ 回退上一节点') : null,
        isRejected ? h('button', { class: 'btn sm ghost', title: '在当前对话内开启全新空工作区分支（清空沙盒与报错历史，保留当前模型）', onclick: () => this.resetWsBranch(chat, lastUser) }, '🧹 重置工作区救活') : null,
        h('button', { class: 'btn sm' + (isUnsentOnly ? '' : ' ghost'), onclick: () => this.retry(chat, lastUser, false) }, '↻ 重试'),
        h('button', { class: 'ib', onclick: () => { chat.error = null; chat.emit(); } }, icon('x'))));
    }
    // 输入框按钮状态
    this.syncComposer(chat);
    const tNow = now();
    if (!chat.busy) {
      if (this._pvSyncT) { clearTimeout(this._pvSyncT); this._pvSyncT = 0; }
      if (this._trScanT) { clearTimeout(this._trScanT); this._trScanT = 0; }
      this._lastPvSyncAt = tNow; this._lastTrScanAt = tNow;
      try { HtmlPreview.syncLive?.(chat.sid); } catch {}
      try { window.__arenaBashTranslate?.scan?.(); } catch {}
    } else {
      if (tNow - (this._lastPvSyncAt || 0) >= 180) {
        this._lastPvSyncAt = tNow;
        try { HtmlPreview.syncLive?.(chat.sid); } catch {}
      } else if (!this._pvSyncT) {
        this._pvSyncT = setTimeout(() => { this._pvSyncT = 0; this._lastPvSyncAt = now(); try { if (this.els?.chat?.sid) HtmlPreview.syncLive?.(this.els.chat.sid); } catch {} }, 180);
      }
      if (tNow - (this._lastTrScanAt || 0) >= 350) {
        this._lastTrScanAt = tNow;
        try { window.__arenaBashTranslate?.scan?.(); } catch {}
      } else if (!this._trScanT) {
        this._trScanT = setTimeout(() => { this._trScanT = 0; this._lastTrScanAt = now(); try { window.__arenaBashTranslate?.scan?.(); } catch {} }, 350);
      }
    }
  },
  paintToBot(grew, P = this.pane, pinnedBot = false) {
    const E = P?.els, b = E?.toBot, sc = E?.scroller; if (!b || !sc) return;
    const far = pinnedBot ? false : (sc.scrollHeight - sc.scrollTop - sc.clientHeight > Math.max(240, sc.clientHeight * 0.6));
    if (E._toBotFar !== far) { E._toBotFar = far; b.classList.toggle('show', far); }
    if (!far) b.classList.remove('new'); else if (grew) b.classList.add('new');
  },
  async continueFlow(chat) {
    if (!chat || chat.busy || chat._qBusy) return;
    try {
      const tail = chat.messages?.at(-1);
      const prevU = tail?.role === 'assistant' ? chat.messages?.at(-2) : (tail?.role === 'user' ? tail : null);
      const origText = prevU ? (prevU.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n') : '';
      if (prevU && typeof chat.verifyTurnForContinue === 'function') {
        const vr = await chat.verifyTurnForContinue(prevU, origText);
        if (vr?.mode === 'already-done' || vr?.mode === 'server-busy') return;
        if (vr?.mode === 'resend-orig' || vr?.mode === 'rewind-resend') {
          await this.retry(chat, prevU, false);
          return;
        }
      }
      if (prevU?.role === 'user') {
        prevU._officialContinueParent = true;
        delete prevU._streamRejected;
      }
      if (tail?.role === 'assistant' && Array.isArray(tail.parts)) {
        const nonErr = tail.parts.filter(p => p && p.type !== 'error');
        if (!nonErr.filter(p => p.type !== 'step-start').length) {
          if (tail.id) (chat._prunedDeadMsgIds ||= new Set()).add(tail.id);
          chat.messages.pop();
        } else {
          tail.parts = nonErr;
          tail.v = (tail.v || 0) + 1;
        }
      }
      chat.error = null;
      chat.errText = '';
      chat._officialTurnErrAt = 0;
      await chat.send('继续', { autoContinue: true, officialAutoResend: true });
    } catch (e) { toast(describe(e), 'err'); }
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
  async confirmPureIpBeforeSend() {
    try {
      if (window.__fixture || window.__routeFixture) return true;
      if (typeof Prefs !== 'undefined' && Prefs.preSendPurityCheck === false) return true;
      let a = this.host?.account || {};
      if (typeof IP !== 'undefined' && IP.polling && (!IP.ip || !IP.at)) {
        await Promise.race([Promise.resolve(IP.polling), sleep(900)]).catch(() => {});
      }
      let curIp = typeof IP !== 'undefined' ? ((!IP.err && IP.ip) || a.status?.ip || '') : (a.status?.ip || '');
      if (!curIp && !a.proxyIp && !a.proxy && !(typeof IP !== 'undefined' && IP.err)) return true;
      let ipRep = (typeof IPRep !== 'undefined' && IPRep.cur) ? IPRep.cur(a, curIp) : null;
      const isTrusted = Boolean(typeof IPRep !== 'undefined' && IPRep.trusted && ((a.proxyIp && IPRep.trusted(a.proxyIp)) || (curIp && IPRep.trusted(curIp))));
      let isPure = Boolean(isTrusted || (ipRep && ipRep.label === '纯净' && (ipRep.pct == null || ipRep.pct >= 75) && !(typeof IP !== 'undefined' && IP.err)));
      if (isPure) return true;

      if (!(typeof IP !== 'undefined' && IP.err) && typeof IPRep !== 'undefined' && typeof IPRep.ensurePreSendPure === 'function') {
        const pre = await IPRep.ensurePreSendPure({ timeoutMs: 1200 }).catch(() => null);
        if (pre?.pure || pre?.switched) {
          if (pre?.switched) { try { Recaptcha.clearCache?.(); } catch {} }
          return true;
        }
        a = this.host?.account || a;
        curIp = typeof IP !== 'undefined' ? ((!IP.err && IP.ip) || pre?.eg || a.status?.ip || curIp) : (pre?.eg || curIp);
        ipRep = IPRep.cur ? IPRep.cur(a, curIp) : ipRep;
        isPure = Boolean(isTrusted || (ipRep && ipRep.label === '纯净' && (ipRep.pct == null || ipRep.pct >= 75) && !(typeof IP !== 'undefined' && IP.err)));
        if (isPure) return true;
        if (ipRep?.label === '未评估' && (!ipRep?.sc || !ipRep.sc.known)) return true;
      }

      const statusParts = [
        ipRep?.label || (typeof IP !== 'undefined' && IP.err ? '连接异常' : '未评估'),
        ipRep?.pct != null ? ipRep.pct + '%' : '',
        ipRep?.kind?.t ? ipRep.kind.t + ' IP' : '',
      ].filter(Boolean).join(' · ');
      const ipDesc = curIp ? `当前出口 ${curIp}（${statusParts}）` : `当前节点（${statusParts || '出口未就绪'}）`;

      const choice = await Dialog.open((box, done) => {
        const noBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => done('no') }, '否，直接发出');
        const yesBtn = h('button', { type: 'button', class: 'btn', onclick: () => done('yes') }, '是，去切换节点');
        box.append(
          h('div', { class: 'dlg-t' }, '请切换纯净 IP，否则会出人机验证'),
          h('div', { class: 'dlg-h', style: { whiteSpace: 'pre-line', lineHeight: '1.55' } },
            `检测到${ipDesc}不是纯净 IP。\n请切换纯净 IP，否则发送消息极易触发人机验证！\n\n是否现在跳出节点切换窗口手动切换？`),
          h('div', { class: 'dlg-row' },
            h('span', { class: 'grow' }),
            noBtn,
            yesBtn)
        );
        setTimeout(() => yesBtn.focus(), 35);
      });
      if (choice === 'yes') {
        try { if (typeof RegionIP !== 'undefined' && RegionIP.open) RegionIP.open(); } catch {}
        return false;
      }
      if (choice === 'no') return true;
      return false;
    } catch {
      return true;
    }
  },
  async retry(chat, lastUser, captcha) {
    if (chat.busy || chat._qBusy) { toast('上一条仍在处理，请稍候','err'); return; }
    if (!captcha && !(await this.confirmPureIpBeforeSend())) return;
    try {
      if (!chat.loaded && !chat.messages.length) {
        chat.error = null;
        await chat.reload('重试载入', true);
        return;
      }
      if (chat.isEvaluation) {
        const v2 = captcha ? await Recaptcha.v2() : null;
        await chat.regenerate({ v2 });
        return;
      }
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
      if (lastUser && (lastUser.failed || capFail || removedErrTail)) { const retryTxt = (lastUser.parts || []).filter(p => p.type === 'text').map(p => p.text).join('\n') || String(lastUser.text || ''); await chat.send(retryTxt, { v2, files: lastUser.metadata?.uploads, retryOf: lastUser }); }
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
    const fits = () => true;
    const autosize = () => {
      const b = ta.parentElement;
      if (b && b.classList.contains('cbox')) {
        b.classList.remove('has-txt', 'g-up', 'g-down');
      }
      // 统一两行输入框（上方文本、下方功能栏），高度按内容自适应生长
      const maxH = Math.round(Math.max(160, Math.min(innerHeight * (isMob() ? 0.35 : 0.45), 520)));
      ta.style.maxHeight = maxH + 'px'; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px'; ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
    };
    const btn = h('button', { class: 'sendbtn', type: 'submit', title: '发送', 'aria-label': 'Send message', onclick: () => go() }, icon('send'));
    const chint = h('span', { class: 'chint' }, chat ? '' : '');
    // 附件：每个标签页各自一组。选中 / 粘贴 / 拖入的瞬间就在输入框里显示本地预览，同时后台开始上传（显示进度）；
    // 按发送不用等上传：消息立即出现在对话里，上传完成后自动发出（新对话需要附件才能创建，会等上传完成）
    const atts = this.atts.get(tab.key) || []; this.atts.set(tab.key, atts);
    const chips = h('div', { class: 'att-row' });
    // 排队中的消息（对话进行中时按「队列」加入；本轮结束后合并自动发出）
    const qrow = h('div', { class: 'q-row' });
    const paintQ = () => {
      const c = tab.sid ? Chats.get(tab.sid) : null, q = (c && typeof SendQ !== 'undefined' && typeof SendQ.of === 'function' ? SendQ.of(c) : c?.queue) || [], held = (c?.messages || []).filter(m => m._held);
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
          c.status === 'error' || !c.busy ? h('button', { class: 'q-now', onclick: async () => { if (await UI.confirmPureIpBeforeSend()) void SendQ.flush(c, { manual: true }); } }, '立即发送') : null,
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
        if (!(await this.confirmPureIpBeforeSend())) return;
        let text = ta.value.trim(); const list = atts.slice();
        if (!text && list.length) text = '请查看附件：' + list.map(a => a.name).join('、');
        const filesP = list.length ? Promise.all(list.map(a => a.p)).then(rs => { if (rs.some(r => !r)) throw new Error('附件上传失败'); return rs; }) : null;
        this.sending = true; btn.disabled = true;
        const restore = { v: ta.value };
        if (restore.v.trim()) this.inputHistory.push(restore.v);
        histIdx = -1; histSavedDraft = '';
        ta.value = ''; tab.draft = ''; autosize(); Tabs.save(); P.stick = true; atts.length = 0; paintAtt();
        const run = v2 => c.skipHitlSend(text, { ...(filesP ? { filesP, previews: list } : {}), ...(v2 ? { v2 } : {}) });
        try { await run().catch(async e => { if (e?.status === 403 && /recaptcha/i.test(e.body || '')) { const tok = await Recaptcha.v2().catch(() => null); if (tok) return run(tok); } throw e; }); }
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
      if (c && SendQ.of(c).length) {
        if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，请先移除', 'err'); return; }
        if (!(await this.confirmPureIpBeforeSend())) return;
        if (ta.value.trim() || atts.length) { if (ta.value.trim()) this.inputHistory.push(ta.value); if (!SendQ.add(c, ta.value.trim(), atts.slice())) return; histIdx = -1; histSavedDraft = ''; ta.value = ''; tab.draft = ''; atts.length = 0; autosize(); Tabs.save(); paintAtt(); }
        await SendQ.flush(c, { manual: true }); paintQ(); return;
      }
      const rawDraft = ta.value;
      let text = ta.value.trim(); if ((!text && !atts.length) || this.sending) return;
      if (atts.some(a => a.state === 'bad')) { toast('有附件上传失败，移除后再发送', 'err'); return; }
      if (!(await this.confirmPureIpBeforeSend())) return;
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
            if (hint) hint.textContent = '';
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
    setTimeout(() => { autosize(); }, 0);
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
    const resolvedMode = (typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._resolveState === 'function')
      ? ModeSwitcher._resolveState(chat, tab).curMode
      : ((chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent')) || 'agent');
    const gpopBtn = GPop.btn();
    if (gpopBtn && resolvedMode === 'battle') {
      gpopBtn.style.display = 'none';
      gpopBtn.hidden = true;
    } else if (gpopBtn && resolvedMode === 'direct') {
      gpopBtn.style.display = 'none';
      gpopBtn.hidden = true;
    }
    const box = h('div', { class: 'cbox', 'data-mode': resolvedMode, onclick: e => { if (e.target === e.currentTarget) ta.focus(); },
      ondragover: e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); box.classList.add('drop'); } },
      ondragleave: () => box.classList.remove('drop'),
      ondrop: e => { box.classList.remove('drop'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } } },
      qrow, chips, ta, pmWrap, h('div', { class: 'crow' }, plus, fin, typeof ModeSwitcher !== 'undefined' ? ModeSwitcher.renderBar(tab, chat) : null, chint, h('span', { class: 'grow' }), Cap.btn(), gpopBtn, btn));
    const composer = h('div', { class: 'composer', 'data-mode': resolvedMode }, box);
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
      if (!History.byId(c.sid)) History.items.unshift({ type: c.isEvaluation ? 'evaluation' : 'agentic', mode: c.evalMode || undefined, modality: c.modality || undefined, modelAId: c.modelAId || undefined, id: c.sid, title: text.slice(0, 60), updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), _local: true });
      History.dedupe();
      this.renderList(); this.renderTabs(); this.showTab();
      History.auto('new');   // 新对话：20 秒内最多拉一次（第一轮回复完成时还会再排一次拿服务器标题）
    } catch (e) {
      unpend();
      if (hint) hint.textContent = '';
      if (e.status === 403 && /recaptcha/i.test(e.body || '')) {
        const tok = await Recaptcha.v2().catch(() => null);
        if (tok) return this.startNew(tab, text, ta, tok, files);
        return;
      }
      if (e.status === 429) { const q = Quota.chat; const wait = q?.retryAt ? Math.max(0, Math.ceil((q.retryAt - now()) / 60000)) : null; throw new Error('新对话额度用完（429）' + (wait ? `，约 ${wait} 分钟后恢复` : '')); }
      throw e;
    } finally { if (hint && hint.textContent === '正在创建对话…') hint.textContent = ''; }
  },
  renderProbeTestBtn(tab, chat, mode) {
    const curMode = mode || (chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent'));
    const isProbeRun = Boolean(chat && chat._isMicroProbe && chat.busy);
    return h('button', {
      type: 'button',
      class: 'ib probebtn' + (isProbeRun ? ' run' : ''),
      'data-mode': curMode,
      'aria-label': isProbeRun ? '停止探针测试' : '微缩探针测试',
      disabled: Boolean(chat && chat.busy && !isProbeRun),
      title: isProbeRun
        ? '停止当前微缩探针测试'
        : '微缩探针测试：点一下直接发送 35～45 行 HTML+SVG 微缩徽章探针测试题',
      onclick: e => {
        e.stopPropagation();
        if (typeof PelicanTest !== 'undefined' && typeof PelicanTest.runQuickTest === 'function') {
          void PelicanTest.runQuickTest('habit', { tab: tab || Tabs.cur, chat, mode: curMode });
        }
      },
    }, icon('fingerprint'));
  },
  renderPelicanMenuBtn(tab, chat, mode) {
    const curMode = mode || (chat?.isEvaluation ? (chat.evalMode || 'battle') : (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' ? ModeState.getMode() : 'agent'));
    const isPelRun = Boolean(chat && ((typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat)) || (chat.isEvaluation && chat._isPelicanTest && chat.busy)));
    const probeBtn = this.renderProbeTestBtn(tab, chat, curMode);
    const pelBtn = h('button', {
      type: 'button',
      class: 'ib pel-test-btn pelbtn' + (isPelRun ? ' run' : ''),
      'data-mode': curMode,
      'aria-label': isPelRun ? '停止鹈鹕测试' : '鹈鹕测试',
      disabled: Boolean(chat && chat.busy && !isPelRun),
      title: isPelRun
        ? '停止当前鹈鹕测试'
        : '鹈鹕测试：点一下直接发送 2D 鹈鹕骑车动态 SVG 标准测试题',
      onclick: e => {
        e.stopPropagation();
        if (typeof PelicanTest !== 'undefined' && typeof PelicanTest.runQuickTest === 'function') {
          void PelicanTest.runQuickTest('pelican', { tab: tab || Tabs.cur, chat, mode: curMode });
        } else if (chat && typeof PelicanTest !== 'undefined' && typeof PelicanTest.start === 'function') {
          void PelicanTest.start(chat);
        }
      },
    }, icon('pelican'));
    return [probeBtn, pelBtn];
  },
  async sendQuickTestPrompt(prompt, opts = {}) {
    const text = String(prompt || '').trim();
    if (!text) return null;
    const kind = String(opts.kind || 'pelican').toLowerCase();
    const tab = opts.tab || (typeof Tabs !== 'undefined' ? (Tabs.cur || Tabs.newChat()) : null);
    const chat = opts.chat || (tab?.sid && typeof Chats !== 'undefined' ? Chats.get(tab.sid) : null);
    if (chat && chat.sid) {
      if (chat.busy || chat.sending) {
        if (typeof toast === 'function') toast('当前对话正在生成中，请稍候', 'err');
        return null;
      }
      if (kind === 'habit' || kind === 'micro' || kind === 'probe') chat._isMicroProbe = true;
      if (kind === 'pelican' || kind === 'svg') chat._isPelicanTest = true;
      if ((kind === 'pelican' || kind === 'svg') && !chat.isEvaluation && typeof PelicanTest !== 'undefined' && typeof PelicanTest.start === 'function') {
        return PelicanTest.start(chat);
      }
      await chat.send(text, []);
      return { ok: true, kind, prompt: text, chat };
    }
    const ta = this.els?.composer?.querySelector?.('textarea')
      || (typeof document !== 'undefined' ? document.querySelector?.('#view .composer textarea') : null)
      || { value: '' };
    await this.startNew(tab, text, ta, null, []);
    const created = (tab?.sid && typeof Chats !== 'undefined') ? Chats.get(tab.sid) : null;
    if (created) {
      if (kind === 'habit' || kind === 'micro' || kind === 'probe') created._isMicroProbe = true;
      if (kind === 'pelican' || kind === 'svg') created._isPelicanTest = true;
    }
    return { ok: true, kind, prompt: text, chat: created };
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
  stamp:c=>[chatState(c),c.title,!!c.loaded,Models.get(c.sid),c.voteState?.voted,c.voteState?.submitting,c.voteState?.value,c.evalMode,c.modality],
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
if (typeof Bus !== 'undefined') {
  Bus.on('history', () => { try { Tabs.enforceLimit(Tabs.active); Tabs.save(); } catch {} });
  Bus.on('modechange', () => { try { UI.renderList(); UI.renderTabs?.(); UI.showTab(); } catch {} });
  Bus.on('modalitychange', () => { try { UI.showTab(); } catch {} });
  Bus.on('directmodelchange', () => { try { UI.showTab(); } catch {} });
  Bus.on('eval:vote-revealed', () => { try { if (UI.els?.chat) UI.renderChat(UI.els.chat, true); UI.renderTabs?.(); UI.renderListSoon?.(); } catch {} });
  Bus.on('eval:stream', payload => { try { if (payload?.chat && UI.els?.chat === payload.chat) scheduleChat(payload.chat); } catch {} });
}
const SINCE = document.getElementsByClassName('anc-since');
setInterval(() => {
  if (document.hidden || !SINCE.length) return;
  for (const e of [...SINCE]) {
    const s = Number(e?.dataset?.since);
    if (!Number.isFinite(s) || s <= 1e12) {
      if (e.textContent) e.textContent = '';
      continue;
    }
    const t = ' ' + Math.max(0, Math.floor((now() - s) / 1000)) + 's';
    if (e.textContent !== t) e.textContent = t;
  }
}, 1000);
try {
  const _scrollHideTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const _markScrolling = el => {
    if (!el || !el.classList || !_scrollHideTimers) return;
    el.classList.add('is-scrolling');
    const prev = _scrollHideTimers.get(el);
    if (prev) clearTimeout(prev);
    _scrollHideTimers.set(el, setTimeout(() => {
      _scrollHideTimers.delete(el);
      try { el.classList.remove('is-scrolling'); } catch {}
    }, 700));
  };
  document.addEventListener('scroll', e => {
    const t = (e.target === document || e.target === document.documentElement)
      ? (document.scrollingElement || document.documentElement)
      : e.target;
    _markScrolling(t);
  }, { capture: true, passive: true });
} catch {}
