// Concurrent session overview tab, sidebar vendor grouping, and leaderboard sorting
ICON.slot = '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 5v14M15 5v14"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/>';
ICON.archive = '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>';
ICON.open = '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';

const TIER_CN = { none: '标准', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' };
const VERDICT = { hit: ['命中', 'hit'], keep: ['保留', 'keep'], archive: ['归档', 'arch'], skipped: ['补抽', 'skip'], cancelled: ['已停止', 'skip'], abandoned: ['中断', 'skip'], error: ['失败', 'bad'] };

// ---------- 侧栏排序 ----------
const Side = {
  bucket(ms) { const d = new Date(); d.setHours(0, 0, 0, 0); const t0 = d.getTime(); return ms >= t0 ? '今天' : ms >= t0 - 86400000 ? '昨天' : ms >= t0 - 6 * 86400000 ? '最近 7 天' : ms >= t0 - 29 * 86400000 ? '最近 30 天' : '更早'; },
  // Each model stays contiguous. Rows inside a model: newest first (reasoning score is NOT a sort key).
  cmp(x,y) { return (y.at-x.at) || (x.i-y.i); },
  // 型号强度序（侧栏用）：① 大版本号跨阶级（6 > 5.x，不分厂商、不看哪个更新）→ ② 同一大版本里按 Brana 实时榜单名次（越靠前越强，
  // 榜单没有时用内置快照）→ ③ GPT 的 astra > sol > luna 在同厂商同大版本里强制生效（榜单缺项 / 不一致时以此为准）
  // → ④ 小版本（6.1 > 6、5.6 > 5.5）→ 档位 → 最近活动。不再用「最近活动」决定型号组之间的先后，
  // 所以旧对话里的 5.5 / 5.6-luna 不会因为刚用过就排到 6.x 前面。
  CODE_RANK: { astra: 3, sol: 2, luna: 1 },
  // 同一个型号的不同写法归成一组：claude-opus-5-5 / opus-5-5 / opus-5-5? / opus-5-5（推测）都算 opus-5-5
  modelId(nm, vid) {
    let k = String(nm || '').toLowerCase().replace(/[（(][^）)]*[）)]/g, '').replace(/[?？\s]+$/g, '').trim().replace(/\s+/g, '-'); if (typeof Strength !== 'undefined' && Strength.foldVer) k = Strength.foldVer(k);
    const names = [vid, vid && typeof Brand !== 'undefined' ? Brand.NAME?.[vid] : '', 'claude', 'anthropic'].filter(Boolean).map(x => String(x).toLowerCase());
    for (const n of names) if (k.startsWith(n + '-') && k.length > n.length + 1) { k = k.slice(n.length + 1); break; }
    return k;
  },
  modelKey(nm) {
    const rev = typeof Ranking !== 'undefined' ? Ranking.rev : 0, c = this._mk || (this._mk = new Map());
    if (this._mkRev !== rev) { c.clear(); this._mkRev = rev; }
    let k = c.get(nm); if (k) return k;
    const ver = Strength.ver10(nm) || 0, toks = String(nm).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), code = toks.map(t => this.CODE_RANK[t] || 0).reduce((m, x) => Math.max(m, x), 0);
    k = { ver, major: Math.floor(ver + 1e-6), code, vid: Brand.of(nm) || '', lb: typeof Ranking !== 'undefined' ? (typeof Ranking.family === 'function' ? Ranking.family(nm) : Ranking.score(nm)) : 1000, lv: Strength.level(nm) ?? -1 };
    if (c.size > 3000) c.clear(); c.set(nm, k); return k;
  },
  modelGroups(rs) {
    const groups=new Map();
    for(const r of rs){const k=r.nm && (r.vid || /^(?:\d[\d.]*-[a-z]|o[134]\b)/i.test(r.nm)) ? (r.mid||r.nm.toLowerCase()) : '\uffff'+r.e.id;
      if(!groups.has(k))groups.set(k,{key:k,at:r.at,i:r.i,rows:[]});const g=groups.get(k);g.at=Math.max(g.at,r.at);g.rows.push(r);}
    const list=[...groups.values()];
    for(const g of list)g.mk=g.key.charCodeAt(0)===0xffff?{ver:0,major:0,code:0,vid:'',lb:1000,lv:-1}:this.modelKey(g.rows[0].nm);
    const tie=(a,b)=>(b.mk.ver-a.mk.ver)||(b.mk.lv-a.mk.lv)||(b.at-a.at)||(a.i-b.i);
    list.sort((a,b)=>(b.mk.major-a.mk.major)||(a.mk.lb-b.mk.lb)||tie(a,b));
    // astra > sol > luna：同厂商、同大版本里，这几个型号占的位置按固定顺序重新分配（其余型号位置不动）
    const slots=new Map();
    list.forEach((g,idx)=>{if(!g.mk.code)return;const k=g.mk.vid+'|'+g.mk.major;(slots.get(k)||slots.set(k,[]).get(k)).push(idx);});
    for(const idxs of slots.values()){
      if(idxs.length<2)continue;
      const gs=idxs.map(i=>list[i]).sort((a,b)=>(b.mk.code-a.mk.code)||(b.mk.ver-a.mk.ver)||(a.mk.lb-b.mk.lb)||tie(a,b));
      idxs.forEach((i,n)=>{list[i]=gs[n];});
    }
    const res=list.map(g=>({key:g.key,at:g.at,i:g.i,mk:g.mk,rows:g.rows.sort(Side.cmp)}));
    let prevUnk=false;   // first row of a model group: the card list draws a thin separator above it; unidentified chats share ONE bucket
    for(const g of res){const unk=g.key.charCodeAt(0)===0xffff;g.rows.forEach((r,j)=>{r.gStart=j===0&&!(unk&&prevUnk);});prevUnk=unk;}
    return res;
  },
  sortRows(rs) { return this.modelGroups(rs).flatMap(g=>g.rows); },
  // 收藏就是标金：无论是否有目标厂商或是「不限」状态，收藏对话始终独立置顶并显示金色效果。
  build(items) {
    const gs = this.build0(items);
    if (!items.some(e => Fav.has(e.id))) return this.paint(gs);
    const favs = [];
    for (const g of gs) g.rows = g.rows.filter(r => Fav.has(r.e.id) ? (favs.push(r), false) : true);
    const sortedFavs = Gacha.settings().targetKeywords.length ? this.sortRows(favs) : favs.sort(Side.cmp);
    for (const r of sortedFavs) r.vip = true;   // 收藏组用金色传说的显示效果（金底 + 左侧金边，深浅跟着排序）
    const restItems = items.filter(e => !Fav.has(e.id));
    return this.paint([{ group: '收藏', rows: sortedFavs, fav: true }, ...(restItems.length ? this.build0(restItems) : [])]);
  },
  // Tint follows the DISPLAYED order (top → bottom = deep → light), computed after sorting/pinning.
  // Only rows of the chosen target vendor (hit) / gold rows are tinted; everything else keeps the plain background.
  paint(groups) {
    const flat = groups.flatMap(g => g.rows), vips = flat.filter(r => r.vip), hits = flat.filter(r => r.hit && !r.vip);
    const tint = (arr, v) => { const n = arr.length, k = arr.indexOf(v); return k < 0 ? '' : (10 + 26 * (n - k) / n).toFixed(1) + '%'; };
    for (const r of flat) r.tint = r.vip ? tint(vips, r) : r.hit ? tint(hits, r) : '';
    return groups;
  },
  // 返回 [{ group, rows }]；命中目标厂商的卡片跨分组统一放最上面
  build0(items) {
    const s = Gacha.settings(), sortOn = s.sortSidebar, kw = s.targetKeywords.map(k => k.toLowerCase());
    const rows = items.map((e, i) => {
      // 型号来源和卡片显示保持一致：标题同步 / 加密标题解出来的型号（Titles.view，卡片显示的就是它）→ 本地型号记录 → 标题文字。
      // 以前只看前者和原始标题，解不出的标题（跨设备同步的编码标题）会被当成「未识别」，同型号被拆成两处。
      const gpLocal = e.localTitle && typeof TitleCipher !== 'undefined' && TitleCipher.decodeGoldPrefix ? TitleCipher.decodeGoldPrefix(e.localTitle) : null;
      const gpCloud = typeof TitleCipher !== 'undefined' && TitleCipher.decodeGoldPrefix ? TitleCipher.decodeGoldPrefix(e.title) : null;
      const gp = gpLocal || gpCloud || null;
      const cleanTitle = e.localTitle ? (gpLocal ? (gpLocal.cleanTitle || '') : String(e.localTitle)) : (gpCloud ? (gpCloud.cleanTitle || '') : String(e.title || ''));
      const mi = Models.get(e.id), tv = typeof Titles !== 'undefined' ? Titles.view(e.id, e.title, e.localTitle) : null, tvModel = (tv?.model && !/待解码/.test(tv.model) ? tv.model : '') || gp?.model || '';
      const rawNote = tv?.note || (typeof Notes !== 'undefined' && Notes.get ? Notes.get(e.id) : '') || '';
      const noteCanon = rawNote ? Strength.canon(rawNote) : '';
      const noteModel = noteCanon && typeof Brand !== 'undefined' && Brand.of(noteCanon) ? noteCanon : '';
      let nm = Strength.canon(ConversationLabels.parse(tvModel || mi?.name || noteBase(cleanTitle)).name);
      if (noteModel && (!nm || !Brand.of(nm) || (Strength.parts?.(noteModel)?.tier && !Strength.parts?.(nm)?.tier))) nm = noteModel;
      const hasModel = !!(tvModel || mi?.name || noteModel);
      const key = (nm + (hasModel ? '' : ' ' + cleanTitle)).toLowerCase();
      const vid = Brand.of(tvModel) || tv?.vid || Brand.of(mi?.name) || Brand.of(noteBase(cleanTitle)) || (noteModel ? Brand.of(noteModel) : null);
      const vname = vid && typeof Brand !== 'undefined' ? String(Brand.NAME?.[vid] || '').toLowerCase() : '';
      const hit = kw.length > 0 && kw.some(k => key.includes(k) || (!!vid && (k === vid || k === vname)));   // 厂商本身也算命中：名字里没写 claude 的 opus / sonnet 对话不会掉出目标组
      const at = entAt(e) || (History?.uuidTs?.(e?.id) || 0);
      const gpModelCanon = gp?.model ? Strength.canon(gp.model) : '';
      const manualNow = typeof Gold !== 'undefined' ? (typeof Gold.manual === 'function' ? Gold.manual() : !!Gold.manual) : false;
      const currentIsGold = Boolean(nm && Brand.of(nm) && typeof Gold !== 'undefined' && (manualNow ? Gold.has?.(nm) : Gold.isUnifiedGold?.(nm)));
      const staleGpGold = Boolean(nm && Brand.of(nm) && !currentIsGold && (!gpModelCanon || gpModelCanon !== nm));
      const gpGold = !!(gp?.gold && !staleGpGold && !(typeof Gold !== 'undefined' && Gold.unmarkAt?.[e.id]));
      return { e, i, vid, hit, vip: false, gpGold, nm, mid: vid ? this.modelId(nm, vid) : '', at, ver: vid ? (Strength.ver10(nm) || null) : null, lv: vid ? Strength.level(nm) : null, score: ConversationLabels.score(mi, noteBase(cleanTitle)) ?? gp?.score ?? null };
    });
    const grouped = rs => this.modelGroups(rs).map(g=>({group:'',rows:g.rows}));
    const manual = typeof Gold !== 'undefined' ? (typeof Gold.manual === 'function' ? Gold.manual() : !!Gold.manual) : false;
    const hasUnifiedGold = typeof Gold !== 'undefined' && typeof Gold.isUnifiedGold === 'function';
    if (!kw.length) {
      for (const r of rows) {
        r.vip = !!(Fav.has(r.e.id) || (manual && r.vid && Gold.has(r.nm)) || (hasUnifiedGold && r.vid && Gold.isUnifiedGold(r.nm)) || (typeof Gold !== 'undefined' && Gold.hasChat?.(r.e.id)) || r.gpGold);
        r.hit = false; r.tint = ''; r.gStart = false;
      }
      return [{ group: '', rows: rows.sort((a, b) => (b.at - a.at) || (a.i - b.i)) }];
    }   // 不限：按时间排序，但收藏和全账号统一的金色标记在所有账号同步高亮
    // 金色（选了目标厂商：只有收藏和目标厂商点亮的型号是金色，其他厂商的金色传说变成普通）
    const pool = kw.length ? rows.filter(r => r.hit) : rows.filter(r => r.vid);
    const topVer = pool.reduce((m, r) => r.ver != null && r.lv != null && r.ver > m ? r.ver : m, -Infinity);
    const topLv = pool.reduce((m, r) => r.ver === topVer && r.lv != null ? Math.max(m, Math.round(r.lv)) : m, -Infinity);
    if (manual) { for (const r of rows) r.vip = !!(r.vid && Gold.has(r.nm)); }   // 手动点亮：设置 / 推理分排行里点亮的型号跨所有账号同步金色
    else if (hasUnifiedGold) { for (const r of pool) r.vip = !!(r.vid && (Gold.isUnifiedGold(r.nm) || (Number.isFinite(topVer) && Number.isFinite(topLv) && r.ver === topVer && r.lv != null && Math.round(r.lv) === topLv))); }
    else if (Number.isFinite(topVer) && Number.isFinite(topLv)) for (const r of pool) r.vip = r.ver === topVer && r.lv != null && Math.round(r.lv) === topLv;
    for (const r of pool) if (Fav.has(r.e.id) || (typeof Gold !== 'undefined' && Gold.hasChat?.(r.e.id)) || r.gpGold) r.vip = true;
    if (kw.length) { for (const r of rows) if (!r.hit && !Fav.has(r.e.id)) r.vip = false; }
    const out=[],vips=rows.filter(r=>r.vip);
    let rest=rows;
    if((manual||hasUnifiedGold)&&vips.length){out.push({group:'金色',rows:this.sortRows(vips),pinned:true,gold:true});rest=rest.filter(r=>!r.vip);}
    if(sortOn||kw.length){const pinned=rest.filter(r=>r.hit);if(pinned.length)out.push({group:'目标 · '+(s.targetName||''),rows:this.sortRows(pinned),pinned:true});rest=rest.filter(r=>!r.hit);}
    if(kw.length){for(const r of rest){r.vip=false;r.hit=false;r.tint='';r.gStart=false;}rest.sort(Side.cmp);for(const r of rest)out.push({group:'',rows:[r]});return out;}
    out.push(...grouped(rest));return out;
  },
};

