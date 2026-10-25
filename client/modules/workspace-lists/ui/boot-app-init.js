async function init() {
  Bus.on('chat', c => scheduleChat(c));
  Bus.on('history', () => { UI.renderListSoon(); UI.renderTabs(); if (UI.els?.chat) scheduleChat(UI.els.chat); });
  Bus.on('models', sid => { if(!sid)UI.modelsV++;UI.renderTabs();UI.renderListSoon();const c=UI.els?.chat;if(c&&(!sid||c.sid===sid))scheduleChat(c);if(sid&&Chats.get(sid)&&c?.sid!==sid)Pager.dirty(Chats.get(sid)); });
  Bus.on('quota', () => UI.renderQuota());
  Bus.on('update', () => UI.renderQuota());
  Bus.on('pulse', () => UI.renderPulse());
  Bus.on('rank', () => UI.renderListSoon());
  // 上次没删完的归档对话（删到一半退出了 App / 在等每小时的额度）：打开 20 秒后接着删
  setTimeout(() => { try { if (isMob()) LaunchPick.preload(); } catch {} }, 4000);
  let _lastMobPreloadAt = 0;
  addEventListener('focus', () => { try { if (isMob() && now() - _lastMobPreloadAt > 30000) { _lastMobPreloadAt = now(); LaunchPick.preload(); } } catch {} });
  setTimeout(() => { try { Bulk.resume(); } catch {} }, 20e3);
  setTimeout(() => { try { ProtocolSchema?.autoSync?.(false); } catch {} }, 8000);
  setInterval(() => void ProbeBankCache.refresh(), 30 * 60e3);
  Bus.on('fav', () => UI.renderList());
  Bus.on('strength', () => { UI.renderListSoon(); try { if (Dock.tab === 'power') Dock.soon(); } catch {} });
  Bus.on('ip', () => { UI.renderIP(); UI.renderTabs();  });
  Bus.on('ipchange', (ip, prev) => {
    try { ReadLimit.until = 0; Quota.clear(true); } catch {}
    toast(`出口 IP 变化：${prev} → ${ip}`);
  });
  // 发送时人机验证没通过（recaptcha validation failed）：自动弹出验证，完成后重新发送；同一轮只自动弹一次
  Bus.on('captcha', c => { if (c.gacha?.fingerprint || Fingerprint.isRunning(c)) { toast('指纹探针遇到验证，未自动重发；请完成官方验证后重新测试', 'err'); return; } if (UI.els?.chat !== c || c.capAt > now() - 60000) return; c.capAt = now(); toast('Brana 要求人机验证，完成后自动重新发送'); UI.retry(c, null, true); });
    Bus.on('relogin', r => { if (r?.ok) toast('会话已过期，已用保存的密码自动重新登录'); });
  let histT = 0;
  Bus.on('turn', (c, info) => {
    clearTimeout(histT); histT = setTimeout(() => History.touched(c.sid), 300);   // 本地挪到最前；只有新对话才去拉列表
    // 任务完成通知：App 在后台时，对话回复完成 / 等待你回答 / 出错 → 系统通知；假完成、中途断链待续接、抽卡对话一律不通知
    if (c.gacha || Gacha.owns(c.sid) || Prefs.notify === false || info?.forced || info?.fake || info?.midStall || c.fakeEnd || c.midTurnStall) return;
    if (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled?.(c)) return;
    const bg = (typeof document !== 'undefined' && document.hidden) || !document.hasFocus();
    if (!bg && !Host.notify) return;   // 安卓由外壳判断（App 在前台且正看着这个账号时不弹）
    try {
      // 通知标题用备注；没有备注用型号名（通知里没有厂商图标，用完整型号名如 glm-5.3），不再用「模型/时间/备注」整串会话名
      const raw = History.byId(c.sid)?.title || c.title || '', v = Titles.view(c.sid, raw), note = Notes.get(c.sid);
      const mdl = String(Strength.canon(v.model || v.plain || '') || '').trim();
      const name = note || mdl || noteBase(raw) || '对话', last = c.messages.at(-1);
      const txt = (last?.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      const ask = (() => { try { return Hitl.pending(c).length > 0; } catch { return false; } })();
      const title = (ask ? '等待你回答 · ' : c.error || c.status === 'error' ? '出错了 · ' : '任务完成 · ') + name, body = txt || c.error || (ask ? '需要你回答问题后才能继续' : '回复已完成');
      if (Host.notify) Host.notify({ title, body, sid: c.sid })?.catch?.(() => {});
      else { const n = new Notification(title, { body, silent: false }); n.onclick = () => { try { window.focus(); Tabs.open(c.sid); } catch {} }; }
    } catch {}
  });
  // Every identification entry point publishes the same local metadata; cloud writes wait for that chat to finish.
  Bus.on('model', (c,r) => {
    if(!r?.name)return;
    Titles.capture(c.sid, c.sentAt || undefined);
    ProbeArchive.consider(c,r);
  });
  Bus.on('sent', (sid, at) => Titles.sent(sid, at));

  // Scheme B 浏览器模式单实例秒切回客户端：同源 sessionStorage 快照直出，0ms 恢复原对话，后台异步初始化
  let fastReturn = null;
  try {
    const rawFr = sessionStorage.getItem('anc:fast-return');
    if (rawFr) {
      const parsed = JSON.parse(rawFr);
      if (parsed && Date.now() - (parsed.at || 0) < 30 * 60e3) {
        fastReturn = parsed;
        window.__ANC_FAST_RETURN = parsed;
        setTimeout(() => { delete window.__ANC_FAST_RETURN; }, 15000);
      }
      sessionStorage.removeItem('anc:fast-return');
    }
  } catch {}
  if (fastReturn) {
    const cmFast = Store.get('me:u', null) || ((Store.get('tabs', null)?.length || Store.get('tabs:v1', null)?.list?.length) ? { id: 'fast', email: '' } : null);
    if (cmFast && cmFast.id) {
      UI.me = cmFast;
      try {
        History.warm('fast');
        try { if (typeof RunningTracker !== 'undefined') RunningTracker.prewarmTrackedChats(); } catch {}
        if (fastReturn.sid && /^[\w-]{4,64}$/.test(fastReturn.sid)) {
          const cFast = typeof chatOf === 'function' ? chatOf(fastReturn.sid) : null;
          const isEvalFast = Boolean(fastReturn.evalUrl || (cFast && typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(cFast)));
          if (isEvalFast && cFast) {
            if (typeof EvalEngine !== 'undefined' && EvalEngine.initEvalFields) {
              EvalEngine.initEvalFields(cFast, fastReturn.evalMode ? { evalMode: fastReturn.evalMode } : {});
            }
            if (typeof ModeState !== 'undefined' && ModeState.setMode) {
              const hRow = History.byId?.(fastReturn.sid);
              const targetM = fastReturn.evalMode || (hRow ? ModeState.inferEntryMode(hRow) : (cFast.evalMode || 'battle'));
              ModeState.setMode(targetM === 'agent' ? 'battle' : targetM, { silent: true });
            }
          }
          Tabs.open(fastReturn.sid);
        }
        else { Tabs.list = Tabs.list.filter(t => t && t.key); if (Tabs.list.length) { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; UI.renderTabs(); UI.showTab(); } }
        UI.renderList?.(); UI.renderAcct(); UI.shown();
      } catch {}
    }
  } else if (!window.__fixture && !window.__routeFixture && !/[?&](?:glogin|gfail|browse=1|offline=1)\b/.test(location.search) && !/^#reset=/.test(location.hash)) {
    try {
      const cmCold = Store.get('me:u', null);
      History.warm('fast');
      try { if (typeof RunningTracker !== 'undefined') RunningTracker.prewarmTrackedChats(); } catch {}
      const hasColdCache = Boolean((cmCold && cmCold.id && !/@example\.invalid$/i.test(String(cmCold.email || ''))) || (History.items && History.items.length > 0));
      if (hasColdCache) {
        UI.me = (cmCold && cmCold.id) ? cmCold : { id: 'local', email: '' };
        Tabs.list = Tabs.list.filter(t => t && t.key);
        if (!Tabs.list.length) Tabs.newChat();
        else { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; UI.renderTabs(); UI.showTab(); }
        UI.renderList?.(); UI.renderAcct(); UI.renderQuota();
        UI.shown();
      }
    } catch {}
  }
  UI.host = await Host.info().catch(() => null) || {};
  try { EnvRefresh.init(); } catch {}
  await AuthEnv.restore().catch(e => { AuthEnv.lastError = describe(e); });
  AutoRoute.init();
  try { RouteWarm.start(); } catch {}
  // 进入账号自检：从浏览器模式切回客户端（fastReturn）或已有正常连接时不重复自检
  try { EnvCheck.init(); if (!EnterFlow.run && !fastReturn) void EnvCheck.go({ reason: 'boot', failover: true }); } catch {}
  // 「使用 Google 添加账号」新建的账号：第一次打开时一进来就直接去 Google（不等其它初始化、不先画登录页；只自动一次）
  let gErr = '';
  { const ga = UI.host?.account || {}, gk = 'gauto:' + ga.id, q0 = new URLSearchParams(location.search);
    if (location.pathname === '/robots.txt' && ga.id && ga.name === GOOGLE_NAME && !ga.email && !Store.get(gk, 0) && !q0.has('glogin') && !q0.has('gfail')) {
      Store.set(gk, now());
      const st = h('div', { class: 'lsub' }, '正在连接 Brana…');
      $('#view').replaceChildren(h('div', { class: 'scroller' }, h('div', { class: 'gate' }, h('div', { class: 'lform' },
        h('div', { class: 'hero-t' }, gIcon(), ' 正在打开 Google 登录'), st, h('i', { class: 'spin' })))));
      UI.shown();
      // 添加账号的窗口已经提前备好了 reCAPTCHA 令牌（2 分钟内有效、只能用一次）：拿来直接用
      let token = ''; try { const g = await Host.shared('gtok@' + ga.id); if (g?.t && now() - (g.at || 0) < 100e3) token = g.t; if (g) Host.shared('gtok@' + ga.id, null)?.catch?.(() => {}); } catch {}
      try { await Auth.google({ fresh: true, token, log: t => { st.textContent = t; } }); await new Promise(() => {}); }
      catch (e) { gErr = cleanErr(e); }
    }
  }
  // 手机：每次打开 App 先显示选账号页（各账号的金色数量 / 型号）
  if (Host.platform === 'android' && Host.launchPick?.()) LaunchPick.show().catch(() => {});
  Nodes.load().then(() => Nodes.syncAndroid()).then(() => Pool.pushG()).catch(() => {});
  // Draft recovery is independent of preferences; retain Shared -> account-gacha ordering.
  // Do not display an editable composer until draft merging is complete.
  await Promise.all([
    Shared.pull().catch(()=>{}).then(()=>Gacha.pullOwn().catch(()=>{})),
    Drafts.pull().catch(e=>console.warn(e)),
  ]);
  try { if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(true); } catch {}
  // 外壳永远不该滚动：万一被 focus / scrollIntoView 滚动了（旧内核不支持 overflow:clip 时），立刻复位
  { const fix = e => { const t = e.target; if (t && t !== document && t !== document.body && t !== document.documentElement && t.id !== 'app' && t.id !== 'main') return; for (const el of t === document ? [document.scrollingElement, document.body] : [t]) if (el && (el === document.body || el === document.documentElement || el.id === 'app' || el.id === 'main') && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } };
    document.addEventListener('scroll', fix, { capture: true, passive: true }); }
  // 别的窗口（账号菜单）可能改了共享设置（金色点亮 / 主题 / 检测间隔）或本账号的抽卡设置：回到这个窗口时重新读一次
  let _lastFocusPullAt = 0;
  addEventListener('focus', () => {
    if (now() - _lastFocusPullAt < 25000) return;
    _lastFocusPullAt = now();
    Shared.pull().catch(() => {});
    if (!Gacha.busy()) Gacha.pullOwn().then(() => { UI.renderGachaBadge?.(); document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => GPop.paint?.(b)); }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (!(typeof document !== 'undefined' && document.hidden) && now() - _lastFocusPullAt >= 15000) { _lastFocusPullAt = now(); Shared.pull().catch(() => {}); } });
  UI.renderAcct(); UI.renderQuota(); UI.renderGachaBadge();
  try { History.warm(UI.host?.account?.id || 'web'); } catch {}
  void TitleSync.start().catch(e=>TitleSync.error(describe(e)));
  // 出口 IP 与实时延迟合一采样：前台每 30 秒由 IP.ping 同步刷新延迟与出口 IP（IP.poll 自动复用不重发）；窗口隐藏且非抽卡时延长至 5 分钟一次，大幅节省 EdgeTunnel 请求配额
  if (UI.host?.account?.status?.ip && !IP.ip) {
    IP.ip = UI.host.account.status.ip;
    if (UI.host.account.status.loc) IP.loc = UI.host.account.status.loc;
    IP.at = now(); IP.checkedAt = now();
    if (UI.host.account.status.ms) IP.recordRtt?.(UI.host.account.status.ms);
  }
  IP.poll();
  IP.ping(); setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden) && navigator.onLine !== false) IP.ping(); }, 30000);
  Bus.on('rtt', () => { const el = document.getElementById('ip-rtt'); if (el) { el.className = IP.rttCls(); el.textContent = IP.rttText(); } });
  setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden)) Traffic.tick(); }, 1000);
  setInterval(() => {
    if (IP.polling || ((typeof document !== 'undefined' && document.hidden) && !IP.fast)) return;
    const base = IP.fast ? 4000 : Math.max(15, Prefs.ipPoll || 60) * 1000, gap = (typeof document !== 'undefined' && document.hidden) && !IP.fast ? Math.max(base, 300000) : base;
    const retryGap = IP.err ? Math.max(gap, Math.min(120000, 15000 * 2 ** Math.min(IP.failures - 1, 3))) : gap;
    if (navigator.onLine !== false && now() - Math.max(IP.at, IP.checkedAt || 0) >= retryGap) IP.poll();
  }, 3000);

  // 邮件链接（找回 / 设置密码）跳回来：直接显示「设置新密码」
  // 浏览器模式输入框旁的「抽卡」按钮跳回来：登录就绪后直接打开抽卡面板
  { const m = /^#open=(\w+)/.exec(location.hash);
    if (m) { history.replaceState(null, '', '/robots.txt'); const kind = m[1], t0 = Date.now();
      const SEL = { quota: '#bar .bmeter', leader: '#bar .lpbtn', fplib: '#bar .fp-library-btn', region: '#bar .ipit', update: '#bar .bar-ver' };
      const w = setInterval(() => { if (Date.now() - t0 > 20000) { clearInterval(w); return; } if (!UI.me) return;
        if (kind === 'gacha') { clearInterval(w); try { GPop.openAny(); } catch {} return; }
        const el = document.querySelector(SEL[kind] || '#none'); if (el) { clearInterval(w); setTimeout(() => el.click(), 150); } }, 300); } }
  if (location.hash === '#gacha') { history.replaceState(null, '', '/robots.txt'); const t0 = Date.now(); const w = setInterval(() => { if (UI.me) { clearInterval(w); try { GPop.openAny(); } catch {} } else if (Date.now() - t0 > 20000) clearInterval(w); }, 300); }
  const rc = /^#reset=([^&]+)/.exec(location.hash);
  if (rc) { history.replaceState(null, '', '/robots.txt'); return UI.authGate('reset', { code: decodeURIComponent(rc[1]) }); }
  // 「网页注册」新建的账号：第一次打开直接进 Brana 官网（该账号自己的 IP / 指纹环境），顶部有浏览条，注册、收信、点验证链接都在这里手动完成
  { const account = UI.host?.account || {};
    if (account.id && Host.platform !== 'web' && typeof Host.login === 'function') {
      let w = null; try { w = await Host.shared('webreg@' + account.id); } catch {}
      if (w && w.at && Date.now() - w.at < 10 * 60e3) {
        try { await Host.shared('webreg@' + account.id, null); } catch {}
        try { Pin.hold(true); } catch {}   // 网页注册全程不固定旧部署（注册邮件、验证链接、设置密码要由同一个最新部署处理）
        try { await Host.login(); return; } catch (e) { toast('打开网页失败：' + cleanErr(e), 'err'); }
      }
    } }
  // Explicit signup intent wins over cached login and stored-password auto-login.
  { const account = UI.host?.account || {};
    if (account.id) {
      const key = 'signup@' + account.id;
      let stored;
      try { stored = await Host.shared(key); }
      catch { return UI.loginGate('注册任务读取失败，未自动登录；请重试或手动选择注册'); }
      const signup = AuthFlow.signupIntent(stored, account);
      if (signup) {
        let auto = false; try { const t = await MailToken.load(account.id); auto = !!t && AuthFlow.sameEmail(t.email, signup.email); } catch {}
        UI.authGate('signup', { email: signup.email, auto });
        try { if (await Host.shared(key, null) !== true) toast('注册页已打开，但任务清理未确认；下次启动可能再次显示注册页', 'err'); } catch { toast('注册页已打开，但任务清理失败', 'err'); }
        return;
      }
      if (stored) await Promise.resolve(Host.shared(key, null)).catch(() => {});
    }
  }
  const routeDraft=Store.get('auth-route-draft',null);
  if(routeDraft){Store.del('auth-route-draft');if(!AuthEnv.state?.locked&&routeDraft.accountId===UI.host?.account?.id&&Date.now()-routeDraft.at>=-60000&&Date.now()-routeDraft.at<30*60000&&['login','signup','forgot'].includes(routeDraft.mode)){
    UI.authDraft(UI.host.account,{email:String(routeDraft.email||''),name:String(routeDraft.name||'')});
    if(routeDraft.mode==='login')return UI.loginGate('线路已更新，已恢复邮箱草稿；未保存的密码请重新输入');
    return UI.authGate(routeDraft.mode,{email:String(routeDraft.email||''),err:'线路已更新，已恢复原认证步骤；不会自动发送请求'});
  }}
  let verification = null;
  try { verification = AuthFlow.verificationIntent(JSON.parse(localStorage.getItem('anc-auth') || 'null'), UI.host?.account); } catch {}
  const expectedEmail = verification?.email || AuthEnv.state?.email || UI.host?.account?.email || '';
  const canonEmail = e => { const raw = String(e || '').trim().toLowerCase(); const [l, d] = raw.split('@'); return d ? l.replace(/\+.*$/, '').replace(/[.,\-_]/g, '') + '@' + d : raw; };
  const sameAcctEmail = (a, b) => AuthFlow.sameEmail(a, b) || AuthFlow.sameMailbox?.(a, b) || (canonEmail(a) && canonEmail(a) === canonEmail(b));
  const checkedUser = user => {
    if (!Auth.real(user)) return null;
    const mustMatch = verification || (AuthEnv.state?.locked && AuthEnv.state.kind !== 'login');
    const target = mustMatch && !sameAcctEmail(user.email, expectedEmail) ? expectedEmail : user.email;
    const checked = AuthFlow.identity(user, target);
    if (checked && typeof checked === 'object') {
      checked.email = AuthFlow.pickRichEmail(UI.host?.account?.email || expectedEmail || UI.host?.account?.name, checked.email);
    }
    return checked;
  };
  // 秒开：上次登录过的账号先用本地缓存把界面（标签页 / 对话列表 / 对话内容缓存）画出来，同时后台核对登录状态
  // （切换账号、冷启动时不再白屏等网络；核对失败再换成登录页）
  let early = false;
  const shell = () => {
    Tabs.list = Tabs.list.filter(t => t && t.key);
    if (!Tabs.list.length) Tabs.newChat();
    else { if (!Tabs.cur) Tabs.active = Tabs.list[0].key; UI.renderTabs(); UI.showTab(); }
    try { const ta = $('#view textarea'); if (ta && !ta.value && Tabs.cur?.draft) ta.value = Tabs.cur.draft; } catch {}
    UI.renderList?.(); UI.renderListSoon?.();
  };
  {
    if (!window.__fixture && !window.__routeFixture && (!History.items || !History.items.length)) {
      try { await Promise.race([History.restoreFromLocalCache?.() || Promise.resolve(), sleep(60)]); } catch {}
    } else {
      try { void History.restoreFromLocalCache?.(); } catch {}
    }
    const cm = Store.get('me:u', null);
    const hasLocalState = !!(History.items?.length || Store.get('tabs', null)?.length || Store.get('tabs:v1', null)?.list?.length || Tabs.list?.length || (typeof MsgCache !== 'undefined' && MsgCache.keys?.()?.length));
    const isFixtureAcct = Boolean(window.__fixture || window.__routeFixture || /@example\.invalid$/i.test(String(UI.host?.account?.email || '')) || /^(?:https?:\/\/|socks5:\/\/)?127\.0\.0\.1:(?:1|9|10)\b/i.test(String(UI.host?.account?.proxy || '')));
    const hasConfiguredAccount = Boolean(!isFixtureAcct && (UI.host?.account?.email || UI.host?.account?.hasPw || UI.host?.account?.hasPassword || UI.host?.account?.status?.loggedIn));
    if ((cm && cm.id && (!expectedEmail || sameAcctEmail(cm.email, expectedEmail))) || hasLocalState || hasConfiguredAccount) {
      const em = expectedEmail || cm?.email || UI.host?.account?.email || UI.host?.account?.name || '本地账号';
      UI.me = (cm && cm.id) ? cm : { id: UI.host?.account?.id || 'local', email: em, name: String(em).split('@')[0] };
      early = true;
      try { shell(); UI.renderAcct(); } catch (e) { console.warn(e); }
      UI.shown();
    }
  }
  // 连接失败不再直接跳登录页（以前一断网就像「账号密码丢了」）：原地自动重试，间隔逐渐拉长，期间重测出口 IP；
  // 已经用缓存画出界面的，界面保持不动，只在顶上显示一条重试提示
  const conn = { bar: null, n: 0 };
  const connWait = (why, slow) => new Promise(res => {
    why = /failed to fetch|networkerror|load failed/i.test(why) ? '网络不通' : why;
    const n = ++conn.n, waits = slow ? [10, 20, 30] : [2, 3, 5, 8, 12, 20, 30];
    let left = waits[Math.min(n - 1, waits.length - 1)], tm = 0;
    let finished = false;
    const done = value => { if (finished) return; finished = true; clearInterval(tm); now.disabled = true; res(value); };
    const txt = h('span', {}), now = h('button', { type: 'button', class: 'link', onclick: () => { left = 0; tick(); } }, '立即重试');
    const tick = () => { if (finished) return; if (left <= 0) { txt.textContent = '正在重新登录…'; done(); return; } txt.textContent = '账号登录暂未完成（' + why + '），' + left + ' 秒后重试'; left--; };
    if (!early && !window.__BRANA_BROWSE_MODE && !window.__fixture && !window.__routeFixture) {
      try { UI.enterBrowseMode?.(); } catch {}
    }
    try { if (typeof RegionIP !== 'undefined' && !RegionIP.view && !window.__routeFixture && !window.__fixture) RegionIP.open({ offlineAlert: true }); } catch {}
    conn.bar?.remove(); conn.bar = h('div', { class: 'connbar' }, h('i', { class: 'spin' }), txt, now, h('button', { type: 'button', class: 'link', onclick: () => { try { RegionIP.open({ offlineAlert: true }); } catch {} done('gate'); } }, '切换节点')); document.body.append(conn.bar);
    UI.shown();
    tick(); if (!finished) tm = setInterval(tick, 1000);
  });
  const connOk = () => { conn.bar?.remove(); conn.bar = null; conn.n = 0; };
  // Cached UI/read-only refreshes do not wait behind a slow account metadata endpoint.
  // Authentication, saved credentials and automatic task resume still require /api/me.
  if (early) { KeepAlive.start(); }
  if ((/[?&]browse=1\b/.test(location.search) || window.__BRANA_BROWSE_MODE) && !(typeof EnvRefresh !== 'undefined' && EnvRefresh.justRefreshed)) {
    const isOfflineBoot = /[?&]offline=1\b/.test(location.search);
    if (isOfflineBoot) {
      try { if (location.pathname === '/robots.txt') history.replaceState(null, '', '/robots.txt'); } catch {}
    }
    UI.enterBrowseMode(isOfflineBoot ? '网络无法连接，已开启离线查阅 · 可切换节点或点 × 直接查阅本地对话' : '已进入查阅模式（免登录浏览本地缓存对话）');
    if (isOfflineBoot && !window.__routeFixture && !window.__fixture) {
      try { if (typeof RegionIP !== 'undefined') RegionIP.open({ offlineAlert: true }); } catch {}
      try { if (typeof AutoRoute !== 'undefined') void AutoRoute.request('network', true); } catch {}
    }
    return;
  }
  const check = await SessionGate.check({ early });
  if (check.browse || window.__BRANA_BROWSE_MODE) {
    if (!UI.authed) UI.enterBrowseMode('已进入查阅模式（免登录浏览本地缓存对话）');
    return;
  }
  if (check.manual) {
    if (early && !window.__fixture && !window.__routeFixture) { UI.enterBrowseMode('账号和本地对话已保留 · 可直接查阅本地记录，或点右上角重新登录'); return; }
    UI.loginGate('账号和本地对话已保留。请检查登录验证或线路后重试，或点「查阅模式」免登录浏览本地记录。');
    return;
  }
  let me = check.value;
  connOk();
  try { UI.me = checkedUser(me?.user); if (UI.me) await AuthEnv.finish(UI.me); }
  catch (e) { UI.me = null; Store.del('me:u'); if (expectedEmail) UI.authDraft(UI.host?.account, { email: expectedEmail }); return UI.loginGate(cleanErr(e)); }
  // 邮件验证刚完成却读不到登录：先确认不是旧部署固定造成的（改跟随最新部署、稍等 Cookie 落盘后再核对一次）
  if (verification && !UI.me) { try { if (Pin.on()) Pin.fallback('邮件验证后的登录会话在旧部署上读不到'); Pin.hold(true); await sleep(1500); const again = await api('/api/me', { noRelogin: true }); UI.me = checkedUser(again?.user); if (UI.me) await AuthEnv.finish(UI.me); } catch { UI.me = null; } }
  if (verification && !UI.me) { UI.authDraft(UI.host?.account, { email: expectedEmail }); return UI.loginGate('邮件验证后的登录会话尚未确认，请先完成官方验证后刷新状态'); }
  if (!UI.me && AuthEnv.state?.stage === 'waiting-mail' && !AuthEnv.state.expired) return UI.authGate('link', { kind: AuthEnv.state.kind, email: AuthEnv.state.email });
  if (!UI.me && AuthEnv.state?.locked) return UI.loginGate(AuthEnv.state.expired ? '认证任务已过期，线路仍锁定；请取消旧任务后重新开始' : '存在未完成的认证，请继续使用任务邮箱，或明确取消后再开始');
  let needShell = !early;
  // 未登录：有保存的密码就直接用接口登录，否则显示登录表单
  if (!UI.me) {
    needShell = (!early || !!window.__fixture || !!window.__routeFixture);
    const cred = await Host.getCred().catch(() => null);
    if (cred?.email && cred?.password) {
      if (!early || window.__fixture || window.__routeFixture) $('#view').replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'lform' }, h('div', { class: 'hero-t' }, '正在登录…'), h('div', { class: 'lsub' }, cred.email + ' · ' + (isDirectP(UI.host.account?.proxy) ? '直连' : '代理 ' + maskProxy(UI.host.account?.proxy))), h('i', { class: 'spin' }))));
      for (;;) {
        try { UI.me = checkedUser(await Auth.signIn(cred.email, cred.password)); connOk(); break; }
        catch (e) {
          // Read retries may recover automatically; an unconfirmed authentication POST is never replayed.
          if (e.net && await connWait(describe(e), e.slow) !== 'gate') continue;
          connOk();
          try { Host.noteAccount?.({ loggedIn: false })?.catch?.(() => {}); } catch {}
          if (early && !window.__fixture && !window.__routeFixture) { UI.enterBrowseMode('自动登录暂未完成（' + describe(e) + '）· 已保留本地缓存对话'); return; }
          UI.renderAcct(); return UI.loginGate('自动登录失败：' + describe(e));
        }
      }
    } else if (early && !window.__fixture && !window.__routeFixture && (History.items?.length || Store.get('tabs', null)?.length || Store.get('tabs:v1', null)?.list?.length)) {
      try { Host.noteAccount?.({ loggedIn: false })?.catch?.(() => {}); } catch {}
      UI.enterBrowseMode('已保留本地缓存对话 · 登录会话过期，可直接查阅本地记录');
      return;
    }
  }
  if (verification && UI.me) {
    const a = UI.host?.account || {};
    const richEmail = AuthFlow.pickRichEmail(a.email || verification?.email || a.name, UI.me.email);
    UI.me.email = richEmail;
    try {
      const saved = await Host.saveAccount({ id: a.id, email: richEmail,
        name: !a.name || a.name === a.email || /^账号 ?\d*$/.test(a.name) ? richEmail : a.name,
        ...(!sameAcctEmail(a.email, richEmail) ? { clearPassword: true } : {}) });
      if (!saved?.id || saved.error) throw new Error(saved?.error || '保存账号失败');
      UI.host = await Host.info();
      localStorage.removeItem('anc-auth'); localStorage.removeItem('anc-auth-email');
    } catch (e) { UI.me = null; return UI.loginGate('身份已核对，但本地账号信息保存失败：' + cleanErr(e)); }
  }
  UI.activateAuthedSession = async function(user) {
    if (!user?.id) { location.reload(); return; }
    Store.set('me:u', user);
    UI.me = user;
    UI.authed = true;
    window.__BRANA_BROWSE_MODE = false;
    try { document.querySelectorAll('.connbar, .route-recovery-note, .modal-back.auth-back').forEach(el => el.remove()); } catch {}
    try { shell(); UI.renderAcct(); UI.renderTabs(); UI.shown(); } catch { location.reload(); return; }
    try { Acct.report(); } catch {}
    void (async () => {
      try { await Promise.all([Models.load?.(), History.refresh?.(), Pulse.poll?.()]).catch(() => {}); UI.renderList?.(); UI.renderAcct?.(); KeepAlive.start?.(); } catch {}
    })();
  };
  UI.authed = true; UI.renderAcct();
  // 在网页里（网页注册 / 网页登录 / 令牌链接跳转 / 浏览器模式）登录成功、回到客户端后，把邮箱与网页填写/预设的密码记到这个账号上（代理 / 地区 / 节点原样保留）
  { const c = UI.host?.account || {}, hasSavedPw = Boolean(c.hasPw || c.hasPassword);
    const richEmail = AuthFlow.pickRichEmail(c.email || c.name, UI.me?.email);
    if (UI.me && richEmail) UI.me.email = richEmail;
    if (c.id && ((!c.email && UI.me?.email) || (!hasSavedPw && UI.me?.email)) && !/[?&]glogin=1/.test(location.search)) (async () => {
      let stashedPw = '';
      try { stashedPw = localStorage.getItem('anc-regpw') || ''; } catch {}
      if (!stashedPw && typeof Host.shared === 'function') try { const r = await Host.shared('regpw@' + c.id); if (r?.pw) stashedPw = r.pw; } catch {}
      if (!stashedPw && typeof MailToken !== 'undefined') try { const t = await MailToken.load(c.id); if (t?.password) stashedPw = t.password; } catch {}
      if (c.email && (!stashedPw || hasSavedPw)) return;
      const finalEmail = AuthFlow.pickRichEmail(c.email || c.name, richEmail);
      await Host.saveAccount({
        id: c.id,
        name: c.name && c.name !== WEBREG_NAME && c.name !== GOOGLE_NAME && !/^账号 ?\d*$/.test(c.name) ? c.name : finalEmail,
        email: finalEmail,
        ...(stashedPw && !hasSavedPw ? { password: stashedPw } : {}),
        proxy: c.proxy ?? '', proxyIp: c.proxyIp ?? '', nodeId: c.nodeId, region: c.region,
      });
      try { await Host.noteAccount?.({ email: finalEmail, loggedIn: true }); } catch {}
      try { localStorage.removeItem('anc-regpw'); } catch {}
      UI.host = await Host.info().catch(() => UI.host);
      UI.renderAcct();
      if (!c.email) toast('账号已记录：' + finalEmail);
    })().catch(() => {}); }
  // Google 登录回来（?glogin=1）：登录上了就把邮箱记到这个账号上（代理 / 地区原样保留，不动密码）；没登录上就回登录页说明原因
  const gback = /[?&]glogin=1/.test(location.search), gfail = new URLSearchParams(location.search).get('gfail');
  if (gfail != null) { try { history.replaceState(null, '', location.pathname); } catch {} }
  if (gback) {
    try { history.replaceState(null, '', location.pathname); } catch {}
    Store.del?.('glogin');
    const c = UI.host?.account || {};
    const richEmail = AuthFlow.pickRichEmail(c.email || c.name, UI.me?.email);
    if (UI.me && richEmail) UI.me.email = richEmail;
    if (richEmail) Promise.resolve(Host.saveAccount({ id: c.id, name: c.name && !/^账号 ?\d*$/.test(c.name) && c.name !== c.email && c.name !== GOOGLE_NAME ? c.name : richEmail, email: richEmail, proxy: c.proxy ?? '', proxyIp: c.proxyIp ?? '', nodeId: c.nodeId, region: c.region }))
      .then(async () => { UI.host = await Host.info().catch(() => UI.host); UI.renderAcct(); toast('已用 Google 登录：' + richEmail); })
      .catch(e => toast('已用 Google 登录，但保存账号信息失败：' + cleanErr(e)));
  }
  // 账号菜单里点了「抽卡」：这个窗口是为后台抽卡打开的（隐藏窗口），登录后直接开始抽
  const cmd = await Host.takeCmd?.().catch(() => null);
  const bgStart = () => { const r = Gacha.start(); if (!r.ok) Host.noteAccount?.({ gacha: { busy: false, err: r.error } })?.catch?.(() => {}); else GPop.report(); };
  Host.onCmd?.(async m => { if (m?.gacha === 'start') { if (!UI.me) Host.noteAccount?.({ gacha: { busy: false, err: '未登录' } }); else if (!Gacha.busy()) { await Gacha.pullOwn().catch(() => {}); bgStart(); } else GPop.report(); } else if (m?.gacha === 'stop') { Gacha.stop(); GPop.report(); } else if (m?.gacha === 'captcha') { if (Gacha.needCaptcha()) GPop.captcha(); }
    // 别的窗口改了主题：这边跟着换（不回写，避免来回改）
    if (m?.theme && ['auto', 'light', 'dark'].includes(m.theme) && Prefs.theme !== m.theme) { Prefs.theme = m.theme; Store.set('prefs', Prefs); UI.applyTheme(); }
    // 别的窗口改了金色注释点亮：所有账号同步更新对话卡片和统计
    if (m?.goldMode || Array.isArray(m?.goldSet)) {
      if (m.goldMode) Prefs.goldMode = m.goldMode;
      if (Array.isArray(m.goldSet)) Prefs.goldSet = m.goldSet;
      if (Array.isArray(m.goldChats)) Prefs.goldChats = m.goldChats;
      if (m.goldAt) Prefs.goldAt = m.goldAt;
      Store.set('prefs', Prefs);
      try { if (typeof Gold !== 'undefined') { Gold._set = null; Gold._autoSet = null; } } catch {}
      try { Bus.emit('prefs'); Bus.emit('gold'); } catch {}
      try { UI.renderList?.(); } catch {}
      try { AcctStats.soon?.(200); } catch {}
    }
    if (m?.acctCheckHours != null && Prefs.acctCheckHours !== m.acctCheckHours) {
      Prefs.acctCheckHours = m.acctCheckHours;
      Store.set('prefs', Prefs);
      try { if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(false); } catch {}
    }
    if (m?.pinDpl !== undefined || m?.autoCostDpl !== undefined) {
      if (m.pinDpl) Prefs.pinDpl = m.pinDpl; else delete Prefs.pinDpl;
      if (m.autoCostDpl) Prefs.autoCostDpl = m.autoCostDpl;
      Store.set('prefs', Prefs);
      try { Pin.initSmartPool?.(); Pin.ensure?.(true); } catch {}
      try { BillingProbe?.setSkewDpl?.(m.pinDpl || m.autoCostDpl || Pin.dpl(), Boolean(m.pinDpl)); } catch {}
      try { Bus.emit('pin'); } catch {}
    }
    if (m?.pelshotsSync) {
      try { if (typeof PelicanShots !== 'undefined' && PelicanShots.pull) void PelicanShots.pull(false, true); } catch {}
    }
    if (m?.habitBankSync) {
      try {
        if (typeof ChatHabitFingerprint !== 'undefined') {
          if (m.habitBankSync.samples && ChatHabitFingerprint.applyRemoteSync) {
            ChatHabitFingerprint.applyRemoteSync(m.habitBankSync, { persistToHost: false });
          } else if (ChatHabitFingerprint.syncShared) {
            void ChatHabitFingerprint.syncShared({ force: true });
          }
        }
      } catch {}
    }
    // 账号管理窗口：打开某个对话 / 重新统计
    if (m?.open && UI.me) Tabs.open(m.open);
    if (m?.stats) AcctStats.cmd(m).catch(() => {});
  });
  if (UI.me) Store.set('me:u', UI.me); else Store.del('me:u');
  if (!UI.me) { if (cmd === 'gacha-start') Host.noteAccount?.({ gacha: { busy: false, err: '未登录：请先打开这个账号登录' } })?.catch?.(() => {}); if (cmd?.stats) Host.noteAccount?.({ statsDone: true, statsErr: '未登录：请先打开这个账号登录' })?.catch?.(() => {}); const ga = UI.host?.account || {}, gk = 'gauto:' + ga.id;
    // 「使用 Google 添加账号」新建的账号：第一次打开时自动开始官方 Google 登录（只自动一次；取消后在登录页手动点）
    if (!gback && gfail == null && ga.id && ga.name === GOOGLE_NAME && !ga.email && !Store.get(gk, 0)) { Store.set(gk, now()); UI.loginGate('正在打开 Google 登录…'); setTimeout(() => document.querySelector('.gsign')?.click(), 300); return; }
    Recaptcha.load().catch(() => {});   // 预先加载：点「使用 Google 登录」时不用再等
    { const ga = UI.host?.account || {}; if (ga.name === GOOGLE_NAME && !ga.email && gfail == null) Auth.prewarm(); }   // Google 账号：后台提前建好访客会话
    if (gErr) return UI.loginGate('自动打开 Google 登录失败：' + gErr + '。可以点下面的「使用 Google 登录」再试一次。');
    return UI.loginGate(gfail != null ? 'Google 登录页打不开：' + (gfail || '连接失败') + '。已自动重试 3 次，一般是当前线路（节点 / ProxyIP）偶发不稳定：再点一次「使用 Google 登录」通常就好，不行就换个地区再试。' : gback ? 'Google 登录没有完成（中途取消了，或 Google 拒绝了这次登录）。可以再试一次，或用邮箱密码登录。' : undefined); }
  Acct.report();

  try { if (typeof RunningTracker !== 'undefined') RunningTracker.prewarmTrackedChats(); } catch {}
  if (needShell) shell(); else { UI.renderTabs(); }
  UI.shown();
  // 只取第一页（最近 50 条），更早的在侧栏滚到底时再加载（和网页一致）；不再启动时 + 每 4 分钟把全部历史翻一遍
  if (History.err) { History.err = null; History.blocked = false; }
  setTimeout(() => { try { if (typeof RunningTracker !== 'undefined') void RunningTracker.resumeOnStartup(); } catch {} }, 600);
  if (!History.lastLoad || fastReturn) {
    void History.refresh().then(() => {
      try { if (typeof RunningTracker !== 'undefined') void RunningTracker.resumeOnStartup(); } catch {}
      if (!fastReturn) return;
      try {
        const topE = History.items?.[0];
        if (!fastReturn.sid && topE?.id && Date.now() - (typeof entAt === 'function' ? entAt(topE) : 0) < 10 * 60e3 && Tabs.cur?.sid !== topE.id) {
          Tabs.open(topE.id, { title: topE.title });
        }
        const curSid = Tabs.cur?.sid;
        const curC = curSid ? Chats.get(curSid) : null;
        if (curC) {
          if (curC.loaded && !curC.loading) curC.quickSync?.(true);
          else if (!curC.loading) curC.load(true).catch(() => {});
        }
      } catch {}
    });
  }
  setInterval(() => History.auto('tick'), 10000);   // 每 10 秒看一眼，按 GAP 节奏后台同步列表
  ProbeArchive.start();
  KeepAlive.start();
  // 启动就加载 reCAPTCHA（让它从一开始就观察页面上的正常操作），但不在启动瞬间取令牌：
  // 刚打开、还没有任何操作时取的 v3 令牌分数偏低，更容易被要求人机验证；改成点进输入框 / 选附件时再预取（发送时仍然不用等）
  Recaptcha.load().catch(e => toast(e.message, 'err'));
  Pulse.poll(); Pulse.loop();
  Ranking.refresh();
  Gacha.resume(); SendQ.start();
  // 告诉 App 这个账号有没有正在进行的事（抽卡 / 排队消息 / 回复中）：有就让手机熄屏后保持 CPU 和网络（安卓），电脑不进入睡眠挂起
  const bgRep = () => {
    try {
      const cs = [...Chats.values()], w = { gacha: !!Gacha.busy(), queue: cs.reduce((n, c) => n + (c.queue?.length || 0), 0), stream: cs.filter(c => c.busy).length };
      const k = JSON.stringify(w); if (k === bgRep.k && now() - bgRep.at < 20000) return;
      bgRep.k = k; bgRep.at = now(); Host.bgWork?.(w)?.catch?.(() => {});
    } catch {}
  };
  // 安卓：第一次（只问一次）请用户允许不受电池优化限制，熄屏后才能持续抽卡 / 发队列
  if (Host.bgStatus) { const ask = async () => { const r = await Host.bgStatus().catch(() => null); if (!r || r.battery || r.asked || !r.front) return; if (document.querySelector('.lpick,.modal-back:not(.anc-gh),.eflow')) { setTimeout(ask, 3000); return; } Host.bgAllow('asked'); if (await Dialog.confirm({ title: '允许后台运行', text: '熄屏或切到后台时继续抽卡、发送队列消息、接收回复，需要允许 Brana AI 不受电池优化限制。之后也可以在「设置 → 后台运行」里改。', ok: '去允许' })) Host.bgAllow('battery'); }; setTimeout(ask, 5000); }
  setInterval(() => { if (!(typeof document !== 'undefined' && document.hidden) || bgRep.k !== '{"gacha":false,"queue":0,"stream":0}') bgRep(); }, 10000); Bus.on('gacha', () => { clearTimeout(bgRep.t); bgRep.t = setTimeout(bgRep, 300); }); Bus.on('turn', () => { clearTimeout(bgRep.t); bgRep.t = setTimeout(bgRep, 300); }); setTimeout(bgRep, 1500);
  if (cmd?.open) setTimeout(() => Tabs.open(cmd.open), 300);
  // 点「任务完成」通知进来：打开那个对话
  window.__ancOpenSid = sid => { Host.takeOpen?.()?.catch?.(() => {}); if (sid === '__captcha') { try { Gacha.openCaptcha(); } catch {} return; } if (sid && UI.me) Tabs.open(sid); };
  Host.takeOpen?.().then(s => { if (s && UI.me) setTimeout(() => Tabs.open(s), 300); }).catch(() => {});
  // 安卓 13+：通知需要权限（只问一次）
  if (Host.notifyPerm && Prefs.notify !== false) setTimeout(() => Host.notifyPerm(true).catch(() => {}), 2500);
  if (cmd?.stats) setTimeout(() => AcctStats.cmd(cmd).catch(() => {}), 800);
  if (cmd === 'gacha-start') setTimeout(() => { if (!Gacha.busy()) bgStart(); else GPop.report(); }, 1200); else GPop.report();
  // 安卓多账号：这个账号的页面被切到最前面（之前在后台运行）：同步状态栏配色、刷新出口 IP / 对话列表
  window.__ancFront = () => { try { Chrome.apply(); IP.poll(); History.auto('front'); UI.renderGachaBadge?.(); Sync.kick(); } catch {} };
  Sync.start();
  // 窗口重新可见时，检查没有在流式接收的进行中对话
  document.addEventListener('visibilitychange', () => { if (!(typeof document !== 'undefined' && document.hidden)) { for (const c of Chats.values()) if (c.busy && !c.streaming && !c.isEvaluation && !(typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(c))) c.stream(); IP.poll(); } });
}

