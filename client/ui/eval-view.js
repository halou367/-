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

  isBattleEntry(entry = null, chat = null, tab = null) {
    if (chat && this.isBattleChat(chat)) return true;
    if (entry) {
      if (entry.mode === 'direct') return false;
      if (entry.mode === 'battle' || entry.mode === 'direct-battle' || entry.mode === 'side-by-side') return true;
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
    const isGenerating = Boolean(
      c && (
        c.busy ||
        c.streaming ||
        c._evalStreaming ||
        c.status === 'submitted' ||
        c.status === 'streaming' ||
        c.voteState?.submitting ||
        (Array.isArray(c.messages) && c.messages.some(m => m && m.role === 'assistant' && m.metadata?.pending))
      )
    );
    if (isGenerating) return '生成中';

    const mi = (sid && typeof Models !== 'undefined' && typeof Models.get === 'function') ? Models.get(sid) : null;
    const isCompleted = Boolean(
      c?.voteState?.voted ||
      (c?.modelAId && c?.modelBId) ||
      (e?.modelAId && e?.modelBId) ||
      (Array.isArray(c?.pairwiseFeedbacks) && c.pairwiseFeedbacks.length > 0) ||
      mi?.battleRevealed
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

    if (typeof Seg !== 'undefined' && !Seg.off && typeof StreamMD !== 'undefined') {
      const det = Seg.box('eval', thinkKey + ':det', () => {
        const titleSpan = h('span', { class: 'think-box-title rs-t', hidden: true });
        const pulseEl = h('i', { class: 'think-pulse', 'aria-hidden': 'true', hidden: true });
        const bodyBox = h('div', { class: 'think-box-body md prose muted', lang: '', translate: 'no' });
        const dEl = h('details', { class: 'think-box reason not-prose', open: isOpen ? '' : null },
          h('summary', { class: 'think-box-sum', role: 'button', title: '思考过程' },
            typeof icon === 'function' ? icon('brain') : null,
            titleSpan,
            pulseEl
          ),
          bodyBox
        );
        dEl.__titleSpan = titleSpan;
        dEl.__pulseEl = pulseEl;
        dEl.__bodyBox = bodyBox;
        dEl.addEventListener('toggle', () => {
          this._openThinks.set(thinkKey, dEl.open);
        });
        return dEl;
      });
      det.classList.toggle('is-streaming', partStreaming);
      if (this._openThinks.has(thinkKey)) det.open = Boolean(this._openThinks.get(thinkKey));
      if (det.__titleSpan) {
        det.__titleSpan.hidden = !secStr;
        if (secStr && det.__titleSpan.textContent !== secStr) det.__titleSpan.textContent = secStr;
      }
      if (det.__pulseEl) det.__pulseEl.hidden = !partStreaming;
      if (det.__bodyBox) StreamMD.paint(det.__bodyBox, txt || '…', partStreaming);
      return det;
    }

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
        txt ? evalMd(txt, partStreaming, thinkKey) : h('span', { class: 'dim' }, '…')
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
  renderColumnBody(chat, msg, pos, isLastTurn, reuseBody = null) {
    const body = reuseBody || h('div', { class: 'battle-col-body' });
    const kids = [];
    const isPending = Boolean(msg?.metadata?.pending || (isLastTurn && chat?.busy && (!msg || msg.status === 'pending')));
    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    let hasContent = false;
    let fullText = '';

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || !p.type) continue;
      if (p.type === 'reasoning') {
        const th = this.renderThinkPart(p, msg, pos, isPending);
        if (th) { kids.push(th); hasContent = true; }
      } else if (p.type === 'text') {
        const txt = String(p.text || '');
        if (!txt.trim()) continue;
        fullText += (fullText ? '\n' : '') + txt;
        const streaming = Boolean(isPending && p.state === 'streaming');
        if (typeof R !== 'undefined' && typeof R.text === 'function') {
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

    if (msg?.status === 'failed' || msg?.failed) {
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
      kids.push(
        h('div', { class: 'eval-error-box', style: 'display:flex;align-items:center;gap:8px' },
          typeof icon === 'function' ? icon('alert') : null,
          h('span', {}, String(msg.failureReason || msg.errorText || '生成失败')),
          inlineRetryBtn
        )
      );
      hasContent = true;
    }

    if (!hasContent && isPending) {
      kids.push(
        h('div', { class: 'msg-body typing-row' },
          h('div', { class: 'typing' }, h('i'), h('i'), h('i'))
        )
      );
    } else if (!hasContent && !msg) {
      kids.push(h('div', { class: 'battle-empty-col dim' }, '…'));
    }

    if (fullText) {
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
      kids.push(footEl);
    }
    if (typeof patchKids === 'function') patchKids(body, kids);
    else body.replaceChildren(...kids);
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
      const bSid = 'battle:' + (chat.sid || 'cur');
      const msgSig = (m, isStr) => {
        if (!m) return 'none:' + (isStr ? '1' : '0');
        const pLen = Array.isArray(m.parts) ? m.parts.length : 0;
        const lastP = pLen ? m.parts[pLen - 1] : null;
        return `${m.id || ''}:${m.v || 0}:${m.status || ''}:${m.failed ? 1 : 0}:${isStr ? 1 : 0}:${pLen}:${lastP?.type || ''}:${(lastP?.text || '').length}:${(m.text || '').length}:${(m.reasoning || '').length}`;
      };
      const voteSig = `${vs?.voted ? 1 : 0}:${vs?.value || ''}:${vs?.revealed ? 1 : 0}:${vs?.modelAName || ''}:${vs?.modelBName || ''}`;
      const colASig = `${msgSig(turn.a, isStreamingA)}:${winA ? 1 : 0}:${isLastTurn ? 1 : 0}:${voteSig}`;
      const colBSig = `${msgSig(turn.b, isStreamingB)}:${winB ? 1 : 0}:${isLastTurn ? 1 : 0}:${voteSig}`;
      const renderCol = (pos, msg, isStreaming, win, colSig) => {
        const cls = `battle-col col-${pos}` + (win ? ' is-winner' : '') + (isStreaming ? ' is-streaming' : '');
        const headSig = `${isStreaming ? 1 : 0}:${msg?.id || ''}:${msg?.status || ''}:${msg?.failed ? 1 : 0}:${msg?.modelId || ''}:${voteSig}`;
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
