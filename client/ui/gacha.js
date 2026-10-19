// Model catalog, vendor metadata, and concurrent session dispatch controller
const noVertex = n => typeof n === 'string' ? n.replace(/-vertex(?=$|[-_\s·])/ig, '').replace(/-public(?=$|[\s·])/ig, '') : n;

// ---------- 厂商 ----------
const Brand = (() => {
  const LIST = [
    ['openai', /gpt|chatgpt|openai|codex|dall-?e|\bo[134](?:-mini|-pro)?\b/i],
    ['anthropic', /claude|anthropic|\bopus\b|\bsonnet\b|\bhaiku\b|\bfable\b/i],
    ['google', /gemini|gemma|\bbard\b|google/i],
    ['xai', /grok|\bxai\b/i],
    ['moonshot', /kimi|moonshot/i],
    ['deepseek', /deepseek/i],
    ['qwen', /qwen|qwq|tongyi/i],
    ['zhipu', /\bglm|chatglm|zhipu/i],
    ['xiaomi', /\bmimo/i],
    ['bytedance', /doubao|\bseed-?\d/i],
    ['minimax', /minimax|\babab/i],
    ['mistral', /mistral|mixtral|codestral|magistral|devstral/i],
    ['meta', /llama|\bmeta\b|\bmuse\b/i],
  ];
  const NAME = { openai: 'GPT', anthropic: 'Claude', google: 'Gemini', xai: 'Grok', moonshot: 'Kimi', deepseek: 'DeepSeek', qwen: 'Qwen', zhipu: 'GLM', xiaomi: 'MiMo', bytedance: 'Doubao', minimax: 'MiniMax', mistral: 'Mistral', meta: 'Llama' };
  // 代号模型（名字里看不出厂商）：从平台路由 / 协议适配器学到的厂商。例：barium-bb-v2 走 Google 自家接口（googleWithThoughtSignatures / google.generative-ai）→ Gemini
  const learned = Object.assign({ barium: 'google' }, Store.get('brand:learn', {}));
  const OF_M = new Map();
  let LRE = null; const mkRe = () => { OF_M.clear(); const ks = Object.keys(learned).filter(k => /^[a-z][a-z0-9]{2,15}$/.test(k)); LRE = ks.length ? new RegExp('(?:^|[^a-z0-9])(' + ks.join('|') + ')(?=$|[^a-z])', 'i') : null; }; mkRe();
  const of0 = t => { for (const [id, re] of LIST) if (re.test(t)) return id; const m = LRE && LRE.exec(t); return m ? learned[m[1].toLowerCase()] || '' : ''; };
  const of = t => { t = String(t || ''); if (!t) return ''; let v = OF_M.get(t); if (v === undefined) { v = of0(t); if (OF_M.size > 8000) OF_M.clear(); OF_M.set(t, v); } return v; };
  // 平台 → 厂商：只认 Google 自家的 Gemini 接口；Vertex 上的 Claude（googleVertexAnthropic…、vertex.anthropic）不算
  const vendorOfRoute = (...rs) => { const r = rs.filter(Boolean).join(' '); if (!r || /anthropic|claude|openai|xai|mistral|meta|llama/i.test(r)) return ''; return /googleWithThought|google\.generative-ai|google\.vertex\.chat|\bgemini/i.test(r) ? 'google' : ''; };
  function learn(name, ...routes) {
    const n = String(name || '').trim().replace(/^models\//i, ''); if (!n || of(n)) return '';
    const v = vendorOfRoute(...routes), k = (/^([a-z][a-z0-9]{2,15})(?=$|[-_])/i.exec(n) || [])[1]?.toLowerCase();
    if (!v || !k || /^(none|minimal|low|medium|high|xhigh|max|model|models|agent|chat)$/.test(k) || learned[k] === v) return v;
    learned[k] = v; Store.set('brand:learn', Object.fromEntries(Object.entries(learned).filter(([x]) => x !== 'barium' || learned[x] !== 'google'))); mkRe(); return v;
  }
  const TOKS_M = new Map();
  const toks = t => { t = String(t || ''); let v = TOKS_M.get(t); if (!v) { v = toks0(t); if (TOKS_M.size > 8000) TOKS_M.clear(); TOKS_M.set(t, v); } return v.slice(); };
  const toks0 = t => String(t || '').toLowerCase().replace(/^#\d+\s*/, '').replace(/\/\d+-\d+-\d+:\d+$/, '').replace(/(\d)([a-z])/g, '$1-$2').replace(/([a-z])(\d)/g, '$1-$2').split(/[^a-z0-9]+/).filter(Boolean);
  // 版本号：第一个 1–2 位数字 + 紧随的次版本（opus-5.5 → 5.05、gpt-6 → 6）
  const version = t => { const k = toks(t); const i = k.findIndex(x => /^\d{1,2}$/.test(x)); if (i < 0) return null; const minor = /^\d{1,2}$/.test(k[i + 1] || '') ? +k[i + 1] : 0; return +k[i] + minor / 100; };
  const VPRE = /^(?:[\w.-]+\/)?(?:gpt|chatgpt|claude|gemini|grok|kimi|qwen|deepseek|mimo|glm|llama|mistral|doubao|minimax)(?:[-_ ]+(?=[\w])|(?=\d))/i;
  const short = n => { n = noVertex(String(n || '')).trim(); if (!of(n)) return n; let r = n.replace(VPRE, ''); if (/^k\d/.test(r)) r = 'K' + r.slice(1); return r || n; };
  const TIERS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  const tierOf = n => (/-(none|minimal|low|medium|high|xhigh|max)$/i.exec(noVertex(String(n || '')).replace(/\/\d+-\d+-\d+:\d+$/, '').replace(/-(agent|public)$/i, '')) || [])[1]?.toLowerCase() || null;
  // 型号（去厂商前缀和档位）：claude-opus-5-high → opus-5
  const family = n => { const s = short(n); let r = s.replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, ''); try { const c = /-([a-z][a-z0-9]{2,15})$/i.exec(r); if (c && Strength.codes.has(c[1].toLowerCase())) r = r.slice(0, -c[0].length); } catch {} return r || s; };
  return { of, NAME, version, short, family, tierOf, TIERS, toks, learn, vendorOfRoute, learnedOf: t => { const m = LRE && LRE.exec(String(t || '')); return m && !LIST.some(([, re]) => re.test(String(t))) ? learned[m[1].toLowerCase()] || '' : ''; } };
})();

// ---------- 厂商图标（与油猴脚本一致）----------
const VIcon = (() => {
  const ICON_PATH = {"openai": "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z", "anthropic": "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z", "google": "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81", "xai": "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"};
  // Vendors outside the five targets get a coloured monogram badge (logo only; not selectable as a target).
  const BADGE = { deepseek: ['#4d6bfe', 'D'], qwen: ['#615ced', 'Q'], zhipu: ['#3859ff', 'Z'], xiaomi: ['#ff6900', 'Mi'], bytedance: ['#1e6fff', '豆'], minimax: ['#e73562', 'M'], mistral: ['#fa520f', 'M'], meta: ['#0467df', '∞'] };
  const badge = (id, size) => { const [bg, t] = BADGE[id]; return '<svg class="gpVIcon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="' + bg + '"/><text x="12" y="12" dy=".36em" text-anchor="middle" font-size="' + (t.length > 1 ? 10 : 13) + '" font-weight="700" font-family="system-ui,-apple-system,Segoe UI,sans-serif" fill="#fff">' + t + '</text></svg>'; };
  const vendorIcon = (id, size = 14) => BADGE[id] ? badge(id, size) : ICON_PATH[id] ? '<svg class="gpVIcon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + ICON_PATH[id] + '"/></svg>'
    : id === 'moonshot' ? '<svg class="gpVIcon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 3h3.6v7.6L14.2 3h4.5l-7.1 7.9L19.4 21h-4.6l-5.8-7.6-1.4 1.5V21H4z"/><circle cx="20.5" cy="3.5" r="1.8" fill="#2f6fed"/></svg>'
    : '<svg class="gpVIcon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></svg>';
  return { html: vendorIcon, el: (id, size = 14) => { const s = document.createElement('span'); s.className = 'vicon'; s.innerHTML = vendorIcon(id, size); return s; } };
})();

// ---------- 实时排名：同源读取 /leaderboard/agent（公开页面），缓存 6 小时；下面是兜底快照 ----------
const Ranking = (() => {
  const TTL = 6 * 3600000;
  const LEGACY_FALLBACK = ["Claude Fable 5.1 (Max)", "GPT 6 Astra (Max)", "Claude Opus 5 (High)", "Claude Opus 5 (Max)", "Claude Fable 5 (High)", "Claude Opus 4.8 (High)", "GPT 5.6 Sol (xHigh)", "Kimi K3 (Max)", "Claude Sonnet 5 (High)", "GPT 5.5 (xHigh)", "Hy4 preview", "Deepseek V4.1 Flash (Max)", "Gemini 3.8 Flash (High)", "GLM 5.2 (Max)", "Muse Spark 1.3 (Max)", "DeepSeek V4 Pro (High)", "Qwen3.8 Max", "GLM 5.3 (Max)", "Grok 4.5", "GPT 5.5", "Grok 4.6 (xHigh)", "Deepseek V4 Flash (High)", "GPT 5.6 Terra (xHigh)", "GPT 5.4 (High)", "GLM 5.3 Flash", "Qwen3.8 Flash Next", "GPT 5.6 Luna (xHigh)", "Gemini 3.7 Flash (High)", "Qwen 3.8 27B", "DeepSeek V4 Pro", "Claude Sonnet 4.6", "Muse Spark 1.2 (xHigh)", "Muse Spark 1.1", "Qwen3.7 Max", "Hy3", "Mimo V2.5 Pro", "Minimax M3", "Gemini 3.1 Pro Preview", "Gemini 3.6 Flash (High)", "Qwen3.7 Plus", "Inkling Small", "Inkling", "Mistral Medium 3.5", "Minimax M2.7", "Gemini 3.5 Flash Lite", "Solar Pro 4"];
  const OFFICIAL_FALLBACK = [
    "Claude Opus 4.6 (thinking-max)", "GPT-5.4 (xhigh)", "Claude Opus 4.6 (thinking-auto)", "Claude Opus 4.7 (xhigh)",
    "Claude Opus 4.5 (thinking-32k)", "Claude Sonnet 4.6 (thinking-max)", "GPT-5.2 (xhigh)", "GLM-5.1",
    "Claude Opus 4.6", "Claude Sonnet 4.6 (thinking-auto)", "MiniMax-M2.7", "GLM-5",
    "Claude Opus 4.5", "Claude Sonnet 4.6", "Gemini 3.1 Pro Preview", "Claude Sonnet 4.5 (thinking-32k)",
    "GPT-5.4 (high)", "Kimi K2.5 (Thinking)", "Gemini 3 Flash Preview", "GPT-5.3-Codex (xhigh)",
    "Grok 4.20 Beta1", "Qwen3.5-397B-A17B", "MiMo-V2-Pro", "DeepSeek-V3.2-Thinking",
    "GPT-5.4-mini (high)", "MiniMax-M2.5", "Claude Haiku 4.5 (thinking-32k)", "Gemini 3 Flash Preview (minimal)",
    "Mistral Large 3", "GLM-4.7", "Kimi K2.5 (Instant)", "DeepSeek-V3.2",
    "GPT-5.2", "Claude Sonnet 4.5", "GPT-5.4-nano (high)", "Gemini 3.1 Flash-Lite Preview",
    "KAT-Coder-Pro-V1", "Claude Haiku 4.5", "Qwen3-Coder-480B-A35B", "Devstral-2-123B-Instruct-2512",
    "Gemini 2.5 Pro", "Grok 4.1 Fast Reasoning", "GPT-5.1-Codex-Max (medium)", "NVIDIA Nemotron 3 Super 120B",
    "GLM-4.7-Flash", "GPT-5.1-Codex", "MiMo-V2-Flash (thinking)", "Qwen3-Coder-Next",
    "GPT-5.1-Codex-Mini", "Gemini 2.5 Flash", "Devstral-Medium-2507"
  ];
  const DEFAULT_CATALOG_AT = Date.parse('2026-10-16T06:00:00.000Z') || 1792130400000;
  const TIER = /^(none|minimal|low|medium|high|xhigh|max|thinking|auto|instant|preview)$/;
  let list = null, legacyList = null, at = DEFAULT_CATALOG_AT, loading = false, rev = 0, failAt = 0, src = 'builtin';
  const build = (names, rowsMeta) => names.map((n, i) => {
    const clean = String(n || '').replace(/\((\d{4,})\)/g, '');
    const t = Brand.toks(clean), tier = t.filter(x => TIER.test(x));
    const meta = Array.isArray(rowsMeta) ? rowsMeta[i] : null;
    return {
      rank: meta?.leaderboardRank > 0 && meta.leaderboardRank < 900 ? meta.leaderboardRank : (i + 1),
      name: n,
      id: meta?.id || '',
      org: meta?.org || '',
      inputPerMillion: meta?.inputPerMillion ?? null,
      outputPerMillion: meta?.outputPerMillion ?? null,
      cacheReadPerMillion: meta?.cacheReadPerMillion ?? null,
      cacheWritePerMillion: meta?.cacheWritePerMillion ?? null,
      p50: meta?.agentTaskCostP50 ?? null,
      samples: meta?.agentTaskSamples ?? null,
      scoreGen: meta?.modelGenerationScore ?? null,
      base: t.filter(x => !TIER.test(x)),
      tier: tier[0] || ''
    };
  }).filter(e => e.base.length);
  legacyList = build(LEGACY_FALLBACK);

  function syncFromCatalog() {
    try {
      if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.catalogRows === 'function') {
        const rows = BillingProbe.catalogRows().slice().filter(r => r && (r.label || r.id));
        if (rows.length > 10) {
          rows.sort((a, b) => ((a.leaderboardRank > 0 ? a.leaderboardRank : 999) - (b.leaderboardRank > 0 ? b.leaderboardRank : 999)) || ((b.modelGenerationScore || 0) - (a.modelGenerationScore || 0)));
          const meta = typeof BillingProbe.catalogMeta === 'function' ? BillingProbe.catalogMeta() : BillingProbe.catalogMeta;
          const catAt = meta?.at ? Date.parse(meta.at) : DEFAULT_CATALOG_AT;
          list = build(rows.map(r => r.label || r.id), rows);
          if (Number.isFinite(catAt) && catAt > 0) at = Math.max(at || 0, catAt);
          if (src === 'builtin' && meta?.origin === 'live-sync') src = 'live';
          return true;
        }
      }
    } catch {}
    return false;
  }

  {
    const c = Store.get('rank', null);
    if (Array.isArray(c?.names) && c.names.length > 5 && !c.names.some(n => /Fable|Astra|Inkling/i.test(n))) {
      list = build(c.names);
      at = c.at || DEFAULT_CATALOG_AT;
      src = 'cache';
    }
  }
  if (!syncFromCatalog() && !list) {
    list = build(OFFICIAL_FALLBACK);
    at = DEFAULT_CATALOG_AT;
  }

  function parse(html) {
    const out = [];
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const tr of doc.querySelectorAll('table tbody tr')) {
        const cells = tr.querySelectorAll('td'); if (cells.length < 3) continue;
        const cell = [...cells].slice(0, 3).find(c => c.querySelector('a[href^="http"]') || /·/.test(c.textContent || '')); if (!cell) continue;
        const link = cell.querySelector('a'); let name = (link?.textContent || '').trim();
        if (!name) name = [...cell.querySelectorAll('*')].filter(e => !e.children.length).map(e => (e.textContent || '').trim()).find(t => t && !t.includes('·')) || '';
        if (name && name.length < 80) out.push(name);
      }
    } catch {}
    if (out.length <= 5 && typeof ArenaCatalogSync !== 'undefined' && typeof ArenaCatalogSync.parseAgentLeaderboard === 'function') {
      try {
        const parsed = ArenaCatalogSync.parseAgentLeaderboard(html);
        if (parsed?.rows?.length > 5) {
          for (const r of parsed.rows) {
            const nm = String(r.label || r.key || '').trim();
            if (nm && !out.includes(nm)) out.push(nm);
          }
        }
      } catch {}
    }
    return out;
  }
  async function refresh(force = false) {
    if (loading || (!force && now() - at < TTL && src === 'live') || (!force && now() - failAt < 300000)) return;
    loading = true;
    try {
      let html = '';
      // 优先走 Next.js RSC Flight 协议流拉取（载荷体积小 85%+，无需完整 SSR HTML），失败自动回退标准 HTML
      if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
        try {
          const pr = await Host.protoFetch('/leaderboard/agent', {
            method: 'GET',
            accept: 'text/x-component, text/html;q=0.9, */*;q=0.8',
            headers: { RSC: '1', 'Next-Url': '/leaderboard/agent' },
            referer: 'https://arena.ai/leaderboard/agent',
            timeout: 12000,
          });
          if (pr && pr.ok && pr.text && pr.text.length > 500 && !/Verify you are human|Just a moment/i.test(pr.text.slice(0, 2000))) {
            html = pr.text;
          }
        } catch {}
      }
      if (!html) {
        const res = await rawFetch('/leaderboard/agent', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'text/x-component, text/html;q=0.9, */*;q=0.8', RSC: '1', 'Next-Url': '/leaderboard/agent' },
        }).catch(() => null) || await rawFetch('/leaderboard/agent', { credentials: 'same-origin', cache: 'no-store' });
        if (res && res.ok) html = await res.text();
      }
      let ok = false;
      if (html) {
        Bus.emit('agent-catalog', html);
        const names = parse(html);
        if (names.length > 5) {
          if (!syncFromCatalog()) list = build(names);
          at = now(); rev++; src = 'live';
          Store.set('rank', { names: list.map(x => x.name), at });
          ok = true;
          Bus.emit('rank');
        } else if (syncFromCatalog()) {
          at = now(); rev++; src = 'live';
          Store.set('rank', { names: list.map(x => x.name), at });
          ok = true;
          Bus.emit('rank');
        }
      }
      if (!ok) {
        failAt = now();
        if (force) { syncFromCatalog(); at = now(); rev++; Bus.emit('rank'); }
      }
    } catch {
      failAt = now();
      if (force) { syncFromCatalog(); at = now(); rev++; Bus.emit('rank'); }
    } finally { loading = false; }
  }
  const find = (hay, needle) => { for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((x, j) => hay[i + j] === x)) return true; return false; };
  // 越小越强：同系列 = 名次（档位一致再减 0.5）；未上榜的同族 = 100 + 名次；其他 = 1000
  function score(title) {
    const t = Brand.toks(title); let best = null;
    const pool = [...(list || []), ...(legacyList || [])];
    for (const e of pool) if (find(t, e.base)) { const sc = e.rank - (e.tier && t.includes(e.tier) ? 0.5 : 0) - e.base.length * 0.001; if (!best || e.base.length > best.len || (e.base.length === best.len && sc < best.sc)) best = { sc, len: e.base.length }; }
    if (best) return best.sc;
    const fam = pool.find(e => e.base.length >= 2 && find(t, e.base.slice(0, 2)));
    return fam ? 100 + fam.rank : 1000;
  }
  const TIER_RANK = { max: 6, xhigh: 5, high: 4, medium: 3, low: 2, minimal: 1, none: 0 };
  const tier = title => { let b = 0; for (const x of Brand.toks(title)) if (TIER_RANK[x] > b) b = TIER_RANK[x]; return b; };
  const family = title => score(Brand.toks(title).filter(x => !TIER.test(x)).join('-'));
  const updatedAt = () => {
    if (at > 0) return at;
    try {
      const catAt = Date.parse(BillingProbe?.catalogMeta?.()?.at || '');
      if (Number.isFinite(catAt) && catAt > 0) return catAt;
    } catch {}
    return DEFAULT_CATALOG_AT;
  };
  return { score, tier, family, refresh, syncFromCatalog, updatedAt, list: () => { if (!list || list.length < 48) syncFromCatalog(); return list.slice(); }, get src() { return src; }, get rev() { return rev; }, get at() { return updatedAt(); }, get size() { return list ? list.length : 0; }, get top() { return (list || []).slice(0, 12).map(e => e.name); } };
})();

