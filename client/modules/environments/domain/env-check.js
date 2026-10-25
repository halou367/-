// ---------- 进入账号自检（手机 + 电脑）：先保联通，再看纯净度；自动、无感 ----------
// 打开账号窗口 / 从选账号页进入 / 后台切回来超过 10 分钟：
//   ① 联通 = 节点：原生内核测当前节点 generate_204（约 1 秒），同时后台并发测所有节点。不经 WebView，
//      所以页面里长连接多时不会误报「超时」。当前节点通就算联通，不切换。
//   ② 不通：按测速结果从最快的节点开始试，换上第一个通过 Brana 检测的（不弹确认），然后自动刷新环境。
//   ③ 纯净度：出口 IP 的评分；只有高风险才自动换同地区纯净 ProxyIP，「一般」只提示（后台最多半小时换一次）。
//   很快就闪一下结果；慢了才展开胶囊动画。只在客户端页面里跑；浏览器模式 / 官网页面不发请求。
const EnvCheck = {
  run: 0, el: null, last: { key: '', at: 0, ok: false }, tag: '', hiddenAt: 0, inited: false,
  key(a) { return a ? [a.id, a.proxy || '', a.proxyIp || '', a.nodeId || ''].join('|') : ''; },
  loadLast() {
    if (this.last?.at) return this.last;
    try {
      const s = JSON.parse(sessionStorage.getItem('anc:envcheck-last') || 'null') || Store.get('envcheck:last', null);
      if (s && typeof s === 'object' && s.key) this.last = s;
    } catch {}
    return this.last;
  },
  saveLast(v) {
    this.last = v;
    try { sessionStorage.setItem('anc:envcheck-last', JSON.stringify(v)); Store.set('envcheck:last', v); } catch {}
  },
  busy() { return !!this.el && !this.el.classList.contains('done') && !this.el.classList.contains('out'); },
  init() {
    if (this.inited) return; this.inited = true;
    // 后台放了很久再切回来（手机锁屏、电脑最小化）：网络可能早就变了，悄悄再测一次
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.hiddenAt = now(); return; }
      if (this.hiddenAt && now() - this.hiddenAt > 10 * 60e3) void this.go({ reason: 'resume', failover: true });
      this.hiddenAt = 0;
    });
  },
  // ---- 顶部小胶囊（后台自动自检默认静默，不弹出悬浮胶囊遮挡界面） ----
  chip(silent = true) {
    this.el?.remove();
    const ring = h('i', { class: 'ec-ring' }), title = h('b', {}, '网络自检'), text = h('small', {}, '正在连接…'),
      dots = h('span', { class: 'ec-dots' }, ...['net', 'pure'].map(k => h('i', { 'data-k': k }))),
      bar = h('span', { class: 'ec-bar' }, h('i')), acts = h('span', { class: 'ec-acts' }),
      x = h('button', { type: 'button', class: 'ec-x', 'aria-label': '关闭', onclick: () => c.close() }, '×');
    const el = h('div', { class: 'ecap', role: 'status', 'aria-live': 'polite' }, ring, h('span', { class: 'ec-tx' }, h('span', { class: 'ec-hd' }, title, dots), text), acts, x, bar);
    this.el = silent ? null : el;
    let pct = 4, cap = 30, shown = false, timer = 0;
    const fill = bar.firstChild, tick = silent ? 0 : setInterval(() => { if (pct < cap - 1) { pct += Math.max(0.3, (cap - pct) / 22); fill.style.width = pct + '%'; } }, 120);
    const c = {
      el,
      show() { if (silent || shown || !el) return; shown = true; document.body.append(el); requestAnimationFrame(() => el.classList.add('in')); },
      step(k, st, t, p) {
        el.querySelector(`.ec-dots i[data-k="${k}"]`).className = st;
        if (t != null) text.textContent = t;
        if (p != null) { pct = Math.max(pct, p); cap = Math.min(96, p + 30); fill.style.width = pct + '%'; }
      },
      say(t) { text.textContent = t; },
      finish(cls, head, t, stay) {
        clearInterval(tick); clearTimeout(timer);
        if (silent) { c.close(); return; }
        el.classList.add('done', cls); title.textContent = head; text.textContent = t; fill.style.width = '100%';
        this.show(); if (stay) return;
        timer = setTimeout(() => c.close(), cls === 'ok' ? 1800 : 6000);
      },
      actions(list) { if (!silent) acts.replaceChildren(...list.map(([t, fn]) => h('button', { type: 'button', class: 'ec-btn', onclick: fn }, t))); },
      close() { clearInterval(tick); clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 260); if (EnvCheck.el === el) EnvCheck.el = null; },
    };
    return c;
  },
  // opt.failover：不通时自动切换线路（手机进入账号时由 EnterFlow 的完整进度页负责，这里不重复）
  async go(opt = {}) {
    if ((location.pathname !== '/robots.txt' && !window.__ANC_CLIENT_SHELL) || typeof IP === 'undefined') return { ok: true, skip: true };
    const id = ++this.run, alive = () => id === this.run;
    for (let i = 0; i < 80 && !UI.host?.account; i++) await sleep(50);
    const a = UI.host?.account; if (!a?.id || !alive()) return { ok: true, skip: true };
    const k = this.key(a);
    this.loadLast();
    if (!opt.force && (window.__ANC_FAST_RETURN || (this.last.ok && this.last.key === k && now() - this.last.at < 30 * 60e3) || (typeof NetHealth !== 'undefined' && NetHealth.recent()))) {
      return { ok: true, cached: true };
    }
    const c = this.chip(!opt.manual && !opt.showUI), lazy = setTimeout(() => { if (alive()) c.show(); }, 600);
    const t0 = now();
    try {
      // ① 连通：节点是根基。用原生内核测 generate_204（不经 WebView，不会被页面里的长连接挤占而误报超时）。
      //    当前节点单独先测一次（约 1 秒出结果），通了就算联通；所有节点的并发测速在后台同时进行，不通时按它选最快的节点
      const vl = isVless(a.proxy) && !!Host.urlTest && typeof NodeSpeed !== 'undefined';
      const nodeName = () => { try { const x = UI.host?.account || a; return Nodes.list.find(n => n.id === x.nodeId)?.name || '当前节点'; } catch { return '当前节点'; } };
      c.step('net', 'run', vl ? '测试节点…' : '正在连接…', 8);
      const slow = setTimeout(() => { if (alive() && !c.el.classList.contains('done')) c.say('连接较慢，继续等待…'); }, 3000);
      let ok = false, polled = false, nodeMs = 0, batch = null;
      if (vl) {
        try { await Nodes.load(); } catch {}
        batch = NodeSpeed.test(Nodes.list, { timeout: 2200 });   // 只测过期的；后台继续，不等
        const hasPip = Boolean(String(a.proxyIp || '').trim());
        let r = !hasPip ? NodeSpeed.get(a.proxy) : null; if (!(r?.ok && now() - (r.at || 0) < 180e3)) r = null;
        if (!r && ((IP.ip && !IP.err && now() - IP.at < 30000) || NetHealth.recent())) {
          r = { ok: true, ms: IP.rtt > 0 ? IP.rtt : 0 };
        }
        if (!r) {
          c.say('测试节点 ' + nodeName() + '…');
          const pollFast = (!(IP.ip && !IP.err && now() - IP.at < 15000)) ? IP.poll().then(() => (!IP.err && IP.ip) ? { ok: true, ms: IP.rtt || (now() - t0) } : null).catch(() => null) : Promise.resolve(null);
          if (hasPip) {
            void NodeSpeed.testOne(a.proxy, { rounds: 1, timeout: 2200 }).catch(() => null);
            r = await Promise.race([pollFast, sleep(3500).then(() => null)]);
          } else {
            const speedFast = NodeSpeed.testOne(a.proxy, { rounds: 1, timeout: 2200 }).catch(() => null);
            r = await Promise.race([
              speedFast.then(x => x?.ok ? x : pollFast),
              pollFast.then(x => x?.ok ? x : speedFast),
              sleep(2800).then(() => null),
            ]);
            if (!r) { const g = NodeSpeed.get(a.proxy); r = g && now() - (g.at || 0) < 60e3 ? g : null; }
          }
        }
        ok = !!r?.ok || (!IP.err && !!IP.ip && now() - IP.at < 15000); nodeMs = ok ? (r?.ms || IP.rtt || 0) : 0;
        if (!ok && NetHealth.recent()) ok = true;   // 对话请求刚成功过：线路显然是通的
        // 出口 IP 只用于显示和纯净度评估：后台取，不当联通判断
        if (ok && !(IP.ip && !IP.err && now() - IP.at < 15000)) { IP.at = 0; void IP.poll(); }
      } else if ((IP.ip && !IP.err && now() - IP.at < 15000) || NetHealth.recent()) ok = true;
      else { IP.at = 0; polled = true; ok = await Promise.race([IP.poll().then(() => !IP.err && !!IP.ip), sleep(2500).then(() => false)]); }
      clearTimeout(slow); if (!alive()) return { ok: false, stale: true };
      if (!ok && opt.failover !== false && typeof AutoRoute !== 'undefined' && AutoRoute.engine && AutoRoute.enabled?.()) {
        c.show(); c.step('net', 'run', (vl ? '节点 ' + nodeName() + ' 不通' : '当前线路没有响应') + '，正在秒切可用节点 / 热备 IP…', 30);
        const hasStandby = (AutoRoute.standby?.ips?.length || 0) + (AutoRoute.standby?.nodes?.length || 0) > 0;
        if (batch && !hasStandby) await Promise.race([batch, sleep(1200)]);
        if (!alive()) return { ok: false, stale: true };
        const off = Bus.on('route-state', () => { if (alive() && AutoRoute.busy && AutoRoute.status) c.say(AutoRoute.status); });
        let r = null;
        try { for (let i = 0; i < 6 && alive(); i++) { r = await AutoRoute.request('startup', true); if (!r?.busy) break; await sleep(350); } }
        finally { off(); }
        if (!alive()) return { ok: false, stale: true };
        if (r?.ok && r.changed) {
          c.step('net', 'ok'); c.finish('ok', '已切换到 ' + (r.label || '可用节点'), '已就绪', false);
          this.saveLast({ key: this.key(UI.host?.account || a), at: now(), ok: true }); return { ok: true, switched: true };
        }
        if (r?.ok) { ok = true; if (!(IP.ip && !IP.err)) { IP.at = 0; void IP.poll(); } }   // 原生检测确认当前线路是通的
      }
      if (!ok && opt.failover === false) { c.close(); this.saveLast({ key: k, at: now(), ok: false }); return { ok: false }; }
      if (!ok) {
        c.step('net', 'bad');
        c.finish('bad', vl ? '节点不通' : '网络不通', (vl ? '所有节点都没有测通' : (IP.err || '没有返回出口 IP')) + (opt.failover !== false ? '；已尝试自动切换' : ''), true);
        c.actions([['重试', () => void this.go({ ...opt, force: true })], ['地区 IP', () => { c.close(); try { RegionIP.open(); } catch {} }]]);
        if (!window.__routeFixture && !window.__fixture && typeof RegionIP !== 'undefined' && !RegionIP.view) {
          try { if (typeof UI !== 'undefined' && !UI.authed && typeof UI.enterBrowseMode === 'function') UI.enterBrowseMode(); } catch {}
          try { RegionIP.open({ offlineAlert: true }); } catch {}
        }
        this.saveLast({ key: k, at: now(), ok: false });
        return { ok: false };
      }
      // 延迟：节点测速结果优先；其次实时延迟；这次真的请求过才用本次耗时
      if (typeof UI !== 'undefined' && typeof UI.recoverFromBrowseMode === 'function') void UI.recoverFromBrowseMode();
      const ms = nodeMs || (IP.rtt > 0 && now() - IP.rttAt < 60000 ? IP.rtt : polled ? now() - t0 : 0);
      c.step('net', 'ok', (vl ? '节点 ' + nodeName() : '连接正常') + (ms ? ' · ' + ms + ' ms' : ''), 65);
      // 出口 IP 还在取：最多等 600ms（取不到也不挡，纯净度后台继续）
      if (!(IP.ip && !IP.err) && IP.polling) await Promise.race([IP.polling, sleep(600)]);
      if (!alive()) return { ok: false, stale: true };
      const cc = String(IP.loc || '').toUpperCase(), reg = String(a.region || '').toUpperCase();
      // 切国家用的好好的就自动切换到对应国家：当前出口国家连通正常时自动同步账号地区，不再报「地区不符」或提示切回旧国家
      if (cc && reg && reg !== cc && typeof AutoRoute !== 'undefined' && AutoRoute.adoptWorkingRegion) {
        AutoRoute.adoptWorkingRegion(cc);
      }
      if (typeof AutoRoute !== 'undefined' && AutoRoute.ensureStandby) AutoRoute.ensureStandby('envcheck');
      // ② 纯净度：快速检查（最多等 240ms），未出结果不挡界面，后台继续
      c.step('pure', 'run', '评估出口纯净度…');
      let cur = typeof IPRep !== 'undefined' && IP.ip && !IP.err ? IPRep.cur(UI.host?.account || a, IP.ip) : null;
      for (let i = 0; i < 2 && cur && !cur.sc?.known && alive(); i++) { await sleep(120); cur = IPRep.cur(UI.host?.account || a, IP.ip); }
      if (!alive()) return { ok: false, stale: true };
      const pct = cur?.pct, label = cur?.label || '未评估', kind = cur?.kind?.t || '';
      const line = [vl ? nodeName() : '', IP.ip && !IP.err ? ccF(cc) + ' ' + IP.ip : '', ms ? ms + ' ms' : '', pct != null ? label + ' ' + pct + '%' : '', kind].filter(Boolean).join(' · ');
      if (label === '高风险') {
        c.step('pure', 'warn');
        c.finish('warn', '网络正常 · 出口风险较高', line);
        this.saveLast({ key: k, at: now(), ok: true });
        return { ok: true, risky: true };
      }
      c.step('pure', pct == null ? 'wait' : label === '一般' ? 'warn' : 'ok');
      const head = (this.tag ? this.tag + ' · ' : '') + (label === '一般' ? '网络正常 · 纯净度一般' : '网络正常');
      this.tag = '';
      c.finish(label === '一般' ? 'warn' : 'ok', head, line);
      this.saveLast({ key: k, at: now(), ok: true });
      return { ok: true };
    } finally { clearTimeout(lazy); }
  },
};
