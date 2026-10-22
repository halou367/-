// 模式切换（Max/Battle/Direct）、官方模型目录与 Evaluation 对战/直连双通道流式引擎
const ModeState = {
  // 主模式：'agent' (Max/Agent 模式) | 'battle' (双匿名模型盲测) | 'direct' (单模型直连)
  mode: 'agent',
  // 测试模态：'video' | 'image' | 'search' | 'webdev' | 'chat' | 'auto'
  modality: 'chat',
  // Direct 模式当前选中的模型 ID 与元数据
  directModelId: null,
  directModelMeta: null,
  _inited: false,

  BATTLE_MODALITIES: ['video', 'image', 'search', 'webdev', 'chat', 'auto'],
  DIRECT_MODALITIES: ['image', 'search', 'webdev', 'chat'],

  init() {
    if (this._inited) return this;
    this._inited = true;
    try {
      const saved = typeof Store !== 'undefined' && Store.get ? Store.get('ui.modeState', null) : null;
      if (saved && typeof saved === 'object') {
        if (['agent', 'battle', 'direct'].includes(saved.mode)) this.mode = saved.mode;
        if (this.BATTLE_MODALITIES.includes(saved.modality)) this.modality = saved.modality;
        if (saved.directModelId) this.directModelId = String(saved.directModelId);
        if (saved.directModelMeta && typeof saved.directModelMeta === 'object') {
          this.directModelMeta = saved.directModelMeta;
        }
      }
    } catch {}
    if (this.mode === 'direct' && (this.modality === 'auto' || this.modality === 'video')) {
      this.modality = 'chat';
    }
    this._ensureDirectModelValid();
    return this;
  },

  _ensureDirectModelValid() {
    try {
      if (typeof ModelCatalog === 'undefined') return;
      const mod = (this.modality === 'auto' || this.modality === 'video') ? 'chat' : (this.modality || 'chat');
      const list = ModelCatalog.getModelsForModality(mod);
      if (!Array.isArray(list) || !list.length) return;
      const rawId = this.directModelId ? String(this.directModelId).trim() : '';
      const rawTail = rawId.includes('/') ? rawId.split('/').pop() : rawId;
      const found = rawId
        ? list.find(m => m.id === rawId || m.slug === rawId || m.name === rawId || m.name === rawTail || (Array.isArray(m.aliases) && (m.aliases.includes(rawId) || m.aliases.includes(rawTail))))
        : null;
      const picked = found || list[0];
      if (picked) {
        this.directModelId = picked.id;
        this.directModelMeta = picked;
      }
    } catch {}
  },

  save() {
    try {
      if (typeof Store !== 'undefined' && Store.set) {
        Store.set('ui.modeState', {
          mode: this.mode,
          modality: this.modality,
          directModelId: this.directModelId,
          directModelMeta: this.directModelMeta,
          updatedAt: Date.now(),
        });
      }
    } catch {}
  },

  getMode() {
    if (!this._inited) this.init();
    return this.mode || 'agent';
  },

  setMode(nextMode, opts = {}) {
    if (!this._inited) this.init();
    const m = String(nextMode || '').toLowerCase();
    if (!['agent', 'battle', 'direct'].includes(m)) return this.snapshot();
    const prevMode = this.mode;
    const prevMod = this.modality;
    this.mode = m;
    if (this.mode === 'direct' && (this.modality === 'auto' || this.modality === 'video')) {
      this.modality = 'chat';
    }
    if (this.mode === 'direct') {
      this._ensureDirectModelValid();
      try { if (typeof ModelCatalog !== 'undefined') void ModelCatalog.ensureLoaded(); } catch {}
    }
    this.save();
    if (!opts.silent && typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
      if (prevMod !== this.modality) {
        try { Bus.emit('modalitychange', this.snapshot()); } catch {}
      }
      if (prevMode !== this.mode || opts.forceEmit) {
        try { Bus.emit('modechange', this.snapshot()); } catch {}
        try { Bus.emit('history'); } catch {}
      }
    }
    return this.snapshot();
  },

  getModality() {
    if (!this._inited) this.init();
    if (this.mode === 'direct' && (this.modality === 'auto' || this.modality === 'video')) {
      return 'chat';
    }
    return this.modality || 'chat';
  },

  setModality(nextModality, opts = {}) {
    if (!this._inited) this.init();
    let mod = String(nextModality || '').toLowerCase();
    if (!this.BATTLE_MODALITIES.includes(mod)) return this.snapshot();
    if (this.mode === 'direct' && (mod === 'auto' || mod === 'video')) {
      mod = 'chat';
    }
    const prev = this.modality;
    this.modality = mod;
    if (this.mode === 'direct') {
      this._ensureDirectModelValid();
    }
    this.save();
    if (!opts.silent && (prev !== this.modality || opts.forceEmit) && typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
      try { Bus.emit('modalitychange', this.snapshot()); } catch {}
    }
    return this.snapshot();
  },

  getDirectModel() {
    if (!this._inited) this.init();
    if (typeof ModelCatalog !== 'undefined') {
      if (this.directModelId) {
        const byId = ModelCatalog.getModelById(this.directModelId);
        if (byId) {
          this.directModelMeta = byId;
          return byId;
        }
      }
      if (this.directModelMeta) return this.directModelMeta;
      const list = ModelCatalog.getModelsForModality(this.getModality());
      if (Array.isArray(list) && list.length) {
        this.directModelId = list[0].id;
        this.directModelMeta = list[0];
        return list[0];
      }
    }
    return this.directModelMeta;
  },

  setDirectModel(modelOrId, opts = {}) {
    if (!this._inited) this.init();
    let meta = null;
    if (modelOrId && typeof modelOrId === 'object') {
      meta = modelOrId;
      this.directModelId = String(modelOrId.id || modelOrId.name || '');
    } else if (modelOrId) {
      const idStr = String(modelOrId);
      this.directModelId = idStr;
      if (typeof ModelCatalog !== 'undefined') {
        meta = ModelCatalog.getModelById(idStr);
      }
    }
    if (meta) this.directModelMeta = meta;
    this.save();
    const cur = this.getDirectModel();
    if (!opts.silent && typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
      try { Bus.emit('directmodelchange', cur); } catch {}
    }
    return cur;
  },

  snapshot() {
    if (!this._inited) this.init();
    return {
      mode: this.getMode(),
      modality: this.getModality(),
      directModelId: this.directModelId,
      directModelMeta: this.getDirectModel(),
    };
  },

  inferEntryMode(entry) {
    if (!entry || typeof entry !== 'object') return 'agent';
    if (
      entry.type === 'evaluation' ||
      entry.mode === 'battle' ||
      entry.mode === 'direct' ||
      entry.mode === 'direct-battle' ||
      entry.mode === 'side-by-side'
    ) {
      if (
        entry.mode === 'direct' ||
        entry.mode === 'direct-battle' ||
        entry.mode === 'side-by-side' ||
        (entry.modelAId && !entry.modelBId && entry.mode !== 'battle')
      ) {
        return 'direct';
      }
      return 'battle';
    }
    return 'agent';
  },

  matchesHistoryEntry(entry, targetMode = this.getMode()) {
    if (!entry) return false;
    const target = targetMode || this.getMode();
    return this.inferEntryMode(entry) === target;
  },
};

let cachedWebDeploymentId = 'dpl_8Gb6m6m38M8S2WQCSdYVhF5iPnfC';
try {
  if (typeof Store !== 'undefined' && Store.get) {
    const savedDpl = Store.get('eval:webDplId', '');
    if (savedDpl && /^dpl_[A-Za-z0-9]+$/.test(savedDpl) && savedDpl !== 'dpl_6nPiGVx1iAXDm3emfbFNUFD8Zy1E') {
      cachedWebDeploymentId = savedDpl;
    }
  }
} catch {}

const updateWebDeploymentIdFromHtml = (html) => {
  if (!html || typeof html !== 'string') return cachedWebDeploymentId;
  const m = /[?&]dpl=(dpl_[A-Za-z0-9]+)/.exec(html);
  if (m && m[1]) {
    cachedWebDeploymentId = m[1];
    try {
      if (typeof Store !== 'undefined' && Store.set) Store.set('eval:webDplId', cachedWebDeploymentId);
    } catch {}
  }
  return cachedWebDeploymentId;
};

