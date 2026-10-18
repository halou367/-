// Startup account verification is separate from transport health. Cached chats stay usable.
const SessionGate = {
  active: null,
  async check({ early = false } = {}) {
    let bar = null, gate = null, state, lastText = '', browseRequested = false, modalShown = false;
    const retry = h('button', { type: 'button', class: 'link', onclick: () => checker.wake(true) }, '立即重试');
    const browse = h('button', { type: 'button', class: 'link', title: '免登录直接进入查阅模式，浏览和导出本账号缓存在本地的历史对话', onclick: () => { browseRequested = true; window.__BRANA_BROWSE_MODE = true; checker.cancel(); } }, '查阅模式');
    const manual = h('button', { type: 'button', class: 'link', onclick: () => {
      if (state?.phase === 'offline' && !state?.challenge && !window.__routeFixture && !window.__fixture && typeof RegionIP !== 'undefined') {
        browseRequested = true; window.__BRANA_BROWSE_MODE = true;
        try { UI.enterBrowseMode?.(); } catch {}
        try { RegionIP.open({ offlineAlert: true }); } catch {}
        checker.cancel();
        return;
      }
      checker.cancel();
    } }, '登录 / 线路');
    const text = h('span', { class: 'grow' }), spinner = h('i', { class: 'spin', 'aria-hidden': 'true' });
    const paint = () => {
      if (!state) return;
      const shown = navigator.onLine === false && !NetHealth.recent() && state.phase !== 'done' ? { ...state, phase: 'offline' } : state;
      const info = NetPolicy.notice(shown, NetHealth, early);
      if (!info) { bar?.remove(); bar = null; return; }
      if (info.text !== lastText) { text.textContent = info.text; text.title = info.text; lastText = info.text; }
      spinner.hidden = !info.busy; retry.disabled = !info.retry;
      retry.textContent = info.busy ? '核对中' : '立即重试';
      if (shown.phase === 'offline' && !shown.challenge && !modalShown && !window.__routeFixture && !window.__fixture) {
        modalShown = true;
        try {
          if (!early && typeof UI !== 'undefined' && typeof UI.enterBrowseMode === 'function') {
            gate = null;
            UI.enterBrowseMode();
          }
        } catch {}
        try { if (typeof RegionIP !== 'undefined' && !RegionIP.view) RegionIP.open({ offlineAlert: true }); } catch {}
        try { if (typeof AutoRoute !== 'undefined') void AutoRoute.request('network'); } catch {}
      }
      if (early || window.__BRANA_BROWSE_MODE) {
        if (!bar) { bar = h('div', { class: 'connbar', role: 'status', 'aria-live': 'polite' }, spinner, text, retry, browse, manual); document.body.append(bar); }
      } else if (!gate) {
        gate = h('div', { class: 'scroller' }, h('div', { class: 'gate' }, h('div', { class: 'lform' },
          h('div', { class: 'hero-t' }, '正在连接 Brana…'), h('div', { class: 'lsub', role: 'status' }, spinner, text),
          h('div', { class: 'lsub' }, '账号、密码和本地对话都保留，核对完成后自动进入；也可点「查阅模式」免登录浏览本地对话。'),
          h('div', { class: 'row' }, retry, browse, manual))));
        $('#view').replaceChildren(gate); UI.shown();
      }
    };
    const checker = new NetPolicy.SessionCheck({
      read: signal => api('/api/me', { noRelogin: true, timeout: NetPolicy.SESSION_MS, signal }),
      online: () => navigator.onLine !== false || NetHealth.recent(),
      changed: next => { state = next; paint(); },
    });
    this.active = checker;
    const wake = () => { if (!document.hidden) checker.wake(); paint(); };
    const online = () => { checker.wake(); paint(); };
    const offHealth = Bus.on('connection', () => { paint(); if (NetHealth.recent()) checker.wake(); });
    const offRoute = Bus.on('route-state', () => { if (!AutoRoute.busy && AutoRoute.lastChanged) checker.wake(); });
    addEventListener('online', online); addEventListener('offline', paint); addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    const tick = setInterval(paint, 1000);
    try { const res = await checker.run(); return browseRequested ? { ...res, browse: true } : res; }
    finally {
      clearInterval(tick); offHealth(); offRoute(); bar?.remove();
      removeEventListener('online', online); removeEventListener('offline', paint); removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      if (this.active === checker) this.active = null;
    }
  },
};
