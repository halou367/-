// Right-side telemetry panel, workspace file viewer, status bar, and theme settings controller
Object.assign(ICON, {
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>', ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  fingerprint: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  pelican: '<path d="M4 8.5C4 5.5 6 3.5 8.5 3.5c1.6 0 2.7.8 3.3 1.8L22 8.2l-9.3 1.3"/><path d="M12.7 9.5c-.9 1.6-2.6 2.1-4.4 1.7"/><path d="M4 8.5c0 3-1 5.5-1 7.5 0 3 2.6 4.5 6 4.5 4.5 0 8-2.5 8-6 0-1.8-1-3.2-2.6-3.8"/><circle cx="8" cy="6.4" r=".9" fill="currentColor" stroke="none"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h5"/>', dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>', chevr: '<path d="M9 6l6 6-6 6"/>', chevl: '<path d="M15 6l-6 6 6 6"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', expand: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>', palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-.9-.7-1.2-.7-2 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-5-4-9-9-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', check: '<path d="M5 12l5 5L20 7"/>',
  bolt: '<path d="M13 3L4 14h7l-1 7 9-11h-7z"/>', layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>', side: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>', note: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
});
const TIER_LV = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
const famTier = n => { const s = Brand.short(Strength.canon(n)), p = Strength.parts(n); if (p.tier && s.toLowerCase().endsWith('-' + p.tier)) return [s.slice(0, -p.tier.length - 1), p.tier]; const pm = /\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(s); return pm ? [s.slice(0, pm.index).trim(), pm[1].toLowerCase()] : [s, '']; };
// 卡片上的厂商 logo：白色圆底 + 深色图标（与油猴脚本一致）
// 解析一次 SVG，之后克隆（侧栏 1500 张卡片每张一个 logo，每次 innerHTML 解析很慢）
const VLOGO_T = new Map();
const vlogo = (vid, size = 16) => { const k = vid + '|' + size; let t = VLOGO_T.get(k); if (!t) { t = h('span', { class: 'vlogo', style: { width: size + 'px', height: size + 'px' } }); t.innerHTML = VIcon.html(vid, Math.round(size * 0.75)); if (VLOGO_T.size > 200) VLOGO_T.clear(); VLOGO_T.set(k, t); } return t.cloneNode(true); };
const saveBlob = (blob, name) => { const u = URL.createObjectURL(blob); const a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); };
const fmtBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + 'GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? (n / 1024).toFixed(1) + 'KB' : n + 'B';


// ---------- 窗口配色：标题栏 / 状态栏跟随主题 ----------
const Chrome = {
  apply() {
    const cs = getComputedStyle(document.documentElement), bg = cs.getPropertyValue('--bg2').trim() || '#f4f3ef', fg = cs.getPropertyValue('--fg2').trim() || '#5f5c56';
    const dark = document.documentElement.dataset.theme === 'dark';
    try { window.BranaHost?.setTheme?.({ bg, fg, dark, mode: Prefs.theme || 'auto' })?.catch?.(() => {}); } catch {}
    try { window.BranaAndroid?.setBars?.(JSON.stringify({ bg, dark })); } catch {}
    const m = document.querySelector('meta[name=theme-color]') || document.head.appendChild(h('meta', { name: 'theme-color' })); m.content = bg;
  },
};

