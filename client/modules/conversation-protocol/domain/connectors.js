// Connectors（和官方 Agent 模式一样的「连接其他应用」）：
//   目录 GET /api/connectors · 状态 GET /api/connectors/status · 同步 POST /api/connectors/sync
//   连接 POST /api/connectors/<slug>/link-token → Merge Agent Handler Link（ah-cdn.merge.dev/initialize.js）弹窗授权
//   断开 DELETE /api/connectors/<slug>
//   启用的连接器在发消息时带上 enabledConnectors（和官方一样）；启用列表和官方网页共用 localStorage「agent-enabled-connectors:<userId>」
const Connectors = {
  LINK_JS: 'https://ah-cdn.merge.dev/initialize.js',
  // 官方的推荐顺序（目录接口拿不到时也能显示这几个）
  FEATURED: [['github', 'GitHub', 'Work with repos, issues, and pull requests.'], ['google_drive', 'Drive', 'Find and manage files in Google Drive.'], ['google_docs', 'Docs', 'Create, read, and edit Google Docs.'], ['notion', 'Notion', 'Look up your documents.'], ['gmail', 'Gmail', 'Connect your email account.'], ['linear', 'Linear', 'Track issues, projects, and cycles.'], ['google_calendar', 'Calendar', 'Connect your Google Calendar.']],
  SHORT: { google_drive: 'Drive', google_docs: 'Docs', google_calendar: 'Calendar' },
  catalog: null, status: null, uid: null, busy: new Set(), err: '', at: 0, loading: null,
  key() { return this.uid ? 'agent-enabled-connectors:' + this.uid : null; },
  readStore() {
    const k = this.key(); let v = null;
    if (k) try { v = JSON.parse(localStorage.getItem(k) || 'null'); } catch {}
    if (!v || typeof v !== 'object') v = { enabledSlugs: Prefs.connOn || [], acknowledgedSlugs: [] };
    return { enabledSlugs: Array.isArray(v.enabledSlugs) ? v.enabledSlugs.filter(s => typeof s === 'string') : [], acknowledgedSlugs: Array.isArray(v.acknowledgedSlugs) ? v.acknowledgedSlugs.filter(s => typeof s === 'string') : [] };
  },
  writeStore(s) { const k = this.key(); if (k) try { localStorage.setItem(k, JSON.stringify(s)); } catch {} Prefs.connOn = s.enabledSlugs; savePrefs(); },
  authOf(slug) { return (this.status || []).find(x => x.slug === slug)?.authStatus || (this.catalog || []).find(x => x.slug === slug)?.authStatus || 'disconnected'; },
  connected(slug) { return this.authOf(slug) === 'connected'; },
  enabled(slug) { return this.readStore().enabledSlugs.includes(slug); },
  // 发消息时带的：已连接且已启用的
  active() { if (!this.status) return []; return this.readStore().enabledSlugs.filter(s => this.connected(s)); },
  setEnabled(slug, on) {
    const s = this.readStore(), set = new Set(s.enabledSlugs); on ? set.add(slug) : set.delete(slug);
    if (on && !s.acknowledgedSlugs.includes(slug)) s.acknowledgedSlugs.push(slug);
    s.enabledSlugs = [...set]; this.writeStore(s); this.paint();
  },
  label(slug) { const c = (this.catalog || []).find(x => x.slug === slug); return this.SHORT[slug] || c?.displayName || (this.FEATURED.find(f => f[0] === slug) || [])[1] || slug; },
  list() {
    const cat = this.catalog?.length ? this.catalog : this.FEATURED.map(([slug, n, d]) => ({ slug, displayName: n, description: d, authStatus: this.authOf(slug) }));
    const order = this.FEATURED.map(f => f[0]);
    return [...cat].sort((a, b) => ((order.indexOf(a.slug) + 1) || 99) - ((order.indexOf(b.slug) + 1) || 99));
  },
  async j(path, opt) { const r = await api(path, { timeout: 20000, ...opt }); return r && typeof r === 'object' ? r : {}; },
  async refresh(force) {
    if (this.loading) return this.loading;
    if (!force && this.at && now() - this.at < 300000) return;
    if (typeof UI !== 'undefined' && !UI.authed) return;   // 没登录不读
    this.loading = (async () => {
      try {
        this.uid = (typeof UI !== 'undefined' && (UI.me?.id || UI.me?.user?.id)) || this.uid;   // 用已登录的用户信息，不额外请求 /api/me
        const [cat, st] = await Promise.allSettled([this.j('/api/connectors'), this.j('/api/connectors/status')]);
        if (cat.status === 'fulfilled' && Array.isArray(cat.value.connectors)) this.catalog = cat.value.connectors.filter(c => c && typeof c.slug === 'string');
        if (st.status === 'fulfilled' && Array.isArray(st.value.connectors)) this.status = st.value.connectors;
        this.err = cat.status === 'rejected' && st.status === 'rejected' ? describe(cat.reason) : ''; this.at = now();
      } finally { this.loading = null; this.paint(); }
    })();
    return this.loading;
  },
  async sync() { try { const r = await this.j('/api/connectors/sync', { method: 'POST' }); if (Array.isArray(r.connectors)) this.status = r.connectors; } catch { await this.refresh(true); } this.paint(); },
  loadLink() {
    if (window.AgentHandlerLink) return Promise.resolve();
    if (this.linkP) return this.linkP;
    this.linkP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = this.LINK_JS; s.async = true;
      s.onload = () => window.AgentHandlerLink ? res() : rej(Error('授权组件没有加载成功'));
      s.onerror = () => { s.remove(); rej(Error('授权组件加载失败（ah-cdn.merge.dev 连不上，检查代理）')); };
      document.head.append(s);
    }).finally(() => { if (!window.AgentHandlerLink) this.linkP = null; });
    return this.linkP;
  },
  async connect(slug) {
    if (this.busy.has(slug)) return; this.busy.add(slug); this.paint();
    let finished = false;
    const end = async ok => {
      if (finished) return; finished = true;
      if (ok) { await this.sync(); if (this.connected(slug)) { this.setEnabled(slug, true); toast(this.label(slug) + ' 已连接，在对话里提到「' + this.label(slug) + '」就能用'); } else toast(this.label(slug) + ' 没有连接成功', 'err'); }
      else this.sync().catch(() => {});
      this.busy.delete(slug); this.paint();
    };
    try {
      const r = await this.j('/api/connectors/' + encodeURIComponent(slug) + '/link-token', { method: 'POST' });
      if (!r.linkToken) throw Error('服务器没有返回授权链接');
      await this.loadLink();
      const cfg = { linkToken: r.linkToken, onSuccess: () => void end(true), onExit: () => void end(false), onValidationError: () => {} };
      window.AgentHandlerLink.initialize({ ...cfg, onReady: () => { try { window.AgentHandlerLink.openLink(cfg); } catch (e) { toast('打开授权窗口失败：' + describe(e), 'err'); void end(false); } } });
    } catch (e) { toast('连接 ' + this.label(slug) + ' 失败：' + describe(e), 'err'); this.busy.delete(slug); this.paint(); }
  },
  async disconnect(slug) {
    this.busy.add(slug); this.paint();
    try { await this.j('/api/connectors/' + encodeURIComponent(slug), { method: 'DELETE' }); this.setEnabled(slug, false); await this.refresh(true); toast('已断开 ' + this.label(slug)); }
    catch (e) { toast('断开失败：' + describe(e), 'err'); }
    finally { this.busy.delete(slug); this.paint(); }
  },
  logo(c, size = 18) {
    const box = h('span', { class: 'cn-logo', style: { width: size + 'px', height: size + 'px' } });
    if (c.logoUrl) { const img = h('img', { src: c.logoUrl, alt: '', width: size, height: size, referrerpolicy: 'no-referrer' }); img.onerror = () => { img.remove(); box.textContent = (this.label(c.slug)[0] || '?').toUpperCase(); }; box.append(img); }
    else box.textContent = (this.label(c.slug)[0] || '?').toUpperCase();
    return box;
  },
  // 工作区底部的 Connectors 卡片：已连接的列出来，右侧开关 = 本对话发消息时是否启用
  card() {
    const el = h('section', { class: 'cn-card' });
    this.cardEl = el; this.fillCard(el);
    if (!this.at && !this.loading) void this.refresh();
    return el;
  },
  fillCard(el) {
    const on = this.list().filter(c => this.connected(c.slug));
    const head = h('div', { class: 'cn-h' }, h('b', {}, 'Connectors'), h('span', { class: 'grow' }),
      h('button', { class: 'ib xs', title: '添加连接（GitHub / Drive / Docs / Notion / Gmail / Linear / Calendar…）', onclick: () => this.open() }, icon('plus')));
    const rows = on.map(c => h('label', { class: 'cn-row', title: c.description || '' }, this.logo(c, 16), h('span', { class: 'cn-n' }, this.label(c.slug)),
      h('input', { type: 'checkbox', class: 'sw sm', role: 'switch', checked: this.enabled(c.slug) || null, 'aria-label': '在对话里启用 ' + this.label(c.slug), onchange: e => this.setEnabled(c.slug, e.target.checked) })));
    el.replaceChildren(head, ...(rows.length ? [h('div', { class: 'cn-list' }, ...rows)] : []));
  },
  paint() {
    if (this.cardEl?.isConnected) this.fillCard(this.cardEl);
    if (this.dlgBox?.isConnected) this.fillDialog(this.dlgBox);
  },
  open() {
    void this.refresh(true);
    void Dialog.open((box, done) => { box.classList.add('cn-dlg'); this.dlgBox = box; this.dlgDone = done; this.fillDialog(box); });
  },
  fillDialog(box) {
    const done = this.dlgDone;
    const items = this.list().map(c => {
      const st = this.authOf(c.slug), busy = this.busy.has(c.slug), unusable = st === 'unusable', conn = st === 'connected';
      const act = busy ? h('i', { class: 'spin' })
        : conn ? h('span', { class: 'cn-acts' },
          h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: this.enabled(c.slug) || null, title: '在对话里启用', onchange: e => this.setEnabled(c.slug, e.target.checked) }),
          h('button', { class: 'ib xs', title: '断开连接', onclick: () => this.disconnect(c.slug) }, icon('x')))
        : unusable ? h('span', { class: 'cn-un' }, '不可用') : h('span', { class: 'cn-plus' }, icon('plus'));
      const row = h(conn || unusable || busy ? 'div' : 'button', { class: 'cn-item' + (unusable ? ' off' : '') + (conn ? ' on' : ''), title: unusable ? '这个连接器暂时不能用' : conn ? '' : '连接 ' + this.label(c.slug), onclick: conn || unusable || busy ? null : () => this.connect(c.slug) },
        this.logo(c, 22), h('span', { class: 'cn-t' }, h('b', {}, this.label(c.slug)), h('small', {}, c.description || '')), act);
      return row;
    });
    box.replaceChildren(...[h('div', { class: 'cn-dh' }, h('div', { class: 'dlg-t' }, 'Connectors'), h('span', { class: 'grow' }), h('button', { class: 'ib', title: '关闭', onclick: () => { this.dlgBox = null; done?.(null); } }, icon('x'))),
      this.err ? h('p', { class: 'note' }, '读取失败：' + this.err) : null,
      this.loading && !this.catalog ? h('p', { class: 'note' }, h('i', { class: 'spin' }), ' 读取中…') : null,
      h('div', { class: 'cn-items' }, ...items),
      h('p', { class: 'note cn-foot' }, '授权在 Merge（官方使用的连接服务）的弹窗里完成；连接后打开开关，在对话里提到应用名就能用。')].filter(Boolean));
  }
};