function boot() {
  const isMgrFile = window.top === window && location.protocol === 'file:' && /[?&]mgr=1\b/.test(location.search);
  if (!isMgrFile && (window.top !== window || location.origin !== ORIGIN)) return;
  try { Object.defineProperty(window, '__anc', { value: { BillingProbe, EnvRefresh, EnvCheck, StreamMD, ChatExport, Connectors, HtmlPreview, PelicanShots, CapRoute, Recaptcha, NetHealth, NetPolicy, ThinkingStatus, WorkspacePath, WorkspacePreview, MD, SessionGate, AutoRoute, RoutePolicy, RouteState, NodeRoutes, AuthEnv, RegionIP, Bulk, Brand, Gacha, Host, Auth, Bus, chatOf, IPRep, Update, Cap, Calib, Fmt, CS, Pin, FmtAcc, History, Drafts, TabSw, Warm, PoolGuard, RegionAdvisor, PoolMaint, SubMaint, NodeImport, Sync, acctWheel, acctCard, Gold, GoldBoard, PView, LeaderPop, TabPress, userAtts, attZoom, Side, AcctStats, LaunchPick, MgrWin, SendQ, Notes, Mob, Pager, EnterFlow, Hitl, Vless, Nodes, NodeEditor, NodeMgr, Chats, chatOf, Tabs, UI, History, Models, Store, Trigger, Pulse, IP, Trace, Workspace, Dock, WS, Bar, Prefs, Recaptcha, createChat, R, Uploads, Revolver, GPop, Notes, Titles, TitleSync, TitleCompact, TitleCipher, ProbeArchive, Fingerprint, FingerprintBatch, GachaPrompts, Dialog, AutoId, Strength, PView, StrPick, Side, Price, LiveEst, KeepAlive, Palette, ExtPop, LeaderPop, Steps, FileLink, Tip, Pool, ProxySet, GSlot, Fav, LocalProxy, proxyField, ModeState, ModelCatalog, EvalEngine, ModeSwitcher, EvalView, get Gacha() { return Gacha; } } }); } catch {}
  // 桌面账号管理窗口（本地页面）：只显示账号管理，不联网
  if (isMgrFile) { MgrWin.boot(); return; }
  if (window.__ANC_BOOTED) return; window.__ANC_BOOTED = true;
  // 文件拖到输入框以外的地方时不要让窗口跳转去打开这个文件
  addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  if (location.pathname !== '/robots.txt') { if (Host.platform !== 'web') overlay(); return; }
  const start = () => { UI.build(); Mob.bind();
    // 全面屏：安卓外壳给出状态栏 / 导航栏高度（页面画到屏幕边缘，自己留白）
    try { const A = window.BranaAndroid; if (A?.insets) { const [t, b] = JSON.parse(A.insets()); const st = document.documentElement.style; st.setProperty('--sa-top', t + 'px'); st.setProperty('--sa-bottom', b + 'px'); } } catch {}
    // 从选账号页进入的新页面：一开始就盖上进度层，并马上让外壳切过来（用进度层代替「正在切换」转圈）
    if (Host.platform === 'android' && Host.takeEnter?.()) { EnterFlow.go(); requestAnimationFrame(() => requestAnimationFrame(() => UI.shown())); }
    setTimeout(() => { try { window.BranaHost?.ready?.()?.catch?.(() => {}); } catch {} }, 320); init().catch(e => { console.error(e); toast('初始化失败：' + e.message, 'err'); UI.shown(); }); setTimeout(() => UI.shown(), 8000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
boot();