// ---------- 模型信息面板 ----------
const Dock = {
  tab: Store.get('dock:tab', 'overview'), sub: { data: 'sources', records: 'cache' }, sel: { turn: null, call: null }, techOpen: true, tlOpen: false, busy: false, t: 0,
  get open() { return Prefs.dockOpen !== false; },
  mOpen: false,
  toggle(v) { this.titleUntil = now() + 3500; if (isMob()) { this.mOpen = v ?? !this.mOpen; if (this.mOpen) document.body.classList.remove('drawer'); } else { Prefs.dockOpen = v ?? !this.open; savePrefs(); } UI.layout(); this.render(); },
  sid() { const t = Tabs.cur; return t && !t.kind ? t.sid : null; },
  mount(el) {
    this.el = el; el.dataset.ks = ''; this.titleUntil = now() + 3500;
    try {
      el.addEventListener('pointerdown', () => { this._pointerDownUntil = Date.now() + 450; }, true);
      const clr = () => { this._pointerDownUntil = 0; };
      window.addEventListener('pointerup', clr, true);
      window.addEventListener('pointercancel', clr, true);
    } catch {}
    this.render();
  },
  soon() { if (this.t) return; this.t = setTimeout(() => { this.t = null; this.render(); }, 120); },
  turnsOf(sid) { return sid ? Trace.turns(sid) : []; },
  cur(sid) {
    const ts = this.turnsOf(sid) || []; if (!ts.length) return { ts };
    const t = (this.sel.sid === sid && ts.find(x => x.key === this.sel.turn)) || ts.at(-1);
    const c = t.calls.find(x => x.id === this.sel.call && this.sel.sid === sid) || t.calls.filter(x => !x.failed).at(-1) || t.calls.at(-1) || null;
    return { t, c, ts, latest: t === ts.at(-1) };
  },
  render() {
    clearTimeout(this.t); this.t = null;
    const el = this.el; if (!el || !el.isConnected) return;
    if (!isMob() ? !this.open : !this.mOpen) { el.replaceChildren(); return; }
    if (this._pointerDownUntil && Date.now() < this._pointerDownUntil && !this.force) { clearTimeout(this.t); this.t = setTimeout(() => { this.t = null; this.render(); }, 180); return; }
    const ae = document.activeElement; if (ae && el.contains(ae) && /^(SELECT|INPUT|TEXTAREA)$/.test(ae.tagName) && !this.force) { clearTimeout(this.t); this.t = setTimeout(() => this.render(), 1500); return; }
    this.force = false;
    const sid = this.sid(), { t, c, ts = [] } = this.cur(sid);
    if (this.sel.sid !== sid) this.sel = { sid, turn: null, call: null };
    const body = el.querySelector('.dk-body'), keepTop = body && this.lastKey === sid + this.tab ? body.scrollTop : 0; this.lastKey = sid + this.tab;
    /* 没有运行记录（Trace）的对话：「数据」和「概览」内容一样，合并成「概览」 */
    const noData = !ts.length;
    const tabs = [['overview', '概览'], noData ? null : ['data', '数据'], ['records', '记录'], ['settings', '设置'], ['about', '关于']].filter(Boolean);
    if (noData && this.tab === 'data') this.tab = 'overview';
    const head = h('div', { class: 'dk-head' },
      h('b', { class: 'dk-title' + (now() > (this.titleUntil || 0) ? ' gone' : '') }, '模型信息'),
      sid && ts.length ? h('button', { class: 'ib sm', title: '导出本对话的模型信息（JSON）', onclick: () => this.exportJson(sid) }, icon('dl')) : null,
      h('div', { class: 'dk-tabs' }, ...tabs.map(([k, l]) => h('button', { class: this.tab === k ? 'on' : '', onclick: () => { this.tab = k; Store.set('dock:tab', k); this.render(); } }, l))));
    const sel = h('div', { class: 'dk-sel' });
    if (sid && ts.length && ['overview', 'data'].includes(this.tab)) {
      const tsel = h('select', { onchange: e => { e.target.blur(); this.sel = { sid, turn: e.target.value, call: null }; this.render(); } },
        ...ts.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => h('option', { value: x.key, selected: x === t || null }, `第 ${i + 1} 轮 · ${fmtClock2(x.at)} · ${x.prompt ? '“' + x.prompt.slice(0, 24) + '”' : ''}${x.done ? '' : ' · 进行中'}`)));
      const csel = h('select', { onchange: e => { e.target.blur(); this.sel = { sid, turn: t.key, call: e.target.value }; this.render(); } },
        ...t.calls.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => h('option', { value: x.id, selected: x === c || null }, `${i + 1}. ${fmtClock2(x.at)} · ${Brand.short(x.request || x.model || '?')}${x.failed ? ' · 失败' : ''}${x.output != null ? ' · 出 ' + fmtTokS(x.output) : x.totalLabel ? ' · ' + x.totalLabel : ''}`)));
      sel.append(h('label', {}, h('span', {}, '轮次'), tsel), h('label', {}, h('span', {}, '调用'), csel));
    }
    const nb = h('div', { class: 'dk-body' });
    if (this.tab === 'overview') {
      if (typeof BillingProbe !== 'undefined' && sid) {
        const curChat = Chats.get(sid);
        const autoKey = sid + ':' + (curChat?.messages?.length || 0) + ':' + (BillingProbe.isCostProbeEnabled?.() ? 1 : 0);
        if (this._lastAutoSidKey !== autoKey) {
          this._lastAutoSidKey = autoKey;
          queueMicrotask(() => { try { BillingProbe.automatic(Chats.get(sid)); } catch {} });
        }
      }
      this.overview(nb, sid, t, c);
    }
    else if (this.tab === 'data') this.data(nb, sid, t, c);
    else if (this.tab === 'records') this.records(nb, sid);
    else if (this.tab === 'settings') this.settings(nb);
    else this.about(nb);
    el.dataset.ks = this.tab + '|' + (this.sid?.() || ''); el.replaceChildren(head, sel, nb);
    // 面板标题：打开时显示，几秒后淡出让出空间（鼠标移到顶部时再显示）
    if (now() < (this.titleUntil || 0)) { clearTimeout(this.titleT); this.titleT = setTimeout(() => this.el?.querySelector('.dk-title')?.classList.add('gone'), this.titleUntil - now()); }
    if (keepTop) nb.scrollTop = keepTop;
  },
  empty(box, sid) {
    const chat = sid ? Chats.get(sid) : null, inf = sid ? Trace.info(sid) : null;
    if (sid) {
      const m=Models.get(sid);
      const isIdent = !!(chat?.identifying || chat?.probeProgress || AutoId.busy?.has(sid) || this.busy || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat)) || (typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat)) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat)));
      box.append((chat?.busy && !isIdent) ? this.estCard(sid,null) : this.heroFp(sid,m || {}));
      box.append(this.detailCard(sid,null,null));
      return;
    }
    box.append(h('section', { class: 'mc-card mc-empty' },
      h('div', { class: 'mc-empty-t' }, !sid ? '打开一个对话后，这里显示它的模型信息' : chat?.busy ? '正在等待运行记录…' : '这个对话还没有模型信息'),
      sid ? h('p', { class: 'note' }, (() => { const e = History.byId(sid), at = Date.parse(String(e?.updatedAt || '').replace(' ', 'T').replace(/\+00$/, 'Z')), old = Number.isFinite(at) && now() - at > 65 * 60000;
        return AutoId.busy?.has(sid) ? '正在自动读取运行记录…' : old ? '这个对话最近一轮已超过 1 小时，Brana 的运行记录（Trace）已经读不到了。在这里发送新消息后会自动识别并保存在本机。' : inf?.lastErr ? '自动读取：' + inf.lastErr + '。发送新消息后会自动识别。' : '打开对话和每一轮进行中都会自动读取 Trace，并保存在本机。'; })()) : null,
      sid ? h('button', { class: 'btn wide ghost', disabled: this.busy || AutoId.busy?.has(sid) || null, onclick: () => this.deep(sid, true) }, this.busy || AutoId.busy?.has(sid) ? h('i', { class: 'spin' }) : null, this.busy || AutoId.busy?.has(sid) ? ' 读取中…' : '再读一次') : null));
  },
  /* 识别卡片（指纹版）：拿不到运行记录（Trace）的对话，用指纹识别出的型号 + 推理分 + 估算花费来填同一张卡片；右上角标签 = 推理分 */
  candidateOf(m) {
    const fp=m?.fingerprint,r=fp?.result;
    if(!m || (m.name && !/^(未知型号|待定|未识别)\??$/.test(m.name)) || fp?.skipped || fp?.probeError || fp?.apiUnsafe || fp?.apiIdentity || (!m.guess && (m.response || m.internal)))return null;
    const name=r?.nearest?.id,p=r?.signals?.relative_probability ?? r?.nearest?.probability;
    if(!name || !Number.isFinite(p) || p<=0 || p>1)return null;
    const sid = m?.sid || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : '');
    const chatObj = (sid && typeof Chats !== 'undefined') ? Chats.get(sid) : null;
    const thinkSt = (chatObj && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chatObj) : null;
    if (thinkSt?.kind === 'compat-thinking' && this.isClosedModelName?.(name)) return null;
    if((r.candidates || []).some(c=>c.id!==name && Number.isFinite(c.probability) && c.probability>=p-1e-12))return null;
    return {name,probability:p,reason:fp.conflict?'格式冲突':fp.error?'测试待复核':r.status==='weak'?'弱匹配':'待核对'};
  },
  isClosedModelName(s) {
    if (!s) return false;
    const id = String(s).toLowerCase();
    if (/muse/i.test(id)) return true;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return false;
    if (/qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|开源|国产|compat/i.test(id)) return false;
    if (['claude', 'openai', 'gemini', 'grok'].includes(vid)) return true;
    return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse|inkling|solar-pro/i.test(id);
  },
   isOpenCorrectionModel(s) {
     const name = String(s || '').trim().toLowerCase();
     if (!name) return false;
     if (/^(?:开源模型|open[- ]?source|compat)(?:$|[\s(/-])/i.test(name)) return true;
     const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(name) : '';
     if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'xiaomi', 'compat'].includes(vid)) return true;
     return /gpt[- ]?oss|llama|nemotron|beam|muse[ .-]*spark[ .-]*open/i.test(name);
   },
   scoreOf(sid, m, t) {
    const key=n=>Strength.canon(String(n || '').replace(/\?+$/, '')).toLowerCase();
    const isReid=Boolean(m && (m.userCorrected || m.routed || m.habitInferred || m.reverseInferred || m.billingProbe));
    if(!m?.name || (!isReid && t?.best && key(t.best)!==key(m.name)))return null;
    const sum = (!t && typeof BillingProbe !== 'undefined' && BillingProbe.summary) ? BillingProbe.summary(sid) : null;
    const top0 = sum?.mergedCandidates?.[0];
    if (top0 && (top0.diophantinePassed || top0.revPct != null) && !top0.habitSource && !m?.userCorrected) {
      const chat = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
      const topCanon = Strength.canon(String(top0.canon || top0.label || m.name || '').replace(/\?+$/, ''));
      const topEff = String(top0.inferredEffort || top0.effortProfile?.effort || (/\b(none|minimal|low|medium|high|xhigh|max)\b/i.exec(topCanon)?.[1]) || m.reverseEffort || '').toLowerCase();
      const revS = (typeof Strength !== 'undefined' && Strength.reverseDepthScore)
        ? Strength.reverseDepthScore(sid, { ...m, name: topCanon, reverseEffort: topEff }, sum, chat)
        : null;
      if (revS != null && Number.isFinite(+revS) && (+revS) >= 10 && (+revS) <= 100) return +revS;
    }
    return ConversationLabels.score(m,History.byId?.(sid)?.title || '');
  },
  scoreBadge(sid, m, historical=false, t) {
    const score=this.scoreOf(sid,m,t);if(score==null)return null;
    const label=(historical?'历史':'')+'推理分 '+Strength.fmtScore(score);
    return h('span',{class:'mc-tier mc-reason-score',title:label+' · 0–100 时长估计，非能力评分','aria-label':label},icon('brain'),Strength.fmtScore(score));
  },
  unitBtn(unit) {
    const unitTip = unit === 'usd' ? '消耗按美金显示 · 点一下切换为 Token' : '消耗按 Token 显示 · 点一下切换为美金';
    return h('button', { type: 'button', class: 'mc-unit mc-unit-inline', title: unitTip, 'aria-label': unitTip, onclick: e => { e?.stopPropagation?.(); Prefs.spendUnit = unit === 'usd' ? 'token' : 'usd'; if (typeof savePrefs === 'function') savePrefs(); this.render(); } }, unit === 'usd' ? '$' : 'T');
  },
  exportBtns(sid) {
    sid = sid || (typeof this.sid === 'function' ? this.sid() : '') || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : '') || '';
    const chat = sid && typeof Chats !== 'undefined' ? (Chats.get(sid) || (typeof chatOf === 'function' ? chatOf(sid) : null)) : null;
    const mi = sid && typeof Models !== 'undefined' ? Models.get(sid) : null;
    const diagOk = Boolean(sid && (mi || chat || (typeof BillingProbe !== 'undefined' && BillingProbe.summary?.(sid)?.mergedCandidates?.length)));
    const diagTip = diagOk ? '导出诊断 JSON：导出本对话计费反推与习惯特征诊断文件（可导入习惯库）' : '导出诊断 JSON：当前对话暂无识别诊断数据';
    const toolTip = '导出调用工具：导出本对话模型调用过的全部工具及参数结构（JSON）';
    return h('span', { class: 'mc-foot-acts' },
      h('button', { type: 'button', class: 'mc-unit mc-act-ico', disabled: !sid || null, title: diagTip, 'aria-label': '导出诊断 JSON', onclick: e => { e?.stopPropagation?.(); if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.exportDiagnosticJson === 'function') BillingProbe.exportDiagnosticJson(sid); else if (typeof this.exportJson === 'function') this.exportJson(sid); } }, icon('download')),
      h('button', { type: 'button', class: 'mc-unit mc-act-ico', disabled: !chat || null, title: toolTip, 'aria-label': '导出调用工具', onclick: e => { e?.stopPropagation?.(); void this.exportTools?.(sid, e?.currentTarget); } }, icon('tool')));
  },
  correctBtn(sid, m) {
    if (!sid || this.isOpenCorrectionModel(m?.name || m?.rawLabel || m?.candidateName || '')) return null;
    const isOpen = this.editModelSid === sid;
    const isCorrected = Boolean(m?.userCorrected);
    const tip = isOpen
      ? '点击确认当前型号并收起面板'
      : isCorrected
        ? '已手动纠偏确认（点击展开或修改型号）'
        : '点击展开三行滚轮纠偏，选好后再点此对勾确认关闭';
    return h('button', {
      type: 'button',
      class: 'mc-correct-btn mc-correct-ico' + (isOpen ? ' on' : '') + (isCorrected ? ' ok' : ''),
      title: tip,
      'aria-label': tip,
      onclick: e => {
        e?.stopPropagation?.();
        document.querySelectorAll('.rv.mc-rv').forEach(el => el.remove());
        if (this.editModelSid === sid) {
          const finalLbl = String(this.editPreviewLabel || '').trim();
          const vHint = this.editVendor || '';
          const fHint = this.editFamily || '';
          const eHint = this.editTier || '';
          const shouldCommit = Boolean(finalLbl && (this.editChanged || !isCorrected || finalLbl !== String(m?.name || '').trim()));
          const shouldLearn = this.editLearn !== false;
          this.editModelSid = null;
          this.editStep = 1;
          this.editVendor = null;
          this.editFamily = null;
          this.editTier = null;
          this.editModelDraft = null;
          this.editPreviewLabel = null;
          this.editPreviewLogo = null;
          this.editChanged = false;
          if (shouldCommit && typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.confirmUserCorrection) {
            ChatHabitFingerprint.confirmUserCorrection(sid, finalLbl, {
              learn: shouldLearn,
              vendorHint: vHint,
              familyHint: fHint,
              effortHint: eHint,
            });
            return;
          }
        } else {
          this.editModelSid = sid;
          this.editStep = 1;
          this.editVendor = null;
          this.editFamily = null;
          this.editTier = null;
          this.editModelDraft = null;
          this.editLearn = true;
          this.editChanged = false;
        }
        this.render();
      }
    }, icon('check'));
  },
  // 同款 3D 弹巢左轮滚轮选择器（供三行纠偏：厂商 Logo / 型号 / 强度使用）
  openCorrectWheel(btn, list, curIdx, hint, onPick, opts = {}) {
    if (!btn || !Array.isArray(list) || !list.length) return null;
    document.querySelectorAll('.rv.mc-rv').forEach(el => el.remove());
    const REV_H = 42;
    const vars = () => document.documentElement.dataset.theme === 'dark'
      ? '--rv-card:#34322e;--rv-win:#4b4740;--rv-fg:#ecebe7;--rv-line:#ffffff14;--rv-acc:#d8d3ca;--rv-mut:#a9a59d'
      : '--rv-card:#fffdf9;--rv-win:#e6ddd0;--rv-fg:#262522;--rv-line:#0000000f;--rv-acc:#6a5e54;--rv-mut:#7a746b';
    const cur = Math.max(0, Math.min(list.length - 1, Number(curIdx) || 0));
    const root = document.createElement('div');
    root.className = 'rv mc-rv' + (opts.logoOnly ? ' is-logo-only' : '');
    root.style.cssText = vars();
    root.innerHTML = '<div class="rv-win"></div><div class="rv-drum"></div><div class="rv-hint"></div>';
    root.querySelector('.rv-hint').textContent = hint || '滚轮选择 · 停下或移开确认';
    const drum = root.querySelector('.rv-drum');
    const els = list.map((it, i) => {
      const d = document.createElement('div');
      d.className = 'rv-it' + (i === cur ? ' cur' : '') + (it.isFreq ? ' is-freq' : it.isRec ? ' is-rec' : '');
      const icHtml = it.iconHtml ? '<span class="rv-ic">' + it.iconHtml + '</span>' : '';
      const nmHtml = it.label ? '<span class="rv-nm"></span>' : '';
      d.innerHTML = icHtml + nmHtml;
      if (it.label) d.querySelector('.rv-nm').textContent = it.label;
      drum.append(d);
      return d;
    });
    document.body.append(root);
    const r = btn.getBoundingClientRect();
    const W = opts.logoOnly ? 148 : 228;
    const H = REV_H * 5;
    root.style.width = W + 'px';
    root.style.height = H + 'px';
    root.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)) + 'px';
    const topAbove = r.top - H - 12;
    root.style.top = (topAbove >= 8 ? topAbove : Math.max(8, Math.min(innerHeight - H - 8, r.top + r.height / 2 - H / 2))) + 'px';
    btn.setAttribute('data-rv', '');
    btn._rv = true;
    const n = els.length;
    const wrap = k => ((k % n) + n) % n;
    let shown = -1;
    const paint = pos => {
      els.forEach((d, i) => {
        const off = ((((i - pos) % n) + n + n / 2) % n) - n / 2;
        const a = Math.abs(off);
        d.style.transform = 'translateY(' + (off * REV_H * 0.92) + 'px) rotateX(' + (-off * 24) + 'deg) translateZ(' + (-a * a * 6) + 'px) scale(' + Math.max(0.74, 1 - a * 0.07) + ')';
        d.style.opacity = String(Math.max(0, 1 - a * 0.32));
        d.style.zIndex = String(100 - Math.round(a * 10));
      });
      const k = wrap(Math.round(pos));
      if (k !== shown) {
        shown = k;
        els.forEach((d, i) => d.classList.toggle('sel', i === k));
        if (typeof opts.onPreview === 'function') {
          try { opts.onPreview(list[k], k); } catch {}
        }
      }
    };
    requestAnimationFrame(() => root.classList.add('on'));
    let pos = cur, target = cur, done = false, raf = 0, idleT = 0, acc = 0;
    paint(pos);
    const loop = () => {
      raf = 0;
      pos += (target - pos) * 0.32;
      if (Math.abs(target - pos) < 0.003) pos = target;
      paint(pos);
      if (pos !== target) raf = requestAnimationFrame(loop);
    };
    const finish = pick => {
      if (done) return;
      done = true;
      clearTimeout(idleT);
      cancelAnimationFrame(raf);
      btn.removeEventListener('mouseleave', leave);
      btn.removeEventListener('click', clk, true);
      removeEventListener('keydown', esc, true);
      removeEventListener('blur', away);
      const kr = Math.round(target);
      const p0 = pos, t0 = performance.now();
      const snap = t => {
        const p = Math.min(1, (t - t0) / 140);
        paint(p0 + (kr - p0) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(snap);
      };
      requestAnimationFrame(snap);
      root.classList.add('out');
      setTimeout(() => root.remove(), 340);
      btn.removeAttribute('data-rv');
      btn._rv = false;
      btn._wh = null;
      if (pick) {
        const picked = list[wrap(kr)];
        if (picked && typeof onPick === 'function') onPick(picked, wrap(kr));
      }
    };
    const leave = () => finish(true);
    const clk = ev => { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); };
    const esc = ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); finish(true); }
    };
    const away = () => finish(false);
    btn.addEventListener('mouseleave', leave);
    btn.addEventListener('click', clk, true);
    addEventListener('keydown', esc, true);
    addEventListener('blur', away);
    return {
      push(d) {
        if (done) return;
        if (Math.abs(d) >= 45) target += Math.sign(d);
        else {
          acc += d;
          if (Math.abs(acc) >= 50) { target += Math.sign(acc); acc = 0; }
        }
        if (!raf) raf = requestAnimationFrame(loop);
        clearTimeout(idleT);
        idleT = setTimeout(() => finish(true), 850);
      },
      finish,
    };
  },
  renderCorrectPanel(sid, m, curName) {
    if (!sid || this.editModelSid !== sid || this.isOpenCorrectionModel(curName || m?.name || m?.rawLabel || '')) return null;
    // ① 厂商 -> ② 型号 -> ③ 强度 三行滚轮选择器（常用项用颜色区分，所有厂商名均用 Logo 代替）
    const stats = (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.getUsageStats === 'function')
      ? ChatHabitFingerprint.getUsageStats()
      : { vendors: {}, families: {}, models: {}, efforts: {} };

    const VENDOR_CATALOG = [
      {
        id: 'openai',
        name: 'GPT',
        logo: 'openai',
        defaultRank: 1,
        models: [
          { fam: 'GPT 6.1 Sol', short: '6.1 Sol', defTier: 'High', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 6.1 Luna', short: '6.1 Luna', defTier: 'High', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 6 Astra', short: '6 Astra', defTier: 'Max', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 6 Sol', short: '6 Sol', defTier: 'Max', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 6 Luna', short: '6 Luna', defTier: 'Max', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 5.6 Sol', short: '5.6 Sol', defTier: 'High', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 5.6 Terra', short: '5.6 Terra', defTier: 'High', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'GPT 5.6 Luna', short: '5.6 Luna', defTier: 'High', tiers: ['Max', 'xHigh', 'High', 'Medium', 'Low'] },
        ],
      },
      {
        id: 'anthropic',
        name: 'Claude',
        logo: 'anthropic',
        defaultRank: 2,
        models: [
          { fam: 'Claude Opus 5.6', short: 'Opus 5.6', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Opus 5.5', short: 'Opus 5.5', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Opus 5', short: 'Opus 5', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Sonnet 5', short: 'Sonnet 5', defTier: 'High', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Fable 5.1', short: 'Fable 5.1', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Fable 5', short: 'Fable 5', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Claude Haiku 5.5', short: 'Haiku 5.5', defTier: 'High', tiers: ['High', 'Medium', 'Low', 'Max'] },
        ],
      },
      {
        id: 'google',
        name: 'Gemini',
        logo: 'google',
        defaultRank: 3,
        models: [
          { fam: 'Gemini 4 Argon', short: '4 Argon', defTier: 'High', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Gemini 3.8 Flash', short: '3.8 Flash', defTier: 'High', tiers: ['High', 'Medium', 'Max', 'Low'] },
          { fam: 'Gemini 3.7 Flash', short: '3.7 Flash', defTier: 'High', tiers: ['High', 'Medium', 'Low', 'Max'] },
          { fam: 'Gemini 3.1 Pro Preview', short: '3.1 Pro Preview', defTier: 'High', tiers: ['High', 'Max', 'Medium', 'Low', ''] },
        ],
      },
      {
        id: 'xai',
        name: 'Grok',
        logo: 'xai',
        defaultRank: 4,
        models: [
          { fam: 'Grok 4.7', short: '4.7', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Grok 4.6', short: '4.6', defTier: 'High', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Grok 4.20', short: '4.20', defTier: 'High', tiers: ['High', 'Medium', 'Low', ''] },
        ],
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        logo: 'deepseek',
        defaultRank: 5,
        models: [
          { fam: 'DeepSeek V4.1 Flash', short: 'V4.1 Flash', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'DeepSeek V4.1 Flash 1017', short: 'V4.1 Flash 1017', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'DeepSeek V4.1 Flash 20260910', short: 'V4.1 Flash 0910', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Beam 1.0 501B A23B', short: 'Beam 1.0 501B', defTier: '', direct: true, tiers: ['', 'High', 'Max'] },
          { fam: '开源模型', short: '开源模型', defTier: '', direct: true, tiers: [''] },
        ],
      },
      {
        id: 'zhipu',
        name: 'GLM',
        logo: 'zhipu',
        defaultRank: 6,
        models: [
          { fam: 'GLM 5.3', short: '5.3', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'GLM 5.2', short: '5.2', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
        ],
      },
      {
        id: 'qwen',
        name: 'Qwen',
        logo: 'qwen',
        defaultRank: 7,
        models: [
          { fam: 'Qwen 3.8 Max', short: '3.8 Max', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Qwen 3.8 Flash Next', short: '3.8 Flash Next', defTier: 'High', tiers: ['High', 'Medium', 'Low', 'Max'] },
          { fam: 'Qwen 3.7 Max', short: '3.7 Max', defTier: 'High', tiers: ['Max', 'High', 'Medium', 'Low'] },
        ],
      },
      {
        id: 'moonshot',
        name: 'Kimi',
        logo: 'moonshot',
        defaultRank: 8,
        models: [
          { fam: 'Kimi K3', short: 'K3', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
        ],
      },
      {
        id: 'xiaomi',
        name: 'MiMo',
        logo: 'xiaomi',
        defaultRank: 9,
        models: [
          { fam: 'MiMo V2.6 Pro', short: 'V2.6 Pro', defTier: 'High', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'MiMo V2.6 Flash', short: 'V2.6 Flash', defTier: 'High', tiers: ['High', 'Medium', 'Low', 'Max'] },
        ],
      },
      {
        id: 'meta',
        name: 'Muse',
        logo: 'meta',
        defaultRank: 10,
        models: [
          { fam: 'Muse Spark 1.3', short: 'Spark 1.3', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Muse Spark 1.2', short: 'Spark 1.2', defTier: 'xHigh', tiers: ['xHigh', 'High', 'Medium', 'Low', 'Max'] },
          { fam: 'Muse Wonder', short: 'Wonder', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
          { fam: 'Muse Spark Open', short: 'Spark Open', defTier: 'Max', tiers: ['Max', 'High', 'Medium', 'Low'] },
        ],
      },
    ];

    // Keep only correction targets that the existing model classifier identifies as closed-source.
    const closedCatalog = VENDOR_CATALOG
      .map(v => ({ ...v, models: (v.models || []).filter(model => !this.isOpenCorrectionModel(model.fam)) }))
      .filter(v => v.models.length);

    const applyCorrection = (fullLabel, vHint = '', fHint = '', eHint = '') => {
      const val = String(fullLabel || '').trim();
      if (!val) { toast('请先选择模型名称', 'err'); return; }
      const shouldLearn = this.editLearn !== false;
      this.editModelSid = null;
      this.editStep = 1;
      this.editVendor = null;
      this.editFamily = null;
      this.editTier = null;
      this.editModelDraft = null;
      this.editPreviewLabel = null;
      this.editPreviewLogo = null;
      if (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.confirmUserCorrection) {
        ChatHabitFingerprint.confirmUserCorrection(sid, val, {
          learn: shouldLearn,
          vendorHint: vHint,
          familyHint: fHint,
          effortHint: eHint,
        });
      }
    };

    // 按常用频次排序厂商
    const sortedVendors = closedCatalog.slice().sort((a, b) => {
      const fa = Number(stats.vendors?.[a.id] || 0);
      const fb = Number(stats.vendors?.[b.id] || 0);
      if (fb !== fa) return fb - fa;
      return a.defaultRank - b.defaultRank;
    });

    // 若尚未选择厂商/型号/强度，从草稿或当前识别型号智能初始化
    const seedRaw = String(this.editModelDraft || curName || m?.rawLabel || m?.name || '').trim();
    if (!this.editVendor && seedRaw) {
      const seedLow = seedRaw.toLowerCase();
      const seedCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(seedRaw) : seedRaw).toLowerCase();
      for (const v of closedCatalog) {
        const byLen = v.models.slice().sort((a, b) => b.fam.length - a.fam.length);
        const hitM = byLen.find(it => {
          const fLow = it.fam.toLowerCase();
          const sLow = it.short.toLowerCase();
          const fCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(it.fam) : fLow).toLowerCase();
          return seedLow.includes(fLow) || seedCanon.includes(fCanon) || seedLow.includes(sLow);
        });
        if (hitM) {
          this.editVendor = v.id;
          this.editFamily = hitM.fam;
          const tm = /\b(max|xhigh|high|medium|low)\b/i.exec(seedRaw);
          if (tm) {
            const tLow = tm[1].toLowerCase();
            this.editTier = tLow === 'xhigh' ? 'xHigh' : (tLow[0].toUpperCase() + tLow.slice(1));
          }
          break;
        }
      }
    }

    const curVendorObj = sortedVendors.find(v => v.id === this.editVendor) || sortedVendors[0];
    this.editVendor = curVendorObj.id;

    // 按常用频次排序该厂商下的型号
    const sortedModels = (curVendorObj.models || []).slice().sort((a, b) => {
      const fa = Number(stats.families?.[a.fam.toLowerCase()] || 0);
      const fb = Number(stats.families?.[b.fam.toLowerCase()] || 0);
      return fb - fa;
    });
    const curModelObj = sortedModels.find(x => x.fam === this.editFamily) || sortedModels[0];
    this.editFamily = curModelObj.fam;

    // 按常用频次与默认推荐排序强度档位
    const famName = curModelObj.fam;
    const rawTiers = curModelObj.tiers || ['Max', 'xHigh', 'High', 'Medium', 'Low'];
    const allTiers = curModelObj.direct ? [''] : [...new Set([...rawTiers, 'Max', 'High', 'Medium', 'Low', ''])];
    const sortedTiers = allTiers.slice().sort((a, b) => {
      const fullA = (a ? `${famName} (${a})` : famName).toLowerCase();
      const fullB = (b ? `${famName} (${b})` : famName).toLowerCase();
      const exactA = Number(stats.models?.[fullA] || 0);
      const exactB = Number(stats.models?.[fullB] || 0);
      if (exactB !== exactA) return exactB - exactA;
      const isDefA = a === curModelObj.defTier ? 1 : 0;
      const isDefB = b === curModelObj.defTier ? 1 : 0;
      if (isDefB !== isDefA) return isDefB - isDefA;
      const effA = Number(stats.efforts?.[a.toLowerCase()] || 0);
      const effB = Number(stats.efforts?.[b.toLowerCase()] || 0);
      return effB - effA;
    });
    if (this.editTier == null || !sortedTiers.includes(this.editTier)) {
      this.editTier = sortedTiers[0] ?? (curModelObj.defTier || '');
    }
    const curTier = this.editTier;
    const fullCurrentLabel = curTier ? `${famName} (${curTier})` : famName;
    const curModelLogo = curModelObj.mLogo || curVendorObj.logo;
    this.editPreviewLabel = fullCurrentLabel;
    this.editPreviewLogo = curModelLogo;

    const bindWheelRow = (rowEl, getList, getCurIdx, hint, onSelect, opts = {}) => {
      rowEl.addEventListener('wheel', e => {
        if (!e.deltaY) return;
        e.preventDefault();
        e.stopPropagation();
        const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        const w = (rowEl._wh ||= this.openCorrectWheel(rowEl, getList(), getCurIdx(), hint, onSelect, opts));
        w?.push(d);
      }, { passive: false });
      rowEl.addEventListener('click', e => {
        if (e.target?.closest?.('.mc-wheel-act')) return;
        e.preventDefault();
        e.stopPropagation();
        if (rowEl._wh) {
          rowEl._wh.finish(true);
          return;
        }
        const list = getList();
        const idx = getCurIdx();
        rowEl._wh = this.openCorrectWheel(rowEl, list, idx, hint, onSelect, opts);
      });
    };

    // 顶部最终「图标 + 型号 + 强度」实时预览栏（无冗余按钮，由顶部思考分后的对勾统一开启/确认关闭）
    let liveVendorObj = curVendorObj;
    let liveModelObj = curModelObj;
    let liveTier = curTier;
    const prevLogoWrap = h('span', { class: 'mc-wheel-prev-ico' }, vlogo(curModelLogo, 18));
    const prevModelEl = h('b', { class: 'mc-wheel-prev-model' }, curModelObj.short || curModelObj.fam);
    const prevTierEl = h('span', { class: 'mc-tier mc-wheel-prev-tier', 'data-lv': TIER_LV[curTier] ?? 3 }, curTier || '标准');
    const previewRow = h('div', {
      class: 'mc-wheel-preview',
      style: { cursor: 'pointer' },
      title: `当前预览：${fullCurrentLabel}（点击此栏或右上对勾即可确认纠偏）`,
      onclick: e => {
        e?.stopPropagation?.();
        applyCorrection(this.editPreviewLabel || fullCurrentLabel, this.editVendor, this.editFamily, this.editTier);
      }
    },
      prevLogoWrap,
      prevModelEl,
      prevTierEl
    );
    const syncLivePreview = (vObj, mObj, tVal) => {
      liveVendorObj = vObj || curVendorObj;
      liveModelObj = mObj || curModelObj;
      liveTier = tVal != null ? tVal : '';
      const fName = liveModelObj.fam;
      const fullLbl = liveTier ? `${fName} (${liveTier})` : fName;
      const mLogo = liveModelObj.mLogo || liveVendorObj.logo;
      this.editVendor = liveVendorObj.id;
      this.editFamily = fName;
      this.editTier = liveTier;
      this.editPreviewLabel = fullLbl;
      this.editPreviewLogo = mLogo;
      this.editChanged = true;
      prevLogoWrap.replaceChildren(vlogo(mLogo, 18));
      prevModelEl.textContent = liveModelObj.short || liveModelObj.fam;
      prevTierEl.textContent = liveTier || '标准';
      prevTierEl.setAttribute('data-lv', String(TIER_LV[liveTier] ?? 3));
      previewRow.title = `当前预览：${fullLbl}`;
    };

    // 底部第 1 行：独立滚轮选择「图标 + 厂商」名称（无右侧冗余图标）
    const vFreqCur = Number(stats.vendors?.[curVendorObj.id] || 0) > 0;
    const vendorRow = h('div', {
      class: 'mc-jump-card mc-wheel-row' + (vFreqCur ? ' is-freq' : ''),
      title: '滚轮切换厂商'
    },
      h('span', { class: 'mc-wheel-tag' }, '厂商'),
      vlogo(curVendorObj.logo, 16),
      h('b', { class: 'mc-wheel-val' }, curVendorObj.name)
    );
    bindWheelRow(
      vendorRow,
      () => sortedVendors.map(v => ({
        id: v.id,
        label: v.name,
        iconHtml: VIcon.html(v.logo, 16),
        isFreq: Number(stats.vendors?.[v.id] || 0) > 0,
      })),
      () => Math.max(0, sortedVendors.findIndex(v => v.id === curVendorObj.id)),
      '滚轮选厂商',
      picked => {
        if (picked && picked.id !== curVendorObj.id) {
          this.editVendor = picked.id;
          this.editFamily = null;
          this.editTier = null;
          this.editChanged = true;
          this.render();
        }
      },
      {
        onPreview: picked => {
          const vObj = sortedVendors.find(v => v.id === picked?.id) || curVendorObj;
          const mObj = (vObj.models || [])[0] || curModelObj;
          const tVal = mObj.direct ? '' : (mObj.defTier ?? liveTier);
          syncLivePreview(vObj, mObj, tVal);
        }
      }
    );

    // 底部第 2 行：独立滚轮选择纯型号（无图标）
    const mFreqCur = Number(stats.families?.[curModelObj.fam.toLowerCase()] || 0) > 0;
    const modelRow = h('div', {
      class: 'mc-jump-card mc-wheel-row' + (mFreqCur ? ' is-freq' : ''),
      title: '滚轮切换型号'
    },
      h('span', { class: 'mc-wheel-tag' }, '型号'),
      h('b', { class: 'mc-wheel-val' }, curModelObj.short || curModelObj.fam)
    );
    bindWheelRow(
      modelRow,
      () => sortedModels.map(it => ({
        id: it.fam,
        direct: !!it.direct,
        label: it.short || it.fam,
        iconHtml: '',
        isFreq: Number(stats.families?.[it.fam.toLowerCase()] || 0) > 0,
      })),
      () => Math.max(0, sortedModels.findIndex(it => it.fam === curModelObj.fam)),
      '滚轮选型号',
      picked => {
        if (!picked) return;
        if (picked.id !== curModelObj.fam) {
          this.editFamily = picked.id;
          this.editTier = null;
          this.editChanged = true;
          this.render();
        }
      },
      {
        onPreview: picked => {
          const mObj = sortedModels.find(it => it.fam === picked?.id) || curModelObj;
          const tVal = mObj.direct ? '' : (mObj.defTier ?? liveTier);
          syncLivePreview(liveVendorObj, mObj, tVal);
        }
      }
    );

    // 底部第 3 行：独立滚轮选择纯强度（无图标，选完仅更新预览，点顶部思考分后的对勾确认关闭）
    const tFreqCur = Number(stats.models?.[fullCurrentLabel.toLowerCase()] || 0) > 0;
    const tRecCur = !tFreqCur && curTier === curModelObj.defTier;
    const tierRow = h('div', {
      class: 'mc-jump-card mc-wheel-row' + (tFreqCur ? ' is-freq' : tRecCur ? ' is-rec' : ''),
      title: '滚轮选择强度'
    },
      h('span', { class: 'mc-wheel-tag' }, '强度'),
      h('b', { class: 'mc-wheel-val' }, curTier || '标准')
    );
    bindWheelRow(
      tierRow,
      () => sortedTiers.map(t => {
        const fl = (t ? `${famName} (${t})` : famName).toLowerCase();
        const isHot = Number(stats.models?.[fl] || 0) > 0;
        const isRec = !isHot && t === curModelObj.defTier;
        return {
          id: t,
          label: t || '标准',
          iconHtml: '',
          isFreq: isHot,
          isRec,
        };
      }),
      () => Math.max(0, sortedTiers.findIndex(t => t === curTier)),
      '滚轮选强度',
      picked => {
        if (!picked) return;
        const chosenTier = picked.id;
        this.editTier = chosenTier;
        this.editChanged = true;
        this.render();
      },
      {
        onPreview: picked => {
          if (!picked) return;
          syncLivePreview(liveVendorObj, liveModelObj, picked.id);
        }
      }
    );
    return h('div', { class: 'mc-correct-wizard mc-wheel-wrap', onclick: e => e.stopPropagation() },
      previewRow,
      h('div', { class: 'mc-correct-box mc-wheel-box' },
        vendorRow,
        modelRow,
        tierRow
      )
    );
  },  routeBanner(sid, m, billing, curName = '') {
    const d = billing?.diagnostics || null;
    const hr = billing?.habitRoute || null;
    const rn = m?.lastRouteNotice || null;
    const isRouted = Boolean(m?.routed || hr?.routed || d?.routeSwitched || d?.effortDowngraded || d?.routeType || rn);
    if (!isRouted) return null;
    const rType = m?.routeType || hr?.routeType || d?.routeType || (d?.effortDowngraded ? 'effort' : 'model');
    const fromLbl = String(m?.routeFrom || rn?.fromLabel || hr?.fromLabel || d?.initialModelLabel || '前序模型').replace(/[?？]+$/, '').trim();
    const toLbl = String(m?.routeTo || rn?.toLabel || hr?.toLabel || d?.routedModelLabel || curName || m?.name || '当前模型').replace(/[?？]+$/, '').trim();
    const toTurn = rn?.toTurn || hr?.toTurn || null;
    const fromTurn = rn?.fromTurn || hr?.fromTurn || null;
    const reason = String(m?.routeReason || rn?.reason || hr?.reason || (rType === 'effort' ? '同型号思考强度削弱' : '中途路由切换模型')).trim();
    const turnBadge = toTurn ? (fromTurn && fromTurn !== toTurn - 1 ? `第 #${fromTurn} → #${toTurn} 轮` : `第 #${toTurn} 轮起`) : '中途切换';
    const titleStr = rType === 'effort' ? '⚠️ 检测到思考强度削弱' : '⚠️ 检测到中途路由切换模型';
    return h('div', {
      class: 'mc-route-banner',
      title: `点击定位到对话中的路由切换轮次 · ${reason}`,
      onclick: () => {
        const alertEl = document.querySelector('#msgs .msg-route-alert[data-route-pivot="1"], #msgs .msg-route-alert, #msgs .trow.is-route-start');
        if (alertEl) {
          alertEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          alertEl.classList.add('route-flash');
          setTimeout(() => alertEl.classList.remove('route-flash'), 1800);
        }
        toast(`${titleStr}：${fromLbl} → ${toLbl}（${turnBadge}${reason ? ' · ' + reason : ''}）`, 'warn');
      }
    },
      h('div', { class: 'mc-route-head' },
        icon('alert'),
        h('span', { class: 'mc-route-title' }, titleStr),
        h('span', { class: 'mc-route-turn' }, turnBadge)
      ),
      h('div', { class: 'mc-route-flow' },
        h('span', { class: 'mc-route-from' }, fromLbl),
        h('span', { class: 'mc-route-arrow' }, '→'),
        h('span', { class: 'mc-route-to' }, toLbl)
      ),
      reason ? h('div', { class: 'mc-route-reason' }, reason) : null
    );
  },

  heroFp(sid, m) {
    const billing=typeof BillingProbe!=='undefined'?BillingProbe.summary(sid):null, charged=billing?.payment?.chargedUsd ?? billing?.payment?.effectiveUsd ?? null;
    if (sid && typeof Models !== 'undefined') m = Models.get(sid) || m || {};
    const merged=billing?.mergedCandidates||[], top0=merged[0], top1=merged[1];
    const uniqueTop=top0 && (!top1 || (Number(top0.match||0) - Number(top1.match||0)) >= 0.05 || (Number(top0.combinedWeight ?? top0.match ?? 0) - Number(top1.combinedWeight ?? top1.match ?? 0)) >= 0.5);
    const pend = !!(m?.pendingConfirm && !uniqueTop && !(m?.name));
    const chat = Chats.get(sid);
    const thinkSt = (chat && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    const isOpenThinkNow = thinkSt?.kind === 'compat-thinking' && !chat?._closedLockedModel;
    const cleanModelVal = s => (!s || /^(未知型号|待定|未识别)\??$/.test(String(s)) || (isOpenThinkNow && this.isClosedModelName?.(s))) ? '' : String(s || '');
    const savedModelName = cleanModelVal(m?.name);
    const candidate=pend?null:this.candidateOf(m), fp = m?.fingerprint, revPreferred = ((m?.userCorrected && savedModelName) || (m?.routed && savedModelName)) ? savedModelName : (uniqueTop && top0 && (m?.reverseInferred || m?.habitInferred || m?.billingProbe || !savedModelName || m?.guess || m?.fromTitle)) ? (top0.canon || top0.label || savedModelName) : savedModelName, name = pend ? '' : String(revPreferred || savedModelName || candidate?.name || top0?.canon || top0?.label || cleanModelVal(m?.candidateName) || cleanModelVal(m?.reverseLabel) || (isOpenThinkNow ? '开源模型' : '') || m?.name || '').replace(/\?+$/, ''), [fam, sfx] = famTier(name), vid = pend ? null : Brand.of(name), unit = this.unit();
    const conf = candidate?.probability ?? ConversationLabels.fingerprintData(m)?.confidence, bt = Budget.sid(sid), est = chat && !chat.busy ? LiveEst.of(chat) : null;
    const compTurns = chat && Array.isArray(chat.messages) ? chat.messages.filter(x => x && x.role === 'assistant' && x.status === 'completed').length : 0;
    const totalTurns = Math.max(bt?.turns || 0, billing?.sessionPayment?.turns || 0, compTurns);
    const top0IsCost = Boolean(uniqueTop && top0 && (top0.diophantinePassed || top0.revPct != null) && !top0.habitSource);
    const revMatch = (top0IsCost && !m?.userCorrected) ? (top0.revPct ?? top0.match ?? m?.reverseMatch ?? m?.confidence) : (m?.reverseMatch ?? m?.confidence);
    const srcLabel = m?.userCorrected ? '手动纠偏确认'
      : (m?.routed || billing?.habitRoute?.routed || billing?.diagnostics?.routeSwitched) ? ('中途路由切换识别' + (Number.isFinite(revMatch) ? ' ' + +Number(revMatch).toFixed(1) + '%' : ''))
      : pend ? ('候选并列 · 请继续沟通' + (Number.isFinite(revMatch) ? '（最高 ' + +Number(revMatch).toFixed(1) + '%）' : ''))
      : candidate ? '候选 · ' + candidate.reason + ' ' + +(conf * 100).toFixed(1) + '%'
      : !m?.name && !top0IsCost ? '待识别'
      : m?.fromTitle && !fp && !top0IsCost ? '同步标题'
      : fp?.skipped && !top0IsCost ? '指纹已跳过'
      : top0IsCost ? ('费用反推' + (Number.isFinite(revMatch) ? ' ' + +Number(revMatch).toFixed(1) + '%' : ''))
      : m?.habitInferred ? ((m?.provider || '对话习惯指纹') + (Number.isFinite(revMatch) ? ' ' + +Number(revMatch).toFixed(1) + '%' : ''))
      : (m?.reverseInferred || m?.billingProbe) ? ('费用反推' + (Number.isFinite(revMatch) ? ' ' + +Number(revMatch).toFixed(1) + '%' : ''))
      : !fp && m?.guess ? '按回复格式推测'
      : !fp ? '型号记录'
      : fp.apiIdentity ? 'API记录'
      : '指纹识别' + (conf != null ? ' ' + +(conf * 100).toFixed(1) + '%' : '');
    const card = h('section', { class: 'mc-card mc-hero' });
    card.append(h('div', { class: 'mc-top' }, vid ? vlogo(vid, 30) : h('span', { class: 'vlogo', style: { width: '30px', height: '30px' } }, '?'),
      h('div', { class: 'mc-name', title: pend ? '候选模型权重接近，请继续沟通以锁定唯一模型' : (candidate?'候选 '+name+' · '+candidate.reason+'，身份待核对':name) }, h('div', { class: 'mc-fam' }, h('span', {}, pend ? '请继续沟通' : ((fam || name || '未识别')+(candidate?'?':''))), !pend && sfx ? h('span', { class: 'mc-tier', 'data-lv': TIER_LV[sfx] ?? 3 }, sfx) : null, !pend && typeof BillingProbe === 'undefined' ? this.scoreBadge(sid, m, true) : null),
        h('div', { class: 'mc-meta' }, [vid ? Brand.NAME[vid] : null, srcLabel, totalTurns ? totalTurns + ' 轮' : null].filter(Boolean).join(' · ')))));
    const rBanner = this.routeBanner(sid, m, billing, name);
    if (rBanner) card.append(rBanner);
    if (typeof BillingProbe === 'undefined') { const cp = this.renderCorrectPanel(sid, m, name); if (cp) card.append(cp); }
    const preTok = billing?.preimage?.latest || billing?.preimage?.totals || m?.reverseTokens || null;
    const tok = preTok?.total || (est ? est.input + est.output : null), usd = est?.usd || 0, usdTxt = charged!=null ? fmtUsd(charged) : usd ? '≈ ' + fmtUsd(usd) : '—', tokTxt = tok ? (preTok?.total ? '' : '≈ ') + Math.round(tok).toLocaleString('en-US') : '—';
    card.append(h('div', { class: 'mc-spend' }, h('div', { class: 'eyebrow' }, (unit==='usd' && charged!=null ? '最近回复 · 实付' : '最近回复 · 估算用量'), tipI(charged!=null?'实付来自本轮账单；Token优先生效反推精确整数原像。':'用量和花费按内容及参考单价估算。')),
      h('div', { class: 'mc-big' + (!est && !preTok && !(unit==='usd' && charged!=null) ? ' wait' : '') }, h('span', { class: 'mc-big-val' }, unit === 'usd' ? usdTxt : tokTxt, h('small', {}, unit === 'usd' || !tok ? '' : ' tok')), this.unitBtn(unit)),
      h('div', { class: 'mc-sub' }, unit === 'usd' ? (tok ? tokTxt + ' tok' : '用量待估算') : (charged!=null?'实付 ':'估算 ')+usdTxt, (billing?.sessionPayment?.effectiveUsd > 0 || bt) ? h('span', { class: 'dim' }, ' · 本对话 ' + (billing?.sessionPayment?.chargedUsd > 0 ? '' : '≈ ') + fmtUsd(billing?.sessionPayment?.effectiveUsd || bt.usd) + ' · ' + (totalTurns || 1) + ' 轮' + (billing?.sessionPayment?.reconciled ? ' · ✓核对' : ''), billing?.sessionPayment ? tipI([
        `会话累计实付总额（${billing.sessionPayment.turns || billing.sessionPayment.count || 1} 轮）：${fmtUsd(billing.sessionPayment.effectiveUsd)}`,
        billing.sessionPayment.basePriceUsd != null ? `会话基准总额（basePriceUsd）：${fmtUsd(billing.sessionPayment.basePriceUsd)}${billing.sessionPayment.chargedIdentityOk ? ' · 扣费 = 2 × 基准价 ✓' : ''}` : null,
        billing.sessionPayment.upstreamUsd != null ? `会话上游原始成本（upstreamUsd）：${fmtUsd(billing.sessionPayment.upstreamUsd)}${billing.sessionPayment.channelIdentityOk ? ' · 四通道合计一致 ✓' : ''}` : null,
        billing.sessionPayment.preimageIdentityOk ? 'Token 原像与单价反算总额精确吻合 ✓' : null,
      ].filter(Boolean).join('\n')) : null) : null)));
    if (preTok || est) card.append(h('div', { class: 'mc-uses' }, ...useKeys(preTok ? preTok.input : est.input, preTok ? preTok.cacheRead : est.cached, preTok ? preTok.output : est.output, est?.reasoning ?? null, true)));
    const e = Budget.est(), t = Budget.text(e);
    card.append(h('div', { class: 'mc-sub' }, h('span', { class: 'dim' }, '账号额度 '), h('b', {}, e?.pulse != null ? e.pulse + '%' : '—'), t.head ? h('span', { class: 'dim' }, ' · 推断 ' + t.head) : null, tipI(t.why)));
    const foot = h('div', { class: 'mc-chips mc-foot-row' });
    if(billing)foot.append(BillingProbe.badge(sid,()=>{this.techOpen=true;this.render();}));
    foot.append(this.exportBtns(sid));
    card.append(foot);
    { const ex = this.exportRow(sid); if (ex) card.append(ex); }
    return card;
  },
  /* 导出：指纹报告 + 本对话用到的全部调用工具（放在识别卡片底部，替代对话顶部的「导出指纹」） */
  exportRow(sid) {
    const chat = sid ? Chats.get(sid) : null, mi = sid ? Models.get(sid) : null, fpOk = !!(mi?.fingerprint && !mi.fingerprint.skipped);
    const bpPend = typeof BillingProbe !== 'undefined' && sid ? !!BillingProbe.state?.(sid)?.pending : false;
    const isIdent = !!(chat?.identifying || chat?.probeProgress || AutoId.busy?.has(sid) || this.busy || bpPend || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat)) || (typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat)) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat)));
    if (isIdent) {
      const pTxt = String(chat?.probeProgress || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat) ? '正在测算数字指纹…' : typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chat) ? '正在补读运行记录与反推型号…' : typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat) ? '正在执行鹈鹕推理测试…' : bpPend ? '正在同步计费账单与反推…' : '正在读取运行记录识别型号…'));
      const mStep = /(\d+)\s*\/\s*(\d+)/.exec(pTxt);
      const pct = Number.isFinite(chat?.probePct) ? Math.max(8, Math.min(98, Math.round(chat.probePct)))
        : mStep ? Math.max(15, Math.min(95, Math.round((+mStep[1] / Math.max(1, +mStep[2])) * 90)))
        : null;
      return h('div', { class: 'mc-acts mc-ident-prog' + (pct == null ? ' indet' : ''), title: pTxt, 'data-tip': pTxt },
        h('div', { class: 'mc-ip-bar' }, h('i', { class: 'mc-ip-fill', style: pct != null ? { width: pct + '%' } : {} })),
        h('div', { class: 'mc-ip-txt' }, h('i', { class: 'spin' }), h('span', { class: 'mc-ip-msg' }, pTxt), pct != null ? h('b', { class: 'mono' }, pct + '%') : null));
    }
    return null;
  },
  async exportTools(sid, btn) {
    const chat = Chats.get(sid); if (!chat) return;
    if (btn) btn.disabled = true;
    try {
      if (chat.hasMore) { toast('正在读取完整对话…'); await chat.loadAll(); }
      const tools = new Map(), order = [];
      for (const m of chat.messages || []) for (const p of m.parts || []) {
        const ty = String(p?.type || ''); if (!(ty.startsWith('tool-') || ty === 'dynamic-tool')) continue;
        const name = p.toolName || ty.replace(/^tool-/, ''); if (!name) continue;
        let t = tools.get(name); if (!t) { t = { name, dynamic: ty === 'dynamic-tool', calls: 0, states: {}, inputFields: new Set(), firstMessage: m.id || null, lastMessage: null, firstAt: null, lastAt: null }; tools.set(name, t); order.push(name); }
        t.calls++; const st = p.state || 'unknown'; t.states[st] = (t.states[st] || 0) + 1; t.lastMessage = m.id || t.lastMessage;
        const at = m.createdAt || m.created_at || null; if (at) { t.firstAt ||= at; t.lastAt = at; }
        const inp = p.input && typeof p.input === 'object' && !Array.isArray(p.input) ? p.input : null; if (inp) for (const k of Object.keys(inp).slice(0, 40)) t.inputFields.add(k);
      }
      const list = order.map(n => { const t = tools.get(n); return { ...t, inputFields: [...t.inputFields] }; }).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
      const mi = Models.get(sid);
      const data = { kind: 'brana-tool-calls', exportedAt: new Date().toISOString(), conversationId: sid, title: History.byId?.(sid)?.title || chat.title || '', model: mi?.name || null, messages: (chat.messages || []).length, complete: !chat.hasMore, toolCount: list.length, totalCalls: list.reduce((a, t) => a + t.calls, 0), tools: list };
      if (!list.length) toast('这个对话里没有调用过工具，仍导出空列表');
      await FileExport.text(JSON.stringify(data, null, 2), 'tool-calls-' + String(sid).slice(0, 8) + '-' + Date.now() + '.json');
    } catch (e) { toast('导出失败：' + describe(e), 'err'); }
    finally { if (btn) btn.disabled = false; }
  },
  /* 指纹溯源：本次指纹识别里最接近的 5 个指纹模型及各自的相对概率（同一指纹库内，所有候选加起来 = 100%） */
  traceCard(sid, m, {historical=false}={}) {
    const fp = m?.fingerprint, r = fp?.result, key = id => Strength.foldVer(String(id || '')).toLowerCase();
    const lib = r?.library || fp?.source || '', st = { clear: '明确', close: '接近', weak: '较弱' }[r?.status] || '';
    const libs = (r?.libraries || []).filter(x => x?.lib);
    /* 可切换的视图：综合结果（各库不一致时 = 各库平均；一致时 = 胜出那个库）+ 每个启用的库自己的排名。
       旧指纹 / 后来才启用的库没有存各库候选：选中时用本对话已有的探针回复现算一次（只读，不发消息、不改已存结果） */
    const views = [], lazy = (this.fpLazy ||= new Map()), seen = new Set();
    const mainName = r?.disagree?.length || r?.reason==='library_disagree' ? '各库平均' : lib;
    if (r) { views.push({ name: mainName, cands: r.candidates || [], top: r.nearest?.id, tp: r.signals?.relative_probability, status: r.status }); seen.add(mainName); }
    let fl = []; try { fl = typeof FPLibs !== 'undefined' ? FPLibs.list().filter(x => x.enabled) : []; } catch {}
    for (const x of libs) { if (seen.has(x.lib)) continue; seen.add(x.lib); const lid = fl.find(l => l.name === x.lib)?.id;
      if (Array.isArray(x.cands) && x.cands.length) views.push({ name: x.lib, cands: x.cands, top: x.id, tp: x.p, status: x.status });
      else views.push({ name: x.lib, libId: lid, lazy: true, cands: x.id ? [{ id: x.id, probability: Number(x.p) || 0 }] : [], top: x.id, tp: x.p, status: x.status }); }
    for (const l of fl) if (!seen.has(l.name)) { seen.add(l.name); views.push({ name: l.name, libId: l.id, lazy: true, cands: [], status: '' }); }
    for (const v of views) if (v.lazy && v.libId) { const c = lazy.get(sid + '|' + v.libId + '|' + (m?.at || '')); if (c?.cands) Object.assign(v, { cands: c.cands, top: c.id, tp: c.p, status: c.status, lazy: false, computed: true }); else if (c) Object.assign(v, c); }
    const vi = (this.fpView ||= new Map()), cur = views.length ? Math.max(0, views.findIndex(x => x.name === vi.get(sid))) : 0, v = views[cur];
    const repaint = el => el?.closest('.mc-trace')?.replaceWith(this.traceCard(sid, m));
    const compute = async (view, el) => {
      const k = sid + '|' + view.libId + '|' + (m?.at || ''); if (lazy.get(k)?.busy) return;
      lazy.set(k, { busy: true }); repaint(el);
      try {
        const chat = Chats.get(sid), found = chat && typeof FingerprintReview !== 'undefined' ? FingerprintReview.scan(chat, null) : [];
        if (!found.length) throw Error(chat?.loaded ? '本对话里找不到可用的指纹测试回复' : '对话消息还没加载完，稍后再试');
        const use = found.slice(-Math.max(1, Math.min(3, fp?.count || 3))), outputs = use.map(x => ({ text: x.text, challenge_id: x.probe.id, expected_count: x.probe.expected_count }));
        lazy.set(k, await FPLibs.rank(view.libId, outputs, undefined, { thought: FPLibs.thought?.(use.map(x => x.answer)) }));
      } catch (e) { lazy.set(k, { err: describe(e) }); }
      for (const card of document.querySelectorAll('.mc-trace')) if (card.dataset.sid === String(sid || '')) { card.replaceWith(this.traceCard(sid, Models.get(sid) || m)); break; }
    };
    const pick = (i, el) => { const t = views[i]; vi.set(sid, t.name); if (t.lazy && t.libId && !t.err && !t.busy) void compute(t, el); else repaint(el); };
    let libEl = null;
    if (v?.name && views.length > 1) {
      const menu = h('div', { class: 'mc-fp-menu', role: 'menu', hidden: true }, ...views.map((x, i) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(i === cur), class: i === cur ? 'on' : null,
        onclick: e => { e.stopPropagation(); menu.hidden = true; if (i !== cur) pick(i, e.currentTarget); } }, h('span', { class: 'mc-fp-mk' }, i === cur ? '✓' : ''), h('span', { class: 'grow' }, x.name), x.lazy && !x.computed ? h('small', {}, '现算') : x.computed ? h('small', {}, '已现算') : null)));
      const btn = h('button', { type: 'button', class: 'eyebrow mc-fp-lib', title: '切换指纹库：看不同库对这几条回复的溯源排名', 'aria-haspopup': 'menu', 'aria-label': '切换指纹库，当前 ' + v.name,
        onclick: e => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) { const off = ev => { if (!menu.contains(ev.target) && ev.target !== btn) { menu.hidden = true; document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); } } },
        h('span', { class: 'mc-fp-ln' }, v.name), h('span', { class: 'mc-fp-cyc', 'aria-hidden': 'true' }, '▾'));
      libEl = h('span', { class: 'mc-fp-sw' }, btn, menu);
    } else if (v?.name) libEl = h('span', { class: 'eyebrow', title: '指纹库' }, v.name);
    const chatForTrace = sid ? Chats.get(sid) : null;
    const isOpenThinkTrace = !!(chatForTrace && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(chatForTrace)?.kind === 'compat-thinking');
    const rows = new Map();
    for (const c of v?.cands || []) {
      const id = String(c?.id || ''); if (!id) continue;
      if (isOpenThinkTrace && this.isClosedModelName(id)) continue;
      const k = key(id), p = Number(c.probability) || 0, o = rows.get(k); if (o) o.p += p; else rows.set(k, { id, p });
    }
    if (v?.top && Number.isFinite(v.tp) && !(isOpenThinkTrace && this.isClosedModelName(v.top))) rows.set(key(v.top), { id: v.top, p: v.tp });     /* 各库不一致时，最近者的概率是各库平均值 */
    const list = [...rows.values()].sort((x, y) => y.p - x.p).slice(0, 5), topKey = v?.top ? key(v.top) : '';
    const vst = { clear: '明确', close: '接近', weak: '较弱' }[v?.status] || (cur === 0 ? st : '');
    const card = h('section', { class: 'mc-card mc-trace', 'data-sid': sid || '' }, h('div', { class: 'mc-gh' }, icon('fingerprint'), h('b', { class: 'grow' }, historical?'指纹识别 · 历史':'指纹识别'), libEl));
    if (v?.busy) { card.append(h('p', { class: 'note' }, h('i', { class: 'spin' }), ' 正在用 ' + v.name + ' 分析本对话已有的指纹回复（不发送消息）…')); return card; }
    if (v?.err) { card.append(h('p', { class: 'note' }, v.name + '：' + v.err), h('button', { class: 'btn wide ghost', onclick: e => { this.fpLazy.delete(sid + '|' + v.libId + '|' + (m?.at || '')); pick(cur, e.currentTarget); } }, '重试')); return card; }
    if (cur > 0 && v?.lazy && list.length <= 1 && v.libId) { void Promise.resolve().then(() => compute(v, null)); }
    if (!list.length) { card.append(h('p', { class: 'note' }, m?.fromTitle && !fp ? '这个结果来自同步标题（另一台设备测的），本机没有候选明细。在本机测一次指纹后这里会列出最接近的 5 个指纹模型。' : '这次指纹没有保存候选明细。重新测一次指纹后这里会列出最接近的 5 个指纹模型。')); return card; }
    card.append(h('div', { class: 'mc-fp-sub' }, (vst || '候选') + (fp?.partial ? ' · 测试中 ' + fp.count + '/' + (fp.goal || 3) + ' 条' : fp?.count ? ' · ' + fp.count + ' 条回复' : '')));
    list.forEach((x, i) => card.append(h('div', { class: 'mc-fp-row' + (key(x.id) === topKey ? ' top' : ''), title: x.id },
      h('i', { class: 'mc-fp-bar', style: { width: Math.max(0, Math.min(100, x.p * 100)) + '%' } }), h('span', { class: 'mc-fp-n' }, i + 1), h('span', { class: 'mc-fp-m' }, Strength.canon(x.id)), h('b', { class: 'mc-fp-p' }, x.p > 0 && x.p < 0.001 ? '<0.1%' : +(x.p * 100).toFixed(1) + '%'))));
    if (r?.disagree?.length || libs.length > 1) card.append(h('div', { class: 'mc-fp-libs' }, ...libs.map(x => h('div', { class: x.lib === v?.name ? 'on' : null }, x.lib + ' → ' + Strength.canon(x.id) + (Number.isFinite(x.p) ? ' · ' + +(x.p * 100).toFixed(1) + '%' : ''))), r?.disagree?.length ? h('div', { class: 'warn' }, '库间分歧 · 按均值排序') : null));
    if (cur === 0 && r?.excluded?.length) card.append(h('small', {class:'dim',title:[...new Set(r.excluded.map(x=>Strength.canon(x)))].join('、')},'已筛除 '+new Set(r.excluded).size+' 款',tipI('按既有指纹规则筛选；排除列表：'+r.excluded.map(x=>Strength.canon(x)).join('、'))));
    card.append(h('small', {class:'dim'},'相对匹配 · 非身份准确率'));
    return card;
  },
  unit() { return Prefs.spendUnit === 'usd' ? 'usd' : 'token'; },
  overview(box, sid, t, c) {
    if (!t) { this.empty(box, sid); try { const pc = PelicanShots.card(sid) || (PelicanShots.entryCard ? PelicanShots.entryCard(sid) : null); if (pc) box.append(pc); } catch {} return; }
    const ts = this.turnsOf(sid), idx = ts.indexOf(t), tot = Trace.totals(sid), unit = this.unit();
    const billing=t===ts.at(-1) && typeof BillingProbe!=='undefined'?BillingProbe.summary(sid):null;
    // ① 身份 + 消耗
    const mCur = Models.get(sid);
    const hasReidCur = Boolean((mCur?.userCorrected || mCur?.routed || mCur?.habitInferred || mCur?.reverseInferred || mCur?.billingProbe) && mCur?.name && !mCur?.pendingConfirm && !mCur?.guess);
    const best = hasReidCur ? mCur.name : (t.best || t.internal || c?.response || c?.request || c?.model || mCur?.name || ''), [fam, sfx] = famTier(best), vid = Brand.of(best) || Brand.of(c?.model || '');
    const tier = (hasReidCur && sfx) ? sfx : (c?.effort && c.effort !== 'conflict' ? c.effort : sfx);
    const card = h('section', { class: 'mc-card mc-hero' });
    const top = h('div', { class: 'mc-top' }, vid ? vlogo(vid, 30) : h('span', { class: 'vlogo', style: { width: '30px', height: '30px' } }, '?'),
      h('div', { class: 'mc-name', title: best }, h('div', { class: 'mc-fam' }, h('span', {}, fam || best || '未识别'), tier ? h('span', { class: 'mc-tier', 'data-lv': TIER_LV[tier] ?? Math.round(Strength.level(best) ?? 3), title: Strength.label(best) }, tier) : null),
        h('div', { class: 'mc-meta' }, [vid ? Brand.NAME[vid] : null, mCur?.userCorrected ? '手动纠偏确认' : null, `第 ${idx + 1} 轮`, t.calls.length + ' 次调用'].filter(Boolean).join(' · '))));
    card.append(top);
    const ovRouteBanner = this.routeBanner(sid, mCur, billing, best);
    if (ovRouteBanner) card.append(ovRouteBanner);
    { const cp = this.renderCorrectPanel(sid, mCur, best); if (cp) card.append(cp); }
    const s = t.sum || {}, exact = n => Number.isFinite(+n) && n != null ? Math.round(+n).toLocaleString('en-US') : '—';
    // 用量没报告（Trace 还没写入 / 运行令牌过期）：按实时内容估算，标「≈ 估算」，绝不显示假的 0
    const chatH = Chats.get(sid), latestT = t === ts.at(-1);
    const est = !s.known && latestT && chatH ? LiveEst.of(chatH) : null;
    const tokV = s.known ? s.tok : est ? est.input + est.output : null;
    const charged=billing?.tracePaired?billing.payment?.chargedUsd:null;
    const usdV = s.usd || s.usdEst || est?.usd || 0, usdEstd = !s.usd && (s.usdEst || est?.usd);
    const usdTxt = charged!=null ? fmtUsd(charged) : usdV ? (usdEstd ? '≈ ' : '') + fmtUsd(usdV) : '—';
    const tokTxt = tokV == null ? '—' : (s.known ? '' : '≈ ') + exact(tokV);
    const big = unit === 'usd' ? usdTxt : tokTxt, bigU = unit === 'usd' ? '' : tokV == null ? '' : ' tok';
    const why = !s.known ? (est ? '调用详情还没报告用量，先按对话内容估算；Trace 写入后自动换成实际值' : '调用详情还没报告用量，稍后自动补读') : s.src === 'records' ? '用量来自 Brana 的 token.usage 记录（调用详情没报告）' : s.missing ? `${s.missing} 次调用还没报告用量，稍后自动补读` : '';
    card.append(h('div', { class: 'mc-spend' },
      h('div', { class: 'eyebrow' }, idx === ts.length - 1 ? (t.done ? (unit==='usd' && charged!=null?'最近回复 · 实付':'最近一次') : '本轮（进行中）') : `第 ${idx + 1} 轮`, why ? tipI(why) : null),
      h('div', { class: 'mc-big' + (tokV == null && unit !== 'usd' ? ' wait' : '') }, h('span', { class: 'mc-big-val' }, big, h('small', {}, bigU)), this.unitBtn(unit)),
      h('div', { class: 'mc-sub' }, unit === 'usd' ? (tokV == null ? '用量待补读' : tokTxt + ' tok') : (charged!=null?'实付 ':'')+usdTxt, h('span', { class: 'dim' }, ' · 本对话 ' + (unit === 'usd' ? fmtUsd(billing?.sessionPayment?.effectiveUsd || tot.usd) : '≈ ' + fmtTok(tot.tok) + ' tok') + ' · ' + (billing?.sessionPayment?.turns || tot.turns) + ' 轮' + (billing?.sessionPayment?.reconciled ? ' · ✓核对' : ''), billing?.sessionPayment ? tipI([
        `会话累计实付总额（${billing.sessionPayment.turns || billing.sessionPayment.count || 1} 轮）：${fmtUsd(billing.sessionPayment.effectiveUsd)}`,
        billing.sessionPayment.basePriceUsd != null ? `会话基准总额（basePriceUsd）：${fmtUsd(billing.sessionPayment.basePriceUsd)}${billing.sessionPayment.chargedIdentityOk ? ' · 扣费 = 2 × 基准价 ✓' : ''}` : null,
        billing.sessionPayment.upstreamUsd != null ? `会话上游原始成本（upstreamUsd）：${fmtUsd(billing.sessionPayment.upstreamUsd)}${billing.sessionPayment.channelIdentityOk ? ' · 四通道合计一致 ✓' : ''}` : null,
        billing.sessionPayment.preimageIdentityOk ? 'Token 原像与单价反算总额精确吻合 ✓' : null,
      ].filter(Boolean).join('\n')) : null))));
    card.append(h('div', { class: 'mc-uses' }, ...useKeys(s.known ? s.input : est?.input ?? null, s.known ? s.cacheRead : est?.cached ?? null, s.known ? s.output : est?.output ?? null, s.known ? s.reasoning : est?.reasoning ?? null, true)));
    // 标签：一行；窄的时候只显示图标（悬停看完整说明）
    const chips = h('div', { class: 'mc-chips' });
    const chip = (ic, text, tone, title, fn) => chips.appendChild(h(fn ? 'button' : 'span', { class: 'mc-chip', 'data-tone': tone || null, title, 'data-tip': title, onclick: fn || null }, icon(ic), h('span', {}, text)));
    const rs = c?.reasoning;
    if (c?.detailed || t.think != null) chip('brain', rs > 0 ? fmtTokS(rs) : t.think ? '有' : '无', rs > 0 || t.think ? 'think' : '', '思考链：' + (rs > 0 ? '推理 ' + fmtTok(rs) + ' tokens' : t.think ? '本轮有推理 token' : '这次调用没有报告推理 token'));
    chip(t.changed ? 'route' : 'check', t.changed ? '换模型' : t.done ? '一致' : '核对中', t.changed ? 'warn' : t.done ? 'ok' : '', '换模型：' + (t.changed ? (t.routing ? (t.routing.from || '原模型') + ' → ' + (t.routing.to || '其他模型') : '本轮出现多个模型：' + t.models.join(' / ')) : '本轮所有调用都是同一个模型（未换模型）'), () => this.focusLive());
    const chatX = Chats.get(sid), liveNow = !!chatX?.busy && t === Trace.latest(sid);
    if (c?.tps) chip('bolt', c.tps + 'tok/s', '', '输出速度（Trace 报告）' + (c.ttft ? ' · 首包 ' + (c.ttft / 1000).toFixed(1) + ' 秒' : ''));
    if (liveNow) chip('pulse', '监控', 'live', '这一轮进行中：每 6 秒读取一次 Trace，出现新调用立即核对型号', () => this.focusLive());
    if (t.outcome) chip('alert', t.outcome === 'failed' ? '失败' : '空回复', 'warn', t.outcome === 'failed' ? 'Brana 记录本轮失败' : '本轮没有产出回复');
    if(billing)chips.append(BillingProbe.badge(sid,()=>{this.techOpen=true;this.render();}));
    chips.append(this.exportBtns(sid));
    card.append(chips);
    { const ex = this.exportRow(sid); if (ex) card.append(ex); }
    // 名称来源
    if (c) {
      const src = h('button', { class: 'mc-srcs', title: '型号名称来源是否一致（点开识别细节）', onclick: () => { this.techOpen = true; this.render(); setTimeout(() => this.el.querySelector('.mc-tech')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); } });
      const same = (a, b) => a && b && famTier(a)[0].toLowerCase() === famTier(b)[0].toLowerCase();
      for (const [k, l] of [['request', '请求'], ['response', '响应'], ['internal', '内部']]) {
        const v = k === 'internal' ? t.internal : c[k], st = !v ? 'none' : same(v, best) ? 'ok' : 'diff';
        src.append(h('span', { class: 'mc-src', 'data-st': st, title: l + '：' + (v || '未提供') }, h('i'), l + (st === 'diff' ? ' ' + Brand.short(v) : '')));
      }
      card.append(src);
      card.append(this.callBar(t, c));
    }
    box.append(card);
    // ② 本轮实时（Trace）；进行中但 Trace 停了（运行令牌过期）或还没读到这一轮时，另外给出按实时内容的估算
    const chatB = Chats.get(sid), isIdentNow = !!(chatB?.identifying || chatB?.probeProgress || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chatB)) || (typeof BillingProbe !== 'undefined' && BillingProbe.isRunning?.(chatB))), stale = chatB?.busy && !isIdentNow && (t.done || !Trace.validRuns(sid).length || (chatB.runAt && (t.at || 0) < chatB.runAt - 120000));
    if (stale) box.append(this.estCard(sid, t));
    box.append(this.liveCard(sid, t, c));
    // ③ 识别细节（识别结果 + 技术细节合并，都是当前对话）
    box.append(this.detailCard(sid, t, c));
    try { const pc = PelicanShots.card(sid) || (PelicanShots.entryCard ? PelicanShots.entryCard(sid) : null); if (pc) box.append(pc); } catch {}
  },
  callBar(t, c) {
    const inp = c.input, out = c.output, cr = c.cacheRead, rs = c.reasoning, total = c.total ?? (inp != null || out != null ? (inp || 0) + (out || 0) : Trace.kNum(c.totalLabel));
    const box = h('div', { class: 'mc-callbar' }, h('div', { class: 'mc-callbar-h' }, h('span', {}, t.calls.length > 1 ? `第 ${t.calls.indexOf(c) + 1} 次调用` : '本次调用'), h('span', { class: 'mono' }, total ? total.toLocaleString('en-US') + ' tok' : '用量待补读', (c.aiCost ?? c.usd) != null ? ' · ' + fmtUsd(c.aiCost ?? c.usd) : '')));
    if (inp == null && out == null) { box.append(h('div', { class: 'mc-stack wait' }), h('div', { class: 'mc-uses sm dim' }, c.detailed ? '这次调用还没报告用量（span 刚结束时常见），稍后自动补读' : '只有概要：' + (c.totalLabel || '—') + ' tokens', tipI('Trace 的调用详情在调用结束几秒后才写入用量；客户端会自动再读，也可以点「深度核对」立即补读。'))); return box; }
    const bar = h('div', { class: 'mc-stack' }); bar.append(...stack(c, total));
    box.append(bar, h('div', { class: 'mc-uses sm' }, ...useKeys(inp, cr, out, rs, false))); return box;
  },
  // 进行中但 Trace 读不到 / 停了：按实时通道里已收到的内容估算本轮用量和花费（单价 = 参考价 × 实测校正）
  estCard(sid, t) {
    const chat = Chats.get(sid), e = LiveEst.of(chat), card = h('section', { class: 'mc-card mc-live mc-est' });
    const dur = ms => { if (!(ms > 0)) return '—'; const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0'); };
    card.append(h('div', { class: 'mc-h' }, icon('pulse'), h('b', {}, '本轮实时 · 估算'), chat?.busy ? h('i', { class: 'mc-dot' }) : null, tipI('按实时通道里已收到的正文、思考、工具输入输出估算 token；每一步都会把之前的上下文再发一次（大部分走缓存）。花费 = 参考单价 × 从本机实测花费学到的校正系数，每读到一次实际花费就自动校准。'),
      h('span', { class: 'eyebrow grow r' }, e?.since ? '已运行 ' + dur(now() - e.since) : chat?.phase || '')));
    const noTok = !Trace.validRuns(sid).length, why = noTok ? (Object.keys(Trace.info(sid) || {}).length && t ? '运行令牌已过期（一轮超过 1 小时后 Brana 不再给读 Trace），改为按实时内容估算' : '还没拿到这一轮的运行令牌，先按实时内容估算') : 'Trace 还没更新到这一轮，先按实时内容估算';
    card.append(h('div', { class: 'mc-verdict', 'data-tone': 'busy' }, icon('refresh'), h('span', { class: 'grow' }, noTok ? '按实时内容估算' : 'Trace 还没更新到这一轮'), tipI(why)));
    if (!e) { card.append(h('p', { class: 'note' }, '等待回复内容…')); return card; }
    const kv = h('div', { class: 'bp-pills mc-est-pills' });
    const pill = (ic, val, desc, tone = '') => kv.append(h('span', { class: 'bp-pill' + (tone ? ' bp-' + tone : ''), title: desc, 'data-tip': desc, tabindex: 0, role: 'button' }, icon(ic), h('b', { class: 'mono' }, val)));
    pill('layers', e.steps + 'S', '本轮已执行步数：' + e.steps + ' 步', 'neutral');
    pill('bolt', e.tools + 'T', '本轮工具调用次数：' + e.tools + ' 次', 'rev');
    pill('upload', '≈' + fmtTokS(e.input), '累计输入 Token：≈ ' + fmtTok(e.input) + (e.cached && e.input ? '（缓存命中 ' + Math.round(e.cached / e.input * 100) + '%）' : ''), 'in');
    pill('download', '≈' + fmtTokS(e.output), '累计输出 Token：≈ ' + fmtTok(e.output) + (e.reasoning ? '（含思考 ' + fmtTokS(e.reasoning) + '）' : ''), 'out');
    if (e.reasoning > 0) pill('brain', '≈' + fmtTokS(e.reasoning), '思考链 Token：≈ ' + fmtTok(e.reasoning), 'fp');
    pill('doc', '≈' + fmtTokS(e.ctx), '当前上下文窗口占用：≈ ' + fmtTok(e.ctx) + ' tok', 'cache');
    pill('pulse', '≈' + fmtUsd(e.usd), '本轮实时估算花费：≈ ' + fmtUsd(e.usd), 'ok');
    card.append(kv);
    const last = t && chat?.runAt && (t.at || 0) >= chat.runAt - 120000 ? t : null;
    if (last) card.append(h('div', { class: 'mc-verdict', 'data-tone': last.changed ? 'warn' : 'ok' }, icon(last.changed ? 'route' : 'check'),
      h('span', {}, `Trace 核对（${fmtClock2(Trace.info(sid).lastSync)} · ${last.calls.length} 次）：${last.changed ? '出现换模型' : '全程同一模型'}`)));
    card.append(h('div', { class: 'mc-uses sm dim' }, h('span', { class: 'grow' }, e.calN ? `已按 Trace 前 ${e.calN} 步校准 ×${e.scale.toFixed(2)}` : Price.factor(e.model).n ? '单价已按实测花费校准' : '参考单价（还没有实测花费可校准）'), tipI([e.model ? '型号 ' + Strength.canon(e.model) : '型号未识别（按默认单价）', Price.label(e.model), e.partialHistory ? '更早的消息没加载，上下文可能偏小' : ''].filter(Boolean).join('\n'))));
    return card;
  },
  focusLive() { const x = this.el?.querySelector('.mc-live'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  liveCard(sid, t, c) {
    const chat = Chats.get(sid), running = !!chat?.busy && t === Trace.latest(sid), inf = Trace.info(sid);
    const card = h('section', { class: 'mc-card mc-live' });
    card.append(h('div', { class: 'mc-h' }, icon('pulse'), h('b', {}, '本轮实时'), running ? h('i', { class: 'mc-dot' }) : null,
      tipI('每一根竖条 = 一步（一次模型调用），高度 = 这一步的 token 量。颜色从下到上：浅灰 = 缓存读取，灰 = 输入（未缓存），黑 = 输出，金 = 思考；虚线框 = 用量还没报告。条下的小点：金点 = 这一步有思考链，红 × = 这一步失败（被改派），空 = 普通。单击选中这一步，双击（或点右边 ⤢）打开大图：时间、用量、每一步分析。进行中每 6 秒读一次 Trace。'),
      h('span', { class: 'eyebrow grow r' }, [t.calls.length + ' 步', running && !t.calls.some(x => x.tok || x.total) ? '等待数据' : '', inf.deepAt && inf.deepAt >= (t.updated || 0) - 2000 ? '深度核对 ' + fmtClock2(inf.deepAt) : inf.lastSync ? '核对 ' + fmtClock2(inf.lastSync) : ''].filter(Boolean).join(' · ')),
      t.calls.length ? h('button', { class: 'ib xs', title: '打开大图（也可以双击步骤条）', onclick: () => Steps.open(sid, t) }, icon('expand')) : null));
    // 步骤条：每一步一根，堆叠 缓存 / 输入 / 输出 / 思考
    if (this.barsKey !== sid + t.key) { this.barsKey = sid + t.key; this.barsX = null; }
    const calls = t.calls.slice(-300), max = Math.max(1, ...calls.map(x => x.tok || x.total || Trace.kNum(x.totalLabel) || 0));
    const bars = h('div', { class: 'mc-bars', title: '滚轮左右滑动 · 双击打开大图', ondblclick: () => Steps.open(sid, t), onwheel: e => { if (bars.scrollWidth <= bars.clientWidth) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return; e.preventDefault(); bars.scrollLeft += d; bars._user = bars.scrollLeft < bars.scrollWidth - bars.clientWidth - 4; this.barsX = bars._user ? bars.scrollLeft : null; } });
    requestAnimationFrame(() => { bars.scrollLeft = this.barsX != null ? this.barsX : bars.scrollWidth; });
    calls.forEach((x, i) => {
      const v = x.tok || x.total || Trace.kNum(x.totalLabel) || 0, hp = v ? Math.max(10, Math.round(Math.sqrt(v / max) * 100)) : 100, usd = x.aiCost ?? x.usd;
      const tip = `#${t.calls.length - calls.length + i + 1} · ${fmtClock2(x.at)}${x.ms != null ? ' · ' + (x.ms / 1000).toFixed(1) + ' 秒' : ''}\n${Brand.short(x.response || x.request || x.model || '?')}\n${v ? v.toLocaleString('en-US') + ' tokens' : '用量未报告'}${x.input != null ? '\n输入 ' + x.input.toLocaleString('en-US') + (x.cacheRead ? '（缓存 ' + x.cacheRead.toLocaleString('en-US') + '）' : '') : ''}${x.output != null ? '\n输出 ' + x.output.toLocaleString('en-US') + (x.reasoning ? '（思考 ' + x.reasoning.toLocaleString('en-US') + '）' : '') : ''}${usd != null ? '\n花费 ' + fmtUsd(usd) : ''}${x.failed ? '\n失败（已改派）' : ''}`;
      bars.append(h('button', { class: 'mc-bar' + (x === c ? ' on' : '') + (x.failed ? ' bad' : '') + (v ? '' : ' unk'), title: tip, onclick: () => { this.sel = { sid, turn: t.key, call: x.id }; this.render(); } },
        h('span', { class: 'mc-bar-c', style: { height: hp + '%' } }, ...stack(x, v)), h('small', { class: x.failed ? 'm-bad' : x.reasoning > 0 ? 'm-think' : '' }, x.failed ? '×' : '')));
    });
    // 进行中：补几根虚线占位，表示还在等数据
    if (running) { const pend = calls.length ? 2 : 8; for (let i = 0; i < pend; i++) bars.append(h('span', { class: 'mc-bar pend' }, h('span', { class: 'mc-bar-c' }), h('small', {}))); }
    if (calls.length || running) card.append(bars);
    const v = t.changed ? ['warn', 'route', t.routing ? '已改派：' + Brand.short(t.routing.from || '原模型') + ' → ' + Brand.short(t.routing.to || '其他模型') : '本轮出现多个模型：' + t.models.map(Brand.short).join(' / ')]
      : !t.done ? (running ? ['busy', 'pulse', t.calls.length ? '实时监控中 · 已读到 ' + t.calls.length + ' 次调用' : '实时监控中：等待本对话的调用记录'] : ['busy', 'refresh', '进行中 · 已读到 ' + t.calls.length + ' 次调用'])
        : t.calls.length ? ['ok', 'check', '全程同一模型 · ' + t.calls.length + ' 次调用'] : ['', 'info', '这一轮没有模型调用记录'];
    card.append(h('div', { class: 'mc-verdict', 'data-tone': v[0] }, icon(v[1]), h('span', {}, this.busy ? '深度核对中…' : v[2])));
    // 模型时间线
    if (t.groups?.length) {
      const d = h('details', { class: 'mc-sec', open: this.tlOpen || null, ontoggle: e => { this.tlOpen = e.target.open; } },
        h('summary', {}, icon('layers'), h('span', { class: 'grow' }, '模型时间线'), h('span', { class: 'eyebrow' }, `${t.groups.length} 段 · ${t.calls.length} 次调用`), icon('chevr', 'mc-chev')));
      for (const g of t.groups) d.append(h('div', { class: 'mc-tl' + (g.failed ? ' bad' : '') }, h('i'), h('span', { class: 'grow' }, Brand.short(g.model) + (g.failed ? '（失败）' : '')), h('span', { class: 'dim' }, g.n + ' 次 · ' + fmtClock2(g.from) + (g.n > 1 ? '–' + fmtClock2(g.to) : ''))));
      card.append(d);
    }
    const older = this.turnsOf(sid).length - 1;
    const basis = ['依据：Trace ' + (t.events || 0) + ' 条事件', t.calls.length + ' 次调用', t.sum?.detailed ? '详读 ' + t.sum.detailed + ' 次' : '', older > 0 ? '本机更早 ' + older + ' 轮' : ''].filter(Boolean).join(' · ');
    card.append(h('div', { class: 'mc-deep' }, h('button', { class: 'btn primary grow', disabled: this.busy || null, onclick: () => this.deep(sid) }, this.busy ? '核对中…' : '深度核对'),
      tipI('实时监控每次读到 Trace 都会自动核对型号。「深度核对」= 立刻读取本对话此刻的全部 Trace，补读本轮所有调用的详情（最多 120 次）并逐次核对。\n' + basis + (inf.lastErr ? '\n⚠ ' + inf.lastErr : ''))));
    if (inf.lastErr) card.append(h('div', { class: 'mc-warn1', title: inf.lastErr }, icon('alert'), h('span', {}, inf.lastErr)));
    return card;
  },
  async deep(sid, discover) {
    if (this.busy || !sid) return; this.busy = true; this.render();
    try {
      const chat = chatOf(sid);
      if (discover || !Trace.validRuns(sid).length) await Trace.discover(chat);
      const r = await Trace.sync(sid, { deep: true });
      if (r?.err && !r.turns) toast(r.err, 'err');
    } catch (e) { toast(describe(e), 'err'); }
    finally { this.busy = false; this.render(); }
  },
  // 识别细节：原来的「识别结果」和「技术细节」合并成一张卡（都是当前对话）
  detailCard(sid, t, c) {
    const historicalTurn=!!t && t!==Trace.latest(sid);
    const billing=typeof BillingProbe!=='undefined' && (!t || t===Trace.latest(sid))?BillingProbe.summary(sid):null;
    const merged=billing?.mergedCandidates||[], top0=merged[0], top1=merged[1];
    const uniqueTop=top0 && (!top1 || (Number(top0.match||0) - Number(top1.match||0)) >= 0.05 || (Number(top0.combinedWeight ?? top0.match ?? 0) - Number(top1.combinedWeight ?? top1.match ?? 0)) >= 0.5);
    const m = historicalTurn?null:Models.get(sid), chat = Chats.get(sid), pend = !t && !!(m?.pendingConfirm && !uniqueTop && !(m?.name));
    const thinkSt = (chat && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    const isOpenThinkNow = thinkSt?.kind === 'compat-thinking';
    const cleanModelVal = s => (!s || /^(未知型号|待定|未识别)\??$/.test(String(s)) || (isOpenThinkNow && this.isClosedModelName?.(s))) ? '' : String(s || '');
    const candidate=(!t && !pend)?this.candidateOf(m):null;
    const savedModelName = cleanModelVal(m?.name);
    const revPreferred = ((m?.userCorrected || m?.routed) && savedModelName) ? savedModelName : (uniqueTop && top0 && (m?.reverseInferred || m?.habitInferred || m?.billingProbe || !savedModelName || m?.guess || m?.fromTitle)) ? (top0.canon || top0.label || savedModelName) : savedModelName;
    const isReidNow = !historicalTurn && Boolean(m && (m.userCorrected || m.routed || m.habitInferred || m.reverseInferred || m.billingProbe) && (revPreferred || savedModelName));
    const name = (isReidNow ? '' : t?.best) || (pend ? '' : String(revPreferred || savedModelName || candidate?.name || cleanModelVal(m?.candidateName) || cleanModelVal(m?.reverseLabel) || top0?.canon || top0?.label || (isOpenThinkNow ? '开源模型' : '') || m?.name || '').replace(/\?+$/, ''));
    const score=(historicalTurn || pend)?null:this.scoreOf(sid,m,t), shortName=Brand.short(Strength.canon(name)).replace(/\?+$/, '');
    const d = h('details', { class: 'mc-card mc-tech', open: this.techOpen || null, ontoggle: e => { this.techOpen = e.target.open; } },
      h('summary', {}, icon('layers'), h('b', { class: 'grow' }, '识别细节'), h('span', { class: 'eyebrow mc-ident-summary',title:pend?'候选权重接近，请继续沟通':(candidate?'候选 '+name+' · '+candidate.reason:name)+(score!=null?' · 推理分 '+Strength.fmtScore(score):'')+(m?.at?' · '+fmtClock2(m.at):'') }, chat?.identifying ? '识别中…' : pend ? '请继续沟通' : name ? shortName+(candidate?'?':'')+(score!=null?'-'+Strength.fmtScore(score):'') : '暂无'), icon('chevr', 'mc-chev')));
    let target=d;
    const grp = (ic,title,rows) => {const g=h('div',{class:'mc-group'},h('div',{class:'mc-gh'},icon(ic),h('span',{},title)));for(const [k,v,cls] of rows)if(v!==undefined)g.append(h('div',{class:'mc-row'},h('span',{},k),h('b',{class:cls || ''},v==null || v===''?'—':String(v))));target.append(g);};
    const fpm=m?.fingerprint && !m.fingerprint.skipped?m.fingerprint:null;
    const historicalEvidence=!!m?.fromTitle || !!billing?.diagnostics.fingerprint?.historical;
    if(billing)d.append(BillingProbe.card(sid,{chargedInHero:!chat?.busy && (!t || billing.tracePaired)}));
    else if(!t)d.append(h('button',{type:'button',class:'btn ghost',disabled:this.busy || AutoId.busy?.has(sid) || !chat || chat.identifying || null,onclick:()=>this.deep(sid,true)},icon('refresh'),this.busy || AutoId.busy?.has(sid) || chat?.identifying?'读取中…':'反推锁定'));
    const appendFpAtBottom = () => {
      if(fpm || m?.fromTitle)(billing ? target : d).append(this.traceCard(sid,m,{historical:historicalEvidence}));
      else if(!billing)d.append(h('p',{class:'note'},historicalTurn?'本轮无指纹记录':m?.guess?'仅有格式线索':'暂无数字指纹'));
    };
    const strength=h('div',{class:'mc-group mc-reasoning'},h('div',{class:'mc-gh'},icon('brain'),h('b',{class:'grow'},'推理分'),h('span',{class:'eyebrow'},historicalEvidence?'历史时长估计':'时长估计',tipI('按既有思考时长测量聚合，非能力评分；不据此确认High/Max。'))));
    strength.append(h('div',{class:'mc-score-line'},h('meter',{min:0,max:100,value:score ?? 0,'aria-label':'思考时长分',class:score==null?'unknown':''}),h('b',{class:'mono'},score==null?'未测':Strength.fmtScore(score))));
    const effort=c?.effort || (m?.routed && m?.reverseEffort) || billing?.diagnostics.latestEffort || billing?.diagnostics.strength.effort;
    if(effort)strength.append(h('small',{class:'dim'},'显式档位 '+effort));
    else if(fpm?.reasoning?.tier)strength.append(h('small',{class:'dim'},'档位估计 '+fpm.reasoning.tier));
    d.append(strength);
    if(!c && !m?.request && !m?.response && !m?.internal){
      if(chat?.idErr)d.append(h('p',{class:'note',title:chat.idErr},'型号记录待补读'));
      appendFpAtBottom();
      return d;
    }
    target=h('details',{class:'mc-native-details'},h('summary',{},'运行记录',icon('chevr','mc-chev')));d.append(target);
    if (!c) {
      grp('layers', '型号来源', [['请求型号', m?.request], ['响应型号', m?.response], ['内部名称', m?.internal], ['平台路由', m?.provider || undefined], ['路由改派', m ? (m.routed ? ((m.routeFrom && m.routeTo) ? (m.routeFrom + ' → ' + m.routeTo) : '是') : '无') : undefined, m?.routed ? 'warn' : '']]);
      appendFpAtBottom();
      return d;
    }
    grp('layers', '型号来源', [['请求型号', c.request || m?.request], ['响应型号', c.response || m?.response], ['内部名称', t.internalNames?.length ? t.internalNames.join(' / ') : m?.internal || null], ['上下文记录', t.contextName || undefined], ['Trace 标签', c.model], ['平台路由', c.provider || m?.provider], ['协议适配器', c.adapter], t.routing ? ['路由改派', (t.routing.from || '原模型') + ' → ' + (t.routing.to || '其他模型'), 'warn'] : ['路由改派', '无']]);
    grp('bolt', '推理配置', [['显式档位', c.effort === 'conflict' ? '冲突' : c.effort || '未发现'], ['名称后缀', famTier(t.internal || c.request || '')[1] || '—'], ['推理预算', c.budgets?.length ? c.budgets.map(v => v === -1 ? '自动' : v.toLocaleString('en-US')).join(' / ') : undefined], ['温度', c.temperature]]);
    grp('pulse', '报告用量 · 第 ' + (t.calls.indexOf(c) + 1) + ' 次调用', [['输入', c.input?.toLocaleString('en-US')], ['缓存读取', c.cacheRead?.toLocaleString('en-US')], ['缓存写入', c.cacheWrite?.toLocaleString('en-US')], ['输出', c.output?.toLocaleString('en-US')], ['推理', c.reasoning?.toLocaleString('en-US')], ['总 Token', c.total != null ? c.total.toLocaleString('en-US') : c.totalLabel ? '≈ ' + c.totalLabel : null], ['花费', c.aiCost != null ? fmtUsd(c.aiCost) : c.usd != null ? fmtUsd(c.usd) : null], ['耗时', c.ms != null ? (c.ms / 1000).toFixed(1) + ' 秒' : null], ['首包', c.ttft != null ? (c.ttft / 1000).toFixed(2) + ' 秒' : null], ['速度', c.tps != null ? c.tps + ' tok/s' : null], ['结束原因', c.finish]]);
    const recs = t.records.filter(r => r.detailed && r.kind !== 'context');
    if (recs.length) grp('info', 'Brana 用量记录', recs.slice(-4).map(r => [fmtClock2(r.at) + ' ' + (r.kind === 'spend' ? '花费' : '用量'), [r.internal, r.input != null ? '输入 ' + fmtTokS(r.input) : '', r.output != null ? '输出 ' + fmtTokS(r.output) : '', r.reasoning != null ? '推理 ' + fmtTokS(r.reasoning) : '', ...(r.fields || []).slice(0, 3).map(f => f.key.split('.').pop() + ' ' + f.value)].filter(Boolean).join(' · ')]));
    grp('info', '标识', [['提问开头', t.prompt ? '“' + t.prompt + '”' : null], ['调用时间', c.at ? new Date(c.at).toLocaleString('zh-CN', { hour12: false }) : null], ['Run', t.runId], ['Span', c.id]]);
    if (!c.detailed) d.append(h('div', { class: 'mc-uses sm warn' }, icon('alert'), h('span', { class: 'grow' }, '只有概要'), tipI('这次调用只有概要（型号 / 总 token / 花费），点「深度核对」补读详情。')));
    appendFpAtBottom();
    return d;
  },
  data(box, sid, t, c) {
    if (!t) return this.empty(box, sid);
    box.append(h('div', { class: 'dk-sub' }, ...[['sources', '来源'], ['raw', '原始']].map(([k, l]) => h('button', { class: this.sub.data === k ? 'on' : '', onclick: () => { this.sub.data = k; this.render(); } }, l))));
    if (this.sub.data === 'sources') {
      const tb = h('div', { class: 'dk-table' }, h('div', { class: 'dk-tr th' }, h('span', {}, '#'), h('span', {}, '时间'), h('span', {}, '型号'), h('span', {}, '输入/输出'), h('span', {}, '花费')));
      t.calls.forEach((x, i) => tb.append(h('div', { class: 'dk-tr' + (x === c ? ' on' : '') + (x.failed ? ' bad' : ''), onclick: () => { this.sel = { sid, turn: t.key, call: x.id }; this.render(); } }, h('span', {}, i + 1), h('span', {}, fmtClock2(x.at)), h('span', { title: x.request || x.model || '' }, Brand.short(x.request || x.model || '?')), h('span', {}, x.input != null ? fmtTokS(x.input) + '/' + fmtTokS(x.output) : x.totalLabel || '—'), h('span', {}, x.aiCost != null ? fmtUsd(x.aiCost) : x.usd != null ? fmtUsd(x.usd) : '—'))));
      box.append(h('section', { class: 'mc-card' }, h('div', { class: 'mc-h' }, h('b', {}, '本轮调用'), h('span', { class: 'eyebrow grow r' }, t.calls.length + ' 次 · ' + fmtUsd(t.sum?.usd))), tb));
      const recs = t.records;
      box.append(h('section', { class: 'mc-card' }, h('div', { class: 'mc-h' }, h('b', {}, 'Brana 记录'), h('span', { class: 'eyebrow grow r' }, recs.length + ' 条')),
        ...(recs.length ? recs.map(r => h('div', { class: 'mc-row' }, h('span', {}, fmtClock2(r.at) + ' ' + ({ usage: 'token.usage', spend: 'spend', context: 'context' }[r.kind])), h('b', {}, r.detailed ? [r.internal, r.input != null ? '入 ' + fmtTokS(r.input) : '', r.output != null ? '出 ' + fmtTokS(r.output) : '', r.context != null && r.kind === 'context' ? '上下文 ' + fmtTokS(r.context) : ''].filter(Boolean).join(' · ') || '—' : '未详读'))) : [h('p', { class: 'note' }, '还没有 Brana 的用量 / 花费记录（通常在回合结束后几秒写入）')])));
    } else {
      const snap = { ...t }; delete snap.raw;
      const txt = JSON.stringify({ snapshot: snap, raw: t.raw || null }, null, 2);
      const fname = `trace-${sid.slice(0, 8)}-turn.json`;
      box.append(h('div', { class: 'dk-actions' }, h('button', { class: 'btn sm ghost', onclick: () => copyText(txt) }, '复制'), h('button', { class: 'btn sm ghost', onclick: () => (typeof FileExport !== 'undefined' && FileExport.text ? void FileExport.text(txt, fname, 'application/json') : saveBlob(new Blob([txt], { type: 'application/json' }), fname)) }, '导出')),
        h('pre', { class: 'dk-raw' }, txt.length > 200000 ? txt.slice(0, 200000) + '\n…（已截断，完整内容请导出）' : txt));
    }
  },
  records(box, sid) {
    box.append(h('div', { class: 'dk-sub' }, ...[['cache', '缓存'], ['logs', '日志']].map(([k, l]) => h('button', { class: this.sub.records === k ? 'on' : '', onclick: () => { this.sub.records = k; this.render(); } }, l))));
    if (this.sub.records === 'cache') {
      const idx = Object.entries(Trace.index()).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)), bytes = idx.reduce((a, [, v]) => a + (v.bytes || 0), 0);
      box.append(h('section', { class: 'mc-card' }, h('div', { class: 'mc-h' }, h('b', {}, '本机缓存'), h('span', { class: 'eyebrow grow r' }, idx.length + ' 个对话 · ' + fmtBytes(bytes))),
        h('p', { class: 'note' }, '每个对话的模型信息保存在本机（按账号隔离），运行记录过期后仍可查看。'),
        ...idx.slice(0, 150).map(([k, v]) => h('div', { class: 'dk-cache' + (k === sid ? ' on' : '') }, h('button', { class: 'grow', title: k, onclick: () => Tabs.open(k, { title: History.byId(k)?.title || v.title }) }, h('span', {}, History.byId(k)?.title || v.title || k.slice(0, 8)), h('small', {}, `${v.n} 轮 · ${fmtUsd(v.usd)} · ${fmtBytes(v.bytes || 0)}`)), h('button', { class: 'ib xs', title: '删除', onclick: () => { Trace.clear(k); this.render(); } }, icon('x')))),
        idx.length ? h('button', { class: 'btn sm ghost', onclick: async () => { if (await Dialog.confirm({ title: '清空缓存', text: '清空全部模型信息缓存？', ok: '清空', danger: true })) { Trace.clear(); this.render(); } } }, '清空全部') : null));
    } else {
      const lines = Trace.log.slice(-200).reverse();
      box.append(h('section', { class: 'mc-card' }, h('div', { class: 'mc-h' }, h('b', {}, '日志'), h('span', { class: 'eyebrow grow r' }, lines.length + ' 条')),
        ...(lines.length ? lines.map(l => h('div', { class: 'dk-log ' + (l.lvl || '') }, h('time', {}, fmtClock2(l.at)), h('span', { title: l.sid }, (History.byId(l.sid)?.title || l.sid || '').slice(0, 14) + ' · ' + l.text))) : [h('p', { class: 'note' }, '暂无日志')])));
    }
  },
  // 格式推测核对：推测 vs 真实型号
  accRow() {
    const st = Object.entries(FmtAcc.stats()).sort((a, b) => b[1].n - a[1].n);
    const txt = st.length ? st.map(([f, x]) => (Fmt.NAME[f] || f).replace('（推测）', '') + ' 对 ' + x.ok + '/' + x.n).join(' · ') : '还没有数据：旧版固定生效后，每一轮都会把按格式推测的结果和真实型号对一下';
    return h('div', { class: 'dk-set' }, h('span', {}, h('b', {}, '格式推测核对'), h('small', {}, txt)), h('button', { class: 'btn ghost sm', onclick: () => this.accTable() }, '查看'));
  },
  accTable() {
    const L = FmtAcc.load(), st = Object.entries(FmtAcc.stats()).sort((a, b) => b[1].n - a[1].n), VN = v => (Brand.NAME[v] || v || '未知');
    const body = h('div', { class: 'caltab' });
    body.append(h('p', { class: 'note' }, '同一轮既有「按回复格式推测」、又拿到真实型号时自动记录。推测只是拿不到运行令牌时的兜底；有真实型号时以真实型号为准。'));
    for (const [f, x] of st) body.append(h('div', { class: 'mc-row' }, h('span', {}, (Fmt.NAME[f] || f) + ' 对 ' + x.ok + ' / ' + x.n + '（' + Math.round(x.ok / x.n * 100) + '%）'), h('b', {}, '实际：' + Object.entries(x.real).sort((a, b) => b[1] - a[1]).map(([v, n]) => VN(v) + ' ' + n).join('、'))));
    if (!L.length) body.append(h('p', { class: 'note' }, '还没有数据。'));
    const bad = L.filter(r => !r.ok).slice(-30).reverse();
    if (bad.length) {
      body.append(h('div', { class: 'mc-gh' }, icon('info'), h('span', { class: 'grow' }, '推测错的（最近 ' + bad.length + ' 条）')));
      for (const r of bad) body.append(h('div', { class: 'mc-row', title: r.why + '\n编号：' + r.ids + (r.tool ? '\n工具：' + r.tool : '') + '\n思考字数：' + r.rc }, h('span', {}, fmtClock2(r.at) + ' ' + (Fmt.NAME[r.fam] || r.fam) + (r.sure ? '' : '（不确定）')), h('b', {}, '实际 ' + r.real)));
    }
    const back = modal('格式推测核对', body, K(
      h('button', { class: 'btn ghost', onclick: async () => { if (await Dialog.confirm({ title: '清空记录', text: '清空格式推测核对记录？' })) { FmtAcc.clear(); back.remove(); } } }, '清空'),
      h('button', { class: 'btn ghost', onclick: () => copyText(JSON.stringify(L.slice(-300))) }, '复制数据'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => back.remove() }, '关闭')));
  },
  // 旧版固定：开关 + 实际生效状态 + 部署编号
  pinRow() {
    const st = Pin.status();
    if (Prefs.pinOn !== false && now() - Math.max(Pin.at || 0, Pin.checkedAt || 0) > 300000 && !this.pinChk) { this.pinChk = true; Pin.check().finally(() => { this.pinChk = false; }); }
    const inp = h('input', { class: 'dk-pin-id', value: Pin.dpl(), spellcheck: 'false', title: '部署编号（dpl_…）：留空恢复默认', onchange: e => { const v = e.target.value.trim(); if (v && !/^dpl_[A-Za-z0-9]{16,48}$/.test(v)) { toast('部署编号格式不对（dpl_ 开头）', 'err'); e.target.value = Pin.dpl(); return; } Pin.set({ pinDpl: v || '' }); } });
    return h('div', { class: 'dk-set dk-pin' },
      h('label', { class: 'dk-pin-top' }, h('input', { type: 'checkbox', checked: Prefs.pinOn !== false ? true : null, onchange: e => Pin.set({ pinOn: e.target.checked }) }),
        h('span', {}, h('b', {}, '旧版固定'), h('small', { class: 'dk-pin-st', 'data-st': st.st }, st.text))),
      h('div', { class: 'dk-pin-row' }, h('small', { class: 'dim' }, '部署编号'), inp, h('button', { class: 'btn ghost sm', onclick: () => Pin.set({ pinDpl: '' }).then(() => this.render()) }, '默认')),
      h('small', { class: 'dim dk-pin-note' }, '新对话由旧部署创建，实时通道照常下发运行令牌，型号能准确识别（不用再按回复格式推测）。只是一个公开的部署编号 cookie，和账号无关；Brana 删掉旧部署后自动失效。'));
  },
  /* 设置：分组 + 右侧药丸开关；说明收进 ⓘ（悬停 / 点击显示），页面尽量短 */
  stUi() {
    const sw = (k, def = true, after) => h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: (Prefs[k] ?? def) ? true : null, onchange: e => { Prefs[k] = e.target.checked; savePrefs(); after?.(e.target.checked); } });
    const row = (label, tip, ctrl, opt = {}) => h(opt.div ? 'div' : 'label', { class: 'st-row' + (opt.cls ? ' ' + opt.cls : '') }, h('span', { class: 'st-l' }, h('b', {}, label), tip ? tipI(tip) : null, opt.sub ? h('small', { class: 'st-sub' }, opt.sub) : null), ...[].concat(ctrl).filter(Boolean));
    const grp = (title, ...rows) => h('section', { class: 'mc-card st-grp' }, h('div', { class: 'st-gh' }, title), ...rows.flat().filter(Boolean));
    const btn = (t, fn, title) => h('button', { type: 'button', class: 'btn ghost sm', title: title || null, onclick: fn }, t);
    /* 其他模块自带的设置行（span>b+small + 按钮）：把小字说明换成 ⓘ，套同一种行样式 */
    const adopt = el => { el.className = 'st-row'; const sp = el.querySelector(':scope>span'); if (sp) { sp.className = 'st-l'; const sm = sp.querySelector(':scope>small'); if (sm) sm.replaceWith(tipI(sm.textContent)); } return el; };
    return { sw, row, grp, btn, adopt };
  },
  settings(box) {
    const { sw, row, grp, btn, adopt } = this.stUi();
    const st = Pin.status(); if (Prefs.pinOn !== false && now() - Math.max(Pin.at || 0, Pin.checkedAt || 0) > 300000 && !this.pinChk) { this.pinChk = true; Pin.check().finally(() => { this.pinChk = false; }); }
    const pinOn = Prefs.pinOn !== false;
    const applyPinInput = rawVal => {
      const res = Pin.lockCostDpl(rawVal);
      if (!res.ok) { toast(res.error || '部署编号格式不对（dpl_ 开头）', 'err'); return false; }
      toast(res.locked ? '已手动锁定计费部署：' + res.dpl : '已恢复默认计费部署：' + res.dpl, 'ok');
      this.render();
      return true;
    };
    const pinId = h('input', { class: 'dk-pin-id', value: Pin.dpl(), spellcheck: 'false', placeholder: 'dpl_…', title: '部署编号（dpl_…）：支持粘贴含 dpl_ 的链接，留空恢复默认', onchange: e => { if (!applyPinInput(e.target.value)) e.target.value = Pin.dpl(); } });
    const costLockInput = h('input', { class: 'dk-pin-id', value: Pin.lockedDpl() || Pin.dpl(), spellcheck: 'false', placeholder: 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', title: '输入或粘贴 dpl_ 开头的部署编号（或含 dpl= 的链接）手动锁定 /cost 账单接口部署', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); if (!applyPinInput(e.target.value)) e.target.value = Pin.dpl(); } } });
    const acc = Object.entries(FmtAcc.stats()).sort((a, b) => b[1].n - a[1].n), accTxt = acc.length ? acc.slice(0, 2).map(([f, x]) => (Fmt.NAME[f] || f).replace('（推测）', '') + ' ' + x.ok + '/' + x.n).join(' · ') : '';
    const sel = (opts, cur, fn) => h('select', { class: 'st-sel', onchange: e => fn(e.target.value) }, ...opts.map(([v, l]) => h('option', { value: v, selected: cur === v || null }, l)));
    const capBox = h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: Cap.show() || null, title: '输入框旁显示「抓记录」按钮', onchange: e => { Prefs.capBtn = e.target.checked; savePrefs(); Cap.paint(); } });
    box.append(
      grp('对话',
        row('自动保活', '出错 / 假结束 / 卡住时 3 秒后自动刷新对话（可取消）；刚发送、回答还没出现时不刷新。后台 / 最小化也工作。', sw('keepAlive', true)),
        row('思考自动停止', '闭源模型突然出现开源思考（路由到开源模型）时立即自动暂停对话；已知闭源思考不误触发。', sw('thinkStop', true)),
        row('路由弹窗倒计时暂停', '检测到模型路由（路由到其他模型或同型号强度削弱）时仅轻提示提醒、不暂停对话；仅闭源模型突然出现开源思考时立即自动暂停。', sw('routePausePrompt', true)),
        row('逐字显示', '回复按帧匀速逐字出现（像官网那样），最多落后约 0.3 秒；关掉 = 收到多少立刻显示多少。只影响显示，不影响接收速度。', sw('smoothStream', true)),
        row('工作区面板', '对话右侧悬浮显示沙盒文件（Workspace）。', sw('wsOpen', true, () => UI.layout())),
        row('会话标签上限', '顶部标签栏最多保留最近交流的对话数量（默认 6 个，按最近对话时间排序，超出时自动关闭最旧标签）。',
          h('input', { type: 'number', min: 1, max: 20, value: Math.max(1, Math.min(20, +Prefs.maxTabs || 6)), style: { width: '58px', textAlign: 'center' }, onchange: e => { const v = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 6)); Prefs.maxTabs = v; e.target.value = v; savePrefs(); if (typeof Tabs !== 'undefined' && Tabs.enforceLimit) { Tabs.enforceLimit(Tabs.active); UI.renderTabs?.(); } } })),
        row('账号状态检测间隔', '每次打开客户端及每隔指定小时自动检测全部账号可用状态（默认 6 小时，0 表示仅启动时检测；异常卡片标红）。',
          h('input', { type: 'number', min: 0, max: 168, step: 0.5, value: Number.isFinite(Number(Prefs.acctCheckHours)) ? Number(Prefs.acctCheckHours) : 6, style: { width: '58px', textAlign: 'center' }, onchange: e => { const raw = parseFloat(e.target.value); const v = Number.isFinite(raw) ? Math.max(0, Math.min(168, raw)) : 6; Prefs.acctCheckHours = v; e.target.value = v; savePrefs(); Bus.emit('prefs'); if (typeof AccountPicker !== 'undefined' && AccountPicker.startCheckTimer) AccountPicker.startCheckTimer(false); } }))),
      grp('模型识别',
        row('自动识别模式', '每轮回复结束后自动识别当前对话型号（关闭后不自动触发识别，仅在手动刷新或切换时识别）。', h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: (typeof BillingProbe !== 'undefined' && typeof BillingProbe.isAutoEnabled === 'function' ? BillingProbe.isAutoEnabled() : Store.get('billing:auto', true) !== false) ? true : null, onchange: e => { const on = e.target.checked; if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.setAutoEnabled === 'function') BillingProbe.setAutoEnabled(on); else Store.set('billing:auto', on); const curSid = this.sid(); const ch = curSid ? Chats.get(curSid) : null; if (on && ch && typeof BillingProbe !== 'undefined' && BillingProbe.automatic) BillingProbe.automatic(ch); if (curSid) Bus.emit('billing', curSid); this.render(); } })),
        row('计费接口反推（/cost）', '开启时对闭源模型请求 /api/chat/:id/cost 进行精确账单反推（开源模型自动跳过不请求，防 429 限流）；关闭后完全不请求计费接口，100% 使用本地「对话习惯 + 推理分 + 习惯库」识别，可随时开关对比准确性。', sw('costProbe', true, on => { if (typeof BillingProbe !== 'undefined' && BillingProbe.setCostProbeEnabled) BillingProbe.setCostProbeEnabled(on); const curSid = this.sid(); const ch = curSid ? Chats.get(curSid) : null; if (ch) { if (on && BillingProbe.automatic) BillingProbe.automatic(ch); else if (typeof ChatHabitFingerprint !== 'undefined') ChatHabitFingerprint.identifyAndApply(ch, { force: true }); } this.render(); })),
        row('计费接口部署锁定（/cost）', '手动输入并锁定 /cost 账单接口的 Vercel 部署编号（dpl_…，支持直接粘贴完整链接）。锁定后优先级最高，不会被自动轮换覆盖。\n当前生效：' + Pin.dpl() + (Pin.lockedDpl() ? '（已手动锁定）' : '（默认在线部署）'), h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, costLockInput, btn('锁定部署', () => { if (!applyPinInput(costLockInput.value)) costLockInput.value = Pin.dpl(); }), btn('默认', () => applyPinInput(''))), { div: true }),
        row('习惯库（诊断 JSON 导入与自学习）', '通过对话记录与工具调用习惯零风控识别模型；支持将确定知道是什么模型的诊断 JSON（billing-*.json）导入到习惯库中帮助习惯识别，或在右上角点「纠偏」沉淀学习，越用越准。', btn('管理 / 导入 (' + (typeof ChatHabitFingerprint !== 'undefined' ? ChatHabitFingerprint.learnedCount() : 0) + ')', () => typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.openManager?.()), { div: true }),
        row('自动读取运行记录', '每轮结束后读取 Trace（型号 / token / 花费 / 改派 / BotService），保存在本机。', sw('traceAuto', true)),
        row('实时监控换模型', '这一轮进行中每 6 秒读一次当前对话的 Trace（只读当前打开的对话）。', sw('traceLive', true)),
        row('旧版固定', '新对话由旧部署创建，实时通道照常下发运行令牌，型号能准确识别。只是一个公开的部署编号 cookie，和账号无关；Brana 删掉旧部署后自动失效。\n当前：' + st.text, h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: pinOn || null, onchange: e => Pin.set({ pinOn: e.target.checked }).then(() => this.render()) }), { cls: 'st-pin', sub: pinOn ? null : '已关闭' }),
        pinOn ? h('div', { class: 'st-row st-indent' }, h('span', { class: 'st-l' }, h('small', { class: 'dim' }, '部署编号')), pinId, btn('锁定', () => { if (!applyPinInput(pinId.value)) pinId.value = Pin.dpl(); }), btn('默认', () => applyPinInput(''))) : null,
        row('格式推测核对', '同一轮既有「按回复格式推测」、又拿到真实型号时自动记录，看推测准不准。' + (accTxt ? '\n' + accTxt : ''), btn('查看', () => this.accTable()), { div: true })),
      grp('同步',
        row('加密同步会话名', '云端保存英文单词密文；同一口令恢复型号、匹配权重、推理分、平均耗时、时间和备注；未解锁不上传明文。', sw('autoTitle', true)),
        adopt(TitleSync.row('st-row'))),
      (() => {   // 抽卡：配置一次就很少改的选项（从抽卡面板挪过来）；张数 / 模式 / 优选 / 黑名单仍在抽卡面板
        const g = Gacha.settings(), gsw = (k, after) => h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: g[k] ? true : null, disabled: k === 'stopOnThinking' && g.fingerprint ? true : null, onchange: e => { Gacha.save({ [k]: e.target.checked }); after?.(e.target.checked); } });
        const vfOn = !!Prefs.vf && Prefs.vf === (g.vendor || ''), vfOk = !!g.vendor && g.vendor !== 'custom';
        const el = grp('抽卡',
          row('回复中途 Thinking 就停止', '只影响抽卡发出的那一轮：回复中途出现思考链就停止生成。普通对话不受影响。测指纹模式下不适用。', gsw('stopOnThinking')),
          row('老虎机', '抽卡时在屏幕中央显示 厂商 → 型号 → 档位 三个转轮，识别出结果后依次停下揭晓。', gsw('slot', on => { if (on) try { GSlot.reopen(); } catch {} })),
          row('目标厂商置顶', '侧栏里目标厂商的对话排在最前（同模型按推理分降序）。', gsw('sortSidebar', () => UI.renderList())),
          row('侧栏只显示目标厂商', vfOk ? '侧栏只列出当前目标厂商（' + (g.targetName || g.vendor) + '）的对话。' : '先在抽卡面板里选一个目标厂商。', h('input', { type: 'checkbox', class: 'sw', role: 'switch', checked: vfOn || null, disabled: vfOk ? null : true, onchange: e => { Prefs.vf = e.target.checked ? g.vendor : ''; savePrefs(); UI.renderList(); } })));
        el.classList.add('st-gacha'); return el;
      })(),
      grp('外观',
        row('主题', '', sel([['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']], Prefs.theme || 'auto', v => { Prefs.theme = v; savePrefs(); UI.applyTheme(); })),
        row('消耗单位', '概览里大数字的单位。', sel([['token', 'Token'], ['usd', '美金']], this.unit(), v => { Prefs.spendUnit = v; savePrefs(); })),
        row('侧栏卡片放大', '鼠标靠近时卡片向右探出（与油猴脚本一致）。', sw('cardMag', true)),
        row('金色', Gold.manual ? '手动点亮：已点亮 ' + (Prefs.goldSet || []).length + ' 个型号（金色 + 侧栏置顶）' : '自动：最高版本里最强的一档；可改为手动打勾点亮。', btn('设置', () => GoldBoard.open()), { div: true })),
      grp('网络与诊断',
        row('ProxyIP 列表', '按地区的出口 IP · 纯净度自动过滤 · 429 按服务器要求等待。', btn('打开', () => ProxySet.open()), { div: true }),
        row('人机验证语言', '只改人机验证弹窗（reCAPTCHA 勾选框 / 图片题）的文字语言。\n不改浏览器语言、时区、Accept-Language，也不影响后台静默验证（v3）；指纹和环境不变。\n「跟随系统」= 和以前一样（推荐，语言与环境保持一致）。', sel(Recaptcha.LANGS, Prefs.rcLang || '', v => { Prefs.rcLang = v; savePrefs(); })),
        row('智能兜底模式', '连接超时或遇到 429 限流时自动切换同地区可用 IP（429 IP 自动进入冷却期，冷却前不再切回）；当本地区 IP 全部不可用时自动跨地区层层筛选最佳可用 IP。',
          h('input', { type: 'checkbox', class: 'sw', role: 'switch', 'aria-label': '旧版自动模式', checked: typeof Pool !== 'undefined' && Pool.d?.auto !== false ? true : null, onchange: e => { const on = e.target.checked; void Pool.load().then(() => Pool.mutate(d => { d.auto = on; })); } })),
        row('抓记录按钮', '输入框旁的「抓记录」：一键保存当前对话的完整记录（服务器全部消息、实时流回放、本地对比），用来排查丢消息。「录制」是旧的发送前开启、回复结束自动保存的模式。', capBox),
        h('div', { class: 'st-row st-indent' }, h('span', { class: 'st-l' }), btn('抓记录', () => Cap.dump()), btn(Cap.on ? '停止录制' : '录制', () => { Cap.ask(); setTimeout(() => this.render(), 300); }))));
  },
  about(box) {
    const { row, grp, btn } = this.stUi();
    const upd = h('small', { class: 'st-sub' });
    const paint = () => { upd.textContent = !Update.can() ? '这个版本不支持在线更新' : !Update.url() ? '未设置更新服务器' : Update.newer() ? '有新版本 v' + Update.info.version : Update.err ? '检查失败：' + Update.err : Update.isBeta(VERSION) ? '测试版' + (Prefs.updChannel === 'stable' ? ' · 已切到正式版通道' : '') : Update.info ? '已是最新' : ''; };
    paint(); const off = Bus.on('update', () => { if (!upd.isConnected) { off?.(); return; } paint(); this.soon(); });
    box.append(h('section', { class: 'mc-card st-about' }, h('div', { class: 'st-brand' }, (() => { const l = h('span', { class: 'st-logo' }); l.innerHTML = BRANA_LOGO; return l; })(), h('span', { class: 'grow' }), h('b', { class: 'st-ver' }, 'v' + VERSION)),
      // 作者 + 小二维码（透明底，模块颜色 = 当前文字色，跟着深色 / 浅色变化；扫出来是「恭喜发财。」）
      h('div', { class: 'st-author' }, h('span', { class: 'st-au-t' }, '作者：', h('b', {}, '勤'), h('span', { class: 'dim' }, '（755287249）')), h('span', { class: 'grow' }), (() => { const q = h('span', { class: 'st-qr', title: '扫一扫', 'aria-label': '二维码' }); q.innerHTML = '<svg viewBox="-2 -2 29 29" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M0 0h7v1h-7zM8 0h1v1h-1zM15 0h2v1h-2zM18 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM9 1h2v1h-2zM12 1h3v1h-3zM16 1h1v1h-1zM18 1h1v1h-1zM24 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM14 2h3v1h-3zM18 2h1v1h-1zM20 2h3v1h-3zM24 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM10 3h1v1h-1zM14 3h1v1h-1zM18 3h1v1h-1zM20 3h3v1h-3zM24 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM9 4h2v1h-2zM13 4h3v1h-3zM18 4h1v1h-1zM20 4h3v1h-3zM24 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h2v1h-2zM15 5h1v1h-1zM18 5h1v1h-1zM24 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h7v1h-7zM9 7h1v1h-1zM14 7h3v1h-3zM0 8h1v1h-1zM2 8h1v1h-1zM6 8h2v1h-2zM9 8h1v1h-1zM12 8h3v1h-3zM16 8h1v1h-1zM19 8h1v1h-1zM22 8h1v1h-1zM24 8h1v1h-1zM3 9h2v1h-2zM7 9h1v1h-1zM9 9h3v1h-3zM13 9h2v1h-2zM18 9h5v1h-5zM24 9h1v1h-1zM2 10h2v1h-2zM5 10h2v1h-2zM11 10h1v1h-1zM15 10h3v1h-3zM20 10h1v1h-1zM22 10h2v1h-2zM0 11h2v1h-2zM3 11h2v1h-2zM8 11h1v1h-1zM10 11h1v1h-1zM12 11h2v1h-2zM15 11h1v1h-1zM21 11h3v1h-3zM0 12h2v1h-2zM3 12h4v1h-4zM8 12h3v1h-3zM12 12h2v1h-2zM15 12h3v1h-3zM20 12h2v1h-2zM23 12h2v1h-2zM2 13h3v1h-3zM7 13h1v1h-1zM10 13h1v1h-1zM12 13h1v1h-1zM17 13h2v1h-2zM20 13h2v1h-2zM0 14h2v1h-2zM3 14h1v1h-1zM5 14h4v1h-4zM10 14h1v1h-1zM12 14h3v1h-3zM16 14h1v1h-1zM18 14h1v1h-1zM22 14h2v1h-2zM3 15h2v1h-2zM7 15h1v1h-1zM11 15h2v1h-2zM14 15h1v1h-1zM19 15h2v1h-2zM22 15h1v1h-1zM24 15h1v1h-1zM0 16h3v1h-3zM4 16h3v1h-3zM9 16h1v1h-1zM13 16h8v1h-8zM22 16h1v1h-1zM24 16h1v1h-1zM8 17h3v1h-3zM13 17h2v1h-2zM16 17h1v1h-1zM20 17h2v1h-2zM24 17h1v1h-1zM0 18h7v1h-7zM8 18h4v1h-4zM15 18h2v1h-2zM18 18h1v1h-1zM20 18h2v1h-2zM0 19h1v1h-1zM6 19h1v1h-1zM13 19h1v1h-1zM16 19h1v1h-1zM20 19h1v1h-1zM22 19h3v1h-3zM0 20h1v1h-1zM2 20h3v1h-3zM6 20h1v1h-1zM10 20h4v1h-4zM16 20h5v1h-5zM22 20h1v1h-1zM0 21h1v1h-1zM2 21h3v1h-3zM6 21h1v1h-1zM9 21h2v1h-2zM12 21h1v1h-1zM15 21h2v1h-2zM18 21h1v1h-1zM21 21h2v1h-2zM0 22h1v1h-1zM2 22h3v1h-3zM6 22h1v1h-1zM8 22h3v1h-3zM12 22h6v1h-6zM19 22h1v1h-1zM21 22h4v1h-4zM0 23h1v1h-1zM6 23h1v1h-1zM10 23h3v1h-3zM14 23h1v1h-1zM16 23h1v1h-1zM19 23h1v1h-1zM21 23h2v1h-2zM0 24h7v1h-7zM8 24h1v1h-1zM10 24h1v1h-1zM13 24h2v1h-2zM17 24h1v1h-1zM20 24h2v1h-2zM24 24h1v1h-1z"/></svg>'; return q; })()),
      h('p', { class: 'note' }, '模型信息来自 Brana 自己的运行记录（Trace）；所有请求直接发往 arena.ai / api.trigger.dev。', tipI('每次模型调用的型号、token、花费，Brana 的用量 / 花费记录，以及服务端改派（model.resample）事件。运行令牌随实时通道下发，1 小时内有效；过期后仍可查看本机保存的结果。界面与判断逻辑参照油猴脚本 Brana-Native-Suite。'))),
      grp('客户端更新',
        h('div', { class: 'st-row st-upd' }, h('span', { class: 'st-l' }, h('b', {}, '当前 v' + VERSION), upd),
          Update.isBeta(VERSION) ? btn('正式版', () => Update.stable(), '切回正式版：有更新的正式版就直接更新；电脑也可以确认后装回较旧的正式版') : btn('测试版', () => Update.beta(), '输入测试版口令，下载安装测试版'),
          h('button', { type: 'button', class: 'btn sm ghost', onclick: () => Update.checkNow() }, '检查更新'),
          Update.newer() ? h('button', { type: 'button', class: 'btn sm', onclick: () => Update.prompt() }, '更新到 v' + Update.info.version) : null)));
  },
  exportJson(sid) {
    const d = { sid, title: History.byId(sid)?.title || '', exportedAt: new Date().toISOString(), turns: Trace.turns(sid) };
    const txt = JSON.stringify(d, null, 2);
    const fname = `model-info-${sid.slice(0, 8)}.json`;
    if (typeof FileExport !== 'undefined' && FileExport.text) void FileExport.text(txt, fname, 'application/json');
    else saveBlob(new Blob([txt], { type: 'application/json' }), fname);
  },
};
Bus.on('trace', sid => { if (!sid || sid === Dock.sid()) Dock.soon(); Bar.render(); });
Bus.on('tracelog', () => { if (Dock.tab === 'records') Dock.soon(); });
Bus.on('chat', c => {
  if (!c?.sid || c.sid !== Dock.sid() || Dock.tab !== 'overview') return;
  const identSig = String(!!c.identifying) + '|' + String(c.probeProgress || '') + '|' + String(c.probePct ?? '');
  if (Dock._lastIdentSig !== identSig) { Dock._lastIdentSig = identSig; Dock.soon(); return; }
  if (c.busy && !Dock.ct) Dock.ct = setTimeout(() => { Dock.ct = 0; Dock.render(); }, 900);
});
Bus.on('billing', sid => { if (!sid || sid === Dock.sid()) Dock.soon(); });
Bus.on('models', sid => { if (!sid || sid === Dock.sid()) Dock.soon(); });
Bus.on('model', c => { if (!c?.sid || c.sid === Dock.sid()) Dock.soon(); });
Bus.on('pin', () => { try { if (Dock.tab === 'settings') Dock.soon(); } catch {} });
Bus.on('fmtcal', () => Dock.soon());

