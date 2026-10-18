// 切换线路后自动刷新环境（T23）
// 节点 / 出口 IP / 代理 / 直连 任何一种切换成功后，重新载入页面：旧线路留下的 cookie、验证令牌、
// 长连接和页面内状态全部换新。手动「应用更改」（含未更改时的强制重新应用）也刷新。
// 正在对话 / 抽卡 / 测指纹时先等结束再刷新；认证流程中不刷新（认证环境被锁定）。
// 所有切换都经过 Host.saveAccount 或线路适配器 apply，这里统一拦截，不需要每个调用点各自处理。
const EnvRefresh = {
  KEY: 'envref', DELAY: 1500, base: '', pending: null, timer: 0, waitToast: false, inited: false,
  key(a) { return a ? [a.proxy || '', a.proxyIp || '', a.nodeId || ''].join('|') : ''; },
  label(a) {
    if (!a) return '';
    if (/^vless:/i.test(a.proxy || '')) {
      let n = ''; try { n = (typeof Nodes !== 'undefined' ? (Nodes.list || []).find(x => x.id === a.nodeId)?.name : '') || ''; } catch {}
      return '节点' + (n ? ' ' + n : '') + (a.region ? ' · ' + a.region : '') + (a.proxyIp ? ' · ' + a.proxyIp : '');
    }
    return a.proxy === 'direct' ? '直连' : a.proxy ? '本机代理' : '默认线路';
  },
  init() {
    if (this.inited) return; this.inited = true;
    this.base = this.key(UI.host?.account);
    const m = Store.get(this.KEY, null);
    if (m) { Store.del(this.KEY); if (now() - (m.at || 0) < 120000) setTimeout(() => void this.welcome(m), 1200); }
    this.wrap();
    // 其他途径改了当前账号线路（例如账号管理窗口）：UI.host 刷新后也能发现；自动秒切（AutoRoute）走无感热切，不整页重载
    setInterval(() => { try { const k = this.key(UI.host?.account); if (k && this.base && k !== this.base) { this.base = k; if (typeof AutoRoute !== 'undefined' && (AutoRoute.busy || now() - (AutoRoute.lastChanged || 0) < 15000)) return; this.schedule(this.label(UI.host.account)); } } catch {} }, 4000);
  },
  async welcome(m) {
    // 进入账号自检的胶囊还在测：把「已切换线路」并进它的结果里，不另弹提示
    if (typeof EnvCheck !== 'undefined' && EnvCheck.busy()) { EnvCheck.tag = '已切换线路'; return; }
    try { if (IP.polling) await IP.polling; else await IP.poll(); } catch {}
    toast('✓ 已切换线路并刷新环境' + (m.what ? ' · ' + m.what : '') + (IP.ip && !IP.err ? ' · 出口 ' + IP.ip : ''));
  },
  wrap() {
    if (Host.saveAccount && !Host.saveAccount.__env) {
      const save = Host.saveAccount;
      const wrapped = async p => { const r = await save.call(Host, p); try { this.observe(p, r, false); } catch {} return r; };
      wrapped.__env = true; Host.saveAccount = wrapped;
    }
    if (typeof RouteHost !== 'undefined' && !RouteHost.create.__env) {
      const create = RouteHost.create;
      const wrapped = (...args) => {
        const ad = create.apply(RouteHost, args); if (!ad || ad.apply.__env) return ad;
        const apply = ad.apply, w = async o => { const r = await apply(o); try { if (r?.ok) { if (o?.manual) this.observe({ id: o?.id, ...(o?.route || {}) }, r.account, true); else if (r.account) this.base = this.key(r.account); } } catch {} return r; };
        w.__env = true; ad.apply = w; return ad;
      };
      wrapped.__env = true; RouteHost.create = wrapped;
    }
  },
  // forced：线路适配器真正应用过一次（包括未更改时的强制重新应用）
  observe(patch, res, forced) {
    const cur = UI.host?.account?.id, id = patch?.id || res?.id;
    if (!cur || !id || id !== cur) return;           // 只管当前窗口的账号
    if (!forced && !['proxy', 'proxyIp', 'nodeId'].some(k => patch && k in patch)) return;
    const acc = res && typeof res === 'object' && !res.error ? { ...patch, ...res } : patch;
    const k = this.key(acc);
    if (!forced && k === this.base) return;          // 改名、改备注等不动线路的保存不刷新
    this.base = k; if (UI.host?.account) Object.assign(UI.host.account, { proxy: acc.proxy ?? UI.host.account.proxy, proxyIp: acc.proxyIp ?? UI.host.account.proxyIp, nodeId: acc.nodeId ?? UI.host.account.nodeId });
    this.schedule(this.label(acc));
  },
  blocked() {
    try { return !!(UI.host?.account?.authLocked || (typeof AuthEnv !== 'undefined' && AuthEnv.state) || document.querySelector('.auth-form')); } catch { return false; }
  },
  busy() {
    try {
      if ([...Chats.values()].some(c => c.busy)) return '当前对话';
      if (typeof Gacha !== 'undefined' && Gacha.busy()) return '抽卡';
      if (typeof FingerprintBatch !== 'undefined' && FingerprintBatch.busy) return '批量测指纹';
      if (typeof RegionIP !== 'undefined' && (RegionIP.testing() || RegionIP.busy)) return '测试 / 切换';
    } catch {}
    return '';
  },
  schedule(what) {
    if (this.blocked()) return;
    this.pending = { what, at: now() }; Store.set(this.KEY, { at: now(), what });
    clearTimeout(this.timer); this.timer = setTimeout(() => this.fire(), this.DELAY);
  },
  fire() {
    const p = this.pending; if (!p) return;
    if (this.blocked()) { this.pending = null; Store.del(this.KEY); return; }
    // 手动切换动画还在显示（应用 → 核对出口 → 完成）：静默等它结束再刷新，不另弹提示
    if (typeof NodeRoutes !== 'undefined' && NodeRoutes.manual > 0) { Store.set(this.KEY, { at: now(), what: p.what }); this.timer = setTimeout(() => this.fire(), 600); return; }
    const b = this.busy();
    if (b) {
      if (!this.waitToast) { this.waitToast = true; toast('线路已切换；' + b + '结束后自动刷新环境'); }
      Store.set(this.KEY, { at: now(), what: p.what }); this.timer = setTimeout(() => this.fire(), 1500); return;
    }
    this.pending = null; this.waitToast = false; this.reload();
  },
  reload() { location.reload(); },
};
if (typeof module !== 'undefined' && module.exports) module.exports = EnvRefresh;
