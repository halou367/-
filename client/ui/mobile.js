// 手机端交互：边缘右滑打开侧栏、左滑关闭；聊天区域左右滑动切换窗口（标签）；模型信息卡片下拉关闭；安卓返回键逐层关闭
const Mob = {
  // 触点所在位置能不能横向滚动（代码块、表格、附件条等）：能的话左右滑是滚动它，不切换窗口
  hscroll(el) {
    for (let x = el; x && x.id !== 'view' && x !== document.body; x = x.parentElement) {
      if (x.scrollWidth > x.clientWidth + 2) { const o = getComputedStyle(x).overflowX; if (o === 'auto' || o === 'scroll') return true; }
    }
    return false;
  },
  // 左右滑切换到上一个 / 下一个窗口
  can(d) { const L = Tabs.list, i = L.findIndex(t => t.key === Tabs.active), j = i + d; return i >= 0 && j >= 0 && j < L.length; },
  step(d, anim = true) {
    const L = Tabs.list, i = L.findIndex(t => t.key === Tabs.active), j = i + d;
    if (d < 0 && i <= 0) {
      document.body.classList.add('drawer');
      if (typeof Dock !== 'undefined' && Dock.mOpen) { Dock.mOpen = false; UI.layout?.(); }
      return true;
    }
    if (i < 0 || j < 0 || j >= L.length) { if (d > 0 && L.length >= 2) this.hint('已经是最后一个窗口'); return false; }
    Tabs.focus(L[j].key);
    const v = anim ? $('#view') : null; if (v) { v.classList.remove('swin-l', 'swin-r'); void v.offsetWidth; v.classList.add(d > 0 ? 'swin-l' : 'swin-r'); setTimeout(() => v.classList.remove('swin-l', 'swin-r'), 260); }
    const on = document.querySelector('#tablist .on'); on?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    this.hint((j + 1) + ' / ' + L.length + (on ? ' · ' + (on.textContent || '').replace(/×$/, '').trim().slice(0, 24) : ''));
    return true;
  },
  // ---- 翻页器（横向画卷）：左右相邻的窗口是真正搭好的页（Pager），平时停在当前页正下方；
  // 拖动 = 当前页和相邻页一起平移（整数像素、不改透明度）；松手滑到位后只换角色，不重建任何东西 ----
  dragging: false,
  busy() { return this.dragging || !!this.pend; },
  // 相邻页回到停靠位（当前页正下方）
  park(P) { if (!P?.el) return; P.el.classList.remove('moving'); P.el.style.transition = ''; P.el.style.transform = ''; const sc = P.el.querySelector('.scroller'); if (sc) sc.style.overflowY = ''; P.el.querySelector(':scope>.pgrad')?.remove(); },
  // 滑进来的那一页：靠着当前页的那一边是当前窗口的颜色，渐变到它自己的颜色（接缝处颜色连续）；
  // 落位后这层渐变慢慢淡掉，页面恢复成自己的本色。渐变是页里最底下单独的一层，只改透明度，不重画页面内容
  grad(el, v, d) {
    const cur = getComputedStyle(v).getPropertyValue('--bg').trim(); if (!cur) return;
    let o = el.querySelector(':scope>.pgrad'); if (!o) { o = h('div', { class: 'pgrad', 'aria-hidden': 'true' }); el.prepend(o); }
    o.style.transition = 'none'; o.style.opacity = '1';
    o.style.background = `linear-gradient(${d > 0 ? 'to right' : 'to left'}, ${cur} 0%, color-mix(in srgb, ${cur} 55%, transparent) 45%, transparent 100%)`;
  },
  settleGrad(el) {
    const o = el?.querySelector(':scope>.pgrad'); if (!o) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { o.style.transition = 'opacity .7s cubic-bezier(.3,.1,.3,1)'; o.style.opacity = '0'; }));
    setTimeout(() => { if (o.style.opacity === '0') o.remove(); }, 900);
  },
  drag(s, dx) {
    const v = $('#view'); if (!v) return;
    const d = dx < 0 ? 1 : -1, can = this.can(d), W = s.W ||= Math.round(v.getBoundingClientRect().width || innerWidth);
    if (s.gd !== d) {
      if (s.p) this.park(s.p);
      s.p = null; s.gd = d;
      if (can) {
        const L = Tabs.list, i = L.findIndex(t => t.key === Tabs.active);
        s.p = Pager.get(L[i + d], true);
        if (s.p) { if (s.p.dirty) Pager.paint(s.p); s.p.el.classList.add('moving'); this.grad(s.p.el, v, d); }
      }
    }
    const x = Math.round(can ? dx : dx * 0.18);
    v.style.transition = 'none'; v.style.transform = `translate3d(${x}px,0,0)`;
    if (s.p) { s.p.el.style.transition = 'none'; s.p.el.style.transform = `translate3d(${(d > 0 ? W : -W) + x}px,0,0)`; }
    // 颜色跟着拖动比例渐变到相邻窗口的颜色（最短色相路径），松手时接着走完，不会「啪」地换色
    try { const L = Tabs.list, i = L.findIndex(t => t.key === Tabs.active); Palette.drag(can ? L[i + d] : null, can ? Math.abs(x) / W : 0); } catch {}
  },
  // 上一次松手的动画还没走完就又开始滑：立刻把它做完（该换的页马上换好），所有页归位
  flush() {
    clearTimeout(this.slT); this.slT = 0;
    const f = this.pend; this.pend = null; if (f) { try { f(); } catch {} }
    const v = $('#view'); if (v) { v.style.transition = ''; v.style.transform = ''; }
    for (const P of Pager.panes.values()) this.park(P);
    this.freeze(false);
  },
  // 等 el 的 transform 过渡结束（只认它自己的 transform）再做 fn；定时兜底
  after(el, ms, fn) {
    let fired = false;
    const go = () => { if (fired) return; fired = true; el?.removeEventListener('transitionend', te); clearTimeout(this.slT); this.slT = 0; this.pend = null; fn(); };
    const te = e => { if (e.target === el && e.propertyName === 'transform') go(); };
    el?.addEventListener('transitionend', te);
    this.pend = go; this.slT = setTimeout(go, ms + 90);
  },
  // 松手：d = 切过去的方向（0 = 回弹）
  release(s, d, dx) {
    const v = $('#view'); if (!v) { this.dragging = false; return; }
    const W = s?.W || Math.round(v.getBoundingClientRect().width || innerWidth), ease = 'cubic-bezier(.22,.8,.26,1)', P = s?.p;
    if (s) { s.done = true; if (s._raf) { cancelAnimationFrame(s._raf); s._raf = 0; } }
    clearTimeout(this.slT);
    if (!d || !P || s.gd !== d || !this.can(d)) {
      v.style.transition = `transform .2s ${ease}`; v.style.transform = 'translate3d(0,0,0)';
      if (P) { P.el.style.transition = `transform .2s ${ease}`; P.el.style.transform = `translate3d(${s.gd > 0 ? W : -W}px,0,0)`; }
      try { Palette.tween(Palette.ofTab(Tabs.cur), 200); } catch {}
      this.after(v, 200, () => { v.style.transition = ''; v.style.transform = ''; if (P) this.park(P); this.freeze(false); this.dragging = false; Pager.ensureSoon(); });
      if (d && !this.can(d)) this.step(d);   // 到头了：提示「已经是最后一个窗口」
      return;
    }
    const ms = Math.round(Math.max(140, Math.min(260, (W - Math.abs(dx)) / W * 320)));
    v.style.transition = `transform ${ms}ms ${ease}`; v.style.transform = `translate3d(${d > 0 ? -W : W}px,0,0)`;
    P.el.style.transition = `transform ${ms}ms ${ease}`; P.el.style.transform = 'translate3d(0,0,0)';
    try { const L = Tabs.list, i = L.findIndex(t => t.key === Tabs.active); Palette.tween(Palette.ofTab(L[i + d]), ms); } catch {}
    this.after(P.el, ms, () => {
      this.freeze(false); this.dragging = false;
      // 滑到位：Tabs.focus → showTab → Pager.adopt(P)：这一页拿走 id="view"，原来的页退到它下面（同一帧完成，画面不变）
      this.step(d, false);
      if (P.el.id === 'view') this.settleGrad(P.el);
      if (P.el.id !== 'view') { this.park(P); const nv = $('#view'); if (nv) { nv.style.transition = ''; nv.style.transform = ''; } }
      if (v.id !== 'view') { v.style.transition = ''; v.style.transform = ''; }
    });
  },
  // 横向拖动锁定后：冻结消息列表的竖向滚动（斜着滑时不会一边翻页一边上下滚）
  // 以前横向锁定后把消息列表 overflow 改成 hidden 来冻结竖向滚动；但切 overflow 会让整页滚动层重建、重画一遍（滑动开头卡一下）。
  // 现在靠 .scroller 的 touch-action:pan-y：一开始就是横向的手势，浏览器整段都不会竖向滚动，不用再冻结。只保留清理旧状态。
  freeze(on) { if (on) return; const sc = $('#view .scroller'); if (sc && sc.style.overflowY) sc.style.overflowY = ''; },
  // 触摸事件可能一帧来好几次（高刷屏）：合并成每帧只更新一次位置和颜色，减少掉帧
  dragSoon(s, dx) { s._dx = dx; if (s._raf) return; s._raf = requestAnimationFrame(() => { s._raf = 0; if (s.done) return; this.drag(s, s._dx); }); },
  hint(t) {
    let el = $('#swhint'); if (!el) { el = h('div', { id: 'swhint' }); document.body.append(el); }
    el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this.hT); this.hT = setTimeout(() => el.classList.remove('on'), 1100);
  },
  bind() {
    try { MobFit.init(); } catch {}
    let s = null;
    const pt = e => e.touches ? e.touches[0] : e;
    document.addEventListener('touchstart', e => {
      if (!isMob() || e.touches.length !== 1) { if (s?.kind === 'tab' && s.lock === 'h' && !s.done) Mob.release(s, 0, 0); s = null; return; }   // 滑到一半第二根手指按下：回弹，别卡在半路
      const p = pt(e), b = document.body, sheet = e.target.closest?.('#dockwrap');
      s = { x: p.clientX, y: p.clientY, t: Date.now(), kind: null };
      if (!Mob.pend && (Mob.dragging || document.querySelector('#body>.pane.moving') || $('#view')?.style.transform)) { Mob.dragging = false; Mob.flush(); }   // 新手势开始时不可能还在拖：上一次的 touchend 丢了 → 归位   // 兜底：没有动画在走却还有页没归位 → 归位
      if (document.querySelector('.tsw') || document.querySelector('.lpick:not(.out)')) { s = null; return; }   // 窗口切换器开着：手势交给它
      if (HtmlPreview.on()) { s = null; return; }   // 预览弹层开着：边缘滑动 / 切窗口手势不抢（捏合、拖动、下拉关闭都在弹层里处理）
      if (!b.classList.contains('drawer') && p.clientX < 22 && !document.querySelector('.modal-back:not(.anc-gh)')) s.kind = 'open';
      // 右边缘往左滑：展开模型信息
      else if (!b.classList.contains('drawer') && !Dock.mOpen && p.clientX > innerWidth - 18 && !document.querySelector('.modal-back:not(.anc-gh),.asheet-back:not(.anc-gh)')) s.kind = 'dopen';
      else if (b.classList.contains('drawer') && e.target.closest?.('#sb,#scrim')) s.kind = 'close';
      else if (sheet) s.kind = 'side';   // 模型信息卡片（右侧）：往右滑关闭
      // 聊天区域（消息列表 / 输入框）左右滑：切换窗口
      else if (!b.classList.contains('drawer') && e.target.closest?.('#view') && !e.target.closest('.modal-back,.menu,#dockwrap,.asheet-back,.lpick,input[type=range]') && !document.querySelector('.modal-back:not(.anc-gh)') && !Mob.hscroll(e.target)) s.kind = 'tab';
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!s?.kind) return;
      const p = pt(e), dx = p.clientX - s.x, dy = p.clientY - s.y;
      if (s.kind === 'close' && dx < 0 && Math.abs(dx) > Math.abs(dy)) $('#sb').style.transform = `translateX(${dx}px)`;
      if (s.kind === 'tab') {
        if (!s.lock) { if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) s.lock = 'h'; else if (Math.abs(dy) > 12) { s.kind = null; return; } }
        if (s.lock === 'h') { if (!s.fl) { s.fl = 1; if (Mob.pend) Mob.flush(); Mob.dragging = true; } Mob.dragSoon(s, dx); }
      }
      if (s.kind === 'side' && dx > 0 && dx > Math.abs(dy) * 1.2 && !Mob.hscroll(e.target)) { const w = $('#dockwrap'); w.style.transform = `translateX(${dx}px)`; w.style.transition = 'none'; }
    }, { passive: true });
    document.addEventListener('touchend', e => {
      if (!s?.kind) return;
      const p = e.changedTouches?.[0] || {}, dx = (p.clientX ?? s.x) - s.x, dy = (p.clientY ?? s.y) - s.y, fast = Date.now() - s.t < 300;
      if (s.kind === 'tab') {
        const W = s.W || innerWidth, go = s.lock === 'h' && (Math.abs(dx) > (fast ? 40 : W * 0.33)) && Math.abs(dy) < 120;
        if (s.lock === 'h') Mob.release(s, go ? (dx < 0 ? 1 : -1) : 0, dx);
        s = null; return;
      }
      const sb = $('#sb'), w = $('#dockwrap'); if (sb) sb.style.transform = ''; if (w) { w.style.transform = ''; w.style.transition = ''; }
      if (s.kind === 'open' && dx > 50 && Math.abs(dy) < 60) { document.body.classList.add('drawer'); if (Dock.mOpen) { Dock.mOpen = false; UI.layout(); } }
      else if (s.kind === 'close' && dx < -(fast ? 30 : 90) && Math.abs(dy) < 80) UI.closeDrawer();
      else if (s.kind === 'dopen' && dx < -40 && Math.abs(dy) < 80) Dock.toggle(true);
      else if (s.kind === 'side' && dx > (fast ? 40 : 120) && Math.abs(dy) < 80) Dock.toggle(false);
      s = null;
    }, { passive: true });
    document.addEventListener('touchcancel', () => { if (s?.kind === 'tab' && s.lock === 'h') Mob.release(s, 0, 0); if (s) { const sb = $('#sb'), w = $('#dockwrap'); if (sb) sb.style.transform = ''; if (w) { w.style.transform = ''; w.style.transition = ''; } } s = null; }, { passive: true });
    // 安卓返回键：弹层 → 弹窗 → 侧栏 → 面板 → 工作区，都没有才退到后台
    window.__ancBack = () => {
      if(Bar.closeDonut())return true;
      if (EnterFlow.on()) { EnterFlow.close(); return true; }
      const pop = document.querySelector('.menu:not(.anc-gh),#palpop,#lppop,.pip-drop:not([hidden]),.tipbox');
      if (pop) { if (pop.classList.contains('pip-drop')) pop.hidden = true; else pop.remove(); return true; }
      const pvm = document.querySelector('#pv .pv-menu'); if (pvm) { pvm.remove(); return true; }
      if (HtmlPreview.on()) { HtmlPreview.dismiss(); return true; }
      const gp = document.querySelector('.gachaPopover,.gp-panel,#gpop');
      if (gp && gp.offsetParent) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (!gp.isConnected || !gp.offsetParent) return true; }
      const ms = document.querySelectorAll('.modal-back:not(.anc-gh)'); const m = ms[ms.length - 1];
      if (m) {
        const b = [...m.querySelectorAll('.modal-f button, .modal-h button')].find(x => /^(取消|关闭|完成|×)$/.test(x.textContent.trim()) || x.classList.contains('x'));
        if (b) b.click(); else m.remove();
        return true;
      }
      if (TabSw.isOpen()) { TabSw.close(); return true; }
      const b = document.body;
      if (b.classList.contains('drawer')) { UI.closeDrawer(); return true; }
      if (isMob() && Dock.mOpen) { Dock.toggle(false); return true; }
      if (isMob() && WS.mOpen) { WS.set(false); return true; }
      // 手机 App 的第一级是「选择账号」：在对话界面按返回 → 回到选择账号；已经在选择账号界面再按返回 → 退到后台
      if (Host.platform === 'android') {
        if (document.querySelector('.lpick:not(.out)') || LaunchPick.busy) return false;
        LaunchPick.show({ back: true }); return true;
      }
      return false;
    };
  },
};

