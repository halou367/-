// ---------- 账号统计的显示（桌面账号管理窗口 + 手机启动选账号页共用）----------
const StatUI = {
  GOLD: ['anthropic', 'openai'],   // 「金色」只看 Claude 和 GPT；其他厂商放在「更多」里
  vname: vid => vid === 'other' ? '未识别' : Brand.NAME[vid] || vid,
  vicon: (vid, size = 14) => vid === 'other' ? h('span', { class: 'mg-vq' }, '?') : VIcon.el(vid, size),
  mname: nm => nm === '未识别' ? nm : Brand.short(nm) || nm,
  validModel(k, m) {
    const s = String(k || '').replace(/\?+$/, '').trim();
    if (!s || s === '未识别' || s === '开源模型' || !(m?.n > 0)) return false;
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(s)) return false;
    if (/^(openai|gpt|chatgpt|anthropic|claude|google|gemini|xai|grok|moonshot|kimi|deepseek|qwen|zhipu|glm|xiaomi|mimo|bytedance|doubao|minimax|mistral|meta|llama|other)$/i.test(s)) return false;
    if (typeof Brand !== 'undefined' && typeof Brand.of === 'function' && !Brand.of(s)) return false;
    return true;
  },
  // 厂商排序：Claude、GPT 在前，其余按对话数；0 个有效型号的厂商不显示
  vendors(stats) {
    const V = stats?.vendors || {};
    return Object.entries(V).filter(([vid, v]) => {
      if (!vid || vid === 'other' || !(v?.n > 0)) return false;
      const entries = Object.entries(v?.models || {});
      return entries.length > 0 && entries.some(([k, m]) => StatUI.validModel(k, m));
    }).sort(([a, x], [b, y]) => (StatUI.rank(a) - StatUI.rank(b)) || (y.n - x.n));
  },
  rank: vid => vid === 'anthropic' ? 0 : vid === 'openai' ? 1 : vid === 'other' ? 9 : 2,
  // 型号排序：金色在前，然后版本 / 档位 / 对话数
  models(v) {
    return Object.entries(v?.models || {}).filter(([k, m]) => StatUI.validModel(k, m)).sort(([a, x], [b, y]) => (+y.gold - +x.gold) || ((Strength.ver10(b) || 0) - (Strength.ver10(a) || 0)) || ((Strength.level(b) ?? -1) - (Strength.level(a) ?? -1)) || (y.n - x.n));
  },
  // 手动点亮模式：按当前的点亮设置重新标金色（别的账号上报的统计可能是改设置之前算的）
  // 旧版序号后缀（opus-5 · 007）的型号并到同名型号下，同时剔除 0 模型 / 未识别 / 误匹配标题
  fold(S) {
    if (!S?.vendors) return S;
    const V = {};
    for (const [vid, v] of Object.entries(S.vendors)) {
      if (!vid || vid === 'other' || !v || typeof v !== 'object') continue;
      const models = {};
      let vCount = 0, vTurns = 0;
      for (const [k, m] of Object.entries(v.models || {})) {
        if (!StatUI.validModel(k, m)) continue;
        const c = Strength.canon(k) || k;
        if (!StatUI.validModel(c, m)) continue;
        const x = models[c];
        vCount += (m.n || 0);
        vTurns += (m.turns || 0);
        if (!x) { models[c] = { ...m, list: [...(m.list || [])] }; continue; }
        x.n += m.n; x.turns = (x.turns || 0) + (m.turns || 0); x.known = (x.known || 0) + (m.known || 0); x.gold = x.gold || m.gold; x.list.push(...(m.list || [])); x.list.sort((a, b) => b[1] - a[1]);
      }
      if (!(vCount > 0) || !Object.keys(models).length) continue;
      const gold = { n: 0, models: [] }; for (const [k, m] of Object.entries(models)) if (m.gold) { gold.n += m.n; gold.models.push(k); }
      V[vid] = { ...v, n: vCount, turns: vTurns, models, gold };
    }
    return { ...S, vendors: V };
  },
  regold(S) {
    S = StatUI.fold(S);
    if (!S?.vendors || typeof Gold === 'undefined' || (!Gold.manual && typeof Gold.isUnifiedGold !== 'function')) return S;
    const V = {};
    for (const [vid, v] of Object.entries(S.vendors)) {
      const models = {}, gold = { n: 0, models: [] };
      for (const [k, m] of Object.entries(v.models || {})) { const g = vid !== 'other' && (Gold.manual ? Gold.has(k) : Gold.isUnifiedGold(k)); models[k] = { ...m, gold: g }; if (g) { gold.n += m.n; gold.models.push(k); } }
      V[vid] = { ...v, models, gold };
    }
    return { ...S, vendors: V };
  },
  // 一行金色：厂商图标 + 数量 + 金色型号名
  goldLine(vid, v, { names = true } = {}) {
    const g = v?.gold || { n: 0, models: [] };
    return h('div', { class: 'mg-gold' + (g.n ? '' : ' none') },
      StatUI.vicon(vid, 15), h('b', { class: 'mg-gn', title: '金色 ' + g.n + ' 个' }, String(g.n)),
      names && g.models.length ? h('span', { class: 'mg-gm' }, ...g.models.map(m => h('span', { class: 'mg-chip gold' }, StatUI.mname(m)))) : null,
      h('span', { class: 'grow' }), h('span', { class: 'dim' }, (v?.n || 0) + ' 个对话'));
  },
  ago(t) { if (!t) return ''; const s = (now() - t) / 1000; return s < 60 ? '刚刚' : s < 3600 ? Math.round(s / 60) + ' 分钟前' : s < 86400 ? Math.round(s / 3600) + ' 小时前' : Math.round(s / 86400) + ' 天前'; },
  when(t) { if (!t) return '—'; const d = new Date(t); return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; },
  where(a) { const st = a.status || {}; return [a.region ? '地区 ' + ccF(a.region) : maskProxy(a.proxy), st.ip ? '出口 ' + st.ip + (st.loc ? ' ' + ccF(st.loc) : '') : ''].filter(Boolean).join(' · '); },
};

