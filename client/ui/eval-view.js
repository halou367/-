// Battle 双栏并排对比消息视图、底部四键投票揭晓栏与 Evaluation 辅助渲染器
const evalMd = (text, streaming = false, keyPrefix = '') => {
  const raw = String(text || '');
  if (keyPrefix && typeof StreamMD !== 'undefined' && typeof Seg !== 'undefined' && !Seg.off) {
    const box = Seg.box('eval', keyPrefix, () => h('div', { class: 'md prose muted', lang: '', translate: 'no' }));
    return StreamMD.paint(box, raw, Boolean(streaming));
  }
  const d = h('div', { class: 'md prose' + (streaming ? ' streaming' : ''), lang: '', translate: 'no' });
  if (typeof MD !== 'undefined' && typeof MD.render === 'function') {
    d.innerHTML = MD.render(raw);
  } else {
    d.textContent = raw;
  }
  return d;
};

const EvalView = {
  _openThinks: new Map(),
  _expandedCols: new Map(),
  _localRevealCache: new Map(),
  invalidateBattleRevealCache(sid) {
    if (!sid) this._localRevealCache.clear();
    else this._localRevealCache.delete(sid);
  },
  _getLocalBattleReveal(sid) {
    if (!sid) return null;
    if (this._localRevealCache.has(sid)) return this._localRevealCache.get(sid);
    let res = null;
    try {
      const mi = typeof Models !== 'undefined' && Models.get ? Models.get(sid) : null;
      if (mi && (mi.battleRevealed || (mi.modelA && mi.modelB) || (mi.name && /\s+vs\s+/i.test(mi.name) && !/Model\s*A\s*vs\s*Model\s*B/i.test(mi.name)))) {
        res = { revealed: true, modelAName: mi.modelA || '', modelBName: mi.modelB || '' };
      }
      if (!res && typeof Notes !== 'undefined' && Notes.get) {
        const nt = String(Notes.get(sid) || '').trim();
        if (nt && /\s+vs\s+/i.test(nt) && !/Model\s*A\s*vs\s*Model\s*B|匿名/i.test(nt)) {
          const parts = nt.split(/\s+vs\s+/i);
          res = { revealed: true, modelAName: (parts[0] || '').trim(), modelBName: (parts[1] || '').trim() };
        }
      }
      if (!res && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('arena:evaluation-session-cache:v1:' + sid);
        if (raw) {
          const obj = JSON.parse(raw);
          if ((obj?.modelAId && obj?.modelBId) || (Array.isArray(obj?.pairwiseFeedbacks) && obj.pairwiseFeedbacks.length > 0)) {
            res = { revealed: true, modelAId: obj.modelAId, modelBId: obj.modelBId };
          }
        }
      }
      if (!res && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.getBankSampleBySid === 'function') {
        const sA = ChatHabitFingerprint.getBankSampleBySid(sid + '#a');
        const sB = ChatHabitFingerprint.getBankSampleBySid(sid + '#b');
        if ((sA && sA.model) || (sB && sB.model)) {
          res = { revealed: true, modelAName: sA?.model || '', modelBName: sB?.model || '' };
        }
      }
    } catch {}
    if (this._localRevealCache.size > 400) this._localRevealCache.clear();
    this._localRevealCache.set(sid, res);
    return res;
  },

  isBattleChat(chat) {
    if (!chat) return false;
    if (chat.evalMode === 'battle') return true;
    if (chat.evalMode === 'direct') return false;
    const he = (typeof History !== 'undefined' && typeof History.byId === 'function' && chat.sid) ? History.byId(chat.sid) : null;
    if (he && (he.type === 'evaluation' || he.mode === 'battle' || he.mode === 'direct' || he.mode === 'direct-battle' || he.mode === 'side-by-side')) {
      if (he.mode === 'direct' || he.mode === 'direct-battle' || he.mode === 'side-by-side' || (he.modelAId && !he.modelBId && he.mode !== 'battle')) return false;
      return true;
    }
    return Boolean(chat.isEvaluation && chat.evalMode !== 'direct');
  },

  isBattleEntry(entry = null, chat = null, tab = null) {
    if (chat) {
      if (chat.evalMode === 'direct') return false;
      if (this.isBattleChat(chat)) return true;
    }
    if (entry) {
      if (entry.mode === 'direct' || entry.mode === 'direct-battle' || entry.mode === 'side-by-side') return false;
      if (entry.mode === 'battle') return true;
      if (entry.type === 'evaluation') {
        if (entry.modelAId && !entry.modelBId && entry.mode !== 'battle') return false;
        return true;
      }
      if (typeof ModeState !== 'undefined' && typeof ModeState.inferEntryMode === 'function' && ModeState.inferEntryMode(entry) === 'battle') {
        return true;
      }
    }
    if (!chat && !entry && tab && !tab.sid && !tab.kind) {
      if (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function' && ModeState.getMode() === 'battle') {
        return true;
      }
    }
    return false;
  },

  // Battle 模式标签与列表状态文案：仅显示「生成中」「待选择」「已完成」三个状态，不显示具体对话内容或厂商
  getBattleStatusLabel(chat = null, entry = null) {
    const sid = chat?.sid || entry?.id || '';
    const c = chat || (sid && typeof Chats !== 'undefined' ? Chats.get(sid) : null);
    const e = entry || (sid && typeof History !== 'undefined' && typeof History.byId === 'function' ? History.byId(sid) : null);
    const isTrackedRun = Boolean(sid && typeof RunningTracker !== 'undefined' && RunningTracker.isTrackedRunning?.(sid));
    const isGenerating = Boolean(
      isTrackedRun ||
      (c && (
        c.busy ||
        c.streaming ||
        c._evalStreaming ||
        c._startupResuming ||
        c.status === 'submitted' ||
        c.status === 'streaming' ||
        c.voteState?.submitting ||
        (Array.isArray(c.messages) && c.messages.some(m => m && m.role === 'assistant' && m.metadata?.pending))
      ))
    );
    if (isGenerating) return '生成中';

    const rev = this._getLocalBattleReveal ? this._getLocalBattleReveal(sid) : null;
    const mi = (sid && typeof Models !== 'undefined' && typeof Models.get === 'function') ? Models.get(sid) : null;
    const isCompleted = Boolean(
      c?.voteState?.voted ||
      c?.voteState?.revealed ||
      (c?.modelAId && c?.modelBId) ||
      (e?.modelAId && e?.modelBId) ||
      (Array.isArray(c?.pairwiseFeedbacks) && c.pairwiseFeedbacks.length > 0) ||
      mi?.battleRevealed ||
      (mi?.modelA && mi?.modelB) ||
      rev?.revealed
    );
    if (isCompleted) return '已完成';

    return '待选择';
  },

  renderBattleLogo(size = 15, st = '') {
    const swordsSvg = this._svgIcon(
      '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/><path d="M5 13l6 6"/><path d="M4 16l4 4"/><path d="M3 19l2 2"/>',
      'battle-tab-ic'
    );
    swordsSvg.style.width = Math.max(11, size - 3) + 'px';
    swordsSvg.style.height = Math.max(11, size - 3) + 'px';
    const cls = 'vlogo battle-vlogo' + (st === 'run' ? ' busy st-run' : st ? ' st-' + st : '');
    return h('span', {
      class: cls,
      style: { width: size + 'px', height: size + 'px' },
      'aria-hidden': 'true',
    }, swordsSvg);
  },

  isDirectChat(chat) {
    if (!chat) return false;
    if (chat.evalMode === 'direct') return true;
    if (chat.evalMode === 'battle') return false;
    const he = (typeof History !== 'undefined' && typeof History.byId === 'function' && chat.sid) ? History.byId(chat.sid) : null;
    if (he && (he.mode === 'direct' || he.mode === 'direct-battle' || he.mode === 'side-by-side' || (he.type === 'evaluation' && he.modelAId && !he.modelBId && he.mode !== 'battle'))) {
      return true;
    }
    return false;
  },

  groupTurns(messages) {
    const turns = [];
    let cur = null;
    const list = Array.isArray(messages) ? messages : [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m._held) continue;
      if (m.role === 'user') {
        cur = {
          id: m.id || ('turn-' + (turns.length + 1)),
          user: m,
          a: null,
          b: null,
          extras: [],
        };
        turns.push(cur);
        continue;
      }
      if (m.role === 'assistant') {
        if (!cur) {
          cur = {
            id: m.id || ('turn-' + (turns.length + 1)),
            user: null,
            a: null,
            b: null,
            extras: [],
          };
          turns.push(cur);
        }
        const pos = String(m.participantPosition || '').toLowerCase();
        if (pos === 'b') {
          cur.b = m;
        } else if (pos === 'a') {
          cur.a = m;
        } else if (!cur.a) {
          cur.a = m;
        } else if (!cur.b) {
          cur.b = m;
        } else {
          cur.extras.push(m);
        }
      }
    }
    return turns;
  },

  renderUserBubble(u, chat) {
    if (!u) return null;
    if (typeof R !== 'undefined' && typeof R.message0 === 'function') {
      return R.message0(u, chat, false, null, null);
    }
    const txt = (u.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n') || String(u.text || '');
    const ups = typeof userAtts === 'function' ? userAtts(u) : [];
    const el = h('div', {
      id: u.id ? 'chat-message-' + u.id : null,
      class: 'msg user',
      'data-id': u.id || null,
      'data-role': 'user',
      'data-user-message-layout': 'true',
    });
    if (ups.length && typeof attView === 'function') {
      el.append(h('div', { class: 'att-row mine' }, ups.map(att => attView(att, true))));
    }
    if (txt) {
      el.append(h('div', { class: 'bubble prose', lang: '', translate: 'no', 'data-user-message-body-row': 'true' }, txt));
    }
    const st = u._sentAt || (typeof idTime === 'function' ? idTime(u.id) : 0);
    el.append(
      h('div', { class: 'msg-act', 'data-user-message-action': 'true' },
        h('button', { class: 'ib', type: 'button', title: '复制', 'aria-label': 'Copy', onclick: () => typeof copyText === 'function' && copyText(txt) }, typeof icon === 'function' ? icon('copy') : '复制'),
        st && typeof clock === 'function' ? h('span', { class: 'mtime', title: '发送时间 ' + (typeof clockFull === 'function' ? clockFull(st) : '') }, clock(st)) : null
      )
    );
    return el;
  },

  resolveSideModelName(chat, msg, pos) {
    const vs = chat?.voteState || null;
    if (pos === 'a' && vs?.modelAName) return vs.modelAName;
    if (pos === 'b' && vs?.modelBName) return vs.modelBName;
    const rawId = msg?.modelId || (pos === 'a' ? (vs?.modelAId || chat?.modelAId) : (vs?.modelBId || chat?.modelBId));
    if (!rawId) return '';
    if (typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function') {
      return ModelCatalog.resolveModelName(rawId, chat?.revealedModels || []) || String(rawId);
    }
    return String(rawId);
  },

  _svgIcon(pathsHtml, cls = '') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', ('ic ' + (cls || '')).trim());
    s.innerHTML = pathsHtml;
    return s;
  },

  renderOutcomeBadge() {
    // 获胜模型仅通过外圈颜色边框 (.battle-col.is-winner) 表达，标题栏右侧留给「重新生成」按钮
    return null;
  },

  renderRegenBtn(chat, msg, pos, isStreaming, turn) {
    const isFailed = Boolean(msg?.status === 'failed' || msg?.failed || (Array.isArray(msg?.parts) && msg.parts.some(p => p?.type === 'error')));
    const isEmptyDone = Boolean(!isStreaming && (!msg || !(msg.parts || []).some(p => (p?.type === 'text' && String(p.text || '').trim()) || p?.type === 'image' || p?.type === 'video')));
    const prominent = isFailed || isEmptyDone;
    const sideLabel = pos === 'b' ? 'Model B' : (chat?.evalMode === 'direct' ? '当前模型' : 'Model A');
    const btn = h('button', {
      type: 'button',
      class: 'battle-regen-btn' + (prominent ? ' is-prominent' : '') + (isStreaming ? ' is-loading' : ''),
      title: isStreaming ? `正在生成中 · 点击可中止并重新生成 ${sideLabel} 回复` : `点击直接重新生成 ${sideLabel} 回复（无需切浏览器模式）`,
      'aria-label': '重新生成',
      onclick: async e => {
        e.stopPropagation();
        if (!chat) return;
        btn.classList.add('is-loading');
        try {
          if (typeof EvalEngine !== 'undefined' && typeof EvalEngine.regenerateTurn === 'function') {
            if (typeof toast === 'function') toast(`正在重新生成 ${sideLabel} 回复…`);
            await EvalEngine.regenerateTurn(chat, { turn, pos, msg });
          } else if (typeof EvalEngine !== 'undefined' && typeof EvalEngine.loadChat === 'function') {
            await EvalEngine.loadChat(chat, true);
          }
          if (typeof UI !== 'undefined' && UI.els?.chat === chat) {
            UI.renderChat(chat, false);
          }
        } catch (err) {
          if (typeof toast === 'function') {
            toast('重新生成失败：' + (typeof describe === 'function' ? describe(err) : (err?.message || String(err))), 'err');
          }
        } finally {
          btn.classList.remove('is-loading');
        }
      },
    },
      typeof icon === 'function'
        ? icon('refresh')
        : this._svgIcon('<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>')
    );
    return btn;
  },

  renderPreviewHeaderBtns(chat, msg, pos = 'a') {
    if (!msg || typeof HtmlPreview === 'undefined' || typeof HtmlPreview.extractEvalBundle !== 'function') return null;
    const bundle = HtmlPreview.extractEvalBundle(chat, msg);
    if (!bundle || !bundle.hasAnyPreview) return null;
    const isPvOpenHere = Boolean(
      typeof HtmlPreview.sid === 'function' &&
      HtmlPreview.sid() === chat?.sid &&
      typeof HtmlPreview.activeEvalPos === 'function' &&
      HtmlPreview.activeEvalPos() === pos
    );
    const curMode = typeof HtmlPreview.activeMode === 'function' ? HtmlPreview.activeMode() : '';
    const btns = [];
    if (bundle.previewUrl || bundle.localHtmlFile || bundle.isPendingBuild) {
      btns.push(h('button', {
        type: 'button',
        class: 'battle-pv-btn' + (isPvOpenHere && curMode !== 'code' ? ' is-active' : ''),
        title: bundle.previewUrl ? '预览：在右侧分栏打开 WebDev 实时预览' : '预览：在右侧分栏打开 HTML / SVG 实时预览',
        'aria-label': '预览',
        onclick: e => {
          e.stopPropagation();
          HtmlPreview.openEvalMessage?.(chat, msg, { pos, mode: 'run' });
          if (typeof UI !== 'undefined' && UI.els?.chat === chat) UI.renderChat(chat, false);
        },
      }, typeof icon === 'function' ? icon('eye') : this._svgIcon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>')));
    }
    if (Array.isArray(bundle.files) && bundle.files.length > 0) {
      btns.push(h('button', {
        type: 'button',
        class: 'battle-pv-btn' + (isPvOpenHere && curMode === 'code' ? ' is-active' : ''),
        title: `代码：在右侧分栏查看源码（共 ${bundle.files.length} 个文件）`,
        'aria-label': '代码',
        onclick: e => {
          e.stopPropagation();
          HtmlPreview.openEvalMessage?.(chat, msg, { pos, mode: 'code', path: bundle.files[0]?.path });
          if (typeof UI !== 'undefined' && UI.els?.chat === chat) UI.renderChat(chat, false);
        },
      }, typeof icon === 'function' ? icon('pvcode') : this._svgIcon('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>')));
    }
    return btns.length ? h('span', { class: 'battle-pv-acts' }, ...btns) : null;
  },

  _parseToolInput(p) {
    if (p?.input && typeof p.input === 'object' && Object.keys(p.input).length > 0) return p.input;
    const raw = String(p?.inputText || '').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
      const unesc = str => String(str || '')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      const out = (p?.input && typeof p.input === 'object') ? { ...p.input } : {};
      const pathM = raw.match(/"(?:path|file_path|target_file)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (pathM) out.path = unesc(pathM[1]);
      const cmdM = raw.match(/"(?:command|cmd)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/);
      if (cmdM) out.command = unesc(cmdM[1]);
      const contentM = raw.match(/"(?:content|text|replacement|new_text|new_str|patch|input)"\s*:\s*"([\s\S]*)$/);
      if (contentM) {
        let rv = contentM[1].replace(/"\s*\}?\s*$/, '');
        const val = unesc(rv);
        if (/"(?:patch|input)"/.test(contentM[0])) out.patch = val;
        else if (/"(?:replacement|new_text|new_str)"/.test(contentM[0])) out.replacement = val;
        else out.content = val;
      }
      if (Object.keys(out).length > 0) return out;
    }
    if (typeof R !== 'undefined' && typeof R.tinput === 'function') {
      try { return R.tinput(p) || {}; } catch {}
    }
    return {};
  },

  _extractPatchMeta(patchStr) {
    const src = String(patchStr || '');
    if (!src) return { file: '', addN: 0, delN: 0 };
    const m = src.match(/\*\*\*\s+(?:Add|Update)\s+File:\s*([^\r\n]+)|\+\+\+\s+b\/([^\r\n]+)/);
    const file = m ? String(m[1] || m[2] || '').trim().replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '') : '';
    let addN = 0, delN = 0;
    const lines = src.split(/\r?\n/);
    for (const ln of lines) {
      if (ln.startsWith('+++') || ln.startsWith('---') || ln.startsWith('***')) continue;
      if (ln.startsWith('+')) addN++;
      else if (ln.startsWith('-')) delN++;
    }
    return { file, addN, delN };
  },

  renderToolStepGroup(items, chat, msg, pos = 'a', isStreaming = false) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return null;
    const wrap = h('div', { class: 'wd-tool-steps not-prose' });
    const cleanPath = raw => String(raw || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
    const getInput = p => this._parseToolInput(p);
    const isRunningPart = p => Boolean(isStreaming && p?.state !== 'output-available' && p?.state !== 'output-error' && p?.state !== 'output-denied' && p?.state !== 'done');

    const stepEls = [];
    let exploreBuf = [];
    const flushExplore = () => {
      if (!exploreBuf.length) return;
      const batch = exploreBuf;
      exploreBuf = [];
      if (batch.length === 1) {
        const { p, pth } = batch[0];
        const run = isRunningPart(p);
        stepEls.push(h('button', {
          type: 'button',
          class: 'wd-step-row' + (run ? ' is-running' : ''),
          title: pth ? `点击在右侧查看 ${pth}` : '读取文件',
          onclick: e => {
            e.stopPropagation();
            if (pth && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.openEvalMessage === 'function') {
              HtmlPreview.openEvalMessage(chat, msg, pos, { mode: 'code', path: pth });
            }
          },
        },
          typeof icon === 'function' ? icon('file') : null,
          h('span', { class: 'wd-step-verb' }, run ? 'Reading' : 'Read'),
          h('span', { class: 'wd-step-file' }, pth || 'workspace'),
          h('span', { class: 'grow' }),
          run ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
        ));
        return;
      }
      const anyRun = batch.some(x => isRunningPart(x.p));
      const det = h('details', { class: 'wd-explore-group' },
        h('summary', { class: 'wd-step-row' + (anyRun ? ' is-running' : '') },
          typeof icon === 'function' ? icon('folder') : null,
          h('span', { class: 'wd-step-verb' }, anyRun ? 'Exploring' : 'Explored'),
          h('span', { class: 'wd-step-file' }, `${batch.length} files`),
          h('span', { class: 'grow' }),
          anyRun ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
        ),
        h('div', { class: 'wd-explore-list' },
          ...batch.map(({ pth }) => h('div', {
            class: 'wd-explore-item',
            onclick: e => {
              e.stopPropagation();
              if (pth && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.openEvalMessage === 'function') {
                HtmlPreview.openEvalMessage(chat, msg, pos, { mode: 'code', path: pth });
              }
            },
          }, typeof icon === 'function' ? icon('file') : null, h('span', { class: 'wd-step-file' }, pth || 'workspace')))
        )
      );
      stepEls.push(det);
    };

    list.forEach((p) => {
      const tName = String(p.toolName || String(p.type || '').replace(/^tool-/, '')).toLowerCase();
      const inp = getInput(p);
      const pth = cleanPath(inp.path || inp.file_path || inp.target_file || '');
      const run = isRunningPart(p);

      if (/^(read_?file|view_?file|list_?dir|glob|grep|search_?files|find_?by_?name)$/.test(tName)) {
        exploreBuf.push({ p, pth: pth || inp.pattern || inp.query || tName });
        return;
      }
      flushExplore();

      if (/^(write_?file|create_?file|write)$/.test(tName)) {
        const content = String(inp.content ?? inp.text ?? '');
        const linesCount = content ? content.split('\n').length : 0;
        const isHtml = /\.(?:html?|svg)$/i.test(pth);
        stepEls.push(h('button', {
          type: 'button',
          class: 'wd-step-row' + (run ? ' is-running' : ''),
          title: pth ? `点击在右侧查看 ${pth}` : '创建文件',
          onclick: e => {
            e.stopPropagation();
            if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.openEvalMessage === 'function') {
              HtmlPreview.openEvalMessage(chat, msg, pos, { mode: isHtml ? 'run' : 'code', path: pth });
            }
          },
        },
          typeof icon === 'function' ? icon(isHtml ? 'eye' : 'pvcode') : null,
          h('span', { class: 'wd-step-verb' }, run ? 'Writing' : 'Created'),
          h('span', { class: 'wd-step-file' }, pth || 'file'),
          linesCount > 0 ? h('span', { class: 'wd-diff-add' }, `+${linesCount}`) : null,
          h('span', { class: 'grow' }),
          run ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
        ));
        return;
      }

      if (/^(edit_?file|str_?replace|replace_?in_?file|edit)$/.test(tName)) {
        const oldStr = String(inp.context ?? inp.old_text ?? inp.old_str ?? '');
        const newStr = String(inp.replacement ?? inp.new_text ?? inp.new_str ?? '');
        const addN = newStr ? newStr.split('\n').length : 0;
        const delN = oldStr ? oldStr.split('\n').length : 0;
        stepEls.push(h('button', {
          type: 'button',
          class: 'wd-step-row' + (run ? ' is-running' : ''),
          title: pth ? `点击查看修改对比：${pth}` : '修改文件',
          onclick: e => {
            e.stopPropagation();
            if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.openEvalMessage === 'function') {
              HtmlPreview.openEvalMessage(chat, msg, pos, { mode: 'code', path: pth, highlightText: newStr || oldStr });
            }
          },
        },
          typeof icon === 'function' ? icon('pvcode') : null,
          h('span', { class: 'wd-step-verb' }, run ? 'Editing' : 'Edited'),
          h('span', { class: 'wd-step-file' }, pth || 'file'),
          addN ? h('span', { class: 'wd-diff-add' }, `+${addN}`) : null,
          delN ? h('span', { class: 'wd-diff-del' }, `-${delN}`) : null,
          h('span', { class: 'grow' }),
          run ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
        ));
        return;
      }

      if (/^(apply_?patch|patch)$/.test(tName)) {
        const patchStr = String(inp.patch ?? inp.input ?? inp.diff ?? inp.content ?? '');
        const meta = this._extractPatchMeta(patchStr);
        const targetFile = pth || meta.file || 'patch';
        const isHtml = /\.(?:html?|svg)$/i.test(targetFile);
        stepEls.push(h('button', {
          type: 'button',
          class: 'wd-step-row' + (run ? ' is-running' : ''),
          title: `点击在右侧查看 ${targetFile}`,
          onclick: e => {
            e.stopPropagation();
            if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.openEvalMessage === 'function') {
              HtmlPreview.openEvalMessage(chat, msg, pos, { mode: isHtml ? 'run' : 'code', path: targetFile !== 'patch' ? targetFile : undefined });
            }
          },
        },
          typeof icon === 'function' ? icon(isHtml ? 'eye' : 'pvcode') : null,
          h('span', { class: 'wd-step-verb' }, run ? 'Patching' : 'Patched'),
          h('span', { class: 'wd-step-file' }, targetFile),
          meta.addN ? h('span', { class: 'wd-diff-add' }, `+${meta.addN}`) : null,
          meta.delN ? h('span', { class: 'wd-diff-del' }, `-${meta.delN}`) : null,
          h('span', { class: 'grow' }),
          run ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
        ));
        return;
      }

      if (/^(bash|exec_?command|execute_?command|run_?command|shell)$/.test(tName)) {
        const cmdTxt = String(inp.command || inp.cmd || '').trim();
        const outTxt = typeof p.output === 'string'
          ? p.output
          : String(p.output?.stdout || p.output?.stderr || p.errorText || '').trim();
        stepEls.push(h('details', { class: 'wd-cmd-det' },
          h('summary', { class: 'wd-step-row' + (run ? ' is-running' : '') },
            typeof icon === 'function' ? icon('term') : null,
            h('span', { class: 'wd-step-verb' }, run ? 'Running' : 'Ran'),
            h('span', { class: 'wd-step-file' }, cmdTxt || tName),
            h('span', { class: 'grow' }),
            run ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
          ),
          outTxt ? h('pre', { class: 'wd-cmd-out' }, outTxt.slice(0, 4000)) : null
        ));
        return;
      }

      stepEls.push(h('div', {
        class: 'wd-step-row' + (run ? ' is-running' : ''),
        onclick: e => {
          if (pth && typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.openEvalMessage === 'function') {
            e.stopPropagation();
            HtmlPreview.openEvalMessage(chat, msg, pos, { mode: /\.(?:html?|svg)$/i.test(pth) ? 'run' : 'code', path: pth });
          }
        },
      },
        typeof icon === 'function' ? icon('tool') : null,
        h('span', { class: 'wd-step-verb' }, tName || 'Tool'),
        pth ? h('span', { class: 'wd-step-file' }, pth) : null,
        h('span', { class: 'grow' }),
        run ? h('i', { class: 'spin wd-step-spin' }) : h('span', { class: 'wd-step-ok' }, '✓')
      ));
    });

    flushExplore();

    // 步骤超过 3 条时自动折叠早期步骤，只直出最近 2 条，避免撑爆对战栏
    if (stepEls.length > 3) {
      const hiddenCount = stepEls.length - 2;
      const foldEl = h('details', { class: 'wd-steps-fold' },
        h('summary', { class: 'wd-step-row wd-fold-sum' },
          typeof icon === 'function' ? icon('tool') : null,
          h('span', { class: 'wd-step-verb' }, `已完成 ${hiddenCount} 个构建步骤`),
          h('span', { class: 'grow' }),
          h('span', { class: 'wd-step-meta' }, '展开 ▾')
        ),
        h('div', { class: 'wd-steps-fold-body' }, ...stepEls.slice(0, hiddenCount))
      );
      wrap.append(foldEl, ...stepEls.slice(hiddenCount));
    } else {
      wrap.append(...stepEls);
    }
    return wrap;
  },

  describeLiveProgress(chat, msg, pos = 'a') {
    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p) continue;
      if ((String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && p.state !== 'output-available' && p.state !== 'output-error' && p.state !== 'done') {
        const tName = String(p.toolName || String(p.type || '').replace(/^tool-/, '')).toLowerCase();
        const inp = this._parseToolInput(p);
        const fPath = String(inp.path || inp.file_path || inp.target_file || '').replace(/^\/home\/user\//, '').replace(/^~\//, '').replace(/^\.\//, '').replace(/^\/+/, '');
        if (/^(write_?file|create_?file|write)$/.test(tName)) {
          const content = String(inp.content ?? inp.text ?? '');
          const ln = content ? content.split('\n').length : 0;
          return `正在编写 ${fPath || '代码文件'}${ln > 0 ? ` (已写入 ${ln} 行)` : ''}…`;
        }
        if (/^(edit_?file|str_?replace|replace_?in_?file|edit)$/.test(tName)) {
          return `正在修改 ${fPath || '代码文件'}…`;
        }
        if (/^(apply_?patch|patch)$/.test(tName)) {
          const meta = this._extractPatchMeta(inp.patch ?? inp.input ?? inp.content ?? '');
          return `正在应用代码补丁 ${fPath || meta.file || ''}${meta.addN ? ` (+${meta.addN} 行)` : ''}…`;
        }
        if (/^(bash|exec_?command|execute_?command|run_?command|shell)$/.test(tName)) {
          const cmd = String(inp.command || inp.cmd || '').trim();
          return `正在执行命令${cmd ? '：' + cmd.slice(0, 36) : ''}…`;
        }
        if (/^(read_?file|view_?file|list_?dir|glob|grep)$/.test(tName)) {
          return `正在读取项目文件 ${fPath || ''}…`;
        }
        return `正在调用工具 ${tName}…`;
      }
      if (p.type === 'reasoning' && p.state !== 'done') {
        const rLen = String(p.text || '').length;
        return `正在深度思考${rLen > 0 ? `（已思考 ${rLen} 字）` : ''}…`;
      }
      if (p.type === 'text' && p.state !== 'done' && String(p.text || '').trim()) {
        const tLen = String(p.text || '').length;
        return `正在实时输出回复（${tLen} 字）…`;
      }
    }
    if (msg?.webdev?.status === 'pending' && Array.isArray(msg?.webdev?.files) && msg.webdev.files.length > 0) {
      return `已生成 ${msg.webdev.files.length} 个文件，正在构建并部署预览…`;
    }
    const curMod = chat?.resolvedModality || chat?.evalModality || chat?.modality || 'chat';
    const startedAt = Number(msg?.metadata?.timing?.startedAt || chat?.sentAt || 0);
    const elapsedSec = startedAt > 1e12 ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    const secSuffix = elapsedSec > 0 ? `（${elapsedSec}s）` : '';
    if (msg?.genPhase) {
      return msg.genPhase.includes('s）') ? msg.genPhase : (msg.genPhase.replace(/…$/, '') + secSuffix + '…');
    }
    if (curMod === 'image') {
      return `正在绘制图像${secSuffix}…`;
    }
    if (curMod === 'video') {
      return `正在渲染视频${secSuffix}…`;
    }
    if (curMod === 'search') {
      return `正在联网检索与生成回复${secSuffix}…`;
    }
    if (curMod === 'webdev') {
      return `正在规划项目结构与编写代码${secSuffix}…`;
    }
    return `正在生成回复${secSuffix}…`;
  },

  renderWebDevStatusFooter(chat, msg, pos = 'a', isStreaming = false) {
    if (!msg || typeof HtmlPreview === 'undefined' || typeof HtmlPreview.extractEvalBundle !== 'function') return null;
    const bundle = HtmlPreview.extractEvalBundle(chat, msg);
    if (!bundle || (!bundle.previewUrl && !bundle.localHtmlFile && !bundle.isPendingBuild && !bundle.buildError)) return null;
    const isPvOpenHere = Boolean(
      typeof HtmlPreview.sid === 'function' &&
      HtmlPreview.sid() === chat?.sid &&
      typeof HtmlPreview.activeEvalPos === 'function' &&
      HtmlPreview.activeEvalPos() === pos
    );
    const isErr = Boolean(bundle.buildError);
    const isPending = Boolean(bundle.isPendingBuild || (isStreaming && !bundle.previewUrl && !bundle.localHtmlFile));
    const titleTxt = isErr
      ? `构建异常：${String(bundle.buildError).slice(0, 60)}`
      : isPending
        ? this.describeLiveProgress(chat, msg, pos)
        : bundle.previewUrl
          ? 'WebDev 实时预览已就绪'
          : `HTML / SVG 预览已就绪（${bundle.localHtmlFile?.path || 'index.html'}）`;
    return h('div', {
      class: 'wd-build-bar' + (!isErr && !isPending ? ' is-ready' : '') + (isPvOpenHere ? ' is-active' : '') + (isErr ? ' is-error' : ''),
      role: 'button',
      tabindex: '0',
      onclick: e => {
        e.stopPropagation();
        HtmlPreview.openEvalMessage?.(chat, msg, pos, { mode: isErr ? 'code' : 'run' });
        if (typeof UI !== 'undefined' && UI.els?.chat === chat) UI.renderChat(chat, false);
      },
    },
      isPending ? h('i', { class: 'spin wd-step-spin' }) : h('i', { class: 'wd-ready-dot' }),
      h('span', { class: 'wd-build-title' }, titleTxt),
      bundle.files?.length ? h('span', { class: 'wd-build-meta' }, `${bundle.files.length} 个文件`) : null,
      h('span', { class: 'grow' }),
      h('span', { class: 'wd-build-act' }, isPvOpenHere ? '已展开预览' : (isErr ? '查看代码 →' : '打开预览 →'))
    );
  },

  renderColumnHeader(chat, msg, pos, isStreaming, turn) {
    const vs = chat?.voteState || null;
    const isRevealed = Boolean(vs?.voted || msg?.modelId || (pos === 'a' && vs?.modelAName) || (pos === 'b' && vs?.modelBName));
    const head = h('div', {
      class: 'battle-col-head',
      onclick: e => {
        if (e.target?.closest?.('button,a')) return;
        if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.sid === 'function' && HtmlPreview.sid() === chat?.sid) {
          HtmlPreview.selectEvalOption?.(pos);
          if (typeof UI !== 'undefined' && UI.els?.chat === chat) UI.renderChat(chat, false);
        }
      },
    });
    const sideLabel = pos === 'a' ? 'A' : 'B';
    const pvBtns = this.renderPreviewHeaderBtns(chat, msg, pos);

    const statusPill = isStreaming
      ? h('span', { class: 'battle-anon-tag is-streaming' }, h('i', { class: 'think-pulse', title: '生成中…' }), this.describeLiveProgress(chat, msg, pos))
      : (msg?.status === 'failed' || msg?.failed)
        ? h('span', { class: 'battle-anon-tag is-failed' }, '⚠ 生成失败')
        : (msg?.status === 'success')
          ? h('span', { class: 'battle-anon-tag is-done' }, msg.genPhase && msg.genPhase.startsWith('✓') ? msg.genPhase : '✓ 生成完毕')
          : h('span', { class: 'battle-anon-tag' }, '匿名盲测');

    if (!isRevealed) {
      head.append(
        h('span', { class: 'battle-side-tag', title: 'Model ' + sideLabel }, sideLabel),
        h('span', { class: 'battle-col-title' }, 'Model ' + sideLabel),
        statusPill,
        h('span', { class: 'grow' }),
        pvBtns,
        this.renderRegenBtn(chat, msg, pos, isStreaming, turn)
      );
      return head;
    }

    const realName = this.resolveSideModelName(chat, msg, pos) || ('Model ' + sideLabel);
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(realName) : '';
    const logoEl = (vid && typeof vlogo === 'function')
      ? vlogo(vid, 15)
      : null;
    if (logoEl && logoEl.classList) logoEl.classList.add('battle-vlogo');

    head.append(
      h('span', { class: 'battle-side-tag', title: 'Model ' + sideLabel }, sideLabel),
      logoEl,
      h('b', { class: 'battle-real-name', title: realName }, realName),
      statusPill,
      h('span', { class: 'grow' }),
      pvBtns,
      this.renderRegenBtn(chat, msg, pos, isStreaming, turn)
    );
    return head;
  },

  renderThinkPart(part, msg, pos, isStreaming) {
    const txt = String(part?.text || '').trim();
    const partStreaming = Boolean(isStreaming && part?.state !== 'done');
    if (!txt && !partStreaming) return null;
    const thinkKey = String(msg?.id || 'm') + ':' + pos + ':think';
    const isOpen = this._openThinks.has(thinkKey) ? this._openThinks.get(thinkKey) : false;
    const timing = msg?.metadata?.timing || {};
    const thinkMs = Number(timing.thinkingMs) || (timing.reasoningStartedAt && timing.reasoningCompletedAt ? (timing.reasoningCompletedAt - timing.reasoningStartedAt) : 0);
    const secStr = thinkMs > 0 ? `${(thinkMs / 1000).toFixed(1)}s` : '';
    const lastLine = txt ? txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean).at(-1) || '' : '';
    const labelTxt = partStreaming
      ? (secStr ? `思考中 ${secStr}` : '思考中…')
      : (secStr ? `已思考 ${secStr}` : '思考过程');

    if (typeof Seg !== 'undefined' && !Seg.off && typeof StreamMD !== 'undefined') {
      const det = Seg.box('eval', thinkKey + ':det', () => {
        const titleSpan = h('span', { class: 'think-box-title rs-t' }, labelTxt);
        const snipSpan = h('span', { class: 'think-live-snip' });
        const pulseEl = h('i', { class: 'think-pulse', 'aria-hidden': 'true', hidden: true });
        const bodyBox = h('div', { class: 'think-box-body md prose muted', lang: '', translate: 'no' });
        const dEl = h('details', { class: 'think-box reason not-prose', open: isOpen ? '' : null },
          h('summary', { class: 'think-box-sum', role: 'button', title: '点击展开/收起思考过程' },
            typeof icon === 'function' ? icon('brain') : null,
            titleSpan,
            snipSpan,
            pulseEl
          ),
          bodyBox
        );
        dEl.__titleSpan = titleSpan;
        dEl.__snipSpan = snipSpan;
        dEl.__pulseEl = pulseEl;
        dEl.__bodyBox = bodyBox;
        dEl.addEventListener('toggle', () => {
          this._openThinks.set(thinkKey, dEl.open);
        });
        return dEl;
      });
      det.classList.toggle('is-streaming', partStreaming);
      if (this._openThinks.has(thinkKey)) det.open = Boolean(this._openThinks.get(thinkKey));
      if (det.__titleSpan && det.__titleSpan.textContent !== labelTxt) {
        det.__titleSpan.textContent = labelTxt;
      }
      if (det.__snipSpan) {
        const showSnip = partStreaming && !det.open && lastLine;
        det.__snipSpan.hidden = !showSnip;
        if (showSnip) det.__snipSpan.textContent = lastLine.slice(0, 60);
      }
      if (det.__pulseEl) det.__pulseEl.hidden = !partStreaming;
      if (det.__bodyBox) StreamMD.paint(det.__bodyBox, txt || '…', partStreaming);
      return det;
    }

    const det = h('details', {
      class: 'think-box reason not-prose' + (partStreaming ? ' is-streaming' : ''),
      open: isOpen ? '' : null,
    },
      h('summary', { class: 'think-box-sum', role: 'button', title: '点击展开/收起思考过程' },
        typeof icon === 'function' ? icon('brain') : null,
        h('span', { class: 'think-box-title rs-t' }, labelTxt),
        partStreaming && !isOpen && lastLine ? h('span', { class: 'think-live-snip' }, lastLine.slice(0, 60)) : null,
        partStreaming ? h('i', { class: 'think-pulse', 'aria-hidden': 'true' }) : null
      ),
      h('div', { class: 'think-box-body md prose muted', lang: '', translate: 'no' },
        txt ? evalMd(txt, partStreaming, thinkKey) : h('span', { class: 'dim' }, '…')
      )
    );
    det.addEventListener('toggle', () => {
      this._openThinks.set(thinkKey, det.open);
    });
    return det;
  },

  renderMediaPart(part) {
    let url = part?.url || part?.image || part?.src || '';
    if (!url) return null;
    const r2Name = part?.name || part?.filename || '';
    const isVideo = part?.type === 'video' || /^video\//i.test(part?.contentType || part?.mediaType || '') || /\.(mp4|webm|mov)(\?|$)/i.test(url);
    if (isVideo) {
      const dlLink = h('a', { class: 'ib xs eval-media-dl', href: url, download: 'battle-video.mp4', target: '_blank', rel: 'noopener', title: '下载视频' }, typeof icon === 'function' ? icon('dl') : '↓');
      const vidEl = h('video', {
        class: 'eval-media-video',
        controls: true,
        playsinline: true,
        preload: 'metadata',
        src: url,
        poster: part?.thumbnailUrl || null,
        onerror: () => {
          if (vidEl._r2Retried || typeof EvalEngine === 'undefined' || typeof EvalEngine.refreshSignedAttachmentUrl !== 'function') return;
          vidEl._r2Retried = true;
          EvalEngine.refreshSignedAttachmentUrl(url, r2Name).then(fresh => {
            if (fresh && fresh !== url) {
              url = fresh;
              if (part) part.url = fresh;
              vidEl.src = fresh;
              dlLink.href = fresh;
            }
          }).catch(() => {});
        },
      });
      if (typeof EvalEngine !== 'undefined' && typeof EvalEngine.isR2UrlExpired === 'function' && EvalEngine.isR2UrlExpired(url)) {
        vidEl._r2Retried = true;
        EvalEngine.refreshSignedAttachmentUrl(url, r2Name).then(fresh => {
          if (fresh && fresh !== url) {
            url = fresh;
            if (part) part.url = fresh;
            vidEl.src = fresh;
            dlLink.href = fresh;
          }
        }).catch(() => {});
      }
      return h('div', { class: 'eval-media-wrap eval-video-wrap' },
        vidEl,
        h('div', { class: 'eval-media-bar' }, dlLink)
      );
    }
    const imgEl = h('img', {
      class: 'eval-media-img file-img zimg',
      src: url,
      alt: part?.alt || 'Generated image',
      loading: 'lazy',
      onerror: () => {
        if (imgEl._r2Retried || typeof EvalEngine === 'undefined' || typeof EvalEngine.refreshSignedAttachmentUrl !== 'function') return;
        imgEl._r2Retried = true;
        EvalEngine.refreshSignedAttachmentUrl(url, r2Name).then(fresh => {
          if (fresh && fresh !== url) {
            url = fresh;
            if (part) part.url = fresh;
            imgEl.src = fresh;
          }
        }).catch(() => {});
      },
      onclick: e => {
        if (typeof ImgView !== 'undefined' && typeof ImgView.open === 'function') {
          ImgView.open(imgEl.src || url, '图片', e.currentTarget);
        }
      },
    });
    if (typeof EvalEngine !== 'undefined' && typeof EvalEngine.isR2UrlExpired === 'function' && EvalEngine.isR2UrlExpired(url)) {
      imgEl._r2Retried = true;
      EvalEngine.refreshSignedAttachmentUrl(url, r2Name).then(fresh => {
        if (fresh && fresh !== url) {
          url = fresh;
          if (part) part.url = fresh;
          imgEl.src = fresh;
        }
      }).catch(() => {});
    }
    return h('div', { class: 'eval-media-wrap eval-image-wrap' },
      imgEl,
      h('div', { class: 'eval-media-bar' },
        h('button', {
          type: 'button',
          class: 'ib xs eval-media-dl',
          title: '保存图片',
          onclick: e => {
            e.stopPropagation();
            const curUrl = imgEl.src || url;
            if (typeof ImgAct !== 'undefined' && typeof ImgAct.save === 'function') {
              ImgAct.save(curUrl, 'battle-image.png', imgEl);
            } else {
              window.open(curUrl, '_blank');
            }
          },
        }, typeof icon === 'function' ? icon('dl') : '↓')
      )
    );
  },

  renderSourcesPart(part) {
    const list = Array.isArray(part) ? part : (Array.isArray(part?.sources) ? part.sources : []);
    if (!list.length) return null;
    return h('div', { class: 'eval-sources' },
      h('div', { class: 'eval-sources-list' },
        ...list.slice(0, 12).map((s, idx) => {
          const href = s.url || s.link || s.href || '#';
          let domain = '';
          try { domain = new URL(href).hostname.replace(/^www\./, ''); } catch {}
          const label = domain || s.title || ('#' + (idx + 1));
          return h('a', {
            class: 'eval-source-pill',
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: (s.title ? s.title + '\n' : '') + href,
          },
            h('span', { class: 'eval-source-idx' }, String(idx + 1)),
            h('span', { class: 'eval-source-txt' }, label)
          );
        })
      )
    );
  },
  renderColumnBody(chat, msg, pos, isLastTurn, reuseBody = null) {
    const body = reuseBody || h('div', { class: 'battle-col-body' });
    const kids = [];
    const isUnverifiedCache = Boolean((chat?.cached && !chat?.loaded) || chat?._recoveringIncomplete);
    const isMsgFailed = Boolean(msg?.status === 'failed' || msg?.status === 'error' || msg?.failed || msg?.webdev?.status === 'build-error');
    const isPending = !isMsgFailed && Boolean(msg?.metadata?.pending || (isUnverifiedCache && msg?._incomplete) || (isLastTurn && chat?.busy && (!msg || msg.status === 'pending' || msg.status === 'streaming')));
    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    let hasContent = false;
    let fullText = '';
    let toolStepCount = 0;

    let toolBuf = [];
    const flushTools = () => {
      if (!toolBuf.length) return;
      const g = toolBuf;
      toolBuf = [];
      const tgEl = this.renderToolStepGroup(g, chat, msg, pos, isPending);
      if (tgEl) { kids.push(tgEl); hasContent = true; }
    };

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || !p.type) continue;
      if (p.type.startsWith('tool-') || p.type === 'dynamic-tool') {
        toolBuf.push(p);
        toolStepCount++;
        continue;
      }
      flushTools();
      if (p.type === 'reasoning') {
        const th = this.renderThinkPart(p, msg, pos, isPending);
        if (th) { kids.push(th); hasContent = true; }
      } else if (p.type === 'text') {
        const txt = String(p.text || '');
        if (!txt.trim()) continue;
        fullText += (fullText ? '\n' : '') + txt;
        const streaming = Boolean(isPending && p.state === 'streaming');
        const htmlSegs = (typeof R !== 'undefined' && typeof R.extractInlineHtmlSegments === 'function')
          ? R.extractInlineHtmlSegments(txt, streaming)
          : null;
        if (Array.isArray(htmlSegs) && htmlSegs.length) {
          htmlSegs.forEach((hs, hi) => {
            if (hs.type === 'html') {
              const hKey = `${msg?.id || pos}:ih:${i}:${hs.idx}`;
              const cardEl = typeof R.inlineHtmlCard === 'function' ? R.inlineHtmlCard(hs, hKey, msg, chat) : null;
              if (cardEl) kids.push(cardEl);
            } else if (hs.text && hs.text.trim()) {
              if (typeof R !== 'undefined' && typeof R.text === 'function') {
                kids.push(R.text({ type: 'text', text: hs.text }, streaming && hi === htmlSegs.length - 1, msg, chat, `${msg?.id || pos}:t:${i}:m${hi}`));
              } else {
                kids.push(evalMd(hs.text, streaming && hi === htmlSegs.length - 1));
              }
            }
          });
        } else if (typeof R !== 'undefined' && typeof R.text === 'function') {
          kids.push(R.text(p, streaming, msg, chat, (msg?.id || pos) + ':t' + i));
        } else {
          kids.push(evalMd(txt, streaming));
        }
        hasContent = true;
      } else if (p.type === 'image' || p.type === 'video' || (p.type === 'file' && /^(image|video)\//i.test(p.mediaType || p.contentType || ''))) {
        const mediaEl = this.renderMediaPart(p);
        if (mediaEl) { kids.push(mediaEl); hasContent = true; }
      } else if (p.type === 'sources' && Array.isArray(p.sources)) {
        const srcEl = this.renderSourcesPart(p.sources);
        if (srcEl) { kids.push(srcEl); hasContent = true; }
      } else if (p.type === 'source-url') {
        const srcEl = this.renderSourcesPart([p]);
        if (srcEl) { kids.push(srcEl); hasContent = true; }
      } else if (p.type === 'error') {
        kids.push(h('div', { class: 'eval-error-box' }, typeof icon === 'function' ? icon('alert') : null, h('span', {}, String(p.text || '生成异常'))));
        hasContent = true;
      }
    }
    flushTools();

    // Fallback: attachments or sources directly on msg
    if (Array.isArray(msg?.experimental_attachments) && msg.experimental_attachments.length && !parts.some(p => p.type === 'image' || p.type === 'video')) {
      for (const att of msg.experimental_attachments) {
        const mediaEl = this.renderMediaPart({
          type: /^video\//i.test(att.contentType || '') ? 'video' : 'image',
          url: att.url,
          contentType: att.contentType,
        });
        if (mediaEl) { kids.push(mediaEl); hasContent = true; }
      }
    }
    if (Array.isArray(msg?.sources) && msg.sources.length && !parts.some(p => p.type === 'sources')) {
      const srcEl = this.renderSourcesPart(msg.sources);
      if (srcEl) { kids.push(srcEl); hasContent = true; }
    }

    if (isMsgFailed) {
      const sideLabel = pos === 'b' ? 'Model B' : (chat?.evalMode === 'direct' ? '当前模型' : 'Model A');
      const inlineRetryBtn = h('button', {
        type: 'button',
        class: 'battle-regen-btn is-prominent eval-inline-retry-btn',
        style: 'margin-left:auto;flex-shrink:0',
        title: `直接重新生成 ${sideLabel} 回复`,
        onclick: async e => {
          e.stopPropagation();
          if (!chat || typeof EvalEngine === 'undefined' || typeof EvalEngine.regenerateTurn !== 'function') return;
          inlineRetryBtn.classList.add('is-loading');
          try {
            if (typeof toast === 'function') toast(`正在重新生成 ${sideLabel} 回复…`);
            await EvalEngine.regenerateTurn(chat, { pos, msg });
            if (typeof UI !== 'undefined' && UI.els?.chat === chat) {
              UI.renderChat(chat, false);
            }
          } catch (err) {
            if (typeof toast === 'function') {
              toast('重新生成失败：' + (typeof describe === 'function' ? describe(err) : (err?.message || String(err))), 'err');
            }
          } finally {
            inlineRetryBtn.classList.remove('is-loading');
          }
        },
      },
        typeof icon === 'function' ? icon('refresh') : '↻',
        h('span', { class: 'regen-txt' }, '点击重试')
      );
      var errBoxEl = h('div', { class: 'eval-error-box', style: 'display:flex;align-items:center;gap:8px' },
        typeof icon === 'function' ? icon('alert') : null,
        h('span', {}, String(msg.failureReason || msg.errorText || msg.webdev?.message || '生成失败，请点击重试重新生成')),
        inlineRetryBtn
      );
      hasContent = true;
    }

    const wdFoot = isMsgFailed ? null : this.renderWebDevStatusFooter(chat, msg, pos, isPending);

    // 实时 SSE 进度条（当模型正在流式生成且底部没有 pending wdFoot 时，直接反馈当前模型的实时动作）
    let liveBanner = null;
    if (isPending && !wdFoot) {
      const liveTxt = this.describeLiveProgress(chat, msg, pos);
      liveBanner = h('div', { class: 'battle-live-status' },
        h('i', { class: 'spin wd-step-spin' }),
        h('span', { class: 'battle-live-txt' }, liveTxt)
      );
      hasContent = true;
    }

    if (!hasContent && !wdFoot && isPending) {
      kids.push(
        h('div', { class: 'msg-body typing-row' },
          h('div', { class: 'typing' }, h('i'), h('i'), h('i'))
        )
      );
    } else if (!hasContent && !wdFoot && !msg) {
      kids.push(h('div', { class: 'battle-empty-col dim' }, '…'));
    }

    // 官方风格：内容过多时自动折叠为紧凑高度并显示「Show more / 展开更多」，防止撑爆对战双栏
    const colKey = `${chat?.sid || ''}:${msg?.id || pos}`;
    const lineCount = fullText ? fullText.split(/\r?\n/).length : 0;
    const isLongContent = Boolean(fullText.length > 220 || lineCount > 6 || (toolStepCount > 0 && fullText.length > 100) || kids.length > 3);
    const isExpanded = Boolean(this._expandedCols.get(colKey));

    const outerKids = [];
    if (kids.length > 0) {
      if (isLongContent) {
        const contentWrap = h('div', {
          class: 'battle-col-content' + (isExpanded ? ' is-expanded' : ' is-collapsed'),
        }, ...kids);
        const toggleBtn = h('button', {
          type: 'button',
          class: 'battle-show-more-btn',
          onclick: e => {
            e.stopPropagation();
            this._expandedCols.set(colKey, !isExpanded);
            if (typeof UI !== 'undefined' && UI.els?.chat === chat) UI.renderChat(chat, false);
          },
        }, isExpanded ? 'Show less · 收起 ▴' : 'Show more · 展开更多 ▾');
        outerKids.push(contentWrap, toggleBtn);
      } else {
        outerKids.push(...kids);
      }
    }

    if (typeof errBoxEl !== 'undefined' && errBoxEl) outerKids.push(errBoxEl);
    if (liveBanner) outerKids.push(liveBanner);
    if (wdFoot) outerKids.push(wdFoot);

    if (fullText && !isPending) {
      const copyTxt = fullText;
      const footEl = reuseBody?.__footEl || h('div', { class: 'battle-col-foot' },
        h('button', {
          type: 'button',
          class: 'ib xs',
          onclick: () => typeof copyText === 'function' && copyText(footEl.__copyTxt || ''),
        }, typeof icon === 'function' ? icon('copy') : '复制')
      );
      footEl.__copyTxt = copyTxt;
      const btn = footEl.querySelector('button');
      if (btn) btn.title = `复制 (${copyTxt.length} 字)`;
      if (reuseBody) reuseBody.__footEl = footEl;
      outerKids.push(footEl);
    }
    if (typeof patchKids === 'function') patchKids(body, outerKids);
    else body.replaceChildren(...outerKids);
    return body;
  },

  renderBattleThread(chat, threadEl, scrollerEl) {
    if (!threadEl || !chat) return;
    const turns = this.groupTurns(chat.messages || []);
    const els = [];
    const vs = chat.voteState || null;

    turns.forEach((turn, idx) => {
      const isLastTurn = idx === turns.length - 1;
      const isUnverifiedCache = Boolean((chat.cached && !chat.loaded) || chat._recoveringIncomplete);
      const isFailedA = Boolean(turn.a?.status === 'failed' || turn.a?.status === 'error' || turn.a?.failed || turn.a?.webdev?.status === 'build-error');
      const isFailedB = Boolean(turn.b?.status === 'failed' || turn.b?.status === 'error' || turn.b?.failed || turn.b?.webdev?.status === 'build-error');
      const isStreamingA = !isFailedA && Boolean(turn.a?.metadata?.pending || (isLastTurn && isUnverifiedCache && turn.a?._incomplete) || (isLastTurn && chat.busy && (!turn.a || turn.a.status === 'pending' || turn.a.status === 'streaming')));
      const isStreamingB = !isFailedB && Boolean(turn.b?.metadata?.pending || (isLastTurn && isUnverifiedCache && turn.b?._incomplete) || (isLastTurn && chat.busy && (!turn.b || turn.b.status === 'pending' || turn.b.status === 'streaming')));
      const winA = Boolean(vs?.voted && vs?.value === 'model_a');
      const winB = Boolean(vs?.voted && vs?.value === 'model_b');
      const bSid = 'battle:' + (chat.sid || 'cur');
      const msgSig = (m, isStr, pos) => {
        const expKey = `${chat.sid || ''}:${m?.id || pos}`;
        const expFlag = this._expandedCols.get(expKey) ? 1 : 0;
        if (!m) return 'none:' + (isStr ? '1' : '0') + ':' + expFlag;
        const pLen = Array.isArray(m.parts) ? m.parts.length : 0;
        const lastP = pLen ? m.parts[pLen - 1] : null;
        const totTxtLen = Array.isArray(m.parts) ? m.parts.reduce((s, p) => s + (p?.text ? p.text.length : 0) + (p?.inputText ? p.inputText.length : 0) + (p?.state ? p.state.length : 0) + (p?.url ? p.url.length : 0), 0) : 0;
        const mediaSig = Array.isArray(m.parts) ? m.parts.filter(p => p && p.url).map(p => String(p.url).slice(-28)).join(',') : '';
        const attSig = Array.isArray(m.experimental_attachments) ? m.experimental_attachments.map(a => String(a?.url || '').slice(-28)).join(',') : '';
        const wdSig = m.webdev ? `${m.webdev.status || ''}:${m.webdev.files?.length || 0}:${m.webdev.previewUrl || ''}` : '';
        return `${m.id || ''}:${m.v || 0}:${m.status || ''}:${m.genPhase || ''}:${m.failed ? 1 : 0}:${isStr ? 1 : 0}:${pLen}:${lastP?.type || ''}:${(lastP?.text || '').length}:${totTxtLen}:${(m.text || '').length}:${(m.reasoning || '').length}:${mediaSig}:${attSig}:${wdSig}:${expFlag}`;
      };
      const voteSig = `${vs?.voted ? 1 : 0}:${vs?.value || ''}:${vs?.revealed ? 1 : 0}:${vs?.modelAName || ''}:${vs?.modelBName || ''}`;
      const colASig = `${msgSig(turn.a, isStreamingA, 'a')}:${winA ? 1 : 0}:${isLastTurn ? 1 : 0}:${voteSig}`;
      const colBSig = `${msgSig(turn.b, isStreamingB, 'b')}:${winB ? 1 : 0}:${isLastTurn ? 1 : 0}:${voteSig}`;
      const renderCol = (pos, msg, isStreaming, win, colSig) => {
        const cls = `battle-col col-${pos}` + (win ? ' is-winner' : '') + (isStreaming ? ' is-streaming' : '');
        const headSig = `${isStreaming ? 1 : 0}:${msg?.id || ''}:${msg?.status || ''}:${msg?.genPhase || ''}:${msg?.failed ? 1 : 0}:${msg?.modelId || ''}:${voteSig}`;
        if (typeof Seg !== 'undefined' && !Seg.off && typeof patchKids === 'function') {
          const colEl = Seg.box(bSid, `col${pos.toUpperCase()}Box:` + turn.id, () => {
            const bodyEl = h('div', { class: 'battle-col-body' });
            const el = h('div', { class: cls, 'data-pos': pos }, bodyEl);
            el.__body = bodyEl;
            return el;
          });
          if (colEl.__sig === colSig) return colEl;
          colEl.__sig = colSig;
          colEl.className = cls;
          if (msg?.id) colEl.setAttribute('data-message-id', msg.id);
          else colEl.removeAttribute('data-message-id');
          if (colEl.__headSig !== headSig || !colEl.__head) {
            colEl.__head = this.renderColumnHeader(chat, msg, pos, isStreaming, turn);
            colEl.__headSig = headSig;
          }
          this.renderColumnBody(chat, msg, pos, isLastTurn, colEl.__body);
          patchKids(colEl, [colEl.__head, colEl.__body]);
          return colEl;
        }
        return h('div', {
          class: cls,
          'data-pos': pos,
          'data-message-id': msg?.id || null,
        },
          this.renderColumnHeader(chat, msg, pos, isStreaming, turn),
          this.renderColumnBody(chat, msg, pos, isLastTurn)
        );
      };
      const colA = renderCol('a', turn.a, isStreamingA, winA, colASig);
      const colB = renderCol('b', turn.b, isStreamingB, winB, colBSig);
      const userSig = turn.user ? `${turn.user.id || ''}:${turn.user.v || 0}:${(turn.user.text || '').length}` : '0';
      const userEl = turn.user
        ? ((typeof Seg !== 'undefined' && !Seg.off) ? Seg.use(bSid, 'usr:' + turn.id, userSig, () => this.renderUserBubble(turn.user, chat)) : this.renderUserBubble(turn.user, chat))
        : null;

      let turnEl;
      if (typeof Seg !== 'undefined' && !Seg.off && typeof patchKids === 'function') {
        turnEl = Seg.box(bSid, 'turnBox:' + turn.id, () => {
          const g = h('div', { class: 'battle-grid' });
          const tEl = h('div', { class: 'battle-turn', 'data-turn-id': turn.id }, g);
          tEl.__grid = g;
          return tEl;
        });
        patchKids(turnEl.__grid, [colA, colB]);
        patchKids(turnEl, userEl ? [userEl, turnEl.__grid] : [turnEl.__grid]);
      } else {
        turnEl = h('div', {
          class: 'battle-turn',
          'data-turn-id': turn.id,
        },
          userEl,
          h('div', { class: 'battle-grid' }, colA, colB)
        );
      }
      els.push(turnEl);
    });

    if (!turns.length) {
      if (chat.error) {
        els.push(h('div', { class: 'errbar' }, chat.error, h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', onclick: () => chat.load(true) }, '重试')));
      } else if (!chat.loaded || chat.loading) {
        els.push(h('div', { class: 'loading' }, '加载中…'));
      } else {
        els.push(h('div', { class: 'loading dim' }, '暂无消息记录 ', h('button', { class: 'btn ghost sm', onclick: () => chat.load(true) }, '重新加载')));
      }
    }

    const voteBar = this.renderVoteBar(chat);
    if (voteBar) els.push(voteBar);

    if (typeof patchKids === 'function') patchKids(threadEl, els);
    else threadEl.replaceChildren(...els);

    try {
      if (typeof HtmlPreview !== 'undefined' && typeof HtmlPreview.syncEval === 'function') {
        HtmlPreview.syncEval(chat);
      }
    } catch {}
  },

  renderVoteBar(chat) {
    if (!chat || !this.isBattleChat(chat)) return null;
    const turns = this.groupTurns(chat.messages || []);
    const lastTurn = turns.at(-1);
    if (!lastTurn || (!lastTurn.a && !lastTurn.b && !chat.voteState?.voted)) return null;

    if (chat.voteState?.voted) {
      const vs = chat.voteState;
      const aName = vs.modelAName || this.resolveSideModelName(chat, lastTurn?.a, 'a') || 'Model A';
      const bName = vs.modelBName || this.resolveSideModelName(chat, lastTurn?.b, 'b') || 'Model B';
      const verdictMap = {
        model_a: 'A 胜出',
        model_b: 'B 胜出',
        tie: '平局',
        both_bad: '都不佳',
      };
      const vTxt = verdictMap[vs.value] || '已投票';
      return h('div', { class: 'battle-revealed-banner' },
        typeof icon === 'function' ? icon('check') : null,
        h('span', {}, `已揭晓：A = ${aName} · B = ${bName}（${vTxt} · 双方习惯已入库）`)
      );
    }

    const isStreaming = Boolean(
      chat.busy ||
      lastTurn?.a?.metadata?.pending ||
      lastTurn?.b?.metadata?.pending
    );
    const submitting = Boolean(chat.voteState?.submitting);
    const disabled = isStreaming || submitting;

    const handleVote = async (val) => {
      if (!chat || chat.voteState?.submitting || chat.voteState?.voted) return;
      try {
        if (typeof EvalEngine === 'undefined' || typeof EvalEngine.submitVote !== 'function') {
          if (typeof toast === 'function') toast('投票引擎尚未加载', 'err');
          return;
        }
        const res = await EvalEngine.submitVote(chat.sid, val, { messageAId: lastTurn?.a?.id || null, messageBId: lastTurn?.b?.id || null });
        if (res && typeof toast === 'function') {
          toast('A: ' + (res.modelAName || 'A') + ' · B: ' + (res.modelBName || 'B'), 'ok');
        }
        if (typeof UI !== 'undefined') {
          if (UI.els?.chat === chat) UI.renderChat(chat, false);
          UI.renderListSoon?.();
        }
      } catch (err) {
        if (typeof toast === 'function') {
          toast('投票失败：' + (typeof describe === 'function' ? describe(err) : (err?.message || String(err))), 'err');
        }
      }
    };

    const handleSkipVote = () => {
      if (!chat) return;
      chat._voteSkippedTurnId = lastTurn?.user?.id || lastTurn?.a?.id || 'skipped';
      if (typeof toast === 'function') {
        toast('已跳过选择，可直接输入内容继续下一轮对话或视频生成', 'ok');
      }
      try {
        const inp = document.getElementById('in');
        if (inp) inp.focus();
      } catch {}
      if (typeof UI !== 'undefined' && UI.els?.chat === chat) {
        UI.renderChat(chat, false);
      }
    };

    const buttons = [
      {
        val: 'model_a',
        label: 'A 更好',
        title: 'A 更好 (Model A is better)',
        cls: 'vote-a',
        svg: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        iconRight: false,
      },
      {
        val: 'tie',
        label: '都可以',
        title: '都可以 / 平局 (Tie)',
        cls: 'vote-tie',
        svg: '<path d="M5 9h14"/><path d="M5 15h14"/>',
        iconRight: false,
      },
      {
        val: 'both_bad',
        label: '都不行',
        title: '都不行 / 都不佳 (Both are bad)',
        cls: 'vote-bad',
        svg: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        iconRight: false,
      },
      {
        val: 'skip',
        label: '跳过',
        title: '跳过选择，直接继续下一轮对话或视频制作',
        cls: 'vote-skip',
        svg: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
        iconRight: false,
        isSkip: true,
      },
      {
        val: 'model_b',
        label: 'B 更好',
        title: 'B 更好 (Model B is better)',
        cls: 'vote-b',
        svg: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        iconRight: true,
      },
    ];

    return h('div', { class: 'battle-vote-bar' + (submitting ? ' is-submitting' : '') },
      h('div', { class: 'battle-vote-top' },
        h('span', { class: 'battle-vote-hint' },
          this._svgIcon('<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/><path d="M5 13l6 6"/><path d="M4 16l4 4"/><path d="M3 19l2 2"/>'),
          submitting ? '正在提交投票并揭晓模型身份…' : (isStreaming ? '等待 A / B 双方回复完成后即可投票揭晓模型身份…' : '请选择本轮表现更好的模型，投票后立即揭晓 A / B 真实身份并记入习惯库')
        ),
        h('span', { class: 'battle-vote-status' }, submitting ? '揭晓中…' : (isStreaming ? '生成中' : '盲测待揭晓'))
      ),
      h('div', { class: 'battle-vote-btns' },
        ...buttons.map(b =>
          h('button', {
            type: 'button',
            class: 'battle-vote-btn ' + b.cls,
            title: b.title,
            'aria-label': b.title,
            disabled: disabled ? true : null,
            onclick: () => (b.isSkip ? handleSkipVote() : handleVote(b.val)),
          },
          b.iconRight ? h('span', {}, b.label) : this._svgIcon(b.svg),
          b.iconRight ? this._svgIcon(b.svg) : h('span', {}, b.label))
        )
      )
    );
  },

  renderHero(threadEl, defaultSub = '') {
    const mode = (typeof ModeState !== 'undefined' && typeof ModeState.getMode === 'function')
      ? ModeState.getMode()
      : 'agent';
    let subText = defaultSub;
    let titleText = '有什么可以帮你？';
    let heroIcon = null;
    if (mode === 'battle') {
      titleText = 'Battle 双模型匿名盲测';
      subText = '同时向两个匿名模型发送提示词，投票揭晓真实身份并自动学习习惯特征';
      heroIcon = (typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._icon === 'function')
        ? ModeSwitcher._icon('swords')
        : this._svgIcon('<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 6.5 21 18v3h-3L6.5 9.5"/><path d="M5 13l6 6"/><path d="M4 16l4 4"/><path d="M3 19l2 2"/>');
    } else if (mode === 'direct') {
      const dm = (typeof ModeState !== 'undefined' && typeof ModeState.getDirectModel === 'function')
        ? ModeState.getDirectModel()
        : null;
      titleText = dm?.displayName || dm?.publicName || dm?.name || 'Direct 指定模型直连';
      subText = '直接锁定指定模型进行单栏对话，并实时采集本场回复习惯';
      heroIcon = (typeof ModeSwitcher !== 'undefined' && typeof ModeSwitcher._icon === 'function')
        ? ModeSwitcher._icon('directTarget')
        : this._svgIcon('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>');
    }
    const heroEl = h('div', { class: 'hero eval-hero mode-' + mode },
      heroIcon ? h('div', { class: 'eval-hero-ico' }, heroIcon) : null,
      h('div', { class: 'hero-t' }, titleText),
      subText ? h('div', { class: 'hero-s' }, subText) : null
    );
    if (threadEl && typeof threadEl.append === 'function') {
      threadEl.append(heroEl);
    }
    return heroEl;
  },

  formatHistorySubtitle(entry) {
    if (!entry) return '';
    const c = (typeof Chats !== 'undefined' && entry.id) ? Chats.get(entry.id) : null;
    const mode = (typeof ModeState !== 'undefined' && typeof ModeState.inferEntryMode === 'function')
      ? ModeState.inferEntryMode(entry)
      : ((entry.mode === 'direct' || c?.evalMode === 'direct' || (entry.modelAId && !entry.modelBId && entry.mode !== 'battle')) ? 'direct' : 'battle');

    if (mode === 'direct') {
      const rawId = c?.modelAId || entry.modelAId || '';
      const resolved = c?.directModelName
        || (rawId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(rawId, c?.revealedModels || entry.revealedModels || [])
          : rawId)
        || (typeof Models !== 'undefined' && entry.id ? Models.get(entry.id)?.name : '')
        || '';
      return resolved || 'Direct 直连';
    }

    const vs = c?.voteState || null;
    const aId = vs?.modelAId || c?.modelAId || entry.modelAId || '';
    const bId = vs?.modelBId || c?.modelBId || entry.modelBId || '';
    if (vs?.voted || (aId && bId)) {
      const aName = vs?.modelAName
        || (aId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(aId, c?.revealedModels || entry.revealedModels || [])
          : aId)
        || 'A';
      const bName = vs?.modelBName
        || (bId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(bId, c?.revealedModels || entry.revealedModels || [])
          : bId)
        || 'B';
      return `${aName} vs ${bName}`;
    }

    return 'Battle · 匿名盲测';
  },
};
