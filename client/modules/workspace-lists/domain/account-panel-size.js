// Desktop-only account panel geometry. The left/bottom anchor never follows a resize drag.
// Persist dimensions, not screen coordinates; small viewports clamp without destroying preferences.
const AccountPanelSize = {
  key: 'account-panel-size-v1',
  defaults: { width: 384, height: 650 },
  dimensions(value) {
    return { width: Number.isFinite(value?.width) && value.width > 0 ? value.width : this.defaults.width,
      height: Number.isFinite(value?.height) && value.height > 0 ? value.height : this.defaults.height };
  },
  fit(value, anchor, viewport) {
    const size = { width: Number.isFinite(value?.width) ? value.width : this.defaults.width, height: Number.isFinite(value?.height) ? value.height : this.defaults.height }, vw = Math.max(17, viewport.width), vh = Math.max(17, viewport.height);
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const left = clamp(anchor.left, 8, Math.max(8, vw - 8 - Math.min(320, vw - 16)));
    const bottom = clamp(anchor.bottom, 8, Math.max(8, vh - 8 - Math.min(360, vh - 16)));
    const maxWidth = Math.max(1, vw - left - 8), maxHeight = Math.max(1, vh - bottom - 8);
    return { left, bottom, width: clamp(size.width, Math.min(320, maxWidth), maxWidth),
      height: clamp(size.height, Math.min(360, maxHeight), maxHeight), maxWidth, maxHeight };
  },
  drag(start, edge, dx, dy) {
    return { width: start.width + (edge.includes('e') ? dx : 0), height: start.height - (edge.includes('n') ? dy : 0) };
  },
  attach(root) {
    if (isMob()) return () => {};
    const rect = root.getBoundingClientRect(), anchor = { left: rect.left, bottom: innerHeight - rect.bottom };
    let preferred = this.dimensions(Store.get(this.key, { width: rect.width, height: rect.height }));
    preferred = { width: preferred.width, height: 1e6 };   // 宽度按记忆；高度每次按当前窗口尽可能展开
    let frame = 0, saveTimer = 0, drag = null, dead = false;
    const controller = new AbortController(), signal = controller.signal;
    const geometry = value => this.fit(value, anchor, { width: innerWidth, height: innerHeight });
    const handles = ['n', 'e', 'ne'].map(edge => {
      const title = edge === 'n' ? '拖动上边调整高度' : edge === 'e' ? '拖动右边调整宽度' : '拖动右上角调整大小';
      return h('div', { class: 'acct-resize acct-resize-' + edge, 'data-edge': edge, tabindex: '0', role: edge === 'ne' ? 'button' : 'separator',
        'aria-label': title, ...(edge === 'ne' ? {} : { 'aria-orientation': edge === 'n' ? 'horizontal' : 'vertical' }), title: title + '；方向键微调，双击恢复默认尺寸' });
    });
    const paint = () => {
      frame = 0; if (dead || !root.isConnected) return;
      const g = geometry(preferred);
      Object.assign(root.style, { top: 'auto', left: g.left + 'px', bottom: g.bottom + 'px', width: g.width + 'px', height: g.height + 'px' });
      for (const handle of handles) {
        const edge = handle.dataset.edge;
        if (edge === 'ne') continue;
        const height = edge === 'n', max = height ? g.maxHeight : g.maxWidth;
        handle.setAttribute('aria-valuemin', String(Math.min(height ? 360 : 320, max)));
        handle.setAttribute('aria-valuemax', String(Math.round(max)));
        handle.setAttribute('aria-valuenow', String(Math.round(height ? g.height : g.width)));
      }
    };
    const schedule = () => { if (!dead && !frame) frame = requestAnimationFrame(paint); };
    const save = () => { clearTimeout(saveTimer); saveTimer = 0; Store.set(this.key, { ...preferred }); };
    const fitPreferred = (value, edge = 'ne') => { const g = geometry(value); preferred = { width: edge.includes('e') ? g.width : preferred.width, height: edge.includes('n') ? g.height : preferred.height }; };
    const finish = commit => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!commit) preferred = d.before;
      root.classList.remove('acct-resizing'); document.body.classList.remove('acct-size-drag');
      if (d.cursor) document.body.style.setProperty('cursor', d.cursor, d.priority); else document.body.style.removeProperty('cursor');
      try { if (d.handle.hasPointerCapture(d.id)) d.handle.releasePointerCapture(d.id); } catch {}
      if (commit) save(); schedule();
    };
    for (const handle of handles) {
      const edge = handle.dataset.edge;
      handle.addEventListener('pointerdown', e => {
        if (dead || drag || e.button !== 0 || e.isPrimary === false) return;
        e.preventDefault(); e.stopPropagation(); if (saveTimer) save();
        const g = geometry(preferred);
        drag = { id: e.pointerId, edge, x: e.clientX, y: e.clientY, start: g, before: { ...preferred }, handle,
          cursor: document.body.style.getPropertyValue('cursor'), priority: document.body.style.getPropertyPriority('cursor') };
        root.classList.add('acct-resizing'); document.body.classList.add('acct-size-drag');
        document.body.style.cursor = edge === 'n' ? 'ns-resize' : edge === 'e' ? 'ew-resize' : 'nesw-resize';
        try { handle.setPointerCapture(e.pointerId); } catch {}
      }, { signal });
      handle.addEventListener('lostpointercapture', () => finish(false), { signal });
      handle.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); }, { signal });
      handle.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation(); finish(false);
        const value = { ...preferred }; if (edge.includes('e')) value.width = this.defaults.width; if (edge.includes('n')) value.height = this.defaults.height;
        fitPreferred(value, edge); save(); schedule();
      }, { signal });
      handle.addEventListener('keydown', e => {
        if (drag || e.altKey || e.ctrlKey || e.metaKey) return;
        const step = e.shiftKey ? 64 : 16, size = geometry(preferred); let value = null;
        if (edge.includes('n') && ['ArrowUp', 'ArrowDown'].includes(e.key)) value = this.drag(size, 'n', 0, e.key === 'ArrowUp' ? -step : step);
        if (edge.includes('e') && ['ArrowLeft', 'ArrowRight'].includes(e.key)) value = this.drag(size, 'e', e.key === 'ArrowRight' ? step : -step, 0);
        if (!value) return;
        e.preventDefault(); e.stopPropagation(); fitPreferred(value, ['ArrowUp', 'ArrowDown'].includes(e.key) ? 'n' : 'e'); schedule(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
      }, { signal });
    }
    const move = e => {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault(); fitPreferred(this.drag(drag.start, drag.edge, e.clientX - drag.x, e.clientY - drag.y), drag.edge); schedule();
    };
    window.addEventListener('pointermove', move, { capture: true, passive: false, signal });
    window.addEventListener('pointerup', e => {
      if (drag && e.pointerId === drag.id) { move(e); e.stopPropagation(); finish(true); }
    }, { capture: true, signal });
    window.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) finish(false); }, { capture: true, signal });
    window.addEventListener('keydown', e => { if (drag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } }, { capture: true, signal });
    window.addEventListener('blur', () => finish(false), { signal });
    window.addEventListener('resize', () => { finish(false); schedule(); }, { signal });
    const stop = () => {
      if (dead) return;
      finish(false); if (saveTimer) save(); dead = true; cancelAnimationFrame(frame); clearTimeout(saveTimer);
      controller.abort(); observer.disconnect(); handles.forEach(x => x.remove());
    };
    const observer = new MutationObserver(() => { if (!root.isConnected) stop(); });
    observer.observe(root.parentNode || document.body, { childList: true });
    root.append(...handles); paint(); return stop;
  },
};