// ---------- 手机：账号页（打开 App 时选账号 + 侧栏「切换账号」+ 对话页返回，三个入口共用这一个页面）----------
// 波轮：上下滑动，中间那张放大高亮，轻点中间那张进入；每个账号右边是它的抽卡按钮（后台抽，不用切过去）；底部是添加 / 导入 / 账号管理 / 设置
const LaunchPick = {
  busy: false, cache: null, cacheAt: 0,
  // 预读账号列表（精简版，不含对话明细）：启动后 / 回到前台时读一次，点「切换账号」时不用再等
  preload() {
    if(this.pending)return this.pending;
    const readAt=now();
    this.pending=PanelWork.wait(()=>Host.listAccounts(true)).then(L=>{if(Array.isArray(L)){this.cache=AccountPicker.mergeRead(L,readAt);this.cacheAt=now();L=this.cache;}return L;}).catch(()=>null).finally(()=>{this.pending=null;});
    return this.pending;
  },
  async show(opt = {}) {
    if(document.querySelector('.lpick:not(.out)'))return;
    const back=h('div',{class:'lpick',role:'dialog','aria-label':'选择账号'});
    let tick=()=>{}, wheelStop=()=>{};
    const alive=()=>back.isConnected&&!back.classList.contains('out');
    const close=()=>{tick();wheelStop();back.classList.add('out');setTimeout(()=>back.remove(),200);};
    const status=h('div',{class:'lp-load',role:'status','aria-live':'polite'},'正在读取账号…');
    back.append(h('div',{class:'lp-box'},h('div',{class:'lp-h'},h('b',{},'选择账号'),h('button',{class:'ib',title:'关闭',onclick:close},icon('x'))),status));
    document.body.append(back);
    document.querySelectorAll('.asheet-back:not(.anc-gh)').forEach(x=>x.remove());
    // The close button must paint before any bridge call, sorting, or card construction.
    await PanelWork.frame();if(!alive())return;
    try { if (typeof Shared !== 'undefined' && Shared.pull) await Shared.pull(); } catch {}
    const fromCache=!opt.list&&Array.isArray(this.cache)&&now()-this.cacheAt<120e3;
    let accts=opt.list||(fromCache?this.cache:null)||await this.preload();
    if(!alive())return;
    if(!Array.isArray(accts)){
      status.replaceChildren(h('p',{},'账号读取失败或超时，界面仍可关闭。'),h('button',{class:'btn',onclick:()=>{back.remove();void this.show(opt);}},'重试'));return;
    }
    accts=AccountPicker.mergeRead(accts.slice());
    if (!opt.back && accts.every(a => !a.email && !a.hasPw) && typeof QrSync !== 'undefined' && QrSync.isFirstTimeNoCache?.()) {
      back.remove();
      try { UI.loginGate?.(); } catch {}
      return;
    }
    const cur=UI.host?.account?.id;
    // 抽卡按钮（原「切换账号」面板里的）：当前账号 = 输入框旁边那个抽卡面板；多账号后台运行时，其他账号 = 那个账号自己的抽卡面板，START 后在后台抽
    const multi = !!Host.gachaAccount; let gb = null, swipe = null; const gbs = [];
    const gachaBtn = a => {
      // 当前账号和其他账号一样：就在选择页上弹出抽卡设置，直接配置 / 开始（不再先跳进对话页）
      // 冷启动时选择页比登录核对先出来（那时还不知道是否已登录）：当前账号的按钮照样显示，点 START 时等连上再开始
      if (a.id === cur) return gb = GPop.acctBtn(a, true);
      // 其他账号：能后台多开 → 在后台抽；不能（单账号模式）→ 按钮照样有，START 时切换到那个账号自动开始
      if ((multi || Host.gachaSwitch) && a.id !== cur) { const g = GPop.acctBtn(a, false); gbs.push([g, a.id]); return g; }
      return null;
    };
    // 进入账号：先测 IP 连接（进度条）+ 同时载入缓存，再同步，全部完成后页面淡入（EnterFlow）
    const enter = a => { close(); if (a.id !== cur) { if (Host.enterAccount) Host.enterAccount(a.id); else { toast('正在切换到 ' + emailUser(a) + '…'); Host.openAccount(a.id); } } else EnterFlow.go(); };
    // 整卡绿色填充：余额/总额优先，缺失时使用 Pulse；未知百分比不伪造。
    const balOf = a => AccountPicker.balance(a);
    // 抽卡进度那一行（原来余额进度条的位置）：抽卡中 = 进度条 + n/N · 命中；没在抽 = 上次结果 / 未运行
    const paintGp = (el, g) => {
      if (!el) return;
      const sig=JSON.stringify([g.total,g.done,g.busy,g.cap,g.hits,g.phase,g.err,el._account?.status?.quota]);if(el._paint===sig)return;el._paint=sig;
      const total = g.total || 0, done = g.done || 0, pct = g.busy ? (total === '∞' ? 100 : Math.min(100, done / (total || 1) * 100)) : (g.done ? Math.min(100, done / (total || done || 1) * 100) : 0);
      el.classList.toggle('on', !!g.busy); el.classList.toggle('err', !g.busy && !!g.err);
      el.querySelector('i').style.width = pct + '%';
      el.querySelector('span').textContent = AccountPicker.progress(el._account, g);
      el.title = g.busy || g.err ? el.querySelector('span').textContent : '新对话剩余 / 上限：' + AccountPicker.quota(el._account);
    };
    const gpState = id => { const isC = id === cur; return GPop.acctState(id, !!isC); };
    const card = a => {
      const isCur = a.id === cur;
      if (isCur && typeof AcctStats !== 'undefined' && typeof AcctStats.compute === 'function' && typeof History !== 'undefined' && (History.lastLoad || History.cached)) {
        try { a.status = { ...(a.status || {}), stats: AcctStats.compute() }; } catch {}
      }
      const st = a.status || {}, S = StatUI.regold(st.stats);
      const vs = S ? StatUI.vendors(S) : [];
      const { q, pct } = balOf(a);
      const hasUsd = Number.isFinite(q.usd), used = hasUsd && Number.isFinite(q.allowance) ? Math.max(0, q.allowance - q.usd) : null;
      const going = st.gacha?.busy && !/限流|冷却|额度/.test(st.gacha.phase || '');
      const blocked = q.blockedUntil && q.blockedUntil > now() && !going && !(Number.isFinite(q.chatRemaining) && q.chatRemaining > 0);
      const g = gachaBtn(a);
      if (!g && a.id !== cur) GPop.remote.set(a.id, st.gacha || null);
      // 右上角：余额百分比 + 余额/总额，下面一行小字注释已用多少（新对话额度放在提示里）
      const tip = [pct != null ? '剩余 ' + Math.round(pct) + '%' : '', hasUsd ? '余额 $' + (+q.usd).toFixed(2) + (Number.isFinite(q.allowance) ? ' / 总额 $' + Math.round(q.allowance) : '') : '', used != null ? '已用 $' + used.toFixed(2) : '', Number.isFinite(q.chatRemaining) ? '新对话（本小时）' + q.chatRemaining + (Number.isFinite(q.chatLimit) ? '/' + q.chatLimit : '') : ''].filter(Boolean).join(' · ');
      const bal = h('span', { class: 'lp-bal', title: tip }, h('span', { class: 'lp-b1' }, h('span', { class: 'lp-usd acct-money' })), h('small', { class: 'acct-used' }));
      const gp = h('div', { class: 'lp-gp' }, h('b', { class: 'lp-gt' }, h('i')), h('span'));
      gp._account = a; paintGp(gp, gpState(a.id));
      const isBad = st.loggedIn === false;
      const isBg = !isCur && !!(a.win || a.live || st.gacha?.busy || st.statsBusy);
      const c = h('div', { class: 'acard lpc lpc2' + (isCur ? ' cur' : '') + (isBg ? ' is-bg' : '') + (isBad ? ' is-bad' : '') + (g ? ' has-g' : ''), title: a.email || '', onclick: ev => { if (!ev.target.closest('button,.lp-vd')) enter(a); } },
        h('div', { class: 'lp-top2' },
          h('div', { class: 'lp-id' },
            h('div', { class: 'aname' }, h('span', { class: 'an-t', title: AccountPicker.name(a) }, AccountPicker.name(a)), AccountPicker.editButton(a, () => { accts = AccountPicker.mergeRead(accts); if (alive()) void render(); }), ...K(isCur ? h('span', { class: 'tagb' }, opt.back ? '当前' : '上次') : null, isBad ? h('span', { class: 'tagb bad' }, '登录异常') : null,
              isBg ? h('span', { class: 'tagb bg-run', title: '在后台运行（切过去不用重新载入）' }, '后台') : null,
              blocked ? h('span', { class: 'tagb bad' }, '限流至 ' + fmtClock(q.blockedUntil)) : null)),
            h('small', { class: 'ac-l2' }, ...acctIpLine(a), S ? h('span', { class: 'dim' }, '· ' + S.total + ' 个对话') : null)),
          bal),
        gp, h('span', { class: 'acct-pct' }));
      // 整张卡片就是余额进度条：剩多少，卡片从左往右就有多少被染成对应的颜色
      AccountPicker.paintBalance(c, a);
      if (g) { g.dataset.name = AccountPicker.name(a); g.classList.add('lp-gb'); c.append(g); c._g = g; }
      c._gp = gp; c._id = a.id;
      // 厂商一行图标（和电脑版账号管理一样）：图标后面的金色数字 = 金色对话数；点图标在下面展开这个厂商的型号
      const body = h('div', { class: 'lp-gold' });
      if (!S) body.append(h('div', { class: 'lp-none dim' }, '未同步：打开这个账号后自动统计'));
      else {
        const detail = h('div', { class: 'lp-vd', hidden: true }); let openV = null;
        const gnOf = (vid, v) => (Gold.manual || typeof Gold.isUnifiedGold === 'function' || StatUI.GOLD.includes(vid)) ? (v.gold?.n || 0) : 0;
        const chip = (nm, m, gold) => h('span', { class: 'mg-chip' + (gold ? ' gold' : '') }, StatUI.mname(nm), h('i', {}, String(m.n)));
        const fill = (vid, v) => {
          const all = StatUI.models(v), gold = all.filter(([, m]) => m.gold && gnOf(vid, v)), rest = all.filter(x => !gold.includes(x));
          const more = h('div', { class: 'lp-chips', hidden: true }, ...rest.map(([nm, m]) => chip(nm, m, false)));
          const mb = rest.length ? h('button', { type: 'button', class: 'lp-mb', onclick: ev => { ev.stopPropagation(); more.hidden = !more.hidden; mb.textContent = (more.hidden ? '其他 ' + rest.length + ' 个型号 ▾' : '收起 ▴'); relayout(); } }, '其他 ' + rest.length + ' 个型号 ▾') : null;
          detail.replaceChildren(...K(
            h('div', { class: 'lp-vdh' }, StatUI.vicon(vid, 14), h('b', {}, StatUI.vname(vid)), h('span', { class: 'dim' }, v.n + ' 个对话' + (gnOf(vid, v) ? ' · 金色 ' + gnOf(vid, v) : ''))),
            gold.length ? h('div', { class: 'lp-chips' }, ...gold.map(([nm, m]) => chip(nm, m, true))) : null,
            gold.length ? mb : (rest.length ? h('div', { class: 'lp-chips' }, ...rest.map(([nm, m]) => chip(nm, m, false))) : null),
            gold.length ? more : null));
        };
        const relayout = () => requestAnimationFrame(() => {
          const L = c.parentElement; if (!L) return;
          const top = c.offsetTop + c.offsetHeight / 2 - L.clientHeight / 2;
          L.scrollTo({ top: c.offsetHeight > L.clientHeight - 20 ? c.offsetTop - 10 : top, behavior: 'smooth' });
          L.dispatchEvent(new Event('scroll'));
        });
        const row = h('div', { class: 'lp-vs' }, ...vs.filter(([, v]) => (v?.n || 0) > 0).map(([vid, v]) => {
          const gn = gnOf(vid, v);
          const b = h('button', { type: 'button', class: 'lp-v' + (gn ? ' g' : ''), title: StatUI.vname(vid) + '：' + v.n + ' 个对话' + (gn ? ' · 金色 ' + gn : '') }, StatUI.vicon(vid, 17), h('b', {}, String(v.n)), gn ? h('em', { class: 'am-g' }, '★' + gn) : null);
          b.onclick = ev => {
            ev.stopPropagation();
            openV = openV === vid ? null : vid;
            if (openV) fill(vid, v); detail.hidden = !openV;
            row.querySelectorAll('.lp-v').forEach(x => x.classList.toggle('on', x === b && !!openV));
            relayout();
          };
          return b;
        }));
        body.append(row, detail);
      }
      c.append(body);
      c.dataset.hint = isCur ? (opt.back ? '轻点回到当前账号' : '轻点进入（上次用的）') : '轻点进入';
      if (isCur) c.dataset.cur = '1';
      return c;
    };
    // 仅按 Pulse 剩余百分比排序；未知的排最后，忽略旧美元缓存
    const key = a => { const { pct } = balOf(a); return pct != null ? pct : -1; };
    let query = opt.query || '', generation = 0, building = false;
    let page = Number.isInteger(opt.page) ? opt.page : Math.floor(Math.max(0, accts.slice().sort((x,y)=>key(y)-key(x)).findIndex(a=>a.id===cur))/20);
    let cards = [];
    const list = h('div', { class: 'lp-list' }), pager = h('div', { class: 'lp-pages' });
    const replaceCards = next => { swipe?.close(); const del = list.querySelector('.lp-del'); if (del) del.hidden = true; list.replaceChildren(...next, ...K(del)); };
    const render = async () => {
      const run = ++generation; building = true;
      const savedScroll = list._wheelInit ? list.scrollTop : null;
      gb = null; gbs.length = 0;
      const selection = AccountPicker.select(accts.slice().sort((x,y)=>key(y)-key(x)), query, page); page = selection.page;
      const sm = back.querySelector('.lp-ht small'); if (sm) sm.textContent = selection.rows.length + ' / ' + accts.length + ' 个账号 · 按余额排序 · 轻点中间卡片进入 · 左滑删除';
      pager.hidden = selection.pages <= 1;
      pager.replaceChildren(h('button', { class: 'btn ghost sm', disabled: page === 0, onclick: () => { list._wheelInit = false; page--; void render(); } }, '上一页'), h('span', {}, '第 ' + (page + 1) + ' / ' + selection.pages + ' 页'), h('button', { class: 'btn ghost sm', disabled: page === selection.pages - 1, onclick: () => { list._wheelInit = false; page++; void render(); } }, '下一页'));
      const next = [];
      for (const a of selection.visible) { next.push(card(a)); if (next.length % 12 === 0 && next.length < selection.visible.length) { await PanelWork.frame(); if (!alive() || run !== generation) return; } }
      if (!alive() || run !== generation) return;
      wheelStop(); cards = next; list.style.paddingTop = ''; list.style.paddingBottom = ''; replaceCards(cards);
      if (savedScroll !== null) { list._keepScrollTop = savedScroll; list.scrollTop = savedScroll; }
      if (!cards.length) list.append(h('p', { class: 'acct-empty', role: 'status' }, accts.length ? '没有匹配的账号，试试其他名称或清空搜索。' : '还没有账号，请添加或导入。'));
      wheelStop = acctWheel(list);
      if (savedScroll !== null) { list._keepScrollTop = savedScroll; list.scrollTop = Math.min(savedScroll, Math.max(0, list.scrollHeight - list.clientHeight)); }
      building = false;
      if (gbs.length) void Promise.all(gbs.map(async ([b, id]) => { if (run !== generation || !b.isConnected) return; await Gacha.loadAcct(id); if (alive() && run === generation && b.isConnected) GPop.paintAcct(b, GPop.acctState(id, false)); }));
    };
    const search = AccountPicker.search(value => { query = value; page = 0; void render(); }, query);
    back.replaceChildren(h('div', { class: 'lp-box' },
      h('div', { class: 'lp-h' }, h('span', { class: 'lp-ht' }, h('b', {}, '选择账号'), h('small', {}, accts.length + ' 个账号 · 按余额排序 · 轻点中间的卡片进入 · 左滑删除')),
        h('button', { class: 'ib', title: opt.back ? '返回当前账号' : '关闭（用上次的账号）', onclick: close }, icon('x'))),
      search, pager, list,
      // 底部一排：搜索 · 账户管理 ·【添加账号】· 导入 · 导出
      AccountPicker.dock(search, close),
      // 最底下一行小字：金色说明（点开 / 收起）
      h('div', { class: 'lp-note' },
        h('button', { type: 'button', class: 'lp-gn', onclick: ev => { const b = ev.currentTarget; const on = b.classList.toggle('open'); b.querySelector('span').textContent = on ? (Gold.manual ? '金色：手动点亮的型号。厂商图标后面的数字 = 这个账号里点亮型号的对话数，在「榜单 → 金色 设置」里改。' : '金色只算 Claude / GPT：厂商图标后面的数字 = 这个账号里这个厂商最高版本、最强一档的对话数；其他厂商显示 0。点图标展开看各型号。') : (Gold.manual ? '金色：手动点亮' : '金色只算 Claude / GPT'); } }, h('span', {}, Gold.manual ? '金色：手动点亮' : '金色只算 Claude / GPT'), icon('chev')),
        null)));
    // 左滑删除账号（在 render 前挂载，确保捕获阶段优先拦截左滑后的点击，并保留 .lp-del 按钮）
    swipe = swipeDel(list, async c => {
      const a = accts.find(x => x.id === c._id); if (!a) return false;
      if (accts.length <= 1) { toast('至少要保留一个账号'); return false; }
      const isC = a.id === cur, nm = a.email || emailUser(a) || a.name || '账号';
      if (!await Dialog.confirm({ title: '删除账号', text: '删除账号「' + nm + '」？\n这个账号在本机的登录状态、缓存和保存的密码会一并清除，不能恢复（Brana 上的账号本身不受影响）。' + (isC ? '\n这是当前账号：删除后自动切换到其他账号。' : ''), ok: '删除', danger: true })) return false;
      if (isC) {
        const o = accts.find(x => x.id !== cur);
        close();
        if (Host.platform !== 'android') { await Host.openAccount(o.id); }
        try { removeCheck(await Host.removeAccount(a.id)); toast('已删除「' + nm + '」，切换到 ' + emailUser(o)); }
        catch (e) { toast('删除失败：' + describe(e), 'err'); }
        return false;
      }
      try { removeCheck(await Host.removeAccount(a.id)); } catch (e) { toast('删除失败：' + describe(e), 'err'); return false; }
      removedIds.add(a.id); list._keepScrollTop = list.scrollTop; accts.splice(accts.indexOf(a), 1); const i = cards.indexOf(c); if (i >= 0) cards.splice(i, 1);
      const sm = back.querySelector('.lp-ht small'); if (sm) sm.textContent = accts.length + ' 个账号 · 按余额排序 · 轻点中间的卡片进入 · 左滑删除';
      Nodes.refreshAccts?.()?.catch?.(() => {});
      LaunchPick.cache = accts;
      toast('已删除「' + nm + '」'); if (alive()) await render();
      return false;
    });
    await render(); if (!alive()) return;
    const removedIds = new Set();
    const refresh=async live=>{
      if (now() - (list._touchAt || 0) < 1500 || list.querySelector('.sw-anim')) return;
      const L=await this.preload();if(!live()||!Array.isArray(L)||building)return;
      if (now() - (list._touchAt || 0) < 1500 || list.querySelector('.sw-anim')) return;
      const fresh=AccountPicker.mergeRead(L).filter(a => !removedIds.has(a.id));
      const statSig=a=>{const s=a?.status?.stats;return s?`${s.total}:${Object.entries(s.vendors||{}).map(([k,v])=>k+':'+(v?.n||0)+':'+(v?.gold?.n||0)).join(',')}`:'';};
      const lpDigest=arr=>arr.map(a=>`${a.id}|${a.remark||''}|${a.email||''}|${statSig(a)}`).join('\n');
      const changed=lpDigest(fresh)!==lpDigest(accts);
      accts=fresh;
      if(changed){await render();return;}
      const byId=new Map(accts.map(a=>[a.id,a]));
      for(const [b,id] of gbs){const x=byId.get(id),old=GPop.remote.get(id);if(x&&!(/启动中/.test(old?.phase||'')&&now()-(old.at||0)<4000&&!x.status?.gacha?.busy))GPop.remote.set(id,x.status?.gacha||null);GPop.paintAcct(b,GPop.acctState(id,false));}
      if(gb)GPop.paintAcct(gb,GPop.acctState(cur,true));
      for(const c of cards){const a=byId.get(c._id);if(a){AccountPicker.paintBalance(c,a);c._gp._account=a;}paintGp(c._gp,gpState(c._id));}
      if(GPop.isOpen()&&GPop.target&&!GPop.root.activeElement?.matches?.('input,textarea'))GPop.fill();
    };
    tick=PanelWork.poll(back,refresh,2000);
    if(fromCache)setTimeout(()=>{if(alive()&&!document.hidden)void refresh(alive);},350);

  },
};
// ---------- 手机：从选账号页进入账号 → 「连接测试 → 缓存 → 同步」进度层，完成后淡出露出已画好的页面 ----------
const EnterFlow = {
  el: null, run: 0, pct: 0, goal: 0, raf: 0,
  on() { return !!this.el?.isConnected && !this.el.classList.contains('out'); },
  build() {
    const a = UI.host?.account || {}, me = UI.me || Store.get('me:u', null) || {};
    const who = a.email || me.email || '';
    const step = (k, t) => h('div', { class: 'ef-st', 'data-k': k }, h('i', { class: 'ef-ic' }), h('div', { class: 'ef-tx' }, h('b', {}, t), h('small', {}, '等待中')));
    this.bar = h('i');
    this.pctEl = h('span', { class: 'ef-pct' }, '0%');
    this.foot = h('div', { class: 'ef-foot' });
    const el = h('div', { class: 'eflow' }, h('div', { class: 'ef-box' },
      h('div', { class: 'ef-av', style: { background: avColor?.(who) || 'var(--acc)' } }, (emailUser({ email: who }) || '?').slice(0, 1).toUpperCase()),
      h('div', { class: 'ef-who' }, h('b', {}, emailUser({ email: who }) || '账号'), h('small', {}, who)),
      h('div', { class: 'ef-bar' }, this.bar), this.pctEl,
      h('div', { class: 'ef-steps' }, step('ip', '测试 IP 连接'), step('cache', '载入本地缓存'), step('sync', '同步对话')),
      this.foot));
    return el;
  },
  set(k, st, txt) {
    const r = this.el?.querySelector(`.ef-st[data-k="${k}"]`); if (!r) return;
    r.className = 'ef-st ' + st; if (txt != null) r.querySelector('small').textContent = txt;
  },
  // 进度条：平滑追到目标值；等待中缓慢前移（不会停住不动）
  to(g) { this.goal = Math.max(this.goal, g); if (!this.raf) this.tick(); },
  tick() {
    this.raf = requestAnimationFrame(() => {
      this.raf = 0; if (!this.el) return;
      const d = this.goal - this.pct;
      this.pct += d > 0.2 ? d * 0.16 : (this.goal < 100 ? 0.03 : d);
      if (this.pct > 99.5 && this.goal < 100) this.pct = 99.5;
      this.bar.style.width = this.pct.toFixed(1) + '%'; this.pctEl.textContent = Math.round(this.pct) + '%';
      if (this.pct < 100) this.tick();
    });
  },
  // 进入账号（选账号页 / 切换账号 / 后台切回来）：先只确认 IP 连通——通了（2.5 秒内）就直接进，不显示进度页，同步在后台做；
  // 不通或很慢才显示完整的「测试 IP / 缓存 / 同步」进度页（可重试 / 改代理）
  async go(opt = {}) {
    if (!opt.full) {
      const id = ++this.run;
      this.el?.remove(); this.el = null;
      document.querySelectorAll('.asheet-back:not(.anc-gh),.tsw').forEach(x => x.remove()); document.body.classList.remove('drawer');
      // 进入账号自检（连通 + 纯净度）：后台无感自检与同步，不阻断页面、不重置已连通的共享节点连接
      this.quiet();
      const r = await EnvCheck.go({ reason: 'enter', force: false, failover: true });
      if (id !== this.run || r.stale) return;
      return;
    }
    const id = ++this.run, alive = () => id === this.run && this.el?.isConnected;
    this.el?.remove(); this.pct = 0; this.goal = 0;
    this.el = this.build(); document.body.append(this.el); this.to(6);
    document.querySelectorAll('.asheet-back:not(.anc-gh),.tsw').forEach(x => x.remove()); document.body.classList.remove('drawer');
    const t0 = now(), min = ms => sleep(Math.max(0, ms - (now() - t0)));
    // 1) IP 连接（走这个账号自己的代理）  2) 同时载入缓存
    this.set('ip', 'run', '正在连接…'); this.set('cache', 'run', '读取中…');
    const cache = (async () => {
      for (let i = 0; i < 60 && !(Tabs.list.length && $('#view')?.children.length); i++) await sleep(50);
      await min(450); if (!alive()) return;
      const n = History.items.length, tn = Tabs.list.filter(t => t.sid).length;
      this.set('cache', 'ok', n ? `${n} 个对话 · ${tn} 个标签页` : '没有缓存（首次打开）'); this.to(this.goal + 22);
    })();
    let ok = false, fails = 0;
    for (;;) {
      const ts = now(); IP.at = 0; await IP.poll(); if (!alive()) return;
      if (!IP.err && IP.ip) {
        ok = true; const reg = UI.host?.account?.region, cc = String(IP.loc || '').toUpperCase();
        const ms = now() - ts, mis = reg && cc && reg.toUpperCase() !== cc;
        this.set('ip', mis ? 'warn' : 'ok', `连接正常 · ${ccF(cc)} ${IP.ip} · ${ms}ms${mis ? ' · 与绑定地区 ' + ccF(reg) + ' 不符' : ''}`);
        this.to(this.goal + 38); break;
      }
      fails++;
      // 冷启动第一次常因内核 / 隧道还没就绪而超时：立刻再试一次
      if (fails === 1) { this.set('ip', 'run', '首次连接没有响应，重试中…'); continue; }
      // 仍然不通：自动换到能用的线路（其他节点 / 同地区纯净 ProxyIP），不弹确认、不用手动点
      if (fails === 2 && typeof AutoRoute !== 'undefined' && AutoRoute.engine && AutoRoute.enabled()) {
        this.set('ip', 'run', '当前线路不通，正在自动切换到可用线路…');
        const off = Bus.on('route-state', () => { if (alive() && AutoRoute.busy) this.set('ip', 'run', '自动切换：' + AutoRoute.status); });
        let r = null; AutoRoute.noConfirm = true;
        try { for (let i = 0; i < 10 && alive(); i++) { r = await AutoRoute.request('startup', true); if (!r?.busy) break; await sleep(1000); } }
        finally { AutoRoute.noConfirm = false; off(); }
        if (!alive()) return;
        if (r?.ok) { this.set('ip', 'run', r.changed ? '已切换到 ' + r.label + '，正在连接…' : '线路检测通过，正在连接…'); await sleep(500); continue; }
        this.set('ip', 'bad', '自动切换未成功：' + (r?.error || '没有可用线路'));
      } else this.set('ip', 'bad', '连接失败：' + (IP.err || '没有返回 IP'));
      const act = await new Promise(res => this.foot.replaceChildren(
        h('button', { class: 'btn sm', onclick: () => res('retry') }, icon('refresh'), '重试'),
        h('button', { class: 'btn ghost sm', onclick: () => res('proxy') }, icon('globe'), 'ProxyIP 列表'),
        h('button', { class: 'btn ghost sm', onclick: () => res('skip') }, '仍然进入')));
      if (!alive()) return; this.foot.replaceChildren();
      if (act === 'proxy') { this.close(); ProxySet.open(); return; }
      if (act === 'skip') break;
      this.set('ip', 'run', '正在重新连接…'); fails = 1;   // 手动重试：再失败一次就重新自动切换
    }
    await cache; if (!alive()) return;
    // 3) 同步：对话列表 + 当前对话拉最新（最多等 9 秒，不卡在这里）
    this.set('sync', 'run', ok ? '正在同步…' : '网络不通，跳过');
    if (ok) {
      const ts = now();
      for (let i = 0; i < 240 && !UI.authed; i++) await sleep(50);
      if (!UI.me) { this.set('sync', 'warn', '需要登录'); }
      else {
        const c = Tabs.cur?.sid ? chatOf(Tabs.cur.sid) : null;
        const job = Promise.allSettled([History.refresh(), c && !c.busy && !c.gacha ? c.load(!!c.loaded) : null]);
        const done = await Promise.race([job.then(() => true), sleep(9000).then(() => false)]); if (!alive()) return;
        try { Sync.kick(); } catch {}
        this.set('sync', done ? 'ok' : 'warn', done ? `已同步 · ${now() - ts}ms` : '同步较慢，后台继续');
      }
    } else this.set('sync', 'warn', '网络恢复后自动同步');
    this.to(100); await min(900); await sleep(260);
    if (alive()) this.close();
  },
  // IP 通了：后台同步对话列表 + 当前对话（不挡界面）
  quiet() {
    (async () => {
      for (let i = 0; i < 240 && !UI.authed; i++) await sleep(50);
      if (!UI.me) return;
      const c = Tabs.cur?.sid ? chatOf(Tabs.cur.sid) : null;
      await Promise.allSettled([History.refresh(), c && !c.busy && !c.gacha ? c.load(!!c.loaded) : null]);
      try { Sync.kick(); } catch {}
    })().catch(() => {});
  },
  close() {
    const el = this.el; if (!el) return; this.run++; this.el = null;
    cancelAnimationFrame(this.raf); this.raf = 0;
    el.classList.add('out'); setTimeout(() => el.remove(), 320);
  },
};
window.__ancEnter = () => { try { EnterFlow.go(); } catch {} };
window.__ancPick = () => { try { LaunchPick.show({ back: true }); } catch {} };

