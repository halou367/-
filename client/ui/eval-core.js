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
      const found = this.directModelId ? list.find(m => m.id === this.directModelId || m.name === this.directModelId) : null;
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

const ModelCatalog = (() => {
  const CACHE_KEY = 'eval.modelCatalog.v1';
  const CACHE_TTL = 10 * 60 * 1000;
  const ARENA_TO_MODALITY = {
    text: 'chat',
    vision: 'chat',
    document: 'chat',
    code: 'webdev',
    'image-to-code': 'webdev',
    'text-to-image': 'image',
    'image-edit': 'image',
    'multi-image-edit': 'image',
    search: 'search',
    'text-to-video': 'video',
    'image-to-video': 'video',
    'video-to-video': 'video',
  };

  const FALLBACK_MODELS = [
    { id: 'claude-opus-4-6', name: 'claude-opus-4-6', publicName: 'Claude Opus 4.6', displayName: 'Claude Opus 4.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 1, userSelectable: true },
    { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', publicName: 'Claude Sonnet 4.6', displayName: 'Claude Sonnet 4.6', organization: 'Anthropic', provider: 'anthropic', modalities: ['chat', 'webdev', 'search'], rank: 2, userSelectable: true },
    { id: 'gpt-5.4-high', name: 'gpt-5.4-high', publicName: 'GPT-5.4 High', displayName: 'GPT-5.4 High', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 3, userSelectable: true },
    { id: 'gpt-5.2-high', name: 'gpt-5.2-high', publicName: 'GPT-5.2 High', displayName: 'GPT-5.2 High', organization: 'OpenAI', provider: 'openai', modalities: ['chat', 'webdev', 'search'], rank: 4, userSelectable: true },
    { id: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview', publicName: 'Gemini 3.1 Pro', displayName: 'Gemini 3.1 Pro', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 5, userSelectable: true },
    { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', publicName: 'Gemini 2.5 Pro', displayName: 'Gemini 2.5 Pro', organization: 'Google', provider: 'google', modalities: ['chat', 'webdev', 'search'], rank: 6, userSelectable: true },
    { id: 'grok-4', name: 'grok-4', publicName: 'Grok 4', displayName: 'Grok 4', organization: 'xAI', provider: 'xai', modalities: ['chat', 'webdev', 'search'], rank: 7, userSelectable: true },
    { id: 'deepseek-r1-0528', name: 'deepseek-r1-0528', publicName: 'DeepSeek R1 0528', displayName: 'DeepSeek R1 0528', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 8, userSelectable: true },
    { id: 'deepseek-v3.2', name: 'deepseek-v3.2', publicName: 'DeepSeek V3.2', displayName: 'DeepSeek V3.2', organization: 'DeepSeek', provider: 'deepseek', modalities: ['chat', 'webdev'], rank: 9, userSelectable: true },
    { id: 'qwen3-235b-a22b-instruct-2507', name: 'qwen3-235b-a22b-instruct-2507', publicName: 'Qwen3 235B A22B', displayName: 'Qwen3 235B A22B', organization: 'Alibaba', provider: 'qwen', modalities: ['chat', 'webdev'], rank: 10, userSelectable: true },
    { id: 'glm-4.6', name: 'glm-4.6', publicName: 'GLM-4.6', displayName: 'GLM-4.6', organization: 'Zhipu', provider: 'zhipu', modalities: ['chat', 'webdev'], rank: 11, userSelectable: true },
    { id: 'kimi-k2.5', name: 'kimi-k2.5', publicName: 'Kimi K2.5', displayName: 'Kimi K2.5', organization: 'Moonshot', provider: 'moonshot', modalities: ['chat', 'webdev'], rank: 12, userSelectable: true },
    { id: 'gpt-image-1.5', name: 'gpt-image-1.5', publicName: 'GPT Image 1.5', displayName: 'GPT Image 1.5', organization: 'OpenAI', provider: 'openai', modalities: ['image'], rank: 1, userSelectable: true },
    { id: 'imagen-4.0-generate-preview', name: 'imagen-4.0-generate-preview', publicName: 'Imagen 4', displayName: 'Imagen 4', organization: 'Google', provider: 'google', modalities: ['image'], rank: 2, userSelectable: true },
    { id: 'flux-1.1-pro-ultra', name: 'flux-1.1-pro-ultra', publicName: 'FLUX 1.1 Pro Ultra', displayName: 'FLUX 1.1 Pro Ultra', organization: 'Black Forest Labs', provider: 'bfl', modalities: ['image'], rank: 3, userSelectable: true },
    { id: 'seedream-4.0', name: 'seedream-4.0', publicName: 'Seedream 4.0', displayName: 'Seedream 4.0', organization: 'ByteDance', provider: 'bytedance', modalities: ['image'], rank: 4, userSelectable: true },
    { id: 'veo-3', name: 'veo-3', publicName: 'Veo 3', displayName: 'Veo 3', organization: 'Google', provider: 'google', modalities: ['video'], rank: 1, userSelectable: true },
    { id: 'sora-2', name: 'sora-2', publicName: 'Sora 2', displayName: 'Sora 2', organization: 'OpenAI', provider: 'openai', modalities: ['video'], rank: 2, userSelectable: true },
    { id: 'kling-2.1-master', name: 'kling-2.1-master', publicName: 'Kling 2.1 Master', displayName: 'Kling 2.1 Master', organization: 'Kuaishou', provider: 'kuaishou', modalities: ['video'], rank: 3, userSelectable: true },
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
      if (m.name) byIdMap.set(String(m.name).toLowerCase(), m);
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
      if (modTag && !existing.modalities.includes(modTag)) {
        existing.modalities.push(modTag);
      }
      if (Array.isArray(item.modalities)) {
        for (const mm of item.modalities) {
          const mapped = ARENA_TO_MODALITY[mm] || mm;
          if (mapped && !existing.modalities.includes(mapped)) existing.modalities.push(mapped);
        }
      }
      if (item.rankByModality && typeof item.rankByModality === 'object') {
        Object.assign(existing.rankByModality, item.rankByModality);
      }
      if (modTag && existing.rankByModality[modTag] === undefined) {
        existing.rankByModality[modTag] = Number.isFinite(Number(item.rank)) ? Number(item.rank) : (idx + 1);
      }
      map.set(id, existing);
    };

    if (Array.isArray(raw)) {
      for (const group of raw) {
        if (group && Array.isArray(group.models)) {
          const modTag = ARENA_TO_MODALITY[String(group.arena || group.modality || '').toLowerCase()] || 'chat';
          group.models.forEach((m, i) => mergeModel(m, modTag, i));
        } else if (group && (group.id || group.name)) {
          mergeModel(group, ARENA_TO_MODALITY[String(group.arena || group.modality || 'text').toLowerCase()] || 'chat', map.size);
        }
      }
    } else if (raw && typeof raw === 'object') {
      const arr = Array.isArray(raw.models) ? raw.models : Array.isArray(raw.arenas) ? raw.arenas : [];
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
        map.set(fb.id, { ...fb, rankByModality: {} });
      }
    }
    return [...map.values()];
  }

  try {
    const cached = typeof Store !== 'undefined' && Store.get ? Store.get(CACHE_KEY, null) : null;
    if (cached && Array.isArray(cached.models) && cached.models.length) {
      rebuildIndex(cached.models);
      loadedAt = Number(cached.at) || 0;
    }
  } catch {}

  async function ensureLoaded(force = false) {
    if (!force && loadedAt && Date.now() - loadedAt < CACHE_TTL && models.length > FALLBACK_MODELS.length) {
      return models;
    }
    if (loadingP) return loadingP;
    loadingP = (async () => {
      try {
        const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
        const res = await fetchFn('/nextjs-api/model-catalog', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res && res.ok) {
          const data = await res.json();
          const parsed = normalizeCatalogPayload(data);
          if (parsed.length) {
            rebuildIndex(parsed);
            loadedAt = Date.now();
            try {
              if (typeof Store !== 'undefined' && Store.set) {
                Store.set(CACHE_KEY, { at: loadedAt, models: parsed });
              }
            } catch {}
            try { ModeState._ensureDirectModelValid(); } catch {}
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
    const list = filtered.length ? filtered : FALLBACK_MODELS.filter(m => (m.modalities || ['chat']).includes(mod));
    return [...list].sort((a, b) => {
      const ra = a.rankByModality?.[mod] ?? a.rank ?? 999;
      const rb = b.rankByModality?.[mod] ?? b.rank ?? 999;
      return ra - rb;
    });
  }

  function getModelById(id) {
    if (!id) return null;
    const key = String(id).trim();
    return byIdMap.get(key) || byIdMap.get(key.toLowerCase()) || null;
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
    getModelsForModality,
    getModelById,
    resolveModelName,
    get all() { return models; },
  };
})();

const EvalEngine = (() => {
  const VOTE_NEXT_ACTION = '60353f7027df227e704beac966d87b6957fc086a39';

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
    return extractUserText(content);
  }

  function buildAssistantParts(m) {
    const parts = [];
    if (!m || typeof m !== 'object') return parts;
    if (typeof m.reasoning === 'string' && m.reasoning.trim()) {
      parts.push({ type: 'reasoning', text: m.reasoning, state: 'done' });
    }
    if (Array.isArray(m.parts) && m.parts.length) {
      for (const p of m.parts) {
        if (!p) continue;
        if (p.type === 'reasoning' && parts.some(x => x.type === 'reasoning')) continue;
        parts.push({ ...p });
      }
    } else {
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
    const hRow = typeof History !== 'undefined' ? History.byId?.(chat.sid) : null;
    if (hRow && (hRow.type === 'evaluation' || hRow.mode === 'battle' || hRow.mode === 'direct' || hRow.mode === 'direct-battle' || hRow.mode === 'side-by-side')) {
      initEvalFields(chat, {
        evalMode: ModeState.inferEntryMode(hRow) === 'direct' ? 'direct' : 'battle',
        modality: hRow.modality || 'chat',
        modelAId: hRow.modelAId || null,
        modelBId: hRow.modelBId || null,
      });
      return true;
    }
    return false;
  }

  async function loadChat(chat, force = false) {
    if (!chat || !chat.sid) return;
    if (chat.loaded && !force) return;
    if (chat.loading) return chat.loading;
    initEvalFields(chat);
    chat.loading = (async () => {
      try {
        const data = await api('/api/evaluation/' + encodeURIComponent(chat.sid), { timeout: 30000 });
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

        const mapped = [];
        for (const m of rawMsgs) {
          if (!m || typeof m !== 'object') continue;
          if (m.role === 'user') {
            const uTxt = extractUserText(m.content ?? m.text ?? m.parts);
            mapped.push({
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
            mapped.push({
              id: m.id || genUuid(),
              role: 'assistant',
              participantPosition: pos,
              parentMessageIds: Array.isArray(m.parentMessageIds) ? m.parentMessageIds : [],
              modelId: mId,
              status: st,
              failureReason: m.failureReason || null,
              createdAt: m.createdAt || new Date().toISOString(),
              parts: buildAssistantParts(m),
              metadata: {
                ...(m.metadata || {}),
                pending: st === 'pending' || st === 'streaming',
              },
              v: 2,
            });
          }
        }

        chat.messages = mapped;
        chat.modelAId = detectedAId;
        chat.modelBId = detectedBId;

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
            const hRow = typeof History !== 'undefined' ? History.byId?.(chat.sid) : null;
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
          } catch {}
        }

        chat.loaded = true;
        chat.cached = false;
        chat.error = null;
        chat.status = 'idle';
        chat.emit();
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

  async function parseStream(reader, chat, msgA, msgB) {
    const decoder = new TextDecoder();
    let buf = '';
    const ensurePart = (msg, type) => {
      if (!msg) return null;
      if (!Array.isArray(msg.parts)) msg.parts = [];
      let p = msg.parts.find(x => x && x.type === type);
      if (!p) {
        p = { type, text: '', state: 'streaming' };
        if (type === 'reasoning') msg.parts.unshift(p);
        else msg.parts.push(p);
      }
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
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === 'g') {
        const chunk = typeof val === 'string' ? val : String(val ?? '');
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
        }
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
        targetMsg.metadata.pending = false;
        targetMsg.status = 'success';
        for (const p of targetMsg.parts || []) {
          if (p && p.state === 'streaming') p.state = 'done';
        }
        if (targetMsg.metadata.timing.reasoningStartedAt && !targetMsg.metadata.timing.reasoningCompletedAt) {
          targetMsg.metadata.timing.reasoningCompletedAt = tNow;
          targetMsg.metadata.timing.thinkingMs = tNow - targetMsg.metadata.timing.reasoningStartedAt;
        }
        targetMsg.v = (targetMsg.v || 0) + 1;
      } else if (code === '3') {
        targetMsg.metadata.pending = false;
        targetMsg.status = 'failed';
        targetMsg.failureReason = typeof val === 'string' ? val : (val?.message || val?.error || '生成失败');
        targetMsg.v = (targetMsg.v || 0) + 1;
      }

      chat.lastActivity = tNow;
      chat.emitStreamSoon?.(24);
      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try { Bus.emit('eval:stream', { sid: chat.sid, pos, chat }); } catch {}
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        handleLine(line);
      }
    }
    if (buf.trim()) handleLine(buf);

    for (const m of [msgA, msgB]) {
      if (!m) continue;
      if (m.metadata) m.metadata.pending = false;
      if (!m.status || m.status === 'pending' || m.status === 'streaming') m.status = 'success';
      for (const p of m.parts || []) {
        if (p && p.state === 'streaming') p.state = 'done';
      }
      m.v = (m.v || 0) + 1;
    }
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

    chat.status = 'streaming';
    chat.streaming = true;
    chat.phase = isBattle ? '双模型盲测生成中…' : '直连模型生成中…';
    const ctl = new AbortController();
    chat.ctl = ctl;
    chat.emit();

    try {
      const rcAction = 'chat_submit';
      let v3Token = null;
      let v2Token = opts.v2 || null;
      if (!v2Token && typeof Recaptcha !== 'undefined') {
        v3Token = await (Recaptcha.take ? Recaptcha.take(rcAction) : Recaptcha.v3(rcAction)).catch(() => null);
      }
      const cx = typeof packClientInteraction === 'function'
        ? packClientInteraction(String(text || '').length || 8, 'enter')
        : undefined;

      const endpoint = isFirst
        ? '/nextjs-api/stream/create-evaluation'
        : `/nextjs-api/stream/post-to-evaluation/${encodeURIComponent(chat.sid)}`;

      const payload = {
        id: chat.sid,
        mode: chat.evalMode,
        modality: effectiveModality,
        userMessageId,
        modelAMessageId: msgAId,
        ...(isBattle ? { modelBMessageId: msgBId } : {}),
        ...(chat.evalMode === 'direct' && chat.modelAId ? { modelAId: chat.modelAId } : {}),
        userMessage: {
          id: userMessageId,
          role: 'user',
          content: text,
          experimental_attachments: attachments,
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
      let res = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*' },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: ctl.signal,
      });

      if ((res.status === 403 || res.status === 429) && !v2Token && typeof Recaptcha !== 'undefined' && typeof Recaptcha.v2 === 'function') {
        const errBody = await res.clone().text().catch(() => '');
        if (/recaptcha|verification required|人机/i.test(errBody)) {
          const tok = await Recaptcha.v2().catch(() => null);
          if (tok) {
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
      chat.phase = '';
      chat.error = null;
      if (userMsg) delete userMsg._local;
      try { if (typeof History !== 'undefined' && History.touched) History.touched(chat.sid); } catch {}
      if (typeof Bus !== 'undefined' && typeof Bus.emit === 'function') {
        try { Bus.emit('turn', chat, { eval: true }); } catch {}
      }
      chat.emit();
    } catch (e) {
      if (e?.name === 'AbortError') {
        chat.status = 'idle';
        chat.streaming = false;
        chat.phase = '已停止';
      } else {
        chat.status = 'idle';
        chat.streaming = false;
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
      chat.modelAId = dm?.id || ModeState.directModelId || 'claude-opus-4-6';
      chat.directModelName = dm?.displayName || dm?.publicName || dm?.name || chat.modelAId;
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
    let revealedModels = chat.revealedModels || [];

    try {
      const recaptchaV3Token = (typeof Recaptcha !== 'undefined' && Recaptcha.v3)
        ? await Recaptcha.v3('pairwise_feedback').catch(() => null)
        : null;

      const actionBody = JSON.stringify([
        {
          evaluationSessionId: sid,
          messageAId: msgA.id,
          messageBId: msgB.id,
          value: voteValue,
          recaptchaV3Token,
        },
      ]);

      const fetchFn = typeof rawFetch === 'function' ? rawFetch : fetch;
      const resp = await fetchFn(`/c/${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: {
          Accept: 'text/x-component',
          'Content-Type': 'text/plain;charset=UTF-8',
          'Next-Action': VOTE_NEXT_ACTION,
        },
        body: actionBody,
        credentials: 'same-origin',
      }).catch(() => null);

      if (resp && resp.ok) {
        const flightText = await resp.text().catch(() => '');
        for (const line of flightText.split('\n')) {
          const idx = line.indexOf('{');
          if (idx < 0) continue;
          const sub = line.slice(idx);
          if (!sub.includes('modelAId') && !sub.includes('revealedModels')) continue;
          try {
            const obj = JSON.parse(sub);
            const cand = obj?.data || obj?.evaluation || obj?.result || obj;
            if (cand?.modelAId) modelAId = cand.modelAId;
            if (cand?.modelBId) modelBId = cand.modelBId;
            if (Array.isArray(cand?.revealedModels)) revealedModels = cand.revealedModels;
          } catch {}
        }
      }

      if (!modelAId || !modelBId) {
        const data = await api('/api/evaluation/' + encodeURIComponent(sid), { timeout: 20000 }).catch(() => null);
        const evalObj = data?.evaluation || data?.session || data?.data || data;
        if (evalObj) {
          if (Array.isArray(evalObj.revealedModels)) revealedModels = evalObj.revealedModels;
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
      }

      chat.revealedModels = revealedModels;
      if (modelAId) {
        chat.modelAId = modelAId;
        msgA.modelId = modelAId;
      }
      if (modelBId) {
        chat.modelBId = modelBId;
        msgB.modelId = modelBId;
      }

      const modelAName = modelAId ? ModelCatalog.resolveModelName(modelAId, revealedModels) : 'Model A';
      const modelBName = modelBId ? ModelCatalog.resolveModelName(modelBId, revealedModels) : 'Model B';

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
        if (modelAId) hRow.modelAId = modelAId;
        if (modelBId) hRow.modelBId = modelBId;
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
          this.status = 'idle';
          this.phase = '已停止';
          this.emit();
          return Promise.resolve();
        }
        return origStop.call(this, opt);
      };
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
    loadChat,
    resolveAutoModality,
    createEvalChat,
    sendFollowUp,
    streamTurn,
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