const parseFlightStreamRows = (full) => {
  const textChunks = new Map();
  const jsonChunks = new Map();
  const parsedCache = new Map();
  if (!full || typeof full !== 'string') return { textChunks, jsonChunks, resolveRefs: v => v };
  let pos = 0;
  while (pos < full.length) {
    const colon = full.indexOf(':', pos);
    if (colon < 0) break;
    const rawId = full.slice(pos, colon).trim();
    const id = rawId.includes('\n') ? rawId.slice(rawId.lastIndexOf('\n') + 1).trim() : rawId;
    if (full[colon + 1] === 'T') {
      const comma = full.indexOf(',', colon + 2);
      if (comma < 0) break;
      const byteLen = parseInt(full.slice(colon + 2, comma), 16);
      if (Number.isFinite(byteLen) && byteLen > 0) {
        const restBuf = new TextEncoder().encode(full.slice(comma + 1));
        const strVal = new TextDecoder().decode(restBuf.slice(0, byteLen));
        textChunks.set(id, strVal);
        pos = comma + 1 + strVal.length;
        if (full[pos] === '\n') pos++;
        continue;
      }
    }
    const nl = full.indexOf('\n', colon + 1);
    const end = nl < 0 ? full.length : nl;
    const lineBody = full.slice(colon + 1, end).trim();
    if (id && lineBody) jsonChunks.set(id, lineBody);
    pos = end + 1;
  }

  const resolveRefs = (val, depth = 0) => {
    if (depth > 10 || val == null) return val;
    if (typeof val === 'string') {
      if (val === '$undefined') return undefined;
      if (val.startsWith('$D')) return val.slice(2);
      if (val.startsWith('$') && /^[@L]?[\da-f]+$/i.test(val.slice(1))) {
        const refId = val.replace(/^\$[@L]?/, '');
        if (textChunks.has(refId)) return textChunks.get(refId);
        if (parsedCache.has(refId)) return parsedCache.get(refId);
        if (jsonChunks.has(refId)) {
          let rawBody = jsonChunks.get(refId);
          if (rawBody && /^[A-Za-z][{\["]/.test(rawBody)) rawBody = rawBody.slice(1);
          if (rawBody && (rawBody.startsWith('{') || rawBody.startsWith('[') || rawBody.startsWith('"'))) {
            try {
              const p = JSON.parse(rawBody);
              const resolved = resolveRefs(p, depth + 1);
              parsedCache.set(refId, resolved);
              return resolved;
            } catch {}
          }
        }
      }
      return val;
    }
    if (Array.isArray(val)) return val.map(x => resolveRefs(x, depth + 1));
    if (typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = resolveRefs(v, depth + 1);
      return out;
    }
    return val;
  };

  return { textChunks, jsonChunks, resolveRefs };
};

const parseEvalFlightFromHtml = (html) => {
  if (!html || typeof html !== 'string') return { initialState: null, initialModels: null };
  updateWebDeploymentIdFromHtml(html);
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { chunks.push(JSON.parse(m[1])); } catch {}
  }
  if (!chunks.length) return { initialState: null, initialModels: null };
  const full = chunks.join('');
  const { jsonChunks, resolveRefs } = parseFlightStreamRows(full);

  let initialState = null;
  let initialModels = null;
  for (const [, body] of jsonChunks.entries()) {
    if (!initialState && body.includes('"initialState"') && body.includes('"messages"')) {
      try {
        const parsed = JSON.parse(body);
        const walk = (node) => {
          if (!node || typeof node !== 'object' || initialState) return;
          if (node.initialState && typeof node.initialState === 'object') {
            const candidate = resolveRefs(node.initialState);
            if (candidate && Array.isArray(candidate.messages)) {
              initialState = candidate;
              return;
            }
          }
          if (Array.isArray(node)) node.forEach(walk);
          else Object.values(node).forEach(walk);
        };
        walk(parsed);
      } catch {}
    }
    if (!initialModels && body.includes('"initialModels"')) {
      try {
        const parsed = JSON.parse(body);
        const walk = (node) => {
          if (!node || typeof node !== 'object' || initialModels) return;
          if (node.initialModels) {
            const candidate = resolveRefs(node.initialModels);
            if (Array.isArray(candidate) && candidate.length) {
              initialModels = candidate;
              return;
            }
          }
          if (Array.isArray(node)) node.forEach(walk);
          else Object.values(node).forEach(walk);
        };
        walk(parsed);
      } catch {}
    }
  }
  return { initialState, initialModels };
};

const ModelCatalog = (() => {
  const CACHE_KEY = 'eval.modelCatalog.v1';
  const CACHE_TTL = 10 * 60 * 1000;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ARENA_TO_MODALITY = {
    chat: 'chat',
    text: 'chat',
    vision: 'chat',
    document: 'chat',
    webdev: 'webdev',
    code: 'webdev',
    'image-to-code': 'webdev',
    image: 'image',
    'text-to-image': 'image',
    'image-edit': 'image',
    'multi-image-edit': 'image',
    search: 'search',
    video: 'video',
    'text-to-video': 'video',
    'image-to-video': 'video',
    'video-to-video': 'video',
  };

  const FALLBACK_MODELS = [
    // Real Arena UUID-keyed Direct-selectable models (from Arena SSR initialModels)
    { id: '01a0681c-b561-76b6-b338-a44ff0cff460', slug: 'gemini-3.8-flash-high', name: 'gemini-3.8-flash-high', publicName: 'Gemini 3.8 Flash High', displayName: 'Gemini 3.8 Flash High', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 9, rankByModality: { chat: 9 }, userSelectable: true },
    { id: '019f19f2-41f1-7c6d-9891-48d02fd9952c', slug: 'claude-sonnet-5-high', name: 'claude-sonnet-5-high', publicName: 'Claude Sonnet 5 High', displayName: 'Claude Sonnet 5 High', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 10, rankByModality: { chat: 58 }, userSelectable: true },
    { id: '019ce973-84c9-7030-9f88-1ebbf2edeb14', slug: 'claude-opus-4-6', name: 'claude-opus-4-6', publicName: 'Claude Opus 4.6', displayName: 'Claude Opus 4.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 11, rankByModality: { chat: 23, webdev: 3, search: 4 }, userSelectable: true },
    { id: '019cbd0a-d2e9-7540-9651-8fb7bc7bc483', slug: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', publicName: 'Claude Sonnet 4.6', displayName: 'Claude Sonnet 4.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 12, rankByModality: { chat: 30, webdev: 5, search: 11 }, userSelectable: true },
    { id: '019d3995-9b7a-730d-b779-227ad61ecc9b', slug: 'gpt-5.4-high', name: 'gpt-5.4-high', publicName: 'GPT-5.4 High', displayName: 'GPT-5.4 High', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 13, rankByModality: { chat: 26, webdev: 8, search: 5 }, userSelectable: true },
    { id: '019e71ea-1e1d-740f-9c2d-dab5869ff108', slug: 'gpt-5.5-instant', name: 'gpt-5.5-instant', publicName: 'GPT-5.5 Instant', displayName: 'GPT-5.5 Instant', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 14, rankByModality: { chat: 43 }, userSelectable: true },
    { id: '019b82a4-f728-72bf-b563-bd8fd0fb9db6', slug: 'gpt-5.2-high', name: 'gpt-5.2-high', publicName: 'GPT-5.2 High', displayName: 'GPT-5.2 High', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 15, rankByModality: { chat: 42, webdev: 17 }, userSelectable: true },
    { id: '019cbfae-9988-799f-833f-d9ef5fb8b92e', slug: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview', publicName: 'Gemini 3.1 Pro', displayName: 'Gemini 3.1 Pro', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 16, rankByModality: { chat: 25, webdev: 9, search: 9 }, userSelectable: true },
    { id: '019773f3-3a42-772b-b4f5-c2eeb5fb22d6', slug: 'gemini-2.5-pro', name: 'gemini-2.5-pro', publicName: 'Gemini 2.5 Pro', displayName: 'Gemini 2.5 Pro', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 17, rankByModality: { chat: 59, webdev: 38, search: 22 }, userSelectable: true },
    { id: '019ff69c-dae8-708a-ae20-1ce80775d94d', slug: 'grok-4.6-high', name: 'grok-4.6-high', publicName: 'Grok 4.6 High', displayName: 'Grok 4.6 High', organization: 'xAI', provider: 'xai', modalities: ['chat', 'webdev', 'search'], rank: 18, rankByModality: { chat: 70 }, userSelectable: true },
    { id: '01982bb3-7f7a-75c6-86c8-334a0db9b245', slug: 'grok-4', name: 'grok-4', publicName: 'Grok 4', displayName: 'Grok 4', organization: 'xAI', provider: 'xai', modalities: ['chat', 'webdev', 'search'], rank: 19, rankByModality: { chat: 109, search: 18 }, userSelectable: true },
    { id: '019fc887-69e7-7308-a353-36da657fc18e', slug: 'qwen3.8-max', name: 'qwen3.8-max', publicName: 'Qwen 3.8 Max', displayName: 'Qwen 3.8 Max', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 20, rankByModality: { webdev: 12, chat: 35 }, userSelectable: true },
    { id: '019e128d-bc7d-744c-8854-67a38b15b3a1', slug: 'qwen3.7-max-preview', name: 'qwen3.7-max-preview', publicName: 'Qwen 3.7 Max Preview', displayName: 'Qwen 3.7 Max Preview', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 21, rankByModality: { chat: 41, webdev: 14 }, userSelectable: true },
    { id: '01a14ae7-0d76-74af-80ac-33cf2b2322aa', slug: 'deepseek-v4.1-flash-max', name: 'deepseek-v4.1-flash-max', publicName: 'DeepSeek V4.1 Flash Max', displayName: 'DeepSeek V4.1 Flash Max', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 22, rankByModality: { webdev: 13, chat: 38 }, userSelectable: true },
    { id: '019ebf6a-94d4-7649-b704-1dbbd5eb0942', slug: 'glm-5.2 (max)', name: 'glm-5.2 (max)', publicName: 'GLM 5.2 (Max)', displayName: 'GLM 5.2 (Max)', organization: 'Zhipu', provider: 'zhipu', modalities: ['chat', 'webdev'], rank: 23, rankByModality: { chat: 32, webdev: 6 }, userSelectable: true },
    { id: '019b7b2f-fc57-7c65-b4ef-fd8db34f448e', slug: 'deepseek-v3.2', name: 'deepseek-v3.2', publicName: 'DeepSeek V3.2', displayName: 'DeepSeek V3.2', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 26, rankByModality: { chat: 77, webdev: 37 }, userSelectable: true },
    { id: '01980d0b-8126-7f5b-a749-bd6ef7bc7f56', slug: 'qwen3-235b-a22b-instruct-2507', name: 'qwen3-235b-a22b-instruct-2507', publicName: 'Qwen3 235B A22B', displayName: 'Qwen3 235B A22B', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 27, rankByModality: { chat: 78, webdev: 45 }, userSelectable: true },
    { id: '01999a31-f487-73a1-8e8f-2a5256f74a38', slug: 'glm-4.6', name: 'glm-4.6', publicName: 'GLM-4.6', displayName: 'GLM-4.6', organization: 'Zhipu', provider: 'zhipu', modalities: ['chat', 'webdev'], rank: 28, rankByModality: { chat: 86, webdev: 35 }, userSelectable: true },
    { id: '019ca4eb-110d-7271-9040-811b08a19686', slug: 'kimi-k2.5', name: 'kimi-k2.5', publicName: 'Kimi K2.5', displayName: 'Kimi K2.5', organization: 'Moonshot', provider: 'moonshot', modalities: ['chat', 'webdev'], rank: 29, rankByModality: { chat: 44, webdev: 10 }, userSelectable: true },
    { id: '019b7b1f-fa1d-7d5c-96f9-4731f5ca5a0f', slug: 'gpt-image-1.5', name: 'gpt-image-1.5', publicName: 'GPT Image 1.5', displayName: 'GPT Image 1.5', organization: 'OpenAI', provider: 'openai', modalities: ['image'], rank: 1, rankByModality: { image: 1 }, userSelectable: true },
    { id: '0197c947-98b0-7768-8696-c7a5f32d9c95', slug: 'imagen-4.0-generate-preview', name: 'imagen-4.0-generate-preview', publicName: 'Imagen 4', displayName: 'Imagen 4', organization: 'Google', provider: 'google', modalities: ['image'], rank: 2, rankByModality: { image: 8 }, userSelectable: true },
    { id: '0196a1fa-682f-769b-9067-7ff3472e21f7', slug: 'flux-1.1-pro-ultra', name: 'flux-1.1-pro-ultra', publicName: 'FLUX 1.1 Pro Ultra', displayName: 'FLUX 1.1 Pro Ultra', organization: 'Black Forest Labs', provider: 'bfl', modalities: ['image'], rank: 3, rankByModality: { image: 17 }, userSelectable: true },
    { id: '01995d54-9e77-7435-94d1-962091285872', slug: 'seedream-4.0', name: 'seedream-4.0', publicName: 'Seedream 4.0', displayName: 'Seedream 4.0', organization: 'ByteDance', provider: 'bytedance', modalities: ['image'], rank: 4, rankByModality: { image: 7 }, userSelectable: true },
    { id: '019861f0-5a72-73bc-a3a5-fd84d8974239', slug: 'veo-3', name: 'veo-3', publicName: 'Veo 3', displayName: 'Veo 3', organization: 'Google', provider: 'google', modalities: ['video'], rank: 1, rankByModality: { video: 12 }, userSelectable: true },
    { id: '0199dc4a-1e80-764c-89c6-7227cd5fd44c', slug: 'sora-2', name: 'sora-2', publicName: 'Sora 2', displayName: 'Sora 2', organization: 'OpenAI', provider: 'openai', modalities: ['video'], rank: 2, rankByModality: { video: 5 }, userSelectable: true },
    { id: '0197e687-7707-7556-b7a9-247b148fa0a1', slug: 'kling-2.1-master', name: 'kling-2.1-master', publicName: 'Kling 2.1 Master', displayName: 'Kling 2.1 Master', organization: 'Kuaishou', provider: 'kuaishou', modalities: ['video'], rank: 3, rankByModality: { video: 14 }, userSelectable: true },
    // Battle-only & Agent next-gen models (used for Battle reveal resolution & habit learning; non-UUIDs are excluded from Direct selection)
    { id: 'anthropic/claude-opus-5.6', name: 'claude-opus-5.6', publicName: 'Claude Opus 5.6', displayName: 'Claude Opus 5.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 101, userSelectable: false },
    { id: 'anthropic/claude-opus-5.5', name: 'claude-opus-5.5', publicName: 'Claude Opus 5.5', displayName: 'Claude Opus 5.5', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 102, userSelectable: false },
    { id: 'anthropic/claude-sonnet-5.5', name: 'claude-sonnet-5.5', publicName: 'Claude Sonnet 5.5', displayName: 'Claude Sonnet 5.5', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 103, userSelectable: false },
    { id: 'anthropic/claude-fable-5.1', name: 'claude-fable-5.1', publicName: 'Claude Fable 5.1', displayName: 'Claude Fable 5.1', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 104, userSelectable: false },
    { id: 'anthropic/claude-haiku-5.5', name: 'claude-haiku-5.5', publicName: 'Claude Haiku 5.5', displayName: 'Claude Haiku 5.5', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 105, userSelectable: false },
    { id: 'openai/gpt-6.1-sol', name: 'gpt-6.1-sol', publicName: 'GPT 6.1 Sol', displayName: 'GPT 6.1 Sol', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 106, userSelectable: false },
    { id: 'openai/gpt-6-astra', name: 'gpt-6-astra', publicName: 'GPT 6 Astra', displayName: 'GPT 6 Astra', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 107, userSelectable: false },
    { id: 'openai/gpt-6-luna', name: 'gpt-6-luna', publicName: 'GPT 6 Luna', displayName: 'GPT 6 Luna', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 108, userSelectable: false },
    { id: 'google/gemini-4-argon', name: 'gemini-4-argon', publicName: 'Gemini 4 Argon', displayName: 'Gemini 4 Argon', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 109, userSelectable: false },
    { id: 'google/gemini-3.8-flash', name: 'gemini-3.8-flash', publicName: 'Gemini 3.8 Flash', displayName: 'Gemini 3.8 Flash', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 110, userSelectable: false },
    { id: 'xai/grok-4.7', name: 'grok-4.7', publicName: 'Grok 4.7', displayName: 'Grok 4.7', organization: 'xAI', provider: 'xai', modalities: ['chat', 'webdev', 'search'], rank: 111, userSelectable: false },
    { id: 'deepseek/deepseek-v4.1-flash-1017', name: 'deepseek-v4.1-flash', publicName: 'DeepSeek V4.1 Flash', displayName: 'DeepSeek V4.1 Flash', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 112, userSelectable: false },
    { id: 'alibaba/qwen3.8-max', name: 'qwen-3.8-max', publicName: 'Qwen 3.8 Max', displayName: 'Qwen 3.8 Max', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 113, userSelectable: false },
    { id: 'zhipu/glm-5.3', name: 'glm-5.3', publicName: 'GLM 5.3', displayName: 'GLM 5.3', organization: 'Zhipu', provider: 'zhipu', modalities: ['chat', 'webdev'], rank: 114, userSelectable: false },
    { id: 'moonshot/kimi-k3', name: 'kimi-k3', publicName: 'Kimi K3', displayName: 'Kimi K3', organization: 'Moonshot', provider: 'moonshot', modalities: ['chat', 'webdev'], rank: 115, userSelectable: false },
    { id: 'reflection/beam-1.0-501b-a23b', name: 'beam-1.0-501b-a23b', publicName: 'Beam 1.0 501B A23B', displayName: 'Beam 1.0 501B A23B', organization: 'Reflection AI', provider: 'reflection', modalities: ['chat', 'webdev'], rank: 116, userSelectable: false },
    { id: 'meta/muse-spark-1.3', name: 'muse-spark-1.3', publicName: 'Muse Spark 1.3', displayName: 'Muse Spark 1.3', organization: 'Meta', provider: 'meta', modalities: ['chat', 'webdev'], rank: 117, userSelectable: false },
    { id: 'deepseek-r1-0528', name: 'deepseek-r1-0528', publicName: 'DeepSeek R1 0528', displayName: 'DeepSeek R1 0528', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 125, userSelectable: false },
  ];

  let models = [...FALLBACK_MODELS];
  let byIdMap = new Map();
  let loadedAt = 0;
  let loadingP = null;

  function rebuildIndex(list) {
    models = Array.isArray(list) && list.length ? list : [...FALLBACK_MODELS];
    byIdMap = new Map();
    for (const m of models) {
      if (!m) continue;
      if (m.id) byIdMap.set(String(m.id), m);
      if (m.slug) {
        byIdMap.set(String(m.slug), m);
        byIdMap.set(String(m.slug).toLowerCase(), m);
      }
      if (m.name) {
        byIdMap.set(String(m.name), m);
        byIdMap.set(String(m.name).toLowerCase(), m);
      }
      if (m.publicName) byIdMap.set(String(m.publicName).toLowerCase(), m);
      if (m.displayName) byIdMap.set(String(m.displayName).toLowerCase(), m);
    }
  }
  rebuildIndex(FALLBACK_MODELS);

  function normalizeCatalogPayload(raw) {
    const map = new Map();
    const mergeModel = (item, modTag, idx) => {
      if (!item || typeof item !== 'object') return;
      const id = String(item.id || item.modelId || item.name || '').trim();
      if (!id) return;
      const existing = map.get(id) || {
        id,
        slug: item.slug || undefined,
        name: String(item.name || item.publicName || item.displayName || id),
        publicName: String(item.publicName || item.displayName || item.name || id),
        displayName: String(item.displayName || item.publicName || item.name || id),
        organization: String(item.organization || item.provider || ''),
        provider: String(item.provider || item.organization || ''),
        capabilities: item.capabilities || {},
        modalities: [],
        rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : (idx + 1),
        rankByModality: {},
        userSelectable: item.userSelectable !== false && item.isSelectable !== false,
      };
      if (item.rankByModality && typeof item.rankByModality === 'object') {
        Object.assign(existing.rankByModality, item.rankByModality);
        for (const [rk, rv] of Object.entries(item.rankByModality)) {
          if (rv == null || !Number.isFinite(Number(rv))) continue;
          const mapped = ARENA_TO_MODALITY[String(rk).toLowerCase()] || null;
          if (mapped && !existing.modalities.includes(mapped)) existing.modalities.push(mapped);
        }
      }
      const outCap = item.capabilities?.outputCapabilities;
      if (outCap && typeof outCap === 'object') {
        if (outCap.text && !existing.modalities.includes('chat')) existing.modalities.push('chat');
        if (outCap.code && !existing.modalities.includes('webdev')) existing.modalities.push('webdev');
        if (outCap.search && !existing.modalities.includes('search')) existing.modalities.push('search');
        if (outCap.image && !existing.modalities.includes('image')) existing.modalities.push('image');
        if (outCap.video && !existing.modalities.includes('video')) existing.modalities.push('video');
      }
      if (Array.isArray(item.modalities)) {
        for (const mm of item.modalities) {
          const mapped = ARENA_TO_MODALITY[mm] || mm;
          if (mapped && !existing.modalities.includes(mapped)) existing.modalities.push(mapped);
        }
      }
      if (modTag && !existing.modalities.includes(modTag) && (!outCap || existing.modalities.length === 0)) {
        existing.modalities.push(modTag);
      }
      if (modTag && existing.rankByModality[modTag] === undefined && Number.isFinite(Number(item.rank))) {
        existing.rankByModality[modTag] = Number(item.rank);
      }
      const finiteRanks = Object.values(existing.rankByModality).map(Number).filter(Number.isFinite);
      if (finiteRanks.length && !Number.isFinite(Number(item.rank))) {
        existing.rank = Math.min(...finiteRanks);
      }
      map.set(id, existing);
    };

    if (Array.isArray(raw)) {
      for (const group of raw) {
        if (group && Array.isArray(group.models)) {
          const modTag = ARENA_TO_MODALITY[String(group.arena || group.modality || '').toLowerCase()] || 'chat';
          group.models.forEach((m, i) => mergeModel(m, modTag, i));
        } else if (group && (group.id || group.name)) {
          const hasArenaTag = Boolean(group.arena || group.modality);
          const modTag = hasArenaTag ? (ARENA_TO_MODALITY[String(group.arena || group.modality).toLowerCase()] || 'chat') : null;
          mergeModel(group, modTag, map.size);
        }
      }
    } else if (raw && typeof raw === 'object') {
      const arr = Array.isArray(raw.models) ? raw.models : Array.isArray(raw.initialModels) ? raw.initialModels : Array.isArray(raw.arenas) ? raw.arenas : [];
      if (arr.length) return normalizeCatalogPayload(arr);
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) {
          const modTag = ARENA_TO_MODALITY[k.toLowerCase()] || 'chat';
          v.forEach((m, i) => mergeModel(m, modTag, i));
        }
      }
    }

    for (const fb of FALLBACK_MODELS) {
      if (!map.has(fb.id)) {
        map.set(fb.id, { ...fb, rankByModality: { ...(fb.rankByModality || {}) } });
      }
    }
    return [...map.values()];
  }

  function ingestInitialModels(rawModels) {
    if (!Array.isArray(rawModels) || !rawModels.length) return false;
    const parsed = normalizeCatalogPayload(rawModels);
    if (!parsed.length) return false;
    rebuildIndex(parsed);
    loadedAt = Date.now();
    try {
      if (typeof Store !== 'undefined' && Store.set) {
        Store.set(CACHE_KEY, { at: loadedAt, models: parsed });
      }
    } catch {}
    try { ModeState._ensureDirectModelValid(); } catch {}
    return true;
  }

  try {
    const cached = typeof Store !== 'undefined' && Store.get ? Store.get(CACHE_KEY, null) : null;
    if (cached && Array.isArray(cached.models) && cached.models.length) {
      const normalizedCached = normalizeCatalogPayload(cached.models);
      rebuildIndex(normalizedCached);
      loadedAt = Number(cached.at) || 0;
    }
  } catch {}

  async function ensureLoaded(force = false) {
    if (!force && loadedAt && Date.now() - loadedAt < CACHE_TTL && models.length > FALLBACK_MODELS.length) {
      return models;
    }
    if (loadingP) return loadingP;
    loadingP = (async () => {
      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      try {
        const res = await fetchFn('/nextjs-api/model-catalog', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res && res.ok) {
          const data = await res.json();
          if (ingestInitialModels(Array.isArray(data) ? data : (data?.models || data?.initialModels || [data]))) {
            return models;
          }
        }
      } catch {}
      try {
        const resHtml = await fetchFn('/text', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'text/html,application/xhtml+xml' },
        });
        if (resHtml && resHtml.ok) {
          const html = await resHtml.text();
          const { initialModels } = parseEvalFlightFromHtml(html);
          if (Array.isArray(initialModels) && initialModels.length) {
            ingestInitialModels(initialModels);
          }
        }
      } catch {}
      return models;
    })().finally(() => {
      loadingP = null;
    });
    return loadingP;
  }

  function getModelsForModality(modality = ModeState.getModality()) {
    const mod = (modality === 'auto' || !modality) ? 'chat' : String(modality).toLowerCase();
    const filtered = models.filter(m => {
      if (!m || m.userSelectable === false) return false;
      if (!Array.isArray(m.modalities) || !m.modalities.length) return mod === 'chat';
      return m.modalities.includes(mod);
    });
    const uuidOnly = filtered.filter(m => UUID_RE.test(String(m.id || '')));
    const list = uuidOnly.length
      ? uuidOnly
      : filtered.length
        ? filtered
        : FALLBACK_MODELS.filter(m => m.userSelectable !== false && (m.modalities || ['chat']).includes(mod));
    return [...list].sort((a, b) => {
      const ra = a.rankByModality?.[mod] ?? a.rank ?? 999;
      const rb = b.rankByModality?.[mod] ?? b.rank ?? 999;
      return ra - rb;
    });
  }

  function getModelById(id) {
    if (!id) return null;
    const key = String(id).trim();
    const tail = key.includes('/') ? key.split('/').pop() : key;
    return byIdMap.get(key) || byIdMap.get(key.toLowerCase()) || byIdMap.get(tail) || byIdMap.get(tail.toLowerCase()) || null;
  }

  function resolveModelUuid(id, modality = 'chat') {
    const raw = String(id || '').trim();
    if (UUID_RE.test(raw)) return raw;
    const hit = getModelById(raw);
    if (hit && UUID_RE.test(String(hit.id || ''))) return String(hit.id);
    const list = getModelsForModality(modality);
    const fallback = list.find(m => UUID_RE.test(String(m?.id || '')));
    return fallback ? String(fallback.id) : (raw || '019ce973-84c9-7030-9f88-1ebbf2edeb14');
  }

  function resolveModelName(id, revealedModels = []) {
    if (!id) return '';
    const key = String(id).trim();
    if (Array.isArray(revealedModels) && revealedModels.length) {
      const hit = revealedModels.find(m => m && (m.id === key || m.modelId === key || m.name === key));
      if (hit) return String(hit.displayName || hit.publicName || hit.name || key);
    }
    const cat = getModelById(key);
    if (cat) return String(cat.displayName || cat.publicName || cat.name || key);
    return key;
  }

  return {
    ARENA_TO_MODALITY,
    FALLBACK_MODELS,
    ensureLoaded,
    ingestInitialModels,
    getModelsForModality,
    getModelById,
    resolveModelUuid,
    resolveModelName,
    get all() { return models; },
  };
})();

const EvalEngine = (() => {
  const VOTE_NEXT_ACTION = '6045a00021608b43c2ded349d9d98204449e22d4b0';
  const PREV_VOTE_NEXT_ACTION = '60c09be8dfaa9c507f73e0d2a17d7e887bbda2c815';
  const LEGACY_VOTE_NEXT_ACTION = '60353f7027df227e704beac966d87b6957fc086a39';
  let cachedVoteActionId = VOTE_NEXT_ACTION;
  try {
    if (typeof Store !== 'undefined' && Store.get) {
      const savedAct = Store.get('eval:voteActionId', '');
      if (savedAct && /^[0-9a-f]{40,44}$/i.test(savedAct) && savedAct !== PREV_VOTE_NEXT_ACTION && savedAct !== LEGACY_VOTE_NEXT_ACTION) {
        cachedVoteActionId = savedAct;
      }
    }
  } catch {}

  function genUuid() {
    if (typeof uuid7 === 'function') return uuid7();
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function extractUserText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(p => (typeof p === 'string' ? p : p?.text || p?.content || '')).filter(Boolean).join('\n');
    }
    if (content && typeof content === 'object') {
      return String(content.text || content.content || '');
    }
    return '';
  }

  function extractContentText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(p => typeof p === 'string' || !p?.type || p.type === 'text')
        .map(p => (typeof p === 'string' ? p : p?.text || p?.content || ''))
        .filter(Boolean)
        .join('\n');
    }
    if (content && typeof content === 'object') {
      return String(content.text || content.content || '');
    }
    return '';
  }

  function inferWebDevContentType(filePath) {
    const p = String(filePath || '').toLowerCase();
    if (p.endsWith('.tsx') || p.endsWith('.ts')) return 'text/typescript';
    if (p.endsWith('.jsx') || p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs')) return 'text/javascript';
    if (p.endsWith('.html') || p.endsWith('.htm')) return 'text/html';
    if (p.endsWith('.css')) return 'text/css';
    if (p.endsWith('.svg')) return 'image/svg+xml';
    if (p.endsWith('.json')) return 'application/json';
    if (p.endsWith('.md')) return 'text/markdown';
    if (p.endsWith('.py')) return 'text/x-python';
    return 'text/plain';
  }

  function applyWebDevEdit(content, context, replacement) {
    const src = String(content ?? '');
    const ctx = String(context ?? '');
    const rep = String(replacement ?? '');
    if (!ctx) return src;
    const exactIdx = src.indexOf(ctx);
    if (exactIdx >= 0) {
      return src.slice(0, exactIdx) + rep + src.slice(exactIdx + ctx.length);
    }
    const srcLines = src.split('\n');
    const ctxLines = ctx.split('\n');
    if (ctxLines.length > 0 && ctxLines.length <= srcLines.length) {
      for (let i = 0; i <= srcLines.length - ctxLines.length; i++) {
        let match = true;
        for (let j = 0; j < ctxLines.length; j++) {
          if (srcLines[i + j].trim() !== ctxLines[j].trim()) {
            match = false;
            break;
          }
        }
        if (match) {
          const before = srcLines.slice(0, i).join('\n');
          const after = srcLines.slice(i + ctxLines.length).join('\n');
          return (i > 0 ? before + '\n' : '') + rep + (i + ctxLines.length < srcLines.length ? '\n' + after : '');
        }
      }
    }
    return src;
  }

  function applyWebDevToolToState(webdev, toolName, args, result) {
    const state = webdev && typeof webdev === 'object'
      ? {
          status: webdev.status || 'pending',
          files: Array.isArray(webdev.files) ? webdev.files.map(f => ({ ...f })) : [],
          binaryFiles: Array.isArray(webdev.binaryFiles) ? webdev.binaryFiles.map(f => ({ ...f })) : [],
          previewUrl: webdev.previewUrl || null,
          templateKind: webdev.templateKind || null,
          message: webdev.message || null,
        }
      : { status: 'pending', files: [], binaryFiles: [], previewUrl: null, templateKind: null, message: null };
    if (result && typeof result === 'object' && result.status === 'error') return state;
    const inp = args && typeof args === 'object' ? args : {};
    const tName = String(toolName || '').toLowerCase();
    const normP = String(inp.path || inp.file_path || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
    if ((tName === 'create_file' || tName === 'write_file' || tName === 'write') && normP) {
      const fContent = String(inp.content ?? inp.text ?? '');
      const fType = inferWebDevContentType(normP);
      const idx = state.files.findIndex(f => f && f.path === normP);
      if (idx >= 0) state.files[idx] = { ...state.files[idx], path: normP, content: fContent, contentType: fType };
      else state.files.push({ path: normP, content: fContent, contentType: fType });
    } else if ((tName === 'edit_file' || tName === 'str_replace' || tName === 'edit') && normP) {
      const ctx = inp.context ?? inp.old_text ?? inp.old_str ?? '';
      const rep = inp.replacement ?? inp.new_text ?? inp.new_str ?? '';
      const idx = state.files.findIndex(f => f && f.path === normP);
      if (idx >= 0 && ctx) {
        state.files[idx] = {
          ...state.files[idx],
          content: applyWebDevEdit(state.files[idx].content || '', ctx, rep),
        };
      } else if (idx < 0 && rep) {
        state.files.push({ path: normP, content: String(rep), contentType: inferWebDevContentType(normP) });
      }
    } else if (tName === 'delete_file' && normP) {
      state.files = state.files.filter(f => f && f.path !== normP);
    } else if (tName === 'generate_image' && normP) {
      if (!state.binaryFiles.some(b => b && b.path === normP)) {
        state.binaryFiles.push({ path: normP, contentType: 'image/png' });
      }
    }
    return state;
  }

  function reconstructWebDevFromMessage(m, modality = '') {
    if (!m || typeof m !== 'object') return null;
    const isWebDev = modality === 'webdev'
      || Boolean(m.webdev)
      || Boolean(m.webdevTemplate || m.metadata?.webdevTemplate)
      || Boolean(m.activeWorkflowRunId || m.metadata?.workflowRunId)
      || (Array.isArray(m.parts) && m.parts.some(p => p && String(p.type || '').startsWith('tool-')));
    if (!isWebDev) return null;
    let state = m.webdev && typeof m.webdev === 'object'
      ? {
          status: m.webdev.status || (m.status === 'success' ? 'success' : 'pending'),
          files: Array.isArray(m.webdev.files) ? m.webdev.files.map(f => ({ ...f })) : [],
          binaryFiles: Array.isArray(m.webdev.binaryFiles) ? m.webdev.binaryFiles.map(f => ({ ...f })) : [],
          previewUrl: m.webdev.previewUrl || m.metadata?.previewUrl || null,
          templateKind: m.webdev.templateKind || m.webdevTemplate || m.metadata?.webdevTemplate || null,
          message: m.webdev.message || null,
        }
      : {
          status: m.status === 'success' ? 'success' : m.status === 'failed' ? 'build-error' : 'pending',
          files: [],
          binaryFiles: [],
          previewUrl: m.metadata?.previewUrl || null,
          templateKind: m.webdevTemplate || m.metadata?.webdevTemplate || null,
          message: null,
        };
    if (!state.files.length && Array.isArray(m.parts)) {
      for (const p of m.parts) {
        if (!p || !String(p.type || '').startsWith('tool-')) continue;
        const tName = p.toolName || String(p.type).replace(/^tool-/, '');
        state = applyWebDevToolToState(state, tName, p.input || {}, p.output);
      }
    }
    if (!state.previewUrl && m.id && (modality === 'webdev' || m.webdevTemplate || m.metadata?.webdevTemplate || m.activeWorkflowRunId || m.metadata?.workflowRunId) && m.status === 'success') {
      state.previewUrl = `https://${m.id}.arena.site`;
      state.status = 'success';
    }
    return state;
  }

  function buildAssistantParts(m) {
    const parts = [];
    if (!m || typeof m !== 'object') return parts;
    const isPending = String(m.status || '').toLowerCase() === 'pending' || String(m.status || '').toLowerCase() === 'streaming';
    const hasStructuredTools = Array.isArray(m.content) && m.content.some(
      p => p && typeof p === 'object' && (p.type === 'tool-call' || p.type === 'tool-result')
    );

    if (Array.isArray(m.parts) && m.parts.length) {
      if (typeof m.reasoning === 'string' && m.reasoning.trim() && !m.parts.some(x => x && x.type === 'reasoning')) {
        parts.push({ type: 'reasoning', text: m.reasoning, state: 'done' });
      }
      for (const p of m.parts) {
        if (!p) continue;
        if (p.type === 'reasoning' && parts.some(x => x.type === 'reasoning')) continue;
        parts.push({ ...p });
      }
    } else if (hasStructuredTools && Array.isArray(m.content)) {
      const toolResultsMap = new Map();
      for (const item of m.content) {
        if (item && typeof item === 'object' && item.type === 'tool-result' && item.toolCallId) {
          toolResultsMap.set(String(item.toolCallId), item);
        }
      }
      if (typeof m.reasoning === 'string' && m.reasoning.trim() && !m.content.some(p => p && typeof p === 'object' && p.type === 'reasoning' && p.text)) {
        parts.push({ type: 'reasoning', text: m.reasoning, state: 'done' });
      }
      for (const item of m.content) {
        if (!item) continue;
        if (typeof item === 'string') {
          if (item) {
            const last = parts[parts.length - 1];
            if (last && last.type === 'text') last.text += item;
            else parts.push({ type: 'text', text: item, state: isPending ? 'streaming' : 'done' });
          }
          continue;
        }
        if (typeof item !== 'object') continue;
        if (item.type === 'reasoning' && item.text) {
          const last = parts[parts.length - 1];
          if (last && last.type === 'reasoning') last.text += String(item.text);
          else parts.push({ type: 'reasoning', text: String(item.text), state: isPending ? 'streaming' : 'done' });
        } else if (!item.type || item.type === 'text') {
          const txt = String(item.text || item.content || '');
          if (txt) {
            const last = parts[parts.length - 1];
            if (last && last.type === 'text') last.text += txt;
            else parts.push({ type: 'text', text: txt, state: isPending ? 'streaming' : 'done' });
          }
        } else if (item.type === 'tool-call') {
          const tcId = String(item.toolCallId || item.id || genUuid());
          const tName = String(item.toolName || item.name || 'tool');
          const matched = toolResultsMap.get(tcId) || null;
          const resObj = matched ? (matched.result !== undefined ? matched.result : matched.output) : undefined;
          const isErr = Boolean(resObj && typeof resObj === 'object' && resObj.status === 'error');
          parts.push({
            type: 'tool-' + tName,
            toolCallId: tcId,
            toolName: tName,
            input: item.args || item.input || {},
            output: resObj,
            state: matched ? (isErr ? 'output-error' : 'output-available') : (isPending ? 'input-available' : 'output-available'),
            ...(isErr ? { errorText: String(resObj.message || resObj.stderr || 'Tool execution failed') } : {}),
          });
        }
      }
    } else {
      if (typeof m.reasoning === 'string' && m.reasoning.trim()) {
        parts.push({ type: 'reasoning', text: m.reasoning, state: 'done' });
      } else if (Array.isArray(m.content)) {
        const rTxt = m.content
          .filter(p => p && typeof p === 'object' && p.type === 'reasoning' && p.text)
          .map(p => String(p.text))
          .join('');
        if (rTxt.trim()) {
          parts.push({ type: 'reasoning', text: rTxt, state: 'done' });
        }
      }
      const txt = extractContentText(m.content);
      if (txt) parts.push({ type: 'text', text: txt, state: 'done' });
    }
    if (Array.isArray(m.experimental_attachments)) {
      for (const a of m.experimental_attachments) {
        if (!a || !a.url) continue;
        const ct = String(a.contentType || a.mimeType || '').toLowerCase();
        const isVideo = ct.startsWith('video/') || /\.(mp4|webm|mov)(\?|$)/i.test(a.url);
        parts.push({
          type: isVideo ? 'video' : 'image',
          url: a.url,
          contentType: a.contentType || a.mimeType || (isVideo ? 'video/mp4' : 'image/png'),
          name: a.name || '',
        });
      }
    }
    if (Array.isArray(m.sources) && m.sources.length) {
      parts.push({ type: 'sources', sources: m.sources });
    } else if (Array.isArray(m.citations) && m.citations.length) {
      parts.push({ type: 'sources', sources: m.citations });
    }
    return parts;
  }

  function initEvalFields(chat, opts = {}) {
    if (!chat) return chat;
    chat.isEvaluation = true;
    if (opts.evalMode) chat.evalMode = opts.evalMode;
    else if (!chat.evalMode) {
      const hRow = typeof History !== 'undefined' ? History.byId?.(chat.sid) : null;
      chat.evalMode = hRow ? ModeState.inferEntryMode(hRow) : (ModeState.getMode() === 'direct' ? 'direct' : 'battle');
      if (chat.evalMode === 'agent') chat.evalMode = 'battle';
    }
    if (opts.modality) chat.modality = opts.modality;
    else if (!chat.modality) {
      const hRow = typeof History !== 'undefined' ? History.byId?.(chat.sid) : null;
      chat.modality = hRow?.modality || ModeState.getModality() || 'chat';
    }
    if (chat.modality && chat.modality !== 'auto') chat.evalModality = chat.modality;
    if (opts.modelAId !== undefined) chat.modelAId = opts.modelAId;
    else if (chat.modelAId === undefined) chat.modelAId = null;
    if (opts.modelBId !== undefined) chat.modelBId = opts.modelBId;
    else if (chat.modelBId === undefined) chat.modelBId = null;
    if (!Array.isArray(chat.revealedModels)) chat.revealedModels = [];
    if (!Array.isArray(chat.pairwiseFeedbacks)) chat.pairwiseFeedbacks = [];
    if (!chat.voteState || typeof chat.voteState !== 'object') {
      chat.voteState = {
        voted: false,
        submitting: false,
        value: null,
        modelAId: chat.modelAId || null,
        modelBId: chat.modelBId || null,
        modelAName: null,
        modelBName: null,
        learnedAt: null,
      };
    }
    return chat;
  }

  function isEvalChat(chat) {
    if (!chat) return false;
    if (chat.isEvaluation) return true;
    if (chat.evalMode === 'battle' || chat.evalMode === 'direct') {
      initEvalFields(chat, { evalMode: chat.evalMode });
      return true;
    }
    const sid = chat.sid;
    const hRow = (typeof History !== 'undefined' && sid ? History.byId?.(sid) : null)
      || (typeof Arch !== 'undefined' && sid && Array.isArray(Arch.items) ? Arch.items.find(x => x && x.id === sid) : null);
    if (hRow && (hRow.type === 'evaluation' || hRow.mode === 'battle' || hRow.mode === 'direct' || hRow.mode === 'direct-battle' || hRow.mode === 'side-by-side')) {
      initEvalFields(chat, {
        evalMode: ModeState.inferEntryMode(hRow) === 'direct' ? 'direct' : 'battle',
        modality: hRow.modality || 'chat',
        modelAId: hRow.modelAId || null,
        modelBId: hRow.modelBId || null,
      });
      return true;
    }
    if (sid) {
      const cachedEval = readLocalEvalCache(sid);
      if (cachedEval && typeof cachedEval === 'object' && (cachedEval.mode || Array.isArray(cachedEval.messages) || Array.isArray(cachedEval.maskedEvaluations))) {
        const mMode = String(cachedEval.mode || '').toLowerCase() === 'direct' ? 'direct' : 'battle';
        initEvalFields(chat, {
          evalMode: mMode,
          modality: cachedEval.modality || 'chat',
          modelAId: cachedEval.modelAId || null,
          modelBId: cachedEval.modelBId || null,
        });
        return true;
      }
      const mi = typeof Models !== 'undefined' ? Models.get?.(sid) : null;
      if (mi && (mi.battleRevealed || mi.directMode || mi.modelA || mi.modelB || mi.source === 'battle' || mi.source === 'direct')) {
        initEvalFields(chat, { evalMode: (mi.directMode || mi.source === 'direct') ? 'direct' : 'battle' });
        return true;
      }
    }
    if (Array.isArray(chat.messages) && chat.messages.some(m => m && (m.participantPosition === 'a' || m.participantPosition === 'b' || m.evaluationSessionId))) {
      const hasB = chat.messages.some(m => m && m.participantPosition === 'b');
      initEvalFields(chat, { evalMode: hasB ? 'battle' : (chat.evalMode || 'battle') });
      return true;
    }
    return false;
  }

  const _evalMemCache = new Map();
  let _evalLsCleaned = false;
  function readLocalEvalCache(sid) {
    if (!sid) return null;
    if (_evalMemCache.has(sid)) return _evalMemCache.get(sid);
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem('arena:evaluation-session-cache:v1:' + sid);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const out = (parsed && typeof parsed === 'object') ? (parsed.evaluation || parsed.session || parsed.data || parsed) : null;
      if (out) {
        if (_evalMemCache.size >= 30) _evalMemCache.delete(_evalMemCache.keys().next().value);
        _evalMemCache.set(sid, out);
      }
      return out;
    } catch {
      return null;
    }
  }

  function writeLocalEvalCache(sid, evalObj) {
    if (!sid || !evalObj) return;
    if (_evalMemCache.has(sid)) _evalMemCache.delete(sid);
    else if (_evalMemCache.size >= 30) {
      const oldestSid = _evalMemCache.keys().next().value;
      _evalMemCache.delete(oldestSid);
      if (typeof localStorage !== 'undefined') {
        try { localStorage.removeItem('arena:evaluation-session-cache:v1:' + oldestSid); } catch {}
      }
    }
    _evalMemCache.set(sid, evalObj);
    if (typeof localStorage === 'undefined') return;
    try {
      if (!_evalLsCleaned) {
        _evalLsCleaned = true;
        const evalKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('arena:evaluation-session-cache:v1:')) evalKeys.push(k);
        }
        if (evalKeys.length > 30) {
          for (let i = 0; i < evalKeys.length - 25; i++) {
            try { localStorage.removeItem(evalKeys[i]); } catch {}
          }
        }
      }
      let json = JSON.stringify(evalObj);
      if (json.length > 180000 && Array.isArray(evalObj.messages)) {
        const slimObj = {
          ...evalObj,
          messages: evalObj.messages.map(m => (m && m.webdev?.files) ? { ...m, webdev: { ...m.webdev, files: [] } } : m),
        };
        json = JSON.stringify(slimObj);
      }
      localStorage.setItem('arena:evaluation-session-cache:v1:' + sid, json);
    } catch {}
  }

  function hasRawEvalMsgContent(m) {
    if (!m || typeof m !== 'object') return false;
    if (Array.isArray(m.parts) && m.parts.some(p => p && ((p.text && String(p.text).trim()) || p.url || String(p.type || '').startsWith('tool-')))) return true;
    if (Array.isArray(m.content) && m.content.some(p => p && typeof p === 'object' && (p.type === 'tool-call' || p.type === 'tool-result'))) return true;
    if (m.webdev && (Array.isArray(m.webdev.files) && m.webdev.files.length || m.webdev.previewUrl)) return true;
    const txt = extractContentText(m.content);
    if (txt && txt.trim()) return true;
    if (typeof m.reasoning === 'string' && m.reasoning.trim()) return true;
    if (Array.isArray(m.experimental_attachments) && m.experimental_attachments.some(a => a && a.url)) return true;
    return false;
  }

  function mergeEvalObjects(primary, secondary) {
    if (!primary) return secondary || null;
    if (!secondary) return primary;
    const out = { ...secondary, ...primary };
    if ((!Array.isArray(out.messages) || !out.messages.length) && Array.isArray(secondary.messages)) {
      out.messages = secondary.messages;
    } else if (Array.isArray(primary.messages) && Array.isArray(secondary.messages) && secondary.messages.length) {
      const secById = new Map();
      const secByPos = new Map();
      for (const sm of secondary.messages) {
        if (!sm || typeof sm !== 'object') continue;
        if (sm.id) secById.set(sm.id, sm);
        if (sm.role === 'assistant' && (sm.participantPosition === 'a' || sm.participantPosition === 'b')) {
          secByPos.set(sm.participantPosition, sm);
        }
      }
      out.messages = primary.messages.map(pm => {
        if (!pm || typeof pm !== 'object' || pm.role !== 'assistant') return pm;
        const sm = (pm.id && secById.get(pm.id))
          || ((pm.participantPosition === 'a' || pm.participantPosition === 'b') ? secByPos.get(pm.participantPosition) : null);
        if (!sm) return pm;
        const pHas = hasRawEvalMsgContent(pm) && pm.status !== 'failed';
        const sHas = hasRawEvalMsgContent(sm) && sm.status !== 'failed';
        if (!pHas && sHas) {
          return { ...pm, ...sm, id: pm.id || sm.id };
        }
        return pm;
      });
    }
    if ((!Array.isArray(out.revealedModels) || !out.revealedModels.length) && Array.isArray(secondary.revealedModels)) {
      out.revealedModels = secondary.revealedModels;
    }
    if ((!Array.isArray(out.pairwiseFeedbacks) || !out.pairwiseFeedbacks.length) && Array.isArray(secondary.pairwiseFeedbacks)) {
      out.pairwiseFeedbacks = secondary.pairwiseFeedbacks;
    }
    return out;
  }

  function syncChatToLocalEvalCache(chat) {
    if (!chat || !chat.sid || typeof localStorage === 'undefined') return;
    try {
      const prev = readLocalEvalCache(chat.sid) || {
        id: chat.sid,
        title: chat.title || '新对话',
        mode: chat.evalMode || 'battle',
        modality: chat.evalModality || chat.modality || 'chat',
      };
      const rawMsgs = (chat.messages || []).map(m => {
        if (!m || typeof m !== 'object') return m;
        if (m.role === 'user') {
          const uText = (m.parts || []).filter(p => p && p.type === 'text' && p.text).map(p => p.text).join('\n')
            || extractUserText(m.content);
          return {
            id: m.id,
            role: 'user',
            content: uText,
            experimental_attachments: m.experimental_attachments || [],
            metadata: m.metadata || {},
          };
        }
        const contentArr = [];
        let reasoningStr = '';
        for (const p of m.parts || []) {
          if (!p) continue;
          if (p.type === 'reasoning' && p.text) {
            reasoningStr += p.text;
            contentArr.push({ type: 'reasoning', text: p.text });
          } else if (p.type === 'text' && p.text) {
            contentArr.push({ type: 'text', text: p.text });
          } else if (String(p.type || '').startsWith('tool-')) {
            const tcId = p.toolCallId || genUuid();
            const tName = p.toolName || String(p.type).replace(/^tool-/, '');
            contentArr.push({
              type: 'tool-call',
              toolCallId: tcId,
              toolName: tName,
              args: p.input || {},
            });
            if (p.output !== undefined) {
              contentArr.push({
                type: 'tool-result',
                toolCallId: tcId,
                toolName: tName,
                result: p.output,
              });
            }
          }
        }
        return {
          id: m.id,
          role: 'assistant',
          participantPosition: m.participantPosition || 'a',
          evaluationSessionId: chat.sid,
          modelId: m.modelId || null,
          status: m.status || (m.failed ? 'failed' : 'success'),
          failureReason: m.failureReason || null,
          reasoning: reasoningStr || m.reasoning || '',
          content: contentArr.length ? contentArr : (m.content || []),
          experimental_attachments: m.experimental_attachments || [],
          sources: m.sources || [],
          activeWorkflowRunId: m.activeWorkflowRunId || m.metadata?.workflowRunId || null,
          webdevTemplate: m.webdevTemplate || m.metadata?.webdevTemplate || null,
          ...(m.webdev ? { webdev: m.webdev } : {}),
          metadata: m.metadata || {},
        };
      });
      writeLocalEvalCache(chat.sid, { ...prev, messages: rawMsgs });
    } catch {}
  }

  async function fetchEvalSessionData(sid) {
    const lsCached = readLocalEvalCache(sid);
    const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
    let fromFlight = null;
    try {
      const res = await fetchFn('/c/' + encodeURIComponent(sid), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'text/html,application/xhtml+xml,application/json' },
      });
      if (res && res.ok) {
        const ct = String(res.headers?.get?.('content-type') || '').toLowerCase();
        const text = await res.text();
        if (ct.includes('application/json') || (text.trim().startsWith('{') && !text.includes('__next_f'))) {
          try {
            const j = JSON.parse(text);
            fromFlight = j?.evaluation || j?.session || j?.data || j;
          } catch {}
        } else {
          const { initialState, initialModels } = parseEvalFlightFromHtml(text);
          if (Array.isArray(initialModels) && initialModels.length) {
            try { ModelCatalog.ingestInitialModels(initialModels); } catch {}
          }
          if (initialState && typeof initialState === 'object') {
            fromFlight = initialState;
          }
        }
      }
    } catch {}

    if (fromFlight) {
      const merged = mergeEvalObjects(fromFlight, lsCached);
      writeLocalEvalCache(sid, merged);
      return merged;
    }

    try {
      const data = await api('/api/evaluation/' + encodeURIComponent(sid), { timeout: 20000 });
      if (data && typeof data === 'object') {
        const evalObj = data.evaluation || data.session || data.data || data;
        const merged = mergeEvalObjects(evalObj, lsCached);
        writeLocalEvalCache(sid, merged);
        return merged;
      }
    } catch {}

    if (lsCached && Array.isArray(lsCached.messages) && lsCached.messages.length) {
      return lsCached;
    }
    return null;
  }

  function orderTurnMessages(mapped) {
    if (!Array.isArray(mapped) || mapped.length <= 2) return mapped;
    const out = [];
    let asstBucket = [];
    const flushBucket = () => {
      if (!asstBucket.length) return;
      asstBucket.sort((x, y) => {
        const px = x.participantPosition === 'b' ? 1 : 0;
        const py = y.participantPosition === 'b' ? 1 : 0;
        return px - py;
      });
      out.push(...asstBucket);
      asstBucket = [];
    };
    for (const m of mapped) {
      if (m && m.role === 'assistant') {
        asstBucket.push(m);
      } else {
        flushBucket();
        out.push(m);
      }
    }
    flushBucket();
    return out;
  }

  async function loadChat(chat, force = false) {
    if (!chat || !chat.sid) return;
    if (chat.loaded && !force) return;
    if (chat.loading) return chat.loading;
    initEvalFields(chat);
    chat.loading = (async () => {
      try {
        const data = await fetchEvalSessionData(chat.sid);
        if (!data || typeof data !== 'object') throw new Error('评测对话数据为空');
        const evalObj = data.evaluation || data.session || data.data || data;
        const modeRaw = evalObj.mode || data.mode || chat.evalMode || 'battle';
        const isDirect = modeRaw === 'direct' || modeRaw === 'direct-battle' || modeRaw === 'side-by-side' || Boolean(evalObj.modelAId && !evalObj.modelBId && modeRaw !== 'battle');
        chat.isEvaluation = true;
        chat.evalMode = isDirect ? 'direct' : 'battle';
        chat.modality = evalObj.modality || data.modality || chat.modality || 'chat';
        if (evalObj.title || data.title) chat.title = String(evalObj.title || data.title);
        chat.revealedModels = Array.isArray(evalObj.revealedModels || data.revealedModels)
          ? (evalObj.revealedModels || data.revealedModels)
          : [];
        chat.pairwiseFeedbacks = Array.isArray(evalObj.pairwiseFeedbacks || data.pairwiseFeedbacks)
          ? (evalObj.pairwiseFeedbacks || data.pairwiseFeedbacks)
          : [];

        const rawMsgs = Array.isArray(evalObj.messages)
          ? evalObj.messages
          : Array.isArray(data.messages)
            ? data.messages
            : [];

        let detectedAId = evalObj.modelAId || data.modelAId || chat.modelAId || null;
        let detectedBId = evalObj.modelBId || data.modelBId || chat.modelBId || null;

        const rawMapped = [];
        for (const m of rawMsgs) {
          if (!m || typeof m !== 'object') continue;
          if (m.role === 'user') {
            const uTxt = extractUserText(m.content ?? m.text ?? m.parts);
            rawMapped.push({
              id: m.id || genUuid(),
              role: 'user',
              text: uTxt,
              parts: [{ type: 'text', text: uTxt }],
              createdAt: m.createdAt || new Date().toISOString(),
              experimental_attachments: Array.isArray(m.experimental_attachments) ? m.experimental_attachments : [],
              metadata: m.metadata || {},
              v: 2,
            });
          } else if (m.role === 'assistant') {
            const pos = m.participantPosition === 'b' ? 'b' : 'a';
            const mId = m.modelId || m.model || null;
            if (pos === 'a' && mId) detectedAId = mId;
            if (pos === 'b' && mId) detectedBId = mId;
            const st = String(m.status || 'success').toLowerCase();
            const restoredFmt = m._fmt || m.metadata?._fmt || null;
            const builtParts = buildAssistantParts(m);
            const msgObj = {
              id: m.id || genUuid(),
              role: 'assistant',
              participantPosition: pos,
              parentMessageIds: Array.isArray(m.parentMessageIds) ? m.parentMessageIds : [],
              modelId: mId,
              status: st,
              failureReason: m.failureReason || null,
              createdAt: m.createdAt || new Date().toISOString(),
              parts: builtParts,
              activeWorkflowRunId: m.activeWorkflowRunId || m.metadata?.workflowRunId || null,
              webdevTemplate: m.webdevTemplate || m.metadata?.webdevTemplate || null,
              ...(m.webdev ? { webdev: m.webdev } : {}),
              ...(restoredFmt ? { _fmt: restoredFmt } : {}),
              metadata: {
                ...(m.metadata || {}),
                pending: st === 'pending' || st === 'streaming',
              },
              v: 2,
            };
            const wdState = reconstructWebDevFromMessage(msgObj, chat.modality);
            if (wdState) msgObj.webdev = wdState;
            rawMapped.push(msgObj);
          }
        }

        const mapped = orderTurnMessages(rawMapped);

        try {
          if (typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function') {
            const cachedDoc = await MsgCache.get(chat.sid).catch(() => null);
            if (Array.isArray(cachedDoc?.messages)) {
              const cachedById = new Map(cachedDoc.messages.filter(x => x?.id).map(x => [x.id, x]));
              for (const mm of mapped) {
                const cm = cachedById.get(mm.id);
                if (!cm) continue;
                if (!mm._fmt && (cm._fmt || cm.metadata?._fmt)) mm._fmt = cm._fmt || cm.metadata._fmt;
                if (cm.metadata?.timing?.completedAt && !mm.metadata?.timing?.completedAt) {
                  mm.metadata = mm.metadata || {};
                  mm.metadata.timing = { ...(mm.metadata.timing || {}), ...cm.metadata.timing };
                }
              }
            }
          }
        } catch {}

        chat.messages = mapped;
        chat.modelAId = detectedAId;
        chat.modelBId = detectedBId;

        const hRow = typeof History !== 'undefined' ? History.byId?.(chat.sid) : null;
        if (hRow) {
          hRow.type = 'evaluation';
          hRow.mode = chat.evalMode;
          if (chat.modality) hRow.modality = chat.modality;
          if (chat.title && !hRow.title) hRow.title = chat.title;
        }

        if (chat.evalMode === 'battle') {
          if (hRow && hRow.localTitle && !/vs|⚔️/i.test(String(hRow.localTitle))) {
            delete hRow.localTitle;
            try { History.saveSoon?.(); } catch {}
          }
          try {
            if (typeof Models !== 'undefined' && Models.all && Models.all[chat.sid] && !Models.all[chat.sid].battleRevealed) {
              delete Models.all[chat.sid];
              if (typeof Store !== 'undefined' && Store.set) Store.set('models', Models.all);
            }
          } catch {}
        }

        const fb = chat.pairwiseFeedbacks.at(-1) || null;
        if (chat.evalMode === 'battle' && (fb || detectedAId || detectedBId)) {
          const aId = fb?.modelAId || detectedAId || null;
          const bId = fb?.modelBId || detectedBId || null;
          const aName = aId ? ModelCatalog.resolveModelName(aId, chat.revealedModels) : null;
          const bName = bId ? ModelCatalog.resolveModelName(bId, chat.revealedModels) : null;
          if (fb || (aName && bName)) {
            chat.voteState = {
              ...(chat.voteState || {}),
              voted: true,
              submitting: false,
              value: fb?.value || fb?.preference || chat.voteState?.value || 'tie',
              modelAId: aId,
              modelBId: bId,
              modelAName: aName,
              modelBName: bName,
            };
            if (hRow) {
              if (aId) hRow.modelAId = aId;
              if (bId) hRow.modelBId = bId;
            }
            if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
              queueMicrotask(() => {
                try {
                  Bus.emit('eval:vote-revealed', {
                    sid: chat.sid,
                    chat,
                    modelA: { id: aId, name: aName },
                    modelB: { id: bId, name: bName },
                    value: chat.voteState.value,
                    fromHistory: true,
                  });
                } catch {}
              });
            }
          }
        } else if (chat.evalMode === 'direct' && detectedAId) {
          const dName = ModelCatalog.resolveModelName(detectedAId, chat.revealedModels);
          chat.directModelName = dName;
          if (chat.modality && chat.modality !== 'auto') chat.evalModality = chat.modality;
          try {
            if (typeof Models !== 'undefined' && Models.set && dName) {
              Models.set(chat.sid, {
                name: dName,
                sure: true,
                guess: false,
                directMode: true,
                provider: 'Direct 直连锁定',
                at: Date.now(),
              });
            }
            if (dName && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnDirectSession === 'function') {
              ChatHabitFingerprint.learnDirectSession(chat, dName);
            }
          } catch {}
        }

        chat.loaded = true;
        chat.cached = false;
        chat.error = null;
        chat.status = 'idle';
        try {
          if (typeof MsgCache !== 'undefined' && typeof MsgCache.put === 'function' && chat.messages.length) {
            void MsgCache.put(chat.sid, { messages: chat.messages, at: Date.now() });
          }
        } catch {}
        try {
          if (chat.evalMode === 'battle' && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.analyzeBattleChat === 'function') {
            ChatHabitFingerprint.analyzeBattleChat(chat);
          }
        } catch {}
        chat.emit();
        try { if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') HtmlPreview.syncEval(chat); } catch {}
        try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(); } catch {}
        if (chat.modality === 'webdev' || chat.evalModality === 'webdev' || chat.messages.some(m => m && (m.webdev || m.activeWorkflowRunId || m.metadata?.workflowRunId))) {
          void hydrateChatWebDev(chat);
        }
      } catch (e) {
        chat.error = '加载评测对话失败：' + (e?.message || e);
        chat.emit();
        throw e;
      } finally {
        chat.loading = null;
      }
    })();
    return chat.loading;
  }

  async function resolveAutoModality(text, files = []) {
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 4500);
      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      const res = await fetchFn('/nextjs-api/auto-modality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          prompt: String(text || '').slice(0, 2000),
          hasAttachments: Boolean(files && files.length),
        }),
        credentials: 'same-origin',
        signal: ctl.signal,
      }).finally(() => clearTimeout(tm));
      if (res && res.ok) {
        const data = await res.json();
        const mod = String(data?.modality || data?.arena || '').toLowerCase();
        const mapped = ModelCatalog.ARENA_TO_MODALITY[mod] || mod;
        if (['video', 'image', 'search', 'webdev', 'chat'].includes(mapped)) return mapped;
      }
    } catch {}
    return 'chat';
  }

  const _webdevMetaInFlight = new Map();
  const _webdevStreamInFlight = new Map();

  async function fetchWebDevMetadata(chat, msg, force = false) {
    if (!chat || !msg || !msg.id) return null;
    if (!force && msg.webdev && msg.webdev.status === 'success' && Array.isArray(msg.webdev.files) && msg.webdev.files.length > 0 && msg.webdev.previewUrl && msg.webdev._fetchedMeta) {
      return msg.webdev;
    }
    const inflightKey = `${chat.sid || ''}:${msg.id}`;
    if (_webdevMetaInFlight.has(inflightKey)) return _webdevMetaInFlight.get(inflightKey);
    const p = (async () => {
      try {
        const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
        const res = await fetchFn(`/api/evaluation/webdev/${encodeURIComponent(msg.id)}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res || !res.ok) return msg.webdev || null;
        const data = await res.json();
        if (!data || typeof data !== 'object') return msg.webdev || null;
        if (data.status === 'pending') {
          msg.webdev = {
            ...(msg.webdev || {}),
            status: 'pending',
            files: Array.isArray(msg.webdev?.files) ? msg.webdev.files : [],
            binaryFiles: Array.isArray(msg.webdev?.binaryFiles) ? msg.webdev.binaryFiles : [],
            previewUrl: msg.webdev?.previewUrl || null,
            templateKind: msg.webdev?.templateKind || msg.webdevTemplate || null,
          };
        } else if (data.manifest && typeof data.manifest === 'object') {
          const mf = data.manifest;
          const bStatus = mf.buildResult?.status || 'success';
          const tplKind = mf.template?.kind || msg.webdev?.templateKind || msg.webdevTemplate || null;
          const pvUrl = data.previewUrl || (bStatus === 'success' ? `https://${msg.id}.arena.site` : null);
          msg.webdev = {
            status: bStatus === 'success' ? 'success' : bStatus === 'no-artifact' ? 'no-artifact' : 'build-error',
            files: Array.isArray(mf.files) && mf.files.length ? mf.files : (msg.webdev?.files || []),
            binaryFiles: Array.isArray(mf.binaryFiles) ? mf.binaryFiles : (msg.webdev?.binaryFiles || []),
            previewUrl: pvUrl,
            templateKind: tplKind,
            message: mf.buildResult?.message || null,
            _fetchedMeta: true,
          };
        }
        msg.v = (msg.v || 0) + 1;
        try {
          if (typeof R !== 'undefined') {
            R._writesCache?.delete?.(chat.sid);
            R._fileTextCache?.delete?.(chat.sid);
          }
        } catch {}
        try { syncChatToLocalEvalCache(chat); } catch {}
        try { if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') HtmlPreview.syncEval(chat); } catch {}
        chat.emit();
        return msg.webdev;
      } catch {
        return msg.webdev || null;
      } finally {
        _webdevMetaInFlight.delete(inflightKey);
      }
    })();
    _webdevMetaInFlight.set(inflightKey, p);
    return p;
  }

  function applyWebDevChunkEvent(chat, targetMsg, ev) {
    if (!targetMsg || !ev || typeof ev !== 'object') return;
    targetMsg.webdev = targetMsg.webdev || {
      status: 'pending',
      files: [],
      binaryFiles: [],
      previewUrl: null,
      templateKind: targetMsg.webdevTemplate || null,
    };
    if (ev.type === 'init') {
      targetMsg.webdev = {
        status: 'pending',
        files: Array.isArray(ev.files) ? ev.files.map(f => ({ ...f })) : (targetMsg.webdev.files || []),
        binaryFiles: Array.isArray(ev.binaryFiles) ? ev.binaryFiles.map(f => ({ ...f })) : (targetMsg.webdev.binaryFiles || []),
        previewUrl: targetMsg.webdev.previewUrl || null,
        templateKind: ev.templateKind || targetMsg.webdev.templateKind || null,
      };
    } else if (ev.type === 'preview-ready') {
      const st = ev.status || 'success';
      const pvUrl = ev.previewUrl || (st === 'success' && targetMsg.id ? `https://${targetMsg.id}.arena.site` : null);
      targetMsg.webdev = {
        status: st,
        files: Array.isArray(ev.files) && ev.files.length ? ev.files : (targetMsg.webdev.files || []),
        binaryFiles: targetMsg.webdev.binaryFiles || [],
        previewUrl: pvUrl,
        templateKind: ev.templateKind || targetMsg.webdev.templateKind || null,
        message: ev.message || null,
        _fetchedMeta: true,
      };
      if (st === 'build-error') {
        targetMsg.status = 'failed';
        targetMsg.failureReason = ev.message || 'Build failed';
      } else {
        targetMsg.status = 'success';
      }
      if (targetMsg.metadata) targetMsg.metadata.pending = false;
    } else if (ev.type === 'title' && ev.title && chat) {
      chat.title = String(ev.title);
    }
    targetMsg.v = (targetMsg.v || 0) + 1;
    try {
      if (typeof R !== 'undefined' && chat?.sid) {
        R._writesCache?.delete?.(chat.sid);
        R._fileTextCache?.delete?.(chat.sid);
      }
    } catch {}
    try { if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') HtmlPreview.syncEval(chat); } catch {}
  }

  function upsertToolCallPart(chat, targetMsg, val) {
    if (!targetMsg || !val || typeof val !== 'object') return;
    if (!Array.isArray(targetMsg.parts)) targetMsg.parts = [];
    const tcId = String(val.toolCallId || val.id || genUuid());
    const tName = String(val.toolName || val.name || 'tool');
    const args = val.args || val.input || {};
    let existing = targetMsg.parts.find(p => p && p.toolCallId === tcId);
    if (existing) {
      existing.toolName = tName;
      existing.type = 'tool-' + tName;
      existing.input = args;
      if (!existing.state || existing.state === 'input-streaming') existing.state = 'input-available';
    } else {
      targetMsg.parts.push({
        type: 'tool-' + tName,
        toolCallId: tcId,
        toolName: tName,
        input: args,
        state: 'input-available',
      });
    }
    targetMsg.webdev = applyWebDevToolToState(targetMsg.webdev, tName, args, null);
    targetMsg.v = (targetMsg.v || 0) + 1;
    try {
      if (typeof R !== 'undefined' && chat?.sid) {
        R._writesCache?.delete?.(chat.sid);
        R._fileTextCache?.delete?.(chat.sid);
      }
    } catch {}
  }

  function applyToolResultPart(chat, targetMsg, val) {
    if (!targetMsg || !val || typeof val !== 'object') return;
    if (!Array.isArray(targetMsg.parts)) targetMsg.parts = [];
    const tcId = String(val.toolCallId || val.id || '');
    const resObj = val.result !== undefined ? val.result : val.output;
    const isErr = Boolean(resObj && typeof resObj === 'object' && resObj.status === 'error');
    let existing = tcId ? targetMsg.parts.find(p => p && p.toolCallId === tcId) : null;
    if (!existing) {
      const tName = String(val.toolName || 'tool');
      existing = {
        type: 'tool-' + tName,
        toolCallId: tcId || genUuid(),
        toolName: tName,
        input: val.args || {},
        output: resObj,
        state: isErr ? 'output-error' : 'output-available',
      };
      targetMsg.parts.push(existing);
    } else {
      existing.output = resObj;
      existing.state = isErr ? 'output-error' : 'output-available';
      if (isErr) existing.errorText = String(resObj?.message || resObj?.stderr || 'Tool execution failed');
    }
    const tName = existing.toolName || String(existing.type || '').replace(/^tool-/, '');
    targetMsg.webdev = applyWebDevToolToState(targetMsg.webdev, tName, existing.input || {}, resObj);
    targetMsg.v = (targetMsg.v || 0) + 1;
    try {
      if (typeof R !== 'undefined' && chat?.sid) {
        R._writesCache?.delete?.(chat.sid);
        R._fileTextCache?.delete?.(chat.sid);
      }
    } catch {}
    try { if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') HtmlPreview.syncEval(chat); } catch {}
  }

  async function streamWebDevMessageSSE(chat, targetMsg, signal) {
    if (!chat || !targetMsg || !targetMsg.id) return false;
    const key = `${chat.sid || ''}:${targetMsg.id}`;
    if (_webdevStreamInFlight.has(key)) return _webdevStreamInFlight.get(key);
    const p = (async () => {
      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      let runId = targetMsg.activeWorkflowRunId || targetMsg.metadata?.workflowRunId || null;
      const pos = targetMsg.participantPosition || 'a';
      const ensureStreamPart = (type) => {
        if (!Array.isArray(targetMsg.parts)) targetMsg.parts = [];
        const hasTools = targetMsg.parts.some(x => x && String(x.type || '').startsWith('tool-'));
        if (!hasTools) {
          let found = targetMsg.parts.find(x => x && x.type === type);
          if (!found) {
            found = { type, text: '', state: 'streaming' };
            if (type === 'reasoning') targetMsg.parts.unshift(found);
            else targetMsg.parts.push(found);
          }
          return found;
        }
        const last = targetMsg.parts[targetMsg.parts.length - 1];
        if (last && last.type === type) return last;
        const created = { type, text: '', state: 'streaming' };
        targetMsg.parts.push(created);
        return created;
      };

      const handleEventPayload = (evData) => {
        if (!evData || typeof evData !== 'object') return false;
        const tNow = Date.now();
        targetMsg.metadata = targetMsg.metadata || {};
        targetMsg.metadata.timing = targetMsg.metadata.timing || { startedAt: tNow };
        if (evData.type === 'text-delta' && typeof evData.delta === 'string') {
          const tp = ensureStreamPart('text');
          tp.text = (tp.text || '') + evData.delta;
          targetMsg.v = (targetMsg.v || 0) + 1;
        } else if (evData.type === 'reasoning' && typeof evData.delta === 'string') {
          const rp = ensureStreamPart('reasoning');
          rp.text = (rp.text || '') + evData.delta;
          targetMsg.v = (targetMsg.v || 0) + 1;
        } else if (evData.type === 'tool-call') {
          upsertToolCallPart(chat, targetMsg, evData);
        } else if (evData.type === 'tool-result') {
          applyToolResultPart(chat, targetMsg, evData);
        } else if (evData.type === 'webdev' && evData.event) {
          applyWebDevChunkEvent(chat, targetMsg, evData.event);
        } else if (evData.type === 'finish') {
          targetMsg.status = 'success';
          if (targetMsg.metadata) targetMsg.metadata.pending = false;
          for (const pt of targetMsg.parts || []) {
            if (pt && pt.state === 'streaming') pt.state = 'done';
          }
          targetMsg.v = (targetMsg.v || 0) + 1;
          void fetchWebDevMetadata(chat, targetMsg, true);
          return true;
        } else if (evData.type === 'error') {
          targetMsg.status = 'failed';
          targetMsg.failureReason = evData.error || evData.message || 'WebDev build failed';
          if (targetMsg.metadata) targetMsg.metadata.pending = false;
          targetMsg.v = (targetMsg.v || 0) + 1;
          return true;
        }
        chat.lastActivity = tNow;
        chat.byteAt = tNow;
        chat.progAt = tNow;
        chat.emitStreamSoon?.(24);
        if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
          try { Bus.emit('eval:stream', { sid: chat.sid, pos, chat }); } catch {}
        }
        return false;
      };

      try {
        const url = `/api/evaluation/webdev/${encodeURIComponent(targetMsg.id)}/trigger-stream${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`;
        const res = await fetchFn(url, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        });
        if (!res || !res.ok || !res.body) return false;
        const hdrRunId = res.headers?.get?.('X-Webdev-Run-Id');
        if (hdrRunId) {
          runId = hdrRunId;
          targetMsg.activeWorkflowRunId = hdrRunId;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let curEvent = '';
        let finished = false;
        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const rawLine = buf.slice(0, nl).replace(/\r$/, '');
            buf = buf.slice(nl + 1);
            if (!rawLine) {
              curEvent = '';
              continue;
            }
            if (rawLine.startsWith('event:')) {
              curEvent = rawLine.slice(6).trim();
              continue;
            }
            if (rawLine.startsWith('data:')) {
              const dataStr = rawLine.slice(5).trim();
              if (!dataStr) continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (curEvent === 'batch' && Array.isArray(parsed.records)) {
                  for (const rec of parsed.records) {
                    if (!rec || !rec.body) continue;
                    const bodyObj = typeof rec.body === 'string' ? JSON.parse(rec.body) : rec.body;
                    if (bodyObj?.data && handleEventPayload(bodyObj.data)) {
                      finished = true;
                      break;
                    }
                  }
                } else if (parsed.type) {
                  if (handleEventPayload(parsed)) finished = true;
                } else if (parsed.data && parsed.data.type) {
                  if (handleEventPayload(parsed.data)) finished = true;
                }
              } catch {}
            }
          }
        }
        await fetchWebDevMetadata(chat, targetMsg, true);
        return true;
      } catch {
        return false;
      } finally {
        _webdevStreamInFlight.delete(key);
      }
    })();
    _webdevStreamInFlight.set(key, p);
    return p;
  }

  async function hydrateChatWebDev(chat) {
    if (!chat || !Array.isArray(chat.messages)) return;
    const assts = chat.messages.filter(m => m && m.role === 'assistant' && m.id);
    await Promise.all(assts.map(async m => {
      const wfId = m.activeWorkflowRunId || m.metadata?.workflowRunId || null;
      if ((m.status === 'pending' || m.status === 'streaming') && wfId) {
        await streamWebDevMessageSSE(chat, m, chat.ctl?.signal);
      } else {
        await fetchWebDevMetadata(chat, m, false);
      }
    }));
  }

  async function parseStream(reader, chat, msgA, msgB) {
    const decoder = new TextDecoder();
    let buf = '';
    const finishedSlots = new Set();
    const ensurePart = (msg, type) => {
      if (!msg) return null;
      if (!Array.isArray(msg.parts)) msg.parts = [];
      const hasTools = msg.parts.some(x => x && String(x.type || '').startsWith('tool-'));
      if (!hasTools) {
        let p = msg.parts.find(x => x && x.type === type);
        if (!p) {
          p = { type, text: '', state: 'streaming' };
          if (type === 'reasoning') msg.parts.unshift(p);
          else msg.parts.push(p);
        }
        return p;
      }
      const last = msg.parts[msg.parts.length - 1];
      if (last && last.type === type) return last;
      const p = { type, text: '', state: 'streaming' };
      msg.parts.push(p);
      return p;
    };

    const handleLine = rawLine => {
      const line = String(rawLine || '').trim();
      if (!line) return;
      let pos = 'a';
      let rest = line;
      if ((line[0] === 'a' || line[0] === 'b') && line.indexOf(':') > 1) {
        pos = line[0];
        rest = line.slice(1);
      }
      const colonIdx = rest.indexOf(':');
      if (colonIdx <= 0) return;
      const code = rest.slice(0, colonIdx);
      const jsonStr = rest.slice(colonIdx + 1);
      const targetMsg = pos === 'b' ? (msgB || msgA) : msgA;
      if (!targetMsg) return;

      let val;
      try {
        val = JSON.parse(jsonStr);
      } catch {
        val = jsonStr;
      }

      const tNow = Date.now();
      targetMsg.metadata = targetMsg.metadata || {};
      targetMsg.metadata.timing = targetMsg.metadata.timing || { startedAt: tNow };

      if (code === '0') {
        const chunk = typeof val === 'string' ? val : String(val ?? '');
        if (!targetMsg.metadata.timing.firstTokenAt) targetMsg.metadata.timing.firstTokenAt = tNow;
        if (targetMsg.metadata.timing.reasoningStartedAt && !targetMsg.metadata.timing.reasoningCompletedAt) {
          targetMsg.metadata.timing.reasoningCompletedAt = tNow;
          targetMsg.metadata.timing.thinkingMs = tNow - targetMsg.metadata.timing.reasoningStartedAt;
        }
        const tp = ensurePart(targetMsg, 'text');
        if (tp) tp.text = (tp.text || '') + chunk;
        if (chunk.length > 0) {
          targetMsg._fmt = targetMsg._fmt || { tN: 0, tChars: 0, rN: 0, rChars: 0, firstAt: tNow, lastAt: tNow };
          targetMsg._fmt.tN += 1;
          targetMsg._fmt.tChars += chunk.length;
          targetMsg._fmt.lastAt = tNow;
          targetMsg.metadata._fmt = targetMsg._fmt;
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === 'g') {
        const chunk = typeof val === 'string' ? val : String(val ?? '');
        if (!targetMsg.metadata.timing.firstTokenAt) targetMsg.metadata.timing.firstTokenAt = tNow;
        if (!targetMsg.metadata.timing.reasoningStartedAt) {
          targetMsg.metadata.timing.reasoningStartedAt = tNow;
        }
        const rp = ensurePart(targetMsg, 'reasoning');
        if (rp) rp.text = (rp.text || '') + chunk;
        if (chunk.length > 0) {
          targetMsg._fmt = targetMsg._fmt || { tN: 0, tChars: 0, rN: 0, rChars: 0, firstAt: tNow, lastAt: tNow };
          targetMsg._fmt.rN += 1;
          targetMsg._fmt.rChars += chunk.length;
          targetMsg._fmt.lastAt = tNow;
          targetMsg.metadata._fmt = targetMsg._fmt;
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === '9' && val && typeof val === 'object') {
        upsertToolCallPart(chat, targetMsg, val);
      } else if (code === 'a' && val && typeof val === 'object') {
        applyToolResultPart(chat, targetMsg, val);
      } else if (code === 'b' && val && typeof val === 'object') {
        if (val.toolCallId && val.toolCallId !== 'citation-source' && val.toolName) {
          upsertToolCallPart(chat, targetMsg, { toolCallId: val.toolCallId, toolName: val.toolName, args: {} });
        }
      } else if (code === 'c' && val && typeof val === 'object') {
        if (val.toolCallId === 'citation-source' && typeof val.argsTextDelta === 'string') {
          try {
            const parsedSrc = JSON.parse(val.argsTextDelta)?.source;
            if (parsedSrc) {
              let sp = (targetMsg.parts || []).find(p => p && p.type === 'sources');
              if (!sp) {
                sp = { type: 'sources', sources: [] };
                targetMsg.parts.push(sp);
              }
              if (!sp.sources.some(s => s && s.url === parsedSrc.url)) sp.sources.push(parsedSrc);
              targetMsg.v = (targetMsg.v || 0) + 1;
            }
          } catch {}
        } else if (val.toolCallId && typeof val.argsTextDelta === 'string') {
          const tp = (targetMsg.parts || []).find(p => p && p.toolCallId === val.toolCallId);
          if (tp) {
            tp.inputText = (tp.inputText || '') + val.argsTextDelta;
            tp.state = 'input-streaming';
            targetMsg.v = (targetMsg.v || 0) + 1;
          }
        }
      } else if (code === 'h' && val && typeof val === 'object') {
        let sp = (targetMsg.parts || []).find(p => p && p.type === 'sources');
        if (!sp) {
          sp = { type: 'sources', sources: [] };
          targetMsg.parts.push(sp);
        }
        const src = val.source || val;
        if (src && src.url && !sp.sources.some(s => s && s.url === src.url)) sp.sources.push(src);
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === '2' && Array.isArray(val)) {
        for (const item of val) {
          if (!item || typeof item !== 'object') continue;
          if (item.type === 'image' && (item.image || item.url)) {
            const url = item.url || (String(item.image).startsWith('data:') ? item.image : `data:${item.mimeType || 'image/png'};base64,${item.image}`);
            targetMsg.parts.push({ type: 'image', url, contentType: item.mimeType || 'image/png' });
          } else if (item.type === 'video' && item.url) {
            targetMsg.parts.push({ type: 'video', url: item.url, thumbnailUrl: item.thumbnailUrl || null, contentType: item.mimeType || 'video/mp4' });
          } else if (item.type === 'sources' && Array.isArray(item.sources)) {
            targetMsg.parts.push({ type: 'sources', sources: item.sources });
          } else if (item.type === 'routed_model' && item.organization) {
            targetMsg.metadata.routedOrganization = item.organization;
          } else if (item.type === 'webdev' && item.event) {
            applyWebDevChunkEvent(chat, targetMsg, item.event);
            if (item.event.type === 'preview-ready') finishedSlots.add(pos);
          }
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === 'k' && val && typeof val === 'object') {
        const mime = val.mimeType || val.contentType || 'image/png';
        const url = val.url || (val.data ? `data:${mime};base64,${val.data}` : null);
        if (url) {
          const isVideo = String(mime).startsWith('video/');
          targetMsg.parts.push({ type: isVideo ? 'video' : 'image', url, contentType: mime });
          targetMsg.v = (targetMsg.v || 0) + 1;
        }
      } else if (code === 'e' || code === 'd') {
        if (code === 'd') finishedSlots.add(pos);
        targetMsg.metadata.pending = false;
        const isErrFinish = Boolean(val && typeof val === 'object' && val.finishReason === 'error');
        if (isErrFinish) {
          targetMsg.status = 'failed';
          targetMsg.failureReason = targetMsg.failureReason || val.message || val.error || 'The generation failed';
        } else if (targetMsg.status !== 'failed') {
          targetMsg.status = 'success';
        }
        for (const p of targetMsg.parts || []) {
          if (p && p.state === 'streaming') p.state = 'done';
        }
        if (targetMsg.metadata.timing.reasoningStartedAt && !targetMsg.metadata.timing.reasoningCompletedAt) {
          targetMsg.metadata.timing.reasoningCompletedAt = tNow;
          targetMsg.metadata.timing.thinkingMs = tNow - targetMsg.metadata.timing.reasoningStartedAt;
        }
        targetMsg.metadata.timing.completedAt = tNow;
        targetMsg.metadata.timing.turnDurationMs = Math.max(0, tNow - (targetMsg.metadata.timing.startedAt || tNow));
        if (targetMsg._fmt) targetMsg.metadata._fmt = targetMsg._fmt;
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === '3') {
        finishedSlots.add(pos);
        targetMsg.metadata.pending = false;
        targetMsg.status = 'failed';
        targetMsg.failureReason = typeof val === 'string' ? val : (val?.message || val?.error || '生成失败');
        targetMsg.v = (targetMsg.v || 0) + 1;
      }

      chat.lastActivity = tNow;
      chat.byteAt = tNow;
      chat.progAt = tNow;
      chat.respAt = chat.respAt || tNow;
      chat.emitStreamSoon?.(24);
      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try { Bus.emit('eval:stream', { sid: chat.sid, pos, chat }); } catch {}
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const rNow = Date.now();
      chat.byteAt = rNow;
      chat.progAt = rNow;
      chat.respAt = chat.respAt || rNow;
      chat.lastActivity = rNow;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buf.trim()) handleLine(buf);

    const isWebDevTurn = chat?.modality === 'webdev' || chat?.evalModality === 'webdev' || chat?.resolvedModality === 'webdev';
    if (isWebDevTurn) {
      const pendingTargets = [];
      if (msgA && !finishedSlots.has('a') && msgA.status !== 'failed') pendingTargets.push(msgA);
      if (msgB && msgB !== msgA && !finishedSlots.has('b') && msgB.status !== 'failed') pendingTargets.push(msgB);
      if (pendingTargets.length) {
        await Promise.all(pendingTargets.map(m => streamWebDevMessageSSE(chat, m, chat.ctl?.signal).catch(() => false)));
      }
    }

    const endNow = Date.now();
    for (const m of new Set([msgA, msgB].filter(Boolean))) {
      if (!m) continue;
      if (m.metadata) {
        m.metadata.pending = false;
        if (m.metadata.timing) {
          if (m.metadata.timing.reasoningStartedAt && !m.metadata.timing.reasoningCompletedAt) {
            m.metadata.timing.reasoningCompletedAt = endNow;
            m.metadata.timing.thinkingMs = endNow - m.metadata.timing.reasoningStartedAt;
          }
          if (!m.metadata.timing.completedAt) {
            m.metadata.timing.completedAt = endNow;
            m.metadata.timing.turnDurationMs = Math.max(0, endNow - (m.metadata.timing.startedAt || endNow));
          }
        }
        if (m._fmt) m.metadata._fmt = m._fmt;
      }
      if (!m.status || m.status === 'pending' || m.status === 'streaming') m.status = 'success';
      for (const p of m.parts || []) {
        if (p && p.state === 'streaming') p.state = 'done';
      }
      if (isWebDevTurn) {
        const wd = reconstructWebDevFromMessage(m, 'webdev');
        if (wd) m.webdev = wd;
        void fetchWebDevMetadata(chat, m, true);
      }
      m.v = (m.v || 0) + 1;
    }
    try { if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') HtmlPreview.syncEval(chat); } catch {}
  }

  async function streamTurn(chat, text, opts = {}) {
    const isFirst = Boolean(opts.isFirst);
    initEvalFields(chat);
    const isBattle = chat.evalMode === 'battle';

    let effectiveModality = chat.modality || ModeState.getModality() || 'chat';
    if (isFirst && isBattle && effectiveModality === 'auto') {
      chat.phase = '正在智能路由模态…';
      chat.emit();
      effectiveModality = await resolveAutoModality(text, opts.files);
      chat.resolvedModality = effectiveModality;
    } else if (effectiveModality === 'auto') {
      effectiveModality = chat.resolvedModality || 'chat';
    }

    let attachments = [];
    if (Array.isArray(opts.files) && opts.files.length && typeof Uploads !== 'undefined') {
      try {
        if (typeof Uploads.wait === 'function') {
          const uploaded = await Uploads.wait(opts.files);
          if (Array.isArray(uploaded)) {
            attachments = uploaded.map(u => ({
              name: u.name || 'file',
              contentType: u.contentType || u.type || 'application/octet-stream',
              url: u.url || u.downloadUrl || '',
            })).filter(x => x.url);
          }
        }
      } catch {}
    }

    const userMsg = opts.userMsg || chat.messages.findLast(m => m && m.role === 'user');
    const userMessageId = userMsg?.id || genUuid();

    const prevTurnAssts = [];
    if (!isFirst) {
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        const m = chat.messages[i];
        if (!m || m === userMsg) continue;
        if (m.role === 'assistant' && m.id && !m.metadata?.pending) {
          prevTurnAssts.push(m.id);
          if (prevTurnAssts.length >= (isBattle ? 2 : 1)) break;
        }
      }
    }

    const msgAId = genUuid();
    const msgBId = isBattle ? genUuid() : null;
    const msgA = {
      id: msgAId,
      role: 'assistant',
      participantPosition: 'a',
      parentMessageIds: [userMessageId],
      modelId: chat.evalMode === 'direct' ? chat.modelAId : null,
      status: 'pending',
      parts: [],
      metadata: { pending: true, timing: { startedAt: Date.now() } },
      createdAt: new Date().toISOString(),
      v: 0,
    };
    const msgB = isBattle ? {
      id: msgBId,
      role: 'assistant',
      participantPosition: 'b',
      parentMessageIds: [userMessageId],
      modelId: null,
      status: 'pending',
      parts: [],
      metadata: { pending: true, timing: { startedAt: Date.now() } },
      createdAt: new Date().toISOString(),
      v: 0,
    } : null;

    chat.messages.push(msgA);
    if (msgB) chat.messages.push(msgB);
    if (isBattle && chat.voteState) {
      chat.voteState.voted = false;
      chat.voteState.submitting = false;
      chat.voteState.value = null;
    }

    const startNow = Date.now();
    chat.status = 'streaming';
    chat.streaming = true;
    chat._evalStreaming = true;
    chat.connAt = startNow;
    chat.streamOpenAt = startNow;
    chat.byteAt = startNow;
    chat.progAt = startNow;
    chat.phase = isBattle ? '双模型盲测生成中…' : '直连模型生成中…';
    const ctl = new AbortController();
    chat.ctl = ctl;
    chat.emit();

    try {
      const rcAction = 'chat_submit';
      let v3Token = null;
      let v2Token = opts.v2 || null;
      const prePureTask = (typeof IPRep !== 'undefined' && typeof IPRep.ensurePreSendPure === 'function')
        ? IPRep.ensurePreSendPure({ timeoutMs: 1200 }).catch(() => null)
        : Promise.resolve(null);
      if (!v2Token && typeof Recaptcha !== 'undefined') {
        const [tok] = await Promise.all([
          (Recaptcha.take ? Recaptcha.take(rcAction) : Recaptcha.v3(rcAction)).catch(() => null),
          prePureTask,
        ]);
        v3Token = tok;
      } else {
        await prePureTask;
      }
      const cx = typeof packClientInteraction === 'function'
        ? packClientInteraction(String(text || '') || 8, Math.random() < 0.45 ? 'button' : 'enter')
        : undefined;

      const endpoint = isFirst
        ? '/nextjs-api/stream/create-evaluation'
        : `/nextjs-api/stream/post-to-evaluation/${encodeURIComponent(chat.sid)}`;

      let resolvedDirectModelId = null;
      if (chat.evalMode === 'direct') {
        const rawMid = chat.modelAId || ModeState.directModelId || '';
        resolvedDirectModelId = ModelCatalog.resolveModelUuid(rawMid, effectiveModality);
        chat.modelAId = resolvedDirectModelId;
        msgA.modelId = resolvedDirectModelId;
      }

      const payload = {
        id: chat.sid,
        mode: chat.evalMode,
        modality: effectiveModality,
        userMessageId,
        modelAMessageId: msgAId,
        ...(isBattle ? { modelBMessageId: msgBId } : {}),
        ...(chat.evalMode === 'direct' && resolvedDirectModelId ? { modelAId: resolvedDirectModelId } : {}),
        userMessage: {
          id: userMessageId,
          role: 'user',
          content: text,
          experimental_attachments: attachments,
          metadata: {},
        },
        messages: [
          {
            id: userMessageId,
            role: 'user',
            content: text,
            experimental_attachments: attachments,
            parentMessageIds: prevTurnAssts,
          },
        ],
        parentMessageIds: prevTurnAssts,
        timezone: typeof currentTimezone === 'function' ? currentTimezone() : 'UTC',
        recaptchaV3Token: v2Token ? null : v3Token,
        ...(v2Token ? { recaptchaV2Token: v2Token } : {}),
        ...(cx ? { cx } : {}),
      };

      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      chat.connAt = Date.now();
      let res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: ctl.signal,
      });

      let usedV2 = Boolean(v2Token);
      if ((res.status === 403 || res.status === 429) && !v2Token && typeof Recaptcha !== 'undefined' && typeof Recaptcha.v2 === 'function') {
        const errBody = await res.clone().text().catch(() => '');
        if (/recaptcha|verification required|人机/i.test(errBody)) {
          if (res.status === 403 && v3Token && typeof IPRep !== 'undefined' && typeof IPRep.note === 'function') {
            try { IPRep.note('rc'); } catch {}
          }
          const tok = await Recaptcha.v2().catch(() => null);
          if (tok) {
            usedV2 = true;
            payload.recaptchaV2Token = tok;
            payload.recaptchaV3Token = null;
            res = await fetchFn(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: '*/*' },
              body: JSON.stringify(payload),
              credentials: 'same-origin',
              cache: 'no-store',
              signal: ctl.signal,
            });
          }
        }
      }

      if (!res.ok) {
        const errTxt = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(errTxt || `HTTP ${res.status}`);
      }
      if (v3Token && !usedV2 && typeof IPRep !== 'undefined' && typeof IPRep.note === 'function') {
        try { IPRep.note('ok'); } catch {}
      }

      const respNow = Date.now();
      chat.respAt = respNow;
      chat.byteAt = respNow;
      chat.progAt = respNow;
      chat.streamOpenAt = respNow;

      if (res.body && typeof res.body.getReader === 'function') {
        await parseStream(res.body.getReader(), chat, msgA, msgB);
      } else {
        const fullTxt = await res.text();
        const fakeReader = {
          _done: false,
          async read() {
            if (this._done) return { done: true, value: undefined };
            this._done = true;
            return { done: false, value: new TextEncoder().encode(fullTxt) };
          },
        };
        await parseStream(fakeReader, chat, msgA, msgB);
      }

      chat.status = 'idle';
      chat.streaming = false;
      chat._evalStreaming = false;
      chat.phase = '';
      chat.error = null;
      if (userMsg) delete userMsg._local;
      try {
        if (typeof MsgCache !== 'undefined' && typeof MsgCache.put === 'function' && chat.messages.length) {
          void MsgCache.put(chat.sid, { messages: chat.messages, at: Date.now() });
        }
      } catch {}
      chat.evalModality = effectiveModality;
      try {
        if (chat.evalMode === 'battle' && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.analyzeBattleChat === 'function') {
          ChatHabitFingerprint.analyzeBattleChat(chat);
        } else if (chat.evalMode === 'direct' && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnDirectSession === 'function') {
          const dName = chat.directModelName || ModelCatalog.resolveModelName(chat.modelAId || ModeState.directModelId, chat.revealedModels);
          if (dName) {
            chat.directModelName = dName;
            ChatHabitFingerprint.learnDirectSession(chat, dName);
          }
        }
      } catch {}
      try { if (typeof History !== 'undefined' && History.touched) History.touched(chat.sid); } catch {}
      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try { Bus.emit('turn', chat, { eval: true }); } catch {}
      }
      chat.emit();
      try { if (typeof Dock !== 'undefined' && Dock.render) Dock.render(); } catch {}
    } catch (e) {
      if (e?.name === 'AbortError') {
        chat.status = 'idle';
        chat.streaming = false;
        chat._evalStreaming = false;
        chat.phase = '已停止';
      } else {
        chat.status = 'idle';
        chat.streaming = false;
        chat._evalStreaming = false;
        chat.error = '生成失败：' + (e?.message || e);
        msgA.status = 'failed';
        msgA.failureReason = e?.message || String(e);
        if (msgB) {
          msgB.status = 'failed';
          msgB.failureReason = e?.message || String(e);
        }
      }
      for (const m of [msgA, msgB]) {
        if (m?.metadata) m.metadata.pending = false;
      }
      chat.emit();
    } finally {
      chat.ctl = null;
      chat.streaming = false;
      chat._evalStreaming = false;
    }
  }

  async function createEvalChat(text, opt = {}) {
    const sid = genUuid();
    const chat = chatOf(sid);
    const evalMode = opt.evalMode || (ModeState.getMode() === 'direct' ? 'direct' : 'battle');
    const modality = opt.modality || ModeState.getModality() || 'chat';
    initEvalFields(chat, { evalMode, modality });

    if (evalMode === 'direct') {
      const dm = ModeState.getDirectModel() || ModelCatalog.getModelsForModality(modality)[0] || null;
      const rawMid = dm?.id || ModeState.directModelId || '019ce973-84c9-7030-9f88-1ebbf2edeb14';
      chat.modelAId = ModelCatalog.resolveModelUuid(rawMid, modality);
      chat.directModelName = dm?.displayName || dm?.publicName || dm?.name || ModelCatalog.resolveModelName(chat.modelAId);
      try {
        if (typeof Models !== 'undefined' && Models.set) {
          Models.set(sid, {
            name: chat.directModelName,
            sure: true,
            guess: false,
            directMode: true,
            provider: 'Direct 直连锁定',
            at: Date.now(),
          });
        }
      } catch {}
    }

    const userMsgId = genUuid();
    const userMsg = {
      id: userMsgId,
      role: 'user',
      text,
      parts: [{ type: 'text', text }],
      createdAt: new Date().toISOString(),
      experimental_attachments: [],
      metadata: {},
      _local: true,
      v: 0,
    };

    chat.messages = [userMsg];
    chat.loaded = true;
    chat.status = 'submitted';
    chat.phase = evalMode === 'battle' ? '准备对战生成…' : '准备直连生成…';
    chat.sentAt = Date.now();
    chat.title = String(text || '').slice(0, 60);

    if (typeof History !== 'undefined' && Array.isArray(History.items) && !History.byId?.(sid)) {
      const ts = new Date().toISOString();
      const row = {
        id: sid,
        type: 'evaluation',
        mode: evalMode,
        modality,
        title: chat.title || (evalMode === 'battle' ? 'Battle 盲测对话' : 'Direct 直连对话'),
        modelAId: chat.modelAId || undefined,
        modelBId: chat.modelBId || undefined,
        createdAt: ts,
        updatedAt: ts,
        _local: true,
      };
      History.items.unshift(row);
      try { History.saveSoon?.(); } catch {}
      try { Bus.emit('history'); } catch {}
    }

    chat.emit();
    if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
      try { Bus.emit('sent', sid, Date.now()); } catch {}
      try { Bus.emit('created', chat); } catch {}
    }

    void streamTurn(chat, text, { isFirst: true, v2: opt.v2, files: opt.files, userMsg });
    return chat;
  }

  async function sendFollowUp(chat, text, opt = {}) {
    if (!chat) return;
    if (chat.busy) throw new Error('上一轮还在进行中');
    initEvalFields(chat);
    const userMsgId = genUuid();
    const userMsg = {
      id: userMsgId,
      role: 'user',
      text,
      parts: [{ type: 'text', text }],
      createdAt: new Date().toISOString(),
      experimental_attachments: [],
      metadata: {},
      _local: true,
      v: 0,
    };
    chat.messages.push(userMsg);
    chat.sentAt = Date.now();
    chat.emit();
    if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
      try { Bus.emit('sent', chat.sid, Date.now()); } catch {}
    }
    await streamTurn(chat, text, { isFirst: false, v2: opt.v2, files: opt.files, userMsg });
  }

  function buildEvalRouterStateTree(sid) {
    try {
      const tree = [
        '',
        {
          children: [
            ['locale', 'en', 'd', null],
            {
              children: [
                '(app)',
                {
                  children: [
                    '(chat-shell)',
                    {
                      children: [
                        '(with-sidebar)',
                        {
                          children: [
                            '(fade)',
                            {
                              children: [
                                '(evaluation)',
                                {
                                  children: [
                                    'c',
                                    {
                                      children: [
                                        ['id', String(sid || ''), 'd', null],
                                        { children: ['__PAGE__', {}, null, null] },
                                        null,
                                        null,
                                      ],
                                    },
                                    null,
                                    null,
                                  ],
                                },
                                null,
                                null,
                              ],
                            },
                            null,
                            null,
                          ],
                        },
                        null,
                        null,
                      ],
                    },
                    null,
                    null,
                    16,
                  ],
                },
              ],
            },
          ],
        },
        null,
        null,
        true,
      ];
      return encodeURIComponent(JSON.stringify(tree));
    } catch {
      return '';
    }
  }

  async function discoverLiveVoteAction(sid) {
    const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
    const urls = sid ? [`/c/${encodeURIComponent(sid)}`, '/text'] : ['/text'];
    for (const u of urls) {
      try {
        const r = await fetchFn(u, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'text/html,application/xhtml+xml' },
        });
        if (!r || !r.ok) continue;
        const html = await r.text();
        updateWebDeploymentIdFromHtml(html);
        const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/([^"'?\s]+\.js)(?:\?dpl=[^"'\s&]+)?/g)].map(m => m[1]))];
        if (!chunks.length) continue;
        let found = '';
        const queue = [...chunks];
        const scanWorker = async () => {
          while (queue.length && !found) {
            const ch = queue.shift();
            if (!ch) break;
            try {
              const cr = await fetchFn(`/_next/static/chunks/${ch}${cachedWebDeploymentId ? '?dpl=' + encodeURIComponent(cachedWebDeploymentId) : ''}`, {
                method: 'GET',
                credentials: 'same-origin',
              });
              if (!cr || !cr.ok) continue;
              const js = await cr.text();
              if (!js.includes('createPairwiseFeedback')) continue;
              const m = /createServerReference\)\(\s*["']([0-9a-f]{40,44})["'][^)]*["']createPairwiseFeedback["']/i.exec(js)
                || /["']([0-9a-f]{40,44})["'][^;]{0,160}["']createPairwiseFeedback["']/i.exec(js);
              if (m && m[1]) {
                found = m[1];
                cachedVoteActionId = found;
                try {
                  if (typeof Store !== 'undefined' && Store.set) Store.set('eval:voteActionId', cachedVoteActionId);
                } catch {}
                return;
              }
            } catch {}
          }
        };
        await Promise.all(Array.from({ length: Math.min(6, queue.length) }, scanWorker));
        if (found) return found;
      } catch {}
    }
    return cachedVoteActionId;
  }

  async function submitVote(sid, voteValue = 'tie') {
    const chat = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (!chat) throw new Error('未找到当前对战会话');
    initEvalFields(chat);
    if (chat.voteState?.submitting) return chat.voteState;

    const assts = (chat.messages || []).filter(m => m && m.role === 'assistant');
    const msgA = [...assts].reverse().find(m => m.participantPosition === 'a') || assts[0];
    const msgB = [...assts].reverse().find(m => m.participantPosition === 'b') || assts[1];
    if (!msgA || !msgB) throw new Error('当前轮次尚未生成完整的 A/B 双侧回复');

    chat.voteState = { ...(chat.voteState || {}), submitting: true, value: voteValue };
    chat.emit();

    let modelAId = null;
    let modelBId = null;
    let revealedModels = Array.isArray(chat.revealedModels) ? [...chat.revealedModels] : [];
    let actionError = '';

    try {
      const recaptchaV3Token = (typeof Recaptcha !== 'undefined' && Recaptcha.v3)
        ? await Recaptcha.v3('pairwise_feedback').catch(() => null)
        : null;

      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validModelAId = (chat.modelAId && uuidRe.test(String(chat.modelAId))) ? String(chat.modelAId) : undefined;
      const validModelBId = (chat.modelBId && uuidRe.test(String(chat.modelBId))) ? String(chat.modelBId) : undefined;

      const actionBody = JSON.stringify([
        {
          evaluationSessionId: sid,
          messageAId: msgA.id,
          messageBId: msgB.id,
          ...(validModelAId ? { modelAId: validModelAId } : {}),
          ...(validModelBId ? { modelBId: validModelBId } : {}),
          value: voteValue,
          didInspectBothMobileHorizontalResponses: true,
          recaptchaV3Token,
        },
      ]);

      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      const inspectFlightNode = (node, depth = 0) => {
        if (depth > 8 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          if (node.length && node[0] && typeof node[0] === 'object' && (node[0].publicName || node[0].displayName || (node[0].id && node[0].organization))) {
            if (!revealedModels.length) revealedModels = node;
          }
          for (const item of node) inspectFlightNode(item, depth + 1);
          return;
        }
        if (node.success === false && node.error) {
          actionError = String(node.error);
        }
        if (node.modelAId && typeof node.modelAId === 'string') modelAId = modelAId || node.modelAId;
        if (node.modelBId && typeof node.modelBId === 'string') modelBId = modelBId || node.modelBId;
        if (Array.isArray(node.revealedModels) && node.revealedModels.length) {
          revealedModels = node.revealedModels;
        }
        for (const sub of [node.a, node.data, node.evaluation, node.result, node.initialState]) {
          if (sub && typeof sub === 'object') inspectFlightNode(sub, depth + 1);
        }
      };

      const parseActionFlight = (flightText) => {
        if (!flightText || typeof flightText !== 'string') return;
        const { jsonChunks, resolveRefs } = parseFlightStreamRows(flightText);
        for (const [, rawChunk] of jsonChunks.entries()) {
          if (!rawChunk) continue;
          const rawBody = /^[A-Za-z][{\["]/.test(rawChunk) ? rawChunk.slice(1) : rawChunk;
          if (!rawBody.startsWith('{') && !rawBody.startsWith('[')) continue;
          try {
            const parsed = resolveRefs(JSON.parse(rawBody));
            inspectFlightNode(parsed, 0);
          } catch {}
        }
      };

      const routerStateTree = buildEvalRouterStateTree(sid);
      let actionNotFoundSeen = false;
      const tryPostVoteAction = async (actionId, dplHeader) => {
        if (!actionId) return;
        const headers = {
          Accept: 'text/x-component',
          'Content-Type': 'text/plain;charset=UTF-8',
          'Next-Action': actionId,
        };
        if (routerStateTree) headers['Next-Router-State-Tree'] = routerStateTree;
        if (dplHeader) headers['X-Deployment-Id'] = dplHeader;
        const resp = await fetchFn(`/c/${encodeURIComponent(sid)}`, {
          method: 'POST',
          headers,
          body: actionBody,
          credentials: 'same-origin',
        }).catch(() => null);
        if (!resp) return;
        if (resp.headers?.get?.('x-nextjs-action-not-found') === '1') {
          actionNotFoundSeen = true;
          return;
        }
        if (resp.ok) {
          const flightText = await resp.text().catch(() => '');
          parseActionFlight(flightText);
        }
      };

      const candidateActions = [...new Set([cachedVoteActionId, VOTE_NEXT_ACTION, PREV_VOTE_NEXT_ACTION, LEGACY_VOTE_NEXT_ACTION].filter(Boolean))];
      for (const actionId of candidateActions) {
        await tryPostVoteAction(actionId, cachedWebDeploymentId);
        if (modelAId && modelBId) {
          cachedVoteActionId = actionId;
          try { if (typeof Store !== 'undefined' && Store.set) Store.set('eval:voteActionId', cachedVoteActionId); } catch {}
          break;
        }
      }

      if (!modelAId || !modelBId) {
        const prevDpl = cachedWebDeploymentId;
        const prevAct = cachedVoteActionId;
        const evalObj = await fetchEvalSessionData(sid).catch(() => null);
        if (evalObj) {
          if (Array.isArray(evalObj.revealedModels) && evalObj.revealedModels.length) {
            revealedModels = evalObj.revealedModels;
          }
          const fb = Array.isArray(evalObj.pairwiseFeedbacks) ? evalObj.pairwiseFeedbacks.at(-1) : null;
          modelAId = modelAId || fb?.modelAId || evalObj.modelAId || null;
          modelBId = modelBId || fb?.modelBId || evalObj.modelBId || null;
          if ((!modelAId || !modelBId) && Array.isArray(evalObj.messages)) {
            for (const m of evalObj.messages) {
              if (m?.role === 'assistant' && m.modelId) {
                if (m.participantPosition === 'b') modelBId = modelBId || m.modelId;
                else modelAId = modelAId || m.modelId;
              }
            }
          }
        }
        if (!modelAId || !modelBId) {
          // Discover live Next-Action ID from Arena's current JS chunks if action was rotated on redeploy
          if (actionNotFoundSeen || cachedWebDeploymentId !== prevDpl) {
            await discoverLiveVoteAction(sid).catch(() => null);
          }
          const retryActions = [...new Set([cachedVoteActionId, VOTE_NEXT_ACTION].filter(Boolean))];
          const retryDpls = [...new Set([cachedWebDeploymentId, ''].filter(d => d !== undefined))];
          for (const act of retryActions) {
            for (const dpl of retryDpls) {
              if (act === prevAct && dpl === prevDpl && !actionNotFoundSeen) continue;
              await tryPostVoteAction(act, dpl);
              if (modelAId && modelBId) break;
            }
            if (modelAId && modelBId) break;
          }
        }
      }

      if (!modelAId || !modelBId) {
        const errMsg = actionError || '投票未能提交到服务器（模型尚未揭晓），请稍后重试';
        if (typeof toast === 'function') toast(errMsg, 'err');
        throw new Error(errMsg);
      }

      if (Array.isArray(revealedModels) && revealedModels.length) {
        try { ModelCatalog.ingestInitialModels(revealedModels); } catch {}
      }

      chat.revealedModels = revealedModels;
      chat.modelAId = modelAId;
      chat.modelBId = modelBId;
      msgA.modelId = modelAId;
      msgB.modelId = modelBId;
      const fbItem = {
        id: genUuid(),
        evaluationSessionId: sid,
        messageAId: msgA.id,
        messageBId: msgB.id,
        modelAId,
        modelBId,
        value: voteValue,
      };
      chat.pairwiseFeedbacks = [...(Array.isArray(chat.pairwiseFeedbacks) ? chat.pairwiseFeedbacks : []), fbItem];
      try { if (typeof BotService !== 'undefined' && BotService.noteBattleVote) BotService.noteBattleVote(sid, voteValue); } catch {}

      try {
        const lsCur = readLocalEvalCache(sid) || {
          id: sid,
          title: chat.title || '',
          mode: chat.evalMode || 'battle',
          modality: chat.modality || 'chat',
          messages: (chat.messages || []).map(m => ({
            id: m.id,
            role: m.role,
            content: m.role === 'user' ? (m.text || extractUserText(m.content || m.parts)) : extractContentText(m.parts || m.content),
            reasoning: m.role === 'assistant' ? (m.parts || []).filter(p => p?.type === 'reasoning').map(p => p.text || '').join('') : undefined,
            experimental_attachments: m.experimental_attachments || [],
            parentMessageIds: m.parentMessageIds || [],
            participantPosition: m.participantPosition,
            modelId: m.modelId || null,
            evaluationSessionId: sid,
            status: m.status || 'success',
          })),
        };
        lsCur.modelAId = modelAId;
        lsCur.modelBId = modelBId;
        lsCur.revealedModels = revealedModels;
        if (Array.isArray(lsCur.messages)) {
          for (const m of lsCur.messages) {
            if (!m || m.role !== 'assistant') continue;
            if (m.id === msgA.id || m.participantPosition === 'a') m.modelId = modelAId;
            else if (m.id === msgB.id || m.participantPosition === 'b') m.modelId = modelBId;
          }
        }
        lsCur.pairwiseFeedbacks = [...(Array.isArray(lsCur.pairwiseFeedbacks) ? lsCur.pairwiseFeedbacks : []), fbItem];
        lsCur.savedAt = Date.now();
        writeLocalEvalCache(sid, lsCur);
      } catch {}

      try {
        if (typeof Models !== 'undefined' && Models.all && Models.all[sid] && !Models.all[sid].battleRevealed) {
          delete Models.all[sid];
          if (typeof Store !== 'undefined' && Store.set) Store.set('models', Models.all);
        }
      } catch {}

      const modelAName = ModelCatalog.resolveModelName(modelAId, revealedModels);
      const modelBName = ModelCatalog.resolveModelName(modelBId, revealedModels);

      chat.voteState = {
        voted: true,
        submitting: false,
        value: voteValue,
        modelAId,
        modelBId,
        modelAName,
        modelBName,
        revealedAt: Date.now(),
        learnedAt: chat.voteState?.learnedAt || null,
      };

      const hRow = typeof History !== 'undefined' ? History.byId?.(sid) : null;
      if (hRow) {
        hRow.modelAId = modelAId;
        hRow.modelBId = modelBId;
        if (hRow.localTitle && !/vs|⚔️/i.test(String(hRow.localTitle))) delete hRow.localTitle;
        try { History.saveSoon?.(); } catch {}
      }

      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try {
          Bus.emit('eval:vote-revealed', {
            sid,
            chat,
            modelA: { id: modelAId, name: modelAName },
            modelB: { id: modelBId, name: modelBName },
            value: voteValue,
            fromHistory: false,
          });
        } catch {}
        try { Bus.emit('history'); } catch {}
      }
      chat.emit();
      return chat.voteState;
    } catch (e) {
      chat.voteState = { ...(chat.voteState || {}), submitting: false };
      chat.emit();
      throw e;
    }
  }

  async function retryEvalMessage(chat, targetMsg, opts = {}) {
    if (!chat || !chat.sid || !targetMsg || !targetMsg.id) return false;
    initEvalFields(chat);
    if (chat.streaming || chat._evalStreaming) {
      try { chat.ctl?.abort?.(); } catch {}
      chat.streaming = false;
      chat._evalStreaming = false;
      chat.status = 'ready';
    }

    const pos = opts.pos || targetMsg.participantPosition || 'a';
    const startNow = Date.now();
    targetMsg.parts = [];
    targetMsg.content = '';
    targetMsg.reasoning = '';
    targetMsg.experimental_attachments = [];
    targetMsg.sources = [];
    targetMsg.status = 'pending';
    delete targetMsg.failed;
    delete targetMsg.failureReason;
    delete targetMsg.errorText;
    delete targetMsg._fmt;
    targetMsg.metadata = {
      ...(targetMsg.metadata || {}),
      pending: true,
      timing: { startedAt: startNow },
    };
    delete targetMsg.metadata._fmt;
    targetMsg.v = (targetMsg.v || 0) + 1;

    chat.status = 'streaming';
    chat.streaming = true;
    chat._evalStreaming = true;
    chat.connAt = startNow;
    chat.streamOpenAt = startNow;
    chat.byteAt = startNow;
    chat.progAt = startNow;
    chat.error = null;
    chat.phase = pos === 'b'
      ? 'Model B 重新生成中…'
      : (chat.evalMode === 'direct' ? '直连模型重新生成中…' : 'Model A 重新生成中…');
    const ctl = new AbortController();
    chat.ctl = ctl;
    chat.emit();

    const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
    const cx = typeof packClientInteraction === 'function'
      ? packClientInteraction(8, 'click')
      : undefined;

    let v3Token = null;
    try {
      const prePureTask = (typeof IPRep !== 'undefined' && typeof IPRep.ensurePreSendPure === 'function')
        ? IPRep.ensurePreSendPure({ timeoutMs: 1200 }).catch(() => null)
        : Promise.resolve(null);
      if (typeof Recaptcha !== 'undefined') {
        const [tok] = await Promise.all([
          typeof Recaptcha.take === 'function' ? Recaptcha.take('chat_retry') : Recaptcha.v3('chat_retry'),
          prePureTask,
        ]);
        v3Token = tok;
      } else {
        await prePureTask;
      }
    } catch {}

    const doPutRetry = (msgId, v2Token = null, v3Override = v3Token) => {
      const url = `/nextjs-api/stream/retry-evaluation-session-message/${encodeURIComponent(chat.sid)}/messages/${encodeURIComponent(msgId)}`;
      const bodyObj = v2Token
        ? { recaptchaV2Token: v2Token, ...(cx ? { cx } : {}) }
        : { recaptchaV3Token: v3Override || null, ...(cx ? { cx } : {}) };
      return fetchFn(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        body: JSON.stringify(bodyObj),
        signal: ctl.signal,
        credentials: 'same-origin',
      });
    };

    try {
      let res = await doPutRetry(targetMsg.id);
      if ((res.status === 403 || res.status === 429) && typeof Recaptcha !== 'undefined' && typeof Recaptcha.v2 === 'function') {
        let errText = '';
        try { errText = await res.clone().text(); } catch {}
        if (/recaptcha|verification required|人机|challenge|rate limit/i.test(errText) || res.status === 403) {
          const tok = await Recaptcha.v2().catch(() => null);
          if (tok) {
            res = await doPutRetry(targetMsg.id, tok);
          }
        }
      }

      if (!res.ok) {
        let errBody = '';
        try { errBody = await res.text(); } catch {}
        const remote = await fetchEvalSessionData(chat.sid).catch(() => null);
        if (remote && Array.isArray(remote.messages) && remote.messages.length) {
          const serverAssts = remote.messages.filter(m => m && m.role === 'assistant');
          const serverMsg = [...serverAssts].reverse().find(m => m.participantPosition === pos)
            || (pos === 'b' ? serverAssts[1] : serverAssts[0]);
          if (serverMsg && serverMsg.id && serverMsg.id !== targetMsg.id) {
            targetMsg.id = serverMsg.id;
            const freshV3 = (typeof Recaptcha !== 'undefined' && typeof Recaptcha.v3 === 'function')
              ? await Recaptcha.v3('chat_retry').catch(() => v3Token)
              : v3Token;
            res = await doPutRetry(targetMsg.id, null, freshV3);
          }
          if (!res.ok && serverMsg && hasRawEvalMsgContent(serverMsg) && serverMsg.status !== 'failed') {
            targetMsg.parts = buildAssistantParts(serverMsg);
            targetMsg.status = 'success';
            targetMsg.metadata = {
              ...(targetMsg.metadata || {}),
              ...(serverMsg.metadata || {}),
              pending: false,
            };
            targetMsg.v = (targetMsg.v || 0) + 1;
            chat.streaming = false;
            chat._evalStreaming = false;
            chat.status = 'ready';
            chat.phase = '';
            chat.ctl = null;
            try { syncChatToLocalEvalCache(chat); } catch {}
            try {
              if (chat.evalMode === 'battle' && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.analyzeBattleChat === 'function') {
                ChatHabitFingerprint.analyzeBattleChat(chat);
              }
            } catch {}
            chat.emit();
            return true;
          }
        } else if (res.status === 404) {
          chat.streaming = false;
          chat._evalStreaming = false;
          chat.status = 'ready';
          chat.ctl = null;
          return false;
        }
        if (!res.ok) {
          throw new Error(errBody || `HTTP ${res.status}`);
        }
      }

      const reader = res.body?.getReader?.();
      if (!reader) throw new Error('未收到流式响应体');

      await parseStream(reader, chat, targetMsg, targetMsg);

      const hasValidOutput = (Array.isArray(targetMsg.parts)
        && targetMsg.parts.some(p => p && ((p.text && String(p.text).trim()) || p.url || String(p.type || '').startsWith('tool-'))))
        || Boolean(targetMsg.webdev?.files?.length || targetMsg.webdev?.previewUrl);
      if (!hasValidOutput || targetMsg.status === 'failed') {
        targetMsg.status = 'failed';
        targetMsg.failureReason = targetMsg.failureReason || 'The generation failed';
        if (targetMsg.metadata) targetMsg.metadata.pending = false;
        targetMsg.v = (targetMsg.v || 0) + 1;
      }

      chat.streaming = false;
      chat._evalStreaming = false;
      chat.status = 'ready';
      chat.phase = '';
      chat.ctl = null;
      chat.loaded = true;

      try {
        if (typeof MsgCache !== 'undefined' && typeof MsgCache.put === 'function') {
          MsgCache.put(chat.sid, { messages: chat.messages, at: Date.now() });
        }
      } catch {}
      try { syncChatToLocalEvalCache(chat); } catch {}

      try {
        if (chat.evalMode === 'battle' && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.analyzeBattleChat === 'function') {
          ChatHabitFingerprint.analyzeBattleChat(chat);
          if (chat.voteState?.voted && chat.voteState.modelAName && chat.voteState.modelBName && typeof ChatHabitFingerprint.learnBattleReveal === 'function') {
            ChatHabitFingerprint.learnBattleReveal(chat, { modelA: { name: chat.voteState.modelAName }, modelB: { name: chat.voteState.modelBName }, vote: chat.voteState.value || 'tie' });
          }
        } else if (chat.evalMode === 'direct' && chat.modelAId && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnDirectSession === 'function') {
          const mName = ModelCatalog.displayName(chat.modelAId);
          ChatHabitFingerprint.learnDirectSession(chat, mName);
        }
      } catch {}

      try {
        if (typeof Dock !== 'undefined' && typeof Dock.render === 'function') Dock.render();
      } catch {}
      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try { Bus.emit('history'); } catch {}
      }
      chat.emit();
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        targetMsg.status = 'cancelled';
        if (targetMsg.metadata) targetMsg.metadata.pending = false;
        chat.streaming = false;
        chat._evalStreaming = false;
        chat.status = 'ready';
        chat.phase = '已停止';
        chat.ctl = null;
        chat.emit();
        return true;
      }
      targetMsg.status = 'failed';
      targetMsg.failureReason = e?.message || String(e || '重新生成失败');
      if (targetMsg.metadata) targetMsg.metadata.pending = false;
      targetMsg.v = (targetMsg.v || 0) + 1;
      chat.streaming = false;
      chat._evalStreaming = false;
      chat.status = 'error';
      chat.error = e?.message || String(e);
      chat.phase = '';
      chat.ctl = null;
      chat.emit();
      throw e;
    }
  }

  async function regenerateTurn(chat, opts = {}) {
    if (!chat) return false;
    initEvalFields(chat);
    if (chat.streaming || chat._evalStreaming) {
      try { chat.ctl?.abort?.(); } catch {}
      chat.streaming = false;
      chat._evalStreaming = false;
      chat.status = 'ready';
    }

    const assts = Array.isArray(chat.messages) ? chat.messages.filter(m => m && m.role === 'assistant') : [];
    const isMsgFailedOrEmpty = m => Boolean(
      !m || m.status === 'failed' || m.failed ||
      (!(Array.isArray(m.parts) && m.parts.some(p => p && ((p.text && String(p.text).trim()) || p.url || String(p.type || '').startsWith('tool-'))))
        && !m?.webdev?.files?.length && !m?.webdev?.previewUrl)
    );

    let pos = opts.pos || opts.msg?.participantPosition || null;
    let targetMsg = opts.msg || null;
    if (!targetMsg && opts.turn) {
      if (pos === 'b') targetMsg = opts.turn.b || null;
      else if (pos === 'a') targetMsg = opts.turn.a || null;
      else if (opts.turn.b && isMsgFailedOrEmpty(opts.turn.b) && opts.turn.a && !isMsgFailedOrEmpty(opts.turn.a)) {
        pos = 'b';
        targetMsg = opts.turn.b;
      } else if (opts.turn.a && isMsgFailedOrEmpty(opts.turn.a)) {
        pos = 'a';
        targetMsg = opts.turn.a;
      } else {
        pos = 'a';
        targetMsg = opts.turn.a || opts.turn.b || null;
      }
    }
    if (!targetMsg && pos) {
      targetMsg = [...assts].reverse().find(m => m.participantPosition === pos) || null;
    }
    if (!targetMsg && assts.length) {
      const lastB = [...assts].reverse().find(m => m.participantPosition === 'b');
      const lastA = [...assts].reverse().find(m => m.participantPosition === 'a') || assts[assts.length - 1];
      if (lastB && isMsgFailedOrEmpty(lastB) && lastA && !isMsgFailedOrEmpty(lastA)) {
        pos = 'b';
        targetMsg = lastB;
      } else if (lastA && isMsgFailedOrEmpty(lastA)) {
        pos = 'a';
        targetMsg = lastA;
      } else {
        targetMsg = lastA || lastB;
        pos = targetMsg?.participantPosition || 'a';
      }
    }

    if (targetMsg && targetMsg.id && chat.sid) {
      const retried = await retryEvalMessage(chat, targetMsg, { ...opts, pos: pos || targetMsg.participantPosition || 'a' });
      if (retried) return true;
    }

    const targetUserMsg = opts.turn?.user || opts.userMsg || (Array.isArray(chat.messages) ? chat.messages.findLast(m => m && m.role === 'user') : null);
    if (!targetUserMsg) {
      if (chat.sid) {
        await loadChat(chat, true).catch(() => {});
        return true;
      }
      return false;
    }
    const userText = (targetUserMsg.parts || []).filter(p => p && p.type === 'text' && p.text).map(p => p.text).join('\n')
      || String(targetUserMsg.content || '').trim();
    if (!userText) {
      if (chat.sid) {
        await loadChat(chat, true).catch(() => {});
        return true;
      }
      return false;
    }

    const uIdx = chat.messages.indexOf(targetUserMsg);
    const userMsgsBefore = uIdx >= 0
      ? chat.messages.slice(0, uIdx + 1).filter(m => m && m.role === 'user').length
      : 1;
    const isFirstTurn = userMsgsBefore <= 1;

    if (uIdx >= 0) {
      let endIdx = chat.messages.length;
      for (let i = uIdx + 1; i < chat.messages.length; i++) {
        if (chat.messages[i]?.role === 'user') {
          endIdx = i;
          break;
        }
      }
      chat.messages.splice(uIdx + 1, endIdx - (uIdx + 1));
    }

    targetUserMsg.id = genUuid();
    await streamTurn(chat, userText, {
      isFirst: isFirstTurn,
      isRetry: true,
      userMsg: targetUserMsg,
    });
    return true;
  }

  function hookChatPrototype() {
    if (typeof Chat === 'undefined' || !Chat.prototype || Chat.prototype._evalHooked) return;
    Chat.prototype._evalHooked = true;

    const origLoad = Chat.prototype.load;
    Chat.prototype.load = function (force) {
      if (isEvalChat(this)) {
        return loadChat(this, force);
      }
      const p = origLoad.call(this, force);
      if (p && typeof p.catch === 'function') {
        return p.catch(async err => {
          if (err && err.status === 404 && !this.isEvaluation) {
            try {
              await loadChat(this, true);
              return;
            } catch {}
          }
          throw err;
        });
      }
      return p;
    };

    const origPrefetch = Chat.prototype.prefetch;
    if (typeof origPrefetch === 'function') {
      Chat.prototype.prefetch = function () {
        if (isEvalChat(this)) return;
        return origPrefetch.apply(this, arguments);
      };
    }

    const origSend = Chat.prototype.send;
    if (typeof origSend === 'function') {
      Chat.prototype.send = function (text, opt = {}, _a2 = null, _a3 = null) {
        if (Array.isArray(opt)) opt = (_a3 && typeof _a3 === 'object') ? _a3 : {};
        if (isEvalChat(this)) {
          return sendFollowUp(this, text, opt);
        }
        return origSend.call(this, text, opt, _a2, _a3);
      };
    }

    const origStop = Chat.prototype.stop;
    if (typeof origStop === 'function') {
      Chat.prototype.stop = function (opt) {
        if (isEvalChat(this)) {
          try { this.ctl?.abort(); } catch {}
          this.streaming = false;
          this._evalStreaming = false;
          this.status = 'idle';
          this.phase = '已停止';
          this.emit();
          return Promise.resolve();
        }
        return origStop.call(this, opt);
      };
    }

    const origReload = Chat.prototype.reload;
    if (typeof origReload === 'function') {
      Chat.prototype.reload = function (why, forceFull = false) {
        if (isEvalChat(this)) {
          if (this.busy && this._evalStreaming) return Promise.resolve(false);
          this.error = null;
          this.phase = '重新载入中';
          this.emit();
          return loadChat(this, true).then(() => true, () => false);
        }
        return origReload.call(this, why, forceFull);
      };
    }

    const origResumeInc = Chat.prototype.resumeIncremental;
    if (typeof origResumeInc === 'function') {
      Chat.prototype.resumeIncremental = function (why) {
        if (isEvalChat(this)) {
          if (this.busy && this._evalStreaming) return Promise.resolve(true);
          if (why === 'fast-return' || why === '手动重新载入') {
            return loadChat(this, true).then(() => true, () => false);
          }
          return Promise.resolve(true);
        }
        return origResumeInc.call(this, why);
      };
    }

    const origStream = Chat.prototype.stream;
    if (typeof origStream === 'function') {
      Chat.prototype.stream = function (opt) {
        if (isEvalChat(this)) {
          if (!this._evalStreaming) this.streaming = false;
          if (/^实时通道错误/.test(String(this.error || ''))) {
            this.error = null;
            this.emit();
          }
          return Promise.resolve();
        }
        return origStream.call(this, opt);
      };
    }

    const origRestream = Chat.prototype.restream;
    if (typeof origRestream === 'function') {
      Chat.prototype.restream = function () {
        if (isEvalChat(this)) return;
        return origRestream.apply(this, arguments);
      };
    }

    const origEnsureToken = Chat.prototype.ensureToken;
    if (typeof origEnsureToken === 'function') {
      Chat.prototype.ensureToken = function (force) {
        if (isEvalChat(this)) return Promise.resolve(null);
        return origEnsureToken.call(this, force);
      };
    }

    const origWakeSessionToken = Chat.prototype.wakeSessionToken;
    if (typeof origWakeSessionToken === 'function') {
      Chat.prototype.wakeSessionToken = function (force) {
        if (isEvalChat(this)) return Promise.resolve(null);
        return origWakeSessionToken.call(this, force);
      };
    }

    const origWatch = Chat.prototype.watch;
    if (typeof origWatch === 'function') {
      Chat.prototype.watch = function () {
        if (isEvalChat(this)) return Promise.resolve();
        return origWatch.apply(this, arguments);
      };
    }

    const origDrain = Chat.prototype.drain;
    if (typeof origDrain === 'function') {
      Chat.prototype.drain = function () {
        if (isEvalChat(this)) return Promise.resolve({ max: null, run: false });
        return origDrain.apply(this, arguments);
      };
    }

    const origServerMidTurn = Chat.prototype.serverMidTurn;
    if (typeof origServerMidTurn === 'function') {
      Chat.prototype.serverMidTurn = function () {
        if (isEvalChat(this)) return Promise.resolve(false);
        return origServerMidTurn.apply(this, arguments);
      };
    }

    const origQuickSync = Chat.prototype.quickSync;
    if (typeof origQuickSync === 'function') {
      Chat.prototype.quickSync = function () {
        if (isEvalChat(this)) {
          if (this.busy || this._evalStreaming || this.loading) return Promise.resolve(false);
          const hasFailedMsg = Array.isArray(this.messages) && this.messages.some(m => m && m.role === 'assistant' && (m.status === 'failed' || m.failed || !(m.parts || []).length));
          if (hasFailedMsg) {
            return loadChat(this, true).then(() => true, () => false);
          }
          return Promise.resolve(false);
        }
        return origQuickSync.apply(this, arguments);
      };
    }

    for (const fnName of ['reconcile', 'converge', 'tickConverge', 'remoteSync', 'scoreOld', 'identifyOld', 'loadAll', 'loadOlder']) {
      const origFn = Chat.prototype[fnName];
      if (typeof origFn === 'function') {
        Chat.prototype[fnName] = function () {
          if (isEvalChat(this)) return Promise.resolve(false);
          return origFn.apply(this, arguments);
        };
      }
    }

    const origWarm = Chat.prototype.warm;
    if (typeof origWarm === 'function') {
      Chat.prototype.warm = function () {
        if (isEvalChat(this)) return loadChat(this, false);
        return origWarm.apply(this, arguments);
      };
    }

    if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
      Bus.on('history', () => {
        try {
          if (typeof Chats === 'undefined' || !Chats.values) return;
          for (const c of Chats.values()) {
            if (!c || !isEvalChat(c)) continue;
            if (c.streaming && !c._evalStreaming) {
              c.gen = (c.gen || 0) + 1;
              try { c.ctl?.abort(); } catch {}
              c.streaming = false;
            }
            if (/^实时通道错误|无法获取会话令牌/.test(String(c.error || ''))) {
              c.error = null;
              c.emit();
            }
          }
        } catch {}
      });
    }

    if (typeof createChat === 'function' && !createChat._evalWrapped) {
      const origCreateChat = createChat;
      const wrappedCreateChat = async function (text, opt = {}) {
        const useEval = !opt?.gacha && !opt?.fingerprint && (
          opt?.evalMode === 'battle' ||
          opt?.evalMode === 'direct' ||
          ModeState.getMode() !== 'agent'
        );
        if (useEval) {
          return createEvalChat(text, opt);
        }
        return origCreateChat(text, opt);
      };
      wrappedCreateChat._evalWrapped = true;
      createChat = wrappedCreateChat;
      try { if (typeof window !== 'undefined') window.createChat = wrappedCreateChat; } catch {}
    }
  }

  return {
    initEvalFields,
    isEvalChat,
    extractUserText,
    extractContentText,
    buildAssistantParts,
    applyWebDevEdit,
    applyWebDevToolToState,
    reconstructWebDevFromMessage,
    fetchWebDevMetadata,
    streamWebDevMessageSSE,
    hydrateChatWebDev,
    parseEvalFlightFromHtml,
    fetchEvalSessionData,
    loadChat,
    resolveAutoModality,
    createEvalChat,
    sendFollowUp,
    streamTurn,
    retryEvalMessage,
    regenerateTurn,
    parseStream,
    submitVote,
    hookChatPrototype,
  };
})();

try {
  ModeState.init();
  EvalEngine.hookChatPrototype();
  if (typeof window !== 'undefined') {
    Object.assign(window, { ModeState, ModelCatalog, EvalEngine });
  }
} catch {}
