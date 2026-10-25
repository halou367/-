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
        if (!qit || isProbeQ(qit.text) || (qit.id && (claimed.has(qit.id) || removedSet.has(qit.id))) || ((qit.at || 0) > 0 && (chat._qClearedAt || 0) >= (qit.at || 0))) {
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
