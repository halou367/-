// 输入栏模式切换器（Max/Battle/Direct）、测试模态选择器（Video/Image/Search/Code/Text/Auto）与 Direct 模型选择器
const MODE_SWITCHER_ICONS = {
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/><path d="M5 13l6 6"/><path d="M4 16l4 4"/><path d="M3 19l2 2"/>',
  agentBot: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9L19 15z"/><path d="M5 15l.7 1.6 1.6.7-1.6.7L5 19.6l-.7-1.6-1.6-.7 1.6-.7L5 15z"/>',
  directTarget: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  modVideo: '<rect x="2.5" y="5.5" width="13.5" height="13" rx="2.4"/><path d="m16 10.2 5.2-3v9.6L16 13.8z"/>',
  modImage: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 15.2-4.6-4.6a1.4 1.4 0 0 0-2 0L6 19"/>',
  modSearch: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14.2 14.2 0 0 1 0 18"/><path d="M12 3a14.2 14.2 0 0 0 0 18"/>',
  modCode: '<path d="m8 8-4.5 4L8 16"/><path d="m16 8 4.5 4-4.5 4"/><path d="m13.5 5-3 14"/>',
  modText: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M8.5 20h7"/>',
  modAuto: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  chevud: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
};

function ensureModeSwitcherIcons() {
  try {
    if (typeof ICON !== 'undefined' && ICON && typeof ICON === 'object') {
      Object.assign(ICON, MODE_SWITCHER_ICONS);
    }
  } catch {}
}
ensureModeSwitcherIcons();

function ensureModeSwitcherStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('brana-mode-switcher-css')) return;
  const st = document.createElement('style');
  st.id = 'brana-mode-switcher-css';
  st.textContent = `
.mode-bar-wrap{display:inline-flex;align-items:center;gap:2px;flex-wrap:nowrap;min-width:0;max-width:100%;flex:none}
.cbtn.mode-pill,.cbtn.modality-pill{display:inline-grid;place-items:center;width:28px;height:28px;min-width:28px;max-width:28px;padding:0;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--fg2);line-height:1;cursor:pointer;transition:background .14s ease,color .14s ease,border-color .14s ease;user-select:none;flex:none}
.cbtn.direct-model-pill{display:inline-flex;align-items:center;gap:5px;height:28px;min-width:28px;max-width:176px;padding:0 7px;border-radius:7px;border:1px solid var(--bd);background:color-mix(in srgb,var(--bg2) 72%,transparent);color:var(--fg);font-size:11.5px;font-weight:500;line-height:1;cursor:pointer;transition:background .14s ease,color .14s ease,border-color .14s ease;user-select:none;flex:0 1 auto}
.cbtn.direct-model-pill .direct-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:128px}
.cbtn.direct-model-pill .ic{width:12px;height:12px;opacity:.65;flex:none}
.cbtn.mode-pill:hover,.cbtn.modality-pill:hover,.cbtn.direct-model-pill:hover,.cbtn.mode-pill.is-open,.cbtn.modality-pill.is-open,.cbtn.direct-model-pill.is-open{background:var(--hl,var(--bg3));color:var(--fg);border-color:var(--bd2)}
.cbtn.mode-pill .ic,.cbtn.modality-pill .ic{width:16px;height:16px;flex:none;color:currentColor}
.cbtn.direct-model-pill .vlogo,.cbtn.direct-model-pill .vi{flex:none;opacity:.96}
body.m .cbtn.mode-pill,body.m .cbtn.modality-pill{width:32px;height:32px;min-width:32px;max-width:32px;border-radius:50%}
body.m .cbtn.direct-model-pill{height:30px;max-width:142px;border-radius:15px;padding:0 8px}
body.m .cbtn.direct-model-pill .direct-model-name{max-width:92px}
.mode-pop-vendors{display:flex;align-items:center;gap:4px;overflow-x:auto;padding:1px 1px 5px;margin-bottom:3px}
.mode-vendor-chip{flex:none;padding:2px 7px;border-radius:999px;border:1px solid var(--bd);background:var(--bg2);color:var(--fg2);font-size:11px;line-height:1.3;cursor:pointer;transition:all .12s ease}
.mode-vendor-chip:hover{color:var(--fg);border-color:var(--bd2)}
.mode-vendor-chip.on{background:var(--fg);color:var(--bg);border-color:var(--fg);font-weight:600}
.mode-pop{position:fixed;z-index:95;width:max-content;min-width:124px;max-width:176px;background:var(--card,var(--bg));border:1px solid var(--bd2,var(--bd));border-radius:12px;box-shadow:var(--sh,0 10px 32px rgba(0,0,0,.22));padding:5px;display:flex;flex-direction:column;gap:2px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:modePopIn .14s cubic-bezier(.2,.8,.2,1)}
.mode-pop.direct-model-pop{width:316px;min-width:280px;max-width:calc(100vw - 20px);padding:8px}
@keyframes modePopIn{from{opacity:0;transform:translateY(5px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
.mode-pop-item{display:flex;align-items:center;gap:8px;width:100%;padding:5px 8px;border-radius:8px;text-align:left;background:transparent;border:0;color:var(--fg);cursor:pointer;transition:background .12s ease}
.mode-pop-item:hover:not(.is-disabled){background:var(--hl,var(--bg2))}
.mode-pop-item.is-active{background:var(--on,var(--bg3))}
.mode-pop-item.is-disabled{opacity:.42;cursor:not-allowed}
.mode-pop-ico{width:26px;height:26px;border-radius:7px;background:var(--bg2,var(--bg3));border:1px solid var(--bd);display:inline-grid;place-items:center;flex:none;color:var(--fg2)}
.mode-pop-item.is-active .mode-pop-ico{border-color:var(--bd2);background:var(--card,var(--bg));color:var(--fg)}
.mode-pop-ico .ic{width:14px;height:14px}
.mode-pop-txt{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.mode-pop-title{font-size:12.5px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:6px;line-height:1.18}
.mode-pop-sub{font-size:10.5px;color:var(--fg3);line-height:1.18;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mode-pop-check{font-size:12.5px;font-weight:700;color:var(--fg);margin-left:6px;padding-left:2px;flex:none}
.mode-pop-sep{height:1px;background:var(--bd);margin:4px 6px}
.mode-pop-search-wrap{display:flex;align-items:center;gap:6px;padding:6px 9px;margin-bottom:5px;border-radius:9px;border:1px solid var(--bd);background:var(--bg2,var(--bg))}
.mode-pop-search-wrap:focus-within{border-color:var(--fg3)}
.mode-pop-search-wrap .ic{width:13.5px;height:13.5px;color:var(--fg3);flex:none}
.mode-pop-search{width:100%;border:0;outline:0;background:transparent;color:var(--fg);font-size:12px;padding:0}
.mode-pop-search::placeholder{color:var(--fg3)}
.mode-pop-list{display:flex;flex-direction:column;gap:2px;max-height:290px;overflow-y:auto;padding-right:2px}
.mode-pop-empty{padding:18px 10px;text-align:center;color:var(--fg3);font-size:12px}
.mode-pop-org{font-size:10px;padding:1px 5px;border-radius:4px;background:var(--bg3);color:var(--fg2);font-weight:500;margin-left:auto}
`;
  document.head.appendChild(st);
}

const MODE_META_MAP = {
  agent: {
    id: 'agent',
    label: 'Agent',
    shortLabel: 'Agent',
    desc: '随机模型',
    icon: 'agentBot',
  },
  battle: {
    id: 'battle',
    label: 'Battle',
    shortLabel: 'Battle',
    desc: '盲测对战',
    icon: 'swords',
  },
  direct: {
    id: 'direct',
    label: 'Direct',
    shortLabel: 'Direct',
    desc: '指定模型',
    icon: 'directTarget',
  },
};

const MODALITY_ORDER = ['video', 'image', 'search', 'webdev', 'chat', 'auto'];

const MODALITY_META_MAP = {
  video: {
    id: 'video',
    label: 'Video',
    desc: '视频生成',
    icon: 'modVideo',
  },
  image: {
    id: 'image',
    label: 'Image',
    desc: '图片生成',
    icon: 'modImage',
  },
  search: {
    id: 'search',
    label: 'Search',
    desc: '联网搜索',
    icon: 'modSearch',
  },
  webdev: {
    id: 'webdev',
    label: 'Code',
    desc: '网页应用',
    icon: 'modCode',
  },
  chat: {
    id: 'chat',
    label: 'Text',
    desc: '文本对话',
    icon: 'modText',
  },
  auto: {
    id: 'auto',
    label: 'Auto',
    desc: '自动匹配',
    icon: 'modAuto',
  },
};

