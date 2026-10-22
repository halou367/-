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
    const btn = h('button', {
      type: 'button',
      class: 'battle-regen-btn' + (prominent ? ' is-prominent' : '') + (isStreaming ? ' is-loading' : ''),
      title: isStreaming ? '正在生成中 · 点击可中止并重新生成本轮回复' : '模型加载异常或未响应时，点击重新生成本轮回复',
      'aria-label': '重新生成',
      onclick: async e => {
        e.stopPropagation();
        if (!chat) return;
        btn.classList.add('is-loading');
        try {
          if (typeof EvalEngine !== 'undefined' && typeof EvalEngine.regenerateTurn === 'function') {
            if (typeof toast === 'function') toast('正在重新生成本轮回复…');
            await EvalEngine.regenerateTurn(chat, { turn, pos });
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
        : this._svgIcon('<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>'),
      h('span', { class: 'regen-txt' }, isStreaming ? '重连' : '重新生成')
    );
    return btn;
  },

  renderColumnHeader(chat, msg, pos, isStreaming, turn) {
    const vs = chat?.voteState || null;
    const isRevealed = Boolean(vs?.voted || msg?.modelId || (pos === 'a' && vs?.modelAName) || (pos === 'b' && vs?.modelBName));
    const head = h('div', { class: 'battle-col-head' });
    const sideLabel = pos === 'a' ? 'A' : 'B';

    if (!isRevealed) {
      head.append(
        h('span', { class: 'battle-side-tag', title: 'Model ' + sideLabel }, sideLabel),
        h('span', { class: 'battle-col-title' }, 'Model ' + sideLabel),
        isStreaming
          ? h('span', { class: 'battle-anon-tag is-streaming' }, h('i', { class: 'think-pulse', title: '生成中…' }), '生成中…')
          : h('span', { class: 'battle-anon-tag' }, '匿名盲测'),
        h('span', { class: 'grow' }),
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
      h('span', { class: 'grow' }),
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

    const det = h('details', {
      class: 'think-box reason not-prose' + (partStreaming ? ' is-streaming' : ''),
      open: isOpen ? '' : null,
    },
      h('summary', { class: 'think-box-sum', role: 'button', title: '思考过程' },
        typeof icon === 'function' ? icon('brain') : null,
        secStr ? h('span', { class: 'think-box-title rs-t' }, secStr) : null,
        partStreaming ? h('i', { class: 'think-pulse', 'aria-hidden': 'true' }) : null
      ),
      h('div', { class: 'think-box-body md prose muted', lang: '', translate: 'no' },
        txt ? evalMd(txt, partStreaming) : h('span', { class: 'dim' }, '…')
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
          h('a', { class: 'ib xs eval-media-dl', href: url, download: 'battle-video.mp4', target: '_blank', rel: 'noopener', title: '下载视频' }, typeof icon === 'function' ? icon('dl') : '↓')
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
          ImgView.open(url, '图片', e.currentTarget);
        }
      },
    });
    return h('div', { class: 'eval-media-wrap eval-image-wrap' },
      imgEl,
      h('div', { class: 'eval-media-bar' },
        h('button', {
          type: 'button',
          class: 'ib xs eval-media-dl',
          title: '保存图片',
          onclick: e => {
            e.stopPropagation();
            if (typeof ImgAct !== 'undefined' && typeof ImgAct.save === 'function') {
              ImgAct.save(url, 'battle-image.png', imgEl);
            } else {
              window.open(url, '_blank');
            }
          },
        }, typeof icon === 'function' ? icon('dl') : '↓')
      )
    );
  },

  renderSourcesPart(sources) {
    const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
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
        body.append(h('div', { class: 'eval-error-box' }, typeof icon === 'function' ? icon('alert') : null, h('span', {}, String(p.text || '生成异常'))));
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
      body.append(h('div', { class: 'eval-error-box' }, typeof icon === 'function' ? icon('alert') : null, h('span', {}, String(msg.failureReason || msg.errorText || '生成失败'))));
      hasContent = true;
    }

    if (!hasContent && isPending) {
      body.append(
        h('div', { class: 'msg-body typing-row' },
          h('div', { class: 'typing' }, h('i'), h('i'), h('i'))
        )
      );
    } else if (!hasContent && !msg) {
      body.append(h('div', { class: 'battle-empty-col dim' }, '…'));
    }

    if (fullText) {
      const copyTxt = fullText;
      body.append(
        h('div', { class: 'battle-col-foot' },
          h('button', {
            type: 'button',
            class: 'ib xs',
            title: `复制 (${copyTxt.length} 字)`,
            onclick: () => typeof copyText === 'function' && copyText(copyTxt),
          }, typeof icon === 'function' ? icon('copy') : '复制')
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
      const winA = Boolean(vs?.voted && vs?.value === 'model_a');
      const winB = Boolean(vs?.voted && vs?.value === 'model_b');

      const colA = h('div', {
        class: 'battle-col col-a' + (winA ? ' is-winner' : '') + (isStreamingA ? ' is-streaming' : ''),
        'data-pos': 'a',
        'data-message-id': turn.a?.id || null,
      },
        this.renderColumnHeader(chat, turn.a, 'a', isStreamingA, turn),
        this.renderColumnBody(chat, turn.a, 'a', isLastTurn)
      );

      const colB = h('div', {
        class: 'battle-col col-b' + (winB ? ' is-winner' : '') + (isStreamingB ? ' is-streaming' : ''),
        'data-pos': 'b',
        'data-message-id': turn.b?.id || null,
      },
        this.renderColumnHeader(chat, turn.b, 'b', isStreamingB, turn),
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
        const res = await EvalEngine.submitVote(chat.sid, val);
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
        label: '平局',
        title: '平局 (Tie)',
        cls: 'vote-tie',
        svg: '<path d="M5 9h14"/><path d="M5 15h14"/>',
        iconRight: false,
      },
      {
        val: 'both_bad',
        label: '都不佳',
        title: '都不佳 (Both are bad)',
        cls: 'vote-bad',
        svg: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        iconRight: false,
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
            onclick: () => handleVote(b.val),
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
