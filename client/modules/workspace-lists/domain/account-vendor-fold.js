// Width-aware vendor chips. One real button per vendor; hidden suffix moves into More.
// One shared observer/frame batches reads before writes for all rendered account cards.
const AccountVendorFold = {
  serial: 0, entries: new Set(), observer: null, frame: 0, fontListener: null,
  fitCount(width, widths, moreWidth, gap = 5) {
    if (!widths.length) return 0;
    const total = widths.reduce((n, w) => n + w, 0) + gap * (widths.length - 1);
    if (total <= width) return widths.length;
    let used = 0, count = 0;
    for (const w of widths) { if (used + w + gap + moreWidth > width) break; used += w + gap; count++; }
    return count;
  },
  schedule() { if (!this.frame && this.entries.size) this.frame = requestAnimationFrame(() => this.flush()); },
  flush() {
    this.frame = 0;
    const live = [...this.entries].filter(e => e.row.isConnected);
    // Fresh nodes or a font change: temporarily put every button into the clipped one-line rail.
    for (const e of live) if (!e.widths) {
      e.focus = document.activeElement;
      for (const b of e.buttons) e.row.insertBefore(b, e.more);
      e.more.hidden = false; e.more.style.width = ''; e.more.textContent = '更多 ' + e.buttons.length;
    }
    const sizes = live.map(e => {
      if (!e.widths) {
        const width = b => Math.max(b.offsetWidth, Math.ceil(parseFloat(getComputedStyle(b).width) || 0));
        e.widths = e.buttons.map(width); e.moreWidth = width(e.more);
      }
      const gap = parseFloat(getComputedStyle(e.row).columnGap) || 0;
      return [e, this.fitCount(e.row.clientWidth, e.widths, e.moreWidth, gap)];
    });
    for (const [e, count] of sizes) this.apply(e, count);
  },
  apply(e, count) {
    const remaining = e.buttons.length - count;
    if (!remaining && e.expanded) { e.expanded = false; e.changed(false, false); }
    if (e.count === count && e.shown === e.expanded) return;
    const focused = e.focus || document.activeElement; e.focus = null;
    e.count = count; e.shown = e.expanded;
    patchKids(e.row, [...e.buttons.slice(0, count), e.more]); patchKids(e.panel, e.buttons.slice(count));
    e.more.hidden = !remaining; e.more.style.width = e.moreWidth + 'px';
    e.more.textContent = '更多 ' + remaining; e.more.setAttribute('aria-expanded', String(e.expanded));
    e.more.classList.toggle('on', e.buttons.slice(count).some(b => b.classList.contains('on')));
    e.more.title = e.expanded ? '收起其他厂商' : '展开其余 ' + remaining + ' 个厂商';
    e.panel.hidden = !remaining || !e.expanded;
    if (focused === e.more || e.buttons.includes(focused)) {
      const target = focused === e.more ? (remaining ? e.more : e.buttons.at(-1)) : focused.parentNode === e.row || e.expanded ? focused : e.more;
      target?.focus({ preventScroll: true });
    }
  },
  attach(row, buttons, more, panel, expanded, changed) {
    const e = { row, buttons, more, panel, expanded, changed, widths: null, count: -1, shown: null, focus: null };
    if (!this.observer) {
      this.observer = new ResizeObserver(() => this.schedule());
      this.fontListener = () => { for (const item of this.entries) { item.widths = null; item.count = -1; } this.schedule(); };
      document.fonts?.addEventListener?.('loadingdone', this.fontListener);
    }
    panel.id = 'acct-vendor-extra-' + (++this.serial); more.setAttribute('aria-controls', panel.id);
    this.entries.add(e); this.observer.observe(row); this.schedule();
    const toggle = value => { if (e.count < 0) { cancelAnimationFrame(this.frame); this.flush(); } e.expanded = value; changed(value, true); this.apply(e, e.count); };
    more.onclick = event => { event.preventDefault(); event.stopPropagation(); toggle(!e.expanded); };
    const key = event => { if (event.key === 'Escape' && e.expanded) { event.preventDefault(); event.stopPropagation(); toggle(false); more.focus({ preventScroll: true }); } };
    row.addEventListener('keydown', key); panel.addEventListener('keydown', key);
    let stopped = false;
    return { stop: () => {
      if (stopped) return; stopped = true;
      this.observer?.unobserve(row); this.entries.delete(e); row.removeEventListener('keydown', key); panel.removeEventListener('keydown', key); more.onclick = null;
      if (!this.entries.size) {
        this.observer?.disconnect(); this.observer = null; cancelAnimationFrame(this.frame); this.frame = 0;
        document.fonts?.removeEventListener?.('loadingdone', this.fontListener); this.fontListener = null;
      }
    } };
  },
};