const DIRECT_FALLBACK_MODELS = [
  { id: '019ce973-84c9-7030-9f88-1ebbf2edeb14', name: 'claude-opus-4-6', publicName: 'Claude Opus 4.6', displayName: 'Claude Opus 4.6', organization: 'Anthropic', provider: 'anthropic' },
  { id: '019cbd0a-d2e9-7540-9651-8fb7bc7bc483', name: 'claude-sonnet-4-6', publicName: 'Claude Sonnet 4.6', displayName: 'Claude Sonnet 4.6', organization: 'Anthropic', provider: 'anthropic' },
  { id: '019d3995-9b7a-730d-b779-227ad61ecc9b', name: 'gpt-5.4-high', publicName: 'GPT-5.4 High', displayName: 'GPT-5.4 High', organization: 'OpenAI', provider: 'openai' },
  { id: '019cbfae-9988-799f-833f-d9ef5fb8b92e', name: 'gemini-3.1-pro-preview', publicName: 'Gemini 3.1 Pro', displayName: 'Gemini 3.1 Pro', organization: 'Google', provider: 'google' },
  { id: '019b7b2f-fc57-7c65-b4ef-fd8db34f448e', name: 'deepseek-v3.2', publicName: 'DeepSeek V3.2', displayName: 'DeepSeek V3.2', organization: 'DeepSeek', provider: 'deepseek' },
  { id: '01980d0b-8126-7f5b-a749-bd6ef7bc7f56', name: 'qwen3-235b-a22b-instruct-2507', publicName: 'Qwen3 235B A22B', displayName: 'Qwen3 235B A22B', organization: 'Alibaba', provider: 'qwen' },
];

