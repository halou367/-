// Battle 双栏并排对比消息视图、底部四键投票揭晓栏与 Evaluation 辅助渲染器
const evalMd = (text, streaming = false) => {
  const d = h('div', { class: 'md prose' + (streaming ? ' streaming' : ''), lang: '', translate: 'no' });
  const raw = String(text || '');
  if (typeof MD !== 'undefined' && typeof MD.render === 'function') {
    d.innerHTML = MD.render(raw);
  } else {
    d.textContent = raw;
  }
  return d;
};

const EvalView = {
  _openThinks: new Map(),

  isBattleChat(chat) {
    if (!chat) return false;
    if (chat.evalMode === 'battle') return true;
    if (chat.evalMode === 'direct') return false;
    const he = (typeof History !== 'undefined' && typeof History.byId === 'function' && chat.sid) ? History.byId(chat.sid) : null;
    if (he && (he.type === 'evaluation' || he.mode === 'battle' || he.mode === 'direct')) {
      if (he.mode === 'direct' || (he.modelAId && !he.modelBId && he.mode !== 'battle')) return false;
      return true;
    }
    return Boolean(chat.isEvaluation && chat.evalMode !== 'direct');
  },

  isDirectChat(chat) {
    if (!chat) return false;
    if (chat.evalMode === 'direct') return true;
    if (chat.evalMode === 'battle') return false;
    const he = (typeof History !== 'undefined' && typeof History.byId === 'function' && chat.sid) ? History.byId(chat.sid) : null;
    if (he && (he.mode === 'direct' || (he.type === 'evaluation' && he.modelAId && !he.modelBId && he.mode !== 'battle'))) {
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
    if (typeof UI !== 'undefined' && typeof UI.renderUserMsg === 'function') {
      return UI.renderUserMsg(u, chat);
    }
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

  renderOutcomeBadge(voteValue, pos) {
    if (!voteValue) return null;
    if (voteValue === 'model_a') {
      return pos === 'a'
        ? h('span', { class: 'battle-outcome-badge is-win' }, '🏆 胜出')
        : h('span', { class: 'battle-outcome-badge is-lose' }, '未胜出');
    }
    if (voteValue === 'model_b') {
      return pos === 'b'
        ? h('span', { class: 'battle-outcome-badge is-win' }, '🏆 胜出')
        : h('span', { class: 'battle-outcome-badge is-lose' }, '未胜出');
    }
    if (voteValue === 'tie') {
      return h('span', { class: 'battle-outcome-badge is-tie' }, '🤝 平局');
    }
    if (voteValue === 'both_bad') {
      return h('span', { class: 'battle-outcome-badge is-bad' }, '👎 都不佳');
    }
    return null;
  },

  renderColumnHeader(chat, msg, pos, isStreaming) {
    const vs = chat?.voteState || null;
    const isRevealed = Boolean(vs?.voted || msg?.modelId || (pos === 'a' && vs?.modelAName) || (pos === 'b' && vs?.modelBName));
    const head = h('div', { class: 'battle-col-head' });

    if (!isRevealed) {
      head.append(
        h('span', { class: 'battle-badge ' + (pos === 'a' ? 'badge-a' : 'badge-b') }, pos === 'a' ? '🅰️ Model A' : '🅱️ Model B'),
        h('span', { class: 'battle-anon-tag' + (isStreaming ? ' is-streaming' : '') }, isStreaming ? '正在生成…' : '匿名盲测中')
      );
      return head;
    }

    const realName = this.resolveSideModelName(chat, msg, pos) || (pos === 'a' ? 'Model A' : 'Model B');
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(realName) : '';
    const logoEl = (vid && typeof vlogo === 'function')
      ? vlogo(vid, 18)
      : h('span', { class: 'battle-badge ' + (pos === 'a' ? 'badge-a' : 'badge-b') }, pos === 'a' ? '🅰️' : '🅱️');

    head.append(
      h('span', { class: 'battle-side-tag ' + (pos === 'a' ? 'tag-a' : 'tag-b') }, pos === 'a' ? 'A' : 'B'),
      logoEl,
      h('b', { class: 'battle-real-name', title: realName }, realName),
      h('span', { class: 'grow' }),
      this.renderOutcomeBadge(vs?.value, pos)
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
    const secStr = thinkMs > 0 ? ` · ${(thinkMs / 1000).toFixed(1)}s` : '';
    const titleTxt = partStreaming ? `思考过程中${secStr}…` : `思考过程${secStr}`;

    const det = h('details', {
      class: 'think-box reason not-prose' + (partStreaming ? ' is-streaming' : ''),
      open: isOpen ? '' : null,
    },
      h('summary', { class: 'think-box-sum', role: 'button' },
        typeof icon === 'function' ? icon('brain') : null,
        h('span', { class: 'think-box-title rs-t' }, titleTxt),
        partStreaming ? h('i', { class: 'think-pulse', 'aria-hidden': 'true' }) : null
      ),
      h('div', { class: 'think-box-body md prose muted', lang: '', translate: 'no' },
        txt ? evalMd(txt, partStreaming) : h('span', { class: 'dim' }, '正在思考…')
      )
    );
    det.addEventListener('toggle', () => {
      this._openThinks.set(thinkKey, det.open);
    });
    return det;
  },

  renderMediaPart(part) {
    const url = part?.url || part?.image || part?.src || '';
    if (!url) return null;
    const isVideo = part?.type === 'video' || /^video\//i.test(part?.contentType || part?.mediaType || '') || /\.(mp4|webm|mov)(\?|$)/i.test(url);
    if (isVideo) {
      return h('div', { class: 'eval-media-wrap eval-video-wrap' },
        h('video', {
          class: 'eval-media-video',
          controls: true,
          playsinline: true,
          preload: 'metadata',
          src: url,
          poster: part?.thumbnailUrl || null,
        }),
        h('div', { class: 'eval-media-bar' },
          h('span', { class: 'dim' }, '🎬 生成视频'),
          h('a', { class: 'btn xs ghost eval-media-dl', href: url, download: 'battle-video.mp4', target: '_blank', rel: 'noopener' }, '下载视频')
        )
      );
    }
    const imgEl = h('img', {
      class: 'eval-media-img file-img zimg',
      src: url,
      alt: part?.alt || 'Generated image',
      loading: 'lazy',
      onclick: e => {
        if (typeof ImgView !== 'undefined' && typeof ImgView.open === 'function') {
          ImgView.open(url, '生成图片', e.currentTarget);
        }
      },
    });
    return h('div', { class: 'eval-media-wrap eval-image-wrap' },
      imgEl,
      h('div', { class: 'eval-media-bar' },
        h('span', { class: 'dim' }, '🖼️ 生成图片'),
        h('button', {
          type: 'button',
          class: 'btn xs ghost eval-media-dl',
          onclick: e => {
            e.stopPropagation();
            if (typeof ImgAct !== 'undefined' && typeof ImgAct.save === 'function') {
              ImgAct.save(url, 'battle-image.png', imgEl);
            } else {
              window.open(url, '_blank');
            }
          },
        }, '保存图片')
      )
    );
  },

  renderSourcesPart(sources) {
    const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
    if (!list.length) return null;
    return h('div', { class: 'eval-sources' },
      h('div', { class: 'eval-sources-title' }, '🌐 引用来源 (' + list.length + ')'),
      h('div', { class: 'eval-sources-list' },
        ...list.slice(0, 16).map((s, idx) => {
          const href = s.url || s.link || s.href || '#';
          let domain = '';
          try { domain = new URL(href).hostname.replace(/^www\./, ''); } catch {}
          const label = s.title || domain || ('来源 #' + (idx + 1));
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

  renderColumnBody(chat, msg, pos, isLastTurn) {
    const body = h('div', { class: 'battle-col-body' });
    const isPending = Boolean(msg?.metadata?.pending || (isLastTurn && chat?.busy && (!msg || msg.status === 'pending')));
    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    let hasContent = false;
    let fullText = '';

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || !p.type) continue;
      if (p.type === 'reasoning') {
        const th = this.renderThinkPart(p, msg, pos, isPending);
        if (th) { body.append(th); hasContent = true; }
      } else if (p.type === 'text') {
        const txt = String(p.text || '');
        if (!txt.trim()) continue;
        fullText += (fullText ? '\n' : '') + txt;
        const streaming = Boolean(isPending && p.state === 'streaming');
        if (typeof R !== 'undefined' && typeof R.text === 'function') {
          body.append(R.text(p, streaming, msg, chat, (msg?.id || pos) + ':t' + i));
        } else {
          body.append(evalMd(txt, streaming));
        }
        hasContent = true;
      } else if (p.type === 'image' || p.type === 'video' || (p.type === 'file' && /^(image|video)\//i.test(p.mediaType || p.contentType || ''))) {
        const mediaEl = this.renderMediaPart(p);
        if (mediaEl) { body.append(mediaEl); hasContent = true; }
      } else if (p.type === 'sources' && Array.isArray(p.sources)) {
        const srcEl = this.renderSourcesPart(p.sources);
        if (srcEl) { body.append(srcEl); hasContent = true; }
      } else if (p.type === 'source-url') {
        const srcEl = this.renderSourcesPart([p]);
        if (srcEl) { body.append(srcEl); hasContent = true; }
      } else if (p.type === 'error') {
        body.append(h('div', { class: 'eval-error-box' }, '⚠️ ' + String(p.text || '生成异常')));
        hasContent = true;
      }
    }

    // Fallback: attachments or sources directly on msg
    if (Array.isArray(msg?.experimental_attachments) && msg.experimental_attachments.length && !parts.some(p => p.type === 'image' || p.type === 'video')) {
      for (const att of msg.experimental_attachments) {
        const mediaEl = this.renderMediaPart({
          type: /^video\//i.test(att.contentType || '') ? 'video' : 'image',
          url: att.url,
          contentType: att.contentType,
        });
        if (mediaEl) { body.append(mediaEl); hasContent = true; }
      }
    }
    if (Array.isArray(msg?.sources) && msg.sources.length && !parts.some(p => p.type === 'sources')) {
      const srcEl = this.renderSourcesPart(msg.sources);
      if (srcEl) { body.append(srcEl); hasContent = true; }
    }

    if (msg?.status === 'failed' || msg?.failed) {
      body.append(h('div', { class: 'eval-error-box' }, '⚠️ ' + String(msg.failureReason || msg.errorText || '生成失败')));
      hasContent = true;
    }

    if (!hasContent && isPending) {
      body.append(
        h('div', { class: 'msg-body typing-row' },
          h('div', { class: 'typing' }, h('i'), h('i'), h('i')),
          h('span', { class: 'typing-st' }, pos === 'a' ? 'Model A 正在生成…' : 'Model B 正在生成…')
        )
      );
    } else if (!hasContent && !msg) {
      body.append(h('div', { class: 'battle-empty-col dim' }, '等待回复…'));
    }

    if (fullText) {
      const copyTxt = fullText;
      body.append(
        h('div', { class: 'battle-col-foot' },
          h('button', {
            type: 'button',
            class: 'ib xs',
            title: '复制此栏回复',
            onclick: () => typeof copyText === 'function' && copyText(copyTxt),
          }, typeof icon === 'function' ? icon('copy') : '复制'),
          h('span', { class: 'dim' }, `${copyTxt.length} 字`)
        )
      );
    }

    return body;
  },

  renderBattleThread(chat, threadEl, scrollerEl) {
    if (!threadEl || !chat) return;
    const turns = this.groupTurns(chat.messages || []);
    const els = [];
    const vs = chat.voteState || null;

    turns.forEach((turn, idx) => {
      const isLastTurn = idx === turns.length - 1;
      const isStreamingA = Boolean(turn.a?.metadata?.pending || (isLastTurn && chat.busy && (!turn.a || turn.a.status === 'pending')));
      const isStreamingB = Boolean(turn.b?.metadata?.pending || (isLastTurn && chat.busy && (!turn.b || turn.b.status === 'pending')));
      const winA = vs?.voted && vs?.value === 'model_a';
      const winB = vs?.voted && vs?.value === 'model_b';

      const colA = h('div', {
        class: 'battle-col col-a' + (winA ? ' is-winner' : '') + (isStreamingA ? ' is-streaming' : ''),
        'data-pos': 'a',
        'data-message-id': turn.a?.id || null,
      },
        this.renderColumnHeader(chat, turn.a, 'a', isStreamingA),
        this.renderColumnBody(chat, turn.a, 'a', isLastTurn)
      );

      const colB = h('div', {
        class: 'battle-col col-b' + (winB ? ' is-winner' : '') + (isStreamingB ? ' is-streaming' : ''),
        'data-pos': 'b',
        'data-message-id': turn.b?.id || null,
      },
        this.renderColumnHeader(chat, turn.b, 'b', isStreamingB),
        this.renderColumnBody(chat, turn.b, 'b', isLastTurn)
      );

      const turnEl = h('div', {
        class: 'battle-turn',
        'data-turn-id': turn.id,
      },
        turn.user ? this.renderUserBubble(turn.user, chat) : null,
        h('div', { class: 'battle-grid' }, colA, colB)
      );
      els.push(turnEl);
    });

    const voteBar = this.renderVoteBar(chat);
    if (voteBar) els.push(voteBar);

    threadEl.replaceChildren(...els);
  },

  renderVoteBar(chat) {
    if (!chat || !this.isBattleChat(chat)) return null;
    const turns = this.groupTurns(chat.messages || []);
    const lastTurn = turns.at(-1);
    if (!lastTurn || (!lastTurn.a && !lastTurn.b && !chat.voteState?.voted)) return null;

    if (chat.voteState?.voted) {
      const aName = chat.voteState.modelAName || this.resolveSideModelName(chat, lastTurn?.a, 'a') || 'Model A';
      const bName = chat.voteState.modelBName || this.resolveSideModelName(chat, lastTurn?.b, 'b') || 'Model B';
      return h('div', { class: 'battle-revealed-banner', role: 'status' },
        h('span', { class: 'battle-revealed-text' },
          `✓ 已投票揭晓 · 🅰️ ${aName}  vs  🅱️ ${bName} · 双方回复习惯已自动打标写入习惯指纹库`
        )
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
        const res = await EvalEngine.submitVote(chat.sid, val);
        if (res && typeof toast === 'function') {
          toast('🎉 身份已揭晓！A: ' + (res.modelAName || 'Model A') + ' | B: ' + (res.modelBName || 'Model B') + '（习惯已自动入库）', 'ok');
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

    const buttons = [
      { val: 'model_a', label: '👈 A 更好 (Model A)', cls: 'vote-a' },
      { val: 'tie', label: '🤝 平局 (Tie)', cls: 'vote-tie' },
      { val: 'both_bad', label: '👎 都不好 (Both Bad)', cls: 'vote-bad' },
      { val: 'model_b', label: '👉 B 更好 (Model B)', cls: 'vote-b' },
    ];

    return h('div', { class: 'battle-vote-bar' + (submitting ? ' is-submitting' : '') },
      h('div', { class: 'battle-vote-hint' },
        submitting
          ? '⏳ 正在提交投票并揭晓双方真实模型身份…'
          : isStreaming
            ? '⏳ 双方模型正在生成回复，完成后可投票揭晓真实模型并自动入库习惯：'
            : '⚔️ 盲测完成，请投票揭晓双方真实模型（揭晓后自动将双方回复习惯打标入库）：'
      ),
      h('div', { class: 'battle-vote-btns' },
        ...buttons.map(b =>
          h('button', {
            type: 'button',
            class: 'battle-vote-btn ' + b.cls,
            disabled: disabled ? true : null,
            onclick: () => handleVote(b.val),
          }, b.label)
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
    if (mode === 'battle') {
      const mod = (typeof ModeState !== 'undefined' && typeof ModeState.getModality === 'function')
        ? String(ModeState.getModality() || 'chat').toUpperCase()
        : 'CHAT';
      subText = `⚔️ Battle 匿名双模型盲测模式 · 当前模态：${mod} · 投票揭晓后自动学习双方习惯`;
    } else if (mode === 'direct') {
      const dm = (typeof ModeState !== 'undefined' && typeof ModeState.getDirectModel === 'function')
        ? ModeState.getDirectModel()
        : null;
      const dmName = dm?.displayName || dm?.publicName || dm?.name || '默认模型';
      subText = `🎯 Direct 单模型直连模式 · 当前模型：${dmName}`;
    }
    const heroEl = h('div', { class: 'hero eval-hero mode-' + mode },
      h('div', { class: 'hero-t' }, titleText),
      h('div', { class: 'hero-s' }, subText)
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
        || '直连模型';
      return `🎯 Direct · ${resolved}`;
    }

    const vs = c?.voteState || null;
    const aId = vs?.modelAId || c?.modelAId || entry.modelAId || '';
    const bId = vs?.modelBId || c?.modelBId || entry.modelBId || '';
    if (vs?.voted || (aId && bId)) {
      const aName = vs?.modelAName
        || (aId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(aId, c?.revealedModels || entry.revealedModels || [])
          : aId)
        || 'Model A';
      const bName = vs?.modelBName
        || (bId && typeof ModelCatalog !== 'undefined' && typeof ModelCatalog.resolveModelName === 'function'
          ? ModelCatalog.resolveModelName(bId, c?.revealedModels || entry.revealedModels || [])
          : bId)
        || 'Model B';
      return `⚔️ ${aName} vs ${bName}`;
    }

    const mod = c?.modality || entry.modality || 'chat';
    return `⚔️ Battle · ${mod}`;
  },
};