// ---------- 工作区面板 ----------
const WS = {
  open: new Set(), sid: null, data: null, err: null, loading: false,
  // 手机上工作区是浮层，默认收起，开关不写进设置
  get shown() { return isMob() ? !!this.mOpen : Prefs.wsOpen !== false; },
  set(v) { if (isMob()) this.mOpen = v; else { Prefs.wsOpen = v; savePrefs(); } UI.layout(); },
  mount(el) { this.el = el; el.dataset.ks = ''; this.render(); },
  async load(sid, force) {
    const token = this.loadToken = (this.loadToken || 0) + 1;
    if (this.sid !== sid) { this.data = null; this.open.clear(); this.hl = null; this.q = ''; this.ix = null; if (this.qIn) this.qIn.value = ''; this.previewSeq = (this.previewSeq || 0) + 1; }
    this.sid = sid; this.err = null;
    if (!sid) { this.data = null; this.loading = false; this.render(); return; }
    this.loading = true; this.render();
    try { const data = await Workspace.latest(sid, force); if (this.sid === sid && this.loadToken === token) { this.data = data; this.err = null; } }
    catch (e) { if (this.sid === sid && this.loadToken === token) { this.err = describe(e); this.data = null; } }
    finally { if (this.sid === sid && this.loadToken === token) { this.loading = false; this.render(); } }
  },
  render() {
    const el = this.el; if (!el || !el.isConnected) return;
    const d = this.sid === UI.els?.chat?.sid ? this.data : null, m = d?.manifest, root = m?.root;
    const head = h('div', { class: 'ws-h' }, h('b', {}, 'Workspace'), h('span', { class: 'grow' }),
      h('button', { class: 'ib xs', title: '刷新', onclick: () => this.load(this.sid, true) }, this.loading ? h('i', { class: 'spin' }) : icon('refresh')),
      d?.node && root?.totalFiles ? h('button', { class: 'ib xs', title: '下载全部（zip）', onclick: () => this.zip() }, icon('dl')) : null,
      this.sid ? h('button', { class: 'ib xs', title: '重置/清空当前对话工作区（开启干净分支，保留当前模型）', onclick: () => this.resetBranch() }, icon('trash')) : null,
      h('button', { class: 'ib xs', title: '收起工作区', onclick: () => WS.set(false) }, icon('x')));
    const stats = h('div', { class: 'ws-s' }, h('span', {}, fmtBytes(root?.totalSize || 0) + '/128.0MB'), h('span', {}, (root?.totalFiles || 0) + '/10K files'));
    const tree = h('div', { class: 'ws-tree' });
    // 搜索框：同一个 input 跨重绘复用，重绘后恢复焦点和光标
    const qi = this.qIn ||= h('input', { class: 'ws-qin', type: 'search', placeholder: '搜索文件 / 路径', 'aria-label': '搜索工作区文件', spellcheck: false, autocomplete: 'off',
      oninput: e => { this.q = e.target.value; clearTimeout(this.qT); this.render(); },
      onkeydown: e => { if (e.key === 'Escape' && this.q) { e.preventDefault(); e.stopPropagation(); this.q = ''; e.target.value = ''; this.render(); } else if (e.key === 'Enter') { e.preventDefault(); this.$first?.click(); } } });
    if (qi.value !== (this.q || '')) qi.value = this.q || '';
    const hadFocus = qi.ownerDocument.activeElement === qi, sel = hadFocus ? [qi.selectionStart, qi.selectionEnd] : null;
    const qbar = root?.totalFiles ? h('div', { class: 'ws-q' + (this.q ? ' on' : '') }, icon('search'), qi, this.q ? h('button', { type: 'button', class: 'ib xs', title: '清除搜索', 'aria-label': '清除搜索', onclick: () => { this.q = ''; qi.value = ''; this.render(); qi.focus(); } }, icon('x')) : null) : null;
    this.$first = null;
    if (this.err) tree.append(h('p', { class: 'note' }, this.err));
    else if (!root || !root.totalFiles) tree.append(h('p', { class: 'note' }, this.loading ? '读取中…' : '这个对话里创建或上传的文件会保存在这里'));
    else if ((this.q || '').trim()) this.results(tree, root, d);
    else this.branch(tree, root, '', 0);
    el.dataset.ks = String(this.sid || ''); el.replaceChildren(h('div', { class: 'ws-card' }, head, stats, qbar, tree), Connectors.card());
    if (hadFocus && qbar) { qi.focus({ preventScroll: true }); try { qi.setSelectionRange(...sel); } catch {} }
  },
  // ---------- 搜索：按路径匹配（空格分隔多个词都要命中，不分大小写）；没展开过的文件夹按需补读 ----------
  walk(dir, path, out) {
    for (const [name, e] of Object.entries(dir.entries || {})) { const p = path ? path + '/' + name : name; out.push([p, name, e]); if (e.type === 'dir') this.walk(e, p, out); }
    return out;
  },
  results(box, root, d) {
    const terms = this.q.trim().toLowerCase().split(/\s+/).filter(Boolean), all = this.walk(root, '', []);
    const hit = all.filter(([p]) => { const l = p.toLowerCase(); return terms.every(t => l.includes(t)); })
      .sort((a, b) => (a[2].type === 'dir' ? 0 : 1) - (b[2].type === 'dir' ? 0 : 1) || terms.every(t => b[1].toLowerCase().includes(t)) - terms.every(t => a[1].toLowerCase().includes(t)) || a[0].length - b[0].length || a[0].localeCompare(b[0]));
    const ix = this.index(root, d), MAX = 200;
    if (ix.busy) box.append(h('p', { class: 'note ws-qst' }, h('i', { class: 'spin' }), ' 正在读取子文件夹 ' + ix.done + '/' + ix.total + '…'));
    else if (ix.err) box.append(h('p', { class: 'note ws-qst' }, ix.err));
    if (!hit.length) { if (!ix.busy) box.append(h('p', { class: 'note' }, '没有匹配「' + this.q.trim() + '」的文件')); return; }
    const mark = name => { const l = name.toLowerCase(); let parts = [name]; for (const t of terms) { const i = l.indexOf(t); if (i >= 0) { parts = [name.slice(0, i), h('mark', {}, name.slice(i, i + t.length)), name.slice(i + t.length)]; break; } } return parts; };
    const sid = this.sid, snapshot = this.data;
    for (const [p, name, e] of hit.slice(0, MAX)) {
      const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '', isDir = e.type === 'dir', isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
      const b = h('button', { class: 'ws-row ws-hit' + (this.hl === p ? ' hl' : ''), title: p + (isDir ? '' : ' · ' + fmtBytes(e.size || 0)), onclick: () => {
        if (this.sid !== sid || this.data !== snapshot) return;
        if (isDir) { const segs = p.split('/'); for (let i = 1; i <= segs.length; i++) this.open.add(segs.slice(0, i).join('/')); this.q = ''; if (this.qIn) this.qIn.value = ''; this.render(); return; }   // 文件夹：在树里展开到这里
        this.hl = p; this.render(); this.preview(p, name, e);
      } }, icon(isDir ? 'folder' : isImg ? 'img' : 'file'), h('span', { class: 'ws-hn' }, h('span', {}, ...mark(name)), dir ? h('em', {}, dir) : null), h('small', {}, isDir ? (e.totalFiles != null ? String(e.totalFiles) : '') : fmtBytes(e.size || 0)));
      if (!this.$first) this.$first = b;
      box.append(b);
    }
    if (hit.length > MAX) box.append(h('p', { class: 'note' }, '还有 ' + (hit.length - MAX) + ' 个结果，再输入更多字缩小范围'));
  },
  // 补读还没展开过的子文件夹（只在搜索时；并发 3、最多 400 个；遇到错误 / 429 立即停，不重试）
  index(root, d) {
    const key = this.sid + '|' + (d?.node || ''), ix = (this.ix && this.ix.key === key && this.ix.root === root) ? this.ix : (this.ix = { key, root, done: 0, total: 0, busy: false, fin: false, err: '' });
    if (ix.busy || ix.fin || !d?.node) return ix;
    const pend = this.walk(root, '', []).filter(([, , e]) => e.type === 'dir' && !e.entries && e.totalFiles !== 0);
    if (!pend.length) { ix.fin = true; return ix; }
    ix.busy = true; ix.total = ix.done + pend.length;
    const sid = this.sid, node = d.node, LIMIT = 400;
    const live = () => this.sid === sid && this.data?.node === node && this.data?.manifest?.root === root && this.ix === ix;
    const paint = () => { if (!this.pT) this.pT = setTimeout(() => { this.pT = 0; if (live() && (this.q || '').trim()) this.render(); }, 250); };
    (async () => {
      let queue = pend.slice();
      const worker = async () => {
        while (queue.length && live() && !ix.err && (this.q || '').trim()) {
          if (ix.done >= LIMIT) { ix.err = '子文件夹太多，只搜索了前 ' + LIMIT + ' 个；可展开对应文件夹后再搜'; break; }
          const [p, , e] = queue.shift();
          try { const dd = await Workspace.dir(sid, node, p); if (!live()) return; if (dd) { Object.assign(e, dd); const more = this.walk(e, p, []).filter(([, , x]) => x.type === 'dir' && !x.entries && x.totalFiles !== 0); queue.push(...more); ix.total += more.length; } }
          catch (err) { ix.err = '读取子文件夹失败（' + describe(err) + '），已停止；结果可能不全'; }
          ix.done++; paint();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      ix.busy = false; if (!queue.length && !ix.err) ix.fin = true;
      if (typeof clearTimeout === 'function') clearTimeout(this.pT);
      this.pT = 0; if (live() && (this.q || '').trim()) this.render();
    })();
    return ix;
  },
  branch(box, dir, path, depth) {
    const ents = Object.entries(dir.entries || {}).sort((a, b) => (a[1].type === 'dir' ? 0 : 1) - (b[1].type === 'dir' ? 0 : 1) || a[0].localeCompare(b[0]));
    for (const [name, e] of ents) {
      const p = path ? path + '/' + name : name, sid = this.sid, snapshot = this.data;
      if (e.type === 'dir') {
        const open = this.open.has(p);
        box.append(h('button', { class: 'ws-row dir', style: { paddingLeft: 6 + depth * 12 + 'px' }, title: p, onclick: async () => { if (this.sid !== sid || this.data !== snapshot) return; if (open) this.open.delete(p); else { this.open.add(p); if (!e.entries && this.data?.node) { try { const dd = await Workspace.dir(sid, snapshot.node, p); if (dd) Object.assign(e, dd); } catch (err) { toast(describe(err), 'err'); } } } this.render(); } },
          icon(open ? 'chev' : 'chevr', 'ws-chev'), icon('folder'), h('span', {}, name), h('small', {}, e.totalFiles != null ? String(e.totalFiles) : '')));
        if (open && e.entries) this.branch(box, e, p, depth + 1);
      } else {
        const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
        box.append(h('button', { class: 'ws-row' + (this.hl === p ? ' hl' : ''), style: { paddingLeft: 20 + depth * 12 + 'px' }, title: p + ' · ' + fmtBytes(e.size || 0), onclick: () => { if (this.sid !== sid || this.data !== snapshot) return; this.hl = p; this.render(); this.preview(p, name, e); } }, icon(isImg ? 'img' : 'file'), h('span', {}, name), h('small', {}, fmtBytes(e.size || 0))));
      }
    }
  },
  async preview(path, name, e, context = null, suffix = '') {
    const sid = this.sid, data = this.data, token = this.previewSeq = (this.previewSeq || 0) + 1;
    let ctx; try { ctx = context || WorkspacePreview.context(sid, data); } catch (err) { toast(describe(err), 'err'); return; }
    const current = () => this.sid === sid && Dock.sid() === sid && this.data?.node === ctx.node && this.previewSeq === token;
    const mime = WorkspacePath.mime(path), isImg = /^image\//.test(mime) && mime !== 'image/svg+xml', browser = WorkspacePath.native(path), isMedia = /^(?:audio|video)\//.test(mime);
    let blob = null, txt = null, url = null;
    if ((WorkspacePath.text(path) || isImg || isMedia) && (+e.size <= WorkspacePath.MAX_BODY || e.inlineText != null)) {
      try { blob = await Workspace.fileBlob(e); if (WorkspacePath.text(path)) txt = (await blob.text()).slice(0,400000); if (isImg || isMedia) url = URL.createObjectURL(new Blob([blob], { type: mime })); }
      catch (err) { if (current()) toast('读取失败：' + describe(err), 'err'); }
    }
    if (!current()) { if (url) URL.revokeObjectURL(url); return; }
    // html / svg / md / 代码文件：直接用右侧内嵌预览窗格（原来的弹窗预览器 + 隔离窗口不再作为默认）
    if (txt != null && HtmlPreview.kindOf(path)) {
      let view = null;
      if (HtmlPreview.kindOf(path) === 'html' && !/\.svg$/i.test(path)) { try { view = await HtmlPreview.inlineAssets(txt, path, ctx); } catch {} if (!current()) return; }
      HtmlPreview.open({ sid, path, get: () => txt, view, wsid: sid, suffix });
      return;
    }
    // 图片（电脑）：跟 html / 代码一样进右侧预览窗格（有全屏按钮）；关窗格时释放 blob
    if (isImg && url && !isMob() && typeof HtmlPreview !== 'undefined' && document.getElementById('pv')) { const u = url; HtmlPreview.image({ sid, path: name, src: u, revoke: () => URL.revokeObjectURL(u) }); return; }
    document.querySelectorAll('.ws-preview:not(.anc-gh)').forEach(x => x.remove());
    // 一个窗口：图片 / 文本 / ≤16MB 音视频直接显示；右上角 复制 · 下载 · 全屏 · 关闭；只有显示不了才提供隔离窗口
    const launch = async () => { try { await WorkspacePreview.open(ctx, path, suffix); } catch (err) { toast(describe(err), 'err'); } };
    const download = async () => { try { toast('正在读取原文件…'); await FileExport.blob(blob || await Workspace.fileBlob(e), name, mime); } catch (err) { toast('下载失败：' + describe(err), 'err'); } };
    let back = null;
    const esc = ev => { if (ev.key !== 'Escape' || back?.nextElementSibling?.matches?.('.modal-back')) return; if (back?.classList.contains('full')) full(false); else close(); };   // 全屏时 Esc 先退出全屏
    const close = () => { back?.remove(); removeEventListener('keydown', esc); if (url) { URL.revokeObjectURL(url); url = null; } };
    const ib = (ic, title, fn, cls = '') => h('button', { type: 'button', class: 'wsp-ib ' + cls, title, 'aria-label': title, onclick: fn }, icon(ic));
    const fullBtn = ib('expand', '全屏', () => full(!back.classList.contains('full')));
    function full(on) { back.classList.toggle('full', on); if (!on) back.classList.remove('zoom'); fullBtn.replaceChildren(icon(on ? 'shrink' : 'expand')); fullBtn.title = on ? '退出全屏' : '全屏'; }
    // 图片：手机点开用看大图（双指缩放 / 拖动）；电脑先全屏，全屏后再点 = 原始大小 ↔ 适应窗口
    const imgClick = () => { if (isMob()) { attZoom(url, name, null); return; } if (!back.classList.contains('full')) full(true); else back.classList.toggle('zoom'); };
    const media = url && isMedia ? h(mime.startsWith('video/') ? 'video' : 'audio', { class: 'wsp-media', src: url, controls: true, playsinline: true }) : null;
    const cannot = (mime === 'application/pdf' ? 'PDF 不能内嵌预览' : isMedia ? '文件超过 16MB，不能内嵌播放' : '这种文件不能内嵌预览') + '，可下载原文件' + (browser ? '或用隔离窗口打开' : '');
    const body = h('div', { class: 'wsp-body' + (isImg && url ? ' img' : media ? ' media' : txt != null ? ' txt' : ' none') },
      isImg && url ? h('img', { class: 'wsp-img', src: url, alt: name, title: '点击切换全屏', onclick: () => imgClick() })
        : media ? media
        : txt != null ? h('pre', { class: 'wsp-pre' }, txt)
        : h('div', { class: 'wsp-empty' }, icon('file'), h('b', {}, name), h('span', {}, cannot),
            h('div', { class: 'wsp-act' }, browser ? h('button', { class: 'btn ghost', onclick: launch }, '隔离窗口打开') : null, h('button', { class: 'btn', onclick: download }, '下载原文件'))));
    if (txt?.length === 400000) body.prepend(h('p', { class: 'note' }, '源码仅显示前 40 万字符，下载不截断。'));
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const head = h('div', { class: 'wsp-h' },
      h('div', { class: 'wsp-t' }, h('b', { title: path }, name), h('small', {}, [dir, fmtBytes(e.size || blob?.size || 0)].filter(Boolean).join(' · '))),
      txt != null ? ib('copy', '复制源码', () => copyText(txt)) : null,
      ib('link', '复制路径', () => copyText('/home/user/' + path)),
      ib('download', '下载', download),
      media && browser ? ib('ext', '在隔离窗口打开（外网已禁用）', launch) : null,
      fullBtn, ib('x', '关闭', close, 'wsp-x'));
    back = h('div', { class: 'modal-back ws-preview wsp', onclick: ev => { if (ev.target === back) close(); } }, h('div', { class: 'modal wsp-m', role: 'dialog', 'aria-label': name }, head, body));
    document.body.append(back); addEventListener('keydown', esc);
    // 被别处移除（安卓返回键、打开另一个预览）也要收尾：释放 blob 地址、去掉键盘监听
    const observer = new MutationObserver(() => { if (!back.isConnected) { removeEventListener('keydown', esc); if (url) { URL.revokeObjectURL(url); url = null; } observer.disconnect(); } }); observer.observe(document.body, { childList: true });
    // 手机：标题栏往下拖关闭（顶部那条小横杠不再只是装饰）
    if (isMob()) { let y0 = null, dy = 0; const m = back.firstChild;
      head.addEventListener('touchstart', ev => { if (back.classList.contains('full') || ev.touches.length !== 1 || ev.target.closest('button')) { y0 = null; return; } y0 = ev.touches[0].clientY; dy = 0; m.style.transition = 'none'; }, { passive: true });
      head.addEventListener('touchmove', ev => { if (y0 == null) return; dy = Math.max(0, ev.touches[0].clientY - y0); m.style.transform = dy ? `translateY(${dy}px)` : ''; }, { passive: true });
      head.addEventListener('touchend', () => { if (y0 == null) return; y0 = null; m.style.transition = 'transform .2s'; if (dy > 90) { m.style.transform = 'translateY(100%)'; setTimeout(close, 180); } else m.style.transform = ''; }, { passive: true }); }
  },
  async zip() {
    const sid = this.sid, node = this.data?.node; if (!sid || !node) return;
    try { toast('正在打包下载…'); const res = await rawFetch(Workspace.downloadUrl(sid, node), { credentials: 'same-origin' }); if (!res.ok) throw new HttpError(res.status, ''); await FileExport.blob(await res.blob(), `workspace-${sid.slice(0, 8)}.zip`, 'application/zip'); }
    catch (e) { toast('下载失败：' + describe(e), 'err'); }
  },
  async resetBranch() {
    const sid = this.sid, chat = sid && typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (!chat) return;
    if (chat.busy) { toast('当前对话正在运行中，请先停止后再重置工作区', 'err'); return; }
    if (!await Dialog.confirm({
      title: '重置当前对话工作区并清理异常轮次',
      text: '将立即清理末尾卡死/开源思考已停止的异常轮次，恢复闭源模型标识，并回退到正常闭源节点开启干净工作区分支（若再次点击则回退至第 1 轮清空全部工作区文件，同时完整保留已锁定的闭源模型）。确定重置吗？',
      ok: '立即清理并重置'
    })) return;
    if (typeof ensureHealthyHistoryLoaded === 'function') await ensureHealthyHistoryLoaded(chat).catch(() => {});
    const pruned = typeof healChatModelAndBranch === 'function' ? healChatModelAndBranch(chat, { pruneTail: true }) : null;
    if (!pruned?.prunedCount && Array.isArray(chat.messages) && chat.messages.length > 2) {
      const firstU = typeof findFirstHealthyUser === 'function' ? findFirstHealthyUser(chat.messages) : null;
      if (firstU) {
        const uIdx = chat.messages.indexOf(firstU);
        let cutIdx = uIdx;
        for (let j = uIdx + 1; j < chat.messages.length; j++) {
          const m = chat.messages[j];
          if (!m) continue;
          if (m.role === 'user') break;
          if (m.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(m))) cutIdx = j;
        }
        const removed = chat.messages.slice(cutIdx + 1);
        const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
        for (const m of removed) if (m?.id) prunedSet.add(m.id);
        chat.messages.splice(cutIdx + 1);
        if (typeof healChatModelAndBranch === 'function') healChatModelAndBranch(chat, { pruneTail: false });
      }
    }
    const targetU = typeof findHealthyLastUser === 'function' ? findHealthyLastUser(chat.messages) : null;
    chat._forceResetWorkspaceBranch = true;
    chat._resetBranchTargetUserId = targetU ? (targetU.metadata?.nodeId || targetU.id || null) : null;
    chat._rejectedHealthyNodeIds?.clear?.();
    chat.error = null;
    chat.errText = '';
    if (pruned?.origText) {
      try {
        const inp = document.querySelector('#in');
        if (inp && !String(inp.value || '').trim()) {
          inp.value = pruned.origText;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch {}
    }
    this.data = null;
    try { Workspace.cache.delete(sid); } catch {}
    this.render();
    chat.emit?.();
    try { UI.render?.(); } catch {}
    toast(pruned?.prunedCount
      ? `已清理末尾 ${pruned.prunedCount} 条异常/开源思考消息并恢复闭源模型，可直接发送`
      : '已回退至初始闭源节点并清空工作区分支（保留闭源模型）');
  },
};
Bus.on('workspace', sid => { if (sid === WS.sid) { WS.data = Workspace.cache.get(sid); WS.render(); } });

// ---------- 底部额度栏（美金 剩余/总额 · % / 本对话 / 本轮 / 模型 / 更新）----------
const Bar = {
  mount(el) { this.el = el; el.dataset.ks = ''; this.render(); },
  refreshBtn(sid) { const p = Pulse.v; return h('span', { class: 'bi brefresh' }, h('button', { class: 'ib xs' + (this.refreshing ? ' spinning' : ''), title: '刷新 Pulse / 模型信息 / 列表（Pulse 最短间隔 5 分钟）' + (p?.at ? '\n额度更新于 ' + fmtClock2(p.at) : ''), 'aria-label': '刷新额度和模型信息', disabled: this.refreshing || null, onclick: () => this.refresh(sid) }, icon('refresh'))); },
  // 余额（Pulse + 推断总额度）：底栏额度和左下角账号卡片共用
  money() {
    const p = Pulse.v, rawBud = typeof Budget !== 'undefined' ? Budget.est() : null;
    const bud = typeof Budget !== 'undefined' && Budget.smartEst ? Budget.smartEst(rawBud, UI.host?.account) : rawBud;
    const bt = typeof Budget !== 'undefined' ? Budget.text(bud) : null;
    const rem = bud?.remaining ?? null, all = bud?.total ?? null;
    const pct = rem != null && all ? Math.max(0, Math.min(100, Math.round(rem / all * 100))) : p && Number.isFinite(p.pulse) ? p.pulse : null;
    return { rem, all, pct, bt, p, bud };
  },
  // 左下角账号卡片：头像 = 余额百分比饼图；第二行 = 账号备注；第三行 = 余额（右下角已有当前出口 IP，这里不再重复）
  paintCard() {
    const card = document.getElementById('acct'); if (!card || !card.closest('.sb-foot')) return;
    const av = card.querySelector('.av'), sub = card.querySelector('.acct-s'); if (!av || !sub) return;
    const { rem, all, pct, bt, p } = this.money(), a = UI.host?.account || {}, usd = v => '$' + (v >= 100 ? Math.round(v) : v.toFixed(2));
    const col = pct == null ? 'var(--fg3)' : pct < 10 ? 'var(--bad,#e5484d)' : pct < 30 ? 'var(--warn,#e0a526)' : 'var(--ok,#2fb36b)';
    const key = [pct, col].join('|');
    if (av.dataset.pie !== key) {
      av.dataset.pie = key; av.classList.add('av-pie'); av.style.background = '';
      const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), mk = (t, at) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); s.append(e); return e; };
      s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('class', 'pie');
      mk('circle', { cx: 16, cy: 16, r: 15, fill: 'color-mix(in srgb, currentColor 14%, transparent)' });
      const f = pct == null ? 0 : pct / 100;
      if (f >= 0.999) mk('circle', { cx: 16, cy: 16, r: 15, fill: col });
      else if (f > 0) { const ang = f * 2 * Math.PI, x = 16 + 15 * Math.sin(ang), y = 16 - 15 * Math.cos(ang); mk('path', { d: `M16 16 L16 1 A15 15 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`, fill: col }); }
      mk('circle', { cx: 16, cy: 16, r: 15, fill: 'none', stroke: 'color-mix(in srgb, currentColor 22%, transparent)', 'stroke-width': 1 });
      av.replaceChildren(s);
    }
    av.title = '余额 ' + (pct != null ? pct + '%' : '未知') + (rem != null ? ' · ≈' + usd(rem) + (all ? ' / ' + usd(all) : '') : '') + '\n点击查看余额明细';
    av.setAttribute('role', 'button'); av.setAttribute('aria-label', '余额明细（' + (pct != null ? pct + '%' : '未知') + '）');
    if (!av.dataset.bound) { av.dataset.bound = '1'; av.addEventListener('click', e => { e.stopPropagation(); this.donut(av); }); }
    const remark = String(a.remark || '').trim(), me = UI.me;
    const bal = rem != null ? '≈' + usd(rem) + (all ? ' / ' + usd(all) : '') + (pct != null ? ' · ' + pct + '%' : '') : pct != null ? '额度 ' + pct + '%' : '';
    const kids = [];
    if (!me && UI.host) kids.push(h('span', { class: 'acct-rm bad' }, '未登录'));
    if (remark) kids.push(h('span', { class: 'acct-rm', title: '备注：' + remark }, remark));
    if (bal) {
      const refBtn = h('button', {
        type: 'button',
        class: 'acct-refresh' + (this._refreshingBal ? ' spinning' : ''),
        title: '立即刷新余额与额度',
        'aria-label': '刷新余额',
        onclick: async e => {
          e.stopPropagation();
          if (this._refreshingBal) return;
          this._refreshingBal = true;
          this.paintCard();
          try { await Pulse.poll?.(true); } catch {}
          finally { this._refreshingBal = false; this.paintCard(); }
        }
      }, icon('refresh'));
      kids.push(h('span', { class: 'acct-bal-row' }, h('span', { class: 'acct-bal', title: bt?.why || '' }, bal), refBtn));
    }
    const nmEl = card.querySelector('.acct-n'); if (nmEl && (!nmEl.textContent || nmEl.textContent === '…') && (a.email || me?.email)) nmEl.textContent = (a.email || me?.email).split('@')[0];
    sub.replaceChildren(...kids); document.body.classList.add('acct-bal-on');
  },
  render() {
    this.paintCard();
    const el = this.el; if (!el) return;
    const u = null, p = Pulse.v, sid = Dock.sid(), tot = sid ? Trace.totals(sid) : null, lt = sid ? Trace.latest(sid) : null, mi = sid ? Models.get(sid) : null;
    const rawBud = typeof Budget !== 'undefined' ? Budget.est() : null, bud = typeof Budget !== 'undefined' && Budget.smartEst ? Budget.smartEst(rawBud, UI.host?.account) : rawBud, bt = typeof Budget !== 'undefined' ? Budget.text(bud) : null;   /* 按 Pulse 降幅 ÷ 估算花费推断的总额度 / 余额（≈） */
    const rem = u && Number.isFinite(+u.balanceRemainingUsd) ? +u.balanceRemainingUsd : bud?.remaining ?? null, all = u && Number.isFinite(+u.allowanceUsd) ? +u.allowanceUsd : bud?.total ?? null;
    const pct = rem != null && all ? Math.max(0, Math.min(100, Math.round(rem / all * 100))) : p && Number.isFinite(p.pulse) ? p.pulse : null;
    const bsState = typeof BotService !== 'undefined' && BotService.state ? BotService.state() : null;
    const botScore = lt?.botScore ?? bsState?.botScore ?? null;
    const botLv = typeof BotService !== 'undefined' && BotService.levelOf ? BotService.levelOf(botScore) : null;
    const it = (cls, title, ...kids) => h('span', { class: 'bi ' + cls, title }, ...kids);
    const kids = [...Bulk.barItems()];   // 一键归档 / 删除归档：最小化后的进度条
    kids.push(it('bmeter', '账号额度与官方 BotService 分数 · 点击展开 / 再点收起' + (botLv?.desc ? '\n' + botLv.desc : '') + (u == null && bt?.head ? '\n推断：' + bt.head + '\n' + bt.why : bt?.why ? '\n' + bt.why : ''), h('i', { class: 'meter' + (pct != null && pct < 10 ? ' low' : '') }, h('b', { style: { width: (pct ?? 0) + '%' } })),
      rem != null ? [h('span', { class: 'dim' }, u == null ? '≈美金' : '美金'), h('b', {}, (u == null ? '≈' : '') + '$' + (rem >= 100 ? Math.round(rem) : rem.toFixed(2))), all ? h('span', { class: 'dim' }, '/ $' + (all >= 100 ? Math.round(all) : all.toFixed(2))) : null, pct != null ? h('span', { class: 'dim' }, '· ' + pct + '%') : null, botScore != null ? h('span', { class: 'dim bot-score-tag', title: botLv?.desc || '' }, '· Bot ' + botScore) : null]
        : [h('span', { class: 'dim' }, '额度'), h('b', {}, pct != null ? pct + '%' : '—'), botScore != null ? h('span', { class: 'dim bot-score-tag', title: botLv?.desc || '' }, '· Bot ' + botScore) : null]));
    kids.push(this.refreshBtn(sid));   // 刷新紧跟在额度右边；更新时间在点开额度后的「余额明细」里
    const bpSum = sid && typeof BillingProbe !== 'undefined' ? BillingProbe.summary(sid) : null;
    { // 本轮花费与对话总消耗：优先采用新计费 /cost 账单（含 P50×2 原像实扣），进行中或账单未到达时按新计费 P50×2 实时估算
      const ch = sid ? Chats.get(sid) : null, bp = bpSum, bSid = sid && typeof Budget !== 'undefined' ? Budget.sid(sid) : null;
      const estNow = ch ? LiveEst.of(ch) : null, live = ch?.busy ? estNow : null, real = lt?.sum?.usd || 0, estU = lt?.sum?.usdEst || 0;
      const bpTurnExact = bp?.payment?.chargedUsd > 0 ? bp.payment.chargedUsd : null;
      const bpTurnEff = bp?.payment?.effectiveUsd > 0 ? bp.payment.effectiveUsd : null;
      const v = ch?.busy ? (live && live.usd > 0 ? live.usd : (bpTurnEff || real || estU)) : (bpTurnExact ?? bpTurnEff ?? (real || estNow?.usd || estU || 0));
      const approx = ch?.busy ? !live?.exactUsd : !(bpTurnExact != null || real > 0 || estNow?.exactUsd);
      const bpSessExact = bp?.sessionPayment?.chargedUsd > 0 ? bp.sessionPayment.chargedUsd : null;
      const bpSessEff = bp?.sessionPayment?.effectiveUsd > 0 ? bp.sessionPayment.effectiveUsd : null;
      const traceTot = tot && tot.turns && tot.usd ? tot.usd : 0;
      const all = bpSessExact ?? bpSessEff ?? (traceTot || bSid?.usd || (v > 0 ? v : 0));
      const allApprox = !(bpSessExact != null || traceTot > 0);
      const allTurns = bp?.sessionPayment?.turns || tot?.turns || bSid?.turns || (v > 0 ? 1 : 0);
      if (v || all) kids.push(it('bcost', (ch?.busy ? '本轮进行中：按新计费 P50×2 实时估算' : bpTurnEff ? '本轮：新计费账单 ' + (bpTurnExact ? '实扣 ' : 'P50×2 折算 ') + fmtUsd(v) : '本轮：最近一轮 ' + (lt?.calls.length || estNow?.steps || 1) + ' 次调用') + (real ? '\nTrace 实际 ' + fmtUsd(real) : '') + (all ? '\n总：本对话 ' + allTurns + ' 轮合计 ' + (allApprox ? '≈' : '') + fmtUsd(all) : ''),
        h('span', { class: 'dim' }, '对话消耗'), h('b', {}, v ? (approx ? '≈' : '') + fmtUsd(v) : '—'), h('span', { class: 'dim' }, '/'), h('b', {}, all ? (allApprox ? '≈' : '') + fmtUsd(all) : '—')));
    }
    const miNow = (sid && typeof Models !== 'undefined' ? Models.get(sid) : null) || mi;
    const bestNm = mi?.name || mi?.candidates?.[0]?.id || lt?.best || '';
    const bpTop = bpSum?.mergedCandidates?.[0] || bpSum?.top?.[0] || null;
    const hRow = sid && typeof History !== 'undefined' ? History.byId?.(sid) : null;
    const tvMod = sid && typeof Titles !== 'undefined' && typeof ConversationLabels !== 'undefined' ? ConversationLabels.parse(Titles.view(sid, hRow?.title || '', hRow?.localTitle)?.model || '')?.name : '';
    const rawLtBest = lt?.best && !/^(none|minimal|low|medium|high|xhigh|max)$/i.test(String(lt.best).trim()) ? lt.best : '';
    const hasReidMi = Boolean((!miNow?.guess || miNow?.userCorrected || miNow?.habitInferred || miNow?.reverseInferred || miNow?.billingProbe) && miNow?.name);
    const bestBase = (hasReidMi && miNow?.name) || miNow?.candidateName || miNow?.reverseLabel || bpTop?.canon || bpTop?.label || tvMod || (!/^(none|minimal|low|medium|high|xhigh|max)$/i.test(bestNm) ? bestNm : '') || rawLtBest || '';
    const baseHasTier = Boolean(bestBase && typeof Strength !== 'undefined' && Strength.parts && Strength.parts(bestBase).tier);
    const bestEffort = (hasReidMi && baseHasTier) ? '' : (lt?.calls?.at(-1)?.effort && lt.calls.at(-1).effort !== 'conflict' ? lt.calls.at(-1).effort : (/^(none|minimal|low|medium|high|xhigh|max)$/i.test(String(lt?.best || '').trim()) ? String(lt.best).trim().toLowerCase() : ''));
    const syncNm = bestBase ? (bestEffort && typeof Strength !== 'undefined' && Strength.withEffort ? Strength.withEffort(bestBase, bestEffort) : Strength.canon(bestBase)) : '';
    if (syncNm && !/^(none|minimal|low|medium|high|xhigh|max)$/i.test(syncNm)) {
      const nm = syncNm, vid = Brand.of(nm), disp = (typeof cardName === 'function' ? cardName(nm) : '') || nm;
      kids.push(it('bmodel', nm, h('span', { class: 'dim' }, '模型'), h('b', {}, (vid ? Brand.NAME[vid] + ' ' : '') + disp)));
    }
    const upd = Math.max(u?.at || 0, p?.at || 0);
    /* 刷新紧挨着额度 / 模型，更新时间放在刷新按钮右边 */
    kids.push(LeaderPop.btn());
    kids.push(h('button',{class:'bi link fp-library-btn habit-library-btn bico',title:'习惯库：将确定知道是什么模型的诊断 JSON（billing-*.json）导入到习惯库中帮助习惯识别 · 管理纠偏自学习样本','aria-label': '习惯库',onclick:()=>typeof ChatHabitFingerprint!=='undefined'&&ChatHabitFingerprint.openManager?ChatHabitFingerprint.openManager():FingerprintLibrary.open()},icon('fingerprint')));
    kids.push(h('button',{class:'bi link pel-library-btn bico',title:'鹈鹕测试库：全客户端共享鹈鹕测试图 · 导入合并 · 导出分享 · 多模型并排对比','aria-label':'鹈鹕测试库',onclick:()=>typeof PelicanShots!=='undefined'&&PelicanShots.table?.()},icon('pelican')));
    kids.push(h('span', { class: 'grow' }));
    const run = [...Chats.values()].filter(c => c.busy).length; if (run) kids.push(it('', '进行中的对话', h('i', { class: 'dot' }), '进行中 ' + run));
    if (Gacha.capOffer()) kids.push(Gacha.capCooling?.() ? h('button', { class: 'bi link bcap cool', title: '验证分数低，正在自动冷却后重试，不用操作；想马上继续也可以点一下手动验证', onclick: () => GPop.captcha() }, '验证冷却中 · 自动重试') : h('button', { class: 'bi link bcap', title: '抽卡遇到人机验证：点一下完成验证', onclick: () => GPop.captcha() }, '验 · 抽卡需要人机验证'));
    else { const r = Gacha.run; if (r && (Gacha.busy() || r.status === 'hit')) kids.push(h('button', { class: 'bi link', onclick: () => GPop.openAny() }, `抽卡 ${r.completed}/${r.settings?.endless ? '∞' : r.settings?.maxAttempts} · 命中 ${(r.hits || []).length}`)); }
    const a = UI.host?.account || {};
    // 出口图标：住宅 IP = 小房子，机房 IP = 小主机，其它 / 未知 = 地球；颜色 = 纯净度（绿 纯净 / 黄 一般 / 红 高风险 / 灰 未评估），旁边写纯净度百分比
    const ipRep = typeof IPRep !== 'undefined' && IPRep.cur ? IPRep.cur(a, IP.ip) : { label: '未评估', cls: 'r-none', kind: null, pct: null };
    const ipIco = ipRep.kind?.c === 'res' ? 'house' : ipRep.kind?.c === 'dc' ? 'server' : 'globe';
    const via = isDirectP(a.proxy) ? '直连' : a.proxyIp && typeof IPRep !== 'undefined' && IPRep.via ? IPRep.via(a.proxyIp) : a.region ? 'ProxyIP' : isVless(a.proxy) ? 'VLESS' : a.proxy ? '代理' : '7890';
    const ipIt = it('ipit', (IP.err || '') + '\n' + '模式 ' + ({auto:'自动',node:'节点（固定）',proxy:'代理',direct:'直连'}[RegionIP.modeOf(a)]) + ' · ' + (isDirectP(a.proxy) ? '直连' : '代理 ' + maskProxy(a.proxy)) + (a.region ? '\n地区 ' + regionLabel(a.region) : '') + (a.proxyIp ? '\n出口类型 ' + via : '') + (a.tunErr ? '\n' + a.tunErr : '') + '\n纯净度 ' + ipRep.label + (ipRep.pct != null ? ' ' + ipRep.pct + '%' : '') + (ipRep.kind ? ' · ' + ipRep.kind.t + ' IP' : '') + '\n点击切换模式（自动 / 节点 / 代理 / 直连）、查看当前地区 IP 列表 / 一键切换',
      icon(ipIco, 'ip-rep ' + ipRep.cls), ipRep.pct != null ? h('span', { class: 'ip-pct ' + ipRep.cls }, ipRep.pct + '%') : null,
      IP.ip ? IP.ip + (IP.loc ? ' · ' + ccF(IP.loc) : '') : IP.err ? 'IP 获取失败' : 'IP …', h('span', { id: 'ip-rtt', class: IP.rttCls() }, IP.rttText()), h('span', { class: 'dim ip-via' }, via));
    ipIt.dataset.nettip=ipIt.title;ipIt.removeAttribute('title');   // 原生提示换成悬停小面板（含网速），原来的文字放在面板底部
    ipIt.setAttribute('role','button');ipIt.tabIndex=0;ipIt.setAttribute('aria-haspopup','dialog');ipIt.setAttribute('aria-label','当前地区 IP 列表与一键切换');
    ipIt.onclick = () => RegionIP.open();ipIt.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();RegionIP.open();}}; kids.push(ipIt);
    kids.push(Update.newer() ? h('button', { class: 'bi link upd-badge bar-ver', title: '有新版本，点击更新', onclick: () => Update.prompt() }, icon('download'), '新版本 v' + Update.info.version) : h('button', { class: 'bi link ver bar-ver', title: '点击检查更新（' + (Update.isBeta(VERSION) ? '测试版通道' : '正式版通道') + '）', onclick: () => Update.checkNow() }, 'v' + VERSION));
    el.replaceChildren(...kids.flat().filter(Boolean));
    const m=el.querySelector('.bmeter');if(m){m.setAttribute('role','button');m.tabIndex=0;m.setAttribute('aria-label','余额明细');m.setAttribute('aria-controls','bdonut');m.setAttribute('aria-haspopup','dialog');m.setAttribute('aria-expanded',String(!!this.balance));m.onclick=()=>this.donut(m);m.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.donut(m,true);}};}
    if(this.balance){const anchor=this.balance.anchor;if(!anchor.isConnected&&anchor.classList.contains('bmeter')&&m)this.balance.anchor=m;if(this.balance.anchor.isConnected)this.paintDonut();else this.closeDonut();}
  },
  async refresh(sid) {
    if (this.refreshing) return; this.refreshing = true; this.render();
    const jobs = [['额度', Pulse.poll()], ['IP', IP.poll()], ['列表', History.refresh()]];
    if (typeof BotService !== 'undefined' && BotService.refreshPulse) jobs.push(['BotService', BotService.refreshPulse(true)]);
    if (sid) jobs.push(['模型信息', Trace.sync(sid).then(r => { if (r?.err && !r.turns) throw new Error(r.err); return r; })]);
    const res = await Promise.allSettled(jobs.map(j => Promise.resolve(j[1])));
    this.refreshing = false; this.render();
    const bad = res.map((r, i) => r.status === 'rejected' ? jobs[i][0] + '（' + describe(r.reason) + '）' : '').filter(Boolean);
    if (!bad.length) toast('已刷新：' + jobs.map(j => j[0]).join(' / '));
    else toast('部分未刷新：' + bad.join('；') + (bad.length < jobs.length ? '，其余已刷新' : ''), bad.length === jobs.length ? 'err' : '');
  },
  closeDonut(focus=false) {
    const state=this.balance;if(!state)return false;this.balance=null;
    state.cleanup();state.box.remove();const anchor=this.el?.querySelector('.bmeter');anchor?.setAttribute('aria-expanded','false');if(focus)anchor?.focus({preventScroll:true});return true;
  },
  donut(anchor,keyboard=false) {
    if(this.balance){this.closeDonut();return;}
    const box=h('div',{id:'bdonut',class:'bdonut',role:'dialog','aria-label':'余额明细',tabindex:-1,title:'点击卡片、关闭按钮或卡片外收起',onclick:()=>this.closeDonut(true)});
    const outside=e=>{const path=e.composedPath?.()||[];if(!box.contains(e.target)&&!path.includes(anchor)&&!e.target.closest?.('#bar .bmeter'))this.closeDonut();};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.closeDonut(true);}};
    const resize=()=>this.closeDonut(),visibility=()=>{if(document.hidden)this.closeDonut();};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',visibility);
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
    this.balance={box,anchor,cleanup:()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);}};
    anchor.setAttribute('aria-expanded','true');document.body.append(box);this.paintDonut();if(keyboard)box.querySelector('.bd-close')?.focus({preventScroll:true});
  },
  paintDonut() {
    const state=this.balance;if(!state)return;const {box,anchor}=state;if(!anchor.isConnected||!box.isConnected){this.closeDonut();return;}
    const u=null,p=Pulse.v,rem=u&&Number.isFinite(+u.balanceRemainingUsd)?+u.balanceRemainingUsd:null,all=u&&Number.isFinite(+u.allowanceUsd)&&+u.allowanceUsd>0?+u.allowanceUsd:null;
    const value=rem!==null&&all?rem/all*100:Number.isFinite(+p?.pulse)?+p.pulse:0,pct=Math.max(0,Math.min(100,value)),R=34,C=2*Math.PI*R;
    const d=h('div',{class:'bd-svg'});d.innerHTML=`<svg width="92" height="92" viewBox="0 0 92 92"><circle cx="46" cy="46" r="${R}" fill="none" stroke="var(--bd)" stroke-width="10"/><circle cx="46" cy="46" r="${R}" fill="none" stroke="${pct<10?'var(--bad)':'var(--amp-acc)'}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C*pct/100} ${C}" transform="rotate(-90 46 46)"/><text x="46" y="50" text-anchor="middle" font-size="15" font-weight="700" fill="var(--fg)">${Math.round(pct)}%</text></svg>`;
    const rawBud=typeof Budget!=='undefined'?Budget.est():null,bud=typeof Budget!=='undefined'&&Budget.smartEst?Budget.smartEst(rawBud,UI.host?.account):rawBud,bt=typeof Budget!=='undefined'?Budget.text(bud):null;
    const bsState=typeof BotService!=='undefined'&&BotService.state?BotService.state():null;
    const sidNow=Dock.sid(),ltNow=sidNow?Trace.latest(sidNow):null;
    const botScore=ltNow?.botScore??bsState?.botScore??null;
    const botLv=typeof BotService!=='undefined'&&BotService.levelOf?BotService.levelOf(botScore):null;
    const rows=[
      ['Pulse 额度',p?p.pulse+'%':'—'],
      ['BotService 分数',botScore!=null?`${botScore} / 99（${botLv?.label||'已采样'}）`:'待对话采样（1–99）'],
      ['更新时间',p?.at?fmtClock2(p.at):'—'],
      ['频率','至少 5 分钟；限流后退避'],
    ];
    if(bsState?.poolDetail){
      rows.splice(2,0,['号池分构成',bsState.poolDetail]);
    }
    if(bsState?.ja4BrowserRatio!=null){
      rows.splice(2,0,['JA4 浏览器真实率',Math.round(bsState.ja4BrowserRatio*100)+'%']);
    }
    if(bud?.total!=null)rows.splice(1,0,['推断总额度','≈ $'+Math.round(bud.total)+(bud.loose?'（偏差大）':'')],['推断余额','≈ $'+(bud.remaining>=100?Math.round(bud.remaining):bud.remaining.toFixed(2))]);
    else if(bud)rows.splice(1,0,['推断总额度',bt?.summary || '继续观测']);
    if(bud){rows.push(['依据',bud.source==='charged'?'实际扣费账本':'含内容估价']);if(bud.cands?.length>1)rows.push(['可能档位',bud.cands.map(n=>'$'+n).join(' / ')]);if(bud.lo>0&&Number.isFinite(bud.hi)&&!['inconsistent','incomplete','settling'].includes(bud.status))rows.push(['总额度范围','$'+bud.lo.toFixed(2)+'–$'+bud.hi.toFixed(2)]);}
    // Preserve the actual card/close button across periodic footer refreshes.
    let graphic=box.querySelector('.bd-svg'),body=box.querySelector('.bd-rows');
    if(!graphic){graphic=d;body=h('div',{class:'bd-rows'});box.append(graphic,body,h('button',{type:'button',class:'ib bd-close','aria-label':'关闭余额明细',title:'关闭'},icon('x')));}else graphic.innerHTML=d.innerHTML;
    body.replaceChildren(...rows.map(([k,v])=>h('div',{},h('span',{class:'dim'},k),h('b',{},v))));
    const r=anchor.getBoundingClientRect(),width=box.offsetWidth;if(typeof placeInward==='function')placeInward(box,r,{pad:8,gap:8,useBottom:true,keepWidth:true});else{box.style.left=Math.max(8,Math.min(innerWidth-width-8,r.left))+'px';box.style.bottom=Math.max(8,innerHeight-r.top+8)+'px';}
  },
};
// ---------- 右下角 IP 徽标：悬停 / 长按显示延迟 + 上传下载网速 ----------
const NetTip = {
  box: null, anchor: null, timer: 0, iv: 0, pinned: false,
  show(anchor, pinned = false) {
    this.hide(); this.anchor = anchor; this.pinned = pinned;
    this.box = h('div', { class: 'nettip', role: 'status' }); document.body.append(this.box);
    this.paint(); this.iv = setInterval(() => this.paint(), 500);
  },
  hide() {
    clearTimeout(this.timer); clearInterval(this.iv); this.iv = 0; this.box?.remove(); this.box = null; this.anchor = null; this.pinned = false;
  },
  paint() {
    const box = this.box; if (!box) return;
    let a = this.anchor; if (!a?.isConnected) a = this.anchor = document.querySelector('#bar .ipit'); if (!a) return this.hide();
    const T = Traffic, r = T.rate(3), v = T.verdict(), rtt = IP.rtt ? IP.rtt + ' ms' : IP.rttFail ? '超时' : '…', sec = Math.max(1, Math.round((now() - T.since) / 1000));
    const row = (k, val, cls) => h('div', { class: 'nt-r' }, h('span', { class: 'dim' }, k), h('b', { class: cls || '' }, val));
    const info = String(a.dataset.nettip || '').split('\n').map(x => x.trim()).filter(Boolean);
    box.replaceChildren(
      row('延迟', rtt, IP.rttCls()),
      row('↑ 上传', T.fmt(r.up) + '/s'), row('↓ 下载', T.fmt(r.down) + '/s'),
      row('累计 ↑ / ↓', T.fmt(T.up) + ' / ' + T.fmt(T.down)),
      row('最近收到数据', T.lastDownAt ? (now() - T.lastDownAt < 1500 ? '刚刚' : Math.round((now() - T.lastDownAt) / 1000) + ' 秒前') : '还没有'),
      h('div', { class: 'nt-v nt-' + v.kind }, v.text),
      ...(typeof DeviceInfo !== 'undefined' ? [h('div', { class: 'nt-s dim nt-head' }, '设备信息'), ...DeviceInfo.rows(row)] : []),
      ...(T.top ? (() => { const top = T.top(5).filter(x => x.t > 0); return top.length ? [h('div', { class: 'nt-s dim' }, '流量去向（累计）'), ...top.map(x => row(x.k + (x.n > 1 ? ' ×' + x.n : ''), T.fmt(x.t)))] : []; })() : []),
      h('div', { class: 'nt-s dim' }, '只统计对话 / 列表 / 下载等应用数据（不含延迟探测），自 ' + (sec < 90 ? sec + ' 秒' : Math.round(sec / 60) + ' 分钟') + '前开始'),
      ...(info.length ? [h('div', { class: 'nt-i dim' }, info.join('\n'))] : []));
    const rc = a.getBoundingClientRect(), w = box.offsetWidth;
    if (typeof placeInward === 'function') placeInward(box, rc, { pad: 8, gap: 8, useBottom: true, keepWidth: true }); else { box.style.left = Math.max(8, Math.min(innerWidth - w - 8, rc.right - w)) + 'px'; box.style.bottom = Math.max(8, innerHeight - rc.top + 8) + 'px'; }
  },
};
{
  const canHover = () => { try { return matchMedia('(hover:hover)').matches; } catch { return true; } };
  const find = e => e.target?.closest?.('#bar .ipit');
  document.addEventListener('mouseover', e => { const a = find(e); if (!a || !canHover() || a === NetTip.anchor) return; clearTimeout(NetTip.timer); NetTip.timer = setTimeout(() => { if (a.isConnected) NetTip.show(a); }, 180); });
  document.addEventListener('mouseout', e => { const a = find(e); if (!a || a.contains(e.relatedTarget)) return; clearTimeout(NetTip.timer); if (!NetTip.pinned) NetTip.hide(); });
  // 手机没有悬停：长按徽标显示（点别处收起）
  document.addEventListener('contextmenu', e => { const a = find(e); if (!a) return; e.preventDefault(); NetTip.show(a, true); });
  document.addEventListener('pointerdown', e => { if (NetTip.pinned && !find(e)) NetTip.hide(); }, true);
  document.addEventListener('click', e => { if (find(e)) NetTip.hide(); }, true);
  addEventListener('resize', () => NetTip.hide()); addEventListener('blur', () => NetTip.hide());
}
for (const ev of ['pulse', 'budget', 'models', 'ip', 'quota', 'gacha', 'history']) Bus.on(ev, () => { clearTimeout(Bar.t); Bar.t = setTimeout(() => Bar.render(), 150); });
setInterval(() => { if (!document.hidden) Bar.render(); }, 15000);
Bus.on('chat', c => { if (c?.busy && c.sid === Dock.sid() && !Bar.ct) Bar.ct = setTimeout(() => { Bar.ct = 0; Bar.render(); }, 2000); });

