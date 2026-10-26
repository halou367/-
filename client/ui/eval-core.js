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
  DIRECT_MODALITIES: ['video', 'image', 'search', 'webdev', 'chat'],

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
    if (this.mode === 'direct' && this.modality === 'auto') {
      this.modality = 'chat';
    }
    this._ensureDirectModelValid();
    return this;
  },

  _ensureDirectModelValid() {
    try {
      if (typeof ModelCatalog === 'undefined') return;
      const mod = this.modality === 'auto' ? 'chat' : (this.modality || 'chat');
      const list = ModelCatalog.getModelsForModality(mod);
      if (!Array.isArray(list) || !list.length) return;
      const rawId = this.directModelId ? String(this.directModelId).trim() : '';
      const mappedId = (rawId && typeof ModelCatalog.resolveModelUuid === 'function')
        ? ModelCatalog.resolveModelUuid(rawId, mod)
        : rawId;
      const rawTail = rawId.includes('/') ? rawId.split('/').pop() : rawId;
      const found = rawId
        ? list.find(m => m.id === mappedId || m.id === rawId || m.slug === rawId || m.name === rawId || m.name === rawTail || (Array.isArray(m.aliases) && (m.aliases.includes(rawId) || m.aliases.includes(rawTail))))
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
    if (this.mode === 'direct' && this.modality === 'auto') {
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
    if (this.mode === 'direct' && this.modality === 'auto') {
      return 'chat';
    }
    return this.modality || 'chat';
  },

  setModality(nextModality, opts = {}) {
    if (!this._inited) this.init();
    let mod = String(nextModality || '').toLowerCase();
    if (!this.BATTLE_MODALITIES.includes(mod)) return this.snapshot();
    if (this.mode === 'direct' && mod === 'auto') {
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
    const sid = entry.id || entry.sid || '';
    const cObj = sid && typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (cObj?.isEvaluation && (cObj.evalMode === 'direct' || cObj.evalMode === 'battle')) return cObj.evalMode;
    const mi = sid && typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (mi?.directMode) return 'direct';
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
      if (!entry.mode && sid) {
        const cached = readLocalEvalCache(sid);
        if (cached && (cached.mode === 'direct' || (cached.modelAId && !cached.modelBId))) {
          entry.mode = 'direct';
          if (cached.modelAId && !entry.modelAId) entry.modelAId = cached.modelAId;
          return 'direct';
        }
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

let cachedWebDeploymentId = '';
try {
  if (typeof Store !== 'undefined' && Store.get) {
    const savedDpl = Store.get('eval:webDplId', '');
    if (savedDpl && /^dpl_[A-Za-z0-9]+$/.test(savedDpl) && savedDpl !== 'dpl_6nPiGVx1iAXDm3emfbFNUFD8Zy1E' && savedDpl !== 'dpl_8Gb6m6m38M8S2WQCSdYVhF5iPnfC') {
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
  const marker = 'self.__next_f.push([1,"';
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf(marker, pos);
    if (idx < 0) break;
    const qStart = idx + marker.length - 1;
    let p = qStart + 1;
    while (p < html.length) {
      const ch = html.charCodeAt(p);
      if (ch === 92) { p += 2; continue; }
      if (ch === 34) break;
      p++;
    }
    if (p < html.length && html.startsWith('])', p + 1)) {
      try { chunks.push(JSON.parse(html.slice(qStart, p + 1))); } catch {}
      pos = p + 3;
    } else {
      pos = idx + marker.length;
    }
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

  // Retired or legacy model IDs mapped to active Arena Direct-selectable UUIDs
  const RETIRED_MODEL_ID_MAP = {
    '019b7b1f-fa1d-7d5c-96f9-4731f5ca5a0f': '01a0843d-e019-78b5-be43-ec2291edc2cf', // gpt-image-1.5 -> gpt-image-2.5-sunburst
    '0197c947-98b0-7768-8696-c7a5f32d9c95': '019fbb94-0662-7830-808f-ee8dfe6098a2', // imagen-4.0-generate-preview -> gemini-3.1-flash-lite-image
    '0196a1fa-682f-769b-9067-7ff3472e21f7': '019fde11-e7c8-7394-ac43-8fd3b37ba81c', // flux-1.1-pro-ultra -> lo-bah-png
    '01995d54-9e77-7435-94d1-962091285872': '019f42b5-8c52-7793-9be8-de35eecf7ea9', // seedream-4.0 -> seedream-5.0-pro
    '019cbfae-9988-799f-833f-d9ef5fb8b92e': '019c7820-5480-78b6-9fef-04c0d7004054', // old gemini-3.1-pro-preview -> active gemini-3.1-pro-preview
    '019861f0-5a72-73bc-a3a5-fd84d8974239': '01a06df1-5f5b-7836-aa72-e17403ae8bb0', // veo-3 -> gemini-omni-1.1-flash
    '0199dc4a-1e80-764c-89c6-7227cd5fd44c': '01f39601-03ed-4d66-8afb-5039c90b27ea', // sora-2 -> sora-2-pro
    '0197e687-7707-7556-b7a9-247b148fa0a1': '019c59fa-6567-7c42-97af-f51b52ce47d5', // kling-2.1-master -> kling-v3.0-pro-text-to-video
  };
  const META_ROUTER_IDS = new Set([
    '019e71e9-e732-7891-b507-569cedd6fb71', // router
    '019b24bb-5caf-71c3-b854-37d0c7086f21', // Max
  ]);

  const FALLBACK_MODELS = [
    // Real Arena UUID-keyed Direct-selectable models (from Arena SSR initialModels)
    { id: '019ce973-84c9-7030-9f88-1ebbf2edeb14', slug: 'claude-opus-4-6', name: 'claude-opus-4-6', publicName: 'Claude Opus 4.6', displayName: 'Claude Opus 4.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev'], rank: 1, rankByModality: { chat: 4, webdev: 1 }, userSelectable: true },
    { id: '019cbd0a-d2e9-7540-9651-8fb7bc7bc483', slug: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', publicName: 'Claude Sonnet 4.6', displayName: 'Claude Sonnet 4.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev'], rank: 2, rankByModality: { chat: 18, webdev: 4 }, userSelectable: true },
    { id: '019f19f2-41f1-7c6d-9891-48d02fd9952c', slug: 'claude-sonnet-5-high', name: 'claude-sonnet-5-high', publicName: 'Claude Sonnet 5 High', displayName: 'Claude Sonnet 5 High', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev'], rank: 3, rankByModality: { chat: 58, webdev: 5 }, userSelectable: true },
    { id: '019d3995-9b7a-730d-b779-227ad61ecc9b', slug: 'gpt-5.4-high', name: 'gpt-5.4-high', publicName: 'GPT-5.4 High', displayName: 'GPT-5.4 High', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev'], rank: 4, rankByModality: { chat: 14, webdev: 7 }, userSelectable: true },
    { id: '019e71ea-1e1d-740f-9c2d-dab5869ff108', slug: 'gpt-5.5-instant', name: 'gpt-5.5-instant', publicName: 'GPT-5.5 Instant', displayName: 'GPT-5.5 Instant', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev'], rank: 5, rankByModality: { chat: 43, webdev: 8 }, userSelectable: true },
    { id: '01a0681c-b561-76b6-b338-a44ff0cff460', slug: 'gemini-3.8-flash-high', name: 'gemini-3.8-flash-high', publicName: 'Gemini 3.8 Flash High', displayName: 'Gemini 3.8 Flash High', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev'], rank: 6, rankByModality: { chat: 9, webdev: 3 }, userSelectable: true },
    { id: '019c7820-5480-78b6-9fef-04c0d7004054', slug: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview', publicName: 'Gemini 3.1 Pro Preview', displayName: 'Gemini 3.1 Pro Preview', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev'], rank: 7, rankByModality: { chat: 7, webdev: 9 }, userSelectable: true },
    { id: '019ff69c-dae8-708a-ae20-1ce80775d94d', slug: 'grok-4.6-high', name: 'grok-4.6-high', publicName: 'Grok 4.6 High', displayName: 'Grok 4.6 High', organization: 'xAI', provider: 'xai', modalities: ['chat', 'webdev'], rank: 8, rankByModality: { chat: 70, webdev: 15 }, userSelectable: true },
    { id: '019ebf6a-94d4-7649-b704-1dbbd5eb0942', slug: 'glm-5.1', name: 'glm-5.1', publicName: 'GLM 5.1', displayName: 'GLM 5.1', organization: 'Zhipu', provider: 'zhipu', modalities: ['chat', 'webdev'], rank: 9, rankByModality: { chat: 32, webdev: 2 }, userSelectable: true },
    { id: '019fc887-69e7-7308-a353-36da657fc18e', slug: 'paisley', name: 'paisley', publicName: 'Qwen 3.8 Max (Paisley)', displayName: 'Qwen 3.8 Max (Paisley)', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 10, rankByModality: { chat: 35, webdev: 12 }, userSelectable: true },
    { id: '01a14ae7-0d76-74af-80ac-33cf2b2322aa', slug: 'deepseek-v4.1-flash-max', name: 'deepseek-v4.1-flash-max', publicName: 'DeepSeek V4.1 Flash Max', displayName: 'DeepSeek V4.1 Flash Max', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 11, rankByModality: { chat: 38, webdev: 13 }, userSelectable: true },
    { id: '019e128d-bc7d-744c-8854-67a38b15b3a1', slug: 'qwen3.6-plus-preview', name: 'qwen3.6-plus-preview', publicName: 'Qwen 3.6 Plus Preview', displayName: 'Qwen 3.6 Plus Preview', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 12, rankByModality: { chat: 41, webdev: 14 }, userSelectable: true },
    { id: '019ca4eb-110d-7271-9040-811b08a19686', slug: 'kimi-k2.5-thinking', name: 'kimi-k2.5-thinking', publicName: 'Kimi K2.5 Thinking', displayName: 'Kimi K2.5 Thinking', organization: 'Moonshot', provider: 'moonshot', modalities: ['chat', 'webdev'], rank: 13, rankByModality: { chat: 44, webdev: 10 }, userSelectable: true },
    { id: '019b7b2f-fc57-7c65-b4ef-fd8db34f448e', slug: 'deepseek-v3.2', name: 'deepseek-v3.2', publicName: 'DeepSeek V3.2', displayName: 'DeepSeek V3.2', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 14, rankByModality: { chat: 77, webdev: 37 }, userSelectable: true },
    // Search-dedicated models
    { id: '019c6f55-70d6-7a9c-b89b-9a0db36a3582', slug: 'claude-sonnet-4-6-search', name: 'claude-sonnet-4-6-search', publicName: 'Claude Sonnet 4.6 Search', displayName: 'Claude Sonnet 4.6 Search', organization: 'Anthropic', provider: 'anthropic', modalities: ['search'], rank: 1, rankByModality: { search: 1 }, userSelectable: true },
    { id: '019ce975-df80-76b0-be1d-5abfc2744a62', slug: 'claude-opus-4-6-search', name: 'claude-opus-4-6-search', publicName: 'Claude Opus 4.6 Search', displayName: 'Claude Opus 4.6 Search', organization: 'Anthropic', provider: 'anthropic', modalities: ['search'], rank: 2, rankByModality: { search: 2 }, userSelectable: true },
    { id: '019f4e39-a888-7430-a6e7-ca2c33ec78f1', slug: 'grok-4.5-search', name: 'grok-4.5-search', publicName: 'Grok 4.5 Search', displayName: 'Grok 4.5 Search', organization: 'xAI', provider: 'xai', modalities: ['search'], rank: 3, rankByModality: { search: 4 }, userSelectable: true },
    { id: '019b1448-f74a-72de-b25d-8666618f8c5a', slug: 'gpt-5.2-search', name: 'gpt-5.2-search', publicName: 'GPT-5.2 Search', displayName: 'GPT-5.2 Search', organization: 'OpenAI', provider: 'openai', modalities: ['search'], rank: 4, rankByModality: { search: 7 }, userSelectable: true },
    { id: '019bda1f-3abc-783f-aac0-1ee102b247ba', slug: 'gemini-3-flash-grounding', name: 'gemini-3-flash-grounding', publicName: 'Gemini 3 Flash Grounding', displayName: 'Gemini 3 Flash Grounding', organization: 'Google', provider: 'google', modalities: ['search'], rank: 5, rankByModality: { search: 8 }, userSelectable: true },
    // Image models (active Arena Direct & Battle image models)
    { id: '01a0843d-e019-78b5-be43-ec2291edc2cf', slug: 'gpt-image-2.5-sunburst', name: 'gpt-image-2.5-sunburst', publicName: 'GPT Image 2.5 Sunburst', displayName: 'GPT Image 2.5 Sunburst', organization: 'OpenAI', provider: 'openai', modalities: ['image'], rank: 1, rankByModality: { image: 1 }, userSelectable: true },
    { id: '019fde11-e7c8-7394-ac43-8fd3b37ba81c', slug: 'lo-bah-png', name: 'lo-bah-png', publicName: 'Lo-Bah PNG', displayName: 'Lo-Bah PNG', organization: 'Black Forest Labs', provider: 'bfl', modalities: ['image'], rank: 2, rankByModality: { image: 2 }, userSelectable: true },
    { id: '019f42b5-8c52-7793-9be8-de35eecf7ea9', slug: 'seedream-5.0-pro', name: 'seedream-5.0-pro', publicName: 'Seedream 5.0 Pro', displayName: 'Seedream 5.0 Pro', organization: 'ByteDance', provider: 'bytedance', modalities: ['image'], rank: 3, rankByModality: { image: 3 }, userSelectable: true },
    { id: '019fbb94-0662-7830-808f-ee8dfe6098a2', slug: 'gemini-3.1-flash-lite-image', name: 'gemini-3.1-flash-lite-image', publicName: 'Gemini 3.1 Flash Lite Image', displayName: 'Gemini 3.1 Flash Lite Image', organization: 'Google', provider: 'google', modalities: ['image'], rank: 4, rankByModality: { image: 4 }, userSelectable: true },
    { id: '019c911e-a58d-775e-969f-00fb23ff34ab', slug: 'gemini-3.1-flash-image-preview', name: 'gemini-3.1-flash-image-preview', publicName: 'Gemini 3.1 Flash Image Preview', displayName: 'Gemini 3.1 Flash Image Preview', organization: 'Google', provider: 'google', modalities: ['image'], rank: 5, rankByModality: { image: 5 }, userSelectable: true },
    { id: '019c70f6-8f8b-7121-83c9-5a8b0f0a47ef', slug: 'recraft-v4-pro', name: 'recraft-v4-pro', publicName: 'Recraft V4 Pro', displayName: 'Recraft V4 Pro', organization: 'Recraft', provider: 'recraft', modalities: ['image'], rank: 6, rankByModality: { image: 6 }, userSelectable: true },
    { id: '019b3cd8-b107-7552-9146-93d9be7ac0f8', slug: 'flux-2-max', name: 'flux-2-max', publicName: 'FLUX.2 Max', displayName: 'FLUX.2 Max', organization: 'Black Forest Labs', provider: 'bfl', modalities: ['image'], rank: 7, rankByModality: { image: 7 }, userSelectable: true },
    { id: '019e72a4-f3b8-76fa-bf07-d472ce347cb6', slug: 'grok-imagine-image-pro', name: 'grok-imagine-image-pro', publicName: 'Grok Imagine Image Pro', displayName: 'Grok Imagine Image Pro', organization: 'xAI', provider: 'xai', modalities: ['image'], rank: 8, rankByModality: { image: 8 }, userSelectable: true },
    { id: '019d2614-149b-7b72-8941-bf0687556b49', slug: 'ideogram-v4', name: 'ideogram-v4', publicName: 'Ideogram V4', displayName: 'Ideogram V4', organization: 'Ideogram', provider: 'ideogram', modalities: ['image'], rank: 9, rankByModality: { image: 9 }, userSelectable: true },
    // Video models (active Arena Direct & Battle video models)
    { id: '01a06df1-5f5b-7836-aa72-e17403ae8bb0', slug: 'gemini-omni-1.1-flash', name: 'gemini-omni-1.1-flash', publicName: 'Gemini Omni 1.1 Flash', displayName: 'Gemini Omni 1.1 Flash', organization: 'Google', provider: 'google', modalities: ['video'], rank: 1, rankByModality: { video: 1 }, userSelectable: true },
    { id: '01f39601-03ed-4d66-8afb-5039c90b27ea', slug: 'sora-2-pro', name: 'sora-2-pro', publicName: 'Sora 2 Pro', displayName: 'Sora 2 Pro', organization: 'OpenAI', provider: 'openai', modalities: ['video'], rank: 2, rankByModality: { video: 3 }, userSelectable: true },
    { id: '019c59fa-6567-7c42-97af-f51b52ce47d5', slug: 'kling-v3.0-pro-text-to-video', name: 'kling-v3.0-pro-text-to-video', publicName: 'Kling V3.0 Pro', displayName: 'Kling V3.0 Pro', organization: 'Kuaishou', provider: 'kuaishou', modalities: ['video'], rank: 3, rankByModality: { video: 5 }, userSelectable: true },
    { id: '019cb141-6b8b-7142-bf80-7500ef98ca09', slug: 'veo-3.1-fast-audio', name: 'veo-3.1-fast-audio', publicName: 'Veo 3.1 Fast Audio', displayName: 'Veo 3.1 Fast Audio', organization: 'Google', provider: 'google', modalities: ['video'], rank: 4, rankByModality: { video: 6 }, userSelectable: true },
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
    { id: 'deepseek/deepseek-v4.1-flash-1017', name: 'deepseek-v4.1-flash', publicName: 'DeepSeek V4.1 Flash', displayName: 'DeepSeek V4.1 Flash', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev', 'search'], rank: 112, userSelectable: false },
    { id: 'alibaba/qwen3.8-max', name: 'qwen-3.8-max', publicName: 'Qwen 3.8 Max', displayName: 'Qwen 3.8 Max', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev', 'search'], rank: 113, userSelectable: false },
    { id: 'zhipu/glm-5.3', name: 'glm-5.3', publicName: 'GLM 5.3', displayName: 'GLM 5.3', organization: 'Zhipu', provider: 'zhipu', modalities: ['chat', 'webdev', 'search'], rank: 114, userSelectable: false },
    { id: 'moonshot/kimi-k3', name: 'kimi-k3', publicName: 'Kimi K3', displayName: 'Kimi K3', organization: 'Moonshot', provider: 'moonshot', modalities: ['chat', 'webdev', 'search'], rank: 115, userSelectable: false },
    { id: 'reflection/beam-1.0-501b-a23b', name: 'beam-1.0-501b-a23b', publicName: 'Beam 1.0 501B A23B', displayName: 'Beam 1.0 501B A23B', organization: 'Reflection AI', provider: 'reflection', modalities: ['chat', 'webdev', 'search'], rank: 116, userSelectable: false },
    { id: 'meta/muse-spark-1.3', name: 'muse-spark-1.3', publicName: 'Muse Spark 1.3', displayName: 'Muse Spark 1.3', organization: 'Meta', provider: 'meta', modalities: ['chat', 'webdev', 'search'], rank: 117, userSelectable: false },
    { id: 'deepseek-r1-0528', name: 'deepseek-r1-0528', publicName: 'DeepSeek R1 0528', displayName: 'DeepSeek R1 0528', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev', 'search'], rank: 125, userSelectable: false },
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
      const isMetaRouter = META_ROUTER_IDS.has(id) || /^(router|max)$/i.test(String(item.publicName || item.name || ''));
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
        userSelectable: !isMetaRouter && item.userSelectable !== false && item.isSelectable !== false && item.isDeprecated !== true && item.deprecated !== true && item.status !== 'archived' && item.status !== 'disabled',
      };
      if (isMetaRouter) existing.userSelectable = false;
      const outCap = item.capabilities?.outputCapabilities;
      if (outCap && typeof outCap === 'object') {
        const hasSearchCap = Boolean(outCap.search);
        const hasTextCap = Boolean(outCap.text);
        const hasWebCap = Boolean(outCap.web || outCap.code || outCap.webdev);
        const hasImgCap = Boolean(outCap.image);
        const hasVidCap = Boolean(outCap.video);
        if (hasSearchCap && !existing.modalities.includes('search')) existing.modalities.push('search');
        if (hasTextCap && !hasSearchCap && !existing.modalities.includes('chat')) existing.modalities.push('chat');
        if (hasWebCap && !hasSearchCap && !existing.modalities.includes('webdev')) existing.modalities.push('webdev');
        if (hasImgCap && !existing.modalities.includes('image')) existing.modalities.push('image');
        if (hasVidCap && !existing.modalities.includes('video')) existing.modalities.push('video');
      }
      if (item.rankByModality && typeof item.rankByModality === 'object') {
        Object.assign(existing.rankByModality, item.rankByModality);
        for (const [rk, rv] of Object.entries(item.rankByModality)) {
          if (rv == null || !Number.isFinite(Number(rv))) continue;
          const mapped = ARENA_TO_MODALITY[String(rk).toLowerCase()] || null;
          if (!mapped) continue;
          if (outCap && typeof outCap === 'object') {
            if (mapped === 'search' && !outCap.search) continue;
            if ((mapped === 'chat' || mapped === 'webdev') && outCap.search && !outCap.text) continue;
            if (mapped === 'image' && !outCap.image) continue;
            if (mapped === 'video' && !outCap.video) continue;
          }
          if (!existing.modalities.includes(mapped)) existing.modalities.push(mapped);
        }
      }
      if (Array.isArray(item.modalities) && (!outCap || existing.modalities.length === 0)) {
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
      if (!m || m.userSelectable === false || META_ROUTER_IDS.has(String(m.id || ''))) return false;
      if (RETIRED_MODEL_ID_MAP[String(m.id || '')]) return false;
      const outCap = m.capabilities?.outputCapabilities;
      if (outCap && typeof outCap === 'object') {
        if (mod === 'search') return Boolean(outCap.search);
        if (mod === 'image') return Boolean(outCap.image);
        if (mod === 'video') return Boolean(outCap.video);
        if (mod === 'webdev') return Boolean((outCap.web || outCap.code || outCap.webdev || outCap.text) && !outCap.search);
        if (mod === 'chat') return Boolean(outCap.text && !outCap.search);
      }
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
      const ra = a.rankByModality?.[mod] ?? (mod === 'webdev' ? a.rankByModality?.web : undefined) ?? a.rank ?? 999;
      const rb = b.rankByModality?.[mod] ?? (mod === 'webdev' ? b.rankByModality?.web : undefined) ?? b.rank ?? 999;
      return ra - rb;
    });
  }

  function getModelById(id) {
    if (!id) return null;
    const rawKey = String(id).trim();
    const key = RETIRED_MODEL_ID_MAP[rawKey] || rawKey;
    const tail = key.includes('/') ? key.split('/').pop() : key;
    return byIdMap.get(key) || byIdMap.get(key.toLowerCase()) || byIdMap.get(rawKey) || byIdMap.get(tail) || byIdMap.get(tail.toLowerCase()) || null;
  }

  function resolveModelUuid(id, modality = 'chat') {
    const raw = String(id || '').trim();
    const mapped = RETIRED_MODEL_ID_MAP[raw] || raw;
    const list = getModelsForModality(modality);
    if (UUID_RE.test(mapped) && !META_ROUTER_IDS.has(mapped)) {
      if (!list.length || list.some(m => m.id === mapped)) return mapped;
    }
    const hit = getModelById(mapped);
    if (hit && UUID_RE.test(String(hit.id || '')) && (!list.length || list.some(m => m.id === hit.id))) {
      return String(hit.id);
    }
    const fallback = list.find(m => UUID_RE.test(String(m?.id || '')));
    return fallback ? String(fallback.id) : (mapped || '019ce973-84c9-7030-9f88-1ebbf2edeb14');
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
    displayName: resolveModelName,
    get all() { return models; },
  };
})();

const EvalEngine = (() => {
  const VOTE_NEXT_ACTION = '6045a00021608b43c2ded349d9d98204449e22d4b0';
  const PREV_VOTE_NEXT_ACTION = '60c09be8dfaa9c507f73e0d2a17d7e887bbda2c815';
  const LEGACY_VOTE_NEXT_ACTION = '60353f7027df227e704beac966d87b6957fc086a39';
  const GENERATE_UPLOAD_URL_ACTION = '708854254c0bcc55fe812aa73f44ae7432d7f486c5';
  const GET_SIGNED_URL_ACTION = '600ab5aa2553a56ac3a9f5b60c24e9ca7512e14294';
  let cachedVoteActionId = VOTE_NEXT_ACTION;
  const _signedUrlCache = new Map();
  const _signedUrlInflight = new Map();
  try {
    if (typeof Store !== 'undefined' && Store.get) {
      const savedAct = Store.get('eval:voteActionId', '');
      if (savedAct && /^[0-9a-f]{40,44}$/i.test(savedAct) && savedAct !== PREV_VOTE_NEXT_ACTION && savedAct !== LEGACY_VOTE_NEXT_ACTION) {
        cachedVoteActionId = savedAct;
      }
    }
  } catch {}

  function extractR2StorageKey(urlOrKey) {
    if (!urlOrKey || typeof urlOrKey !== 'string') return '';
    const s = urlOrKey.trim();
    if (!s || s.startsWith('data:') || s.startsWith('blob:')) return '';
    if (!/^https?:\/\//i.test(s)) return s.replace(/^\/+/, '');
    try {
      const u = new URL(s);
      if (!/r2\.cloudflarestorage\.com$/i.test(u.hostname)) return '';
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs.length >= 2 && /^lmarena/i.test(segs[0])) {
        return decodeURIComponent(segs.slice(1).join('/'));
      }
      if (segs.length >= 1) {
        return decodeURIComponent(segs.join('/'));
      }
    } catch {}
    return '';
  }

  function isR2UrlExpired(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    if (!/r2\.cloudflarestorage\.com/i.test(urlStr)) return false;
    try {
      const u = new URL(urlStr);
      const amzDate = u.searchParams.get('X-Amz-Date');
      const amzExpires = Number(u.searchParams.get('X-Amz-Expires') || '0');
      if (!amzDate || !amzExpires) return false;
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
      if (!m) return false;
      const issuedMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
      const expiresMs = issuedMs + amzExpires * 1000;
      return Date.now() >= (expiresMs - 60000);
    } catch {
      return false;
    }
  }

  async function callNextServerAction(actionId, argsArray, pathUrl = '/text') {
    const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
    const headers = {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
    };
    if (cachedWebDeploymentId) {
      headers['x-deployment-id'] = cachedWebDeploymentId;
    }
    const res = await fetchFn(pathUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(argsArray),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const txt = await res.text();
    const lines = txt.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const tag = line.slice(0, idx).trim();
      const body = line.slice(idx + 1).trim();
      if (tag === '1' && body.startsWith('{')) {
        try { return JSON.parse(body); } catch {}
      }
    }
    for (const line of lines) {
      const idx = line.indexOf('{');
      if (idx >= 0) {
        try {
          const parsed = JSON.parse(line.slice(idx));
          if (parsed && typeof parsed === 'object' && ('success' in parsed || 'data' in parsed || 'url' in parsed)) {
            return parsed;
          }
        } catch {}
      }
    }
    return null;
  }

  async function refreshSignedAttachmentUrl(urlOrKey, opts = {}) {
    const fallbackKey = typeof opts === 'string' ? opts : (opts?.key || '');
    const sid = (opts && typeof opts === 'object') ? opts.sid : '';
    const key = extractR2StorageKey(urlOrKey) || extractR2StorageKey(fallbackKey);
    if (!key) return urlOrKey;
    const cached = _signedUrlCache.get(key);
    if (cached && !isR2UrlExpired(cached)) return cached;
    if (_signedUrlInflight.has(key)) return _signedUrlInflight.get(key);
    const task = (async () => {
      try {
        const resp = await callNextServerAction(GET_SIGNED_URL_ACTION, [key], sid ? `/c/${encodeURIComponent(sid)}` : '/text');
        const newUrl = resp?.data?.url || resp?.url || '';
        if (newUrl && /^https?:\/\//i.test(newUrl)) {
          _signedUrlCache.set(key, newUrl);
          return newUrl;
        }
      } catch {}
      return urlOrKey;
    })().finally(() => {
      _signedUrlInflight.delete(key);
    });
    _signedUrlInflight.set(key, task);
    return task;
  }

  async function uploadSingleEvaluationFile(fileItem) {
    if (!fileItem) return null;
    if (fileItem.url && /^https?:\/\//i.test(fileItem.url) && !fileItem.url.startsWith('blob:')) {
      return {
        name: fileItem.name || extractR2StorageKey(fileItem.url) || 'attachment',
        contentType: fileItem.contentType || fileItem.type || 'application/octet-stream',
        url: fileItem.url,
      };
    }
    const rawFile = fileItem.raw || fileItem.file || (typeof Blob !== 'undefined' && fileItem instanceof Blob ? fileItem : null);
    let blob = rawFile;
    let fileName = fileItem.name || rawFile?.name || `upload-${Date.now()}.png`;
    let mimeType = fileItem.type || fileItem.contentType || rawFile?.type || 'image/png';
    if (!blob && typeof fileItem.dataUrl === 'string' && fileItem.dataUrl.startsWith('data:')) {
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(fileItem.dataUrl);
      if (m) {
        mimeType = m[1] || mimeType;
        const bstr = atob(m[3]);
        const u8 = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
        blob = new Blob([u8], { type: mimeType });
      }
    }
    if (!blob) return null;
    const upResp = await callNextServerAction(GENERATE_UPLOAD_URL_ACTION, [fileName, mimeType]);
    const uploadUrl = upResp?.data?.uploadUrl || upResp?.uploadUrl || '';
    const key = upResp?.data?.key || upResp?.key || '';
    if (!uploadUrl || !key) throw new Error('获取评测附件上传地址失败');
    const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
    const putRes = await fetchFn(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
    if (!putRes.ok) throw new Error(`上传评测附件失败 (HTTP ${putRes.status})`);
    const signResp = await callNextServerAction(GET_SIGNED_URL_ACTION, [key]);
    const signedUrl = signResp?.data?.url || signResp?.url || '';
    if (!signedUrl) throw new Error('获取评测附件签名链接失败');
    _signedUrlCache.set(key, signedUrl);
    return {
      name: key,
      contentType: mimeType,
      url: signedUrl,
    };
  }

  async function uploadEvaluationAttachments(files) {
    if (!Array.isArray(files) || !files.length) return [];
    const results = await Promise.all(files.map(f => uploadSingleEvaluationFile(f).catch(() => null)));
    return results.filter(Boolean);
  }

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

  function parseStreamingToolArgs(rawText, existingArgs = {}) {
    const base = (existingArgs && typeof existingArgs === 'object') ? { ...existingArgs } : {};
    const s = String(rawText || '').trim();
    if (!s) return base;
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
    } catch {}
    const unesc = str => String(str || '')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    const pathM = s.match(/"(?:path|file_path|target_file)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
    if (pathM && !base.path) base.path = unesc(pathM[1]);
    const cmdM = s.match(/"(?:command|cmd)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/);
    if (cmdM && !base.command) base.command = unesc(cmdM[1]);
    const contentM = s.match(/"(?:content|text|replacement|new_text|new_str|patch|input)"\s*:\s*"([\s\S]*)$/);
    if (contentM) {
      let rawVal = contentM[1];
      rawVal = rawVal.replace(/"\s*\}?\s*$/, '');
      const val = unesc(rawVal);
      if (/"(?:patch|input)"/.test(contentM[0])) base.patch = val;
      else if (/"(?:replacement|new_text|new_str)"/.test(contentM[0])) base.replacement = val;
      else base.content = val;
    }
    return base;
  }

  function extractPatchFiles(patchStr) {
    const src = String(patchStr || '');
    if (!src) return [];
    const out = [];
    const rx = /\*\*\*\s+(?:Add|Update)\s+File:\s*([^\r\n]+)|\+\+\+\s+b\/([^\r\n]+)/g;
    let m;
    const matches = [];
    while ((m = rx.exec(src)) !== null) {
      const fPath = String(m[1] || m[2] || '').trim().replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
      if (fPath) matches.push({ path: fPath, idx: m.index + m[0].length });
    }
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const nextIdx = i + 1 < matches.length ? matches[i + 1].idx : src.length;
      const body = src.slice(cur.idx, nextIdx);
      const lines = body.split(/\r?\n/);
      const contentLines = [];
      let addN = 0, delN = 0;
      for (const ln of lines) {
        if (ln.startsWith('*** ') || ln.startsWith('@@') || ln.startsWith('--- ') || ln.startsWith('+++ ')) continue;
        if (ln.startsWith('+')) { addN++; contentLines.push(ln.slice(1)); }
        else if (ln.startsWith('-')) { delN++; }
        else if (ln.startsWith(' ')) { contentLines.push(ln.slice(1)); }
        else { contentLines.push(ln); }
      }
      out.push({ path: cur.path, content: contentLines.join('\n'), addN, delN });
    }
    return out;
  }

  function applyWebDevToolToState(webdev, toolName, args, result) {
    if (!webdev && !isWriteOrPatchToolName(toolName)) return null;
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
    const normP = String(inp.path || inp.file_path || inp.target_file || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
    if (tName === 'apply_patch' || tName === 'patch') {
      const pTxt = String(inp.patch ?? inp.input ?? inp.diff ?? inp.content ?? '');
      const pFiles = extractPatchFiles(pTxt);
      for (const pf of pFiles) {
        if (!pf.path) continue;
        const fType = inferWebDevContentType(pf.path);
        const idx = state.files.findIndex(f => f && f.path === pf.path);
        if (idx >= 0) {
          if (pf.content.trim()) state.files[idx] = { ...state.files[idx], path: pf.path, content: pf.content, contentType: fType };
        } else {
          state.files.push({ path: pf.path, content: pf.content, contentType: fType });
        }
      }
      return state;
    }
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
      || (Array.isArray(m.parts) && m.parts.some(p => p && isWriteOrPatchToolName(p.toolName || String(p.type || '').replace(/^tool-/, ''))));
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

  function buildAssistantParts(m, legacyAttachments = null, legacyReasoning = '', legacyToolCalls = null) {
    const parts = [];
    if (m && typeof m !== 'object') {
      m = {
        content: m,
        experimental_attachments: Array.isArray(legacyAttachments) ? legacyAttachments : [],
        reasoning: legacyReasoning || '',
        toolCalls: legacyToolCalls || null,
      };
    }
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
        if (!a || (!a.url && !a.name)) continue;
        const rawUrl = a.url || '';
        const ct = String(a.contentType || a.mimeType || '').toLowerCase();
        const isVideo = ct.startsWith('video/') || /\.(mp4|webm|mov)(\?|$)/i.test(rawUrl || a.name || '');
        const key = extractR2StorageKey(rawUrl) || extractR2StorageKey(a.name || '');
        const cachedSigned = key ? _signedUrlCache.get(key) : '';
        const effectiveUrl = (cachedSigned && !isR2UrlExpired(cachedSigned)) ? cachedSigned : rawUrl;
        const partType = isVideo ? 'video' : 'image';
        const existingPart = parts.find(p => p && p.type === partType && (p.url === effectiveUrl || p.url === rawUrl || (key && p.r2Key === key)));
        if (existingPart) {
          if (effectiveUrl) existingPart.url = effectiveUrl;
          if (key) existingPart.r2Key = key;
          continue;
        }
        const partObj = {
          type: partType,
          url: effectiveUrl,
          r2Key: key || '',
          contentType: a.contentType || a.mimeType || (isVideo ? 'video/mp4' : 'image/png'),
          name: a.name || key || '',
        };
        parts.push(partObj);
        if (key && (!effectiveUrl || isR2UrlExpired(effectiveUrl))) {
          void refreshSignedAttachmentUrl(rawUrl || key).then(freshUrl => {
            if (freshUrl && freshUrl !== partObj.url) {
              partObj.url = freshUrl;
              a.url = freshUrl;
              m.v = (m.v || 0) + 1;
              try {
                if (typeof Chats !== 'undefined' && Chats.values) {
                  for (const c of Chats.values()) {
                    if (c && Array.isArray(c.messages) && c.messages.includes(m)) c.emit?.();
                  }
                }
              } catch {}
            }
          });
        }
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
        const rawCachedMode = String(cachedEval.mode || '').toLowerCase();
        const mMode = (rawCachedMode === 'direct' || rawCachedMode === 'direct-battle' || rawCachedMode === 'side-by-side' || (cachedEval.modelAId && !cachedEval.modelBId && rawCachedMode !== 'battle')) ? 'direct' : 'battle';
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

  function rawEvalTextLen(m) {
    if (!m || typeof m !== 'object') return 0;
    let len = 0;
    if (typeof m.content === 'string') len += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const c of m.content) if (c && typeof c.text === 'string') len += c.text.length;
    }
    if (typeof m.text === 'string') len = Math.max(len, m.text.length);
    if (Array.isArray(m.parts)) {
      let pLen = 0;
      for (const p of m.parts) if (p && typeof p.text === 'string') pLen += p.text.length;
      len = Math.max(len, pLen);
    }
    return len;
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
      const primaryIds = new Set();
      const mergedList = primary.messages.map(pm => {
        if (pm?.id) primaryIds.add(pm.id);
        if (!pm || typeof pm !== 'object' || pm.role !== 'assistant') return pm;
        const sm = (pm.id && secById.get(pm.id))
          || (primary.messages.filter(x => x?.role === 'user').length <= 1 && (pm.participantPosition === 'a' || pm.participantPosition === 'b') ? secByPos.get(pm.participantPosition) : null);
        if (!sm) return pm;
        const pHas = hasRawEvalMsgContent(pm) && pm.status !== 'failed';
        const sHas = hasRawEvalMsgContent(sm) && sm.status !== 'failed';
        const pServerDone = pHas && pm.status !== 'pending' && pm.status !== 'streaming' && !pm.metadata?.pending;
        if (pServerDone && (sm.status === 'pending' || sm.status === 'streaming' || sm.metadata?.pending)) {
          return { ...sm, ...pm, id: pm.id || sm.id, _versionArchive: sm._versionArchive || pm._versionArchive };
        }
        if (!pHas && sHas) {
          return { ...pm, ...sm, id: pm.id || sm.id };
        }
        if (pHas && sHas && (rawEvalTextLen(sm) > rawEvalTextLen(pm) || ((pm.status === 'pending' || pm.status === 'streaming') && sm.status === 'success'))) {
          return { ...pm, ...sm, id: pm.id || sm.id };
        }
        return pm;
      });
      for (const sm of secondary.messages) {
        if (sm && sm.id && !primaryIds.has(sm.id)) {
          mergedList.push(sm);
        }
      }
      out.messages = mergedList;
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
      const fCtl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const fTm = fCtl ? setTimeout(() => { try { fCtl.abort(); } catch {} }, 12000) : 0;
      const res = await fetchFn('/c/' + encodeURIComponent(sid), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'text/html,application/xhtml+xml,application/json' },
        ...(fCtl ? { signal: fCtl.signal } : {}),
      }).finally(() => { if (fTm) clearTimeout(fTm); });
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
      const flightMsgs = Array.isArray(fromFlight.messages) ? fromFlight.messages : [];
      const flightIncomplete = !flightMsgs.length
        || (Array.isArray(lsCached?.messages) && lsCached.messages.length > flightMsgs.length)
        || flightMsgs.some(m => m && m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming' || !hasRawEvalMsgContent(m)));
      if (flightIncomplete) {
        try {
          const apiData = (typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) ? null : await api('/api/evaluation/' + encodeURIComponent(sid), { timeout: 12000, bg: true, noApiRetry: true });
          if (apiData && typeof apiData === 'object') {
            const apiEvalObj = apiData.evaluation || apiData.session || apiData.data || apiData;
            fromFlight = mergeEvalObjects(apiEvalObj, fromFlight);
          }
        } catch {}
      }
      const merged = mergeEvalObjects(fromFlight, lsCached);
      writeLocalEvalCache(sid, merged);
      return merged;
    }

    try {
      const data = (typeof ReadLimit !== 'undefined' && ReadLimit.active?.() && lsCached?.messages?.length) ? null : await api('/api/evaluation/' + encodeURIComponent(sid), { timeout: 20000, bg: Boolean(lsCached?.messages?.length), noApiRetry: true });
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

  function rebuildTurns(chat) {
    if (!chat) return [];
    const list = Array.isArray(chat.messages) ? chat.messages : [];
    const turns = [];
    let cur = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m._held) continue;
      if (m.role === 'user') {
        cur = { id: m.id || ('turn-' + (turns.length + 1)), user: m, msgA: null, msgB: null, a: null, b: null };
        turns.push(cur);
      } else if (m.role === 'assistant') {
        if (!cur) {
          cur = { id: m.id || ('turn-' + (turns.length + 1)), user: null, msgA: null, msgB: null, a: null, b: null };
          turns.push(cur);
        }
        const pos = String(m.participantPosition || '').toLowerCase();
        if (pos === 'b') { cur.msgB = m; cur.b = m; }
        else if (pos === 'a' || !cur.msgA) { cur.msgA = m; cur.a = m; }
        else if (!cur.msgB) { cur.msgB = m; cur.b = m; }
      }
    }
    chat.turns = turns;
    return turns;
  }

  function isWriteOrPatchToolName(name) {
    return /^(?:create_?file|write_?file|write|edit_?file|str_?replace|replace_?in_?file|edit|apply_?patch|patch|delete_?file|generate_?image)$/i.test(String(name || ''));
  }

  function orderTurnMessages(mapped) {
    if (!Array.isArray(mapped) || mapped.length <= 1) return mapped;
    const users = mapped.filter(m => m && m.role === 'user');
    const assts = mapped.filter(m => m && m.role === 'assistant');
    if (users.length > 0 && assts.length > 0) {
      const byParent = new Map();
      const userIds = new Set(users.map(u => u.id).filter(Boolean));
      const unassigned = [];
      for (const a of assts) {
        const pids = Array.isArray(a.parentMessageIds) ? a.parentMessageIds : [];
        const matchedUid = pids.find(pid => userIds.has(pid));
        if (matchedUid) {
          let list = byParent.get(matchedUid);
          if (!list) { list = []; byParent.set(matchedUid, list); }
          list.push(a);
        } else {
          unassigned.push(a);
        }
      }
      if (byParent.size > 0 || (mapped[0]?.role === 'assistant' && users.length > 0)) {
        const out = [];
        let uIdx = 0;
        for (const u of users) {
          out.push(u);
          const bucket = (byParent.get(u.id) || []).slice();
          if (!bucket.length && unassigned.length) {
            const takeCount = (uIdx === users.length - 1) ? unassigned.length : Math.min(2, unassigned.length);
            bucket.push(...unassigned.splice(0, takeCount));
          }
          bucket.sort((x, y) => (x.participantPosition === 'b' ? 1 : 0) - (y.participantPosition === 'b' ? 1 : 0));
          out.push(...bucket);
          uIdx++;
        }
        if (unassigned.length) {
          unassigned.sort((x, y) => (x.participantPosition === 'b' ? 1 : 0) - (y.participantPosition === 'b' ? 1 : 0));
          out.push(...unassigned);
        }
        return out;
      }
    }
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
    if (force && chat.loading) {
      try { chat._loadCtl?.abort(); } catch {}
      chat.loading = null;
    }
    if (chat.loading) return chat.loading;
    const wasConfirmedEval = Boolean(chat.isEvaluation || isEvalChat(chat));
    const prevEvalMode = chat.evalMode;
    if (wasConfirmedEval) initEvalFields(chat);
    if (!chat.messages?.length) {
      const localCached = readLocalEvalCache(chat.sid);
      if (localCached?.messages?.length) {
        initEvalFields(chat);
        if (localCached.evalMode) chat.evalMode = localCached.evalMode;
        if (localCached.modality) chat.modality = localCached.modality;
        if (localCached.title && (!chat.title || chat.title === '新对话')) chat.title = localCached.title;
        if (localCached.modelAId) chat.modelAId = localCached.modelAId;
        if (localCached.modelBId) chat.modelBId = localCached.modelBId;
        if (Array.isArray(localCached.revealedModels)) chat.revealedModels = localCached.revealedModels;
        if (Array.isArray(localCached.pairwiseFeedbacks)) chat.pairwiseFeedbacks = localCached.pairwiseFeedbacks;
        if (localCached.votedAt) chat.votedAt = localCached.votedAt;
        if (localCached.voteChoice) chat.voteChoice = localCached.voteChoice;
        const hydratedMsgs = orderTurnMessages(localCached.messages).map(m => {
          if (!m || typeof m !== 'object') return m;
          const cp = { ...m, v: (m.v || 0) + 1 };
          if (cp.role === 'assistant') {
            cp.parts = buildAssistantParts(cp);
          }
          return cp;
        });
        const tailAsst = [...hydratedMsgs].reverse().find(m => m && m.role === 'assistant');
        const tailMsg = hydratedMsgs.at(-1);
        const isTailInc = Boolean(
          (tailMsg && tailMsg.role === 'user') ||
          (tailAsst && (
            tailAsst.metadata?.pending ||
            tailAsst.status === 'pending' ||
            tailAsst.status === 'streaming' ||
            (typeof isIncompleteAssistantMsg === 'function' && isIncompleteAssistantMsg(tailAsst))
          ))
        );
        if (isTailInc && tailAsst) {
          tailAsst._incomplete = true;
        }
        if (isTailInc) {
          chat._recoveringIncomplete = true;
        }
        chat.messages = hydratedMsgs;
        rebuildTurns(chat);
        chat.cached = true;
        chat.emit();
      }
    }
    chat.loading = (async () => {
      try {
        const data = await fetchEvalSessionData(chat.sid);
        if (!data || typeof data !== 'object') throw new Error('评测对话数据为空');
        initEvalFields(chat);
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

        const nextEvalVer = (chat._evalVerSeq = (chat._evalVerSeq || 2) + 1);
        const rawMapped = [];
        for (const m of rawMsgs) {
          if (!m || typeof m !== 'object') continue;
          if (m.role === 'user') {
            const uTxt = extractUserText(m.content ?? m.text ?? m.parts);
            const uAtts = Array.isArray(m.experimental_attachments) ? m.experimental_attachments : [];
            const uObj = {
              id: m.id || genUuid(),
              role: 'user',
              text: uTxt,
              parts: [{ type: 'text', text: uTxt }],
              createdAt: m.createdAt || new Date().toISOString(),
              experimental_attachments: uAtts,
              metadata: m.metadata || {},
              v: nextEvalVer,
            };
            for (const att of uAtts) {
              if (!att || (!att.url && !att.name)) continue;
              const r2k = extractR2StorageKey(att.url || '') || extractR2StorageKey(att.name || '');
              if (r2k && (!att.url || isR2UrlExpired(att.url))) {
                void refreshSignedAttachmentUrl(att.url || r2k, { sid: chat.sid }).then(freshUrl => {
                  if (freshUrl && freshUrl !== att.url) {
                    att.url = freshUrl;
                    uObj.v = (uObj.v || 0) + 1;
                    chat.emit?.();
                  }
                });
              }
            }
            rawMapped.push(uObj);
          } else if (m.role === 'assistant') {
            const pos = m.participantPosition === 'b' ? 'b' : 'a';
            const mId = m.modelId || m.model || null;
            if (pos === 'a' && mId) detectedAId = mId;
            if (pos === 'b' && mId) detectedBId = mId;
            const rawSt = String(m.status || 'success').toLowerCase();
            const restoredFmt = m._fmt || m.metadata?._fmt || null;
            const builtParts = buildAssistantParts(m);
            const wdState = reconstructWebDevFromMessage({ ...m, parts: builtParts }, chat.modality);
            const hasPartErr = builtParts.some(p => p && p.type === 'error');
            const isAbortedWebDev = Boolean(
              chat.modality === 'webdev' &&
              rawSt !== 'pending' && rawSt !== 'streaming' &&
              (!wdState || (!wdState.previewUrl && !(wdState.files && wdState.files.length))) &&
              !builtParts.some(p => p && p.type === 'text' && /<html|<svg|<!doctype/i.test(String(p.text || ''))) &&
              builtParts.some(p => p && String(p.type || '').startsWith('tool-')) &&
              !builtParts.some(p => p && isWriteOrPatchToolName(p.toolName || String(p.type || '').replace(/^tool-/, '')))
            );
            const isFailedSt = rawSt === 'failed' || rawSt === 'error' || rawSt === 'cancelled' || rawSt === 'canceled'
              || Boolean(m.failureReason || m.error || m.errorMessage || wdState?.status === 'build-error' || hasPartErr || isAbortedWebDev);
            const st = isFailedSt ? 'failed' : rawSt;
            const failReason = m.failureReason || m.error || m.errorMessage || wdState?.message
              || (isAbortedWebDev ? '模型构建中断（未生成代码文件），请点击重试重新生成' : (isFailedSt ? '官方生成报错，请点击重试重新生成' : null));
            const msgObj = {
              id: m.id || genUuid(),
              role: 'assistant',
              participantPosition: pos,
              parentMessageIds: Array.isArray(m.parentMessageIds) ? m.parentMessageIds : [],
              modelId: mId,
              status: st,
              failed: isFailedSt,
              failureReason: failReason,
              createdAt: m.createdAt || new Date().toISOString(),
              parts: builtParts,
              experimental_attachments: Array.isArray(m.experimental_attachments) ? m.experimental_attachments : [],
              activeWorkflowRunId: m.activeWorkflowRunId || m.metadata?.workflowRunId || null,
              webdevTemplate: m.webdevTemplate || m.metadata?.webdevTemplate || null,
              ...(m.webdev ? { webdev: m.webdev } : {}),
              ...(restoredFmt ? { _fmt: restoredFmt } : {}),
              metadata: {
                ...(m.metadata || {}),
                pending: !isFailedSt && (st === 'pending' || st === 'streaming'),
              },
              v: nextEvalVer,
            };
            if (wdState) {
              if (isFailedSt && wdState.status === 'pending') wdState.status = 'build-error';
              msgObj.webdev = wdState;
            }
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

        if (Array.isArray(chat.messages) && chat.messages.length) {
          const prevById = new Map(chat.messages.filter(x => x?.id).map(x => [x.id, x]));
          for (let i = 0; i < mapped.length; i++) {
            const mm = mapped[i];
            const prev = mm?.id ? prevById.get(mm.id) : null;
            if (!prev || mm.role !== 'assistant') continue;
            const prevPartsLen = Array.isArray(prev.parts) ? prev.parts.length : 0;
            const newPartsLen = Array.isArray(mm.parts) ? mm.parts.length : 0;
            const prevTxtLen = Array.isArray(prev.parts) ? prev.parts.reduce((acc, p) => acc + (p?.text?.length || 0) + (p?.inputText?.length || 0), 0) : 0;
            const newTxtLen = Array.isArray(mm.parts) ? mm.parts.reduce((acc, p) => acc + (p?.text?.length || 0) + (p?.inputText?.length || 0), 0) : 0;
            if ((mm.status === 'pending' || mm.status === 'streaming' || prevPartsLen > newPartsLen || prevTxtLen > newTxtLen)) {
              if (prevPartsLen > newPartsLen || prevTxtLen > newTxtLen) mm.parts = prev.parts;
            }
            if (mm.status === 'failed' || mm.failed) {
              for (const pt of mm.parts || []) {
                if (pt && pt.state === 'streaming') pt.state = 'done';
              }
            }
            if (prev.webdev && ((Array.isArray(prev.webdev.files) && prev.webdev.files.length > (mm.webdev?.files?.length || 0)) || (prev.webdev.previewUrl && !mm.webdev?.previewUrl))) {
              mm.webdev = { ...prev.webdev };
              if (mm.status === 'failed' || mm.failed) mm.webdev.status = 'build-error';
            }
            if (prev.activeWorkflowRunId && !mm.activeWorkflowRunId) mm.activeWorkflowRunId = prev.activeWorkflowRunId;
            if (prev._fmt && !mm._fmt) mm._fmt = prev._fmt;
            if (prev.metadata?.timing && (!mm.metadata?.timing?.firstTokenAt && prev.metadata.timing.firstTokenAt)) {
              mm.metadata = mm.metadata || {};
              mm.metadata.timing = { ...prev.metadata.timing, ...(mm.metadata.timing || {}) };
            }
          }
        }
        const mappedIds = new Set(mapped.map(x => x?.id).filter(Boolean));
        const inFlightTail = Array.isArray(chat.messages)
          ? chat.messages.filter(m => m && !mappedIds.has(m.id) && (m._local || m.role === 'user' || (chat._evalStreaming && m.role === 'assistant' && m.metadata?.pending)))
          : [];
        chat.messages = inFlightTail.length ? orderTurnMessages([...mapped, ...inFlightTail]) : mapped;
        try { if (typeof SentUserLog !== 'undefined' && typeof SentUserLog.restoreInto === 'function') SentUserLog.restoreInto(chat); } catch {}
        rebuildTurns(chat);
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
        chat._recoveringIncomplete = false;
        chat._startupResuming = false;
        const lastTurn = Array.isArray(chat.turns) && chat.turns.length ? chat.turns[chat.turns.length - 1] : null;
        const turnAssts = [lastTurn?.msgA, lastTurn?.msgB, chat.messages.at(-1)].filter(m => m && m.role === 'assistant');
        const tailEvalMsg = chat.messages.at(-1);
        const tailUserRecent = Boolean(tailEvalMsg?.role === 'user' && !tailEvalMsg.failed && !chat._evalPollExhausted && ((Date.now() - (tailEvalMsg._sentAt || (typeof idTime === 'function' ? idTime(tailEvalMsg.id) : 0) || 0)) < 180000));
        const hasPendingEvalTail = Boolean(
          tailUserRecent ||
          turnAssts.some(m => {
            if (!m || m._userStopped || m.status === 'failed' || m.status === 'error') return false;
            const inc = Boolean(m.metadata?.pending || m.status === 'pending' || m.status === 'streaming');
            if (inc) {
              m._incomplete = true;
              m.metadata = { ...(m.metadata || {}), pending: true };
              m.status = 'streaming';
            } else {
              delete m._incomplete;
              if (m.metadata) m.metadata.pending = false;
            }
            return inc;
          })
        );
        if (hasPendingEvalTail) {
          chat.status = 'streaming';
          chat._evalStreaming = true;
          chat.phase = '正在继续接收回复…';
          if (chat.evalMode === 'direct') {
            chat.live = turnAssts.find(m => m._incomplete || m.metadata?.pending) || null;
          }
          void pollIncompleteEvalSession(chat);
        } else {
          chat._evalStreaming = false;
          if (chat.live) {
            delete chat.live._incomplete;
            if (chat.live.metadata) chat.live.metadata.pending = false;
            chat.live = null;
          }
          chat.status = 'idle';
          chat.phase = '';
          if (typeof SendQ !== 'undefined' && SendQ.of?.(chat)?.length) setTimeout(() => { try { SendQ.check(chat); } catch {} }, 50);
        }
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
        if (!wasConfirmedEval && !chat.loaded) {
          chat.isEvaluation = false;
          chat.evalMode = prevEvalMode || null;
        } else {
          chat.error = '加载评测对话失败：' + (e?.message || e);
          chat.emit();
        }
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
          const mergedFiles = Array.isArray(mf.files) && mf.files.length ? mf.files : (msg.webdev?.files || []);
          msg.webdev = {
            status: bStatus === 'success' ? 'success' : bStatus === 'no-artifact' ? 'no-artifact' : 'build-error',
            files: mergedFiles,
            binaryFiles: Array.isArray(mf.binaryFiles) ? mf.binaryFiles : (msg.webdev?.binaryFiles || []),
            previewUrl: pvUrl,
            templateKind: tplKind,
            message: mf.buildResult?.message || null,
            _fetchedMeta: true,
          };
          if (bStatus === 'build-error' || bStatus === 'error' || bStatus === 'failed') {
            msg.status = 'failed';
            msg.failed = true;
            msg.failureReason = mf.buildResult?.message || msg.failureReason || '构建预览失败，请点击重试重新生成';
            if (msg.metadata) msg.metadata.pending = false;
            delete msg._incomplete;
          } else if (bStatus === 'success') {
            if (msg.status === 'pending' || msg.status === 'streaming') msg.status = 'success';
            if (msg.metadata) msg.metadata.pending = false;
            delete msg._incomplete;
          } else if (bStatus === 'no-artifact' && !mergedFiles.length && !(chat.streaming && chat._evalStreaming)) {
            const hasInlineHtml = Array.isArray(msg.parts) && msg.parts.some(p => p && p.type === 'text' && /<html|<svg|<!doctype/i.test(String(p.text || '')));
            if (!hasInlineHtml) {
              msg.status = 'failed';
              msg.failed = true;
              msg.failureReason = mf.buildResult?.message || msg.failureReason || '官方构建未生成预览产物，请点击重试重新生成';
              if (msg.metadata) msg.metadata.pending = false;
              delete msg._incomplete;
            }
          }
        } else if (data.status === 'failed' || data.status === 'error' || data.status === 'build-error' || data.error) {
          msg.webdev = {
            ...(msg.webdev || {}),
            status: 'build-error',
            message: data.message || data.error || '构建失败',
            _fetchedMeta: true,
          };
          msg.status = 'failed';
          msg.failed = true;
          msg.failureReason = data.message || data.error || msg.failureReason || '官方构建报错，请点击重试重新生成';
          if (msg.metadata) msg.metadata.pending = false;
          delete msg._incomplete;
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
      targetMsg._hasWebDevInit = true;
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
    const msgId = targetMsg.id;
    const key = `${chat.sid || ''}:${msgId}`;
    if (_webdevStreamInFlight.has(key)) return _webdevStreamInFlight.get(key);
    const p = (async () => {
      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      const getLiveMsg = () => (Array.isArray(chat.messages) && chat.messages.find(x => x && x.id === msgId)) || targetMsg;
      let runId = targetMsg.activeWorkflowRunId || targetMsg.metadata?.workflowRunId || null;
      const pos = targetMsg.participantPosition || 'a';
      const ensureStreamPart = (m, type) => {
        if (!Array.isArray(m.parts)) m.parts = [];
        const hasTools = m.parts.some(x => x && String(x.type || '').startsWith('tool-'));
        if (!hasTools) {
          let found = m.parts.find(x => x && x.type === type);
          if (!found) {
            found = { type, text: '', state: 'streaming' };
            if (type === 'reasoning') m.parts.unshift(found);
            else m.parts.push(found);
          }
          return found;
        }
        const last = m.parts[m.parts.length - 1];
        if (last && last.type === type) return last;
        const created = { type, text: '', state: 'streaming' };
        m.parts.push(created);
        return created;
      };

      const handleEventPayload = (evData) => {
        if (!evData || typeof evData !== 'object') return false;
        const m = getLiveMsg();
        const tNow = Date.now();
        m.metadata = m.metadata || {};
        m.metadata.timing = m.metadata.timing || { startedAt: tNow };
        const evType = String(evData.type || '');
        const txtDelta = typeof evData.delta === 'string' ? evData.delta : (typeof evData.textDelta === 'string' ? evData.textDelta : (typeof evData.text === 'string' ? evData.text : null));
        if ((evType === 'text-delta' || evType === 'text') && txtDelta != null) {
          if (!m.metadata.timing.firstTokenAt) m.metadata.timing.firstTokenAt = tNow;
          const tp = ensureStreamPart(m, 'text');
          tp.text = (tp.text || '') + txtDelta;
          m.v = (m.v || 0) + 1;
        } else if ((evType === 'reasoning' || evType === 'reasoning-delta') && txtDelta != null) {
          if (!m.metadata.timing.firstTokenAt) m.metadata.timing.firstTokenAt = tNow;
          if (!m.metadata.timing.reasoningStartedAt) m.metadata.timing.reasoningStartedAt = tNow;
          const rp = ensureStreamPart(m, 'reasoning');
          rp.text = (rp.text || '') + txtDelta;
          m.v = (m.v || 0) + 1;
        } else if (evType === 'tool-call' || evType === 'tool-input-start' || evType === 'tool-input-available') {
          upsertToolCallPart(chat, m, evData);
        } else if (evType === 'tool-input-delta') {
          const tcId = String(evData.toolCallId || evData.id || '');
          const deltaStr = String(evData.inputTextDelta ?? evData.argsTextDelta ?? evData.delta ?? '');
          if (tcId && deltaStr) {
            if (!Array.isArray(m.parts)) m.parts = [];
            let tp = m.parts.find(x => x && x.toolCallId === tcId);
            if (!tp) {
              tp = { type: 'tool-' + (evData.toolName || 'tool'), toolCallId: tcId, toolName: evData.toolName || 'tool', input: {}, inputText: '', state: 'input-streaming' };
              m.parts.push(tp);
            }
            tp.inputText = (tp.inputText || '') + deltaStr;
            tp.state = 'input-streaming';
            tp.input = parseStreamingToolArgs(tp.inputText, tp.input);
            const tName = tp.toolName || String(tp.type || '').replace(/^tool-/, '');
            m.webdev = applyWebDevToolToState(m.webdev, tName, tp.input, null);
            m.v = (m.v || 0) + 1;
          }
        } else if (evType === 'tool-result' || evType === 'tool-output-available') {
          applyToolResultPart(chat, m, evData);
        } else if (evType === 'webdev' && evData.event) {
          applyWebDevChunkEvent(chat, m, evData.event);
          if (evData.event.type === 'preview-ready') return true;
        } else if (evType === 'finish' || evType === 'message-finish') {
          if (evData.finishReason === 'tool-calls') return false;
          m.status = 'success';
          if (m.metadata) m.metadata.pending = false;
          for (const pt of m.parts || []) {
            if (pt && pt.state === 'streaming') pt.state = 'done';
          }
          m.v = (m.v || 0) + 1;
          void fetchWebDevMetadata(chat, m, true);
          return true;
        } else if (evType === 'error') {
          m.status = 'failed';
          m.failureReason = evData.error || evData.message || 'WebDev build failed';
          if (m.metadata) m.metadata.pending = false;
          m.v = (m.v || 0) + 1;
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
        for (let attempt = 0; attempt < 4; attempt++) {
          if (signal?.aborted) break;
          const m = getLiveMsg();
          runId = runId || m.activeWorkflowRunId || m.metadata?.workflowRunId || null;
          const url = `/api/evaluation/webdev/${encodeURIComponent(msgId)}/trigger-stream${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`;
          const res = await fetchFn(url, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            credentials: 'same-origin',
            cache: 'no-store',
            signal,
          }).catch(() => null);
          if (!res || !res.ok || !res.body) {
            await fetchWebDevMetadata(chat, m, true).catch(() => null);
            if (m.webdev?.previewUrl || m.status === 'failed' || m.status === 'success') break;
            await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
            continue;
          }
          const hdrRunId = res.headers?.get?.('X-Webdev-Run-Id');
          if (hdrRunId) {
            runId = hdrRunId;
            m.activeWorkflowRunId = hdrRunId;
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
                if (!dataStr || dataStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(dataStr);
                  if (curEvent === 'batch' && Array.isArray(parsed.records)) {
                    for (const rec of parsed.records) {
                      if (!rec || !rec.body) continue;
                      const bodyObj = typeof rec.body === 'string' ? JSON.parse(rec.body) : rec.body;
                      const payloadObj = bodyObj?.data || bodyObj;
                      if (payloadObj && handleEventPayload(payloadObj)) {
                        finished = true;
                        break;
                      }
                    }
                  } else if (Array.isArray(parsed.records)) {
                    for (const rec of parsed.records) {
                      if (!rec || !rec.body) continue;
                      const bodyObj = typeof rec.body === 'string' ? JSON.parse(rec.body) : rec.body;
                      const payloadObj = bodyObj?.data || bodyObj;
                      if (payloadObj && handleEventPayload(payloadObj)) {
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
          await fetchWebDevMetadata(chat, getLiveMsg(), true).catch(() => null);
          if (finished || getLiveMsg().webdev?.previewUrl) break;
          await new Promise(r => setTimeout(r, 1000));
        }
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
    const isWebDevChat = chat.modality === 'webdev' || chat.evalModality === 'webdev' || chat.resolvedModality === 'webdev';
    const assts = chat.messages.filter(m => m && m.role === 'assistant' && m.id);
    await Promise.all(assts.map(async m => {
      const wfId = m.activeWorkflowRunId || m.metadata?.workflowRunId || null;
      const isPend = m.status === 'pending' || m.status === 'streaming' || m.metadata?.pending || m.webdev?.status === 'pending';
      if (isPend && (wfId || isWebDevChat || m.webdev)) {
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

      const appendMediaPartToMsg = (msg, mediaType, rawUrlOrData, mimeType, extra = {}) => {
        if (!msg || !rawUrlOrData) return false;
        const mime = mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/png');
        const rawStr = String(rawUrlOrData).trim();
        if (!rawStr) return false;
        const url = (/^https?:\/\/|^data:|^blob:/i.test(rawStr))
          ? rawStr
          : `data:${mime};base64,${rawStr}`;
        const key = extractR2StorageKey(url);
        if (!Array.isArray(msg.experimental_attachments)) msg.experimental_attachments = [];
        if (!msg.experimental_attachments.some(a => a && (a.url === url || (key && extractR2StorageKey(a.url) === key)))) {
          msg.experimental_attachments.push({
            url,
            contentType: mime,
            name: extra.name || key || (mediaType === 'video' ? 'generated-video.mp4' : 'generated-image.png'),
          });
        }
        if (!Array.isArray(msg.parts)) msg.parts = [];
        const existing = msg.parts.find(p => p && p.type === mediaType && (p.url === url || (key && p.r2Key === key)));
        if (existing) {
          existing.url = url;
          existing.contentType = mime;
          if (extra.thumbnailUrl) existing.thumbnailUrl = extra.thumbnailUrl;
        } else {
          msg.parts.push({
            type: mediaType,
            url,
            r2Key: key || '',
            contentType: mime,
            ...(extra.thumbnailUrl ? { thumbnailUrl: extra.thumbnailUrl } : {}),
            name: extra.name || key || '',
          });
        }
        msg.genPhase = mediaType === 'video' ? '✓ 视频生成完毕' : '✓ 图像生成完毕';
        chat.phase = msg.genPhase;
        if (key && isR2UrlExpired(url)) {
          void refreshSignedAttachmentUrl(url, { sid: chat.sid }).then(fresh => {
            if (fresh && fresh !== url) {
              for (const p of msg.parts || []) {
                if (p && (p.url === url || p.r2Key === key)) p.url = fresh;
              }
              for (const a of msg.experimental_attachments || []) {
                if (a && (a.url === url || extractR2StorageKey(a.url) === key)) a.url = fresh;
              }
              msg.v = (msg.v || 0) + 1;
              chat.emit?.();
            }
          });
        }
        return true;
      };

      let forceImmediateEmit = false;
      const curMod = chat.resolvedModality || chat.evalModality || chat.modality || 'chat';

      if (code === 'f') {
        targetMsg.status = 'streaming';
        if (!targetMsg.genPhase) {
          targetMsg.genPhase = curMod === 'image' ? '正在绘制图像…'
            : curMod === 'video' ? '正在渲染视频…'
            : curMod === 'search' ? '正在联网检索…'
            : curMod === 'webdev' ? '正在构建应用…'
            : '正在生成回复…';
          chat.phase = targetMsg.genPhase;
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
        forceImmediateEmit = true;
      } else if (code === '0') {
        const chunk = typeof val === 'string' ? val : String(val ?? '');
        if (!targetMsg.metadata.timing.firstTokenAt) targetMsg.metadata.timing.firstTokenAt = tNow;
        if (targetMsg.metadata.timing.reasoningStartedAt && !targetMsg.metadata.timing.reasoningCompletedAt) {
          targetMsg.metadata.timing.reasoningCompletedAt = tNow;
          targetMsg.metadata.timing.thinkingMs = tNow - targetMsg.metadata.timing.reasoningStartedAt;
        }
        targetMsg.status = 'streaming';
        targetMsg.genPhase = '正在输出回复…';
        chat.phase = chat.evalMode === 'battle' ? '双模型盲测生成中…' : '直连模型回复输出中…';
        targetMsg.content = (typeof targetMsg.content === 'string' ? targetMsg.content : '') + chunk;
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
        targetMsg.status = 'streaming';
        targetMsg.genPhase = curMod === 'image' ? '正在构思画面与绘制…' : '正在深度思考…';
        chat.phase = chat.evalMode === 'battle' ? '双模型深度思考中…' : targetMsg.genPhase;
        targetMsg.reasoning = (typeof targetMsg.reasoning === 'string' ? targetMsg.reasoning : '') + chunk;
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
      } else if (code === 'i') {
        if (!targetMsg.metadata.timing.firstTokenAt) targetMsg.metadata.timing.firstTokenAt = tNow;
        if (!targetMsg.metadata.timing.reasoningStartedAt) targetMsg.metadata.timing.reasoningStartedAt = tNow;
        targetMsg.status = 'streaming';
        targetMsg.genPhase = '正在深度思考…';
        const rp = ensurePart(targetMsg, 'reasoning');
        if (rp && !rp.text) rp.text = '';
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === 'j') {
        if (val && typeof val === 'object' && val.signature) {
          targetMsg.metadata.reasoningSignature = val.signature;
        }
      } else if (code === '9' && val && typeof val === 'object') {
        targetMsg.status = 'streaming';
        targetMsg.genPhase = `正在调用工具 ${val.toolName || ''}…`.trim();
        upsertToolCallPart(chat, targetMsg, val);
      } else if (code === 'a' && val && typeof val === 'object') {
        applyToolResultPart(chat, targetMsg, val);
      } else if (code === 'b' && val && typeof val === 'object') {
        targetMsg.status = 'streaming';
        if (val.toolCallId === 'citation-source') {
          targetMsg.genPhase = '正在联网检索引用来源…';
          chat.phase = targetMsg.genPhase;
        } else if (val.toolCallId && val.toolName) {
          targetMsg.genPhase = `正在执行 ${val.toolName}…`;
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
              if (!Array.isArray(targetMsg.sources)) targetMsg.sources = [];
              if (!targetMsg.sources.some(s => s && s.url === parsedSrc.url)) targetMsg.sources.push(parsedSrc);
              targetMsg.v = (targetMsg.v || 0) + 1;
            }
          } catch {}
        } else if (val.toolCallId && typeof val.argsTextDelta === 'string') {
          let tp = (targetMsg.parts || []).find(p => p && p.toolCallId === val.toolCallId);
          if (!tp) {
            tp = { type: 'tool-' + (val.toolName || 'tool'), toolCallId: val.toolCallId, toolName: val.toolName || 'tool', input: {}, inputText: '', state: 'input-streaming' };
            targetMsg.parts = targetMsg.parts || [];
            targetMsg.parts.push(tp);
          }
          tp.inputText = (tp.inputText || '') + val.argsTextDelta;
          tp.state = 'input-streaming';
          tp.input = parseStreamingToolArgs(tp.inputText, tp.input);
          const tName = tp.toolName || String(tp.type || '').replace(/^tool-/, '');
          targetMsg.webdev = applyWebDevToolToState(targetMsg.webdev, tName, tp.input, null);
          targetMsg.v = (targetMsg.v || 0) + 1;
          try { if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') HtmlPreview.syncEval(chat); } catch {}
        }
      } else if (code === 'h' && val && typeof val === 'object') {
        let sp = (targetMsg.parts || []).find(p => p && p.type === 'sources');
        if (!sp) {
          sp = { type: 'sources', sources: [] };
          targetMsg.parts.push(sp);
        }
        const src = val.source || val;
        if (src && src.url && !sp.sources.some(s => s && s.url === src.url)) sp.sources.push(src);
        if (!Array.isArray(targetMsg.sources)) targetMsg.sources = [];
        if (src && src.url && !targetMsg.sources.some(s => s && s.url === src.url)) targetMsg.sources.push(src);
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === '2' && Array.isArray(val)) {
        for (const item of val) {
          if (!item || typeof item !== 'object') continue;
          const imgPayload = item.data || item.image || item.url;
          if (item.type === 'image' && imgPayload) {
            if (appendMediaPartToMsg(targetMsg, 'image', imgPayload, item.mimeType || item.contentType || 'image/png', item)) {
              forceImmediateEmit = true;
            }
          } else if (item.type === 'video' && (item.url || item.data || item.video)) {
            if (appendMediaPartToMsg(targetMsg, 'video', item.url || item.data || item.video, item.mimeType || item.contentType || 'video/mp4', item)) {
              forceImmediateEmit = true;
            }
          } else if (item.type === 'sources' && Array.isArray(item.sources)) {
            targetMsg.parts.push({ type: 'sources', sources: item.sources });
          } else if (item.type === 'routed_model' && item.organization) {
            targetMsg.metadata.routedOrganization = item.organization;
            targetMsg.routedModel = { organization: item.organization, ...(item.model ? { model: item.model } : {}) };
          } else if (item.type === 'status' || item.type === 'progress' || item.type === 'heartbeat') {
            if (item.message || item.status) {
              targetMsg.genPhase = String(item.message || item.status);
              chat.phase = targetMsg.genPhase;
              forceImmediateEmit = true;
            }
          } else if (item.type === 'webdev' && item.event) {
            targetMsg.genPhase = item.event.type === 'preview-ready' ? '✓ 应用预览就绪' : '正在构建 WebDev 应用…';
            applyWebDevChunkEvent(chat, targetMsg, item.event);
            if (item.event.type === 'init') {
              void streamWebDevMessageSSE(chat, targetMsg, chat.ctl?.signal).catch(() => false);
            } else if (item.event.type === 'preview-ready') {
              finishedSlots.add(pos);
              forceImmediateEmit = true;
            }
          }
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === 'k' && val && typeof val === 'object') {
        const mime = val.mimeType || val.contentType || 'image/png';
        const rawPayload = val.url || val.data || val.image || null;
        if (rawPayload) {
          const isVideo = String(mime).startsWith('video/');
          if (appendMediaPartToMsg(targetMsg, isVideo ? 'video' : 'image', rawPayload, mime, val)) {
            forceImmediateEmit = true;
          }
          targetMsg.v = (targetMsg.v || 0) + 1;
        }
      } else if (code === 'e' || code === 'd') {
        const isErrFinish = Boolean(val && typeof val === 'object' && (val.finishReason === 'error' || val.finishReason === 'failed' || val.error));
        const isToolStepEnd = Boolean(!isErrFinish && val && typeof val === 'object' && val.finishReason === 'tool-calls');
        const hasActiveWf = Boolean(targetMsg._hasWebDevInit || targetMsg.activeWorkflowRunId || targetMsg.metadata?.workflowRunId || (targetMsg.webdev?.files?.length > 0 && targetMsg.webdev?.status === 'pending' && !targetMsg.webdev?.previewUrl));
        if (isErrFinish) {
          finishedSlots.add(pos);
          targetMsg.metadata.pending = false;
          delete targetMsg._incomplete;
          targetMsg.status = 'failed';
          targetMsg.failed = true;
          targetMsg.genPhase = '生成失败';
          targetMsg.failureReason = targetMsg.failureReason || val.message || val.error || '官方模型生成报错，请点击重试重新生成';
          if (targetMsg.webdev) {
            targetMsg.webdev.status = 'build-error';
            targetMsg.webdev.message = targetMsg.failureReason;
          }
        } else if (!isToolStepEnd) {
          if (code === 'd' && !hasActiveWf) {
            finishedSlots.add(pos);
            targetMsg.metadata.pending = false;
            targetMsg.genPhase = '✓ 生成完毕';
          }
          if (targetMsg.status !== 'failed' && !hasActiveWf) {
            targetMsg.status = 'success';
          }
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
        forceImmediateEmit = true;
      } else if (code === '3') {
        finishedSlots.add(pos);
        targetMsg.metadata.pending = false;
        targetMsg.status = 'failed';
        targetMsg.genPhase = '生成失败';
        targetMsg.failureReason = typeof val === 'string' ? val : (val?.message || val?.error || '生成失败');
        targetMsg.v = (targetMsg.v || 0) + 1;
        forceImmediateEmit = true;
      }

      chat.lastActivity = tNow;
      chat.byteAt = tNow;
      chat.progAt = tNow;
      chat.respAt = chat.respAt || tNow;
      if (forceImmediateEmit) {
        chat.emit?.();
      } else {
        chat.emitStreamSoon?.(24);
      }
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

    const isMediaTurn = ['image', 'video'].includes(chat?.modality) || ['image', 'video'].includes(chat?.evalModality) || ['image', 'video'].includes(chat?.resolvedModality);
    if (isMediaTurn && chat?.sid && !chat.ctl?.signal?.aborted) {
      const needsMediaSync = [msgA, msgB].some(m => m && m.status !== 'failed' && !(m.parts || []).some(p => p && (p.type === 'image' || p.type === 'video')));
      if (needsMediaSync) {
        try {
          chat.phase = '正在加载生成的媒体文件…';
          chat.emit?.();
          const freshData = await fetchEvalSessionData(chat.sid).catch(() => null);
          const freshMsgs = extractMessagesFromData(freshData);
          if (Array.isArray(freshMsgs) && freshMsgs.length) {
            for (const m of [msgA, msgB]) {
              if (!m) continue;
              const srvM = freshMsgs.find(x => x && (x.id === m.id || (x.role === 'assistant' && (x.participantPosition || 'a') === (m.participantPosition || 'a'))));
              if (srvM) {
                if (Array.isArray(srvM.experimental_attachments) && srvM.experimental_attachments.length) {
                  m.experimental_attachments = srvM.experimental_attachments;
                }
                const rebuilt = buildAssistantParts({ ...m, ...srvM, parts: m.parts });
                if (rebuilt.length) m.parts = rebuilt;
                m.genPhase = '✓ 生成完毕';
                m.v = (m.v || 0) + 1;
              }
            }
          }
        } catch {}
      }
    }

    const endNow = Date.now();
    for (const [posKey, m] of [['a', msgA], ['b', msgB]]) {
      if (!m) continue;
      const slotFinished = finishedSlots.has(posKey);
      const hasAnyOut = Boolean(String(m.content || '').trim() || String(m.reasoning || '').trim() || (Array.isArray(m.parts) && m.parts.length > 0) || (Array.isArray(m.experimental_attachments) && m.experimental_attachments.length > 0));
      const slotIncomplete = !slotFinished && !chat.ctl?.signal?.aborted && !hasAnyOut;
      if (slotIncomplete) {
        m._incomplete = true;
      } else {
        delete m._incomplete;
      }
      if (m.metadata) {
        m.metadata.pending = Boolean(slotIncomplete);
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
      if (!m.status || m.status === 'pending' || m.status === 'streaming') m.status = m._incomplete ? 'streaming' : 'success';
      for (const p of m.parts || []) {
        if (p && p.state === 'streaming') p.state = 'done';
      }
      if (isWebDevTurn) {
        const wd = reconstructWebDevFromMessage(m, 'webdev');
        if (wd) m.webdev = wd;
        await fetchWebDevMetadata(chat, m, true).catch(() => null);
        const hasFiles = Boolean(m.webdev?.files?.length > 0 || m.webdev?.previewUrl);
        const hasHtmlText = Array.isArray(m.parts) && m.parts.some(p => p && p.type === 'text' && /<html|<svg|<!doctype/i.test(String(p.text || '')));
        if (!hasFiles && !hasHtmlText && m.status !== 'failed') {
          m.status = 'failed';
          m.failed = true;
          m.failureReason = m.webdev?.message || m.failureReason || '模型构建中断（未生成预览文件），请点击重试重新生成';
          if (m.metadata) m.metadata.pending = false;
          delete m._incomplete;
          if (m.webdev) m.webdev.status = 'build-error';
        }
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
    if (Array.isArray(opts.files) && opts.files.length) {
      chat.phase = '正在上传评测附件…';
      chat.emit();
      try {
        attachments = await uploadEvaluationAttachments(opts.files);
      } catch {}
      if (!attachments.length && typeof Uploads !== 'undefined') {
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
    }

    const userMsg = opts.userMsg || chat.messages.findLast(m => m && m.role === 'user');
    const userMessageId = userMsg?.id || genUuid();
    if (userMsg && attachments.length) {
      userMsg.experimental_attachments = attachments;
      userMsg.v = (userMsg.v || 0) + 1;
    }

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

    if (userMsg && !chat.messages.includes(userMsg)) {
      chat.messages.push(userMsg);
    }
    const uIdx = userMsg ? chat.messages.indexOf(userMsg) : -1;
    if (uIdx >= 0 && uIdx < chat.messages.length - 1) {
      let insAt = uIdx + 1;
      while (insAt < chat.messages.length && chat.messages[insAt]?.role === 'assistant') insAt++;
      chat.messages.splice(insAt, 0, ...(msgB ? [msgA, msgB] : [msgA]));
    } else {
      chat.messages.push(msgA);
      if (msgB) chat.messages.push(msgB);
    }
    if (isBattle && chat.voteState) {
      chat.voteState.voted = false;
      chat.voteState.submitting = false;
      chat.voteState.value = null;
    }

    const startNow = Date.now();
    chat._evalPollExhausted = false;
    chat.status = 'streaming';
    chat.streaming = true;
    chat._evalStreaming = true;
    if (!isBattle) chat.live = msgA;
    chat.connAt = startNow;
    chat.streamOpenAt = startNow;
    chat.byteAt = startNow;
    chat.progAt = startNow;
    const modPhaseLabel = effectiveModality === 'image' ? '正在绘制图像…'
      : effectiveModality === 'video' ? '正在渲染视频…'
      : effectiveModality === 'search' ? '正在联网检索与生成…'
      : effectiveModality === 'webdev' ? '正在构建 WebDev 应用…'
      : (isBattle ? '双模型盲测生成中…' : '直连模型生成中…');
    chat.phase = modPhaseLabel;
    msgA.genPhase = modPhaseLabel;
    if (msgB) msgB.genPhase = modPhaseLabel;
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
        const v3IpBefore = (typeof IP !== 'undefined' && IP.ip) || '';
        const [tok, prePure] = await Promise.all([
          (Recaptcha.take ? Recaptcha.take(rcAction) : Recaptcha.v3(rcAction)).catch(() => null),
          prePureTask,
        ]);
        if (prePure?.switched || (v3IpBefore && typeof IP !== 'undefined' && IP.ip && IP.ip !== v3IpBefore)) {
          try { Recaptcha.clearCache?.(); } catch {}
          v3Token = await Recaptcha.v3(rcAction).catch(() => tok);
        } else {
          v3Token = tok;
        }
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

      const wireMode = isBattle ? 'battle' : 'direct-battle';
      const payload = {
        id: chat.sid,
        mode: wireMode,
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
      if ((res.status === 403 || res.status === 429) && !v2Token && typeof Recaptcha !== 'undefined') {
        let errBody = await res.clone().text().catch(() => '');
        const isRcOrLimit = res.status === 429 || /recaptcha|verification required|人机|验证失败|challenge|prompt failed/i.test(errBody);
        if (res.status === 429 && !/recaptcha|verification required|人机|验证失败|challenge|prompt failed/i.test(errBody)) {
          try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
          try { if (typeof Recaptcha !== 'undefined' && Recaptcha.clearCache) Recaptcha.clearCache(); } catch {}
          const freshInPlaceV3 = typeof Recaptcha.v3 === 'function' ? await Recaptcha.v3(rcAction).catch(() => null) : null;
          if (freshInPlaceV3) {
            v3Token = freshInPlaceV3;
            payload.recaptchaV3Token = freshInPlaceV3;
          }
          await new Promise(r => setTimeout(r, 1800));
          res = await fetchFn(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: '*/*' },
            body: JSON.stringify(payload),
            credentials: 'same-origin',
            cache: 'no-store',
            signal: ctl.signal,
          });
          errBody = !res.ok ? await res.clone().text().catch(() => '') : '';
        }
        if (!res.ok && isRcOrLimit && typeof IPRep !== 'undefined' && typeof IPRep.rotateOnVerificationOrLimit === 'function') {
          chat.phase = res.status === 429
            ? '当前出口触发 429 限流，正在自动切换备用出口重发…'
            : '当前出口触发人机拦截，正在自动切换纯净出口重发…';
          chat.emit();
          const rot = await IPRep.rotateOnVerificationOrLimit(res.status === 429 ? '429' : 'rc', { action: rcAction }).catch(() => { try { if (res.status !== 429) IPRep.note('rc'); } catch {} return null; });
          const freshV3 = rot?.token || (typeof Recaptcha.v3 === 'function' ? await Recaptcha.v3(rcAction).catch(() => null) : null);
          if (rot?.switched || (freshV3 && freshV3 !== v3Token)) {
            if (freshV3) {
              v3Token = freshV3;
              payload.recaptchaV3Token = freshV3;
            }
            chat.phase = '已切换备用出口，正在自动重发…';
            chat.emit();
            res = await fetchFn(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: '*/*' },
              body: JSON.stringify(payload),
              credentials: 'same-origin',
              cache: 'no-store',
              signal: ctl.signal,
            });
            errBody = !res.ok ? await res.clone().text().catch(() => '') : '';
          }
        }
        if ((res.status === 403 || res.status === 429) && typeof Recaptcha.v2 === 'function' && /recaptcha|verification required|人机|验证失败|challenge|prompt failed/i.test(errBody)) {
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

      if (!res.ok && !ctl.signal.aborted) {
        let retryBody = await res.clone().text().catch(() => '');
        const isChallenge = /recaptcha|verification required|人机|验证失败|challenge|prompt failed/i.test(retryBody);
        if (!isChallenge && (res.status === 429 || (res.status >= 500 && res.status <= 524) || res.status === 408)) {
          for (let bgTry = 1; bgTry <= 3 && !res.ok && !ctl.signal.aborted; bgTry++) {
            chat.status = 'streaming';
            chat.phase = res.status === 429 ? '服务器繁忙，正在后台排队等待响应…' : '正在等待模型响应…';
            chat.emit();
            await new Promise(r => setTimeout(r, 2500 * bgTry));
            if (ctl.signal.aborted) break;
            try { if (typeof Recaptcha !== 'undefined' && Recaptcha.clearCache) Recaptcha.clearCache(); } catch {}
            const retryV3 = (!usedV2 && typeof Recaptcha !== 'undefined' && typeof Recaptcha.v3 === 'function')
              ? await Recaptcha.v3('chat_submit').catch(() => v3Token)
              : null;
            if (retryV3) {
              v3Token = retryV3;
              payload.recaptchaV3Token = retryV3;
            }
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

      const anyIncAfterStream = [msgA, msgB].some(m => m && (m._incomplete || m.metadata?.pending));
      if (anyIncAfterStream && !ctl.signal.aborted) {
        chat.status = 'streaming';
        chat.phase = '正在后台同步剩余回复内容…';
        chat.error = null;
        if (chat.evalMode === 'direct' && msgA) chat.live = msgA;
        chat.emit();
        void pollIncompleteEvalSession(chat);
        return;
      }
      if (chat.live) chat.live = null;
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
        const errMsg = String(e?.message || e || '');
        const isTransientOrSlow = /429|rate limit|timeout|超时|network|failed to fetch|fetch failed|502|503|504|520|522|524|socket|reset|closed|eof/i.test(errMsg);
        if (isTransientOrSlow && chat.sid) {
          chat.status = 'streaming';
          chat.phase = '服务器响应较慢，正在后台同步最新状态…';
          chat.error = null;
          for (const m of [msgA, msgB]) {
            if (!m) continue;
            m._incomplete = true;
            m.status = 'streaming';
            if (m.metadata) m.metadata.pending = true;
          }
          if (chat.evalMode === 'direct' && msgA) chat.live = msgA;
          chat.emit();
          void pollIncompleteEvalSession(chat, { fallbackError: errMsg, msgA, msgB });
          return;
        }
        if (chat.live) chat.live = null;
        chat.status = 'idle';
        chat.streaming = false;
        chat._evalStreaming = false;
        chat.error = '生成失败：' + errMsg;
        msgA.status = 'failed';
        msgA.failureReason = errMsg;
        if (msgB) {
          msgB.status = 'failed';
          msgB.failureReason = errMsg;
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
      if (!chat._evalPollingInc && typeof SendQ !== 'undefined' && SendQ.of?.(chat)?.length) {
        setTimeout(() => { try { SendQ.check(chat); } catch {} }, 50);
      }
    }
  }

  function extractMessagesFromData(data) {
    if (!data || typeof data !== 'object') return [];
    const evalObj = data.evaluation || data.session || data.data || data;
    if (Array.isArray(evalObj?.messages)) return evalObj.messages;
    if (Array.isArray(data.messages)) return data.messages;
    return [];
  }

  async function pollIncompleteEvalSession(chat, opts = {}) {
    if (!chat?.sid || chat._evalPollingInc) return;
    chat._evalPollingInc = true;
    try {
      for (let step = 1; step <= 18; step++) {
        await new Promise(r => setTimeout(r, Math.min(5000, 2000 + step * 300)));
        if (!chat || chat.ctl?.signal?.aborted) break;
        const data = await fetchEvalSessionData(chat.sid).catch(() => null);
        if (!data || typeof data !== 'object') continue;
        const rawMessages = extractMessagesFromData(data);
        if (Array.isArray(rawMessages) && rawMessages.length) {
          await loadChat(chat, true);
          if (chat.status === 'idle') return;
        }
      }
      // 轮询结束：若仍未拿到任何有效回复且存在 fallbackError，则回退展示错误；若已有部分或完整正文则正常收敛结束
      for (const m of chat.messages || []) {
        if (m && m.role === 'assistant') {
          delete m._incomplete;
          if (m.metadata) m.metadata.pending = false;
          if (m.status === 'streaming' || m.status === 'pending') m.status = 'success';
        }
      }
      if (chat.live) chat.live = null;
      const tailA = opts.msgA || [...(chat.messages || [])].reverse().find(m => m && m.role === 'assistant');
      const hasAnyContent = Boolean(tailA && (String(tailA.content || '').trim() || (Array.isArray(tailA.parts) && tailA.parts.some(p => p && (p.text || p.toolCallId || p.type === 'image' || p.type === 'video'))) || (Array.isArray(tailA.experimental_attachments) && tailA.experimental_attachments.length > 0)));
      chat._evalPollExhausted = true;
      chat._evalStreaming = false;
      chat._startupResuming = false;
      chat._recoveringIncomplete = false;
      chat.status = 'idle';
      chat.phase = '';
      if (typeof SendQ !== 'undefined' && SendQ.of?.(chat)?.length) setTimeout(() => { try { SendQ.check(chat); } catch {} }, 50);
      if (!hasAnyContent && opts.fallbackError) {
        chat.error = '生成失败：' + opts.fallbackError;
        if (opts.msgA) { opts.msgA.status = 'failed'; opts.msgA.failureReason = opts.fallbackError; }
        if (opts.msgB) { opts.msgB.status = 'failed'; opts.msgB.failureReason = opts.fallbackError; }
      }
      chat.emit();
    } finally {
      chat._evalPollingInc = false;
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
        mode: evalMode === 'direct' ? 'direct-battle' : evalMode,
        modality,
        title: chat.title || (evalMode === 'battle' ? 'Battle 盲测对话' : (chat.directModelName || 'Direct 直连对话')),
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
    if (!chat.loaded && chat.loading) {
      try { await Promise.race([chat.loading.catch(() => {}), new Promise(r => setTimeout(r, 6000))]); } catch {}
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
    const prevEvalAsst = [...(chat.messages || [])].reverse().find(m => m && m.role === 'assistant' && m.id);
    if (prevEvalAsst?.id) userMsg._prevAsstId = prevEvalAsst.id;
    chat.messages.push(userMsg);
    chat.sentAt = Date.now();
    try { if (typeof SentUserLog !== 'undefined' && typeof SentUserLog.record === 'function') SentUserLog.record(chat.sid, userMsg, prevEvalAsst?.id || null); } catch {}
    try { syncChatToLocalEvalCache(chat); } catch {}
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

  async function submitVote(sid, voteValue = 'tie', opts = {}) {
    const chat = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (!chat) throw new Error('未找到当前对战会话');
    initEvalFields(chat);
    if (chat.voteState?.submitting) return chat.voteState;

    const allMsgs = Array.isArray(chat.messages) ? chat.messages : [];
    const assts = allMsgs.filter(m => m && m.role === 'assistant');
    let lastUserIdx = -1;
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      if (allMsgs[i]?.role === 'user') { lastUserIdx = i; break; }
    }
    const turnSlice = lastUserIdx >= 0 ? allMsgs.slice(lastUserIdx + 1).filter(m => m && m.role === 'assistant') : assts;
    let msgA = opts?.messageAId ? assts.find(m => m.id === opts.messageAId) : null;
    let msgB = opts?.messageBId ? assts.find(m => m.id === opts.messageBId) : null;
    if (!msgA && !opts?.messageAId) {
      msgA = [...turnSlice].reverse().find(m => m.participantPosition === 'a') || (turnSlice.length === 2 && !turnSlice[0].participantPosition ? turnSlice[0] : null);
    }
    if (!msgB && !opts?.messageBId) {
      msgB = [...turnSlice].reverse().find(m => m.participantPosition === 'b' && m !== msgA) || (turnSlice.length === 2 && !turnSlice[1].participantPosition && turnSlice[1] !== msgA ? turnSlice[1] : null);
    }
    if (!msgA || !msgB || msgA === msgB) throw new Error('当前轮次尚未生成完整的 A/B 双侧回复');
    if (msgA.status === 'streaming' || msgB.status === 'streaming' || msgA.status === 'pending' || msgB.status === 'pending' || msgA.status === 'failed' || msgB.status === 'failed' || msgA.failed || msgB.failed || msgA._incomplete || msgB._incomplete || msgA.metadata?.pending || msgB.metadata?.pending) {
      throw new Error('当前轮次仍有模型正在生成中或存在未完成/失败回复，请等待双侧完成后再投票');
    }

    chat.voteState = { ...(chat.voteState || {}), submitting: true, value: voteValue };
    chat.emit();

    let modelAId = null;
    let modelBId = null;
    let revealedModels = Array.isArray(chat.revealedModels) ? [...chat.revealedModels] : [];
    let actionError = '';

    try {
      const recaptchaV3Token = (typeof Recaptcha !== 'undefined' && Recaptcha.v3)
        ? await Promise.race([
            (Recaptcha.take ? Recaptcha.take('pairwise_feedback') : Recaptcha.v3('pairwise_feedback')).catch(() => null),
            new Promise(r => setTimeout(() => r(null), 2200)),
          ])
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

      {
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
                if (m.id === msgB.id || m.participantPosition === 'b') modelBId = modelBId || m.modelId;
                else if (m.id === msgA.id || m.participantPosition === 'a') modelAId = modelAId || m.modelId;
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
            if (m.id === msgA.id) m.modelId = modelAId;
            else if (m.id === msgB.id) m.modelId = modelBId;
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

      msgA.participantPosition = 'a';
      if (modelAId) msgA.modelId = modelAId;
      msgA.revealedModelName = modelAName;
      msgB.participantPosition = 'b';
      if (modelBId) msgB.modelId = modelBId;
      msgB.revealedModelName = modelBName;
      const freezeSideSnap = (m, pos, mId, mName) => {
        const cloneParts = Array.isArray(m.parts) ? JSON.parse(JSON.stringify(m.parts)) : [];
        const cloneWebdev = m.webdev ? JSON.parse(JSON.stringify(m.webdev)) : undefined;
        const manifest = Array.isArray(cloneWebdev?.files) ? cloneWebdev.files.map(f => ({ path: String(f?.path || ''), size: String(f?.content || '').length })) : [];
        const dig = (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.computeMessagesDigest === 'function')
          ? ChatHabitFingerprint.computeMessagesDigest([{ ...m, parts: cloneParts, webdev: cloneWebdev }])
          : String(m.id || '');
        return {
          id: m.id,
          participantPosition: pos,
          status: m.status || 'success',
          modelId: mId || m.modelId || null,
          modelName: mName || null,
          retryRegenerationCount: m.retryRegenerationCount || 0,
          contentDigest: dig,
          artifactManifest: manifest,
          message: { ...m, participantPosition: pos, modelId: mId || m.modelId || null, revealedModelName: mName || null, parts: cloneParts, webdev: cloneWebdev },
        };
      };
      const attemptId = `${sid}:turn-${lastUserIdx}:a-${msgA.id || ''}-r${msgA.retryRegenerationCount || 0}:b-${msgB.id || ''}-r${msgB.retryRegenerationCount || 0}`;
      const finalBattleRecord = {
        sid,
        attemptId,
        votedAt: Date.now(),
        vote: voteValue,
        messageAId: msgA.id,
        messageBId: msgB.id,
        modelAId,
        modelBId,
        modelAName,
        modelBName,
        sideA: freezeSideSnap(msgA, 'a', modelAId, modelAName),
        sideB: freezeSideSnap(msgB, 'b', modelBId, modelBName),
      };
      chat.finalBattleRecord = finalBattleRecord;

      chat.voteState = {
        voted: true,
        submitting: false,
        value: voteValue,
        attemptId,
        messageAId: msgA.id,
        messageBId: msgB.id,
        modelAId,
        modelBId,
        modelAName,
        modelBName,
        revealedAt: Date.now(),
        learnedAt: chat.voteState?.learnedAt || null,
        learnedReceipt: chat.voteState?.learnedReceipt || null,
      };

      const hRow = typeof History !== 'undefined' ? History.byId?.(sid) : null;
      if (hRow) {
        hRow.modelAId = modelAId;
        hRow.modelBId = modelBId;
        if (hRow.localTitle && !/vs|⚔️/i.test(String(hRow.localTitle))) delete hRow.localTitle;
        try { History.saveSoon?.(); } catch {}
      }
      try {
        if (typeof Models !== 'undefined' && typeof Models.set === 'function') {
          Models.set(sid, {
            name: `${modelAName || 'Model A'} vs ${modelBName || 'Model B'}`,
            modelA: modelAName || '',
            modelB: modelBName || '',
            modelAId,
            modelBId,
            battleRevealed: true,
            sure: true,
            provider: 'Battle 投票揭晓',
          });
        }
        if (typeof EvalView !== 'undefined' && typeof EvalView.invalidateBattleRevealCache === 'function') {
          EvalView.invalidateBattleRevealCache(sid);
        }
      } catch {}

      chat.emit();
      try {
        if (typeof UI !== 'undefined') {
          UI.renderChat?.(chat);
          UI.renderTabs?.();
          UI.renderList?.();
        }
      } catch {}
      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try { Bus.emit('history'); } catch {}
        const emittedFinalRecord = chat.finalBattleRecord;
        setTimeout(() => {
          try {
            Bus.emit('eval:vote-revealed', {
              sid,
              chat,
              attemptId: emittedFinalRecord?.attemptId || null,
              messageAId: msgA.id,
              messageBId: msgB.id,
              finalRecord: emittedFinalRecord || null,
              modelA: { id: modelAId, name: modelAName, messageId: msgA.id, contentDigest: emittedFinalRecord?.sideA?.contentDigest || null },
              modelB: { id: modelBId, name: modelBName, messageId: msgB.id, contentDigest: emittedFinalRecord?.sideB?.contentDigest || null },
              value: voteValue,
              fromHistory: false,
            });
          } catch {}
        }, 16);
      }
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
    if (!Array.isArray(targetMsg._versionArchive)) targetMsg._versionArchive = [];
    if ((Array.isArray(targetMsg.parts) && targetMsg.parts.length) || targetMsg.content || targetMsg.webdev?.files?.length) {
      const clonedArchiveParts = Array.isArray(targetMsg.parts) ? JSON.parse(JSON.stringify(targetMsg.parts)) : [];
      const clonedArchiveWebdev = targetMsg.webdev ? JSON.parse(JSON.stringify(targetMsg.webdev)) : undefined;
      targetMsg._versionArchive.push({
        originalMessageId: targetMsg.id || null,
        attemptSeq: Number(targetMsg.retryRegenerationCount) || 0,
        v: targetMsg.v || 0,
        at: startNow,
        status: targetMsg.status || 'ready',
        parts: clonedArchiveParts,
        content: targetMsg.content || '',
        reasoning: targetMsg.reasoning || '',
        webdev: clonedArchiveWebdev,
        artifactManifest: Array.isArray(clonedArchiveWebdev?.files) ? clonedArchiveWebdev.files.map(f => ({ path: String(f?.path || ''), size: String(f?.content || '').length })) : [],
        modelId: targetMsg.modelId || null,
        revealedModelName: targetMsg.revealedModelName || null,
      });
    }
    targetMsg.retryRegenerationCount = (targetMsg.retryRegenerationCount || 0) + 1;
    if (chat.finalBattleRecord) delete chat.finalBattleRecord;
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
        const v3IpBefore = (typeof IP !== 'undefined' && IP.ip) || '';
        const [tok, prePure] = await Promise.all([
          typeof Recaptcha.take === 'function' ? Recaptcha.take('chat_retry') : Recaptcha.v3('chat_retry'),
          prePureTask,
        ]);
        if (prePure?.switched || (v3IpBefore && typeof IP !== 'undefined' && IP.ip && IP.ip !== v3IpBefore)) {
          try { Recaptcha.clearCache?.(); } catch {}
          v3Token = await Recaptcha.v3('chat_retry').catch(() => tok);
        } else {
          v3Token = tok;
        }
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
      if ((res.status === 403 || res.status === 429) && typeof Recaptcha !== 'undefined') {
        let errText = '';
        try { errText = await res.clone().text(); } catch {}
        if (typeof IPRep !== 'undefined' && typeof IPRep.rotateOnVerificationOrLimit === 'function') {
          const rot = await IPRep.rotateOnVerificationOrLimit(res.status === 429 ? '429' : 'rc', { action: 'chat_retry' }).catch(() => null);
          const freshV3 = rot?.token || (typeof Recaptcha.v3 === 'function' ? await Recaptcha.v3('chat_retry').catch(() => null) : null);
          if (rot?.switched || (freshV3 && freshV3 !== v3Token)) {
            if (freshV3) v3Token = freshV3;
            res = await doPutRetry(targetMsg.id, null, v3Token);
            errText = !res.ok ? await res.clone().text().catch(() => '') : '';
          }
        }
        if ((res.status === 403 || res.status === 429) && typeof Recaptcha.v2 === 'function' && (/recaptcha|verification required|人机|challenge/i.test(errText) || res.status === 403)) {
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
          if (hasValidOutput && targetMsg.status !== 'failed' && opts?.allowRetryAutoLearn === true && !opts?.skipAutoLearn && chat.finalBattleRecord && chat.voteState?.voted && chat.voteState.modelAName && chat.voteState.modelBName && typeof ChatHabitFingerprint.learnBattleReveal === 'function') {
            ChatHabitFingerprint.learnBattleReveal(chat, { finalRecord: chat.finalBattleRecord, modelA: { name: chat.voteState.modelAName }, modelB: { name: chat.voteState.modelBName }, vote: chat.voteState.value || 'tie', forceResync: true });
          }
        } else if (chat.evalMode === 'direct' && chat.modelAId && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnDirectSession === 'function') {
          const mName = chat.directModelName || ModelCatalog.resolveModelName(chat.modelAId, chat.revealedModels || []);
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
    } finally {
      if (typeof SendQ !== 'undefined' && SendQ.of?.(chat)?.length) {
        setTimeout(() => { try { SendQ.check(chat); } catch {} }, 50);
      }
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

    const origRegenerate = Chat.prototype.regenerate;
    if (typeof origRegenerate === 'function') {
      Chat.prototype.regenerate = function (opt = {}) {
        if (isEvalChat(this)) {
          this.error = null;
          return regenerateTurn(this, opt);
        }
        return origRegenerate.call(this, opt);
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
    uploadEvaluationAttachments,
    refreshSignedAttachmentUrl,
    isR2UrlExpired,
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