// ---------- 就近预热：按离当前位置的远近排队，最多同时 3 个 ----------
const Warm = {
  q: [], run: 0,
  near(keys) {
    const sids = keys.map(k => Tabs.list.find(t => t.key === k)).filter(t => t && t.sid && !t.kind).map(t => t.sid);
    this.q = [...new Set([...sids, ...this.q])]; this.pump();
  },
  pump() {
    while (this.run < 3 && this.q.length) {
      const c = chatOf(this.q.shift()); if (c.loaded || c.loading) continue;
      this.run++; c.warm().catch(() => {}).finally(() => { this.run--; this.pump(); });
    }
  },
  // 以 key 为中心，由近到远
  around(key, n) {
    const L = Tabs.list, i = Math.max(0, L.findIndex(t => t.key === key)), out = [];
    for (let d = 0; d < L.length && out.length < (n ?? L.length); d++) { if (L[i + d]) out.push(L[i + d].key); if (d && L[i - d]) out.push(L[i - d].key); }
    return out;
  },
};

// ---------- 手机：已打开的窗口（类似 iOS 多任务后台的堆叠卡片）----------
// 顶部右边「⋯」打开：左右滑浏览，点卡片切换过去，上滑卡片或点 × 关闭窗口，底部「新对话」
const TabSw = {
  el: null,
  isOpen() { return !!this.el?.isConnected; },
  // 卡片预览：最近几条消息的缩略（用户消息靠右气泡，回答为正文）
  preview(t) {
    const box = h('div', { class: 'tsw-pv' });
    if (t.kind === 'power') { box.append(h('div', { class: 'tsw-empty' }, icon('bolt'), '推理分排行')); return box; }
    if (t.kind === 'gacha') { box.append(h('div', { class: 'tsw-empty' }, icon('slot'), '抽卡')); return box; }
    const c = t.sid ? Chats.get(t.sid) : null;
    if (!t.sid) { box.append(h('div', { class: 'tsw-empty' }, h('b', {}, '有什么可以帮你？'), h('span', {}, '新对话'))); return box; }
    const msgs = (c?.messages || []).slice(-8);
    if (!msgs.length) { box.append(h('div', { class: 'tsw-empty' }, h('span', {}, c?.loading ? '载入中…' : '点开后载入对话内容'))); return box; }
    const clean = s => String(s || '').replace(/```[\s\S]*?(```|$)/g, ' [代码] ').replace(/[#*_`>|~]+/g, '').replace(/\s+/g, ' ').trim();
    for (const m of msgs) {
      const parts = m.parts || [];
      let txt = clean(parts.filter(p => p.type === 'text').map(p => p.text).join(' '));
      const tools = parts.filter(p => /^tool-|^dynamic-tool/.test(p.type || '')).length, files = parts.filter(p => p.type === 'file').length;
      if (!txt && tools) txt = '⚙ 调用了 ' + tools + ' 个工具';
      if (files) txt = '[' + files + ' 个附件] ' + txt;
      if (!txt) continue;
      box.append(h('div', { class: 'tsw-m ' + (m.role === 'user' ? 'u' : 'a') }, txt.slice(0, 240)));
    }
    if (c?.busy) box.append(h('div', { class: 'tsw-m a dim' }, h('i', { class: 'spin' }), ' ', c.phase || '进行中'));
    return box;
  },
  card(t) {
    const c = t.sid ? Chats.get(t.sid) : null, st = chatState(c);
    let logo, name;
    if (t.kind === 'power') { logo = icon('bolt'); name = '推理分排行'; }
    else if (t.kind === 'gacha') { logo = icon('slot'); name = '抽卡'; }
    else if (!t.sid) { logo = stLogo(null, 16, ''); name = '新对话'; }
    else { const title = History.byId(t.sid)?.title || c?.title || t.title || '', v = Titles.view(t.sid, title); logo = stLogo(v.vid, 16, st); name = v.note || (v.model ? tabName(v.model) : '') || v.plain || '对话'; }
    const delBtn = (t.sid && !t.kind)
      ? h('button', { class: 'tsw-x tsw-del danger', type: 'button', title: '删除对话（含云端和本机记录）', 'aria-label': '删除对话' }, icon('trash'))
      : null;
    const x = h('button', { class: 'tsw-x', type: 'button', title: '关闭窗口', 'aria-label': '关闭窗口' }, icon('x'));
    const card = h('div', { class: 'tsw-card' + (t.key === Tabs.active ? ' cur' : '') },
      h('div', { class: 'tsw-ch' }, logo, h('span', { class: 'tsw-n' }, name), delBtn, x),
      this.preview(t));
    const slot = h('div', { class: 'tsw-slot', 'data-key': t.key, 'data-sid': t.sid || '' }, card);
    if (delBtn) {
      delBtn.onclick = async e => {
        e.stopPropagation();
        const entry = History.byId(t.sid) || (typeof ArchiveHistory !== 'undefined' && ArchiveHistory.byId?.(t.sid)) || { id: t.sid, title: c?.title || t.title || '' };
        const ok = await deleteChat(entry);
        if (ok && slot.isConnected) {
          slot.remove();
          if (Tabs.list.length <= 1 && !Tabs.cur?.sid) setTimeout(() => this.close(), 120);
          else { this.count(); this.paint(); }
        }
      };
    }
    x.onclick = e => { e.stopPropagation(); this.kill(slot, 'x'); };
    // 上滑关闭 / 点一下切换过去
    let s = null;
    card.addEventListener('pointerdown', e => { if (e.target.closest('.tsw-x')) return; s = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, v: false, moved: false }; });
    card.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.v && !s.moved) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) { s.v = true; try { card.setPointerCapture(e.pointerId); } catch {} card.style.transition = 'none'; } else if (Math.abs(dx) > 10) { s.moved = true; } }
      if (s.v) { const y = dy < 0 ? dy : dy * 0.25; card.style.transform = `translateY(${y}px)`; card.style.opacity = String(Math.max(0.35, 1 + Math.min(0, dy) / 520)); }
    });
    const end = e => {
      if (!s || e.pointerId !== s.id) return;
      const dy = e.clientY - s.y, dx = e.clientX - s.x, fast = Date.now() - s.t < 260, st0 = s; s = null;
      if (st0.v) {
        card.style.transition = '';
        if (dy < -(fast ? 50 : card.offsetHeight * 0.28)) this.kill(slot, 'up');
        else { card.style.transform = ''; card.style.opacity = ''; }
        return;
      }
      if (e.type === 'pointerup' && !st0.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) this.pick(t.key, card);
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    return slot;
  },
  // 关闭一个窗口：卡片飞走，空位收拢
  kill(slot, how) {
    const key = slot.dataset.key, card = slot.firstChild;
    card.style.transition = 'transform .24s ease, opacity .24s ease';
    card.style.transform = how === 'up' ? 'translateY(-110vh)' : 'translateY(-40px) scale(.9)'; card.style.opacity = '0';
    setTimeout(() => {
      slot.style.transition = 'width .22s ease, margin .22s ease'; slot.style.width = '0px'; slot.style.marginRight = '0px';
      setTimeout(() => { slot.remove(); this.paint(); }, 230);
      const last = Tabs.list.length <= 1;
      Tabs.close(key);
      if (last) setTimeout(() => this.close(), 260);
      else this.count();
    }, 200);
    try { navigator.vibrate?.(8); } catch {}
  },
  pick(key, card) {
    card?.classList.add('picked');
    if (Tabs.active !== key) Tabs.focus(key);
    setTimeout(() => this.close(), 150);
  },
  // 内容到了就把对应卡片的预览换掉（流式输出时每张卡最多 4 次 / 秒）
  syncGacha() {
    if (!this.isOpen() || typeof Gacha === 'undefined' || !Gacha.stepOf) return;
    this.el.querySelectorAll('.tsw-slot').forEach(slot => {
      const sid = slot.dataset.sid;
      const card = slot.querySelector('.tsw-card');
      const head = slot.querySelector('.tsw-head');
      if (!card || !head) return;
      const gStep = sid ? Gacha.stepOf(sid) : null;
      let tag = head.querySelector('.tsw-gstep');
      let bar = card.querySelector('.gstep-bar');
      if (gStep && gStep.active) {
        card.classList.add('gstep-card');
        if (!tag) {
          tag = h('span', { class: 'gstep-tag tsw-gstep' }, gStep.text);
          const xBtn = head.querySelector('.tsw-x');
          head.insertBefore(tag, xBtn || null);
        } else {
          tag.textContent = gStep.text;
        }
        if (!bar) {
          bar = h('i', { class: 'gstep-bar' }, h('b', { style: `width:${gStep.pct}%` }));
          card.append(bar);
        } else {
          const b = bar.querySelector('b');
          if (b) b.style.width = gStep.pct + '%';
        }
      } else {
        card.classList.remove('gstep-card');
        tag?.remove();
        bar?.remove();
      }
    });
  },
  onChat(c) {
    if (!this.el || !c?.sid) return;
    const t = Tabs.list.find(x => x.sid === c.sid && !x.kind); if (!t) return;
    const T = this.pvT ||= new Map(); if (T.has(t.key)) return;
    T.set(t.key, setTimeout(() => {
      T.delete(t.key); if (!this.el) return;
      const slot = [...this.el.querySelectorAll('.tsw-slot')].find(x => x.dataset.key === t.key), old = slot?.querySelector('.tsw-pv');
      if (old) old.replaceWith(this.preview(t));
    }, 250));
  },
  centerKey() {
    const sc = this.el?.querySelector('.tsw-s'); const f = sc?.firstChild; if (!f) return Tabs.active;
    const i = Math.round(sc.scrollLeft / (f.offsetWidth || 1)); return sc.children[Math.max(0, Math.min(sc.children.length - 1, i))]?.dataset.key || Tabs.active;
  },
  count() { const n = this.el?.querySelector('.tsw-cnt'); if (n) n.textContent = Tabs.list.length + ' 个窗口'; },
  // 堆叠效果：当前卡片完整显示；左边的卡片压在下面、略缩小变暗，越往左越紧凑；右边的卡片从右侧露出一截
  paint() {
    const sc = this.el?.querySelector('.tsw-s'); if (!sc) return;
    const slots = [...sc.children]; if (!slots.length) return;
    const S = slots[0].offsetWidth || 1, pad = parseFloat(getComputedStyle(sc).paddingLeft) || 0;
    for (const sl of slots) {
      const d = (sl.offsetLeft - pad - sc.scrollLeft) / S, c = sl.firstChild; if (!c || c.style.transition === 'none') continue;
      const L = Math.max(0, -d), C = c.offsetWidth || S;
      // 左边的：压在下面、移动得慢（视差）；右边的：往右挪开，只在屏幕右侧露出一截，滑过来时盖到当前卡片上
      c.style.setProperty('--tx', (d < 0 ? L * S * 0.42 : Math.min(d, 1.5) * (C - S)).toFixed(1) + 'px');
      c.style.setProperty('--sc', (1 - Math.min(0.1, L * 0.045)).toFixed(3));
      c.style.setProperty('--dim', Math.min(0.35, L * 0.16).toFixed(3));
    }
  },
  open() {
    if (this.isOpen()) return this.close();
    document.body.classList.remove('drawer'); if (Dock.mOpen) { Dock.mOpen = false; UI.layout(); }
    try { document.activeElement?.blur?.(); } catch {}
    UI.saveScroll?.();
    const sc = h('div', { class: 'tsw-s', onscroll: () => {
      cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.paint());
      clearTimeout(this.wT); this.wT = setTimeout(() => this.el && Warm.near(Warm.around(this.centerKey(), 3)), 120);
    } }, ...Tabs.list.map(t => this.card(t)));
    const el = h('div', { class: 'tsw', role: 'dialog', 'aria-label': '已打开的窗口' },
      h('div', { class: 'tsw-h' }, h('span', { class: 'tsw-cnt' }), h('span', { class: 'grow' }), h('button', { class: 'tsw-done', type: 'button', onclick: () => this.close() }, '完成')),
      sc,
      h('div', { class: 'tsw-f' },
        h('span', { class: 'dim tsw-tip' }, '上滑卡片关闭 · 点卡片切换'),
        h('button', { class: 'tsw-new', type: 'button', onclick: () => { this.close(); Tabs.newChat(); } }, icon('plus'), '新对话')));
    el.addEventListener('click', e => { if (e.target === el || e.target === sc) this.close(); });
    document.body.append(el); this.el = el; this.count();
    // 当前窗口居中
    const i = Math.max(0, Tabs.list.findIndex(t => t.key === Tabs.active));
    const S = sc.firstChild?.offsetWidth || 0; sc.scrollLeft = i * S;
    this.paint();
    requestAnimationFrame(() => el.classList.add('in'));
    // 所有窗口的内容：当前 → 两边由近到远依次载入（本地缓存秒出，服务器最新内容随后替换）
    this.offChat?.(); this.offChat = Bus.on('chat', c => this.onChat(c));
    Warm.near(Warm.around(Tabs.active));
  },
  close() {
    const el = this.el; if (!el) return; this.el = null;
    this.offChat?.(); this.offChat = null; for (const t of this.pvT?.values() || []) clearTimeout(t); this.pvT?.clear();
    el.classList.remove('in'); el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  },
};
// ---------- 横向画卷：相邻窗口是真正的页 ----------
// #body 里：#view（当前页，z-index 2，不透明）+ 左右相邻窗口各一个 .pane（和 showTab 完全相同的代码搭出来，inert，停在 #view 正下方）。
// 停在可见区域里（只是被盖住）是关键：页里 content-visibility 的消息才会按真实高度排好并记住，滑进来时不会再排版、不会跳。
const Pager = {
  panes: new Map(),
  on() { return isMob() && !!$('#body'); },
  nbrs() { const L = Tabs.list, i = L.findIndex(t => t.key === Tabs.active); return i < 0 ? [] : [L[i - 1], L[i + 1]].filter(Boolean); },
  mk(t) {
    const body = $('#body'); if (!body) return null;
    // 不用 inert / pointer-events:none：它们是继承属性，每次换角色都会让两整页全部重算样式（滑到位那一下卡）。
    // 停着的相邻页完全被不透明的 #view 盖住，本来就点不到；只标 aria-hidden 给读屏。
    const el = h('div', { class: 'pane', 'aria-hidden': 'true' });
    const P = { key: t.key, sid: t.sid || null, kind: t.kind || '', el, els: null, cache: null, stick: true, paintQ: null, dirty: false, ph: false };
    body.insertBefore(el, $('#view'));
    if (t.kind) {
      // 抽卡 / 排行页是单例，没法预搭：只放一个带标题的占位页，滑过去后再正常渲染
      el.append(h('div', { class: 'chead' }, h('div', { class: 'chead-t' }, t.kind === 'power' ? '推理分排行' : '抽卡')), h('div', { class: 'scroller' }));
      try { Palette.paintPage(el, t); } catch {}
      P.ph = true;
    } else {
      try { UI.withPane(P, () => UI.fillView(t, el, false, true)); } catch (e) { console.warn('[pager]', e); }
    }
    this.panes.set(t.key, P);
    return P;
  },
  get(t, build) { if (!t) return null; let P = this.panes.get(t.key); if (P && !this.valid(P, t)) { this.drop(t.key); P = null; } if (!P && build && this.on()) P = this.mk(t); return P || null; },
  valid(P, t) { return P.el.isConnected && (P.sid || null) === (t.sid || null) && (P.kind || '') === (t.kind || ''); },
  ensure() {
    this.eT = 0;
    if(document.hidden)return;
    if (!this.on()) { this.clear(); return; }
    if (Mob.busy()) { this.ensureSoon(200); return; }
    const want = this.nbrs(), keys = new Set(want.map(t => t.key));
    for (const k of [...this.panes.keys()]) if (!keys.has(k)) this.drop(k);
    for (const t of want) this.get(t, true);
  },
  ensureSoon(ms = 120) { if (this.eT) return; this.eT = setTimeout(() => this.ensure(), ms); },
  drop(k) { const P = this.panes.get(k); if (!P) return; this.panes.delete(k); try { P.resizeObserver?.disconnect();P.el.remove(); } catch {} },
  clear() { for (const k of [...this.panes.keys()]) this.drop(k); },
  // 当前页退成相邻页（保留它的全部状态：节点、滚动位置、展开状态、输入框）
  demote() {
    const cur = UI.pane, el = cur.el; if (!el || !cur.key) return null;
    el.removeAttribute('id'); el.classList.add('pane'); el.classList.remove('swin-l', 'swin-r'); el.setAttribute('aria-hidden', 'true');
    el.style.transition = ''; el.style.transform = '';
    const t = Tabs.list.find(x => x.key === cur.key);
    cur.sid = t?.sid || null; cur.kind = t?.kind || ''; cur.dirty = false;
    // 抽卡 / 排行页是单例：退下来就拆掉（下次用占位页）
    if (cur.kind || !t) { try { el.remove(); } catch {} return null; }
    const sc = el.querySelector('.scroller'); if (sc) sc.style.overflowY = '';
    this.panes.set(cur.key, cur);
    return cur;
  },
  promote(P) {
    const el = P.el; this.panes.delete(P.key);
    el.classList.remove('pane', 'moving'); el.removeAttribute('aria-hidden'); el.id = 'view';
    el.style.transition = ''; el.style.transform = '';
    const sc = el.querySelector('.scroller'); if (sc) sc.style.overflowY = '';
    UI.pane = P;
  },
  // 切到 t：有搭好的页就只换角色
  adopt(t, kbWas) {
    const P = this.panes.get(t.key); if (!P) return false;
    if (!this.valid(P, t)) { this.drop(t.key); return false; }
    this.demote(); this.promote(P);
    if (t.kind !== 'gacha') GView.el = null;
    if (t.kind !== 'power') PView.el = null;
    if (P.ph) { P.ph = false; UI.fillView(t, P.el, kbWas); }
    else {
      const c = P.els?.chat;
      if (c) { UI.renderChat(c); if (!c.loaded && !c.loading) c.load().catch(() => {}); }
      else if (P.els) UI.syncComposer(null);
      P.dirty = false;
      if (P.els?.composer) UI.autoFocus(P.els.composer, kbWas);
    }
    try { KeepAlive.Pill.sync(); } catch {}
    this.ensureSoon();
    return true;
  },
  // 目标没有搭好的页（点标签跳到远处 / 新开窗口）：当前页如果和目标相邻就留在旁边，给目标新建一个 #view
  shelve(t) {
    const cur = UI.pane; if (!cur.el || !cur.key || cur.key === t.key) return null;
    const L = Tabs.list, i = L.findIndex(x => x.key === t.key), j = L.findIndex(x => x.key === cur.key);
    if (i < 0 || j < 0 || Math.abs(i - j) !== 1 || L[j].kind) return null;
    const old = cur.el;
    if (!this.demote()) return null;
    const el = h('div', { id: 'view' }); old.after(el);
    UI.pane = { key: t.key, el, els: null, cache: null, stick: true, paintQ: null, dirty: false };
    return el;
  },
  // 相邻窗口的对话有变化（后台还在回复 / 别的设备发了消息）：节流刷新那一页；拖动中不刷，松手后补
  dirty(c) {
    let hit = false; for (const P of this.panes.values()) if (P.els?.chat === c) { P.dirty = true; hit = true; }
    if (hit && !document.hidden && !this.dT) this.dT = setTimeout(() => this.flushDirty(), 1000);   // 相邻页（常常是一个很长、还在跑的对话）1 秒最多重画一次，别占住手机主线程
  },
  flushDirty() {
    this.dT = 0;
    if(document.hidden)return;
    if (Mob.busy()) { this.dT = setTimeout(() => this.flushDirty(), 300); return; }
    for (const P of this.panes.values()) if (P.dirty) this.paint(P);
  },
  paint(P) { if(document.hidden){P.dirty=true;return;}P.dirty = false; const c = P.els?.chat; if (!c) return; try { UI.withPane(P, () => UI.renderChat(c)); } catch (e) { console.warn('[pager]', e); } },
};