// ---------- 发送键旁的抽卡按钮（目标厂商 + 张数 + 开始/停止，弹出 256px 面板）----------
const GPop = {
  btn() {
    const b = h('button', { class: 'gbtn2', type: 'button', onclick: e => { e.stopPropagation(); if (b._rvSkip && Date.now() - b._rvSkip < 500) return; if (b.hasAttribute('data-cap')) { GPop.captcha(); return; } this.toggle(b); } });
    this.paint(b); Revolver.attach(b); return b;
  },
  // 抽卡遇到人机验证：按钮变成「验」，点一下直接弹出验证，完成后自动继续
  captcha() {
    if (Gacha.solving) { toast('验证窗口已经打开'); return; }
    Gacha.solveCaptcha().then(() => toast('已完成人机验证，继续抽卡')).catch(e => toast('人机验证没有完成：' + describe(e), 'err'));
  },
  capEl(b, on, solving) {
    b.toggleAttribute('data-cap', !!on);
    if (!on) return false;
    b.title = solving ? '正在人机验证…' : '抽卡遇到人机验证：点一下完成验证，完成后自动继续抽卡';
    b.replaceChildren(h('span', { class: 'g-cap' + (solving ? ' ing' : '') }, '验'));
    return true;
  },
  paint(b) {
    if (!b) return;
    const s0 = Gacha.settings(), r = Gacha.run, busy = Gacha.busy();
    if (this.capEl(b, Gacha.needCaptcha(), Gacha.solving)) { b.dataset.running = 'true'; b.removeAttribute('data-empty'); return; }
    // 抽卡中：按钮显示这一轮抽卡的目标（开始时定下）；左轮 / 面板换的厂商只影响侧栏排序
    const s = busy && r?.settings ? { ...s0, vendor: r.settings.vendor || '', targetName: r.settings.targetName || '' } : s0, v = Gacha.vendorBy(s.vendor);
    const total = r?.settings?.endless ? '∞' : (r?.settings?.maxAttempts || s.maxAttempts), done = r?.completed || 0;
    b.dataset.running = String(busy); b.toggleAttribute('data-empty', !s.vendor);
    b.title = busy ? `抽卡中 ${done}/${total}${r.phase ? ' · ' + r.phase : ''}${(s0.vendor || '') !== (s.vendor || '') ? ' · 侧栏排序：' + (s0.targetName || '不限') : ''} · 点击查看（滚轮 / 上下滑动可换侧栏排序的厂商，不影响抽卡）` : '目标模型：' + (s.targetName || '不限') + ' · 点击设置并抽卡（Ctrl+G）';
    const last = (r?.attempts || []).filter(a => a.model && a.done).at(-1), lvid = last ? Brand.of(last.model) : '';
    b.replaceChildren(...K(
      busy ? h('span', { class: 'g-ring', style: { '--p': total === '∞' ? 100 : Math.round(done / total * 100) } }, v ? VIcon.el(v.id, 14) : icon('slot', 'g-any')) : v ? VIcon.el(v.id, 14) : s.vendor === 'custom' ? h('span', { class: 'g-k' }, '#') : null,
      h('span', { class: 'g-name' }, s.targetName || '不限'),
      busy ? h('span', { class: 'g-prog' }, done + '/' + total) : icon('chev', 'g-chev'),
      busy ? h('i', { class: 'g-bar', style: { width: (total === '∞' ? 100 : Math.min(100, done / total * 100)) + '%' } }) : null,
      r && !busy && r.status === 'stopped' && r.code && !['RELOADED', 'CANCEL'].includes(r.code) ? h('i', { class: 'g-dot' }) : null));
    if (busy && lvid && last.no !== b._land) { b._land = last.no; b.classList.remove('land'); void b.offsetWidth; b.classList.add('land'); b.classList.toggle('hit', last.verdict === 'hit'); }
  },
};
// 账号菜单里的抽卡按钮：和发送键旁的抽卡按钮一样只是一个图标（厂商图标 / 进度环），功能完全一样：
// 点一下弹出同一个抽卡面板（张数、目标厂商、归档黑名单、提示词都能改），滚轮 / 长按弹出左轮选厂商；
// 面板里按 START 就在后台抽这个账号（不打开窗口），进度显示在图标的进度环和账号那一行的「抽卡中 n/N」上
GPop.acctBtn = function (a, isCur) {
  const b = h('button', { class: 'gbtn2 gacct', type: 'button', 'data-acct': a.id, 'data-cur': isCur ? '1' : '0', 'data-name': emailUser(a) });
  b.onclick = e => { e.stopPropagation(); e.preventDefault(); if (b._rvSkip && Date.now() - b._rvSkip < 500) return; if (b.hasAttribute('data-cap')) { GPop.acctCaptcha(b); return; } GPop.toggle(b); };
  if (!isCur) GPop.remote.set(a.id, a.status?.gacha || null);
  GPop.paintAcct(b, GPop.acctState(a.id, isCur)); Revolver.attach(b); return b;
};
GPop.remote = new Map();
GPop.acctState = function (id, isCur) {
  if (isCur) {
    const r = Gacha.run, s = Gacha.settings();let last;for(let i=(r?.attempts?.length||0)-1;i>=0;i--){const x=r.attempts[i];if(x.model&&x.done){last=x;break;}}
    return { busy: Gacha.busy(), cap: Gacha.needCaptcha(), done: r?.completed || 0, total: r?.settings?.endless ? '∞' : (r?.settings?.maxAttempts || s.maxAttempts), hits: (r?.hits || []).length, phase: r?.phase || '', last: last?.model || '', status: r?.status || '',
      err: r && !Gacha.busy() && r.status === 'stopped' && r.code && !['RELOADED', 'CANCEL'].includes(r.code) ? r.reason : '',
      log: (r?.attempts || []).slice(-12).map(x => ({ no: x.no, draw: x.draw, at: x.at, model: x.model || '', tier: x.tier || '', verdict: x.verdict || '', archived: !!x.archived, note: x.note || '' })) };
  }
  const g = GPop.remote.get(id) || {};
  return { busy: !!g.busy, cap: !!g.busy && !!g.cap, done: g.done || 0, total: g.total || Gacha.settings(id).maxAttempts, hits: g.hits || 0, phase: g.phase || '', last: g.last || '', err: g.err || '', status: g.status || '', log: Array.isArray(g.log) ? g.log : [] };
};
// 其他账号的「验」：电脑 = 把那个账号的窗口拿到前面并直接弹出验证；手机 = 切到那个账号（再点一下它的「验」）
GPop.acctCaptcha = async function (b) {
  if (b.dataset.cur === '1') { GPop.captcha(); return; }
  const id = b.dataset.acct, name = b.dataset.name || '这个账号';
  document.querySelectorAll('.menu:not(.anc-gh).amenu,.lpick').forEach(x => { try { x.remove(); } catch {} });
  const r = Host.gachaAccount ? await Host.gachaAccount(id, 'captcha').catch(e => ({ error: e.message })) : { error: 'x' };
  if (r?.ok) { toast(name + '：已打开验证窗口'); return; }
  toast('正在切换到 ' + name + '，点抽卡按钮上的「验」完成验证'); Host.openAccount(id);
};
GPop.paintAcct = function (b, g) {
  const s = Gacha.settings(b.dataset.cur === '1' ? null : b.dataset.acct), v = Gacha.vendorBy(s.vendor), total = g.total || s.maxAttempts, done = g.done || 0;
  const paintKey=JSON.stringify([g.busy,g.cap,g.done,g.total,g.hits,g.phase,g.err,s.vendor,s.customKeyword,s.targetName,s.maxAttempts,b.dataset.name,Gacha.solving]);
  if(b._acctPaint===paintKey)return;b._acctPaint=paintKey;
  if (GPop.capEl(b, g.cap, b.dataset.cur === '1' && Gacha.solving)) { b.dataset.running = 'true'; b.removeAttribute('data-empty'); b.title = (b.dataset.cur === '1' ? '' : (b.dataset.name || '') + ' · ') + '抽卡遇到人机验证：点一下完成验证'; const tag = b.closest('.arow-w')?.querySelector('.gtag'); if (tag) { tag.hidden = false; tag.classList.add('on'); tag.textContent = '抽卡中 ' + done + '/' + total + ' · 需要人机验证'; } return; }
  b.dataset.running = String(!!g.busy); b.toggleAttribute('data-empty', !s.vendor);
  b.title = (b.dataset.cur === '1' ? '' : (b.dataset.name || '') + ' · ') + (g.busy ? `抽卡中 ${done}/${total}${g.hits ? ' · 命中 ' + g.hits : ''}${g.phase ? ' · ' + g.phase : ''} · 点击查看` : (g.err ? '上次：' + g.err + '\n' : '') + '目标模型：' + (s.targetName || '不限') + ' · 点击设置并在后台抽卡');
  const pct = total === '∞' ? 100 : Math.min(100, Math.round(done / (total || 1) * 100));
  b.replaceChildren(...K(
    g.busy ? h('span', { class: 'g-ring', style: { '--p': pct } }, v ? VIcon.el(v.id, 14) : icon('slot', 'g-any')) : v ? VIcon.el(v.id, 14) : s.vendor === 'custom' ? h('span', { class: 'g-k' }, '#') : null,
    !g.busy && g.err ? h('i', { class: 'g-dot' }) : null));
  // 账号那一行：抽卡中 n/N
  const tag = b.closest('.arow-w')?.querySelector('.gtag');
  if (tag) {
    // 账号卡片第四行：抽卡进度（没在抽时显示上次结果 / 未运行）
    tag.hidden = false; tag.classList.toggle('on', !!g.busy); tag.classList.toggle('err', !g.busy && !!g.err);
    tag.textContent = g.busy ? '抽卡中 ' + done + '/' + total + (g.hits ? ' · 命中 ' + g.hits : '') + (g.phase ? ' · ' + g.phase : '')
      : g.err ? '抽卡已停：' + g.err : (g.done ? '上次抽卡 ' + g.done + '/' + total + (g.hits ? ' · 命中 ' + g.hits : '') : '抽卡 未运行');
  }
};
// 把本窗口的抽卡进度报给宿主（账号菜单里其他窗口显示用）
GPop.report = function () {
  clearTimeout(GPop.rt); GPop.rt = setTimeout(() => { const g = GPop.acctState('', true); Host.noteAccount?.({ gacha: g })?.catch?.(() => {}); }, 700);
};
Bus.on('gacha', () => GPop.report());
Bus.on('gacha', () => { clearTimeout(GPop.t); GPop.t = setTimeout(() => { document.querySelectorAll('.gbtn2:not([data-acct])').forEach(b => GPop.paint(b)); if (GPop.isOpen() && !GPop.root.activeElement?.matches?.('input,textarea')) GPop.fill(); }, 80); });

// ---------- 侧栏卡片放大（鼠标最近的卡片和上下各一张向右探出）----------
const Mag = {
  bind(list) {
    let raf = 0, ev = null, act = new Set();
    const reset = () => { for (const a of act) a.style.removeProperty('--mag'); act = new Set(); list.classList.remove('mag-on'); };
    list.addEventListener('mousemove', e => { ev = e; if (!raf) raf = requestAnimationFrame(() => {
      raf = 0; if (Prefs.cardMag === false || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const cards = [...list.querySelectorAll('.card')], y = ev.clientY; let ni = -1, nd = Infinity;
      cards.forEach((c, i) => { const r = c.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - y); if (d < nd) { nd = d; ni = i; } });
      const next = new Set(); list.classList.add('mag-on');
      if (ni >= 0 && nd < 40) for (const [k, m] of [[0, 1.06], [-1, 1.025], [1, 1.025]]) { const c = cards[ni + k]; if (c) { c.style.setProperty('--mag', m); next.add(c); } }
      for (const a of act) if (!next.has(a)) a.style.removeProperty('--mag'); act = next;
    }); });
    list.addEventListener('mouseleave', reset);
  },
};
