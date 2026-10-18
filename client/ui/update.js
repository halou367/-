// ---------- 客户端更新：有新版本弹窗提示 → 单独小窗输入更新口令 → 下载（进度 + sha256 校验）→ 安装 ----------
// 手机：第一次要授权「安装未知应用」；授权返回后自动打开安装界面；App 被系统重启也会直接弹「安装」，不用再输口令、再下载
// 只和自己的更新服务（Cloudflare Worker）通信：GitHub 令牌、口令都在服务器上，客户端里没有任何密钥。
// 电脑版装电脑的安装包（安装版 / 便携版各自对应），手机版装 apk；口令每次都要输入，不保存。
const UPD_DEFAULT = '__UPD_URL__';
const Update = {
  info: null, at: 0, busy: false, err: '',
  url() { const u = String(Prefs.updUrl || (/^https:\/\//.test(UPD_DEFAULT) ? UPD_DEFAULT : '') || '').trim().replace(/\/+$/, ''); return /^https:\/\/[^\s/]+/.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : ''; },
  // 版本比较：0.13.84 > 0.13.84-beta.2 > 0.13.84-beta.1 > 0.13.83（测试版排在同号正式版前面）
  cmp(a, b) {
    const p = s => { const m = String(s || '').trim().replace(/^v/i, '').split('-'); const main = m[0].split('.').map(x => parseInt(x, 10) || 0); while (main.length < 3) main.push(0); return { main, pre: m.length > 1 ? m.slice(1).join('-') : '' }; };
    const x = p(a), y = p(b);
    for (let i = 0; i < Math.max(x.main.length, y.main.length); i++) { const d = (x.main[i] || 0) - (y.main[i] || 0); if (d) return d > 0 ? 1 : -1; }
    if (!x.pre || !y.pre) return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
    const q = s => s.split(/[.-]/).map(v => /^\d+$/.test(v) ? parseInt(v, 10) : v), u = q(x.pre), w = q(y.pre);
    for (let i = 0; i < Math.max(u.length, w.length); i++) { const e = u[i], f = w[i]; if (e === f) continue; if (e === undefined) return -1; if (f === undefined) return 1; if (typeof e === 'number' && typeof f === 'number') return e > f ? 1 : -1; return String(e) > String(f) ? 1 : -1; }
    return 0;
  },
  isBeta(v) { return /-/.test(String(v || '')); },
  newer() { return !!(this.info && this.cmp(this.info.version, VERSION) > 0); },
  can() { return !globalThis.BranaHost?.extensionCompatibilityTest && !!(Host.fetchText && Host.updStart); },
  async kind() { try { return (await Host.updInfo?.())?.kind || (Host.platform === 'android' ? 'apk' : 'setup'); } catch { return Host.platform === 'android' ? 'apk' : 'setup'; } },
  // 检查：启动 40 秒后一次，之后每 6 小时；manual = 设置里点「检查更新」
  async check(manual, quiet) {   // quiet：只刷新 this.info，不弹窗（「正式版」/ 测试版的「检查更新」自己决定怎么提示）
    if (!this.can()) { if (manual) toast('这个版本的客户端不支持在线更新', 'err'); return; }
    const u = this.url(); if (!u) { if (manual) this.setUrl(); return; }
    this.err = '';
    const r = await Host.fetchText(u + '/latest?t=' + (manual ? now() : Math.floor(now() / 60000))).catch(e => ({ error: cleanErr(e) }));
    let j = null; try { j = r?.text ? JSON.parse(r.text) : null; } catch {}
    if (!j || !j.version) { this.err = r?.error || j?.error || '更新服务返回格式不对'; Bus.emit('update'); if (manual) toast('检查更新失败：' + this.err, 'err'); return; }
    this.info = j; this.at = now(); Bus.emit('update');
    if (quiet) return;
    if (!this.newer()) { if (manual) toast('已经是最新版本 v' + VERSION); return; }
    const want = await this.kind();
    if (!j.files?.[want]) { if (manual) toast('新版本 v' + j.version + ' 还没有' + (want === 'apk' ? '手机' : '电脑') + '安装包（可能还在构建）', 'err'); return; }
    const sz = Prefs.updSnooze || {};
    if (manual || !(sz.v === j.version && sz.until > now())) this.prompt();
  },
  // 手机：已下载并校验好、还没装上的新版安装包（授权「安装未知应用」时系统可能重启 App，安装包和状态都还在）
  async ready() {
    if (!Host.updReady) return null;
    const r = await Host.updReady().catch(() => null);
    return r?.ver && this.cmp(r.ver, VERSION) > 0 && (!this.info || this.cmp(r.ver, this.info.version) >= 0) ? r : null;
  },
  // 多个账号窗口：只在当前有焦点的窗口弹（没焦点的等拿到焦点再看）
  // opt.info + opt.ticket：测试版（口令已经验证过，直接开始下载）
  async prompt(opt = {}) {
    if (document.querySelector('.modal.upd') || this.opening) return;
    this.opening = true; let rd = null;
    try {
      if (!opt.info && (!this.info || now() - (this.at || 0) > 15000)) {
        await this.check(false, true).catch(() => {});
      }
      rd = opt.info ? null : await this.ready();
    } finally { this.opening = false; }
    if ((!rd && !this.newer() && !opt.info) || document.querySelector('.modal.upd')) return;
    if (!opt.info && Host.platform === 'desktop' && !document.hasFocus()) { if (!this.waitF) { this.waitF = true; addEventListener('focus', () => { this.waitF = false; const sz = Prefs.updSnooze || {}; if (!(sz.v === this.info?.version && sz.until > now())) this.prompt(); }, { once: true }); } return; }
    const j = opt.info || (rd ? (this.info && !this.cmp(this.info.version, rd.ver) ? this.info : { version: rd.ver, notes: this.info?.notes || '' }) : this.info);
    const beta = this.isBeta(j.version);
    const notes = h('div', { class: 'md upd-notes' }); notes.innerHTML = MD.render(String(j.notes || (rd ? '新版本安装包已经下载并校验好，点「安装」即可。' : '（没有更新说明）')).replace(/^##?\s*Brana AI 客户端 v[\w.\-]+[^\n]*\n/, ''));
    const stepLabels = ['1. 下载更新包', '2. 完整性校验', '3. 保存会话', Host.platform === 'android' ? '4. 系统安装' : '4. 覆盖安装重启'];
    const stepItems = stepLabels.map((lbl, idx) => h('span', { class: 'upd-step', 'data-step': String(idx + 1) }, lbl));
    const stepsBox = h('div', { class: 'upd-steps', hidden: true }, ...stepItems);
    const setStepUI = activeIdx => {
      try {
        stepsBox.hidden = !(activeIdx >= 1);
        stepItems.forEach((el, idx) => {
          if (!el || typeof el !== 'object') return;
          const n = idx + 1;
          el.className = 'upd-step' + (n < activeIdx ? ' done' : n === activeIdx ? ' active' : '');
          el.textContent = (n < activeIdx ? '✓ ' : n === activeIdx ? '● ' : '') + stepLabels[idx];
        });
      } catch {}
    };
    const st = h('div', { class: 'upd-st' });
    const bar = h('div', { class: 'upd-bar', hidden: true }, h('i'));
    const later = h('button', { class: 'btn ghost', onclick: () => { Prefs.updSnooze = { v: j.version, until: now() + 12 * 3600e3 }; savePrefs(); back.remove(); } }, '稍后');
    const chgPw = h('button', { class: 'btn ghost sm', hidden: !Prefs.updPass, title: '更换已保存的更新口令', onclick: () => step(true) }, '换口令');
    const go = h('button', { class: 'btn', onclick: () => step(false) }, rd ? '立即安装' : '一键更新');
    const body = h('div', { class: 'upd-b' }, h('p', { class: 'dim upd-cur' }, '当前 v' + VERSION + ' → ' + (beta ? '测试版 v' : '新版本 v') + j.version + (j.date ? ' · ' + new Date(j.date).toLocaleDateString() : '')), notes, stepsBox, bar, st);
    const back = modal((rd ? (beta ? '测试版 v' : '新版本 v') + j.version + ' 已下载好' : opt.info ? (beta ? '测试版 v' : '新版本 v') + j.version : '发现新版本 v' + j.version), body, K(later, chgPw, h('span', { class: 'grow' }), go), 'upd');
    const say = (t, kind = '') => { st.className = 'upd-st ' + kind; st.textContent = t; };
    let stage = rd ? 'perm' : 'notes';
    if (rd) {
      setStepUI(3);
      say(rd.perm ? '安装包已下载并校验好，不用再输入口令；点「立即安装」打开系统安装界面（聊天记录和账号都会保留）' : '安装包已下载好。点「立即安装」后，在系统设置里允许 Brana AI「安装未知应用」，返回后会自动打开安装界面', 'ok');
    }
    const step = async (forcePw = false) => {
      if (stage === 'notes' || stage === 'retry') {
        go.disabled = true;
        if (!forcePw && Prefs.updPass) say('正在验证已保存的更新口令并获取高速下载通道…', 'dim');
        const t = await this.askPass(forcePw ? { forcePrompt: true } : undefined);
        go.disabled = false;
        if (!t || !back.isConnected) return;
        if (t.version && !this.cmp(t.version, VERSION)) { say('已经是 v' + VERSION + '，不用更新', 'ok'); return; }
        if (t.version && this.cmp(t.version, VERSION) < 0 && !opt.downgrade) { say('拿到的是 v' + t.version + '，比当前 v' + VERSION + ' 旧；要装回正式版请点「正式版」', 'bad'); return; }
        if (t.version && t.version !== j.version) { j.version = t.version; if (this.info) this.info = { ...this.info, version: t.version, notes: t.notes || this.info.notes || '' }; }
        stage = 'down'; later.hidden = true; chgPw.hidden = true; go.hidden = true; bar.hidden = false; back.dataset.busy = '1';
        setStepUI(1);
        if (t.quota) { const q = t.quota, nm = q.plat === 'apk' ? '手机' : '电脑'; toast(q.again ? `这台设备之前已计过次数，本次不再扣（${nm} ${q.used}/${q.max}）` : `口令已扣 1 次：本版本${nm}已用 ${q.used}/${q.max}`); }
        await this.download(t, back, bar, say, go, t.version || j.version, setStepUI);
        return;
      }
      if (stage === 'perm') { later.hidden = true; chgPw.hidden = true; setStepUI(4); say('正在打开安装界面…', 'dim'); await Host.updInstall?.(); this.watch(back, bar, say, go, setStepUI); }
    };
    this.stepRef = s => { stage = s; };
    if (opt.ticket) { stage = 'down'; later.hidden = true; chgPw.hidden = true; go.hidden = true; bar.hidden = false; back.dataset.busy = '1'; setStepUI(1); say('正在下载…', 'dim'); this.download(opt.ticket, back, bar, say, go, j.version, setStepUI); }
  },
  // 点版本号 / 「检查更新」：不管有没有更新都查一次，并明确告诉结果。
  // 测试版（版本号带 -beta）查测试版通道（/beta/latest，不需要口令；下载时才要测试版口令）；正式版查正式版通道（/latest）。
  async checkNow() {
    if (!this.can()) { toast('这个版本的客户端不支持在线更新', 'err'); return; }
    const u = this.url(); if (!u) { this.setUrl(); return; }
    if (!this.isBeta(VERSION) || Prefs.updChannel === 'stable') { toast('正在检查正式版更新…'); return this.check(true); }
    // 测试版：先看正式版有没有更新（比如 0.13.124 正式版 > 0.13.124-beta.3），有就按正式版更新
    await this.check(false, true).catch(() => {});
    if (this.newer()) { toast('发现正式版 v' + this.info.version); return this.prompt(); }
    if (this._chk) return; this._chk = true; toast('正在检查测试版更新…');
    try {
      const r = await Host.fetchText(u + '/beta/latest?t=' + now()).catch(e => ({ error: cleanErr(e) }));
      let j = null; try { j = r?.text ? JSON.parse(r.text) : null; } catch {}
      if (!j || j.error || typeof j !== 'object') { toast('检查测试版失败：' + (r?.error || j?.error || '更新服务返回格式不对（服务端可能还没支持测试版查询）'), 'err'); return; }
      if (!j.version) { toast('线上现在没有测试版（当前 测试版 v' + VERSION + '）'); return; }
      const c = this.cmp(j.version, VERSION);
      if (c === 0) { toast('已经是最新测试版 v' + VERSION); return; }
      if (c < 0) { toast('当前 v' + VERSION + ' 比线上最新测试版 v' + j.version + ' 更新'); return; }
      const want = await this.kind();
      if (j.files && !j.files[want]) { toast('测试版 v' + j.version + ' 还没有' + (want === 'apk' ? '手机' : '电脑') + '安装包（可能还在构建）', 'err'); return; }
      toast('发现新测试版 v' + j.version + '，请输入测试版口令下载');
    } finally { this._chk = false; }
    await this.beta();
  },
  // 切回正式版：查 /latest。比当前新 → 正常更新；比当前旧（测试版号更大）→ 电脑可以确认后降级安装，手机系统不允许装回更小的版本号，改为跟随正式版通道
  async stable() {
    if (!this.can()) { toast('这个版本的客户端不支持在线更新', 'err'); return; }
    if (!this.url()) { this.setUrl(); return; }
    if (document.querySelector('.modal.upd') || this._stb) return;
    this._stb = true; Prefs.updChannel = 'stable'; savePrefs(); Bus.emit('update');
    try {
      toast('正在检查正式版…'); await this.check(false, true).catch(() => {});
      const j = this.info; if (!j?.version) { toast('检查正式版失败：' + (this.err || '更新服务没有返回版本'), 'err'); return; }
      const c = this.cmp(j.version, VERSION);
      if (c > 0) return this.prompt();
      if (c === 0) { toast('已经是正式版 v' + VERSION); return; }
      const same = j.version.split('-')[0] === String(VERSION).split('-')[0];
      if (Host.platform === 'android' && !same) { toast('已切到正式版通道：手机不能装回更旧的 v' + j.version + '，正式版 v' + String(VERSION).split('-')[0] + ' 或更新版发布后会自动提示更新', 'ok'); return; }
      const ok = await Dialog.open((box, done) => box.append(h('div', { class: 'dlg-t' }, '切回正式版 v' + j.version),
        h('div', { class: 'dlg-h' }, '当前是测试版 v' + VERSION + '，线上正式版 v' + j.version + ' 版本号更小，切回去等于装回旧版本（聊天记录和账号都会保留）。也可以不装，等下一个正式版发布后自动提示。'),
        h('div', { class: 'dlg-row' }, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => done(false) }, '先不装'), h('button', { class: 'btn', onclick: () => done(true) }, '安装正式版'))));
      if (!ok) { toast('已切到正式版通道，下一个正式版发布后会自动提示'); return; }
      const t = await this.askPass(); if (!t) return;
      this.prompt({ info: { version: t.version, notes: t.notes || j.notes || '', date: t.date || j.date }, ticket: t, downgrade: true });
    } finally { this._stb = false; }
  },
  // 测试版：输入测试版口令 → 下载安装最新的测试版（不需要有新的正式版；测试版之后发布的正式版会正常提示更新）
  async beta() {
    if (!this.can()) { toast('这个版本的客户端不支持在线更新', 'err'); return; }
    if (!this.url()) { this.setUrl(); return; }
    if (document.querySelector('.modal.upd')) return;
    const t = await this.askPass({ beta: true }); if (!t) return;
    Prefs.updChannel = 'beta'; savePrefs(); Bus.emit('update');
    const c = this.cmp(t.version, VERSION);
    if (c === 0) { toast('已经是' + (t.beta ? '测试版' : '') + ' v' + VERSION); return; }
    if (c < 0) { toast('当前 v' + VERSION + ' 比测试版 v' + t.version + ' 更新，不用更新', 'err'); return; }
    this.prompt({ info: { version: t.version, notes: t.notes || (t.beta ? '测试版（口令下载，不会自动推送给其他人）。' : ''), date: t.date }, ticket: t });
  },
  // 更新口令：首次输入验证通过后自动记住口令，后续更新直接一键验证下载，不再重复弹窗；需要更换时可点「换口令」
  async askPass(opt = {}) {
    const savedKey = opt.beta ? 'updBetaPass' : 'updPass';
    const savedPass = !opt.forcePrompt && typeof Prefs === 'object' ? String(Prefs[savedKey] || '').trim() : '';
    if (savedPass) {
      const r0 = await this.ticket(savedPass, opt.beta).catch(() => null);
      if (r0 && r0.t) return r0.t;
    }
    return new Promise(done => {
      const pw = pwField(savedPass, opt.beta ? '测试版口令' : '更新口令'); pw.inp.autocomplete = 'off'; pw.inp.setAttribute('enterkeyhint', 'go'); pw.inp.spellcheck = false;
      const lim = this.info?.max?.[Host.platform === 'android' ? 'apk' : 'pc'] || 2;
      const st = h('div', { class: 'upd-st dim' }, opt.beta ? '输入测试版口令（验证通过后自动记住，下次直接一键更新）' + (Host.platform === 'desktop' ? '；安装完成后客户端会自动重新打开' : '') + '。' : '输入更新口令（验证通过后自动保存，后续版本一键直接下载安装；每个口令每版可更新 ' + lim + ' 台设备，同设备重复下载不扣次数）');
      const close = v => { m.remove(); done(v); };
      const ok = h('button', { class: 'btn', onclick: () => submit() }, '确定');
      const m = modal(opt.beta ? '下载测试版' : '输入更新口令', h('div', { class: 'upd-b' }, pw.el, st), K(h('button', { class: 'btn ghost', onclick: () => close(null) }, '取消'), h('span', { class: 'grow' }), ok), 'upd-pw');
      m.dataset.busy = '1';   // 点背景不关（防止误触丢掉已输入的口令）
      const submit = async () => {
        const pass = pw.inp.value.trim(); if (!pass) { pw.inp.focus(); return; }
        ok.disabled = true; st.className = 'upd-st dim'; st.textContent = '正在验证口令…';
        const r = await this.ticket(pass, opt.beta);
        ok.disabled = false;
        if (r.t) {
          try { if (typeof Prefs === 'object') { Prefs[savedKey] = pass; savePrefs(); } } catch {}
          pw.inp.value = ''; close(r.t); return;
        }
        st.className = 'upd-st bad'; st.textContent = r.err; pw.inp.focus(); pw.inp.select();
      };
      pw.inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      setTimeout(() => pw.inp.focus(), 60);
    });
  },
  async ticket(pass, beta) {
    const info = await Host.updInfo?.().catch(() => null) || {};
    const file = info.kind || await this.kind();
    // 带上设备 ID：同一台设备重复下载同一版本不重复扣口令次数
    const r = await Host.fetchText(this.url() + '/ticket', { method: 'POST', body: JSON.stringify({ pass, file, beta: beta ? 1 : undefined, channel: beta ? 'beta' : 'stable', device: info.device || '', name: info.devName || '', from: VERSION }), type: 'application/json' }).catch(e => ({ error: cleanErr(e) }));
    let t = null; try { t = r?.text ? JSON.parse(r.text) : null; } catch {}
    let eb = null; try { eb = r?.body ? JSON.parse(r.body) : null; } catch {}
    if (t && t.proxy) return { t };
    const e = r?.error || t?.error || '';
    return { err: eb?.error || (/403/.test(e) ? (beta ? '测试版口令不正确' : '更新口令不正确') : /404/.test(e) ? (beta ? '现在没有测试版（或还在构建）' : '找不到安装包（可能还在构建）') : /429/.test(e) ? '口令错误次数太多，请 15 分钟后再试' : /409/.test(e) ? '这个口令本版本的更新次数已用完' : '获取下载地址失败：' + (e || '未知错误')) };
  },
  noteSha(t) {
    const nm = String(t?.name || '').trim();
    const notes = String(t?.notes || this.info?.notes || '');
    if (!notes) return '';
    for (const line of notes.split(/\r?\n/)) {
      const m = /\b([0-9a-f]{64})\b\s+(\S+)/i.exec(line);
      if (m && (!nm || m[2] === nm)) return m[1].toLowerCase();
    }
    return '';
  },
  async download(t, back, bar, say, go, ver, setStepUI) {
    const sha256 = t.sha256 || this.noteSha(t) || '';
    const r = await Host.updStart({ urls: [t.proxy, t.url].filter(Boolean), sha256, size: t.size || 0, name: t.name || '', ver: t.version || ver || this.info?.version || '' }).catch(e => ({ error: cleanErr(e) }));
    if (r?.error) { say('下载失败：' + r.error, 'bad'); this.stepRef('retry'); go.hidden = false; go.textContent = '重试'; delete back.dataset.busy; return; }
    return this.watch(back, bar, say, go, setStepUI);
  },
  async watch(back, bar, say, go, setStepUI) {
    if (this.watching === back) return; this.watching = back;
    try { await this.watchLoop(back, bar, say, go, setStepUI); } finally { if (this.watching === back) this.watching = null; }
  },
  async watchLoop(back, bar, say, go, setStepUI) {
    const mb = n => (n / 1048576).toFixed(1) + ' MB';
    const fmtSpd = bps => bps >= 1048576 ? (bps / 1048576).toFixed(1) + ' MB/s' : bps >= 1024 ? Math.round(bps / 1024) + ' KB/s' : '';
    let lastGot = 0, lastAt = now(), estSpeed = 0;
    for (;;) {
      await sleep(350);
      if (!back.isConnected) return;
      const s = await Host.updStatus().catch(() => ({})) || {};
      const pct = s.total ? Math.min(100, s.got / s.total * 100) : 0;
      const curAt = now(), dt = curAt - lastAt;
      if (s.phase === 'down' && s.got > lastGot && dt >= 250) {
        const inst = Math.round((s.got - lastGot) * 1000 / dt);
        estSpeed = estSpeed ? Math.round(estSpeed * 0.6 + inst * 0.4) : inst;
        lastGot = s.got; lastAt = curAt;
      }
      const spd = s.speed || estSpeed || 0;
      const etaSec = (spd > 0 && s.total > s.got) ? Math.max(1, Math.ceil((s.total - s.got) / spd)) : 0;
      if (s.phase === 'down' || s.phase === 'verify') { bar.hidden = false; if (bar.firstChild?.style) bar.firstChild.style.width = (s.phase === 'verify' ? 100 : pct).toFixed(1) + '%'; }
      if (s.phase === 'down') {
        setStepUI?.(1);
        const spdTxt = spd > 1024 ? ' · ' + fmtSpd(spd) : '';
        const etaTxt = etaSec > 0 ? ' · 剩余 ' + (etaSec >= 60 ? Math.floor(etaSec / 60) + '分' + (etaSec % 60) + '秒' : etaSec + ' 秒') : '';
        say('下载中 ' + (s.total ? pct.toFixed(0) + '% · ' + mb(s.got) + ' / ' + mb(s.total) + spdTxt + etaTxt : mb(s.got || 0) + spdTxt), 'dim');
      } else if (s.phase === 'verify') {
        setStepUI?.(2);
        say('下载完成，正在校验 SHA-256 签名与 NSIS 安装包完整性…', 'dim');
      } else if (s.phase === 'ready' && Host.platform === 'desktop') {
        setStepUI?.(3);
        bar.hidden = false; if (bar.firstChild?.style) bar.firstChild.style.width = '100%';
        say('校验通过，正在保存多账号会话并启动自动覆盖安装…', 'ok');
        const x = await Host.updInstall().catch(e => ({ error: cleanErr(e) }));
        if (x?.error) { say(x.error + (x.file ? '：' + x.file : ''), 'bad'); delete back.dataset.busy; go.hidden = false; go.textContent = '关闭'; go.onclick = () => back.remove(); return; }
        setStepUI?.(4);
        say('已打开独立安装进度窗口，正在静默覆盖安装并自动重新打开客户端…', 'ok'); return;
      } else if (s.phase === 'ready' || s.phase === 'install') {
        setStepUI?.(4);
        bar.hidden = true; say('请在系统安装界面点「更新」完成安装（聊天记录和账号都会保留）', 'ok'); delete back.dataset.busy; go.hidden = false; go.textContent = '重新打开安装界面'; this.stepRef('perm'); if (s.phase === 'install') return;
      } else if (s.phase === 'perm') {
        setStepUI?.(3);
        bar.hidden = true; say('请在弹出的系统设置里允许 Brana AI「安装未知应用」，允许后返回会自动打开安装界面', 'dim'); delete back.dataset.busy; go.hidden = false; go.textContent = '立即安装'; this.stepRef('perm');
      } else if (s.phase === 'error') {
        say('更新失败：' + (s.error || '未知错误'), 'bad'); delete back.dataset.busy; go.hidden = false; go.textContent = '重试'; this.stepRef('retry'); return;
      }
    }
  },
  // 更新服务器地址（内置了就不用填；留空 = 用内置的）
  setUrl() {
    const inp = h('input', { type: 'url', value: Prefs.updUrl || '', placeholder: /^https:\/\//.test(UPD_DEFAULT) ? UPD_DEFAULT : 'https://xxx.workers.dev', spellcheck: false, autocomplete: 'off' });
    const save = () => { const v = inp.value.trim().replace(/\/+$/, ''); if (v && !/^https:\/\/[^\s/]+/.test(v)) { toast('地址要以 https:// 开头', 'err'); return; } Prefs.updUrl = v; savePrefs(); m.remove(); if (this.url()) this.check(true); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    const m = modal('更新服务器', h('div', {}, h('p', { class: 'note' }, '填更新服务（Cloudflare Worker）的地址。' + (/^https:\/\//.test(UPD_DEFAULT) ? '留空 = 使用内置地址。' : '')), inp), K(h('button', { class: 'btn ghost', onclick: () => m.remove() }, '取消'), h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: save }, '保存')));
    setTimeout(() => inp.focus(), 30);
  },
  // 设置里的一行：当前版本 / 最新版本 + 检查更新
  row(cls = 'set') {
    if(globalThis.BranaHost?.extensionCompatibilityTest)return h('div',{class:cls},h('span',{},h('b',{},'独立扩展测试版'),h('small',{},'当前 v'+VERSION+' · 数据独立，正式通道更新已关闭')));
    const sm = h('small', {});
    const chkBtn = h('button', { class: 'btn ghost sm', title: '强制重新向更新服务器拉取最新版本', onclick: () => this.checkNow() }, '检查更新');
    const actBtn = h('button', { class: 'btn sm', hidden: true, onclick: () => this.prompt() }, '更新');
    const paint = () => {
      const hasNew = this.newer();
      sm.textContent = !this.can() ? '当前 v' + VERSION + ' · 这个版本不支持在线更新' : !this.url() ? '当前 v' + VERSION + ' · 还没设置更新服务器' : this.isBeta(VERSION) && !hasNew ? '当前 测试版 v' + VERSION : hasNew ? '当前 v' + VERSION + ' · 有新版本 v' + this.info.version : this.err ? '当前 v' + VERSION + ' · 检查失败：' + this.err : '当前 v' + VERSION + (this.info ? ' · 已是最新' : '');
      actBtn.hidden = !hasNew;
      if (hasNew) actBtn.textContent = '更新 v' + this.info.version;
    };
    paint(); const off = Bus.on('update', () => { if (!sm.isConnected) { off?.(); return; } paint(); });
    return h('div', { class: cls }, h('span', {}, h('b', {}, '客户端更新'), sm), h('div', { class: 'set-btns' },
      h('button', { class: 'btn ghost sm', title: '更新服务器地址', onclick: () => this.setUrl() }, icon('gear')),
      this.isBeta(VERSION)
        ? h('button', { class: 'btn ghost sm', title: '切回正式版：有更新的正式版就更新；电脑也可以装回较旧的正式版', onclick: () => this.stable() }, '正式版')
        : h('button', { class: 'btn ghost sm', title: '输入测试版口令，下载安装测试版', onclick: () => this.beta() }, '测试版'),
      chkBtn,
      actBtn));
  },
};
// 启动 4 秒后：有已下载好、还没装的安装包（比如授权后 App 被系统重启）→ 直接弹「安装」
setTimeout(() => { Update.ready().then(r => { const sz = Prefs.updSnooze || {}; if (r && !(sz.v === r.ver && sz.until > now())) Update.prompt(); }).catch(() => {}); }, 4e3);
setTimeout(() => { Update.check().catch(() => {}); setInterval(() => { if (navigator.onLine !== false) Update.check().catch(() => {}); }, 6 * 3600e3); }, 40e3);
// 电脑：上次自动安装没装上（重开还是旧版本）→ 提示并给「手动安装」（打开安装界面，出错能看到原因）
setTimeout(async () => {
  if (Host.platform !== 'desktop' || !Host.updFailed) return;
  const f = await Host.updFailed().catch(() => null); if (!f) return;
  const v = await Dialog.open((box, done) => {
    box.append(h('div', { class: 'dlg-t' }, '上次自动更新没装上'),
      h('div', { class: 'dlg-h' }, '仍是 v' + VERSION + (f.to ? '，新版本 v' + f.to + ' 没有装上' : '') + '。可能是杀毒软件拦截了安装程序，或者旧版本的文件被占用。\n\n'
        + (f.exists ? (f.kind === 'portable' ? '已经打开下载目录并选中了新版 exe：关闭本程序后，用它替换旧的 exe（或直接运行它）即可。' : '已经打开下载目录并选中了安装包，双击它就能手动安装；也可以直接点「手动安装」。不用再输口令、不用重新下载，聊天记录和账号都会保留。') : '安装包已经不在了，请重新检查更新并下载（同一台设备不重复扣口令次数）。')),
      f.exists ? h('div', { class: 'dlg-h mono', style: 'word-break:break-all;user-select:text;font-size:12px' }, '安装包位置：' + f.file) : null,
      h('div', { class: 'dlg-row' }, f.exists ? h('button', { class: 'btn ghost sm', onclick: () => { Host.updFolder?.().then(r => { if (r?.error) toast(r.error, 'err'); }).catch(() => {}); } }, '打开下载目录') : null, h('span', { class: 'grow' }), h('button', { class: 'btn ghost', onclick: () => done('no') }, '以后再说'),
        f.exists ? h('button', { class: 'btn', onclick: () => done('go') }, f.kind === 'portable' ? '手动更新' : '手动安装') : h('button', { class: 'btn', onclick: () => done('re') }, '重新下载')));
  });
  if (v === 'go') { const r = await Host.updManual().catch(e => ({ error: cleanErr(e) })); if (r?.error) toast('打开安装包失败：' + r.error, 'err'); else if (r?.folder) toast('已打开文件夹：关闭本程序后，用选中的新版 exe 替换旧的即可'); }
  else if (v === 're') { await Host.updDismiss?.().catch(() => {}); Update.check(true).catch(() => {}); }
  else await Host.updDismiss?.().catch(() => {});
}, 6e3);