// 手机端：设置 / 模型信息里过长的说明默认收成两行，点说明文字展开 / 收起（不会误触旁边的开关）
document.addEventListener('click', e => {
  if (!document.body.classList.contains('m')) return;
  const s = e.target.closest?.('.set small, .dk-set small'); if (!s) return;
  if (s.classList.contains('x') || s.scrollHeight > s.clientHeight + 2) { e.preventDefault(); e.stopPropagation(); s.classList.toggle('x'); }
}, true);
// 手机：工作区浮层的下边缘停在输入框上方（打字时键盘弹起也一样），输入框永远在最前、不被遮住
const MobFit = {
  t: 0,
  measure() {
    if (!isMob()) return;
    const cs = [...document.querySelectorAll('.composer')].filter(c => c.offsetParent && c.getBoundingClientRect().height > 0);
    const c = cs.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    const vh = window.visualViewport ? visualViewport.height + visualViewport.offsetTop : innerHeight;
    const gap = c ? Math.max(0, Math.round(vh - c.getBoundingClientRect().top)) : 0;
    const v = gap ? gap + 'px' : '';
    if (document.body.style.getPropertyValue('--compgap') !== v) { if (v) document.body.style.setProperty('--compgap', v); else document.body.style.removeProperty('--compgap'); }
  },
  init() {
    if (this.t) return;
    const run = () => { if (!isMob()) return; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.measure()); };
    addEventListener('resize', run); window.visualViewport?.addEventListener('resize', run); window.visualViewport?.addEventListener('scroll', run);
    document.addEventListener('focusin', () => { if (isMob()) setTimeout(run, 60); }); document.addEventListener('focusout', () => { if (isMob()) setTimeout(run, 120); });
    try { new ResizeObserver(run).observe(document.body); } catch {}
    this.t = setInterval(() => { if (isMob() && !document.body.classList.contains('ws-off')) this.measure(); }, 700);
    run();
  },
};