// ---------- 桌面：账号管理窗口（独立窗口，本地页面，不联网）----------
// 数据都来自各账号窗口自己上报的统计；「同步」「统计轮数」「打开对话」都是发命令给那个账号的窗口去做（走它自己的 IP）
const MgrWin = {
  accts: [], sel: new Set(), open: new Set(), sig: '', gbs: new Map(),
  boot() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    document.documentElement.dataset.theme = /[?&]dark=1\b/.test(location.search) ? 'dark' : 'light';
    try { this.sel = new Set(JSON.parse(localStorage.getItem('mgrSel') || '[]')); this.open = new Set(JSON.parse(localStorage.getItem('mgrOpen') || '[]')); } catch {}
    this.list = h('div', { class: 'mg-list' });
    this.sum = h('span', { class: 'dim' });
    this.allBox = h('input', { type: 'checkbox', onchange: e => { this.accts.forEach(a => e.target.checked ? this.sel.add(a.id) : this.sel.delete(a.id)); this.keep(); this.render(true); } });
    const bar = h('div', { class: 'mg-bar' },
      h('label', { class: 'mg-all' }, this.allBox, '全选'),
      h('button', { class: 'btn sm', onclick: () => this.batch('start') }, icon('slot'), '批量开始抽卡'),
      h('button', { class: 'btn sm ghost', onclick: () => this.batch('stop') }, icon('stop'), '批量停止'),
      h('button', { class: 'btn sm ghost', onclick: () => this.batch('stats') }, icon('refresh'), '批量同步统计'),
      h('span', { class: 'grow' }), this.sum);
    document.body.classList.add('mgrw');
    document.body.append(h('div', { id: 'mg' },
      h('div', { class: 'mg-title' }, icon('grid'), h('b', {}, '账号管理'), h('span', { class: 'dim' }, '每个账号的数据都由它自己的窗口（自己的节点 / 地区 IP）统计，这里只显示，不联网')),
      bar, h('div', { class: 'mg-scroll' }, this.list)));
    this.refresh(); PanelWork.poll(document.querySelector('#mg'),()=>this.refresh(),2000);
    setTimeout(() => { try { Host.ready?.()?.catch?.(() => {}); } catch {} }, 50);
    addEventListener('keydown', e => { if (e.key === 'Escape' && GPop.isOpen?.()) GPop.close(); });
  },
  keep() { try { localStorage.setItem('mgrSel', JSON.stringify([...this.sel])); localStorage.setItem('mgrOpen', JSON.stringify([...this.open])); } catch {} },
  async refresh() {
    if(this.refreshing||document.hidden)return;this.refreshing=true;
    try {
    const list = await PanelWork.wait(()=>Host.listAccounts()).catch(() => null); if (!list) return;
    // 推理分排行里点亮的金色型号：各账号窗口改了点亮设置后这里跟着变
    try { const p = await Host.shared('prefs'); if (p && typeof p === 'object') { Prefs.goldMode = p.goldMode; Prefs.goldSet = p.goldSet; } } catch {}
    this.accts = list;
    for (const a of list) { const old = GPop.remote.get(a.id); if (!(old?.phase === '启动中' && now() - (old.at || 0) < 4000 && !a.status?.gacha?.busy)) GPop.remote.set(a.id, a.status?.gacha || null); }
    this.render();
    for (const [id, b] of this.gbs) if (b.isConnected) GPop.paintAcct(b, GPop.acctState(id, false));
    if (GPop.isOpen?.() && GPop.target && !GPop.root.activeElement?.matches?.('input,textarea')) GPop.fill();
    }finally{this.refreshing=false;}
  },
  async batch(kind) {
    const ids = this.accts.filter(a => this.sel.has(a.id)).map(a => a.id);
    if (!ids.length) { toast('先勾选账号'); return; }
    let ok = 0;
    for (const id of ids) {
      const r = kind === 'stats' ? await Host.acctCmd(id, { stats: 1 }).catch(e => ({ error: e.message })) : await Host.gachaAccount(id, kind).catch(e => ({ error: e.message }));
      if (r?.ok) ok++; else if (r?.error) toast((this.accts.find(a => a.id === id)?.name || id) + '：' + r.error, 'err');
      if (kind === 'start') { GPop.remote.set(id, { ...(GPop.remote.get(id) || {}), busy: true, phase: '启动中', at: now() }); await sleep(600); }
    }
    toast({ start: '已开始抽卡', stop: '已停止抽卡', stats: '已开始同步统计' }[kind] + ' · ' + ok + '/' + ids.length + ' 个账号');
    this.refresh();
  },
  toggle(k) { this.open.has(k) ? this.open.delete(k) : this.open.add(k); this.keep(); this.render(true); },
  // 每张卡片单独比较，只换变了的那张；抽卡按钮跨渲染复用同一个元素 → 抽卡弹窗的锚点不会因为刷新被换掉而关闭
  cardSig(a, goldKey = '') {
    const st = a.status || {}, g = st.gacha || {}, q = st.quota || {};
    const openK = this._openByAcct?.get(a.id) || '';
    return `${a.name || ''}|${a.email || ''}|${a.region || ''}|${a.proxy || ''}|${a.win || ''}|${st.loggedIn}|${st.ip || ''}|${st.loc || ''}|${st.stats?.at || 0}|${st.statsBusy || ''}|${st.statsErr || ''}|${g.busy ? 1 : 0}|${g.done || 0}|${g.total || 0}|${g.hits || 0}|${g.err || ''}|${q.pulse ?? ''}|${q.usd ?? ''}|${q.allowance ?? ''}|${q.chatRemaining ?? ''}|${q.blockedUntil > now() ? 1 : 0}|${this.sel.has(a.id) ? 1 : 0}|${openK}|${goldKey}`;
  },
  cards: new Map(),
  render(force) {
    const goldKey = Gold.manual ? '1:' + [...Gold.set()].sort().join(',') : '0';
    const openByAcct = new Map();
    for (const k of this.open) {
      const i = k.indexOf('|');
      if (i > 0) { const aid = k.slice(0, i); openByAcct.set(aid, (openByAcct.get(aid) ? openByAcct.get(aid) + ',' : '') + k); }
    }
    this._openByAcct = openByAcct;
    const sigs = this.accts.map(a => [a, this.cardSig(a, goldKey)]);
    const sig = sigs.map(([a, s]) => a.id + ':' + s).join('\n');
    if (!force && sig === this.sig) return; this.sig = sig;
    const sc = this.list.parentElement?.scrollTop || 0;
    const busyN = this.accts.filter(a => a.status?.gacha?.busy).length;
    this.sum.textContent = this.accts.length + ' 个账号' + (busyN ? ' · ' + busyN + ' 个抽卡中' : '') + (this.sel.size ? ' · 已选 ' + this.accts.filter(a => this.sel.has(a.id)).length : '');
    this.allBox.checked = this.accts.length > 0 && this.accts.every(a => this.sel.has(a.id));
    const ids = new Set(this.accts.map(a => a.id));
    for (const id of [...this.gbs.keys()]) if (!ids.has(id)) { this.gbs.delete(id); this.cards.delete(id); }
    const els = sigs.map(([a, k]) => { const c = this.cards.get(a.id); if (c && c.sig === k) return c.el; const el = this.card(a); this.cards.set(a.id, { sig: k, el }); return el; });
    patchKids(this.list, els.length ? els : [h('div', { class: 'empty' }, '还没有账号')]);
    if (this.list.parentElement) this.list.parentElement.scrollTop = sc;
  },
  card(a) {
    const st = a.status || {}, S = StatUI.regold(st.stats), id = a.id;
    let gb = this.gbs.get(id); if (!gb) { gb = GPop.acctBtn(a, false); this.gbs.set(id, gb); } else gb.dataset.name = emailUser(a);
    Gacha.loadAcct(id).then(() => { if (gb.isConnected) GPop.paintAcct(gb, GPop.acctState(id, false)); });
    const g = st.gacha || {};
    const head = h('div', { class: 'mg-h' },
      h('input', { type: 'checkbox', checked: this.sel.has(id) || null, onchange: e => { e.target.checked ? this.sel.add(id) : this.sel.delete(id); this.keep(); this.render(true); } }),
      h('span', { class: 'av', style: { background: avColor(a.email || a.name) } }, (a.email || a.name || '?')[0].toUpperCase()),
      h('span', { class: 'acol' },
        h('span', { class: 'aname', title: a.email || '' }, emailUser(a),
          a.win === 'shown' ? h('span', { class: 'tagb' }, '窗口已开') : a.win === 'hidden' ? h('span', { class: 'tagb dim' }, '后台运行') : null,
          st.loggedIn === false ? h('span', { class: 'tagb warn' }, '未登录') : null,
          g.busy ? h('span', { class: 'tagb gtag2' }, '抽卡中 ' + (g.done || 0) + '/' + (g.total || '?') + (g.hits ? ' · 命中 ' + g.hits : '')) : g.err ? h('span', { class: 'tagb warn', title: g.err }, '抽卡已停') : null),
        h('small', {}, StatUI.where(a)),
        h('span', { class: 'aq mg-q' }, ...quotaBits(st))),
      h('span', { class: 'mg-sync dim' }, st.statsBusy ? h('i', { class: 'spin' }) : null, st.statsBusy || (st.statsErr ? '⚠ ' + st.statsErr : S ? '统计于 ' + StatUI.ago(S.at) + (S.full ? '' : ' · 列表未拉完') : '未同步')),
      h('button', { class: 'ib', title: '同步统计（在这个账号自己的窗口里拉取对话列表；没开窗口就在后台开一个，完了自动关）', onclick: () => Host.acctCmd(id, { stats: 1 }).then(() => this.refresh()) }, icon('refresh')),
      gb,
      h('button', { class: 'btn sm ghost', onclick: () => Host.openAccount(id) }, '打开窗口'));
    const body = h('div', { class: 'mg-b' });
    if (!S) body.append(h('div', { class: 'dim mg-empty' }, '还没有统计数据：打开这个账号的窗口后自动统计，或点右上角的同步。'));
    else {
      const vs = StatUI.vendors(S);
      body.append(h('div', { class: 'mg-vs' }, ...vs.map(([vid, v]) => {
        const k = id + '|' + vid;
        return h('button', { class: 'mg-v' + (this.open.has(k) ? ' on' : '') + (v.gold?.n && (Gold.manual || typeof Gold.isUnifiedGold === 'function' || StatUI.GOLD.includes(vid)) ? ' g' : ''), title: StatUI.vname(vid) + '：' + v.n + ' 个对话' + (v.gold?.n ? ' · 金色 ' + v.gold.n : ''), onclick: () => this.toggle(k) },
          StatUI.vicon(vid, 15), h('b', {}, v.n), v.gold?.n ? h('span', { class: 'mg-vg' }, '★' + v.gold.n) : null);
      })));
      for (const [vid, v] of vs) if (this.open.has(id + '|' + vid)) body.append(this.vendorTable(a, vid, v));
    }
    return h('section', { class: 'mg-card' + (this.sel.has(id) ? ' sel' : '') }, head, body);
  },
  vendorTable(a, vid, v) {
    const id = a.id, rows = [], all = StatUI.models(v);
    // 只显示在推理分排行里点亮（金色）的型号；没点亮的收进「其他」
    const gold = all.filter(([, m]) => m.gold), rest = all.filter(([, m]) => !m.gold), ko = id + '|' + vid + '|~other', oOpen = this.open.has(ko);
    for (const [nm, m] of [...gold, ...(oOpen ? rest : [])]) {
      const k = id + '|' + vid + '|' + nm, open = this.open.has(k), unknown = m.list.filter(x => !x[2]).map(x => x[0]);
      rows.push(h('div', { class: 'mg-m' + (m.gold ? ' gold' : '') + (open ? ' on' : ''), onclick: () => this.toggle(k) },
        h('span', { class: 'mg-mn' }, icon('chev', 'mg-chev'), StatUI.mname(nm)),
        h('span', { class: 'mg-c' }, m.n + ' 个对话'),
        h('span', { class: 'mg-c' }, m.known ? m.turns + ' 轮' + (m.known < m.n ? '（' + m.known + '/' + m.n + ' 已统计）' : '') : '轮数 —'),
        h('span', { class: 'mg-c dim' }, m.known ? '平均 ' + (m.turns / m.known).toFixed(1) + ' 轮' : ''),
        unknown.length ? h('button', { class: 'link sm', title: '在这个账号自己的窗口里逐个拉取这些对话、数一下轮数', onclick: e => { e.stopPropagation(); Host.acctCmd(id, { turns: unknown }).then(() => { toast('开始统计 ' + unknown.length + ' 个对话的轮数'); this.refresh(); }); } }, '统计轮数') : h('span')));
      if (open) rows.push(h('div', { class: 'mg-chats' }, ...m.list.map(([sid, at, n, full, note, title]) => h('div', { class: 'mg-ch', title: '在这个账号的窗口里打开', onclick: () => Host.acctCmd(id, { open: sid }) },
        h('span', { class: 'mg-t' }, StatUI.when(at)), h('span', { class: 'mg-note', title: title || sid }, note ? h('b', {}, note) : null, h('span', { class: 'dim' }, (note ? ' · ' : '') + (title || sid.slice(0, 8)))),
        h('span', { class: 'mg-c' }, n ? (full ? '' : '≥') + n + ' 轮' : '—'))), m.n > m.list.length ? h('div', { class: 'dim mg-ch' }, '只显示最近 ' + m.list.length + ' 个') : null));
    }
    if (rest.length) rows.splice(gold.reduce((n, [nm]) => n + 1 + (this.open.has(id + '|' + vid + '|' + nm) ? 1 : 0), 0), 0,
      h('button', { class: 'mg-other' + (oOpen ? ' on' : ''), onclick: () => this.toggle(ko) }, icon('chev', 'mg-chev'), '其他 ' + rest.length + ' 个型号', h('span', { class: 'dim' }, ' · ' + rest.reduce((n, [, m]) => n + m.n, 0) + ' 个对话 · 未点亮')));
    return h('div', { class: 'mg-vt' }, h('div', { class: 'mg-vth' }, StatUI.vicon(vid, 15), h('b', {}, StatUI.vname(vid)), h('span', { class: 'dim' }, v.n + ' 个对话 · ' + Object.keys(v.models).length + ' 个型号' + (v.turns ? ' · 已统计 ' + v.turns + ' 轮' : ''))), ...rows);
  },
};