// ---------- 抽卡引擎 ----------
// 每一抽 = 直接调用 create-chat 新建对话（带 reCAPTCHA v3 令牌）→ 实时通道里一出现运行令牌就读 Trigger 记录识别模型
// （厂商 / 型号约 9–12 秒，带档位的内部名再晚 1–3 秒）→ 命中 / 保留 / 归档。急速并行：前台连续开新对话，后台最多 N 路同时识别。
// 从不绕过人机验证：reCAPTCHA 分数不够时放慢节奏，连续失败才请你手动完成一次官方验证。
const Gacha = (() => {
  const QUANTITIES = [5, 15, 30];   // 滑杆四档：5 / 15 / 30 / ∞（最高档 = 持续抽卡，不再单独设开关）
  const VENDORS = [
    { id: 'openai', name: 'GPT', lab: 'OpenAI', kw: ['gpt'] },
    { id: 'anthropic', name: 'Claude', lab: 'Anthropic', kw: ['claude'] },
    { id: 'google', name: 'Gemini', lab: 'Google', kw: ['gemini'] },
    { id: 'xai', name: 'Grok', lab: 'xAI', kw: ['grok'] },
    { id: 'moonshot', name: 'Kimi', lab: 'Moonshot', kw: ['kimi'] },
  ];
  const vendorBy = id => VENDORS.find(v => v.id === id) || null;
  const DEFAULTS = {
    vendor: '', customKeyword: '', archiveKeywords: ['super', 'GLM', 'deepseek', 'qwen', 'doubao', 'gpt-5.5', 'spark', 'grok-4.5'],
    mode: 'habit', /* legacy default mode: 'autoqa' */ preferredKeywords: ['6-astra','opus-5.5','fable'], fingerprint: false, skipCompatThinking: true, archiveOn: true, prompt: 'Reply with only the number 9. Do not use any tools.', maxAttempts: 5, intervalMs: 800, stopOnThinking: true, sortSidebar: true, turbo: true, parallel: 3, endless: false, stopOnHit: false, notifyHit: false,
  };
  const TURBO_GAP = 10000; // 急速模式两次新建对话至少间隔 10 秒（更密会被 reCAPTCHA 拦）
  const REASONS = {
    RATE_LIMIT: '请求受到限流（HTTP 429）',
    AUTH: '登录状态失效（HTTP 401/403），请重新登录',
    HTTP: '新建对话失败',
    CAPTCHA: '人机验证一直未通过，抽卡已停止（请手动完成一次验证后重新开始）',
    QUOTA: '额度不足，抽卡已停止',
    PROMPT: '提示词生成失败，未发送消息',
    SKIPS: '连续 8 次未能完成一抽，抽卡已停止',
    RELOADED: '界面已重新载入，本次抽卡已结束（再点「开始」从 0 开始）',
  };
  const list = (v, d) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string').map(x => x.trim()).filter(x => x && x.length <= 200))].slice(0, 60) : [...d];

  // ----- 设置：每个账号各自独立（宿主按账号保存 gacha@<账号id>），改一个账号不会影响别的账号 -----
  // 本账号：localStorage 'gacha' 做缓存；其他账号（账号菜单里的抽卡按钮）：remote 缓存，打开面板 / 菜单时从宿主读
  const ME = () => UI.host?.account?.id || '';
  const mine = id => !id || id === ME();
  const remote = new Map();
  const rawOf = id => mine(id) ? (Store.get('gacha', {}) || {}) : (remote.get(id) || remote.get('~seed') || {});
  const okObj = v => v && typeof v === 'object' && !Array.isArray(v);
  // ----- 归档黑名单同步：开启后所有账号共用一份黑名单（宿主保存 archbl = {sync, keywords, on}），改任何一个账号都同步到全部 -----
  let bl = Store.get('archbl', null);
  const blOn = () => !!(bl && bl.sync);
  async function pullBl() { try { const v = await Host.shared?.('archbl'); if (okObj(v)) { bl = v; Store.set('archbl', v); } return true; } catch { return false; } }
  function pushBl() { Store.set('archbl', bl); try { Host.shared?.('archbl', bl)?.catch?.(() => {}); } catch {} }
  async function setSync(on, acct) {
    await pullBl();
    const cur = settings(acct);
    if (on) { bl = { sync: true, keywords: cur.archiveKeywords, on: cur.archiveOn, at: now() }; pushBl(); Bus.emit('gacha'); return; }
    // 关闭：各账号保留关闭时的这份黑名单（之后各改各的）
    const kw = cur.archiveKeywords, onv = cur.archiveOn;
    bl = { ...(bl || {}), sync: false, at: now() }; pushBl();
    const ids = new Set([ME()]); try { for (const a of await Host.listAccounts(true) || []) if (a?.id) ids.add(a.id); } catch {}
    for (const id of ids) {
      if (!id) continue;
      if (mine(id)) { save({ archiveKeywords: kw, archiveOn: onv }); continue; }
      try { let v = await Host.shared('gacha@' + id); if (!okObj(v)) v = {}; const nx = { ...v, archiveKeywords: kw, archiveOn: onv }; remote.set(id, nx); await Host.shared('gacha@' + id, nx); } catch {}
    }
    Bus.emit('gacha');
  }
  async function pullOwn() {
    const pulled = await pullBl();
    // 默认「所有账号同步黑名单」：从没设置过（本机和宿主都没有记录）就按开启处理，用当前这份黑名单做共享初始值（读取失败时不动，免得盖掉已有设置）
    if (!bl && pulled) { const cur = settings(); bl = { sync: true, keywords: cur.archiveKeywords, on: cur.archiveOn, at: now() }; pushBl(); }
    const me = ME(); if (!me || !Host.shared) return;
    try {
      let v = await Host.shared('gacha@' + me);
      if (okObj(v)) {
        if (!Store.get('gacha:habit_def_' + me, false)) {
          Store.set('gacha:habit_def_' + me, true);
          if (!v.mode || v.mode === 'autoqa' || v.mode === 'fingerprint') {
            v = { ...v, mode: 'habit', fingerprint: false };
            Host.shared('gacha@' + me, v)?.catch?.(() => {});
          }
        }
        Store.set('gacha', v);
      } else {
        const g = await Host.shared('gacha').catch(() => null), seed = okObj(g) ? g : Store.get('gacha', null);
        if (okObj(seed)) {
          const nextSeed = (!seed.mode || seed.mode === 'autoqa' || seed.mode === 'fingerprint') ? { ...seed, mode: 'habit', fingerprint: false } : seed;
          Store.set('gacha', nextSeed);
          Host.shared('gacha@' + me, nextSeed)?.catch?.(() => {});
        }
      }
    } catch {}
    Bus.emit('gacha');
  }
  async function loadAcct(id) {
    if (mine(id)) return pullOwn();
    try { let v = await Host.shared('gacha@' + id); if (!okObj(v)) { v = await Host.shared('gacha').catch(() => null); if (!okObj(v)) v = {}; } remote.set(id, v); } catch {}
  }
  if (!Store.get('gacha:mode_mig_20261020_habit', false)) {
    Store.set('gacha:mode_mig_20261020_habit', true);
    try {
      const curG = Store.get('gacha', null);
      if (curG && typeof curG === 'object' && (!curG.mode || curG.mode === 'fingerprint' || curG.mode === 'autoqa')) {
        Store.set('gacha', { ...curG, mode: 'habit', fingerprint: false });
      }
    } catch {}
  }
  function settings(id) {
    const s = rawOf(id);
    const mode = ['habit','autoqa','svg','custom','fingerprint'].includes(s.mode) ? s.mode : s.fingerprint === true ? 'fingerprint' : 'habit';
    const customKeyword = typeof s.customKeyword === 'string' ? s.customKeyword.trim().slice(0, 60) : '';
    const vendor = vendorBy(s.vendor) ? s.vendor : (s.vendor === 'custom' && customKeyword ? 'custom' : '');
    const v = vendorBy(vendor);
    return {
      mode, preferredKeywords: GachaPrompts.keywords(s.preferredKeywords ?? GachaPrompts.DEFAULT_PREFERRED),
      fingerprint: mode === 'fingerprint', skipCompatThinking: s.skipCompatThinking !== false,
      vendor, customKeyword, targetName: v ? v.name : vendor === 'custom' ? customKeyword : '', targetKeywords: v ? [...v.kw] : vendor === 'custom' ? [customKeyword] : [],
      archiveKeywords: list(s.archiveKeywords, DEFAULTS.archiveKeywords), archiveOn: typeof s.archiveOn === 'boolean' ? s.archiveOn : true,
      prompt: typeof s.prompt === 'string' && s.prompt.trim() ? s.prompt.slice(0, 4000) : DEFAULTS.prompt,
      maxAttempts: QUANTITIES.includes(s.maxAttempts) ? s.maxAttempts : DEFAULTS.maxAttempts,
      intervalMs: Number.isFinite(s.intervalMs) ? Math.max(0, Math.min(86400000, Math.round(s.intervalMs))) : DEFAULTS.intervalMs,
      stopOnThinking: s.stopOnThinking !== false, sortSidebar: s.sortSidebar !== false, turbo: mode === 'fingerprint' ? false : s.turbo !== false,
      parallel: mode === 'fingerprint' ? 1 : [1, 2, 3, 4, 5].includes(s.parallel) ? s.parallel : DEFAULTS.parallel, endless: s.endless === true, stopOnHit: s.stopOnHit === true, notifyHit: s.notifyHit === true,
      minStr: ['strong', 'top'].includes(s.minStr) ? s.minStr : '', slot: s.slot === true,
      // 强度分抽卡（推测为 Claude 的新对话）：'' 不用；keep = 只要满意（high / max 水平）；ok = 满意或勉强（medium 水平也要）
      csMode: '',   // 强度分抽卡已移除（强度分并入推理分）
      csKeep: Number.isFinite(+s.csKeep) && +s.csKeep > 0 ? Math.min(10000, Math.round(+s.csKeep)) : 7000,
      csOk: Number.isFinite(+s.csOk) && +s.csOk > 0 ? Math.min(10000, Math.round(+s.csOk)) : 5500,
      ...(blOn() ? { archiveKeywords: list(bl.keywords, DEFAULTS.archiveKeywords), archiveOn: bl.on !== false } : {}),
      archSync: blOn(),
    };
  }
  function save(patch, acct) {
    // 同步开着：黑名单改的是所有账号共用的那份
    if (blOn() && ('archiveKeywords' in patch || 'archiveOn' in patch)) {
      patch = { ...patch }; bl = { ...bl, at: now() };
      if ('archiveKeywords' in patch) { bl.keywords = list(patch.archiveKeywords, []); delete patch.archiveKeywords; }
      if ('archiveOn' in patch) { bl.on = !!patch.archiveOn; delete patch.archiveOn; }
      pushBl();
    }
    if ('mode' in patch) patch = {...patch, fingerprint:patch.mode === 'fingerprint'};
    else if ('fingerprint' in patch) patch = {...patch, mode:patch.fingerprint ? 'fingerprint' : 'habit'};
    const next = { ...rawOf(acct), ...patch };
    if (mine(acct)) { Store.set('gacha', next); const me = ME(); if (me) try { Host.shared('gacha@' + me, next)?.catch?.(() => {}); } catch {} }
    else { remote.set(acct, next); try { Host.shared('gacha@' + acct, next)?.catch?.(() => {}); } catch {} }
    Bus.emit('gacha'); return settings(acct);
  }
  function setVendor(id, keyword, acct) {
    if (id === 'custom') { const k = String(keyword || '').trim().slice(0, 60); return save(k ? { vendor: 'custom', customKeyword: k } : { vendor: '' }, acct); }
    return save({ vendor: vendorBy(id) ? id : '' }, acct);
  }
  // 关键词匹配：不分大小写，「. _ 空格 /」都当成「-」（gpt-5.5 能匹配 gpt-5-5 / GPT 5.5），并去掉 -vertex 等后缀的影响
  const norm = t => String(t || '').toLowerCase().replace(/[\s._/:]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const has = (name, words) => { const n = norm(name), n2 = String(name || '').toLowerCase(); return words.some(w => { const k = norm(w); return !!k && (n.includes(k) || n2.includes(String(w).toLowerCase().trim())); }); };
  // 目标强度：'' 不限；strong = 高于 medium（金色候选）；top = xhigh 及以上。还没校准的代号先算命中（可能很强，测过后自动归位）
  function strOk(name, min) {
    if (!min) return true;
    const lv = Strength.level(name), p = Strength.parts(name);
    if (lv == null) return !!p.tier && !/^(none|minimal|low|medium|high|xhigh|max)$/.test(p.tier);
    return min === 'top' ? lv >= 4.75 : lv > 3.25;
  }
  const csOn = () => false; // Draw modes never silently replace custom/SVG prompts with the legacy CS probe.
  function classify(id, s) {
    const api=id.fingerprint?.apiIdentity;
    const actual=api?.name||id.name;
    const all = api ? api.name : [id.name, id.internal, id.request, id.response].filter(Boolean).join(' ');
    // 代号模型按学到的厂商算（例：barium-bb-v2 → Gemini），目标厂商选 Gemini 时也算命中
    const learnedHit = !!s.vendor && Brand.learnedOf(actual) === s.vendor && (vendorBy(s.vendor)?.kw || []).some(k => s.targetKeywords.some(w => String(w).toLowerCase() === k));
    const match = s.targetKeywords.length && (has(all, s.targetKeywords) || learnedHit);
    if (id.fingerprint?.stopConfirmed===true && ['visible-thinking','compat-thinking'].includes(id.fingerprint.skipped)) return 'archive';
    if (s.skipCompatThinking !== false && !match && (/^(?:开源模型|open-source|compat)/i.test(String(actual || '').replace(/[?？]+$/, '')) || /open-source\/generic/i.test(String(id.internal || '')))) return 'archive';
    if (id.fingerprint) return Fingerprint.classify(id, s, match);
    // 强度分抽卡：推测结果按 cscore.js 的判定（满意 / 勉强 / 换）；排除像 sonnet / fable 的
    if (match && id.guess && csOn(s)) {
      const v = id.cs ? Calib.verdict(id.cs, { keep: s.csKeep, ok: s.csOk }) : { action: 'retry', why: '这一轮没打出分（被停止或没抓到回复）' }; id.csv = v;
      if (v.action === 'keep' || (v.action === 'ok' && s.csMode === 'ok')) return 'hit';
      if (v.action === 'ok') return 'keep';
      return s.archiveOn ? 'archive' : 'keep';
    }
    // 推测结果没有档位：「目标强度」没法满足
    if (match && strOk(id.name, s.minStr)) return 'hit';
    return s.archiveOn && has(all, s.archiveKeywords) ? 'archive' : 'keep';
  }

  // ----- 运行状态（按账号保存；界面重载后：持续抽卡自动接着抽，普通抽卡视为结束）-----
  let run = Store.get('gacha:run', null), token = 0, rev = 0, saveT = 0;
  const flights = new Set();
  if (run && Array.isArray(run.attempts)) {
    for (const a of run.attempts) if (!a.done) { a.done = true; a.verdict = 'abandoned'; a.note = '界面重载中断'; }
    // 持续抽卡：重载后总是继续；有次数的抽卡：刚被打断（页面崩溃 / 被系统回收后重开，10 分钟内）也接着抽完剩下的
    if (run.status === 'running' && (run.settings?.endless || now() - (run.touched || run.startedAt || 0) < 10 * 60e3)) run.autoResume = true;
    else if (['running', 'stopping'].includes(run.status)) { run.status = 'stopped'; run.code = 'RELOADED'; run.reason = REASONS.RELOADED; run.phase = ''; run.endedAt = run.endedAt || now(); }
  } else run = null;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (run) { run.touched = now(); run.log = run.log.slice(-300); run.attempts = run.attempts.slice(-300); Store.set('gacha:run', run); } else Store.del('gacha:run'); }, 300); };
  function changed() { rev++; persist(); Bus.emit('gacha'); }
  function log(text, level = 'info') { if (!run) return; run.log.push({ at: now(), level, text: String(text).slice(0, 300) }); if (run.log.length > 400) run.log.splice(0, run.log.length - 400); changed(); }
  const phase = text => { if (run && run.phase !== text) { run.phase = text; changed(); } };
  class Stop extends Error { constructor(code, detail, kind = 'fatal') { super(REASONS[code] ? REASONS[code] + (detail ? ' · ' + detail : '') : detail || code); this.code = code; this.kind = kind; } }
  const fatal = (code, detail) => { throw new Stop(code, detail, 'fatal'); };
  const skip = detail => { throw new Stop('SKIP', detail, 'skip'); };
  const alive = my => my === token && run && run.status === 'running';
  async function waitFor(fn, ms, my, step = 200) { const end = now() + ms; for (;;) { if (my !== undefined && !alive(my)) throw new Stop('CANCEL', '', 'cancel'); const v = fn(); if (v) return v; if (now() >= end) return null; await sleep(step); } }
  const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return t >= 3600 ? Math.floor(t / 3600) + ' 小时 ' + Math.floor(t % 3600 / 60) + ' 分' : t >= 60 ? Math.floor(t / 60) + ' 分 ' + (t % 60) + ' 秒' : t + ' 秒'; };

  // ----- 发送节奏：两次新建对话的最小间隔（按真正发出的时刻算）-----
  // 人机验证频率（按账号 + 出口 IP 记最近 30 分钟）：触发越多，两抽之间等得越久，减少被要求验证
  const CAP_WIN = 30 * 60e3;
  const capKey = () => (UI.host?.account?.id || '') + '|' + (IP.ip || '');
  function capNote() {
    const all = Store.get('gacha:capstat', {}) || {}, t = now(), k = capKey();
    for (const x of Object.keys(all)) { all[x] = (all[x] || []).filter(v => t - v < CAP_WIN); if (!all[x].length) delete all[x]; }
    (all[k] ||= []).push(t); Store.set('gacha:capstat', all); return all[k].length;
  }
  function capRecent() { const l = (Store.get('gacha:capstat', {}) || {})[capKey()] || [], t = now(); return l.filter(v => t - v < CAP_WIN).length; }
  const capFloor = n => n >= 6 ? 60000 : n >= 3 ? 30000 : n >= 1 ? 12000 : 0;
  // 滑动时间窗主动防 429 节流：控制 60s 内最大 POST 密度与突发最小间隔，抽卡主动避开 429
  const gachaPostWindow = [];
  async function paceGachaPost(myOrSignal, isFollowup = false) {
    const checkAbort = () => {
      if (typeof myOrSignal === 'number') { if (!alive(myOrSignal)) throw new Stop('CANCEL', '', 'cancel'); }
      else if (myOrSignal?.aborted) throw new Stop('CANCEL', '', 'cancel');
    };
    for (;;) {
      checkAbort();
      const t = now();
      while (gachaPostWindow.length && t - gachaPostWindow[0] > 60000) gachaPostWindow.shift();
      const lastPost = gachaPostWindow.length ? gachaPostWindow[gachaPostWindow.length - 1] : 0;
      const minGap = (isFollowup ? 2800 : 3400) + Math.floor(Math.random() * 550);
      const burstWait = lastPost ? Math.max(0, lastPost + minGap - t) : 0;
      const windowWait = gachaPostWindow.length >= 6 ? Math.max(0, gachaPostWindow[0] + 60500 - t + Math.floor(Math.random() * 600)) : 0;
      const rlWait = Math.max(0, (run?.rlCooldownUntil || 0) - t);
      const waitMs = Math.max(burstWait, windowWait, rlWait);
      if (waitMs <= 0) {
        gachaPostWindow.push(now());
        return;
      }
      if (waitMs > 1200 && !isFollowup) phase('防 429 限流保护 · 等待 ' + Math.ceil(waitMs / 1000) + ' 秒');
      await sleep(Math.min(waitMs, 400));
    }
  }
  async function sendGap(my) {
    const s = run.settings, n = capRecent(), floor = capFloor(n);
    if (floor !== (run.capFloor || 0)) { run.capFloor = floor; if (floor) log('近 30 分钟本账号 / 当前出口 IP 触发人机验证 ' + n + ' 次：两抽间隔至少 ' + Math.round(floor / 1000) + ' 秒', 'warn'); else log('近 30 分钟没有再触发人机验证，恢复正常间隔'); }
    const base = Math.max(s.intervalMs || 0, s.turbo && s.parallel > 1 ? TURBO_GAP : 0, run.gap || 0, floor);
    // 随机抖动：固定节拍的请求更容易被判成脚本；最多加 25%（不超过 4 秒）
    const gap = base + (base > 0 ? Math.round(Math.random() * Math.min(4000, base * 0.25)) : 0);
    const quotaWait = Math.max(0, (typeof Quota !== 'undefined' && Quota.blockedUntil ? Quota.blockedUntil(true) : 0) - now());
    const wait = Math.max((run.lastSend || 0) + gap, run.nextAt || 0, now() + quotaWait) - now();
    if (wait > 300) phase(quotaWait > 300 ? ('服务端 429 冷却等待 ' + Math.ceil(wait / 1000) + ' 秒（不计数）') : ('间隔等待 ' + Math.ceil(wait / 1000) + ' 秒'));
    if (wait > 0) await waitFor(() => false, wait, my, 100);
    await paceGachaPost(my, false);
    run.lastSend = now();
  }
  // 人机验证：reCAPTCHA v3 连续被拒时，由你手动完成一次官方 v2 复选框验证，令牌给下一抽用
  let v2Token = null;
  let solving = null;
  // capOffer：以前「完成验证」按钮只在连续 3 次被拒（暂停）时出现，中间夹一次成功就清零，于是一直提示被拒却没按钮；
  // 现在最近 5 分钟有被拒就显示，可随时主动完成一次官方 v2 验证（令牌给下一抽用）
  const capProbeMs = () => Math.round(240e3 * (0.85 + Math.random() * 0.3));
  async function solveCaptcha() { if (solving) return solving; solving = solveCaptcha0().finally(() => { solving = null; changed(); }); changed(); return solving; }
  async function solveCaptcha0() {
    const t = await Recaptcha.v2(); v2Token = t; if (run) { run.needCaptcha = false; run.capStreak = 0; run.capAt = 0; run.capAlerted = false; run.capOpened = false; run.capAuto = 0; log('已完成人机验证，继续抽卡'); } return true;
  }

  // 需要人机验证时提醒你：系统通知 + 提示音（手机振动），并自动弹出官方验证框
  // App 在后台时等你切回来再弹；只弹官方组件，由你自己完成；取消后不反复弹，可随时点「完成验证」
  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = new AC(), t = ac.currentTime;
      for (const [f, d] of [[880, 0], [1175, 0.18]]) {
        const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
        o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 0.18);
      }
      setTimeout(() => ac.close().catch(() => {}), 800);
    } catch {}
  }
  function capOpen() {
    if (!run?.needCaptcha || solving || run.capOpened) return;
    run.capOpened = true;
    solveCaptcha().catch(() => { if (run?.needCaptcha) log('验证框已关闭：抽卡保持暂停，点「完成验证」继续', 'warn'); });
  }
  function capWhenVisible() {
    if (!document.hidden) { setTimeout(capOpen, 300); return; }
    const on = () => { if (document.hidden) return; document.removeEventListener('visibilitychange', on); setTimeout(capOpen, 300); };
    document.addEventListener('visibilitychange', on);
  }
  function capAlert() {
    if (!run || run.capAlerted) return;
    run.capAlerted = true; run.capOpened = false; changed();
    const title = '抽卡已暂停 · 需要人机验证', body = '已自动重试 ' + (run.capAuto || 0) + ' 次仍未通过；完成一次官方验证后自动继续，期间每 4 分钟自动再试（已抽 ' + (run.completed || 0) + ' 次）';
    if (Prefs.notify !== false) {
      try {
        if (Host.notify) Host.notify({ title, body, sid: '__captcha' })?.catch?.(() => {});
        else if (typeof Notification !== 'undefined' && (document.hidden || !document.hasFocus())) {
          const n = new Notification(title, { body, silent: false });
          n.onclick = () => { try { window.focus(); } catch {} capOpen(); };
        }
      } catch {}
    }
    beep(); try { navigator.vibrate?.([120, 80, 120]); } catch {}
    capWhenVisible();
  }

  // 目标厂商在开始时定下（run.settings），抽卡中用左轮 / 面板换厂商只改侧栏排序，不影响这一轮抽卡
  async function launch(my) {
    if (blOn() || bl) await pullBl();   // 别的账号改了共用黑名单：下一抽就用新的
    const cur = settings();
    run.settings = { ...run.settings, prompt: cur.prompt, intervalMs: cur.intervalMs, stopOnThinking: cur.stopOnThinking, parallel: run.settings.fingerprint ? 1 : cur.parallel, turbo: run.settings.fingerprint ? false : cur.turbo, archiveKeywords: cur.archiveKeywords, archiveOn: cur.archiveOn, stopOnHit: cur.stopOnHit, notifyHit: cur.notifyHit, skipCompatThinking: cur.skipCompatThinking, minStr: cur.minStr, csMode: cur.csMode, csKeep: cur.csKeep, csOk: cur.csOk };
    const s = run.settings;
    await sendGap(my);
    const a = { no: (run.seq = (run.seq || 0) + 1), at: now(), sid: null, done: false, sentAt: now(), phase: '新建对话', step: '建连', pct: 12 };
    run.attempts.push(a); phase('发送第 ' + a.no + ' 轮'); changed();
    let c, prompting=true;
    try {
      const v2 = v2Token; v2Token = null;
      const challenges = s.fingerprint ? GachaPrompts.challenges() : null;
      const autoqa = s.mode === 'autoqa' ? GachaPrompts.autoqa() : s.mode === 'habit' ? [GachaPrompts.habit()] : null;
      const prompt = s.fingerprint ? challenges[0].prompt : (s.mode === 'autoqa' || s.mode === 'habit') ? autoqa[0] : s.mode === 'svg' ? GachaPrompts.svg() : await GachaPrompts.custom(s.prompt);
      if (!alive(my)) throw new Stop('CANCEL', '', 'cancel');
      prompting=false;
      if (autoqa) a.autoqaQuestions = autoqa;
      const mk = v2 => createChat(prompt, { v2, gacha: { mode:s.mode, autoqa, challenges, preferredKeywords:[...s.preferredKeywords], blacklist: s.archiveOn ? [...s.archiveKeywords] : [], skipCompatThinking: !!s.skipCompatThinking, fingerprint: !!s.fingerprint, stopThink: (s.fingerprint || s.mode === 'autoqa' || s.mode === 'habit') ? false : s.stopOnThinking, run: run.id }, onRetry: t => { a.phase = t; log('第 ' + a.no + ' 轮：' + t); } });
      try { c = await mk(v2); }
      catch (e1) {
        const b1 = String(e1?.body || '');
        if (v2 || run.capProbe || !alive(my) || e1?.status !== 403 || !/recaptcha|captcha/i.test(b1)) throw e1;
        run.capSilent = (run.capSilent || 0) + 1; a.phase = '验证令牌被拒，换新令牌重试';
        log('第 ' + a.no + ' 轮：人机验证令牌被拒，多半是令牌过期 / 页面状态旧了 —— 换一个新令牌静默重试一次');
        await waitFor(() => false, 2000 + Math.round(Math.random() * 3000), my, 100);
        c = await mk(null); run.capSilentOk = (run.capSilentOk || 0) + 1; log('第 ' + a.no + ' 轮：静默重试成功，不需要人工验证');
      }
    } catch (e) {
      a.done = true; const st = e.status || 0, body = String(e.body || '');
      const rollbackUnfinishedAttempt = (mergePrev = true) => {
        run.seq = Math.max(run.completed || 0, (run.seq || 1) - 1);
        a.no = null;
        a.draw = null;
        if (mergePrev && !a.sid && Array.isArray(run.attempts) && run.attempts.length >= 2 && run.attempts[run.attempts.length - 1] === a) {
          const prev = run.attempts[run.attempts.length - 2];
          if (prev && !prev.sid && prev.verdict === 'skipped') {
            run.attempts.pop();
            prev.at = now();
            prev.note = a.note;
            prev.retryCount = (prev.retryCount || 1) + 1;
          }
        }
      };
      if (!alive(my)) { rollbackUnfinishedAttempt(false); a.verdict = 'cancelled'; a.note = '已停止'; changed(); throw new Stop('CANCEL', '', 'cancel'); }
      if(prompting){a.verdict='error';a.note=describe(e);fatal('PROMPT',a.note);}
      if ((st === 403 && /recaptcha|captcha/i.test(body)) || promptFailed(st, body)) {
        run.captchas = (run.captchas || 0) + 1; run.capStreak = (run.capStreak || 0) + 1; run.gap = Math.min(30000, Math.max(15000, Math.round((run.gap || 0) * 1.5)));
        a.verdict = 'skipped'; a.note = '人机验证（reCAPTCHA）未通过 · 可点「完成验证」手动验证'; run.capAt = now();
        rollbackUnfinishedAttempt(true);
        // 静默重试也被拒 / 重复指令：立刻暂停，提醒你完成一次官方验证（不再先空抽 3 次）
        const cn = capNote(); run.needCaptcha = true;
        if (cn >= 3) log('近 30 分钟本账号 / 当前出口 IP 已触发 ' + cn + ' 次人机验证，之后会自动放慢', 'warn');
        log('reCAPTCHA 分数不足，放慢到每 ' + Math.round(run.gap / 1000) + ' 秒一抽后补抽（不计次数）' + ((run.capAuto || 0) < 2 ? '；先自动冷却重试，不用操作' : '；已暂停，完成一次验证后自动继续'), 'warn'); return;
      }
      const hasActiveStreamingFlight = [...flights].some(f => f.a?.sid && typeof Chats !== 'undefined' && Chats.get(f.a.sid)?.busy);
      if (st === 429) {
        run.rl429Streak = (run.rl429Streak || 0) + 1;
        try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
        const srvWait = Math.max(Number(e?.retryAfterMs) || 0, (typeof Quota !== 'undefined' && Quota.blockedUntil ? Quota.blockedUntil(true) - now() : 0));
        const wait429 = srvWait > 0 ? Math.min(90000, srvWait + 1200) : (hasActiveStreamingFlight ? 8000 : Math.min(45000, 12000 * Math.min(run.rl429Streak, 3) + Math.floor(Math.random() * 3500)));
        run.rlCooldownUntil = now() + wait429;
        run.gap = Math.max(run.gap || 0, 9500);
        run.nextAt = Math.max(run.nextAt || 0, run.rlCooldownUntil);
        a.verdict = 'skipped';
        a.note = '触发 429 速率限制，已轮换会话指纹并保持当前 IP 冷却 ' + Math.ceil(wait429 / 1000) + ' 秒后自动补抽（不计数）';
        rollbackUnfinishedAttempt(true);
        log('触发 429 速率限制（不计入抽卡次数，不切换当前 IP）：已轮换会话指纹，等待 ' + Math.ceil(wait429 / 1000) + ' 秒冷却后自动继续', 'warn');
        changed();
        return;
      }
      if (st === 401 || st === 403 || st === 404) {
        if (st === 401 || st === 403) { a.verdict = 'error'; a.note = describe(e); fatal('AUTH', 'HTTP ' + st); }
      }
      if (st === 402) { a.verdict = 'error'; a.note = describe(e); fatal('QUOTA', body.slice(0, 120)); }
      a.verdict = 'skipped'; a.note = describe(e);
      rollbackUnfinishedAttempt(true);
      run.skips++; run.skipTotal = (run.skipTotal || 0) + 1;
      // 临时错误（409 请求还在处理、408 / 425、5xx、网络 / 超时）：立即尝试秒切备用 IP / 节点并自动补抽
      if (st >= 500 || !st || [404, 408, 409, 425].includes(st)) {
        run.tErr = (run.tErr || 0) + 1;
        const sw = (!hasActiveStreamingFlight && st !== 409 && st !== 404 && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch) ? await AutoRoute.onErrorSwitch(e, 'gacha').catch(() => null) : null;
        const wait = sw?.changed ? 1800 : (run.tErr >= 3 ? Math.min(120000, 10000 * 2 ** Math.min(run.tErr - 3, 4)) : st === 409 ? 5000 : 2000);
        run.nextAt = Math.max(run.nextAt || 0, now() + wait);
        log('新建对话未完成（' + a.note + '），不计次数，' + (sw?.changed ? '已秒切备用线路（' + (sw.label || '新出口') + '），' : '') + Math.round(wait / 1000) + ' 秒后自动补抽' + (run.tErr >= 3 ? '（连续 ' + run.tErr + ' 次）' : ''), 'warn');
        return;
      }
      log('新建对话失败，不计次数：' + a.note, 'warn');
      fatal('HTTP', a.note);
    }
    run.capStreak = 0; run.tErr = 0; run.rl429Streak = 0; if (run.gap) run.gap = run.gap > 10500 ? Math.round(run.gap * 0.95) : 0;
    if (s.mode === 'autoqa' || s.mode === 'habit') { c._wasGachaAutoQA = true; c._isMicroProbe = true; }
    a.sid = c.sid; a.phase = '等待运行'; a.step = '启动'; a.pct = 18;
    markGachaCreatedSid(c.sid);
    if (s.mode !== 'habit') {
      try { if (typeof BillingProbe !== 'undefined' && BillingProbe.enqueueIdent) BillingProbe.enqueueIdent(c.sid, { fromGacha: true }); } catch {}
    }
    const f = { a, ctl: new AbortController() }; flights.add(f);
    phase('已发出第 ' + a.no + ' 轮 · 后台识别 ' + flights.size + ' 路'); changed();
    void track(a, c, f.ctl.signal).then(r => land(my, a, r)).catch(e => missed(my, a, e)).finally(() => { if (c.gacha?.fingerprint || c.gacha?.mode === 'autoqa' || c.gacha?.mode === 'habit' || c.gacha?.skipCompatThinking) { c.gacha = null; c.emit(); } flights.delete(f); changed(); });
  }
  const gachaCreatedSet = new Set(Array.isArray(Store.get('gacha-sids', null)) ? Store.get('gacha-sids', []) : []);
  function markGachaCreatedSid(sid) {
    if (!sid) return;
    gachaCreatedSet.add(sid);
    if (gachaCreatedSet.size > 400) {
      const first = gachaCreatedSet.values().next().value;
      if (first) gachaCreatedSet.delete(first);
    }
    try { Store.set('gacha-sids', [...gachaCreatedSet]); } catch {}
  }
  function isGachaCreatedChat(sid, c, e) {
    if (!sid) return false;
    if (gachaCreatedSet.has(sid)) return true;
    if (run && Array.isArray(run.attempts) && run.attempts.some(a => a && a.sid === sid)) return true;
    const ch = c || (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
    if (ch && (ch.gacha || ch._wasGachaAutoQA)) return true;
    const firstUser = (ch?.messages || []).find(m => m?.role === 'user');
    const uText = String(firstUser?.text || (firstUser?.parts || []).map(p => p?.text || '').join(' ') || '').trim();
    if (uText && (/17\s*[×x*]\s*23|capital of France|chemical symbol for water|Reply with OK only|pelican riding a bicycle/i.test(uText) || /^\d{4}\s/.test(uText))) {
      markGachaCreatedSid(sid);
      return true;
    }
    const rawTitle = String(e?.title || ch?.title || '').trim();
    if (/^[a-z]{3,12}\s+[a-z]{3,12}$/i.test(rawTitle) && (ch?.messages || []).length <= 8) {
      return true;
    }
    return false;
  }
  const isOpenThinkingChat = c => {
    if (!c) return false;
    if (c.gacha?.compatSkip || c.thinkingStatus?.kind === 'compat-thinking') return true;
    if (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(c)?.kind === 'compat-thinking') return true;
    const msgs = [...(c.messages || []), c.live].filter(Boolean);
    for (const m of msgs) {
      if (!m || m.role !== 'assistant') continue;
      if (typeof m.think === 'string' && /[^\s.…·。]/.test(m.think.trim())) return true;
      if (typeof m.text === 'string' && /<think>[\s\S]*[^\s.…·。][\s\S]*<\/think>/i.test(m.text)) return true;
      for (const p of (m.parts || [])) {
        if (!p) continue;
        if ((p.type === 'reasoning' || p.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || p.reasoning || p.thinking || '').trim())) {
          return true;
        }
      }
    }
    const mi = c.sid && typeof Models !== 'undefined' ? Models.get(c.sid) : null;
    if (mi && (mi.name === '开源模型' || isOpenSourceModelCand({ id: mi.reverseCandidateId, label: mi.rawLabel, canon: mi.name }))) return true;
    return false;
  };
  const isOpenSourceModelCand = cand => {
    if (!cand) return false;
    const s = String((cand.id || '') + ' ' + (cand.label || '') + ' ' + (cand.canon || '')).toLowerCase();
    return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(s);
  };
  // 后台跟踪一抽：等运行令牌 → 等对话自己的识别结果（与普通对话共用，不重复请求 Trigger）
  async function waitAutoQATurn(a, c, signal, roundNo) {
    const startAt = now(), limitMs = 150000;
    let sawBusy = !!c.busy;
    let lastReconcileAt = now();
    while (now() - startAt < limitMs) {
      if (signal?.aborted) throw new Stop('CANCEL', '', 'cancel');
      if (c.busy) sawBusy = true;
      if (c.busy) {
        const basePct = roundNo === 1 ? 24 : roundNo === 2 ? 54 : 80;
        const tChars = Number(c.fmt?.tChars) || 0;
        const nextPct = Math.min(basePct + 10, basePct + (tChars > 120 ? 8 : tChars > 20 ? 5 : 2));
        if (a.pct !== nextPct || a.step !== roundNo + '/3 回复') { a.step = roundNo + '/3 回复'; a.pct = nextPct; changed(); }
      }
      if (c.gacha?.skipCompatThinking) {
        if (typeof Fingerprint !== 'undefined') Fingerprint.maybeStopCompat?.(c);
        if (isOpenThinkingChat(c)) {
          a.step = '已删开源'; a.pct = 100; changed();
          killOpenSourceThinkingChat(c.sid, c);
          return { skipped: c.gacha?.compatSkip?.skipped || 'visible-thinking', stopConfirmed: true, entry: null };
        }
      }
      let completedCount = (typeof ArenaBilling !== 'undefined' && ArenaBilling.completed) ? ArenaBilling.completed(c).length : (c.messages || []).filter(m => m?.role === 'assistant').length;
      if (!c.busy && (completedCount >= roundNo || (sawBusy && completedCount > 0))) {
        if (c.gacha?.skipCompatThinking && isOpenThinkingChat(c)) {
          a.step = '已删开源'; a.pct = 100; changed();
          killOpenSourceThinkingChat(c.sid, c);
          return { skipped: c.gacha?.compatSkip?.skipped || 'visible-thinking', stopConfirmed: true, entry: null };
        }
        return { completedCount };
      }
      // 如果因限流切 IP 或网络抖动导致流中断（!c.busy 且尚未拿到本轮完整回复），主动向服务端同步消息并在必要时自动重发本问，绝不半途丢弃对话
      if (!c.busy && (c.error || now() - lastReconcileAt > 5500)) {
        lastReconcileAt = now();
        try { await c.reconcile?.(0); } catch {}
        try { if (!c.loaded || ((typeof ArenaBilling !== 'undefined' && ArenaBilling.completed) ? ArenaBilling.completed(c).length : 0) < roundNo) await c.load?.(); } catch {}
        if (c.gacha?.skipCompatThinking && isOpenThinkingChat(c)) {
          a.step = '已删开源'; a.pct = 100; changed();
          killOpenSourceThinkingChat(c.sid, c);
          return { skipped: c.gacha?.compatSkip?.skipped || 'visible-thinking', stopConfirmed: true, entry: null };
        }
        completedCount = (typeof ArenaBilling !== 'undefined' && ArenaBilling.completed) ? ArenaBilling.completed(c).length : (c.messages || []).filter(m => m?.role === 'assistant').length;
        if (completedCount >= roundNo) {
          c.error = null;
          return { completedCount };
        }
        if (c.error && !a['_retriedRound' + roundNo]) {
          a['_retriedRound' + roundNo] = true;
          c.error = null;
          const qList = Array.isArray(c.gacha?.autoqa) ? c.gacha.autoqa : a.autoqaQuestions;
          const retryQ = (qList && qList[roundNo - 1]) || (typeof GachaPrompts !== 'undefined' && GachaPrompts.autoqaOne ? GachaPrompts.autoqaOne(roundNo - 1) : 'Reply with OK only.');
          await sleep(1200);
          if (!signal?.aborted && !c.busy) {
            try { await c.send(retryQ); sawBusy = true; continue; } catch {}
          }
        }
        if (!c.busy && c.error) throw new Error('回复出错：' + c.error);
      }
      await sleep(220);
    }
    throw new Error('等待第 ' + roundNo + ' 问回复超时');
  }
  async function trackAutoQA(a, c, signal) {
    const isHabitOnly = c.gacha?.mode === 'habit';
    const maxRounds = isHabitOnly ? 1 : 3;
    const questions = Array.isArray(c.gacha?.autoqa) && c.gacha.autoqa.length >= 1 ? c.gacha.autoqa : (a.autoqaQuestions || (isHabitOnly ? [GachaPrompts.habit()] : GachaPrompts.autoqa()));
    for (let roundNo = 1; roundNo <= maxRounds; roundNo++) {
      a.phase = (isHabitOnly ? '习惯速测 · 等待微缩探针回复' : '自动问答 第 ' + roundNo + '/3 问 · 等待回复'); a.step = isHabitOnly ? '探针回复' : (roundNo + '/3 回复'); a.pct = isHabitOnly ? 38 : (roundNo === 1 ? 24 : roundNo === 2 ? 54 : 80); changed();
      const turnRes = await waitAutoQATurn(a, c, signal, roundNo);
      if (turnRes?.skipped || (c.gacha?.skipCompatThinking && isOpenThinkingChat(c))) {
        killOpenSourceThinkingChat(c.sid, c);
        const fp = { skipped: turnRes?.skipped || 'visible-thinking', stopConfirmed: true, skipDetail: '检测到开源思考，已直接归档删除' };
        const entry = { name: '未知型号', guess: true, fingerprint: fp, at: now() };
        Models.set(c.sid, entry);
        return { name: '未知型号', guess: true, fingerprint: fp };
      }
      // 如果已经拿到运行令牌真实型号，直接锁定并结束本轮会话
      const existing = Models.get(c.sid);
      if (existing && existing.name && !existing.guess && !existing.fromTitle && !existing.reverseInferred && !existing.pendingConfirm) {
        return existing;
      }
      a.phase = isHabitOnly ? '习惯速测 · 匹配 20 维习惯指纹' : ('自动问答 第 ' + roundNo + '/3 问 · 后台反推中'); a.step = isHabitOnly ? '习惯匹配' : (roundNo + '/3 反推'); a.pct = isHabitOnly ? 82 : (roundNo === 1 ? 38 : roundNo === 2 ? 68 : 92); changed();
      let sum = null;
      let costFallbackOnRound = false;
      const costAllowed = !isHabitOnly && (typeof BillingProbe === 'undefined' || !BillingProbe.isCostProbeEnabled || BillingProbe.isCostProbeEnabled());
      if (!costAllowed || isOpenThinkingChat(c)) {
        costFallbackOnRound = true;
        if (typeof Fmt !== 'undefined' && Fmt.fromReplay) { try { await Fmt.fromReplay(c); } catch {} }
        try {
          if (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.identifyAndApply) ChatHabitFingerprint.identifyAndApply(c, { force: true });
          else if (typeof BillingProbe !== 'undefined' && BillingProbe.habit?.identifyAndApply) BillingProbe.habit.identifyAndApply(c, { force: true });
        } catch {}
        sum = typeof BillingProbe !== 'undefined' && BillingProbe.summary ? BillingProbe.summary(c.sid) : null;
      } else if (typeof BillingProbe !== 'undefined' && BillingProbe.refresh) {
        const latestAsst = (typeof ArenaBilling !== 'undefined' && ArenaBilling.completed) ? ArenaBilling.completed(c).at(-1) : null;
        for (let retry = 0; retry < 3; retry++) {
          if (signal?.aborted) throw new Stop('CANCEL', '', 'cancel');
          await sleep(retry === 0 ? (750 + Math.floor(Math.random() * 250)) : (1250 + Math.floor(Math.random() * 350)));
          try { await BillingProbe.refresh(c, { force: true }); } catch {}
          const stNow = BillingProbe.state?.(c.sid);
          sum = BillingProbe.summary(c.sid);
          const obsCount = Number(sum?.diagnostics?.samples?.observations || 0);
          const cands = sum?.mergedCandidates || sum?.diagnostics?.candidates || [];
          const covered = stNow?.coveredIds || [];
          if (stNow?.httpStatus === 429 || stNow?.httpStatus === 403 || (stNow?.retryAt && stNow.retryAt > now())) {
            costFallbackOnRound = true;
            if (typeof Fmt !== 'undefined' && Fmt.fromReplay) { try { await Fmt.fromReplay(c); } catch {} }
            try {
              if (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.identifyAndApply) ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true });
              else if (typeof BillingProbe !== 'undefined' && BillingProbe.habit?.identifyAndApply) BillingProbe.habit.identifyAndApply(c, { force: true, fromCostFallback: true });
            } catch {}
            sum = BillingProbe.summary(c.sid);
            break;
          }
          if ((obsCount >= roundNo && cands.length > 0) || (latestAsst?.id && covered.includes(latestAsst.id))) break;
        }
      }
      const cands = (sum?.mergedCandidates && sum.mergedCandidates.length ? sum.mergedCandidates : sum?.diagnostics?.candidates) || [];
      const top0 = cands[0] || null;
      const top1 = cands[1] || null;
      const top0Score = Number(top0?.match || 0);
      const top1Score = Number(top1?.match || 0);
      const isOpenChat = isOpenThinkingChat(c) || c.fmtGuess?.fam === 'compat' || sum?.diagnostics?.family === 'OpenAI / 开源兼容' || (top0 && isOpenSourceModelCand(top0));
      if (isOpenChat && c.gacha?.skipCompatThinking) {
        killOpenSourceThinkingChat(c.sid, c);
        const fp = { skipped: 'visible-thinking', stopConfirmed: true, skipDetail: '检测到开源思考，已直接归档删除' };
        const entry = { name: '未知型号', guess: true, fingerprint: fp, at: now() };
        Models.set(c.sid, entry);
        return { name: '未知型号', guess: true, fingerprint: fp };
      }
      // 判断是否仅有 1 个唯一第一名高置信度模型（差距 < 0.05% 才视为并列），或者所有接近的候选均属于归档非目标
      const highConfidenceList = cands.filter(x => {
        const m = Number(x?.match || 0);
        return top0Score > 0 && Math.abs(m - top0Score) < 0.05;
      });
      const close3List = cands.filter(x => top0Score > 0 && Math.abs(Number(x?.match || 0) - top0Score) < 3);
      const curSet = run?.settings || settings();
      const allCloseArchive = close3List.length > 0 && close3List.every(x => {
        const cName = Strength.canon(x.label || x.id || '').replace(/[?？]+$/, '');
        return classify({ name: cName, internal: x.id || cName, response: cName, guess: false }, curSet) === 'archive';
      });
      const isUniqueHigh = !!(top0 && top0Score >= 75 && !top0.streamFallback && (
        (highConfidenceList.length === 1 && (top0.diophantinePassed || !top1 || (top0Score - top1Score) >= 0.1)) ||
        allCloseArchive ||
        (top0Score >= 95 && (!top1 || (top0Score - top1Score) >= 5))
      ));
      if (isUniqueHigh) {
        const rawName = top0.label || top0.id || '';
        const canonName = Strength.canon(rawName).replace(/[?？]+$/, '');
        if (typeof BillingProbe !== 'undefined' && BillingProbe.applyReverseIdentity) {
          BillingProbe.applyReverseIdentity(c, { interactive: true, forceLock: true, fallbackQuestionMark: false });
        }
        const locked = Models.get(c.sid) || { name: canonName, internal: top0.id || canonName, guess: false, reverseInferred: true, billingProbe: true, reverseMatch: top0Score };
        a.note = '第 ' + roundNo + ' 问唯一高置信反推锁定（' + Math.round(top0Score) + '%）';
        return { ...locked, name: canonName, guess: false, reverseInferred: true };
      }
      // 微缩探针习惯模式或 /cost 关闭/限流回退时，第 1 轮已采满 20 维代码与两步工具习惯特征，直接单轮锁定不追问第 2、3 问
      if (roundNo === 1 && (isHabitOnly || costFallbackOnRound) && top0) {
        const rawName = top0.label || top0.id || '';
        const canonName = Strength.canon(rawName).replace(/[?？]+$/, '');
        try {
          if (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.identifyAndApply) ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: !isHabitOnly });
          else if (typeof BillingProbe !== 'undefined' && BillingProbe.habit?.identifyAndApply) BillingProbe.habit.identifyAndApply(c, { force: true, fromCostFallback: !isHabitOnly });
        } catch {}
        try { Titles.local?.(c.sid); Titles.capture?.(c.sid, a.sentAt || c.sentAt); Titles.touch?.(c.sid); Titles.kick?.(true); } catch {}
        const locked = Models.get(c.sid) || { name: canonName, internal: top0.id || canonName, guess: false, habitInferred: true, reverseInferred: true, billingProbe: true, reverseMatch: top0Score };
        a.note = (isHabitOnly ? '习惯速测微缩探针单轮锁定（' : '微缩探针习惯单轮锁定（') + Math.round(top0Score) + '%）';
        return { ...locked, name: canonName, guess: false, habitInferred: true, reverseInferred: true };
      }
      // 开源模型最多一问（不追问第 2、3 问）；只有开启 /cost 且闭源模型存在多个同价候选时才继续追问第 2、3 个问题
      if (!isOpenChat && roundNo < 3) {
        if (!isHabitOnly && !costFallbackOnRound && roundNo < maxRounds) {
          const nextQ = questions[roundNo] || GachaPrompts.autoqaOne(roundNo);
          a.phase = '存在多款候选 · 追问第 ' + (roundNo + 1) + '/3 问'; a.step = (roundNo + 1) + '/3 提问'; a.pct = roundNo === 1 ? 48 : 75; changed();
          await paceGachaPost(signal, true);
          if (signal?.aborted) throw new Stop('CANCEL', '', 'cancel');
          try { await c.send(nextQ); } catch { if (signal?.aborted) throw new Stop('CANCEL', '', 'cancel'); try { await c.reconcile?.(0); } catch {} await sleep(400); await c.send(nextQ); }
          continue;
        }
      }
      // 3 个问题后仍有多个结果：选第 1 个并在模型名称后面加上 ? 号，开启下一个会话
      if (top0) {
        const rawName = top0.label || top0.id || '未知型号';
        const baseCanon = Strength.canon(rawName).replace(/[?？]+$/, '');
        const finalName = baseCanon + '?';
        if (typeof BillingProbe !== 'undefined' && BillingProbe.applyReverseIdentity) {
          BillingProbe.applyReverseIdentity(c, { interactive: true, forceLock: true, fallbackQuestionMark: true });
        } else {
          const entry = {
            name: finalName,
            internal: top0.id || baseCanon,
            response: baseCanon,
            provider: (top0.vendor ? top0.vendor + ' · ' : '') + '自动问答3轮反推首选',
            tier: Strength.parts(baseCanon).tier || null,
            guess: false,
            uncertain: true,
            pendingConfirm: false,
            reverseInferred: true,
            billingProbe: true,
            reverseMatch: top0Score,
            at: now(),
          };
          Models.set(c.sid, entry);
          try { Titles.capture(c.sid, a.sentAt || c.sentAt); Titles.touch(c.sid); Titles.kick(true); } catch {}
          Bus.emit('model', c, entry);
        }
        const locked = Models.get(c.sid) || {};
        a.note = top0.streamFallback
          ? '3 问后 /cost 受限，已按流式协议特征兜底加 ? 号'
          : '3 问后仍有多款候选，已选第 1 个并加 ? 号（' + Math.round(top0Score) + '%）';
        return { ...locked, name: finalName, guess: false, uncertain: true, reverseInferred: true };
      }
      // 第 4 级防风控协议兜底：若 /cost 遇到 429/延迟未出账，从实时流格式特征 / 会话回放 / 已有识别记录兜底加 ? 号
      if (typeof Fmt !== 'undefined' && Fmt.fromReplay) {
        try { await Fmt.fromReplay(c); } catch {}
      }
      const lastMsg = (c.messages || []).findLast(m => m.role === 'assistant');
      const fmtG = c.fmtGuess || (lastMsg && typeof Fmt !== 'undefined' && Fmt.guess ? Fmt.guess(lastMsg.text || '', lastMsg.think || '', lastMsg.tools || []) : null);
      const fallbackBase = String(Models.get(c.sid)?.name || fmtG?.name || '').replace(/[?？]+$/, '').trim();
      if (fallbackBase && fallbackBase !== '未知型号') {
        const baseCanon = Strength.canon(fallbackBase).replace(/[?？]+$/, '');
        const finalName = baseCanon + '?';
        const entry = {
          ...(Models.get(c.sid) || {}),
          name: finalName,
          internal: baseCanon,
          response: baseCanon,
          provider: '流式协议特征兜底',
          tier: Strength.parts(baseCanon).tier || null,
          guess: false,
          uncertain: true,
          pendingConfirm: false,
          reverseInferred: true,
          billingProbe: true,
          reverseMatch: 58,
          at: now(),
        };
        Models.set(c.sid, entry);
        try { Titles.capture(c.sid, a.sentAt || c.sentAt); Titles.touch(c.sid); Titles.kick(true); } catch {}
        Bus.emit('model', c, entry);
        a.note = '3 问后 /cost 暂缓，已按流式协议特征兜底加 ? 号';
        return entry;
      }
    }
    throw new Error('自动问答 3 轮后未能完成反推识别');
  }
  async function track(a, c, signal) {
    let until = now() + 75000;
    const aborted = () => { if (signal.aborted) throw new Stop('CANCEL', '', 'cancel'); };
    const s = run?.settings || {};
    if (c.gacha?.fingerprint) return Fingerprint.run(c, { signal, challenges:c.gacha.challenges, preferredKeywords:c.gacha.preferredKeywords, blacklist:c.gacha.blacklist||null, libraryState:null, progress: text => { a.phase = text; changed(); } });
    if (c.gacha?.mode === 'autoqa' || c.gacha?.mode === 'habit') return trackAutoQA(a, c, signal);
    if (c.gacha?.skipCompatThinking) {
      if (typeof History !== 'undefined' && typeof History.remove === 'function') {
        if (typeof Fingerprint !== 'undefined') Fingerprint.maybeStopCompat?.(c);
        if (isOpenThinkingChat(c)) {
          killOpenSourceThinkingChat(c.sid, c);
          const fp = { skipped: c.gacha?.compatSkip?.skipped || 'visible-thinking', stopConfirmed: true, skipDetail: '检测到开源思考，已直接归档删除' };
          const entry = { name: '未知型号', guess: true, fingerprint: fp, at: now() };
          Models.set(c.sid, entry);
          return entry;
        }
      } else {
        const skipped = await Fingerprint.waitCompatDecision(c, signal); if (skipped) return skipped;
      }
    }
    while (!c.idP || !c.runTok) {
      aborted();
      if (c.gacha?.skipCompatThinking) {
        if (typeof Fingerprint !== 'undefined') Fingerprint.maybeStopCompat?.(c);
        if (isOpenThinkingChat(c)) {
          killOpenSourceThinkingChat(c.sid, c);
          const fp = { skipped: c.gacha?.compatSkip?.skipped || 'visible-thinking', stopConfirmed: true, skipDetail: '检测到开源思考，已直接归档删除' };
          const entry = { name: '未知型号', guess: true, fingerprint: fp, at: now() };
          Models.set(c.sid, entry);
          return entry;
        }
      }
      // 新建对话拿不到运行令牌：按回复格式推测厂商（能确定时立即用；不确定的等这一轮结束再用）
      const g = c.fmtGuess || (!c.busy && (c.fmt?.ids?.length || c.fmt?.toolIds?.length) ? Fmt.guess({ ...c.fmt, done: true }) : null);
      // 旧版固定生效时运行令牌会来：先等真实型号，按格式推测只作兜底（这一轮结束 15 秒后还没令牌才用）
      const pinned = Pin.on() && Pin.legacy();
      if (pinned && c.fmt && c.busy) until = Math.max(until, now() + 60000);
      if (!c.busy && c.fmt && !a.idleAt) a.idleAt = now();
      if (pinned && g && !(!c.busy && a.idleAt && now() - a.idleAt > 15000)) { if (a.phase !== '等运行令牌') { a.phase = '等运行令牌'; changed(); } }
      else if (g && (g.sure || !c.busy)) {
        // 设了最低强度分、而且是目标厂商：等这一轮答完，按回复节奏算出强度分再判断
        const wait = csOn(s) && has(Fmt.NAME[g.fam] || g.fam, s.targetKeywords);
        if (!wait || !c.busy) {
          const est = !c.busy && c.fmt ? Fmt.est(c.fmt, g.fam, !s.fingerprint && s.mode === 'svg') : null, e = Fmt.entry(g, est); c.guessModel?.(g);
          a.phase = '按回复格式识别'; a.fmtWhy = g.why; changed(); return e;
        }
        if (!a.waitPower) { a.waitPower = true; a.phase = '已认出 ' + (Fmt.LABEL[g.fam] || g.fam) + '，等答完打分'; until = now() + 6 * 60000; changed(); }
      }
      if (now() > until) throw new Error('75 秒内对话没有开始运行' + (c.error ? '（' + c.error + '）' : ''));
      if (c.error && !c.busy && !c.runTok) throw new Error('回复出错：' + c.error);
      await sleep(150);
    }
    a.phase = '识别中'; a.runAt = now(); changed();
    let tick = setInterval(() => { if (c.early && a.early !== c.early) { a.early = c.early; changed(); } }, 250);
    try {
      const r = await Promise.race([c.idP, new Promise((_, rej) => { signal.addEventListener('abort', () => rej(new Stop('CANCEL', '', 'cancel')), { once: true }); setTimeout(() => rej(new Error('60 秒内没有识别到模型')), 60000); })]);
      if (!r?.name) throw new Error('记录里没有模型信息');
      return r;
    } finally { clearInterval(tick); }
  }
  function land(my, a, r) {
    if (!alive(my) || a.done) return;
    const s = run.settings, id = { name: Strength.canon(r.name), internal: r.internal, request: r.request, response: r.response, tier: r.tier, routed: r.routed, partial: r.partial, guess: !!r.guess, fingerprint: r.fingerprint || null, cs: !r.fingerprint && r.guess ? Calib.last.get(a.sid) : null };
    const verdict = classify(id, s); if (r.fingerprint?.skipped) log('第 ' + a.no + ' 轮：' + Fingerprint.details(id) + (verdict==='archive'?'；已确认停止，排队归档，继续下一抽':'；已确认结束，保留对话，继续下一抽')); const cs = id.cs?.ok ? id.cs.s : null;
    Object.assign(a, { note: id.fingerprint?.skipped ? id.fingerprint.skipDetail : a.note, fingerprint: id.fingerprint, guess: !!r.guess, model: id.name, tier: id.tier, verdict, done: true, idMs: now() - a.sentAt, partial: !!id.partial, phase: '', power: cs, csWhy: id.csv ? id.csv.why + (id.csv.top ? ' · 最像 ' + id.csv.top.label + ' ' + id.csv.top.p + '%' : '') : null });
    run.completed++; a.draw = run.completed; a.no = run.completed; run.seq = Math.max(run.seq || 0, run.completed); run.skips = 0; run.pauseStreak = 0; run.skipHeal = 0;
    if (id.routed) { a.routed = true; log('第 ' + a.no + ' 轮原模型调用失败，Brana 已改派；按实际回答的 ' + id.name + ' 计'); }
    log('#' + a.draw + ' ' + (id.fingerprint ? Fingerprint.describe(id) : id.name) + (id.tier ? ' · ' + id.tier : '') + (cs != null ? ' · 强度分 ' + cs : id.cs && !id.cs.ok ? ' · 打分作废' : '') + (id.csv ? '（' + ({ keep: '满意', ok: '勉强', reroll: '换', retry: '作废' }[id.csv.action] || '') + '：' + id.csv.why + (id.csv.top ? '，最像 ' + id.csv.top.label + ' ' + id.csv.top.p + '%' : '') + '）' : '') + ' → ' + ({ hit: '命中目标', keep: '保留', archive: '归档' }[verdict]) + ' · 发送后 ' + (a.idMs / 1000).toFixed(1) + ' 秒识别');
    if (verdict === 'hit') {
      run.hits = [...(run.hits || []), id.name].slice(-50);
      log('命中目标：' + id.name + '（已命中 ' + run.hits.length + ' 次' + (s.stopOnHit ? '，按设置停止' : s.endless ? '，持续抽卡继续' : '，继续抽满 ' + s.maxAttempts + ' 次') + '）');
      try { if (!document.hidden && !GSlot.visible()) toast('🎯 抽中 ' + id.name); } catch {}
      // 抽到金色 / 命中目标：只在界面里提示，不弹系统通知
      if (s.stopOnHit && run.status === 'running') setTimeout(() => finish('hit', '命中目标 ' + id.name + '，已按设置停止（共 ' + run.completed + ' 抽）'), 0);
    }
    if (!s.turbo || s.parallel <= 1) run.nextAt = now() + (s.intervalMs || 0);
    changed(); void settle(a, verdict).finally(changed);
  }
  // 收尾等完之后真实型号才到：只改正记录和命中计数（归档与否已经按推测做了，不再动对话）
  Bus.on('model', (c, e) => {
    try {
      if (!run || !c?.sid || !e?.name || e.guess) return;
      const a = run.attempts.find(x => x.sid === c.sid && x.done && x.guess && x.gw && !x.fingerprint); if (!a) return;
      const id = { name: Strength.canon(e.name), internal: e.internal, request: e.request, response: e.response, tier: e.tier }, s = run.settings, v2 = classify(id, s), was = a.model;
      Object.assign(a, { guess: false, model: id.name, tier: e.tier || Strength.parts(id.name).tier || null, partial: !!e.partial, rev: (a.rev || 0) + 1, fixed: was });
      if (a.verdict === 'hit' && v2 !== 'hit') { const i = (run.hits || []).lastIndexOf(was); if (i >= 0) run.hits.splice(i, 1); }
      if (v2 === 'hit' && a.verdict !== 'hit') run.hits = [...(run.hits || []), id.name].slice(-50);
      log('#' + a.draw + ' 真实型号到了：' + was + ' → ' + id.name + (v2 !== a.verdict ? '（' + ({ hit: '命中', keep: '保留', archive: '归档' }[v2] || v2) + '，对话已按推测处理）' : ''));
      if (!(a.verdict === 'archive' && a.archived)) a.verdict = v2; changed();
    } catch {}
  });
  function missed(my, a, e) {
    if (a.done) return; a.done = true; a.phase = '';
    if (a.sid) {
      markGachaCreatedSid(a.sid);
      try {
        const ch0 = typeof Chats !== 'undefined' ? Chats.get(a.sid) : null;
        if (ch0 && isOpenThinkingChat(ch0) && (run?.settings || settings()).skipCompatThinking !== false) {
          killOpenSourceThinkingChat(a.sid, ch0);
        } else if (typeof BillingProbe !== 'undefined' && BillingProbe.enqueueIdent) {
          BillingProbe.enqueueIdent(a.sid, { fromGacha: true });
        }
      } catch {}
    }
    if (!alive(my) || (e instanceof Stop && e.kind === 'cancel')) { run.seq = Math.max(run.completed || 0, (run.seq || 1) - 1); a.no = null; a.draw = null; a.verdict = 'cancelled'; a.note = '已停止（后台继续识别收尾）'; changed(); return; }
    if (e?.code === 'COMPAT_STOP_FAILED') { a.verdict = 'error'; a.note = e.message; halt(e); return; }
    run.seq = Math.max(run.completed || 0, (run.seq || 1) - 1); a.no = null; a.draw = null;
    a.verdict = 'skipped'; a.note = String(e?.message || e).slice(0, 160); run.skips++; run.skipTotal = (run.skipTotal || 0) + 1;
    log('本轮识别暂缓（不计入抽卡次数），已转入后台排队延续识别并自动补抽：' + a.note, 'warn');
    if (a.sid) {
      try {
        const ch = typeof Chats !== 'undefined' ? Chats.get(a.sid) : null;
        if (ch && isOpenThinkingChat(ch) && (run?.settings || settings()).skipCompatThinking !== false) {
          killOpenSourceThinkingChat(a.sid, ch);
          return;
        }
        if (ch && typeof BillingProbe !== 'undefined' && BillingProbe.applyReverseIdentity) {
          BillingProbe.applyReverseIdentity(ch, { interactive: false, forceLock: true, fallbackQuestionMark: true });
        }
        if (typeof BillingProbe !== 'undefined' && BillingProbe.enqueueIdent) {
          BillingProbe.enqueueIdent(a.sid, { fromGacha: true });
        }
      } catch {}
    }
  }
  async function settleBackgroundChat(sid, c) {
    if (!sid) return null;
    const ch = c || (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
    const s = run?.settings || settings();
    if (s.skipCompatThinking !== false && isOpenThinkingChat(ch)) {
      killOpenSourceThinkingChat(sid, ch);
      const a = run?.attempts?.find(x => x && x.sid === sid);
      if (a) { a.verdict = 'archive'; a.archived = true; a.deleted = true; a.step = '已删开源'; a.pct = 100; changed(); }
      return 'open-archived';
    }
    const mi = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (!mi?.name || /^(未识别|未知型号|待定)$/.test(String(mi.name).trim())) return null;
    if (s.skipCompatThinking !== false && (mi.name === '开源模型' || isOpenSourceModelCand({ id: mi.reverseCandidateId, label: mi.rawLabel, canon: mi.name }))) {
      killOpenSourceThinkingChat(sid, ch);
      const a = run?.attempts?.find(x => x && x.sid === sid);
      if (a) { a.verdict = 'archive'; a.archived = true; a.deleted = true; a.step = '已删开源'; a.pct = 100; changed(); }
      return 'open-archived';
    }
    const canonName = Strength.canon(mi.name).replace(/[?？]+$/, '');
    const idObj = { name: canonName, internal: mi.internal || mi.reverseCandidateId || canonName, request: mi.request, response: mi.response || canonName, tier: mi.tier, guess: false };
    const v = classify(idObj, s);
    const a = run?.attempts?.find(x => x && x.sid === sid);
    if (a) {
      a.model = mi.name;
      a.tier = mi.tier || Strength.parts(canonName).tier || null;
      a.guess = false;
      a.verdict = v;
      a.done = true;
      a.phase = '';
      changed();
    }
    try { if (typeof Titles !== 'undefined' && Titles.capture) Titles.capture(sid, a?.sentAt || ch?.sentAt || now()); } catch {}
    if (v === 'archive' && !hitlIn(ch)) {
      try {
        await History.archive(sid);
        if (a) a.archived = true;
        changed();
        return 'archived';
      } catch {
        if (run) {
          run.archiveQueue = [...new Set([...(run.archiveQueue || []), sid])].slice(-200);
          retrySoon();
        }
      }
    }
    return v;
  }
  // 抽卡对话里出现了交互面板（ask_user 等）：保留这个对话，不跳过、不归档、不做任何操作
  const hitlIn = c => !!c && !c._wasGachaAutoQA && [...(c.messages || []), c.live].filter(Boolean).some(m => m.role === 'assistant' && (m.parts || []).some(p => Hitl.name(p)));
  function killOpenSourceThinkingChat(sid, c) {
    if (!sid) return;
    try { c?.stop?.({ strict: false })?.catch?.(() => {}); } catch {}
    try {
      if (typeof History !== 'undefined' && History && typeof History.remove === 'function') {
        if (Array.isArray(History.items)) History.items = History.items.filter(x => x.id !== sid);
        try { History.bury?.([sid]); } catch {}
        try { if (typeof Models !== 'undefined' && Models.all?.[sid]) { delete Models.all[sid]; Store.set('models', Models.all); } } catch {}
        try { AcctStats?.report?.(); } catch {}
        try { if (typeof Tabs !== 'undefined' && Tabs?.close) Tabs.close(sid); } catch {}
        try { if (typeof Pager !== 'undefined') Pager.drop?.(sid); } catch {}
        try { if (typeof TabSw !== 'undefined' && TabSw.isOpen?.() && TabSw.el) { TabSw.el.querySelector(`.tsw-slot[data-sid="${sid}"]`)?.remove(); } } catch {}
        try { if (typeof Bus !== 'undefined' && Bus?.emit) Bus.emit('history', History.items); } catch {}
        const fire = () => {
          try { History.archive?.(sid)?.catch?.(() => {}); } catch {}
          try { History.remove?.(sid)?.catch?.(() => {}); } catch {}
        };
        fire();
        setTimeout(fire, 1200);
        setTimeout(fire, 3500);
      }
    } catch {}
  }
  // 收尾：等这一抽的对话自己结束（识别可能先于完整型号 / 交互面板出现），再按最终型号复核一次分类，然后归档
  async function settle(a, verdict) {
    if (!a.sid) return;
    const c = Chats.get(a.sid), s = run?.settings || settings(), r0 = run;
    if (a.fingerprint) {
      const isOpenSourceThink = typeof ProbeArchive !== 'undefined' && ProbeArchive.thinking(a.fingerprint);
      const canDirectDelete = isOpenSourceThink && typeof History !== 'undefined' && typeof History.remove === 'function';
      // Completed blacklist decisions share the normal archive/retry path.
      if ((!a.fingerprint.error || a.fingerprint.skipped) && !canDirectDelete) {
        try { Titles.capture(a.sid, a.sentAt); }
        catch (e) { a.note = '指纹结果已保存，名称排队失败：' + describe(e); }
      }
      if(isOpenSourceThink){
        a.verdict='archive';delete a.kept;ProbeArchive.consider(c||{sid:a.sid},{fingerprint:a.fingerprint});
        if (canDirectDelete) {
          killOpenSourceThinkingChat(a.sid, c);
          a.archived = true; a.deleted = true; a.step = '已删开源'; a.pct = 100;
        }
      } else {
        const latest = Models.get(a.sid) || {name:a.model,guess:a.guess,fingerprint:a.fingerprint};
        a.verdict = classify(latest, s);
        if (a.verdict === 'archive') await archiveAttempt(a, c);
        else a.kept = 'fingerprint';
      }
      return;
    }
    const until = now() + 180000;
    while (c && c.busy && now() < until) await sleep(800);
    // 按回复格式推测落定的：真实型号（运行令牌 / Trace）可能稍后才到，最多再等 40 秒，到了就按真实型号改正
    for (let i = 0; i < 50 && a.guess; i++) { const m = Models.get(a.sid); if (m?.name && !m.guess) break; await sleep(800); }
    a.gw = true;
    // 识别时只有部分信息（还没拿到内部名称 / 档位）：最多再等 40 秒拿完整型号
    for (let i = 0; i < 50 && (a.partial || a.guess); i++) { const m = Models.get(a.sid); if (!m?.name || m.guess || !m.partial) break; await sleep(800); }
    if (r0 !== run || !run) return;
    const mi = Models.get(a.sid);
    if (a.guess && mi?.name && !mi.guess) {
      const id = { name: Strength.canon(mi.name), internal: mi.internal, request: mi.request, response: mi.response, tier: mi.tier, routed: mi.routed, partial: mi.partial };
      const v2 = classify(id, s), was = a.model, L = { hit: '命中', keep: '保留', archive: '归档' };
      Object.assign(a, { guess: false, model: id.name, tier: mi.tier || Strength.parts(id.name).tier || null, partial: !!mi.partial, power: null, csWhy: null, rev: (a.rev || 0) + 1, fixed: was });
      log('#' + a.draw + ' 真实型号到了：' + was + ' → ' + id.name + (id.tier ? ' · ' + id.tier : '') + (v2 !== verdict ? '，' + (L[verdict] || verdict) + ' → ' + (L[v2] || v2) : ''));
      if (verdict === 'hit' && v2 !== 'hit') { const i = (run.hits || []).lastIndexOf(was); if (i >= 0) run.hits.splice(i, 1); }
      if (v2 === 'hit' && verdict !== 'hit') {
        run.hits = [...(run.hits || []), id.name].slice(-50);
        log('命中目标：' + id.name + '（已命中 ' + run.hits.length + ' 次）');
        try { if (!document.hidden && !GSlot.visible()) toast('🎯 抽中 ' + id.name); } catch {}
        if (s.stopOnHit && run.status === 'running') setTimeout(() => finish('hit', '命中目标 ' + id.name + '，已按设置停止（共 ' + run.completed + ' 抽）'), 0);
      }
      a.verdict = verdict = v2; changed();
    } else if (mi?.name) {
      const id = { name: Strength.canon(mi.name), internal: mi.internal, request: mi.request, response: mi.response };
      const v2 = classify(id, s);
      if (v2 !== verdict && verdict !== 'hit' && v2 !== 'hit') {
        log('#' + a.draw + ' 按完整型号 ' + id.name + ' 复核：' + ({ keep: '保留', archive: '归档' }[verdict]) + ' → ' + ({ keep: '保留', archive: '归档' }[v2]));
        a.verdict = verdict = v2; a.model = id.name; a.tier = mi.tier || Strength.parts(id.name).tier || a.tier; a.partial = !!mi.partial; changed();
      }
    }
    try { if (Models.get(a.sid)?.name && !Models.get(a.sid)?.guess) Titles.capture(a.sid, a.sentAt); } catch {}
    if (verdict !== 'archive') return;
    await archiveAttempt(a, c);
  }
  async function archiveAttempt(a, c) {
    if (c?.busy || Models.get(a.sid)?.fingerprint?.stopConfirmed === false) {
      run.archiveQueue = [...new Set([...(run.archiveQueue || []), a.sid])].slice(-200); retrySoon(); return;
    }
    if (hitlIn(c || Chats.get(a.sid))) { a.kept = 'hitl'; a.note = '出现交互面板，已保留（未归档）'; log('#' + a.draw + ' 出现交互面板（ask_user 等），保留这个对话，不做任何操作'); changed(); return; }
    delete a.kept;
    try { await History.archive(a.sid); a.archived = true; }
    catch (e) { a.note = '归档失败 ' + describe(e); run.archiveQueue = [...new Set([...(run.archiveQueue || []), a.sid])].slice(-200); log(a.note + '（稍后自动重试）', 'warn'); retrySoon(); }
  }
  // 归档失败的：抽卡进行中也每 45 秒补一次（以前要等抽卡结束才补，持续抽卡时一直不归档）
  let retryT = 0;
  function retrySoon() { if (retryT) return; retryT = setTimeout(async () => { retryT = 0; if (run?.archiveQueue?.length) { await archiveQueued(false).catch(() => {}); if (run?.archiveQueue?.length) retrySoon(); } }, 45000); }
  async function archiveQueued(manual) {
    if (!run) return 0;
    const todo = [...new Set([...(run.archiveQueue || []), ...(manual ? run.attempts.filter(a => a.verdict === 'archive' && a.sid && !a.archived && !a.kept).map(a => a.sid) : [])])];
    let n = 0; const left = [];
    for (const sid of todo) {
      const attempt = run.attempts.find(a => a.sid === sid), latest = Models.get(sid);
      if (attempt?.fingerprint && !ProbeArchive.thinking(attempt.fingerprint) && classify(latest || {name:attempt.model,guess:attempt.guess,fingerprint:attempt.fingerprint}, run.settings) !== 'archive') {
        attempt.verdict = 'keep'; attempt.kept = 'fingerprint'; continue;
      }
      if (Chats.get(sid)?.busy || Models.get(sid)?.fingerprint?.stopConfirmed===false) { left.push(sid); continue; } if (hitlIn(Chats.get(sid))) { const a = run.attempts.find(x => x.sid === sid); if (a) { a.kept = 'hitl'; } continue; } try { await History.archive(sid); n++; const a = run.attempts.find(x => x.sid === sid); if (a) a.archived = true; } catch { left.push(sid); } await sleep(300); }
    run.archiveQueue = left; if (todo.length) log('整理完成：归档 ' + n + '/' + todo.length + ' 个抽卡产生的对话'); changed(); return n;
  }
  const dropFlights = () => { for (const f of flights) { try { f.ctl.abort(); } catch {} } };

  // ----- 持续抽卡：不限次数，限流 / 额度 / 人机验证 / 异常时等待后自动继续，直到手动停止 -----
  const ENDLESS_WAIT = ['RATE_LIMIT', 'QUOTA', 'CAPTCHA', 'SKIPS', 'HTTP'];
  const endlessOk = e => e instanceof Stop && e.kind !== 'cancel' && ENDLESS_WAIT.includes(e.code);
  async function endlessWait(my, e) {
    const code = e.code, what = { RATE_LIMIT: '限流', QUOTA: '额度不足', CAPTCHA: '人机验证', SKIPS: '连续多次未完成', HTTP: '新建对话失败' }[code] || code;
    run.pauses = (run.pauses || 0) + 1; run.pauseStreak = (run.pauseStreak || 0) + 1;
    const back = Math.min(900e3, (code === 'RATE_LIMIT' || code === 'QUOTA' ? 60e3 : 20e3) * 2 ** Math.min(6, run.pauseStreak - 1));
    const deadline = Quota.blockedUntil(true);
    const until = deadline > now() ? deadline : now() + (code === 'RATE_LIMIT' ? 30000 : back);
    log('持续抽卡：' + what + '，' + mmss(until - now()) + '后自动继续（已抽 ' + run.completed + ' 次）' + (code === 'RATE_LIMIT' ? '；保持节点和 IP，遵守限流等待' : ''), 'warn');
    const byIp = false, ip0 = IP.ip; run.waitUntil = until; run.waitIp = byIp;
    IP.fast = true; if (byIp) IP.poll();
    try {
      while (alive(my)) {

        if (code === 'CAPTCHA' && !run.needCaptcha) break;
        const left = until - now(); if (left <= 0) break;
        phase((code === 'CAPTCHA' ? '需要人机验证（点「完成验证」立即继续）· ' : '持续抽卡 · ' + what + ' · ') + mmss(left) + '后自动继续' + (byIp ? '（换 IP 立即继续）' : ''));
        await sleep(Math.min(1000, left));
      }
    } finally { IP.fast = false; run.waitUntil = 0; }
    if (!alive(my)) return;
    run.skips = 0; run.skipTotal = 0; run.code = null; if (code === 'CAPTCHA') { run.needCaptcha = false; run.capAlerted = false; run.capOpened = false; }
    log('持续抽卡：继续抽卡');
  }

  async function loop(my) {
    try {
      while (alive(my)) {
        try {
          const s = run.settings, par = s.turbo ? Math.max(1, Math.min(5, s.parallel || 3)) : 1;
          if (!s.endless && run.completed >= s.maxAttempts) { const h = run.hits || []; finish(h.length ? 'hit' : 'done', '已完成 ' + run.completed + '/' + s.maxAttempts + ' 抽' + (h.length ? '，命中 ' + h.length + ' 次：' + [...new Set(h)].join('、') : '，未命中目标')); break; }
          if (run.skips >= 8) {
            // 连续 8 次没完成：先自己处理，不直接停 —— 暂停一会儿（第 2 次起顺便换一个同地区的 ProxyIP），最多自救 3 轮
            if ((run.skipHeal || 0) < 3) {
              run.skipHeal = (run.skipHeal || 0) + 1; const w = 30000 * run.skipHeal;
              log('连续 ' + run.skips + ' 次未完成：自动处理（第 ' + run.skipHeal + '/3 轮），暂停 ' + Math.round(w / 1000) + ' 秒' + (run.skipHeal >= 2 ? '并换一个 ProxyIP' : '') + '后继续', 'warn');
              if (run.skipHeal >= 2) { try { const acct = (await Host.info().catch(() => null))?.account; await Pool.load(true); if (acct?.region && Pool.canRotate?.(acct)) { const r = await Pool.acquire(acct, acct.region, { exclude: new Set([String(acct.proxyIp || '').trim()]), log: t => log(t) }); if (r.ok) { log('已换到 ProxyIP ' + r.to); try { UI.host = await Host.info(); } catch {} } } } catch {} }
              phase('连续未完成 · 自动处理中，' + Math.round(w / 1000) + ' 秒后继续');
              await waitFor(() => false, w, my, 300); run.skips = 0; run.tErr = 0; continue;
            }
            fatal('SKIPS');
          }
          if (!s.endless && (run.skipTotal || 0) > Math.max(10, s.maxAttempts * 2)) fatal('SKIPS', '补抽次数过多（' + run.skipTotal + ' 次）');
          if ((!s.endless && run.completed + flights.size >= s.maxAttempts) || flights.size >= par) {
            const txt = '后台识别中 · ' + flights.size + ' 路'; phase(txt);
            const n0 = flights.size, c0 = run.completed; await waitFor(() => flights.size !== n0 || run.completed !== c0 || null, 1500, my, 80); continue;
          }
          if (run.skips >= 2) { const w = Math.min(40000, 5000 * 2 ** (run.skips - 2)); phase('连续 ' + run.skips + ' 次未完成，' + Math.round(w / 1000) + ' 秒后补抽'); const k0 = run.skips; await waitFor(() => run.skips < k0 || null, w, my, 200); if (!alive(my)) break; }
          if (run.needCaptcha) {
            // 尽量不打扰你：分数低多半是抽得太密 → 先自动冷却两次（约 40 秒、2 分钟）再用新令牌重试；都不行才暂停请你验证。
            // 等你验证期间也每 ~4 分钟自动重试一次，通过了就自动关掉验证框继续抽；本工具不会替你点验证框。
            const AUTO = [40e3, 120e3];
            if ((run.capAuto || 0) < AUTO.length) {
              const w = Math.round(AUTO[run.capAuto || 0] * (0.85 + Math.random() * 0.3)); run.capAuto = (run.capAuto || 0) + 1;
              phase('验证分数低：自动冷却 ' + Math.round(w / 1000) + ' 秒后重试（' + run.capAuto + '/' + AUTO.length + '，不用操作）');
              log('人机验证未通过：先自动冷却 ' + Math.round(w / 1000) + ' 秒再用新令牌重试（第 ' + run.capAuto + '/' + AUTO.length + ' 次），仍不行才请你验证', 'warn');
              run.capCooling = true; changed(); try { await waitFor(() => !run.needCaptcha || null, w, my, 300); } finally { run.capCooling = false; changed(); } if (!alive(my)) break;
              if (run.needCaptcha) { run.needCaptcha = false; run.capProbe = true; }
            } else {
              phase('需要人机验证：已暂停，验证后自动继续；期间每 4 分钟自动重试');
              capAlert();
              const t0 = now(), lim = s.endless ? 3600e3 : 1800e3; let ok = false, probed = false;
              while (alive(my) && now() - t0 < lim) {
                ok = await waitFor(() => !run.needCaptcha, Math.min(capProbeMs(), lim - (now() - t0)), my, 300);
                if (ok || !alive(my) || now() - t0 >= lim) break;
                const n0 = run.attempts.length; run.needCaptcha = false; run.capProbe = true;
                log('等待验证中：自动用新令牌重试一次（不用操作）'); phase('等待人机验证 · 自动重试中');
                await launch(my); run.capProbe = false;
                const a = run.attempts[run.attempts.length - 1];
                if (!run.needCaptcha && run.attempts.length > n0 && a && a.verdict !== 'skipped' && a.verdict !== 'error') {
                  Recaptcha.v2Close?.(); run.capAlerted = false; run.capOpened = false; run.capAuto = 0; run.capStreak = 0;
                  log('自动重试通过：已关掉验证框，继续抽卡（这次不用你验证）'); ok = probed = true; break;
                }
                run.needCaptcha = true; phase('需要人机验证：已暂停，验证后自动继续；期间每 4 分钟自动重试');
              }
              if (!alive(my)) break; if (!ok) fatal('CAPTCHA');
              if (probed) continue;
            }
          }
          const bu = Quota.blockedUntil(true);
          if (bu > now()) {
            const leftBu = bu - now();
            if (leftBu <= 180000) {
              phase('服务端 429 速率限制等待 · ' + mmss(leftBu) + '后自动继续（不计数，保持当前 IP）');
              await waitFor(() => Quota.blockedUntil(true) <= now() || null, leftBu, my, 400);
              if (!alive(my)) break;
              try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
              continue;
            }
            fatal('RATE_LIMIT', (Quota.blockedUntil() > now() ? '服务端要求等待，约 ' : '自动抽卡短暂退避，约 ') + mmss(leftBu) + '后重试');
          }
          // Deprecated dollar-balance data must not stop draws; real create-chat quota/rate limits still apply.
          await launch(my); run.capProbe = false;
          if (!run.needCaptcha) run.capAuto = 0;
        } catch (e) {
          if (alive(my) && run.settings?.endless && endlessOk(e)) { await endlessWait(my, e); continue; }
          throw e;
        }
      }
    } catch (e) { if (my === token) halt(e); }
    finally {
      if (my === token && run?.status === 'stopping') { run.status = 'stopped'; run.reason = '已手动停止'; run.endedAt = now(); run.phase = ''; changed(); }
      if (run && run.status !== 'running' && run.archiveQueue?.length) void archiveQueued(false);
    }
  }
  function halt(e) {
    if (!run || !['running', 'stopping'].includes(run.status)) return;
    token++; dropFlights();
    if (e instanceof Stop && e.kind === 'cancel') { run.status = 'stopped'; run.reason = run.reason || '已手动停止'; }
    else { run.status = 'stopped'; run.code = e?.code || 'ERROR'; run.reason = e?.message || String(e); log(run.reason, 'error'); }
    run.endedAt = now(); run.phase = ''; run.ipOld = null;
    if (ipLimited()) { run.ipOld = IP.ip || null; run.reason = '当前 IP' + (IP.ip ? ' ' + IP.ip : '') + ' 收到限流（HTTP 429）：等待 Retry-After / 退避后手动重试；不会换 IP 立即继续'; IP.fast = true; IP.poll(); }
    changed();
  }
  const ipLimited = () => !!run && run.status === 'stopped' && run.code === 'RATE_LIMIT';
  // IP 变化只记录，不清除限流或自动重发。
  Bus.on('ipchange', (ip, prev) => {
    if (!run) return;
    log('IP 已变更：' + (prev || '未知') + ' → ' + ip);

  });
  async function ipRetry() {
    if (!ipLimited()) return { ok: false, error: '当前不是 IP 限流停止' };
    const until=Quota.blockedUntil(); if(until>now())return {ok:false,error:'仍需等待 '+mmss(until-now())+'，不能通过换 IP 提前继续'};
    const res=start();if(res.ok)log('限流等待期结束，按用户操作重新开始');
    return res;
  }
  function finish(status, reason) { if (!run) return; token++; dropFlights(); run.status = status; run.reason = reason; run.phase = ''; run.endedAt = now(); log(reason); changed(); }
  function start() {
    const limitedUntil=Quota.blockedUntil();
    if(limitedUntil>now())return {ok:false,error:'仍在限流等待期，请在 '+mmss(limitedUntil-now())+' 后重试；换 IP 不会清除等待'};
    if(typeof FingerprintBatch!=='undefined'&&FingerprintBatch.busy)return {ok:false,error:'请先停止批量测指纹'};
    if(typeof RegionIP!=='undefined'&&RegionIP.busy)return {ok:false,error:'正在切换 IP，请等待结果后再开始抽卡'};
    if (run && ['running', 'stopping'].includes(run.status)) return { ok: false, error: '抽卡正在进行' };
    if (!UI.me) return { ok: false, error: '请先登录' };
    const s = settings();
    if (typeof AutoRoute !== 'undefined' && AutoRoute.ensureStandby) AutoRoute.ensureStandby('gacha-start');
    const carry = run ? [...new Set([...(run.archiveQueue || []), ...(run.attempts || []).filter(a => a.verdict === 'archive' && a.sid && !a.archived && !a.kept).map(a => a.sid)])].slice(-200) : [];
    run = { id: Math.random().toString(36).slice(2), status: 'running', startedAt: now(), settings: s, completed: 0, skips: 0, skipTotal: 0, hits: [], attempts: [], log: [], phase: '', reason: '', archiveQueue: carry, seq: 0 };
    log(s.endless ? '开始持续抽卡 · 不限次数，限流时等待后自动继续，直到手动停止' : '开始抽卡 · 共 ' + s.maxAttempts + ' 抽' + (s.targetName ? ' · 目标 ' + s.targetName : ' · 不限厂商'));
    if (s.fingerprint) log('英文动态指纹：默认1条；首次候选命中优选名单才补测至3条；不追加SVG，不纳入固定题个人参考库；结果保留，置信度不是身份概率');
    else if (s.mode === 'habit') log('习惯速测模式：单轮两步微缩探针（35~45行 HTML+SVG + 终端校验 + 中文要点），免 /cost 极速匹配 20 维习惯指纹');
    else if (s.mode === 'autoqa') log('自动问答模式：首轮两步微缩探针 + 习惯/反推双引擎智能锁定');
    else log(s.mode === 'svg' ? 'SVG模式：每次发送不同的英文鹈鹕动画指令' : '自定义模式：四位随机数 + 提示词；本机同提示词前缀不重复');
    const my = ++token; changed(); void loop(my); return { ok: true };
  }
  function stop() {
    if (!run || run.status !== 'running') return;
    dropFlights(); run.status = 'stopping'; run.reason = '已手动停止'; token++; changed();
    setTimeout(() => { if (run?.status === 'stopping') { run.status = 'stopped'; run.endedAt = now(); run.phase = ''; changed(); } }, 300);
  }
  function reset() { if (run && ['running', 'stopping'].includes(run.status)) return; run = null; changed(); }
  function resume() { if (run?.autoResume && (!['habit','autoqa','svg','custom','fingerprint'].includes(run.settings?.mode) || !Array.isArray(run.settings?.preferredKeywords) || (run.settings?.fingerprint !== true && settings().fingerprint))) { run.autoResume = false; run.status = 'stopped'; run.reason = '抽卡模式已升级，请确认三模式及优选设置后手动开始'; changed(); return; } if (run?.autoResume && run.status === 'running') { run.autoResume = false; log('界面重新载入，持续抽卡自动继续'); const my = ++token; setTimeout(() => void loop(my), 1500); } else if (run && run.status !== 'running' && run.archiveQueue?.length) setTimeout(() => void archiveQueued(false), 5000); }
  const busy = () => !!run && ['running', 'stopping'].includes(run.status);
  // 老虎机：结果按识别先后排队展示，每个至少停留一会儿；没有待展示的结果时显示最新一轮
  const show = { a: null, since: 0 };
  function showing() {
    if (!run) return null;
    const res = run.attempts.filter(x => x.done && ['hit', 'keep', 'archive'].includes(x.verdict) && !x.seen).sort((x, y) => x.draw - y.draw);
    const cur = show.a && run.attempts.includes(show.a) ? show.a : null, dwell = now() - show.since;
    if (cur && cur.done && !cur.seen) {
      const next = res.find(x => x !== cur);
      if (next && (document.hidden || dwell > 1800)) { cur.seen = true; show.a = next; show.since = now(); return next; }
      const pend = run.attempts.filter(x => !x.done && x.sid);
      if (!next && run.status === 'running' && pend.length && dwell > 3500) { cur.seen = true; show.a = null; }
      else return cur;
    }
    if (res.length) { show.a = res[0]; show.since = now(); return res[0]; }
    return run.attempts.filter(x => !x.done).at(-1) || run.attempts.filter(x => x.done && x.model).at(-1) || null;
  }
  return {
    QUANTITIES, VENDORS, DEFAULTS, vendorBy, settings, save, setVendor, setSync, pullBl, pullOwn, loadAcct, classify, strOk, match: (t, w) => has(t, w), start, stop, reset, resume, ipRetry, ipLimited, archiveQueued, solveCaptcha, openCaptcha: () => { if (run?.needCaptcha && !solving) { run.capOpened = false; capOpen(); } }, get solving() { return !!solving; }, needCaptcha: () => !!run && busy() && !!run.needCaptcha && !run.capCooling, capCooling: () => !!run && busy() && !!run.capCooling, capOffer: () => !!run && busy() && (!!run.needCaptcha || (!!run.capAt && now() - run.capAt < 300000 && !v2Token)), showing, busy, note: t => log(t, 'warn'),
    noteArchived(sid) { const a=run?.attempts.find(a=>a.sid===sid);if(a){a.archived=true;a.verdict='archive';delete a.kept;changed();} },
    stepInfo(a) {
      if (!a || a.done) return null;
      const p = String(a.phase || '');
      let text = a.step || '', pct = Number(a.pct) || 0;
      if (!text || !(pct > 0)) {
        const m = /第\s*(\d)\s*\/\s*(\d)/.exec(p);
        if (/验证|reCAPTCHA|令牌被拒/i.test(p)) { text = '验证'; pct = 8; }
        else if (/新建|创建/i.test(p)) { text = '建连'; pct = 12; }
        else if (/等待运行|启动/i.test(p)) { text = '启动'; pct = 18; }
        else if (m) {
          const r = +m[1] || 1;
          if (/追问|发送|提问/.test(p)) { text = r + '/3 提问'; pct = r === 1 ? 20 : r === 2 ? 48 : 75; }
          else if (/反推|计费/.test(p)) { text = r + '/3 反推'; pct = r === 1 ? 38 : r === 2 ? 68 : 92; }
          else { text = r + '/3 回复'; pct = r === 1 ? 28 : r === 2 ? 58 : 84; }
        } else if (/跳过|开源/.test(p)) { text = '跳开源'; pct = 95; }
        else if (/等运行令牌/.test(p)) { text = '等令牌'; pct = 65; }
        else if (/识别|格式|打分/.test(p)) { text = '识别中'; pct = 76; }
        else { text = p ? p.slice(0, 5) : '进行中'; pct = 30; }
      }
      const stepRes = { text, pct: Math.max(6, Math.min(100, pct)), phase: p || text, active: true, no: a.no };
      return stepRes;
    },
    stepOf(sid) {
      if (!sid) return null;
      if (run && ['running', 'stopping'].includes(run.status)) {
        const a = (run.attempts || []).findLast(x => x && x.sid === sid && !x.done);
        if (a) return this.stepInfo(a);
      }
      return null;
    },
    isGachaChat: isGachaCreatedChat,
    markCreatedSid: markGachaCreatedSid,
    killOpenSourceThinkingChat,
    settleBackgroundChat,
    get run() { return run; }, get rev() { return rev; }, get flights() { return flights.size; },
    owns: sid => gachaCreatedSet.has(sid) || (!!run && run.attempts.some(a => a.sid === sid)),
  };
})();