// ---------- 抽卡标签页 ----------
const GView = {
  el: null, slotKey: '', lastRev: -1,
  mount(view) {
    const s = Gacha.settings();
    const root = h('div', { class: 'gacha' });
    const head = h('div', { class: 'chead' }, icon('slot'), h('div', { class: 'chead-t' }, '抽卡'), h('span', { class: 'gpill', 'data-g': 'pill' }), h('span', { class: 'grow' }), h('span', { class: 'dim', 'data-g': 'prog' }));
    const slot = h('section', { class: 'gcard gslot' },
      h('div', { class: 'reels' }, ...[0, 1, 2].map(i => h('div', { class: 'reel', 'data-r': i }, h('div', { class: 'reel-l' }, ['厂商', '型号', '档位'][i]), h('div', { class: 'reel-w' }, h('div', { class: 'reel-v' }, '—'))))),
      h('div', { class: 'gsub', 'data-g': 'sub' }, '选好目标厂商和张数，点「开始抽卡」'));
    // 目标厂商
    const vend = h('div', { class: 'gvend', 'data-g': 'vend' });
    const custom = h('input', { class: 'gcustom', placeholder: '自定义关键词', value: s.customKeyword || '', maxlength: 60, onchange: () => { Gacha.setVendor(custom.value.trim() ? 'custom' : '', custom.value); this.paintCfg(); }, onkeydown: e => { if (e.key === 'Enter') custom.blur(); } });
    const qty = h('div', { class: 'gseg', 'data-g': 'qty' });
    const acts = h('div', { class: 'gacts', 'data-g': 'acts' });
    const ctl = h('section', { class: 'gcard' },
      h('div', { class: 'glabel' }, '目标厂商', h('small', {}, '识别到的模型名包含厂商关键词即命中'), h('span', { class: 'grow' }), h('button', { class: 'link sm', onclick: () => Tabs.openPower() }, '推理分排行 ↗')), vend, h('div', { 'data-g': 'models' }), h('div', { class: 'gcrow' }, custom),
      h('div', { class: 'glabel' }, '目标强度', h('small', {}, '代号模型按推理分排行的实测强度判断')), h('div', { 'data-g': 'str' }),
      h('div', { class: 'glabel' }, '张数'), qty, acts, h('p', { class: 'greason', 'data-g': 'reason' }));
    const stats = h('section', { class: 'gcard gstats', 'data-g': 'stats' });
    const results = h('section', { class: 'gcard' }, h('div', { class: 'glabel' }, '本次结果', h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', 'data-g': 'tidy', title: '归档本次标记为「归档」但还没归档成功的对话', onclick: async e => { e.currentTarget.disabled = true; const n = await Gacha.archiveQueued(true); toast('已归档 ' + n + ' 个'); this.update(true); } }, icon('archive'), '整理')), h('div', { class: 'gres', 'data-g': 'res' }));
    // 选项
    const f = (k, type, attrs = {}) => h('input', { type, ...attrs, 'data-k': k });
    const prompt = h('textarea', { rows: 2, maxlength: 4000, 'data-k': 'prompt' }, s.prompt);
    const mode=h('select',{'data-k':'mode',onchange:()=>{Gacha.save({mode:mode.value});this.paintCfg();}},...['habit','autoqa','svg','custom','fingerprint'].map((key,i)=>h('option',{value:key,selected:s.mode===key||null},['习惯速测 · 微缩探针','自动问答 · 智能反推','SVG · 英文鹈鹕','自定义 · 四位数前缀','测指纹 · 优选名单'][i])));
    const preferred=h('textarea',{rows:2,'data-k':'preferredKeywords'},s.preferredKeywords.join('\n'));

    const interval = f('intervalSec', 'number', { min: 0, max: 60, step: 0.1, value: (s.intervalMs / 1000).toString() });
    const par = h('select', { 'data-k': 'parallel' }, ...[1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: s.parallel === n || null }, n + ' 路')));
    const chk = (k, label, tip) => h('label', { class: 'gchk', title: tip || '' }, h('input', { type: 'checkbox', 'data-k': k, checked: s[k] || null, onchange: e => { Gacha.save({ [k]: e.target.checked }); this.paintCfg(); if (k === 'sortSidebar') UI.renderList(); } }), h('span', {}, label));
    const opts = h('details', { class: 'gcard gdet' }, h('summary', {}, icon('gear'), '选项'),
      h('div', { class: 'gform' },
        h('label',{class:'gfield'},h('span',{},'抽卡模式'),mode),
        h('label',{class:'gfield','data-g':'preferred'},h('span',{},'优选名单：首次命中才测满 3 条'),preferred),
        h('label', { class: 'gfield' }, h('span', {}, '提示词'), prompt),
        h('div', { class: 'gcrow' }, h('label', { class: 'gfield' }, h('span', {}, '间隔（秒）'), interval), h('label', { class: 'gfield' }, h('span', {}, '并行路数'), par)),
        chk('turbo', '急速并行：发出后立即开下一抽，后台识别（最多 N 路同时识别；两次新建至少间隔 10 秒）', '关闭则一抽识别完再开下一抽'),
        chk('stopOnThinking', '正文后出现可见思考就停止（已知闭源除外，不代表改派）'),
        chk('stopOnHit', '命中目标后立即停止（默认抽满设定张数）'),
        chk('sortSidebar', '目标厂商置顶（模型分组，组内按推理分降序）'),
        h('div', { class: 'gbtns' }, h('button', { class: 'btn sm', onclick: () => {
          const sec = Number(interval.value); if (!Number.isFinite(sec) || sec < 0 || sec > 60) { toast('间隔需在 0–60 秒之间', 'err'); return; }
          Gacha.save({preferredKeywords:GachaPrompts.keywords(preferred.value), prompt: prompt.value.trim() || Gacha.DEFAULTS.prompt, intervalMs: Math.round(sec * 1000), parallel: +par.value }); toast('已保存（对所有账号生效）');
        } }, '保存'), h('button', { class: 'btn sm ghost', onclick: () => { prompt.value = Gacha.DEFAULTS.prompt; } }, '恢复默认提示词'))));
    // 归档黑名单
    const chips = h('div', { class: 'gchips', 'data-g': 'chips' });
    const addIn = h('textarea', { rows: 1, placeholder: '输入关键词，换行可一次添加多个' });
    const arch = h('details', { class: 'gcard gdet' }, h('summary', {}, icon('archive'), '归档黑名单', h('small', { class: 'dim' }, '识别结果包含这些词的对话自动归档')),
      h('div', { class: 'gform' }, chk('archiveOn', '启用归档黑名单'), h('label', { class: 'gchk' }, h('input', { type: 'checkbox', 'data-k': 'archSync', onchange: async e => { await Gacha.setSync(e.target.checked); this.paintCfg(); toast(e.target.checked ? '已开启：所有账号共用这份黑名单' : '已关闭：各账号保留当前这份黑名单'); } }), h('span', {}, '所有账号同步黑名单（在任何一个账号里改，全部账号同步）')), chips,
        h('div', { class: 'gcrow' }, addIn, h('button', { class: 'btn sm', onclick: () => { const add = addIn.value.split(/[\n,，]+/).map(x => x.trim()).filter(Boolean); if (!add.length) return; Gacha.save({ archiveKeywords: [...Gacha.settings().archiveKeywords, ...add] }); addIn.value = ''; this.paintCfg(); } }, '添加'))));
    const logs = h('details', { class: 'gcard gdet', ontoggle: () => this.update(true) }, h('summary', {}, icon('menu'), '日志'), h('div', { class: 'glog', 'data-g': 'log' }));
    const scroll = h('div', { class: 'scroller' }, h('div', { class: 'gwrap' }, slot, ctl, stats, results, opts, arch, logs));
    root.append(head, scroll);
    view.replaceChildren(root);
    this.el = root; this.slotKey = ''; this.lastRev = -1;
    this.paintCfg(); this.update(true);
  },
  $(k) { return this.el?.querySelector('[data-g="' + k + '"]'); },
  paintCfg() {
    if (!this.el) return;
    const s = Gacha.settings(), busy = Gacha.busy();
    const vend = this.$('vend'); vend.replaceChildren(
      h('button', { class: 'gchip' + (!s.vendor ? ' on' : ''), disabled: busy || null, onclick: () => { Gacha.setVendor(''); this.paintCfg(); UI.renderList(); } }, '不限'),
      ...Gacha.VENDORS.map(v => h('button', { class: 'gchip' + (s.vendor === v.id ? ' on' : ''), disabled: busy || null, title: v.lab, onclick: () => { Gacha.setVendor(v.id); this.paintCfg(); UI.renderList(); } }, VIcon.el(v.id, 15), v.name)));
    const cu = this.el.querySelector('.gcustom'); cu.disabled = busy; cu.classList.toggle('on', s.vendor === 'custom'); if (document.activeElement !== cu) cu.value = s.customKeyword || '';
    const after = () => { this.paintCfg(); UI.renderList(); };
    this.$('str').replaceChildren(StrPick.seg('gseg', after));
    this.$('models').replaceChildren(...K(StrPick.chips('gvend gmodels', after)));
    const qty = this.$('qty'); qty.replaceChildren(...Gacha.QUANTITIES.map(n => h('button', { class: !s.endless && s.maxAttempts === n ? 'on' : '', disabled: busy || null, onclick: () => { Gacha.save({ maxAttempts: n, endless: false }); this.paintCfg(); } }, n + ' 张')),
      h('button', { class: s.endless ? 'on' : '', disabled: busy || null, title: '持续抽卡：不限次数，直到手动停止', onclick: () => { Gacha.save({ endless: true }); this.paintCfg(); } }, '∞ 持续'));
    this.el.querySelectorAll('[data-k]').forEach(n => { const k = n.dataset.k; if (n.type === 'checkbox') n.checked = !!s[k]; if (['prompt', 'intervalSec', 'parallel', 'turbo', 'endless'].includes(k)) n.disabled = busy; });
    this.$('preferred').hidden=!s.fingerprint;
    this.el.querySelector('[data-k=mode]').disabled=busy;
    this.el.querySelector('[data-k=prompt]').disabled=busy||s.mode!=='custom';
    this.el.querySelector('[data-k=preferredKeywords]').disabled=busy;
    const chips = this.$('chips'); chips.replaceChildren(...s.archiveKeywords.map(k => h('span', { class: 'gtag' }, k, h('button', { title: '删除', disabled: busy || null, onclick: () => { Gacha.save({ archiveKeywords: Gacha.settings().archiveKeywords.filter(x => x !== k) }); this.paintCfg(); } }, '×'))));
    if (!s.archiveKeywords.length) chips.append(h('span', { class: 'dim' }, '（空）'));
  },
  update(force) {
    if (!this.el || !this.el.isConnected) { this.el = null; return; }
    const run = Gacha.run, s = Gacha.settings(), busy = Gacha.busy();
    if (busy !== this.wasBusy) { this.wasBusy = busy; this.paintCfg(); }
    // 状态
    const st = !run ? ['未开始', ''] : run.status === 'running' ? [run.waitUntil ? '等待中' : '运行中', 'run'] : run.status === 'stopping' ? ['正在停止', 'run'] : run.status === 'hit' ? ['已命中', 'ok'] : run.status === 'done' ? ['已完成', 'ok'] : ['已停止', run.code && run.code !== 'RELOADED' ? 'bad' : ''];
    const pill = this.$('pill'); pill.textContent = st[0]; pill.className = 'gpill ' + st[1];
    const max = run?.settings?.endless ? '∞' : (run?.settings?.maxAttempts || s.maxAttempts);
    this.$('prog').textContent = run ? `${run.completed}/${max} · 命中 ${(run.hits || []).length}${Gacha.flights ? ' · 后台 ' + Gacha.flights + ' 路' : ''}` : '';
    // 按钮
    const acts = this.$('acts'), ip = Gacha.ipLimited();
    acts.replaceChildren(...K(
      busy ? h('button', { class: 'btn big danger-b', onclick: () => Gacha.stop() }, icon('stop'), '停止') : h('button', { class: 'btn big', onclick: () => { const r = Gacha.start(); if (!r.ok) toast(r.error, 'err'); } }, icon('slot'), s.endless ? '开始持续抽卡' : '开始抽卡 · ' + s.maxAttempts + ' 张'),
      Gacha.capOffer() ? h('button', { class: 'btn ghost', onclick: () => Gacha.solveCaptcha().catch(e => toast(e.message, 'err')) }, '完成验证') : null,
      ip ? h('button', { class: 'btn ghost', onclick: async e => { const b = e.currentTarget; b.disabled = true; b.textContent = '检测中…'; const r = await Gacha.ipRetry(); if (!r.ok) { toast(r.error, 'err'); b.disabled = false; b.textContent = '等待后重试'; } } }, '等待后重试') : null,
      ip ? h('button', { class: 'btn ghost', onclick: () => UI.accounts() }, '修改代理') : null,
      !busy && run ? h('button', { class: 'btn ghost', onclick: () => { Gacha.reset(); this.slotKey = ''; this.update(true); } }, '清除记录') : null));
    const reason = this.$('reason'); const rs = run && !busy ? run.reason || '' : run?.phase || '';
    reason.textContent = rs; reason.className = 'greason' + (run && !busy && run.code && run.code !== 'RELOADED' ? ' bad' : '');
    // 老虎机
    this.paintSlot(run);
    if (!force && this.lastRev === Gacha.rev) return; this.lastRev = Gacha.rev;
    // 统计
    const q = Quota.chat, bu = Quota.blockedUntil(), p = Pulse.v;
    const stat = (l, v, cls = '') => h('div', { class: 'gstat ' + cls }, h('b', {}, v), h('span', {}, l));
    this.$('stats').replaceChildren(
      stat('已抽', run ? run.completed + (run.settings?.endless ? '' : ' / ' + max) : '—'),
      stat('命中', run ? String((run.hits || []).length) : '—', run?.hits?.length ? 'ok' : ''),
      stat('后台识别', String(Gacha.flights)),
      stat('补抽', run ? String(run.skipTotal || 0) : '—'),
      stat('新对话额度', q && q.remaining != null ? q.remaining + (q.limit != null ? '/' + q.limit : '') : '—', bu ? 'bad' : ''),
      stat('账号额度', p ? p.pulse + '%' : '—', p && p.pulse < 10 ? 'bad' : ''),
      stat('出口 IP', IP.ip ? IP.ip + (IP.loc ? ' ' + ccF(IP.loc) : '') : '—'));
    // 结果
    const res = this.$('res'), list = (run?.attempts || []).slice().reverse();
    if (!list.length) res.replaceChildren(h('div', { class: 'empty' }, '还没有结果'));
    else res.replaceChildren(...list.slice(0, 200).map(a => {
      const gs = !a.done && Gacha.stepInfo ? Gacha.stepInfo(a) : null;
      const vd = a.done ? VERDICT[a.verdict] || [a.verdict || '—', ''] : [gs?.text || a.phase || '进行中', 'run'];
      const name = a.model || a.early || '', vid = Brand.of(name);
      return h('div', { class: 'gri ' + (a.verdict === 'hit' ? 'hit' : '') + (gs ? ' gstep-card' : ''), title: gs?.phase || '' },
        h('span', { class: 'gno' }, a.verdict === 'skipped' ? '不计' : (a.draw ? '#' + a.draw : '·' + (a.no || ''))),
        vid ? VIcon.el(vid, 15) : h('span', { class: 'vicon' }),
        h('span', { class: 'gname', title: [a.model, a.note, gs?.phase].filter(Boolean).join('\n') }, name ? Brand.short(name).replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, '') : (a.note || (a.done ? '—' : (gs?.phase || '等待…')))),
        h('span', { class: 'gtier', title: a.power != null ? '强度分（按回复节奏估算，满分 10000）' : null }, a.power != null ? String(a.power) : a.tier ? TIER_CN[a.tier] || a.tier : a.done && a.model ? (a.partial ? '?' : '标准') : ''),
        h('span', { class: 'gv ' + vd[1] }, !a.done ? h('i', { class: 'spin' }) : null, vd[0], a.archived ? ' ✓' : ''),
        h('span', { class: 'dim gms' }, a.idMs ? (a.idMs / 1000).toFixed(1) + 's' : ''),
        a.sid ? h('button', { class: 'ib', title: '打开对话', onclick: () => Tabs.open(a.sid, { title: a.model || '抽卡对话' }) }, icon('open')) : h('span', { class: 'ib' }),
        gs ? h('i', { class: 'gstep-bar', 'aria-hidden': 'true' }, h('b', { style: { width: gs.pct + '%' } })) : null);
    }));
    const tidy = this.$('tidy'); if (tidy) tidy.disabled = !run || busy;
    // 日志
    const lg = this.$('log'); if (lg && lg.closest('details').open || force) lg.replaceChildren(...(run?.log || []).slice(-150).reverse().map(l => h('div', { class: 'gl ' + l.level }, h('span', { class: 'dim' }, new Date(l.at).toLocaleTimeString()), ' ', l.text)));
  },
  paintSlot(run) {
    const a = Gacha.showing(), reels = this.el.querySelectorAll('.reel');
    const name = a ? a.model || a.early || '' : '', vid = Brand.of(name);
    const key = !a ? 'none' : (a.no + '|' + (a.done ? 'd' : 'p') + '|' + name + '|' + (a.tier || '') + '|' + (a.verdict || ''));
    const sub = this.$('sub');
    if (a) sub.textContent = a.done ? (a.model ? `第 ${a.draw} 抽：${a.model}${a.verdict === 'hit' ? ' · 命中目标 🎯' : a.verdict === 'archive' ? ' · 已归档' : ''}` : `第 ${a.no} 轮 · ${a.note || VERDICT[a.verdict]?.[0] || ''}`) : `第 ${a.no} 轮 · ${a.phase || '进行中'}${a.early ? ' · 已识别厂商' : ''}`;
    else sub.textContent = run?.phase || (run ? run.reason || '' : '选好目标厂商和张数，点「开始抽卡」');
    if (key === this.slotKey) return; this.slotKey = key;
    const el = this.el.querySelector('.gslot'); el.classList.toggle('hit', a?.verdict === 'hit');
    const vals = [vid ? [VIcon.html(vid, 22), Brand.NAME[vid] || ''] : null, name ? [null, Brand.family(name)] : null, a?.done && a.model ? [null, a.tier ? TIER_CN[a.tier] || a.tier : (a.partial ? '?' : '标准')] : null];
    reels.forEach((r, i) => {
      const v = r.querySelector('.reel-v'), w = r.querySelector('.reel-w');
      if (!a) { r.className = 'reel'; v.innerHTML = ''; v.textContent = '—'; return; }
      const val = vals[i];
      if (!val) { r.className = 'reel spin'; v.innerHTML = ''; v.textContent = ['GPT · Claude · Gemini · Grok · Kimi', 'opus · astra · flash · k3', 'high · max · xhigh'][i]; return; }
      const was = r.classList.contains('spin');
      r.className = 'reel' + (was ? ' land' : ''); r.style.setProperty('--d', (i * 0.12) + 's');
      v.innerHTML = (val[0] || '') + '<span></span>'; v.lastChild.textContent = val[1] || '—';
      void w.offsetWidth;
    });
  },
};
Bus.on('gacha', () => { if (GView.el) { clearTimeout(GView.t); GView.t = setTimeout(() => GView.update(), 60); } UI.renderGachaBadge?.(); });
setInterval(() => { if (GView.el && Gacha.busy()) GView.update(); }, 500);
