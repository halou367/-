Object.assign(ICON, { edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', term: '<path d="M5 7l5 5-5 5M12 17h7"/>', attach: '<path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>' });
// Vertical wheel selector widget for composer toolbar actions
const Revolver = (() => {
  const REV_H = 46;
  const vars = () => document.documentElement.dataset.theme === 'dark'
    ? '--rv-card:#34322e;--rv-win:#4b4740;--rv-fg:#ecebe7;--rv-line:#ffffff14;--rv-acc:#d8d3ca;--rv-mut:#a9a59d'
    : '--rv-card:#fffdf9;--rv-win:#e6ddd0;--rv-fg:#262522;--rv-line:#0000000f;--rv-acc:#6a5e54;--rv-mut:#7a746b';
  // 账号菜单里其他账号的按钮：左轮改的是那个账号自己的目标厂商
  const aid = b => b?.dataset?.acct && b.dataset.cur !== '1' ? b.dataset.acct : null;
  function items(b) {
    const s = Gacha.settings(aid(b)), out = [{ id: '', name: '不限', icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg>' }];
    for (const v of Gacha.VENDORS) out.push({ id: v.id, name: v.name, icon: VIcon.html(v.id, 16) });
    if (s.customKeyword) out.push({ id: 'custom', kw: s.customKeyword, name: s.customKeyword, icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h10M4 17h7"/></svg>' });
    return out;
  }
  const running = b => aid(b) ? !!GPop.acctState(aid(b), false).busy : Gacha.busy();
  function build(b, hint) {
    const list = items(b), curId = Gacha.settings(aid(b)).vendor || '', cur = Math.max(0, list.findIndex(it => it.id === curId));
    const root = document.createElement('div'); root.className = 'rv'; root.style.cssText = vars();
    root.innerHTML = '<div class="rv-win"></div><div class="rv-drum"></div><div class="rv-hint"></div>';
    root.querySelector('.rv-hint').textContent = hint;
    const drum = root.querySelector('.rv-drum');
    const els = list.map((it, i) => { const d = document.createElement('div'); d.className = 'rv-it' + (i === cur ? ' cur' : ''); d.innerHTML = '<span class="rv-ic">' + it.icon + '</span><span class="rv-nm"></span><span class="rv-ck">当前</span>'; d.querySelector('.rv-nm').textContent = it.name; drum.append(d); return d; });
    document.body.append(root);
    const r = b.getBoundingClientRect(), W = 200, H = REV_H * 5;
    root.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)) + 'px';
    root.style.top = Math.max(8, r.top - H - 14) + 'px';
    b.setAttribute('data-rv', ''); b._rv = true;
    const n = els.length, wrap = k => ((k % n) + n) % n;
    let shown = -1;
    const paint = pos => {
      els.forEach((d, i) => {
        const off = ((((i - pos) % n) + n + n / 2) % n) - n / 2, a = Math.abs(off);
        // 弹巢：卡片绕水平轴排成圆柱，离中心越远越倾斜、越小、越淡
        d.style.transform = 'translateY(' + (off * REV_H * 0.92) + 'px) rotateX(' + (-off * 24) + 'deg) translateZ(' + (-a * a * 6) + 'px) scale(' + Math.max(.72, 1 - a * .07) + ')';
        d.style.opacity = String(Math.max(0, 1 - a * .3)); d.style.zIndex = String(100 - Math.round(a * 10));
      });
      const k = wrap(Math.round(pos)); if (k !== shown) { if (shown >= 0) try { navigator.vibrate?.(6); } catch {} shown = k; els.forEach((d, i) => d.classList.toggle('sel', i === k)); }
    };
    requestAnimationFrame(() => root.classList.add('on'));
    const close = (from, kr, pick) => {
      let pos = from; const t0 = performance.now();
      const snap = t => { const p = Math.min(1, (t - t0) / 160); pos = from + (kr - from) * (1 - Math.pow(1 - p, 3)); paint(pos); if (p < 1) requestAnimationFrame(snap); }; requestAnimationFrame(snap);
      root.classList.add('out'); setTimeout(() => root.remove(), 420);
      b.removeAttribute('data-rv'); b._rv = false; b._wh = null; b._rvSkip = Date.now();
      if (pick) { const it = list[wrap(kr)]; if (it.id !== curId || it.id === 'custom') { if (it.id === 'custom') Gacha.setVendor('custom', it.kw, aid(b)); else Gacha.setVendor(it.id, '', aid(b)); if (b.classList.contains('gacct')) GPop.paintAcct(b, GPop.acctState(b.dataset.acct, b.dataset.cur === '1')); UI.renderList?.(); if (running(b)) toast('侧栏已按「' + it.name + '」排序 · 正在进行的抽卡目标不变（下次开始抽卡用新的）'); } }
    };
    return { list, cur, paint, close };
  }
  // 滚轮
  function wheelOpen(b) {
    const R = build(b, '滚轮选择 · 停下或移开确认');
    let pos = R.cur, target = R.cur, done = false, raf = 0, idleT = 0, acc = 0;
    R.paint(pos);
    const loop = () => { raf = 0; pos += (target - pos) * .3; if (Math.abs(target - pos) < .003) pos = target; R.paint(pos); if (pos !== target) raf = requestAnimationFrame(loop); };
    const finish = pick => {
      if (done) return; done = true; clearTimeout(idleT); cancelAnimationFrame(raf);
      b.removeEventListener('mouseleave', leave); b.removeEventListener('click', clk, true); removeEventListener('keydown', esc, true); removeEventListener('blur', away);
      R.close(pos, Math.round(target), pick);
    };
    const leave = () => finish(true);
    const clk = ev => { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); };
    const esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); } else if (ev.key === 'Enter') { ev.preventDefault(); finish(true); } };
    const away = () => finish(false);
    b.addEventListener('mouseleave', leave); b.addEventListener('click', clk, true); addEventListener('keydown', esc, true); addEventListener('blur', away);
    return {
      push(d) {
        if (done) return;
        // 普通鼠标一格 ≈ 100 → 转一张；触控板的细碎滚动累积到 60 再转一张
        if (Math.abs(d) >= 50) target += Math.sign(d); else { acc += d; if (Math.abs(acc) >= 60) { target += Math.sign(acc); acc = 0; } }
        if (!raf) raf = requestAnimationFrame(loop);
        clearTimeout(idleT); idleT = setTimeout(() => finish(true), 1200);
      },
    };
  }
  // 长按 / 上推 / 触屏滑动
  function dragOpen(b, pid, ev0, pre = 0) {
    const R = build(b, '上下推动 · 松开选中');
    let pos = R.cur, done = false; const startY = ev0.clientY + pre, startPos = pos;
    try { b.setPointerCapture(pid); } catch {}
    R.paint(pos);
    const move = ev => { if (ev.pointerId !== pid || done) return; ev.preventDefault(); pos = startPos + (startY - ev.clientY) / (REV_H * .92); R.paint(pos); };
    const finish = (ev, pick) => {
      if (ev && ev.pointerId !== pid) return; if (done) return; done = true;
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', cc, true); removeEventListener('keydown', esc, true); removeEventListener('blur', away);
      try { b.releasePointerCapture(pid); } catch {}
      R.close(pos, Math.round(pos), pick);
    };
    const up = ev => finish(ev, true), cc = ev => finish(ev, false), esc = ev => { if (ev.key === 'Escape') { ev.preventDefault(); finish(null, false); } }, away = () => finish(null, false);
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', cc, true); addEventListener('keydown', esc, true); addEventListener('blur', away);
  }
  function attach(b) {
    if (b._rvBound) return; b._rvBound = true;
    b.style.touchAction = 'none';
    b.addEventListener('contextmenu', e => { if (b._rv || b._rvT) e.preventDefault(); });
    b.addEventListener('wheel', e => {
      if (b.hasAttribute('data-cap') || !e.deltaY) return;   // 抽卡中也能换（只改侧栏排序，这一轮抽卡的目标不变）
      if (b._rv && !b._wh) return;
      e.preventDefault(); e.stopPropagation();
      GPop.close();
      const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      (b._wh ||= wheelOpen(b)).push(d);
    }, { passive: false });
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0 || b._rv || b.hasAttribute('data-cap')) return;
      const x0 = e.clientX, y0 = e.clientY, pid = e.pointerId, touch = e.pointerType !== 'mouse';
      const cancel = () => { clearTimeout(b._rvT); b._rvT = 0; removeEventListener('pointermove', early, true); removeEventListener('pointerup', cancel, true); removeEventListener('pointercancel', cancel, true); };
      const early = ev => { if (ev.pointerId !== pid) return; const dy = y0 - ev.clientY, dx = Math.abs(ev.clientX - x0); if (touch ? Math.abs(dy) > 8 && Math.abs(dy) > dx : dy > 12) { cancel(); GPop.close(); dragOpen(b, pid, ev, touch ? dy : 0); } else if (dx > (touch ? 24 : 14) || (!touch && ev.clientY - y0 > 14)) cancel(); };
      b._rvT = setTimeout(() => { cancel(); GPop.close(); dragOpen(b, pid, e); }, 350);
      addEventListener('pointermove', early, true); addEventListener('pointerup', cancel, true); addEventListener('pointercancel', cancel, true);
    });
  }
  return { attach };
})();