const ModeSwitcher = {
  _activePop: null,
  _activeBtn: null,
  _globalBound: false,
  _mountedBars: new Set(),

  getModeMeta(mode) {
    const k = String(mode || 'agent').toLowerCase();
    return MODE_META_MAP[k] || MODE_META_MAP.agent;
  },

  getModalityMeta(mod) {
    const k = String(mod || 'chat').toLowerCase();
    return MODALITY_META_MAP[k] || MODALITY_META_MAP.chat;
  },

  _icon(name, cls = '') {
    ensureModeSwitcherIcons();
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', ('ic ' + (cls || '')).trim());
    const pathHtml = (typeof ICON !== 'undefined' && ICON && ICON[name]) || MODE_SWITCHER_ICONS[name] || '';
    s.innerHTML = pathHtml;
    return s;
  },

  _modelLogo(modelObj, size = 15) {
    const label = String(modelObj?.displayName || modelObj?.publicName || modelObj?.name || modelObj?.id || '');
    const org = String(modelObj?.organization || modelObj?.provider || '');
    let vid = '';
    try {
      if (typeof Brand !== 'undefined' && typeof Brand.of === 'function') {
        vid = Brand.of(label) || Brand.of(org) || '';
      }
    } catch {}
    if (!vid) {
      const s = (label + ' ' + org).toLowerCase();
      if (/claude|anthropic|opus|sonnet|haiku/.test(s)) vid = 'anthropic';
      else if (/gpt|openai|o1|o3|o4/.test(s)) vid = 'openai';
      else if (/gemini|google/.test(s)) vid = 'google';
      else if (/grok|xai/.test(s)) vid = 'xai';
      else if (/deepseek/.test(s)) vid = 'deepseek';
      else if (/qwen|alibaba/.test(s)) vid = 'qwen';
      else if (/glm|zhipu/.test(s)) vid = 'zhipu';
      else if (/kimi|moonshot/.test(s)) vid = 'moonshot';
      else if (/minimax/.test(s)) vid = 'minimax';
      else if (/mistral/.test(s)) vid = 'mistral';
      else if (/llama|meta/.test(s)) vid = 'meta';
    }
    try {
      if (vid && typeof vlogo === 'function') return vlogo(vid, size);
    } catch {}
    const initial = (label.replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '')[0] || 'M').toUpperCase();
    return h('span', { class: 'vlogo none', style: { width: size + 'px', height: size + 'px', fontSize: Math.max(9, size - 5) + 'px' } }, initial);
  },

  closeAllPops() {
    try {
      if (this._activePop) {
        this._activePop.remove();
        this._activePop = null;
      }
      if (this._activeBtn) {
        this._activeBtn.classList.remove('is-open');
        this._activeBtn = null;
      }
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.mode-pop').forEach(el => {
          try { el.remove(); } catch {}
        });
        document.querySelectorAll('.mode-pill.is-open,.modality-pill.is-open,.direct-model-pill.is-open').forEach(el => {
          el.classList.remove('is-open');
        });
      }
    } catch {}
  },

  _ensureGlobalBindings() {
    if (this._globalBound || typeof document === 'undefined') return;
    this._globalBound = true;

    document.addEventListener('pointerdown', e => {
      if (!this._activePop) return;
      const t = e.target;
      if (t && (this._activePop.contains(t) || (this._activeBtn && this._activeBtn.contains(t)))) return;
      this.closeAllPops();
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._activePop) {
        e.stopPropagation();
        this.closeAllPops();
      }
    }, true);

    window.addEventListener('resize', () => {
      if (this._activePop) this.closeAllPops();
    }, { passive: true });

    if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
      const refreshAll = () => {
        for (const bar of [...this._mountedBars]) {
          if (!bar.isConnected) {
            this._mountedBars.delete(bar);
            continue;
          }
          try { bar._repaint?.(); } catch {}
        }
      };
      Bus.on('modechange', refreshAll);
      Bus.on('modalitychange', refreshAll);
      Bus.on('directmodelchange', refreshAll);
    }
  },

  _positionPop(pop, anchorBtn) {
    if (!pop || !anchorBtn) return;
    const rect = anchorBtn.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const popRect = pop.getBoundingClientRect();
    const pw = popRect.width || 272;
    const ph = popRect.height || 240;

    let left = Math.round(rect.left);
    if (left + pw > vw - 10) left = Math.max(10, vw - pw - 10);
    if (left < 10) left = 10;

    const spaceAbove = rect.top - 10;
    const spaceBelow = vh - rect.bottom - 10;
    let top;
    if (spaceAbove >= ph || spaceAbove >= spaceBelow) {
      top = Math.max(10, Math.round(rect.top - ph - 8));
    } else {
      top = Math.min(vh - ph - 10, Math.round(rect.bottom + 8));
    }

    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  },

  _resolveState(chat, tab = null) {
    const sid = chat?.sid || tab?.sid || null;
    const hRow = (sid && typeof History !== 'undefined' && typeof History.byId === 'function')
      ? History.byId(sid)
      : null;
    const isUnstartedEvalStub = Boolean(
      chat?.isEvaluation &&
      !tab?.sid &&
      (!Array.isArray(chat?.messages) || chat.messages.length === 0) &&
      !chat?.loaded &&
      !hRow
    );
    const isExistingChat = Boolean(
      sid && !isUnstartedEvalStub && (
        Boolean(tab?.sid) ||
        (Array.isArray(chat?.messages) && chat.messages.length > 0) ||
        chat?.loaded ||
        chat?.isEvaluation ||
        hRow
      )
    );
    const stateMode = (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function')
      ? ModeState.getMode()
      : (typeof ModeState !== 'undefined' && ModeState.mode ? ModeState.mode : 'agent');
    const stateMod = (typeof ModeState !== 'undefined' && typeof ModeState.getModality === 'function')
      ? ModeState.getModality()
      : (typeof ModeState !== 'undefined' && ModeState.modality ? ModeState.modality : 'chat');

    const curMode = isExistingChat
      ? (chat?.isEvaluation
          ? (chat.evalMode || 'battle')
          : (hRow && typeof ModeState !== 'undefined' && typeof ModeState.inferEntryMode === 'function'
              ? ModeState.inferEntryMode(hRow)
              : 'agent'))
      : (stateMode || 'agent');

    let curMod = isExistingChat
      ? (chat?.isEvaluation ? (chat.modality || stateMod) : (hRow?.modality || stateMod))
      : (stateMod || 'chat');

    if (curMode === 'direct' && (curMod === 'auto' || curMod === 'video')) {
      curMod = 'chat';
    }
    return { isExistingChat, curMode, curMod };
  },

  _resolveDirectModel(chat, curMod) {
    if (chat && chat.isEvaluation && chat.evalMode === 'direct' && (chat.modelAId || chat.directModelName)) {
      const byCatalog = (typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.getModelById === 'function' && chat.modelAId)
        ? ModelCatalog.getModelById(chat.modelAId)
        : null;
      if (byCatalog) return byCatalog;
      const resolvedName = chat.directModelName
        || ((typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function')
          ? ModelCatalog.resolveModelName(chat.modelAId, chat.revealedModels)
          : chat.modelAId);
      if (resolvedName) {
        return {
          id: chat.modelAId || resolvedName,
          name: resolvedName,
          publicName: resolvedName,
          displayName: resolvedName,
        };
      }
    }
    if (typeof ModeState !== 'undefined' && typeof ModeState.getDirectModel === 'function') {
      const dm = ModeState.getDirectModel();
      if (dm && (dm.id || dm.name || dm.displayName || dm.publicName)) return dm;
    }
    if (typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.getModelsForModality === 'function') {
      const list = ModelCatalog.getModelsForModality(curMod);
      if (Array.isArray(list) && list.length > 0) return list[0];
    }
    return DIRECT_FALLBACK_MODELS[0];
  },

  _openModePop(anchorBtn, tab, chat, wrap) {
    if (this._activeBtn === anchorBtn && this._activePop) {
      this.closeAllPops();
      return;
    }
    this.closeAllPops();
    const { isExistingChat, curMode } = this._resolveState(chat, tab);

    const items = ['agent', 'battle', 'direct'].map(mId => {
      const meta = this.getModeMeta(mId);
      const active = curMode === mId;
      return h('button', {
        type: 'button',
        class: 'mode-pop-item' + (active ? ' is-active' : ''),
        onclick: e => {
          e.stopPropagation();
          this.closeAllPops();
          if (isExistingChat && mId !== curMode) {
            if (typeof ModeState !== 'undefined' && typeof ModeState.setMode === 'function') {
              ModeState.setMode(mId, { silent: true });
            } else if (typeof ModeState !== 'undefined') {
              ModeState.mode = mId;
            }
            try { if (typeof Pager !== 'undefined') Pager.clear?.(); } catch {}
            try {
              if (typeof Tabs !== 'undefined') {
                if (typeof Tabs.newChat === 'function') Tabs.newChat();
                else if (typeof Tabs.open === 'function') Tabs.open(null);
              }
            } catch {}
            try { Bus?.emit?.('modechange', typeof ModeState !== 'undefined' && ModeState.snapshot ? ModeState.snapshot() : { mode: mId }); } catch {}
            try { Bus?.emit?.('history'); } catch {}
            try { Dock?.render?.(); } catch {}
            return;
          }
          if (typeof ModeState !== 'undefined' && typeof ModeState.setMode === 'function') {
            ModeState.setMode(mId, { forceEmit: true });
          } else if (typeof ModeState !== 'undefined') {
            ModeState.mode = mId;
            try { Bus?.emit?.('modechange', { mode: mId }); } catch {}
          }
          try { wrap._repaint?.(); } catch {}
          try { UI?.showTab?.(); } catch {}
          try { Dock?.render?.(); } catch {}
        },
      },
      h('span', { class: 'mode-pop-ico' }, this._icon(meta.icon)),
      h('span', { class: 'mode-pop-txt' },
        h('span', { class: 'mode-pop-title' }, meta.label),
        h('span', { class: 'mode-pop-sub' }, meta.desc)
      ),
      active ? h('span', { class: 'mode-pop-check' }, '✓') : null);
    });

    const pop = h('div', {
      class: 'mode-pop menu',
      'data-ks': '',
      role: 'menu',
      onclick: e => e.stopPropagation(),
    }, ...items);

    document.body.appendChild(pop);
    anchorBtn.classList.add('is-open');
    this._activePop = pop;
    this._activeBtn = anchorBtn;
    this._positionPop(pop, anchorBtn);
  },

  _openModalityPop(anchorBtn, tab, chat, wrap) {
    if (this._activeBtn === anchorBtn && this._activePop) {
      this.closeAllPops();
      return;
    }
    this.closeAllPops();
    const { isExistingChat, curMode, curMod } = this._resolveState(chat, tab);

    const buildModItem = modId => {
      const meta = this.getModalityMeta(modId);
      const active = curMod === modId;
      const disabledInDirect = curMode === 'direct' && (modId === 'video' || modId === 'auto');
      const subText = disabledInDirect ? '仅限 Battle' : meta.desc;

      return h('button', {
        type: 'button',
        class: 'mode-pop-item' + (active ? ' is-active' : '') + (disabledInDirect ? ' is-disabled' : ''),
        title: disabledInDirect ? subText : meta.label + ' — ' + meta.desc,
        onclick: e => {
          e.stopPropagation();
          if (disabledInDirect) {
            try {
              if (typeof toast === 'function') {
                toast(modId === 'video' ? '仅 Battle 模式支持视频盲测' : '仅 Battle 模式支持 Auto 自动模态');
              }
            } catch {}
            return;
          }
          this.closeAllPops();
          if (chat && chat.isEvaluation && (!Array.isArray(chat.messages) || chat.messages.length === 0)) {
            chat.modality = modId;
          } else if (isExistingChat && modId !== curMod) {
            if (typeof ModeState !== 'undefined' && typeof ModeState.setModality === 'function') {
              ModeState.setModality(modId, { silent: true });
            } else if (typeof ModeState !== 'undefined') {
              ModeState.modality = modId;
            }
            try {
              if (typeof Tabs !== 'undefined') {
                if (typeof Tabs.newChat === 'function') Tabs.newChat();
                else if (typeof Tabs.open === 'function') Tabs.open(null);
              }
            } catch {}
            try { Bus?.emit?.('modalitychange', typeof ModeState !== 'undefined' && ModeState.snapshot ? ModeState.snapshot() : { modality: modId }); } catch {}
            try { Dock?.render?.(); } catch {}
            return;
          }
          if (typeof ModeState !== 'undefined' && typeof ModeState.setModality === 'function') {
            ModeState.setModality(modId, { forceEmit: true });
          } else if (typeof ModeState !== 'undefined') {
            ModeState.modality = modId;
            try { Bus?.emit?.('modalitychange', { modality: modId }); } catch {}
          }
          try { wrap._repaint?.(); } catch {}
          try { UI?.showTab?.(); } catch {}
          try { Dock?.render?.(); } catch {}
        },
      },
      h('span', { class: 'mode-pop-ico' }, this._icon(meta.icon)),
      h('span', { class: 'mode-pop-txt' },
        h('span', { class: 'mode-pop-title' }, meta.label),
        h('span', { class: 'mode-pop-sub' }, subText)
      ),
      active ? h('span', { class: 'mode-pop-check' }, '✓') : null);
    };

    const pop = h('div', {
      class: 'mode-pop modality-pop menu',
      'data-ks': '',
      role: 'menu',
      onclick: e => e.stopPropagation(),
    },
    buildModItem('video'),
    buildModItem('image'),
    buildModItem('search'),
    buildModItem('webdev'),
    buildModItem('chat'),
    h('div', { class: 'mode-pop-sep' }),
    buildModItem('auto'));

    document.body.appendChild(pop);
    anchorBtn.classList.add('is-open');
    this._activePop = pop;
    this._activeBtn = anchorBtn;
    this._positionPop(pop, anchorBtn);
  },

  _openDirectModelPop(anchorBtn, tab, chat, wrap) {
    if (this._activeBtn === anchorBtn && this._activePop) {
      this.closeAllPops();
      return;
    }
    this.closeAllPops();
    const { isExistingChat, curMod } = this._resolveState(chat, tab);
    const curDirect = this._resolveDirectModel(chat, curMod);
    const curDirectId = curDirect?.id || curDirect?.name || '';

    let activeVendor = 'all';
    const vendorFilters = [
      ['all', '全部'],
      ['anthropic', 'Claude'],
      ['openai', 'GPT'],
      ['google', 'Gemini'],
      ['xai', 'Grok'],
      ['deepseek', 'DeepSeek'],
      ['qwen', 'Qwen'],
      ['zhipu', 'GLM'],
      ['moonshot', 'Kimi'],
    ];
    const searchInput = h('input', {
      type: 'text',
      class: 'mode-pop-search',
      placeholder: '搜索模型名称或厂商…',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const vendorBar = h('div', { class: 'mode-pop-vendors' });
    const listWrap = h('div', { class: 'mode-pop-list' });

    const renderVendors = () => {
      vendorBar.replaceChildren(...vendorFilters.map(([vk, vl]) => h('button', {
        type: 'button',
        class: 'mode-vendor-chip' + (activeVendor === vk ? ' on' : ''),
        onclick: e => {
          e.stopPropagation();
          activeVendor = vk;
          renderVendors();
          renderList();
        },
      }, vl)));
    };

    const getModels = () => {
      if (typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.getModelsForModality === 'function') {
        const arr = ModelCatalog.getModelsForModality(curMod);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
      return DIRECT_FALLBACK_MODELS;
    };

    const renderList = () => {
      const q = String(searchInput.value || '').trim().toLowerCase();
      const allModels = getModels();
      const filtered = allModels.filter(m => {
        const hay = m._searchHay || (m._searchHay = [m.displayName, m.publicName, m.name, m.id, m.organization, m.provider]
          .filter(Boolean)
          .join(' ')
          .toLowerCase());
        if (activeVendor !== 'all') {
          const vid = (typeof Brand !== 'undefined' && Brand.of) ? Brand.of(m.name || m.displayName || m.provider) : '';
          if (vid !== activeVendor && !hay.includes(activeVendor)) return false;
        }
        return !q || hay.includes(q);
      });

      if (!filtered.length) {
        listWrap.replaceChildren(h('div', { class: 'mode-pop-empty' }, '无匹配模型'));
        return;
      }

      const nodes = filtered.slice(0, 120).map(m => {
        const mLabel = m.displayName || m.publicName || m.name || m.id;
        const mOrg = m.organization || m.provider || '';
        const isSel = Boolean(curDirectId && (m.id === curDirectId || m.name === curDirectId || mLabel === curDirect?.displayName));

        return h('button', {
          type: 'button',
          class: 'mode-pop-item' + (isSel ? ' is-active' : ''),
          onclick: e => {
            e.stopPropagation();
            this.closeAllPops();
            if (chat && chat.isEvaluation && chat.evalMode === 'direct' && (!Array.isArray(chat.messages) || chat.messages.length === 0)) {
              chat.modelAId = m.id;
              chat.directModelName = mLabel;
            } else if (isExistingChat && chat?.modelAId && chat.modelAId !== m.id) {
              if (typeof ModeState !== 'undefined' && typeof ModeState.setDirectModel === 'function') {
                ModeState.setDirectModel(m.id, { silent: true });
              } else if (typeof ModeState !== 'undefined') {
                ModeState.directModelId = m.id;
                ModeState.directModelMeta = m;
              }
              try {
                if (typeof Tabs !== 'undefined') {
                  if (typeof Tabs.newChat === 'function') Tabs.newChat();
                  else if (typeof Tabs.open === 'function') Tabs.open(null);
                }
              } catch {}
              try { Bus?.emit?.('directmodelchange', m); } catch {}
              try { Dock?.render?.(); } catch {}
              return;
            }
            if (typeof ModeState !== 'undefined' && typeof ModeState.setDirectModel === 'function') {
              ModeState.setDirectModel(m.id);
            } else if (typeof ModeState !== 'undefined') {
              ModeState.directModelId = m.id;
              ModeState.directModelMeta = m;
              try { Bus?.emit?.('directmodelchange', m); } catch {}
            }
            try { wrap._repaint?.(); } catch {}
            try { Dock?.render?.(); } catch {}
            try { UI?.showTab?.(); } catch {}
          },
        },
        this._modelLogo(m, 18),
        h('span', { class: 'mode-pop-txt' },
          h('span', { class: 'mode-pop-title' },
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, mLabel),
            mOrg ? h('span', { class: 'mode-pop-org' }, mOrg) : null
          )
        ),
        isSel ? h('span', { class: 'mode-pop-check' }, '✓') : null);
      });

      listWrap.replaceChildren(...nodes);
    };

    searchInput.addEventListener('input', () => renderList());
    renderVendors();
    renderList();

    const pop = h('div', {
      class: 'mode-pop direct-model-pop menu',
      'data-ks': '',
      role: 'dialog',
      'aria-label': '选择 Direct 直连模型',
      onclick: e => e.stopPropagation(),
    },
    h('div', { class: 'mode-pop-search-wrap' },
      this._icon('search'),
      searchInput
    ),
    vendorBar,
    listWrap);

    document.body.appendChild(pop);
    anchorBtn.classList.add('is-open');
    this._activePop = pop;
    this._activeBtn = anchorBtn;
    this._positionPop(pop, anchorBtn);

    if (typeof isMob !== 'function' || !isMob()) {
      setTimeout(() => {
        try { searchInput.focus(); } catch {}
      }, 10);
    }

    if (typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.ensureLoaded === 'function') {
      Promise.resolve(ModelCatalog.ensureLoaded()).then(() => {
        if (this._activePop === pop && pop.isConnected) {
          renderList();
          this._positionPop(pop, anchorBtn);
        }
      }).catch(() => {});
    }
  },

  renderBar(tab, chat) {
    ensureModeSwitcherIcons();
    ensureModeSwitcherStyle();
    this._ensureGlobalBindings();

    const wrap = h('div', { class: 'mode-bar-wrap', 'data-ks': '' });

    const paint = () => {
      const curChat = (tab && tab.sid && typeof Chats !== 'undefined' && typeof Chats.get === 'function')
        ? (Chats.get(tab.sid) || chat)
        : chat;
      const { curMode, curMod } = this._resolveState(curChat, tab);
      const modeMeta = this.getModeMeta(curMode);
      const modMeta = this.getModalityMeta(curMod);

      const modeBtn = h('button', {
        type: 'button',
        class: 'ib cbtn mode-pill mode-icon-only',
        'data-mode': curMode,
        title: `${modeMeta.label} · ${modeMeta.desc}`,
        'aria-label': `切换对话模式（当前：${modeMeta.label}）`,
        onclick: e => {
          e.stopPropagation();
          this._openModePop(modeBtn, tab, curChat, wrap);
        },
      },
      this._icon(modeMeta.icon));
      const pills = [modeBtn];

      if (curMode === 'battle' || curMode === 'direct') {
        const modBtn = h('button', {
          type: 'button',
          class: 'ib cbtn modality-pill mode-icon-only',
          'data-modality': curMod,
          title: `${modMeta.label} · ${modMeta.desc}`,
          'aria-label': `切换测试模态（当前：${modMeta.label}）`,
          onclick: e => {
            e.stopPropagation();
            this._openModalityPop(modBtn, tab, curChat, wrap);
          },
        },
        this._icon(modMeta.icon));
        pills.push(modBtn);
      }

      if (curMode === 'direct') {
        const directModel = this._resolveDirectModel(curChat, curMod);
        const modelLabel = directModel?.displayName || directModel?.publicName || directModel?.name || directModel?.id || '选择模型';
        const shortLabel = String(modelLabel).replace(/\s*\(preview\)\s*/gi, '').trim();
        const directBtn = h('button', {
          type: 'button',
          class: 'ib cbtn direct-model-pill',
          title: `当前直连模型：${modelLabel} · 点击切换模型`,
          'aria-label': `选择 Direct 直连模型（当前：${modelLabel}）`,
          onclick: e => {
            e.stopPropagation();
            this._openDirectModelPop(directBtn, tab, curChat, wrap);
          },
        },
        this._modelLogo(directModel, 15),
        h('span', { class: 'direct-model-name' }, shortLabel),
        this._icon('chevud'));
        pills.push(directBtn);
      }

      wrap.dataset.mode = curMode;
      wrap.dataset.pills = String(pills.length);
      wrap.replaceChildren(...pills);
      try {
        const comp = wrap.closest?.('.composer') || (typeof document !== 'undefined' ? document.querySelector?.('#view .composer') : null);
        const cbox = wrap.closest?.('.cbox') || (typeof document !== 'undefined' ? document.querySelector?.('#view .cbox') : null);
        if (comp) comp.dataset.mode = curMode;
        if (cbox) cbox.dataset.mode = curMode;
        const gbtn = comp?.querySelector?.('.gbtn2:not([data-acct])');
        if (gbtn) {
          gbtn.style.display = curMode === 'battle' ? 'none' : '';
          if (curMode === 'direct') gbtn.style.display = 'none';
          gbtn.hidden = curMode === 'battle' || curMode === 'direct';
        }
        if (curMode === 'battle' && typeof GPop !== 'undefined' && typeof GPop.isOpen === 'function' && GPop.isOpen() && !GPop.target) {
          GPop.close?.();
        }
      } catch {}
    };

    wrap._repaint = paint;
    this._mountedBars.add(wrap);
    paint();
    return wrap;
  },
};

if (typeof window !== 'undefined') {
  window.ModeSwitcher = ModeSwitcher;
}
