  thinkGuard(p) {
    if ((typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(this)) || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(this))) return;
    if (Fingerprint.isRunning(this) || Prefs.thinkStop === false || this._allowOpenThink || this._hadOpenThinkStop || this.stopReq || this.thinkStopped || !this.busy) return;
    const isOpenTcId = id => /^(?:call_\d+_|call_[0-9a-f]{24}$|functions\.|_\d+_[0-9a-f]{6,}|chatcmpl-tool-)/i.test(String(id || ''));
    const isClosedTcId = id => { const s = String(id || ''); return /^(?:toolu_|srvtoolu_|msg_01)/i.test(s) || (/^call_[A-Za-z0-9_-]{20,}$/.test(s) && !isOpenTcId(s)); };
    if ((this.live?.parts || []).some(lp => lp && lp.toolCallId && lp.state === 'output-available')) {
      if (!this._closedLockedModel && !(this.live?.parts || []).some(lp => isClosedTcId(lp?.toolCallId)) && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
        try { BillingProbe.markAsOpenSourceModel(this); } catch {}
      }
      return;
    }
    const priorMsgs = (this.messages || []).filter(m => m && m.role === 'assistant' && m !== this.live && !m.metadata?.pending);
    let priorHadClosed = false, priorHadOpenThink = false;
    const mName = String((typeof Models !== 'undefined' && Models.get(this.sid)?.name) || this._routeBaseline?.label || '');
    if (mName && !/开源|compat|qwen|deepseek|glm|kimi|minimax|llama|mistral|nemotron|inkling|beam|caveman|gemma|step-|hy4|mimo/i.test(mName)) priorHadClosed = true;
    if (priorMsgs.length >= 1) {
      const firstAsst = priorMsgs[0];
      const firstHadOpen = Boolean(firstAsst?.metadata?.openThinkStopped || (firstAsst?.parts || []).some(pp => (pp?.type === 'reasoning' && /[^\s.…·。]/.test(String(pp.text || ''))) || isOpenTcId(pp?.toolCallId)));
      const firstHadClosed = (firstAsst?.parts || []).some(pp => (pp?.type === 'reasoning' && !/[^\s.…·。]/.test(String(pp.text || ''))) || isClosedTcId(pp?.toolCallId));
      if (!firstHadOpen && firstHadClosed) priorHadClosed = true;
    }
    for (const pm of priorMsgs) {
      if (pm?.metadata?.openThinkStopped) priorHadOpenThink = true;
      for (const pp of pm.parts || []) {
        if (pp.type === 'reasoning') {
          if (/[^\s.…·。]/.test(String(pp.text || ''))) priorHadOpenThink = true;
          else priorHadClosed = true;
        }
        if (pp.toolCallId && isClosedTcId(pp.toolCallId)) priorHadClosed = true;
        if (pp.toolCallId && isOpenTcId(pp.toolCallId)) priorHadOpenThink = true;
      }
    }
    if (priorHadOpenThink && !this.gacha) {
      this._allowOpenThink = true;
      if (!priorHadClosed && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
        try { BillingProbe.markAsOpenSourceModel(this); } catch {}
      }
      return;
    }
    if (!priorHadClosed && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
      try { BillingProbe.markAsOpenSourceModel(this, { silent: true }); } catch {}
    }
    if (!this.gacha) return;
    this.thinkStopped = true; this.routedThink = true; this._routePaused = true; this._hadOpenThinkStop = true;
    if (this.live) this.live.metadata = { ...(this.live.metadata || {}), openThinkStopped: true };
    // 出现开源思考（路由开源模型），自动暂停
    const isGachaPause = Boolean(this.gacha || (typeof Gacha !== 'undefined' && (Gacha.isGachaChat?.(this.sid) || Gacha.sidNo?.(this.sid))));
    this.phase = isGachaPause ? '抽卡到开源思考已经暂停' : '路由到开源模型已暂停';
    Trace.note?.(this.sid, this.phase, 'warn');
    toast(this.phase, 'err');
    setTimeout(() => this.stop(), 0);
  }
  checkMidStreamRoute(t, ch) {
    if (!this.busy || this.stopReq || this.gacha || Fingerprint.isRunning(this)) return;
    const curTurnKey = String(this.live?.id || (this.messages || []).length || '');
    if (this._midRouteTurnKey !== curTurnKey) {
      this._midRouteTurnKey = curTurnKey;
      this._midRouteChecked = false;
      this._midRoutePrompted = false;
    }
    if (this._midRoutePrompted) return;
    const priorMsgs = (this.messages || []).filter(m => m && m.role === 'assistant' && m !== this.live && !m.metadata?.pending);
    let priorToolFam = '', priorHiddenThink = false;
    const isOpenTcId = id => /^(?:call_\d+_|call_[0-9a-f]{24}$|functions\.|_\d+_[0-9a-f]{6,}|chatcmpl-tool-)/i.test(String(id || ''));
    const isStrictOpenAiToolId = id => (/^(?:tc|fc)_[A-Za-z0-9_-]{16,}$/i.test(String(id || '')) || (/^call_[A-Za-z0-9_-]{18,}$/.test(String(id || '')) && !isOpenTcId(id)));
    for (const pm of priorMsgs) {
      for (const pp of pm.parts || []) {
        if (pp.type === 'reasoning' && !/[^\s.…·。]/.test(String(pp.text || ''))) priorHiddenThink = true;
        if (pp.toolCallId) {
          if (/^(?:toolu_|srvtoolu_|msg_01)/i.test(pp.toolCallId)) priorToolFam = 'claude';
          else if (isStrictOpenAiToolId(pp.toolCallId)) priorToolFam = 'openai';
        }
      }
    }
    if (!priorToolFam && this.live?.parts?.length) {
      for (const lp of this.live.parts) {
        if (lp?.toolCallId && lp.toolCallId !== ch?.toolCallId) {
          if (/^(?:toolu_|srvtoolu_|msg_01)/i.test(lp.toolCallId)) { priorToolFam = 'claude'; break; }
          if (isStrictOpenAiToolId(lp.toolCallId)) { priorToolFam = 'openai'; break; }
        }
      }
    }
    const baseLabel = this._routeBaseline?.label || (typeof Models !== 'undefined' && Models.get(this.sid)?.name) || '';
    if (!priorToolFam && baseLabel) {
      if (/claude|opus|sonnet|haiku|fable/i.test(baseLabel)) priorToolFam = 'claude';
      else if (/gpt|\bsol\b|\bluna\b|\bastra\b|\bterra\b/i.test(baseLabel)) priorToolFam = 'openai';
      else if (/gemini|argon|barium|carbon/i.test(baseLabel)) priorToolFam = 'google';
    }
    if (!priorMsgs.length && !priorToolFam) return;
    const priorClosed = Boolean(priorToolFam || priorHiddenThink || (baseLabel && !/开源|compat|qwen|deepseek|glm|kimi|minimax|llama|mistral|nemotron|inkling|beam|caveman|gemma|step-|hy4|mimo/i.test(baseLabel)));
    if (priorClosed && ((t === 'reasoning-delta' && /[^\s.…·。]/.test(String(ch?.delta || ''))) || (t === 'tool-input-start' && isOpenTcId(ch?.toolCallId)))) {
      this._midRoutePrompted = true;
      const fromLbl = baseLabel || (priorToolFam === 'claude' ? 'Claude 系列' : priorToolFam === 'openai' ? 'GPT 系列' : '闭源模型');
      const fmtGuess = this.fmt && typeof Fmt !== 'undefined' ? String(Fmt.guess(this.fmt)?.name || '').trim() : '';
      const toLbl = (fmtGuess && !/未知|闭源/i.test(fmtGuess)) ? fmtGuess : '开源模型';
      this.routed = true;
      this.routeFrom = fromLbl;
      this.routeTo = toLbl;
      if (this.live) {
        const turnIdx = priorMsgs.length + 1;
        this.live._routeNotice = {
          type: 'model',
          fromTurn: 1,
          toTurn: turnIdx,
          fromLabel: fromLbl,
          toLabel: toLbl,
          text: `路由提示：对话由 ${fromLbl} 路由至 ${toLbl}`,
        };
        this.lastRouteNotice = this.live._routeNotice;
      }
      try {
        if (typeof Models !== 'undefined' && this.sid) {
          const curM = Models.get(this.sid) || {};
          Models.put(this.sid, { ...curM, name: toLbl, routed: true, routeFrom: fromLbl, routeTo: toLbl, routeType: 'model' });
        }
      } catch {}
      if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
        void RouteConfirm.askModelRoute(this, {
          routeType: 'model',
          fromLabel: fromLbl,
          toLabel: toLbl,
          reason: t === 'reasoning-delta' ? '前序轮次为闭源模型，本轮出现明文思考，检测到路由至开源模型' : '前序轮次为闭源模型，本轮出现开源工具调用前缀',
        });
      }
      return;
    }
    if ((t === 'tool-input-start' || t === 'text-delta' || t === 'reasoning-delta') && priorToolFam) {
      let curToolFam = '';
      if (t === 'tool-input-start' && ch?.toolCallId) {
        curToolFam = /^(?:toolu_|srvtoolu_|msg_01)/i.test(ch.toolCallId) ? 'claude' : (isStrictOpenAiToolId(ch.toolCallId) ? 'openai' : '');
      } else if (this.fmt?.ids?.length) {
        const lastPair = this.fmt.ids.at(-1);
        const lastId = String(Array.isArray(lastPair) ? lastPair[1] : lastPair || '');
        if (/^(?:toolu_|srvtoolu_|msg_01[1-9A-HJ-NP-Za-km-z]{18,})/i.test(lastId)) curToolFam = 'claude';
        else if (/^(?:rs|fc|fo|tc)_[A-Za-z0-9_-]{16,}/i.test(lastId)) curToolFam = 'openai';
      }
      if (curToolFam && curToolFam !== priorToolFam) {
        this._midRoutePrompted = true;
        const fromLbl = baseLabel || (priorToolFam === 'claude' ? 'Claude 系列' : priorToolFam === 'openai' ? 'GPT 系列' : 'Gemini 系列');
        const fmtGuess = this.fmt && typeof Fmt !== 'undefined' ? String(Fmt.guess(this.fmt)?.name || '').trim() : '';
        const toLbl = (fmtGuess && !/未知|compat/i.test(fmtGuess)) ? fmtGuess : (curToolFam === 'claude' ? 'Claude 系列' : 'GPT 系列');
        this.routed = true;
        this.routeFrom = fromLbl;
        this.routeTo = toLbl;
        try {
          if (typeof Models !== 'undefined' && this.sid) {
            const curM = Models.get(this.sid) || {};
            Models.put(this.sid, { ...curM, name: toLbl, routed: true, routeFrom: fromLbl, routeTo: toLbl, routeType: 'model' });
          }
        } catch {}
        const liveTools = (this.live?.parts || []).filter(p => String(p?.type || '').startsWith('tool-') || p?.type === 'dynamic-tool');
        const liveBash = liveTools.filter(p => /^(bash|shell|run_command)$/i.test(String(p?.toolName || String(p?.type || '').replace(/^tool-/, '')))).length;
        const curToolPart = liveTools.find(p => p.toolCallId === ch.toolCallId) || liveTools.at(-1);
        const stepMeta = {
          toolIndex: Math.max(1, liveTools.length),
          bashIndex: liveBash,
          toolName: String(ch.toolName || 'bash'),
          fromLabel: fromLbl,
          toLabel: toLbl,
          routeType: 'model',
          stepText: liveBash > 0 ? `（自第 ${liveBash} 个 bash 起切换）` : `（自第 ${Math.max(1, liveTools.length)} 个工具起切换）`,
        };
        if (curToolPart) curToolPart._routeStart = stepMeta;
        if (this.live) {
          const turnIdx = priorMsgs.length + 1;
          this.live._routeStepInfo = stepMeta;
          this.live._routeNotice = {
            type: 'model',
            fromTurn: 1,
            toTurn: turnIdx,
            fromLabel: fromLbl,
            toLabel: toLbl,
            stepMeta,
            text: `路由提示：对话疑似 ${toLbl}`,
          };
        }
        if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
          void RouteConfirm.askModelRoute(this, {
            routeType: 'model',
            fromLabel: fromLbl,
            toLabel: toLbl,
            reason: '实时工具调用前缀切换，检测到路由到其他模型' + stepMeta.stepText,
          });
        }
        return;
      }
    }
    if (t === 'tool-input-start' && priorHiddenThink && this.live) {
      const hasReasonNow = (this.live.parts || []).some(p => p.type === 'reasoning') || (Number(this.fmt?.rBlocks || this.fmt?.rN) > 0);
      if (!hasReasonNow && /opus-5[.-]5|fable-5[.-]1|argon|barium/i.test(baseLabel) && !/gpt-6[.-]1-sol|gpt-6-sol|gpt-6-astra/i.test(baseLabel)) {
        this._midRoutePrompted = true;
        const bClean = String(baseLabel).replace(/\s*\([^)]*\)\s*$/, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').trim() || '当前模型';
        const suspectedLbl = bClean + ' (Medium)';
        const liveTools = (this.live?.parts || []).filter(p => String(p?.type || '').startsWith('tool-') || p?.type === 'dynamic-tool');
        const liveBash = liveTools.filter(p => /^(bash|shell|run_command)$/i.test(String(p?.toolName || String(p?.type || '').replace(/^tool-/, '')))).length;
        const curToolPart = t === 'tool-input-start' ? (liveTools.find(p => p.toolCallId === ch?.toolCallId) || liveTools.at(-1)) : null;
        const stepMeta = curToolPart ? {
          toolIndex: Math.max(1, liveTools.length),
          bashIndex: liveBash,
          toolName: String(ch?.toolName || 'bash'),
          fromLabel: baseLabel,
          toLabel: suspectedLbl,
          routeType: 'effort',
          stepText: liveBash > 0 ? `（自第 ${liveBash} 个 bash 起切换）` : `（自第 ${Math.max(1, liveTools.length)} 个工具起切换）`,
        } : null;
        if (curToolPart && stepMeta) curToolPart._routeStart = stepMeta;
        this.live._routeStepInfo = stepMeta;
        this.live._routeNotice = {
          type: 'effort',
          fromTurn: 1,
          toTurn: priorMsgs.length + 1,
          fromLabel: baseLabel,
          toLabel: suspectedLbl,
          stepMeta,
          text: `路由提示：对话疑似 ${suspectedLbl}`,
        };
        if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
          void RouteConfirm.askModelRoute(this, {
            routeType: 'effort',
            fromLabel: baseLabel,
            toLabel: suspectedLbl,
            reason: '前序轮次包含闭源思考块，本轮缺失思考直接输出',
          });
        }
      }
    }
  }
  async stop(opt = {}) {
    if (!this.busy) return;
    if (!opt.strict && this.status === 'streaming' && !this.live && !this.awaitId && !this.preSend && !this.sending && Array.isArray(this.messages) && this.messages.length > 0) {
      const lastVis = this.messages.filter(m => m && !m._held).at(-1);
      if (lastVis && lastVis.role === 'assistant' && !lastVis.metadata?.pending && !lastVis._incomplete) {
        this.gen++; this.streaming = false; this.ctl?.abort();
        this.finishTurn(null, true);
        return;
      }
    }
    if (this.status === 'stopping') { if(opt.strict)this.strictStopAt=this.stopAt; return; }
    // 消息已发出、服务器还没接单：先记下，接单 / 开始输出的那一刻立刻停止（接单前就发停止，可能连这条消息一起丢掉）；再点一次 = 马上停
    if (!opt.strict && !this.stopPending && !this.preSend && this.status === 'submitted' && this.awaitId && !this.oursAt && !this.live) { this.stopPending = true; this.phase = '开始回复时立即停止（再点一次马上停）'; this.emit(); return; }
    this.stopPending = false;
    this.status = 'stopping'; this.phase = '正在停止'; this.stopReq = true; const tok = this.stopAt = now(); this.strictStopAt = opt.strict ? tok : 0;
    // 界面马上停：正在输出的部分收尾，之后到达的文字不再显示（服务器那边的完整内容下次打开时同步）
    const m = this.live; if (m) { m.parts.forEach(p => { if (p.state === 'streaming') p.state = 'done'; }); m.v++; }
    this.emit();
    try { await this.append({ kind: 'stop' }); } catch (e) { toast('停止失败：' + describe(e), 'err'); if (opt.strict) throw e; }
    // 结束记录迟迟不来（流断了 / 服务器已停但没推送）：主动查服务器，回复已经不在进行就直接收尾
    for (const d of [2500, 5500, 9000]) setTimeout(() => this.stopCheck(tok), d);
    if (!opt.strict) setTimeout(() => { if (this.status === 'stopping' && this.stopAt === tok && this.strictStopAt !== tok) { this.gen++; this.streaming = false; this.ctl?.abort(); this.finishTurn(null, true); } }, 15000);
  }
  async stopCheck(tok) {
    if (this.status !== 'stopping' || this.stopAt !== tok) return;
    try {
      const pk = typeof this.peekTurn === 'function' ? await this.peekTurn(this.lastSeq, null, 2000, { settleCheck: true }).catch(() => null) : null;
      if (this.status !== 'stopping' || this.stopAt !== tok) return;
      if (pk && !pk.busy && pk.done) { this.gen++; this.streaming = false; this.ctl?.abort(); this.finishTurn(null, true); return; }
      if (typeof ReadLimit !== 'undefined' && ReadLimit.active()) return;
      const j = await api(`/api/chat/${this.sid}?includeStreamToken=false&recoverRun=false`, { timeout: 8000, bg: true }), last = Array.isArray(j?.messages) ? j.messages.at(-1) : null;
      if (this.status !== 'stopping' || this.stopAt !== tok) return;
      const own = (j?.messages || []).findIndex(m => m.id === this.awaitId);
      const current = this.live ? last?.id === this.live.id : own >= 0 && own < j.messages.length - 1;
      if (this.strictStopAt === tok && !current) return; // A stale completed assistant is not stop confirmation.
      if (last && last.role === 'assistant' && !last.metadata?.pending && (!this.live || last.id === this.live.id)) { this.gen++; this.streaming = false; this.ctl?.abort(); this.finishTurn(null, true); }
    } catch {}
  }

  // ----- 实时流 -----
  restream() { if (this.streaming) { this.gen++; this.ctl?.abort(); this.streaming = false; } this.stream(); }
  async stream({ peek = false } = {}) {
    if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) { if (!this._evalStreaming) this.streaming = false; return; }
    if (this.streaming) return; this.streaming = true; this.peeking = !!peek;
    const my = ++this.gen; let backoff = 200, authFails = 0, idleLoops = 0, retryIdx = 0, failWindowStart = 0, totalReconnects = 0;
    const keepAliveOn = typeof Prefs === 'undefined' || Prefs.streamKeepAlive !== false;
    const RETRY_STEPS = [300, 700, 1500, 3000, 6000, 12000], RETRY_BUDGET_MS = keepAliveOn ? 600000 : 45000, MAX_RECONNECTS = 300, maxReconn = keepAliveOn ? MAX_RECONNECTS : 30;
    try {
      while (my === this.gen) {
        if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) break;
        if (++totalReconnects > maxReconn) break;
        const ctl = new AbortController(); this.ctl = ctl; this.streamOpenAt = 0;
        let lastByte = now(), turnDone = false, got = 0, sawDone = false, connecting = false, headers = false, routeTimeout = false, serverSettled = false;
        let rd = null, body = null, retryWait = 0, failed = false;
        const wd = setInterval(() => {
          if (my !== this.gen) { ctl.abort(); return; }
          if (headers && this.busy && !(this._officialTurnErrAt && now() - this._officialTurnErrAt < 60000) && now() - lastByte > 30000 && typeof AutoRoute !== 'undefined') void AutoRoute.silent(this);
          if (connecting && now() - lastByte > (headers ? NetPolicy.IDLE_MS : NetPolicy.CONNECT_MS)) { routeTimeout = true; ctl.abort(); }
        }, 1000);
        try {
          const usedTok = await this.ensureToken(authFails > 1 ? 'session' : authFails > 0);
          if (my !== this.gen || ctl.signal.aborted) break;
          const h = { Accept: 'text/event-stream', Authorization: 'Bearer ' + usedTok, 'Timeout-Seconds': '120', 'X-Session-Settled': 'true' };
          if (this.lastSeq != null) h['Last-Event-ID'] = String(this.lastSeq);
          if (peek) h['X-Peek-Settled'] = '1';
          this.connAt = lastByte = now(); connecting = true;
          const res = await rawFetch(OUT(this.sid), { headers: h, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
          body = res.body;
          if (my !== this.gen || ctl.signal.aborted) break;
          const cfMitigated = res.headers?.get?.('cf-mitigated') || '';
          if (/challenge/i.test(cfMitigated)) throw Object.assign(new HttpError(res.status || 403, 'Cloudflare 安全验证拦截（cf-mitigated: challenge），请切换代理或用网页模式通过验证', res), { responseFormat: true });
          if (res.status === 401 || res.status === 403) { this.markBadToken?.(usedTok); if (++authFails > 3) throw new HttpError(res.status, '实时通道拒绝访问', res); continue; }
          if (res.status === 404 && authFails < 2) { this.markBadToken?.(usedTok); authFails = 2; continue; }
          if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ''), res);
          const type = res.headers?.get?.('content-type') || '';
          if ((type && !/^text\/event-stream(?:\s*;|$)/i.test(type)) || !body?.getReader) throw Object.assign(new HttpError(res.status, '实时通道返回了非事件流，请检查官方验证', res), { responseFormat: true });
          serverSettled = /^(true|1)$/i.test(res.headers?.get?.('x-session-settled') || '');
          authFails = 0; headers = true; lastByte = now(); this.streamOpenAt = lastByte;
          rd = body.getReader(); const dec = new TextDecoder(); let buf = '';
          for (;;) {
            const { done, value } = await rd.read(); if (done) break;
            if (my !== this.gen) { ctl.abort(); break; }
            lastByte = now(); this.byteAt = lastByte; this.netErr = '';
            if (value?.byteLength) NetHealth.good('stream');
            if (typeof AutoRoute !== 'undefined' && AutoRoute.streamFails.length) AutoRoute.streamFails = [];
            buf += dec.decode(value, { stream: true }); let i;
            while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
              const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
              const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
              if (!data) continue;
              if (data.trim() === '[DONE]') { sawDone = true; continue; }
              let j; try { j = JSON.parse(data); } catch { continue; }
              for (const rec of j.records || []) { got++; if (this.onRecord(rec) === 'done') turnDone = true; }
            }
            if (turnDone) { await sleep(25); break; }
          }
          // 丢弃断开时残留的半截未闭合行，重连后由 Last-Event-ID 重新拉取完整帧
          buf = '';
        } catch (e) {
          if (my !== this.gen) break;
          if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
            this.error = null;
            break;
          }
          failed = true;
          this.dbg?.('stream-err', { e: String(e?.name === 'AbortError' ? 'Abort' : e?.message || e).slice(0, 100), st: e?.status || 0, route: routeTimeout });
          if (typeof AutoRoute !== 'undefined' && (routeTimeout || e.name !== 'AbortError')) AutoRoute.fault(routeTimeout ? Object.assign(new Error('实时连接超时'), { routeTimeout: true }) : e, headers && routeTimeout ? 'network' : 'stream');
          retryWait = Math.max(e.retryAfterMs || 0, e.status === 429 ? 30000 : 0);
          if (e.name !== 'AbortError') {
            this.netErr = describe(e);
            if (e.responseFormat || (e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408)) {
              if (peek && !this.busy) break;
              this.error = '实时通道错误：' + describe(e); this.emit(); if (e.responseFormat || ++idleLoops > 3) break;
            }
          }
        } finally {
          clearInterval(wd); ctl.abort();
          // Release readers even on auth retries, a completed turn, peek and superseded streams.
          if (rd) { try { rd.cancel().catch(() => {}); rd.releaseLock(); } catch {} }
          else { try { body?.cancel()?.catch?.(() => {}); } catch {} }
        }
        if (headers && !failed && !got && !sawDone && this.busy && !peek && !routeTimeout && now() - this.connAt < 5000 && typeof AutoRoute !== 'undefined') AutoRoute.fault(new Error('实时连接提前断开'), 'stream');
        this.dbg?.('stream', { ev: 'end', got, sawDone, failed, turnDone, headers, peek, settled: serverSettled, seq: this.lastSeq });
        if (turnDone || my !== this.gen) break;
        if (!peek && (serverSettled || sawDone) && !failed && sawDone && !got && this.busy && this.live) {
          this._lastConvergeSrvPend = false;
          const convOk = typeof this.converge === 'function' ? await this.converge().catch(() => false) : false;
          if (this._lastConvergeSrvPend && this.busy) {
            await sleep(1200);
            continue;
          }
          if (!convOk && this.busy && this.live && (typeof Hitl === 'undefined' || !Hitl.idleWait(this))) {
            this.finAt = this.finAt || now();
            this.finishTurn(this.runTok || null, true);
          }
          break;
        }
        if ((peek || ((serverSettled || sawDone) && !failed && (!this.busy || (!this.live && now() - (this.sentAt || 0) > 15000)))) && sawDone && !got) {
          if (this.status === 'streaming' && !this.live) { this.status = 'idle'; this.phase = ''; this.emit(); }
          break;
        }
        if (!this.busy && peek) break;
        peek = false;
        if (got) { backoff = 200; retryIdx = 0; failWindowStart = 0; }
        else {
          if (!failWindowStart) failWindowStart = now();
          else if (now() - failWindowStart > RETRY_BUDGET_MS) { this.error = '实时连接连续中断超过 10 分钟，请点击重新载入'; this.emit(); break; }
        }
        if (this.busy && !turnDone && typeof this.reconcile === 'function' && now() - (this.recoAt || 0) > 4000) {
          void this.reconcile(0).catch(() => {});
          if ((sawDone || !this.live) && typeof this.converge === 'function') void this.converge().catch(() => {});
        }
        if (this.status === 'streaming' && !this.live && !this.awaitId && !this.preSend && !this.sending) {
          const lastVis = (this.messages || []).filter(m => m && !m._held).at(-1);
          if (!lastVis || (lastVis.role === 'assistant' && !lastVis.metadata?.pending && !lastVis._incomplete && (sawDone || serverSettled || idleLoops >= 1))) {
            this.status = 'idle'; this.phase = ''; this._startupResuming = false; this._recoveringIncomplete = false; this.emit();
            if (typeof SendQ !== 'undefined' && (this.queue || []).length) setTimeout(() => { try { SendQ.check(this); } catch {} }, 50);
            break;
          }
          idleLoops++;
        }
        if (!this.busy) { if (++idleLoops > 2) break; }
        await sleep(Math.max(backoff, retryWait));
        retryIdx = Math.min(retryIdx + 1, RETRY_STEPS.length - 1);
        backoff = RETRY_STEPS[retryIdx];
      }
    } finally {
      if (my === this.gen) {
        this.streaming = false; this.peeking = false; this.ctl = null; this.streamOpenAt = 0;
        if (this.status === 'streaming' && !this.live && !this.awaitId && !this.preSend && !this.sending) {
          const lastVis = (this.messages || []).filter(m => m && !m._held).at(-1);
          if (!lastVis || (lastVis.role === 'assistant' && !lastVis.metadata?.pending && !lastVis._incomplete)) {
            this.status = 'idle'; this.phase = ''; this._startupResuming = false; this._recoveringIncomplete = false; this.emit();
            if (typeof SendQ !== 'undefined' && (this.queue || []).length) setTimeout(() => { try { SendQ.check(this); } catch {} }, 50);
          }
        }
      }
    }
  }

  // 服务器刚结束一轮时（turn-complete 之后约 1 秒内）追加的消息会被「读到但不处理」：服务器一直不接单，直到下一条消息进来。
  // 实测：结束后 0.5~0.9 秒发送 → 每次都丢；1.6 秒以后发送 → 正常。所以发送前保证距离上一轮结束至少 2.5 秒
  // 对话快照里最后一条助手消息是否还在 pending（服务器还在处理）。网络错误 / 未知 = false（不阻塞，交给原有的实时通道判断）
  async serverMidTurn(selfId) {
    try {
      if (!this.live && (this.endAt || this.tcAt || this.finAt) && now() - Math.max(this.endAt || 0, this.tcAt || 0, this.finAt || 0) < 25000) return false;
      const j = await api('/api/chat/' + this.sid, { timeout: 6000, bg: true }), last = Array.isArray(j?.messages) ? j.messages.at(-1) : null;
      if (j?.publicAccessToken) this.setToken?.(j.publicAccessToken);
      if (Array.isArray(j?.messages) && Array.isArray(this.messages)) {
        for (const sm of j.messages) {
          if (sm?.role === 'user' && sm.metadata?.nodeId) {
            const lm = this.messages.find(x => x && x.id === sm.id);
            if (lm) lm.metadata = { ...(lm.metadata || {}), nodeId: sm.metadata.nodeId };
          }
        }
      }
      if (!last || last.id === selfId || last.role !== 'assistant' || !last.metadata?.pending || Hitl.idleWait(this)) return false;
      if (typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)) return false;
      const loc = (this.messages || []).find(m => m.id === last.id);
      if (loc && loc._finishedAt && now() - loc._finishedAt < 30000) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  async recoverPendingDelivery() {
    const pend = this._pendingTimeoutMsg;
    if (!pend || !pend.msg || !pend.msg.failed || this.busy || this.stopReq) return false;
    if (now() - (pend.at || 0) > 180000) { this._pendingTimeoutMsg = null; return false; }
    this._pendingTimeoutMsg = null;
    const { msg, text, at } = pend;
    try {
      this.status = 'streaming';
      this.error = null;
      this.phase = '线路已恢复，正在核对并自动恢复消息…';
      msg.failed = false; msg.deliveryUnknown = false; msg.v = (msg.v || 0) + 1;
      this.emit();
      const got = await this.inDb(msg.id, text, at).catch(() => null);
      if (got !== true && this.reSend && this.reSend.id === msg.id) {
        this.phase = '已切换最优节点 / ProxyIP，正在自动补发…';
        this.emit();
        await this.ensureToken().catch(() => null);
        const ar = await this.reSend.fn();
        this.awaitSeq = ar && typeof ar === 'object' && ar.seq != null ? +ar.seq : null;
      }
      msg._appendAccepted = true;
      try { Drafts.accepted?.(msg.id); } catch {}
      this.awaitFrom = at || now();
      this.awaitId = msg.id;
      this.phase = '等待回复';
      this.emit();
      this.armLost(msg);
      this.restream();
      return true;
    } catch (e) {
      this.status = 'error';
      msg.failed = true; msg.deliveryUnknown = true; msg.v = (msg.v || 0) + 1;
      this.error = describe(e);
      this.phase = '';
      this.awaitId = null;
      this.emit();
      return false;
    }
  }
  async settle(gap = 450) {
    const w = gap - (now() - (this.tcAt || 0));
    if (w > 0 && w <= gap) { this.phase = '等待服务器就绪'; this.emit(); await sleep(w); }
  }
  // 服务器上有没有这条用户消息（服务器接单时就会把用户消息存进对话；浏览器看到的也是这个）
  // 返回 true / false；网络错误、超时 = null（未知——未知时绝不能当成「没有」）
  // text：按内容兜底核对（服务器可能用了不同的消息 ID）——服务器上有同样内容的用户消息也算已收到
  // 服务器的对话记录里有没有这条：true / false / null（查不到）
  //   按 id → 去空白后的正文（含前后被加了内容）→ 发出时间之后的用户消息；最新一页已经早于发送时间却没有 → 确定没有（不再因为「还有更早的分页」一直未知）
  msgText(id) { const m = (this.messages || []).find(x => x.id === id); return m ? (m.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('') : ''; }
  async inDb(id, text, at = 0) {
    try {
      const j = await api(`/api/chat/${this.sid}`, { timeout: 15000, noApiRetry: true }); if (!Array.isArray(j?.messages)) return null;
      if (j?.publicAccessToken && typeof this.setToken === 'function') this.setToken(j.publicAccessToken);
      if (j.messages.some(m => m && (m.id === id || m.metadata?.nodeId === id))) return true;
      const localMsgForScope = (this.messages || []).find(x => x && x.id === id);
      const outEntryForScope = (typeof Drafts !== 'undefined' && typeof Drafts.load === 'function') ? (Drafts.load()?.o || []).find(x => x && x.id === id) : null;
      const prevAsstId = localMsgForScope?._prevAsstId || outEntryForScope?.prevAsstId || '';
      const prevAsstIdx = prevAsstId ? j.messages.findIndex(m => m && String(m.id || '') === String(prevAsstId)) : -1;
      const parentId = this._lastSentParentUserId ? String(this._lastSentParentUserId) : '';
      const parentIdx = parentId ? j.messages.findIndex(m => m && (String(m.id || '') === parentId || String(m.metadata?.nodeId || '') === parentId)) : -1;
      let afterParentTurnIdx = parentIdx + 1;
      if (parentIdx >= 0) {
        while (afterParentTurnIdx < j.messages.length && j.messages[afterParentTurnIdx]?.role !== 'user') afterParentTurnIdx++;
      }
      const startSliceIdx = Math.max(parentIdx >= 0 ? afterParentTurnIdx : 0, prevAsstIdx >= 0 ? prevAsstIdx + 1 : 0);
      const hasBoundIdx = parentIdx >= 0 || prevAsstIdx >= 0;
      const scope = hasBoundIdx ? j.messages.slice(startSliceIdx) : j.messages;
      const norm = v => String(v || '').replace(/\s+/g, ' ').trim(), t = norm(text), body = m => norm((m.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('') || m.content || '');
      const users = scope.filter(m => m && m.role === 'user'), ts = m => Date.parse(m.createdAt || m.created_at || '') || (typeof idTime === 'function' ? idTime(m?.id) : 0) || 0;
      if (t && users.some(m => { const mTs = ts(m); if (at > 0 && !hasBoundIdx && mTs > 0 && mTs < at - 15000) return false; const b = body(m); return b === t || (t.length > 8 && b.length > 8 && (b.includes(t) || t.includes(b))) || (t.length > 40 && b.slice(0, 40) === t.slice(0, 40)); })) return true;
      if (at && users.some(m => ts(m) >= at - (parentIdx >= 0 ? 2000 : 15000))) return true;
      if (prevAsstIdx >= 0 && scope.some(m => m && m.role === 'assistant' && m.id && String(m.id) !== String(prevAsstId))) return true;
      if (at && scope.some(m => m && m.role === 'assistant' && (!prevAsstId ? !m.metadata?.pending : String(m.id || '') !== String(prevAsstId)) && ts(m) >= at - (parentIdx >= 0 ? 1000 : 5000))) return true;
      if (j.messages.length >= 2 && j.messages.at(-1)?.role === 'assistant' && j.messages.at(-2)?.role === 'assistant' && (!prevAsstId || String(j.messages.at(-1)?.id || '') !== String(prevAsstId)) && (!at || !ts(j.messages.at(-1)) || ts(j.messages.at(-1)) >= at - 15000)) return true;
      const srvLast = j.messages.at(-1);
      const localMsg = (this.messages || []).find(x => x && x.id === id);
      const srvLastExplicitDone = Boolean(srvLast?.metadata?.timing?.completedAt || srvLast?.metadata?.finishReason === 'stop' || srvLast?.metadata?.finishReason === 'end-turn' || srvLast?.metadata?.aborted || srvLast?.metadata?.error);
      const srvLastW = (typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(srvLast) : 0;
      const srvLastCompRaw = srvLast?.metadata?.timing?.completedAt;
      const srvLastCompMs = typeof srvLastCompRaw === 'number' ? srvLastCompRaw : (typeof srvLastCompRaw === 'string' ? Date.parse(srvLastCompRaw) : 0);
      const isSameAsPrevAsst = !prevAsstId || String(srvLast?.id || '') === String(prevAsstId);
      this._inDbPrevTurnActive = Boolean(srvLast?.role === 'assistant' && isSameAsPrevAsst && ((!srvLastExplicitDone && srvLast.metadata?.pending) || (localMsg?._prevAsstWeight != null && srvLastW > localMsg._prevAsstWeight) || (srvLastCompMs > 0 && at > 0 && srvLastCompMs >= at + 1000 && ts(srvLast) <= at + 5000)));
      if (this._inDbPrevTurnActive && typeof this.mergeServer === 'function') {
        try { this.mergeServer(j.messages, this.live); } catch {}
      }
      if (hasBoundIdx || !j.pagination?.hasMore || (at > 0 && j.messages.length > 0)) return false;
      const first = j.messages.map(ts).filter(Boolean)[0];
      return at && first && first < at - 15000 ? false : null;
    } catch { return null; }
  }
  async verifyTurnForContinue(lastUser, origText = '') {
    if (!lastUser || typeof api !== 'function' || !this.sid) return { verified: true, mode: 'continue' };
    try {
      const j = await api(`/api/chat/${this.sid}?includeStreamToken=false&recoverRun=false`, { timeout: 6000, noApiRetry: true });
      if (!Array.isArray(j?.messages)) return { verified: true, mode: 'continue' };
      const norm = v => String(v || '').replace(/\s+/g, ' ').trim();
      const body = m => norm((m?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('') || m?.content || '');
      const tNorm = norm(origText || body(lastUser));
      const uid = String(lastUser.id || ''), unode = String(lastUser.metadata?.nodeId || '');
      let uIdx = j.messages.findIndex(m => m && m.role === 'user' && (String(m.id || '') === uid || (unode && String(m.metadata?.nodeId || '') === unode) || (uid && String(m.metadata?.nodeId || '') === uid)));
      const parentId = this._lastSentParentUserId ? String(this._lastSentParentUserId) : '';
      const parentIdx = parentId ? j.messages.findIndex(m => m && (String(m.id || '') === parentId || String(m.metadata?.nodeId || '') === parentId)) : -1;
      if (uIdx < 0 && tNorm) {
        for (let i = j.messages.length - 1; i > parentIdx; i--) {
          const m = j.messages[i];
          if (!m || m.role !== 'user') continue;
          const b = body(m);
          if (b === tNorm || (b.length > 8 && (b.includes(tNorm) || tNorm.includes(b))) || (tNorm.length > 40 && b.slice(0, 40) === tNorm.slice(0, 40))) { uIdx = i; break; }
        }
      }
      if (uIdx >= 0) {
        const srvU = j.messages[uIdx];
        if (srvU.id && srvU.id !== lastUser.id) lastUser.id = srvU.id;
        if (srvU.metadata?.nodeId) lastUser.metadata = { ...(lastUser.metadata || {}), nodeId: srvU.metadata.nodeId };
        lastUser._appendAccepted = true;
        delete lastUser._local;
        const afterMsgs = j.messages.slice(uIdx + 1);
        const srvAsst = [...afterMsgs].reverse().find(m => m && m.role === 'assistant');
        const srvErrTxt = srvAsst ? String((srvAsst.parts || []).find(p => p?.type === 'error')?.rawText || (srvAsst.parts || []).find(p => p?.type === 'error')?.text || '') : '';
        if (/The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(srvErrTxt)) {
          return { verified: false, mode: 'rewind-resend', reason: 'graph-reject' };
        }
        if (srvAsst && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork(srvAsst) && !srvAsst.metadata?.pending && !srvErrTxt) {
          const stalled = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, srvAsst) : null;
          if (typeof this.mergeServer === 'function') this.mergeServer(j.messages, null);
          if (!stalled) {
            this.error = null; this.errText = ''; this._officialTurnErrAt = 0; this.emit();
            return { verified: true, mode: 'already-done', srvUser: srvU };
          }
        }
        if (srvAsst && srvAsst.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(srvAsst))) {
          if (typeof this.mergeServer === 'function') this.mergeServer(j.messages, null);
          this.error = null; this.errText = ''; this._officialTurnErrAt = 0;
          this.restream();
          return { verified: true, mode: 'server-busy', srvUser: srvU };
        }
        if (srvAsst && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork(srvAsst) && typeof this.mergeServer === 'function') {
          this.mergeServer(j.messages, null);
        }
        return { verified: true, mode: 'continue', srvUser: srvU };
      }
      const localHasWork = Boolean((this.messages || []).at(-1)?.role === 'assistant' && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork((this.messages || []).at(-1)));
      if (!localHasWork && (parentIdx >= 0 || !j.pagination?.hasMore)) {
        return { verified: false, mode: 'resend-orig', reason: 'not-in-db' };
      }
      return { verified: true, mode: 'continue' };
    } catch {
      return { verified: true, mode: 'continue' };
    }
  }
  // 直接问实时通道：从发送前的位置起，服务器写了哪些记录（只读已写入的，不等待）
  //   taken = 有分派记录且 inputId 是这条；busy = 有一轮正在进行（分派 / start 之后还没有 turn-complete）
  //   读不完整 / 出错 = null（未知）
  async peekTurn(base, id, maxMs = 9000, opt = {}) {
    const settleCheck = !!opt?.settleCheck || id == null;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), maxMs);
    try {
      await this.ensureToken();
      const hd = { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '1', 'X-Peek-Settled': '1' };
      if (base != null) hd['Last-Event-ID'] = String(base);
      const res = await rawFetch(OUT(this.sid), { headers: hd, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return null;
      let taken = false, busy = false, foreignBusy = false, n = 0, done = false, last = null, buf = '';
      const rd = res.body.getReader(), dec = new TextDecoder();
      const eat = (blk) => {
        const data = blk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
        if (!data) return;
        if (data.trim() === '[DONE]') { done = true; return; }
        let j; try { j = JSON.parse(data); } catch { return; }
        for (const rec of j.records || []) {
          n++; if (rec.seq_num != null) last = +rec.seq_num;
          const hm = rec.headers?.length ? Object.fromEntries(rec.headers) : {};
          if (hm['trigger-control'] === 'turn-complete') { busy = false; continue; }
          let bd = null; try { bd = rec.body ? JSON.parse(rec.body) : null; } catch {}
          if ([bd, bd?.data, bd?.chunk].some(x => x?.type === 'trigger:turn-complete')) { busy = false; continue; }
          const t = bd?.data?.type;
          if (t === 'finish' && bd?.data?.finishReason !== 'tool-calls') { busy = false; continue; }
          if (t === 'error' || t === 'abort') { busy = false; continue; }
          if (t === 'data-agent-dispatch') { busy = true; if (id && (!bd.data.data?.inputId || bd.data.data?.inputId === id)) taken = true; }
          if (t === 'data-agent-dispatch' && id && bd.data.data?.inputId && bd.data.data.inputId !== id) foreignBusy = true;
          else if (t && t.startsWith('data-') && bd?.data?.transient) { busy = true; }
          else if (t && /^(start|start-step|text-|reasoning-|tool-|source-|file)/.test(t)) busy = true;
        }
      };
      try {
        for (;;) {
          const { done: end, value } = await rd.read(); if (end) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { eat(buf.slice(0, i)); buf = buf.slice(i).replace(/^\r?\n\r?\n/, ''); }
          if (taken || done) break;
        }
        if (buf.trim()) eat(buf);
      } catch (e) {
        if (buf.trim()) try { eat(buf); } catch {}
        if (!taken && !busy && !settleCheck) return null;
      }
      finally { try { ctl.abort(); } catch {} }
      if (taken) return { taken, busy: true, done, n, last };
      if (!done) return busy ? { taken: false, busy: true, foreignBusy, done: false, n, last, partial: true } : (settleCheck ? { taken: false, busy: false, settled: true, done: false, n, last } : null);
      return { taken, busy, foreignBusy, settled: !busy, done, n, last };
    } catch { return null; }
    finally { clearTimeout(tm); }
  }
  // 兜底：发出后迟迟没看到服务器接单（正常约 6.5 秒）。
  // 「停止」事件如果在服务器处理这一轮时到达，会直接打断这一轮（浏览器里显示 Stopped）——所以唤醒必须极其保守：
  //   1. 先直接问实时通道（从发送前的位置读已写入的记录）：已分派 / 有一轮在跑 → 只是本地漏了记录，重新接上，绝不发停止
  //   2. 再查对话记录里有没有这条：有 → 已接单，重新接上
  //   3. 任何一步出错 / 超时 / 结果未知 → 只重新接上，稍后再查，绝不发停止
  //   4. 只有连续两次（间隔 ≥ 6 秒、且发出已 ≥ 18 秒）实时通道和对话记录都明确「没有、服务器空闲」时，才发一个空的「停止」唤醒
  armLost(msg) {
    clearTimeout(this.lostT);
    const at = now(), id = this.awaitId, base = this.baseSeq; let n = 0, neg = 0, negAt = 0, unk = 0;
    this.appAt = at; this.oursAt = 0; this.dlv = 'sent';
    const alive = () => this.awaitId === id && this.busy && !this.live && !(this.oursAt > at);
    const taken = (why) => {
      this.oursAt = now(); this.dlv = 'taken'; this.phase = '服务器已接单，等待模型开始'; this.lostWhy = why; this.emit();
      if (!this.streaming || now() - Math.max(this.byteAt || 0, this.recAt || 0, this.streamOpenAt || 0) > 12000) this.restream();
      this.watchStart(id);
    };
    const tick = (ms) => {
      clearTimeout(this.lostT);
      this.lostT = setTimeout(async () => {
        if (!alive()) return;
        // 刚收到过记录（服务器在跑别的 / 本地通道正常）：再等等
        if (now() - (this.recAt || 0) < 5500) { tick(3500); return; }
        const pk = await this.peekTurn(base, id, 3500, { settleCheck: true });
        if (!alive()) return;
        if (pk?.taken) return taken('peek');
        if (pk?.busy) {
          if (!msg?._queued && now() - at >= 4500) {
            const dbBusy = await this.inDb(id, this.msgText(id), this.appAt || 0);
            if (!alive()) return;
            if (dbBusy === true) return taken('db');
            if ((this._inDbPrevTurnActive || pk?.foreignBusy || !msg?._appendAccepted) && (dbBusy === false || (dbBusy === null && pk?.foreignBusy)) && msg) {
              if (msg?._appendAccepted && !this._inDbPrevTurnActive && !pk?.foreignBusy) return taken('peek-busy');
              try { SentUserLog.demoteToQueue?.(this, msg, { running: true }); } catch {}
              const tailA = this.messages.at(-1);
              if (tailA?.role === 'assistant') { tailA.metadata = { ...(tailA.metadata || {}), pending: true }; this.live = tailA; }
              if (!this.sentAt) this.sentAt = Number(tailA?._sentAt) || idTime(tailA?.id) || now();
              this.status = 'streaming'; this.phase = '接收回复中'; this.dlv = '';
              this.emit(); this.restream(); return;
            }
            if (msg?._appendAccepted && !this._inDbPrevTurnActive && !pk?.foreignBusy) return taken('peek-busy');
          }
          neg = 0; this.restream(); tick(8000); return;
        }
        const db = pk ? await this.inDb(id, this.msgText(id), this.appAt || 0) : null;
        if (!alive()) return;
        if (db === true) return taken('db');
        if (db === false && !msg?._queued && msg && (this._inDbPrevTurnActive || (!msg?._appendAccepted && this.messages.at(-1)?.role === 'assistant' && this.messages.at(-1)?.metadata?.pending))) {
          const isRun = Boolean(this.messages.at(-1)?.role === 'assistant' && this.messages.at(-1)?.metadata?.pending);
          try { SentUserLog.demoteToQueue?.(this, msg, { running: isRun }); } catch {}
          if (isRun) {
            this.live = this.messages.at(-1);
            if (!this.sentAt) this.sentAt = Number(this.live?._sentAt) || idTime(this.live?.id) || now();
            this.status = 'streaming'; this.phase = '接收回复中';
          }
          this.dlv = ''; this.emit();
          if (isRun) this.restream();
          else if (typeof SendQ !== 'undefined') SendQ.check?.(this);
          return;
        }
        if (!pk || db !== false) {
          // 未知：重新接上实时通道，稍后再查（多次未知只提示，不唤醒、不报错）
          neg = 0; unk++; this.restream();
          if (unk >= 3 && !this.oursAt) { this.phase = '已送达 · 暂时无法确认服务器状态（网络较慢），继续等待'; this.emit(); }
          tick(unk < 6 ? 6000 : 15000); return;
        }
        unk = 0;
        const minGap = msg?._queued ? 6000 : 12000;
        const minAge = msg?._queued ? 18000 : 25000;
        if (!neg) { neg = 1; negAt = now(); tick(Math.max(minGap, minAge - (now() - at))); return; }
        if (now() - negAt < minGap || now() - at < minAge) { tick(Math.max(2000, minGap - (now() - negAt), minAge - (now() - at))); return; }
        neg = 0;
        if (msg?._queued) {
          // 队列消息：服务器可能已收下（在输入流里排队）但没开始处理——只读核对 + 唤醒（空的「停止」，条件和普通发送一样苛刻：实时通道和对话记录都明确空闲）。
          // 绝不重发正文；不唤醒的话这条会一直躺在服务器输入流里，等下一次手动发送时才「夹」进去被处理。
          if (n >= 4) { this.status = 'error'; this.error = '队列消息服务器还没开始处理。它可能已被服务器收下，请先刷新核对，不要直接重发'; this.phase = ''; msg.failed = true; msg.deliveryUnknown = true; this.awaitId = null; this.awaitFrom = 0; this.emit(); return; }
          n++; this.wakes = (this.wakes || 0) + 1; this.dlv = 'wake';
          this.phase = '队列消息服务器还没开始处理，正在唤醒' + (n > 1 ? '（第 ' + n + ' 次）' : '') + '（不会重发正文）'; this.emit();
          try { await this.append({ kind: 'stop' }); } catch {}
          if (!this.streaming) this.stream();
          tick(15000); return;
        }
        if (n >= 6) {
          if (msg && (this._inDbPrevTurnActive || this.live || (this.messages.at(-1)?.role === 'assistant' && this.messages.at(-1)?.metadata?.pending))) {
            try { SentUserLog.demoteToQueue?.(this, msg, { running: true }); } catch {}
            this.dlv = ''; this.emit(); return;
          }
          // 长时间等待且多次后台同步后服务器上仍然没有这条消息：结束等待，提示用户重试
          this.status = 'error'; this.error = '服务器响应超时或未接收这条消息。可以点重试'; this.phase = ''; this.dlv = '';
          if (msg) { msg.failed = true; try { SentUserLog.markFailed?.(this.sid, msg.id); } catch {} } this.awaitId = null; this.awaitFrom = 0; this.emit(); return;
        }
        n++; this.wakes = (this.wakes || 0) + 1; this.dlv = 'wake';
        this.wakeLog = (this.wakeLog || []).concat({ at: now(), id, pk: pk && pk.n }).slice(-10);
        if (this.wakeSessionToken) { try { await this.wakeSessionToken(true); } catch {} }
        else if (this.ensureToken) { try { await this.ensureToken(true); } catch {} }
        // 前两次仅在后台重连实时流与拉取最新会话状态，绝不轻易发 stop 或重复 POST 消息（避免打断慢速思考如 asking Bradley 或触发 429 重复指令限流）
        if (n <= 2 && msg?._appendAccepted) {
          this.phase = '服务器正在思考处理中，持续等待响应…'; this.emit();
          this.restream();
          void this.reconcile?.(0)?.catch?.(() => {});
          tick(18000); return;
        }
        if (n === 3 && this.reSend?.id === id) {
          this.phase = '服务器响应较慢，正在后台重新同步投递…'; this.emit();
          try { await this.append({ kind: 'stop' }); } catch {}
          try { await this.reSend.fn(); this.resent = (this.resent || 0) + 1; } catch {}
        } else {
          this.phase = '正在等待服务器响应' + (n > 1 ? '（后台同步 #' + n + '）' : '…'); this.emit();
          try { await this.append({ kind: 'stop' }); } catch {}
          void this.reconcile?.(0)?.catch?.(() => {});
        }
        if (!this.streaming) this.stream();
        tick(18000);
      }, ms);
    };
    tick(2800);
  }
  // 服务器已接单但迟迟没有开始输出：每 18 秒核对一次实时通道（漏了记录就补上），并在状态里显示已等待的时间
  watchStart(id) {
    clearTimeout(this.startT);
    this.startT = setTimeout(() => {
      if (this.awaitId !== id || !this.busy || this.live) return;
      if (!this.streaming || now() - Math.max(this.byteAt || 0, this.recAt || 0, this.streamOpenAt || 0) > 25000) this.restream();
      this.watchStart(id);
    }, 18000);
  }
  // 输入框上方 / 回复占位里显示的送达状态（让人知道到底发没发出去、服务器在不在处理）
  dlvText() {
    if (!this.busy || this.live) return '';
    const s = t => Math.max(0, Math.round((now() - t) / 1000)) + 's';
    if (!this.appAt || this.appAt < (this.sentAt || 0)) return this.phase || '发送中';
    if (this.dlv === 'wake') return this.phase + ' · ' + s(this.appAt);
    if (this.oursAt) return '服务器已接单 · 等待模型开始 ' + s(this.oursAt);
    if (this.turnInput && this.turnInput !== this.awaitId) return '已送达 · 服务器在处理之前的消息 ' + s(this.appAt);
    return '已送达 · 等待服务器接单 ' + s(this.appAt);
  }
  // 这一轮是不是在回答「之前」的消息（服务器落后了）：分派记录里的 inputId = 那条用户消息的 id
  foreignTurn() {
    const a = this.awaitId, t = this.turnInput;
    if (a && this.preSend) return true;   // 自己这条还没发出去：这时服务器上跑的任何一轮都是「之前的消息」
    if (!a || !t || t === a) return false;
    const it = this.messages.findIndex(m => m && m.role === 'user' && (m.id === t || m.metadata?.nodeId === t));
    const ia = this.messages.findIndex(m => m && (m.id === a || m.metadata?.nodeId === a));
    if (ia >= 0 && it === ia) return false;
    // 本地没有的那条：仅在明确等待外部轮次（waitingForeign）时才视为「之前的消息」，避免服务端改派新 inputId 把本轮回复插到发送消息之前
    if (it < 0) return Boolean(this.waitingForeign && ia >= 0);
    return ia >= 0 && it < ia;
  }
  // 某条用户消息的回复应该插在哪：它后面、下一条用户消息之前
  slotAfter(uid) {
    const i = this.messages.findIndex(m => m && (m.id === uid || m.metadata?.nodeId === uid)); if (i < 0) return -1;
    let j = i + 1; while (j < this.messages.length && this.messages[j].role !== 'user') j++;
    return j >= this.messages.length ? -1 : j;
  }
  // 补答之前消息的那一轮结束了：收尾那条回复，继续等自己这条；服务器卡住（已读取但没处理）时轻推一下
  foreignDone(hm) {
    this.fDone = (this.fDone || 0) + 1;
    const m = this.live;
    if (m) { m.metadata = { ...m.metadata, pending: false }; m.parts.forEach(p => { if (p.state === 'streaming') p.state = 'done'; }); m.v++; }
    this.live = null; this.parts.clear(); this.turnInput = null;
    this.status = 'submitted'; this.phase = '等待回复（服务器刚补答完之前的消息）';
    const E = +hm['session-in-event-id'], C = +hm['session-in-consumed-id'];
    // 服务器已经读取了后面的消息但没开始处理（consumed > event）：2.5 秒内没有新的分派，就发一个空的「停止」事件把它唤醒
    // （空闲时的停止不会影响任何回复；实测唤醒后会立刻处理积压的那条）
    if (Number.isFinite(E) && Number.isFinite(C) && C > E && (this.wakes || 0) < 5) {
      const at = now(), id = this.awaitId, base = this.lastSeq; clearTimeout(this.wakeT);
      // 同样保守：4 秒内没有新的分派 → 问实时通道 + 对话记录，都明确「没有、空闲」才唤醒；未知就交给 armLost 的兜底
      this.wakeT = setTimeout(async () => {
        const ok = () => this.awaitId === id && this.busy && !this.live && !((this.dispAt || 0) > at) && !(this.oursAt > at);
        if (!ok()) return;
        const pk = await this.peekTurn(base, id, 3500, { settleCheck: true }); if (!ok()) return;
        if (pk?.taken || pk?.busy) { this.restream(); return; }
        const db = pk ? await this.inDb(id, this.msgText(id), this.appAt || 0) : null; if (!ok()) return;
        if (db === true) { this.oursAt = now(); this.dlv = 'taken'; this.phase = '服务器已接单，等待模型开始'; this.emit(); this.restream(); this.watchStart(id); return; }
        if (!pk || db !== false) return;
        this.wakes = (this.wakes || 0) + 1; this.phase = '唤醒服务器处理积压的消息'; this.emit();
        try { await this.append({ kind: 'stop' }); } catch {}
        if (!this.streaming) this.stream();
      }, 4000);
    }
    this.emit();
  }
  // 把实时通道读到最新位置，只记位置、不显示内容；如果有一轮正在跑（有 start 没有 turn-complete），从这一轮开头接上
  async drain(maxMs = 1800, opt = {}) {
    if (this.gacha && this.lastSeq == null) return null;
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), maxMs), t0 = now();
    try {
      await this.ensureToken();
      const hd = { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '1', 'X-Peek-Settled': '1' };
      if (this.lastSeq != null) hd['Last-Event-ID'] = String(this.lastSeq);
      const res = await rawFetch(OUT(this.sid), { headers: hd, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return null;
      // 边读边收：有一轮正在输出时服务器不会在 1 秒内结束这个请求（会一直推送），超时就用已经读到的完整记录（partial）
      let txt = '', partial = false;
      try { const rd = res.body.getReader(), dec = new TextDecoder(); for (;;) { const { done, value } = await rd.read(); if (done) break; txt += dec.decode(value, { stream: true }); } }
      catch { partial = true; const k = Math.max(txt.lastIndexOf('\n\n'), txt.lastIndexOf('\r\n\r\n')); txt = k >= 0 ? txt.slice(0, k) : ''; if (!txt) return null; }
      let max = this.lastSeq != null ? +this.lastSeq : -1, open = null, n = 0, act = null, run = null, runIn = null, lastRun = null, midChunk = null;
      for (const blk of txt.split(/\r?\n\r?\n/)) {
        const data = blk.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
        if (!data || data.trim() === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        for (const rec of j.records || []) {
          if (rec.seq_num == null) continue; const sq = +rec.seq_num; if (sq <= max) continue; max = sq; n++;
          const hm = rec.headers?.length ? Object.fromEntries(rec.headers) : {};
          if (hm['trigger-control'] === 'turn-complete') { if (run != null || open != null) lastRun = run ?? open; open = null; run = null; runIn = null; midChunk = null; const ts = +rec.timestamp; if (ts && this.srvSkew != null) this.tcAt = Math.max(this.tcAt || 0, Math.min(now(), ts + this.srvSkew)); continue; }
          let b = null; try { b = rec.body ? JSON.parse(rec.body) : null; } catch {}
          if ([b, b?.data, b?.chunk].some(x => x?.type === 'trigger:turn-complete')) { if (run != null || open != null) lastRun = run ?? open; open = null; run = null; runIn = null; midChunk = null; continue; }   // 新版：结束标记放在记录内容里
          const bty = b?.data?.type || b?.type || '';
          if ((bty === 'finish' && b?.data?.finishReason !== 'tool-calls') || bty === 'error' || bty === 'abort') { if (run != null || open != null) lastRun = run ?? open; open = null; run = null; runIn = null; midChunk = null; continue; }
          if (bty === 'start' && open == null) open = sq;
          if (act == null && (bty === 'start' || bty === 'data-agent-dispatch')) act = sq;
          // 最后一个结束标记之后的第一条分派 / start = 服务器上正在跑的一轮（可能是网页 / 别的设备发起的）
          if (run == null && (bty === 'start' || bty === 'data-agent-dispatch')) { run = sq; lastRun = sq; }
          if (runIn == null && bty === 'data-agent-dispatch') runIn = b?.data?.data?.inputId || '';
          if (midChunk == null && (bty === 'start-step' || bty === 'text-start' || bty === 'text-delta' || bty === 'reasoning-start' || bty === 'reasoning-delta' || bty === 'tool-input-start' || bty === 'tool-input-available')) midChunk = sq;
        }
      }
      const reachedTarget = !partial || opt?.targetSeq == null || max >= +opt.targetSeq - 2;
      const activeStart = reachedTarget ? (open ?? run ?? midChunk) : null;
      // const pick = activeStart ?? (opt?.keepIfFinished ? (lastRun ?? act) : null);
      const pick = activeStart ?? (opt?.replayFinished ? (lastRun ?? act) : null);
      this.drainInfo = { n, ms: now() - t0, open: activeStart != null, act: act ?? lastRun ?? midChunk, run: reachedTarget && (run ?? midChunk) != null, runSeq: run ?? open ?? midChunk, runIn, partial, max };
      if (pick != null) {
        this.lastSeq = String(Math.max(0, pick - 1)); this.fence = pick - 1;
        if (activeStart == null && (opt?.keepIfFinished || opt?.replayFinished)) this.reconcile(350);
      } else if (max >= 0) {
        this.lastSeq = String(max); this.fence = max;
        if (opt?.keepIfFinished) this.reconcile(250);
      }
      return this.drainInfo;
    } catch { return null; }
    finally { clearTimeout(tm); }
  }
  // 客户端自己的诊断轨迹（只存内存，每个对话最多 500 条；「抓记录」时一起导出）：记下每一步怎么处理实时记录——
  // 丢消息时能看出是记录没到、被当成重复 / 旧记录 / 尾巴跳过了，还是到了但没显示。
  dbg(k, o) {
    const r = this.trc || (this.trc = []); r.push({ t: now(), k, ...(o || {}) }); if (r.length > 500) r.splice(0, r.length - 450);
  }
  recTy(rec) { try { const b = rec.body ? JSON.parse(rec.body) : null; return b?.data?.type || b?.type || (rec.headers?.length && Object.fromEntries(rec.headers)['trigger-control']) || ''; } catch { return ''; } }
  dbgRec(rec, r) { const ty = this.recTy(rec); if (r !== 'ok' || !/^(text-delta|reasoning-delta|tool-input-delta)$/.test(ty)) this.dbg?.('rec', { seq: rec.seq_num, ty, r }); else this.trcN = (this.trcN || 0) + 1; }
  onRecord(rec) {
    // Reconnects may replay an inclusive cursor; never append the same event twice or rewind.
    if (rec.seq_num != null && this.lastSeq != null && +rec.seq_num <= +this.lastSeq) return;
    // 已经读过的（drain 读到的最新位置之前）直接跳过
    if (this.fence != null && rec.seq_num != null && +rec.seq_num <= this.fence) return;
    if (rec.seq_num != null) this.lastSeq = String(rec.seq_num);
    // 兜底：等这一轮回复时，发送前很久的旧记录（按服务器时间，已校正时钟差）不再当成这一轮——
    // 否则长对话后期会出现「回答的是上一次 / 上上次的问题」、真正的回复要等下次发送才出来
    if (this.awaitFrom && this.srvSkew != null && rec.timestamp && +rec.timestamp + (this.srvSkew || 0) < this.awaitFrom - 8000) { this.staleSkip = (this.staleSkip || 0) + 1; this.dbgRec?.(rec, 'stale'); return; }
    this.dbgRec?.(rec, 'ok');
    this.lastActivity = now(); this.recAt = now();
    if (rec.headers?.length) {
      const hm = Object.fromEntries(rec.headers);
      if (hm['trigger-control'] === 'turn-complete') {
        this.tcAt = this.realTcAt = now();
        if (this.foreignTurn()) { this.foreignDone(hm); return; }
        const lateTok = hm['public-access-token'] || runTokIn(rec.headers.map(x => x?.[1]).join(' ')) || runTokIn(rec.body) || null;
        if (!this.live && this.endAt && now() - this.endAt < 15000) {
          if (lateTok && lateTok !== this.idTok && /read:runs:run_/.test(JSON.stringify(jwt(lateTok)?.scopes || ''))) { this.runTok = lateTok; this.runAt = now(); Bus.emit('runtoken', this); this.identify(lateTok); }
          if (!this.busy) return 'done';
          if (!this.turnInput && this.sentAt >= this.endAt) return;
        }
        this.finishTurn(lateTok); return 'done';
      }
      // 运行一开始记录头里就带本轮运行令牌（read:runs）：立即开始识别模型，不等回复结束
      const hTok = hm['public-access-token'];
      if (typeof hTok === 'string' && hTok.length > 20) this.setToken(hTok);
      const tk = hTok || runTokIn(rec.headers.map(x => x?.[1]).join(' '));
      if (tk && tk !== this.runTok && /read:runs:run_/.test(JSON.stringify(jwt(tk)?.scopes || ''))) { this.runTok = tk; this.runAt = now(); Bus.emit('runtoken', this); this.identify(tk); }
    }
    if (!rec.body) return;
    // 新版传输：本轮运行令牌也可能放在记录内容里（例如 {type:'trigger:turn-complete', publicAccessToken}），不一定在记录头
    const rt = runTokIn(rec.body);
    if (rt && rt !== this.runTok) { this.runTok = rt; this.runAt = now(); Bus.emit('runtoken', this); this.identify(rt); }
    let b; try { b = JSON.parse(rec.body); } catch { return; }
    const tcc = [b, b?.data, b?.chunk].find(x => x?.type === 'trigger:turn-complete');
    if (tcc) {
      this.tcAt = this.realTcAt = now();
      if (this.foreignTurn()) { this.foreignDone({ 'public-access-token': tcc.publicAccessToken || rt || '' }); return; }
      const lateTok = tcc.publicAccessToken || rt || null;
      if (!this.live && this.endAt && now() - this.endAt < 15000) {
        if (lateTok && lateTok !== this.idTok && /read:runs:run_/.test(JSON.stringify(jwt(lateTok)?.scopes || ''))) { this.runTok = lateTok; this.runAt = now(); Bus.emit('runtoken', this); this.identify(lateTok); }
        if (!this.busy) return 'done';
        if (!this.turnInput && this.sentAt >= this.endAt) return;
      }
      this.finishTurn(lateTok); return 'done';
    }
    const ch = b?.data; if (ch?.type && !String(ch.type).startsWith('trigger:')) { this.recTs = +rec.timestamp || 0; try { this.apply(ch); } finally { this.recTs = 0; } }
  }
  liveMsg(create) {
    if (this.live) return this.live;
    // 在补答之前的消息（自己这条已经在末尾）：接到自己这条前面那条进行中的回复上，没有就插在自己这条前面
    if (this.foreignTurn()) {
      const ia = this.messages.findIndex(x => x && (x.id === this.awaitId || x.metadata?.nodeId === this.awaitId));
      if (ia > 0) {
        const pv = this.messages[ia - 1];
        if (pv.role === 'assistant' && pv.metadata?.pending) { this.live = pv; return pv; }
        if (!create) return null;
        const m = { id: uuid7(), role: 'assistant', parts: [], metadata: { pending: true }, v: 0 };
        this.messages.splice(ia, 0, m); this.live = m; return m;
      }
    }
    const last = this.messages.at(-1);
    const iaSelf = (!this.foreignTurn() && this.awaitId)
      ? this.messages.findIndex(x => x && (x.id === this.awaitId || x.metadata?.nodeId === this.awaitId))
      : -1;
    if (last && last.role === 'assistant' && (last.metadata?.pending || this.busy)) {
      const lastIdx = this.messages.length - 1;
      if (iaSelf < 0 || lastIdx > iaSelf) { this.live = last; return last; }
    }
    if (!create) return null;
    const m = { id: uuid7(), role: 'assistant', parts: [], metadata: { pending: true }, v: 0 };
    if (iaSelf >= 0) {
      let insAt = iaSelf + 1;
      while (insAt < this.messages.length && this.messages[insAt]?.role === 'assistant') insAt++;
      this.messages.splice(insAt, 0, m);
    } else {
      this.messages.push(m);
    }
    this.live = m; return m;
  }
  apply(ch) {
    try { if (typeof BillingProbe !== 'undefined') BillingProbe.observe(this, ch); } catch {}
    const t = ch.type;
    if (t === 'start') {
      let m = ch.messageId ? this.messages.find(x => x.id === ch.messageId) : null;
      if (m && !this.awaitId && !m.metadata?.pending && !m._incomplete && Boolean(m.metadata?.timing?.completedAt || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn' || m.metadata?.aborted || m.metadata?.error)) {
        return;
      }
      const fg = this.foreignTurn();
      const iaSelf = (!fg && this.awaitId)
        ? this.messages.findIndex(x => x && (x.id === this.awaitId || x.metadata?.nodeId === this.awaitId))
        : -1;
      // 重放正在进行的一轮：服务器快照里的那条 pending 回复和流里的 messageId 可能不一致，复用它，避免出现两条回复
      if (!m && !fg) {
        const lt = this.messages.at(-1);
        const ltIdx = this.messages.length - 1;
        if (lt && lt.role === 'assistant' && lt.metadata?.pending && !lt._local && (iaSelf < 0 || ltIdx > iaSelf)) m = lt;
      }
      for (let fi = this.messages.length - 1; fi >= 0; fi--) {
        if (this.messages[fi]?.role === 'user' && this.messages[fi]?.failed) {
          try { SentUserLog.demoteToQueue?.(this, this.messages[fi], { silent: true, running: true }); } catch {}
        }
      }
      if (m) {
        if (!Array.isArray(m.parts)) m.parts = [];
        if (!fg && iaSelf >= 0) {
          const curMIdx = this.messages.indexOf(m);
          if (curMIdx >= 0 && curMIdx < iaSelf) {
            const selfMsg = this.messages[iaSelf];
            const mHasPriorWork = (m.parts || []).some(p => p && p.type !== 'step-start') || (selfMsg?._prevAsstId && selfMsg._prevAsstId === m.id);
            if (mHasPriorWork && selfMsg?.role === 'user' && selfMsg._local && !selfMsg._appendAccepted && !this.oursAt) {
              try { SentUserLog.demoteToQueue?.(this, selfMsg, { silent: true, running: true }); } catch {}
            } else {
              this.messages.splice(curMIdx, 1);
              const newIa = this.messages.findIndex(x => x && (x.id === this.awaitId || x.metadata?.nodeId === this.awaitId));
              if (newIa >= 0) this.messages.splice(newIa + 1, 0, m);
              else this.messages.push(m);
            }
          }
        }
      } else {
        m = { id: ch.messageId || uuid7(), role: 'assistant', parts: [], metadata: {}, v: 0 };
        // 服务器在补答之前的某条消息：放到那条消息后面，而不是当成最新这条的回复
        let at = fg ? this.slotAfter(this.turnInput) : -1;
        if (fg && at < 0) at = this.messages.findIndex(x => x && (x.id === this.awaitId || x.metadata?.nodeId === this.awaitId));   // 本地没有的那条：回复放在自己这条前面
        if (!fg && iaSelf >= 0) {
          let insAt = iaSelf + 1;
          while (insAt < this.messages.length && this.messages[insAt]?.role === 'assistant') insAt++;
          at = insAt < this.messages.length ? insAt : -1;
        }
        if (at >= 0) this.messages.splice(at, 0, m); else this.messages.push(m);
      }
      m.metadata = { ...(m.metadata || {}), ...(ch.messageMetadata || {}), pending: true };
      { const ts = this.recTs || now(), d = this.recTs ? this.dispTs : this.dispAt; this.fmt = Fmt.fresh(d && ts >= d && ts - d < 600000 ? d : ts); m._fmt = this.fmt; } this.fmtGuess = null;   // 回复格式识别：每一轮重新收集
      if (!this.foreignTurn()) { this.oursAt = this.oursAt || now(); clearTimeout(this.startT); if (this.stopPending) setTimeout(() => this.stop(), 0); }
      // 不是自己发起的这一轮（网页 / 别的设备提交了回答或发了消息）：把那条用户消息补进来，提问卡片同步成已回答
      for (const um of this.messages) {
        if (um && um._local && um.role === 'user') {
          um._appendAccepted = true;
          try { SentUserLog.record(this.sid, um, um._prevAsstId || null); } catch {}
        }
      }
      try { SentUserLog.restoreInto(this); } catch {}
      if (!this.gacha && (!this.awaitId || this.foreignTurn() || (typeof SentUserLog !== 'undefined' && SentUserLog.hasAdjacentAsstGap && SentUserLog.hasAdjacentAsstGap(this.messages)))) this.reconcile(400);
      this.live = m; this._contentKey = ''; this.parts.clear();
      this.saveCache?.();
      this._snapTextParts = []; this._snapReasonParts = [];
      for (const p of m.parts || []) {
        if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
        else if (p?.type === 'text') {
          if (p.id) { p._replayBuf = ''; this.parts.set('t:' + p.id, p); }
          else this._snapTextParts.push(p);
        } else if (p?.type === 'reasoning') {
          if (p.id) { p._replayBuf = ''; this.parts.set('r:' + p.id, p); }
          else this._snapReasonParts.push(p);
        }
      }
      this.status = this.status === 'stopping' ? 'stopping' : 'streaming'; this.phase = '生成中'; this.emit(); return;
    }
    if (t.startsWith('data-') && ch.transient) {
      if (t === 'data-agent-dispatch') {
        this.turnInput = ch.data?.inputId || (this.waitingForeign ? this.turnInput : this.awaitId || null); this.dispAt = now(); this.dispTs = this.recTs || 0; clearTimeout(this.wakeT);
        if (this.foreignTurn()) { this.phase = '服务器在补答之前的消息'; this.emit(); return; }
        if (this.awaitId && (!ch.data?.inputId || this.turnInput === this.awaitId || !this.foreignTurn())) {
          this.oursAt = this.oursAt || now(); this.dlv = 'taken'; clearTimeout(this.lostT); this.watchStart(this.awaitId);
          if (this.stopPending) setTimeout(() => this.stop(), 0);
        }
        const subName = ch.data?.agentName || ch.data?.subagent || ch.data?.targetAgent || ch.data?.recipient || ch.data?.model || '';
        if (!this.live) this.phase = subName ? ('正在询问 ' + subName + '…') : (this.oursAt ? '服务器已接单，正在思考…' : '服务器在处理');
        if (this.status === 'submitted' && this.oursAt) this.status = 'streaming';
      }
      else if (t === 'data-workspace-save-status') this.phase = '保存工作区 · ' + (ch.data?.phase || '');
      else {
        if (this.awaitId && !this.foreignTurn()) {
          this.oursAt = this.oursAt || now(); this.dlv = 'taken'; clearTimeout(this.lostT);
          if (this.status === 'submitted') this.status = 'streaming';
        }
        const subName = ch.data?.agentName || ch.data?.subagent || ch.data?.targetAgent || ch.data?.recipient || '';
        const statusTxt = ch.data?.status || ch.data?.message || ch.data?.phase || '';
        if (!this.live && (subName || statusTxt)) this.phase = subName ? ('正在询问 ' + subName + '…') : String(statusTxt);
      }
      this.emit(); return;
    }
    // 回复格式识别（拿不到运行记录时按格式推测厂商）
    if (this.fmt) { try { Fmt.feed(this.fmt, ch, this.recTs || now()); const g = Fmt.guess(this.fmt); if (g && (g.fam !== this.fmtGuess?.fam || g.sure !== this.fmtGuess?.sure)) { this.fmtGuess = g; Bus.emit('fmt', this, g); } } catch {} }
    // 空闲时收到的零散记录（上一轮结束后的尾巴）不新建回复消息，避免多出一条重复 / 错位的回复
    if (!this.live && ch?.toolCallId && /^(tool-input-delta|tool-input-available|tool-input-error|tool-output-available|tool-output-error|tool-output-denied|tool-approval-request)$/.test(t)) {
      const ownerM = [...(this.messages || [])].reverse().find(x => x?.role === 'assistant' && Array.isArray(x.parts) && x.parts.some(p => p && p.toolCallId === ch.toolCallId));
      if (ownerM) {
        const ownerDone = Boolean(ownerM.metadata?.timing?.completedAt || ownerM.metadata?.finishReason === 'stop' || ownerM.metadata?.finishReason === 'end-turn' || ownerM.metadata?.aborted || ownerM.metadata?.error || (ownerM._finishedAt && now() - ownerM._finishedAt > 15000));
        if (ownerM !== this.messages.at(-1) && !ownerDone && !this.stopReq && !Hitl.idleWait(this)) {
          const ownerIdx = this.messages.indexOf(ownerM);
          if (ownerIdx >= 0 && this.messages.slice(ownerIdx + 1).every(x => x && x.role === 'user' && (x.failed || (x._local && !x._appendAccepted && !this.oursAt)))) {
            for (let ui = this.messages.length - 1; ui > ownerIdx; ui--) {
              try { SentUserLog.demoteToQueue?.(this, this.messages[ui], { silent: true, running: true }); } catch {}
            }
          }
        }
        if (ownerM === this.messages.at(-1) && !ownerDone && !this.stopReq && !Hitl.idleWait(this)) {
          ownerM.metadata = { ...(ownerM.metadata || {}), pending: true };
          delete ownerM._finishedAt;
          this.live = ownerM;
          this.status = 'streaming'; this.phase = '生成中';
          this.parts.clear();
          for (const p of ownerM.parts || []) {
            if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            else if ((p?.type === 'text' || p?.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          }
        } else {
          const tp = ownerM.parts.find(p => p && p.toolCallId === ch.toolCallId);
          if (tp) {
            if (t === 'tool-input-delta' && tp.state !== 'output-available') tp.inputText = (tp.inputText || '') + (ch.inputTextDelta || '');
            else if (t === 'tool-input-available' || t === 'tool-input-error') { tp.input = ch.input; tp.state = t === 'tool-input-error' ? 'output-error' : 'input-available'; if (ch.errorText) tp.errorText = ch.errorText; }
            else if (t === 'tool-output-available') { tp.output = ch.output; tp.state = 'output-available'; tp.preliminary = !!ch.preliminary; delete tp.errorText; if (!tp.preliminary) { tp._endAt = this.recTs || now(); if (tp._startAt && !tp._durMs) tp._durMs = Math.max(0, tp._endAt - tp._startAt); } }
            else if (t === 'tool-output-error') { tp.errorText = ch.errorText; tp.state = 'output-error'; }
            else if (t === 'tool-output-denied') tp.state = 'output-denied';
            else if (t === 'tool-approval-request') tp.state = 'approval-requested';
            ownerM.v = (ownerM.v || 0) + 1;
            this.emit();
            return;
          }
        }
      }
    }
    if (!this.live && (this.status === 'idle' || this.status === 'error')) {
      const isStreamChunk = (t === 'start-step' || t === 'text-start' || t === 'text-delta' || t === 'reasoning-start' || t === 'reasoning-delta' || t === 'tool-input-start' || t === 'tool-input-available' || t === 'tool-output-available');
      if (isStreamChunk) {
        for (let fi = this.messages.length - 1; fi >= 0; fi--) {
          const fm = this.messages[fi];
          if (!fm) continue;
          if (fm.role === 'assistant') break;
          if (fm.role === 'user' && (fm.failed || (fm._local && !fm._appendAccepted && !this.oursAt && this.messages[fi - 1]?.role === 'assistant' && !this.messages[fi - 1]?.metadata?.timing?.completedAt && !this.messages[fi - 1]?._finishedAt))) {
            try { SentUserLog.demoteToQueue?.(this, fm, { silent: true, running: true }); } catch {}
          }
        }
      }
      const lm = this.messages.at(-1);
      const lmExplicitlyDone = Boolean(lm?.metadata?.timing?.completedAt || lm?.metadata?.finishReason === 'stop' || lm?.metadata?.finishReason === 'end-turn' || lm?.metadata?.aborted || lm?.metadata?.error);
      const lmCompAt = lm?._finishedAt || Date.parse(lm?.metadata?.timing?.completedAt || lm?.createdAt || '') || (typeof idTime === 'function' ? idTime(lm?.id) : 0) || 0;
      const canReopenTailAsst = Boolean(lm?.role === 'assistant' && !lm.metadata?.pending && (lm._forcedFinish || lm._incomplete || (!lmExplicitlyDone && typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(lm)) || (!lmExplicitlyDone && (!lmCompAt || (now() - lmCompAt < 15000)))) && !this.stopReq && !Hitl.idleWait(this) && isStreamChunk);
      if (canReopenTailAsst) {
        lm.metadata = { ...(lm.metadata || {}), pending: true };
        delete lm._finishedAt;
        this.live = lm;
        this.parts.clear();
        for (const p of lm.parts || []) {
          if (p?.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
          else if ((p?.type === 'text' || p?.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
        }
      }
      const canPromote = (lm?.role === 'user' || lm?.metadata?.pending || canReopenTailAsst) && !Hitl.idleWait(this) && isStreamChunk;
      if (canPromote) {
        this.status = 'streaming'; this.phase = '生成中'; this.error = null;
        this.liveMsg(true);
      } else {
        this.dbg?.('drop', { ty: t, why: 'idle-no-live' }); return;
      }
    }
    // 已点停止：之后到达的输出不再显示（界面立刻停下，不跟着服务器再多吐几行）
    if (this.status === 'stopping' && /^(start-step|text-start|text-delta|reasoning-start|reasoning-delta|tool-input-start|tool-input-delta)$/.test(t)) return;
    if (!this.live && /^(finish|finish-step|text-end|reasoning-end|message-metadata)$/.test(t)) {
      if (t === 'message-metadata' && ch.messageMetadata && typeof ch.messageMetadata === 'object') {
        const lastA = [...(this.messages || [])].reverse().find(x => x && x.role === 'assistant');
        if (lastA) {
          lastA.metadata = { ...(lastA.metadata || {}), ...ch.messageMetadata };
          lastA.v = (lastA.v || 0) + 1;
          this.emit();
        }
      } else {
        this.dbg?.('drop', { ty: t, why: 'no-live-closing' });
      }
      return;
    }
    const m = this.liveMsg(true); if (this.fmt && !m._fmt) m._fmt = this.fmt; m.v++;
    if (this.status === 'submitted') this.status = 'streaming';
    this.progAt = now();
    if (!/^(finish|finish-step|message-metadata|error|abort)$/.test(t)) {
      if (this.finAt) { this.finAt = 0; clearTimeout(this._finTurnT); this._finTurnT = 0; }
      if (this.sentAt && !(this.respAt >= this.sentAt)) { this.respAt = now(); if (this.rcV3) { this.rcV3 = false; IPRep.note('ok'); } }
    }
    const P = m.parts, find = id => this.parts.get(id);
    switch (t) {
      case 'start-step': if (P.at(-1)?.type !== 'step-start') P.push({ type: 'step-start' }); break;
      case 'finish-step': this.parts.forEach((p, k) => { if (!String(k).startsWith('tool:')) this.parts.delete(k); }); this.saveCache?.(); break;
      case 'text-start': case 'reasoning-start': {
        // 抽卡：正文后出现可见思考时按开关停止；不把它当作改派证明，已知闭源除外
        const pType = t.split('-')[0], key = t[0] + ':' + ch.id;
        let p = ch.id != null ? find(key) : null;
        if (!p) {
          const snapQ = pType === 'text' ? this._snapTextParts : this._snapReasonParts;
          if (snapQ?.length) {
            p = snapQ.shift();
            if (ch.id != null) p.id = String(ch.id);
            p.state = 'streaming';
            p._replayBuf = '';
          }
        } else if (p.text) {
          p._replayBuf = '';
          p.state = 'streaming';
        }
        if (!p) {
          p = { type: pType, text: '', state: 'streaming', ...(ch.id != null ? { id: String(ch.id) } : {}) };
          P.push(p);
        }
        this.parts.set(key, p);
        this.phase = t === 'text-start' ? '输出中' : '思考中';
        break;
      }
      case 'text-delta': case 'reasoning-delta': {
        const pType = t.split('-')[0], key = t[0] + ':' + ch.id;
        let p = find(key);
        if (!p) {
          const snapQ = pType === 'text' ? this._snapTextParts : this._snapReasonParts;
          if (snapQ?.length) {
            p = snapQ.shift();
            if (ch.id != null) p.id = String(ch.id);
            p.state = 'streaming';
            p._replayBuf = '';
          } else {
            p = { type: pType, text: '', state: 'streaming', ...(ch.id != null ? { id: String(ch.id) } : {}) };
            P.push(p);
          }
          this.parts.set(key, p);
        }
        if (p.type === 'reasoning' && /[^\s.…·。]/.test(String(ch.delta || ''))) { const firstVis = !/[^\s.…·。]/.test(p.text); const isClosed = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.isClosed(this)) || (typeof Fingerprint !== 'undefined' && Fingerprint.isClosedSourceStream?.(this)); if (!isClosed) { if (firstVis) { this.thinkGuard(p); try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') BillingProbe.markAsOpenSourceModel(this); } catch {} } try { if (this.gacha?.skipCompatThinking && typeof Fingerprint !== 'undefined') Fingerprint.maybeStopCompat?.(this); } catch {} if (firstVis && this.gacha?.stopThink && !this.stopReq && P.some(x => x !== p && x.type === 'text' && String(x.text || '').trim())) { this.thinkStopped = true; this.routedThink = true; if (this.live) this.live.metadata = { ...(this.live.metadata || {}), openThinkStopped: true }; setTimeout(() => this.stop(), 0); } } }
        const dStr = ch.delta || '';
        if (typeof p._replayBuf === 'string') {
          p._replayBuf += dStr;
          if (p._replayBuf.length >= (p.text || '').length || !String(p.text || '').startsWith(p._replayBuf)) {
            p.text = p._replayBuf;
            delete p._replayBuf;
          }
        } else {
          p.text += dStr;
        }
        if (t === 'text-delta' || t === 'reasoning-delta') this.checkMidStreamRoute(t, ch);
        if (now() - (this._streamCacheAt || 0) > 1500) { this._streamCacheAt = now(); this.saveCache?.(); }
        break;
      }
      case 'text-end': case 'reasoning-end': { const p = find(t[0] + ':' + ch.id); if (p) { if (typeof p._replayBuf === 'string') { if (p._replayBuf.length >= (p.text || '').length) p.text = p._replayBuf; delete p._replayBuf; } p.state = 'done'; } break; }
      case 'tool-input-start': {
        let p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId);
        if (!p) {
          p = { type: ch.dynamic ? 'dynamic-tool' : 'tool-' + ch.toolName, toolName: ch.toolName, toolCallId: ch.toolCallId, state: 'input-streaming', inputText: '', _startAt: this.recTs || now() };
          P.push(p);
        } else if (p.state !== 'output-available' && p.state !== 'input-available') {
          p.inputText = '';
          p.state = 'input-streaming';
        }
        this.parts.set('tool:' + ch.toolCallId, p);
        this.phase = '调用 ' + ch.toolName;
        this.checkMidStreamRoute(t, ch);
        this.saveCache?.();
        break;
      }
      case 'tool-input-delta': { const p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId); if (p && p.state !== 'output-available' && p.state !== 'input-available') p.inputText = (p.inputText || '') + (ch.inputTextDelta || ''); this.saveCache?.(); break; }
      case 'tool-input-available': case 'tool-input-error': {
        let p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId);
        if (!p) { p = { type: ch.dynamic ? 'dynamic-tool' : 'tool-' + ch.toolName, toolName: ch.toolName, toolCallId: ch.toolCallId, _startAt: this.recTs || now() }; P.push(p); this.parts.set('tool:' + ch.toolCallId, p); } else if (!p._startAt) { p._startAt = this.recTs || now(); }
        p.input = ch.input; if (p.state !== 'output-available') p.state = t === 'tool-input-error' ? 'output-error' : 'input-available'; if (ch.errorText) p.errorText = ch.errorText;
        // 提问工具的参数能解析出题目：按「等待回答」显示面板（和网页一致），报错文字只留作诊断
        if (t === 'tool-input-error' && Hitl.name(p) === 'ask_user' && Array.isArray(Hitl.input(p)?.questions)) { p.state = 'input-available'; p.softError = ch.errorText || ''; }
        this.phase = '执行 ' + (ch.toolName || p.toolName || '工具');
        this.saveCache?.(); break;
      }
      case 'tool-output-available': { const p = find('tool:' + ch.toolCallId) || P.find(x => x.toolCallId === ch.toolCallId); if (p) { p.output = ch.output; p.state = 'output-available'; p.preliminary = !!ch.preliminary; delete p.errorText; if (!p.preliminary) { p._endAt = this.recTs || now(); if (p._startAt && !p._durMs) p._durMs = Math.max(0, p._endAt - p._startAt); } } this.saveCache?.(); break; }
      case 'tool-output-error': { const p = find('tool:' + ch.toolCallId) || P.find(x => x.toolCallId === ch.toolCallId); if (p) { if (Hitl.name(p) === 'ask_user' && /malformed|refresh and try again/i.test(String(ch.errorText || '')) && Array.isArray(Hitl.input(p)?.questions)) { p.softError = ch.errorText; if (p.state !== 'output-available') p.state = 'input-available'; } else { p.errorText = ch.errorText; p.state = 'output-error'; } } break; }
      case 'tool-output-denied': { const p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId); if (p) p.state = 'output-denied'; break; }
      case 'tool-approval-request': { const p = find('tool:' + ch.toolCallId) || P.find(x => x && x.toolCallId === ch.toolCallId); if (p) p.state = 'approval-requested'; break; }
      case 'source-url': case 'source-document': case 'file': P.push({ ...ch }); break;
      case 'message-metadata': m.metadata = { ...m.metadata, ...(ch.messageMetadata || {}) }; break;
      case 'finish': {
        const fr = ch.finishReason || ch.messageMetadata?.finishReason || m.metadata?.finishReason || '';
        if (fr) m.metadata.finishReason = fr;
        const hasOpenTool = P.some(p => p.toolCallId && /^(input-streaming|input-available|approval-requested)$/.test(p.state || '') && !Hitl.name(p));
        if (fr === 'tool-calls' || hasOpenTool) {
          this.finAt = 0;
          clearTimeout(this._finTurnT);
          this._finTurnT = 0;
          break;
        }
        this.finAt = now(); m._finishedAt = this.finAt;
        m.metadata = { ...m.metadata, ...(ch.messageMetadata || {}), pending: false };
        P.forEach(p => { if (p.state === 'streaming') p.state = 'done'; });
        this.phase = '收尾中';
        clearTimeout(this._finTurnT);
        const finMsg = m;
        this._finTurnT = setTimeout(() => {
          if (this.live === finMsg && this.busy && !this.stopReq && this.finAt) {
            const stillOpen = (finMsg.parts || []).some(p => p.toolCallId && /^(input-streaming|input-available|approval-requested)$/.test(p.state || '') && !Hitl.name(p));
            if (!stillOpen) this.finishTurn(this.runTok || null, true);
          }
        }, 750);
        break;
      }
      case 'error': {
        // 「工具响应格式错误」但这一条里有等待回答的提问：网页照常显示面板，这里也不报错、不弹重试，以服务器记录为准
        const rawErr = String(ch.errorText || '未知错误');
        if (/malformed|refresh and try again/i.test(rawErr) && P.some(x => Hitl.awaiting(x))) { this.softErr = rawErr; break; }
        const isOfficial = isOfficialTransientError(rawErr);
        const displayErr = formatOfficialErrorText(rawErr);
        if (!P.some(x => x && x.type === 'error' && x.text === displayErr)) {
          P.push({ type: 'error', text: displayErr, ...(displayErr !== rawErr ? { rawText: rawErr } : {}) });
        }
        this.error = displayErr || '模型返回错误'; this.errAt = now(); this.errText = rawErr;
        this._officialTurnErrAt = isOfficial ? this.errAt : 0;
        const lastU = [...this.messages].filter(x => x && x.role === 'user').at(-1);
        const isGraphReject = /The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(rawErr);
        if (lastU) {
          if (isGraphReject) {
            lastU._streamRejected = true;
            delete lastU._officialContinueParent;
          } else if (isOfficial && (lastU._appendAccepted || this.oursAt || P.length > 1 || !lastU._local)) {
            lastU._officialContinueParent = true;
            delete lastU._streamRejected;
          } else if (!isHitlToolResultUserMsg(lastU)) {
            lastU._streamRejected = true;
          }
        }
        if (isGraphReject && this._lastSentParentUserId) {
          const rejPid = String(this._lastSentParentUserId);
          (this._rejectedHealthyNodeIds ||= new Set()).add(rejPid);
          const rejU = (this.messages || []).find(x => x && x.role === 'user' && (String(x.metadata?.nodeId || '') === rejPid || String(x.id || '') === rejPid));
          if (rejU) { delete rejU._officialContinueParent; rejU._streamRejected = true; }
        }
        if (this.busy && !this.stopReq) {
          clearTimeout(this._errTurnT);
          const errMsg = m;
          this._errTurnT = setTimeout(() => {
            if (this.live === errMsg && this.busy && !this.stopReq) {
              this.finishTurn(this.runTok || null, true);
            }
          }, isOfficial && !isGraphReject ? 600 : 1200);
        }
        break;
      }
      case 'abort':
        m.metadata = { ...m.metadata, aborted: true, pending: false };
        m._finishedAt = m._finishedAt || now();
        for (const p of m.parts || []) if (p.state === 'streaming') p.state = 'done';
        try { Strength.markAborted(this.sid); } catch {}
        this.phase = '已中止';
        clearTimeout(this._finTurnT);
        this._finTurnT = setTimeout(() => { if (this.live === m && (typeof Hitl === 'undefined' || !Hitl.idleWait(this))) this.finishTurn(); }, 1500);
        break;
      default:
        if (t.startsWith('data-')) { const ex = ch.id ? P.find(x => x.type === t && x.id === ch.id) : null; if (ex) ex.data = ch.data; else P.push({ type: t, id: ch.id, data: ch.data }); }
    }
    ThinkingStatus.eventPhase(this, ch);
    try { Fingerprint.maybeStopCompat(this); Fingerprint.maybeGuardProbe(this); } catch {}
    if ((t === 'finish' || t === 'tool-output-available' || t === 'tool-input-available') && Hitl.idleWait(this)) this.armHitl();
    if (t === 'text-delta' || t === 'reasoning-delta' || t === 'tool-input-delta') this.emitStreamSoon(20);
    else this.emit();
  }
  // 提问卡片兜底：已经停在「等用户回应」，但结束标记迟迟没到（连接抖动 / 服务器没推）——4 秒内没有新记录就本地收尾，并和服务器对一次账
  armHitl() {
    clearTimeout(this.hitlT);
    const live = this.live;
    const waitMs = this.gacha ? 1600 : 4000;
    this.hitlT = setTimeout(() => {
      if (!live || this.live !== live || !Hitl.idleWait(this)) return;
      if (now() - (this.recAt || 0) < (this.gacha ? 1200 : 3500)) { this.armHitl(); return; }
      this.finishTurn(null, true);
    }, waitMs);
  }
  finishTurn(runTok, forced) {
    clearTimeout(this._finTurnT);
    clearTimeout(this._errTurnT);
    if ((this.waitingForeign || (this.preSend && this.awaitId)) && !this.stopReq) {
      if (forced && this.streaming) { this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null; }
      this.foreignDone(runTok ? { 'public-access-token': runTok } : {});
      return;
    }
    if (forced && this.streaming) { this.gen++; try { this.ctl?.abort(); } catch {} this.streaming = false; this.ctl = null; }
    const m = this.live;
    this.dbg?.('finish', { forced: !!forced, parts: m?.parts?.length ?? null, ask: !!m?.parts?.some(p => p.toolCallId && Hitl.name(p)), seq: this.lastSeq, n: this.trcN || 0 }); this.trcN = 0;
    this.endAt = now(); this.tcAt = Math.max(this.tcAt || 0, this.endAt); this.endStop = !!this.stopReq;
    if (m && typeof Budget !== 'undefined') try { Budget.turn(this, m); } catch {}   /* 记一笔估算花费，用来推断总额度 / 余额 */
    this.fakeEnd = null; this.midTurnStall = null;
    if (m && !this.stopReq) {
      const lastP = m.parts.filter(p => p.type !== 'step-start').at(-1);
      const hasConcludingText = Boolean(lastP?.type === 'text' && String(lastP.text || '').trim().length > 0 && (this.finAt || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn'));
      const open = m.parts.filter(p => p.toolCallId && (/^(input-streaming|input-available)$/.test(p.state || '') || (!hasConcludingText && p === lastP && p.state === 'output-available' && p.output && typeof p.output === 'object' && p.output.status === 'running')));
      const ask = open.some(p => Hitl.name(p) || /(^|[-_])(ask|question|confirm|approval|choice|select|form|clarif|human|user[-_]?input)/i.test(String(p.toolName || p.type || '')));
      if (open.length && !ask && !hasConcludingText) this.fakeEnd = { at: now(), why: (open[0].toolName || '工具') + ' 还没返回结果就结束了（假结束）', key: 'open|' + m.id + '|' + m.parts.length };
      else if (forced && !this.finAt && lastP && lastP.type === 'text' && lastP.state === 'streaming' && m.metadata?.pending !== false) this.fakeEnd = { at: now(), why: '回复写到一半就结束了（假结束）', key: 'cut|' + m.id + '|' + m.parts.length };
      if (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled) {
        const stall = KeepAlive.isMidTurnStalled(this, m);
        if (stall) this.midTurnStall = { at: now(), why: stall.why, key: stall.key };
      }
    }
    if (m) {
      m._finishedAt = now();
      m._forcedFinish = Boolean(forced && !this.finAt && !this.stopReq);
      delete m._incomplete;
      m.metadata = { ...m.metadata, pending: false };
      if (!m.metadata.timing?.completedAt) m.metadata.timing = { ...(m.metadata.timing || {}), startedAt: m.metadata.timing?.startedAt || this.oursAt || this.dispAt || 0, completedAt: now() }; if (this.stopReq) { m.metadata.aborted = true; if (this.thinkStopped || this.routedThink) m.metadata.openThinkStopped = true; try { Strength.markAborted(this.sid); } catch {} }
      m.parts.forEach(p => {
        if (p.state === 'streaming') p.state = 'done';
        if (p.toolCallId && !(Hitl.name(p) && !this.stopReq) && /^(input-streaming|input-available|approval-requested)$/.test(p.state || '')) {
          if (this.stopReq) { p.state = 'output-error'; p.errorText = '已停止'; delete p._interruptedPending; }
          else { p.state = 'output-error'; if (!p.errorText) p.errorText = '未返回结果'; if (forced && !this.finAt) p._interruptedPending = true; }
        }
        if (p.preliminary) p.preliminary = false;
      });
      if (!this.stopReq && !this.midTurnStall && typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled) {
        const stallAfter = KeepAlive.isMidTurnStalled(this, m);
        if (stallAfter) this.midTurnStall = { at: now(), why: stallAfter.why, key: stallAfter.key };
      }
      m.v++;
    } else {
      const lastA = (this.messages || []).at(-1);
      if (lastA?.role === 'assistant') {
        lastA._finishedAt = lastA._finishedAt || now();
        lastA.metadata = { ...(lastA.metadata || {}), pending: false };
        if (!this.stopReq && !this.midTurnStall && typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled) {
          const stallLast = KeepAlive.isMidTurnStalled(this, lastA);
          if (stallLast) this.midTurnStall = { at: now(), why: stallLast.why, key: stallLast.key };
        }
      }
    }
    this.stopReq = false; this.stopPending = false;
    const was = this.status, identityInput = this.turnInput, doneAwaitId = this.awaitId;
    if (runTok && runTok !== this.runTok && /read:runs:run_/.test(JSON.stringify(jwt(runTok)?.scopes || ''))) { this.runTok = runTok; this.runAt = now(); Bus.emit('runtoken', this); }
    this._recoveringIncomplete = false; this._startupResuming = false;
    this.live = null; this.parts.clear(); this.phase = ''; this.status = this.error && !m ? 'error' : 'idle';
    this.awaitFrom = 0; this.awaitId = null; this.turnInput = null; clearTimeout(this.wakeT); clearTimeout(this.lostT); clearTimeout(this.startT); this.dlv = ''; this.oursAt = 0;
    if (this.status === 'idle' && (m || (this.messages || []).at(-1)?.role === 'assistant')) {
      for (const ackId of [doneAwaitId, identityInput]) {
        if (!ackId) continue;
        (this._oOk ||= new Set()).add(ackId);
        try { if (typeof Drafts !== 'undefined') Drafts.ack?.(ackId); } catch {}
      }
      if (Array.isArray(this.messages) && this.messages.length > 0) this.loaded = true;
    }
    this.emit();
    if (this.status === 'idle' && !this.fakeEnd && typeof SendQ !== 'undefined' && (SendQ.of?.(this)?.length || (this.queue || []).length)) {
      if (this.midTurnStall) this.midTurnStall = null;
      setTimeout(() => { try { SendQ.check(this); } catch {} }, 50);
    }
    if (this.loaded && typeof MsgCache !== 'undefined' && MsgCache.putNow) void MsgCache.putNow(this).catch(() => {});
    // 一轮结束后再看一眼实时通道：把尾巴读掉（位置保持最新），如果服务器接着又开了一轮（长任务续跑）就直接接上显示
    if (!this.gacha && !this.fakeEnd && !this.midTurnStall) { clearTimeout(this.tailT); this.tailT = setTimeout(() => { if (!this.busy && !this.streaming && !this.midTurnStall && !this.fakeEnd && this.loaded) this.stream({ peek: true }); }, 1500); }
    // 涉及提问卡片的一轮结束后，和服务器对一次账：回答（不管在哪提交的）、节点 id、卡片状态都以服务器为准
    // 每轮结束后都和服务器对一次账：漏掉的记录 / 别处的改动以服务器为准补齐（和网页一致，不必手动刷新）
    clearTimeout(this.hitlT);
    const isKeptOrActive = !this.gacha || (typeof History !== 'undefined' && History.byId?.(this.sid)) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid);
    const hasRecentHitl = this.messages.slice(-4).some(x => x.parts?.some(p => p.toolCallId && Hitl.name(p)));
    const hasAsstGap = typeof SentUserLog !== 'undefined' && SentUserLog.hasAdjacentAsstGap && SentUserLog.hasAdjacentAsstGap(this.messages);
    const recoDelay = hasRecentHitl ? 900 : 1400;
    if (!this.gacha && (forced || !this.finAt || hasRecentHitl || hasAsstGap || this.fakeEnd || this.midTurnStall)) this.reconcile(recoDelay);
    else if (isKeptOrActive) setTimeout(() => { if (!this.busy && !this.live && this.loaded) void this.reconcile(0).catch(() => {}); }, recoDelay);
    // 服务器记录有时比实时流晚几秒才写好：带提问卡片的一轮结束后再对一次账（卡片已经在就什么都不会变）
    if (isKeptOrActive && this.messages.slice(-2).some(x => x.role === 'assistant' && x.parts?.some(p => p.toolCallId && Hitl.name(p)))) setTimeout(() => { if (!this.live && !this.busy && !this.streaming && this.loaded) this.converge(); }, 5500);
    try { ExtCompat.replayChat(this, true); } catch {}
    if (was !== 'idle') Bus.emit('turn', this, { forced, fake: !!this.fakeEnd, midStall: !!this.midTurnStall });
    if (this.error && /recaptcha|captcha/i.test(this.error) && this.sentAt && now() - this.sentAt < 180000) { if (this.rcV3) { this.rcV3 = false; IPRep.note('rc'); } setTimeout(() => Bus.emit('captcha', this), 0); }
    if (runTok && (runTok !== this.idTok || (Models.get(this.sid)?.partial && !this.identifying))) { this.runTok = runTok; this.identify(runTok, { inputId: identityInput, messageId: m?.id }); }
    else if (m) this.guessModel();
    if (m) try { Calib.turn(this, m); } catch {}   // 强度分：已知型号的对话记成校准样本
    try { FmtAcc.turnEnd(this); } catch {}   // 格式推测核对：这一轮的推测和真实型号对一下
  }
  // 这一轮没有运行令牌（Brana 新建的对话不再下发）：按回复格式推测厂商；已经准确识别过的对话不覆盖
  guessModel(g) {
    // Format guesses are intermediate evidence during fingerprint tests, not a display identity.
    // Keep collecting fmt/fmtGuess (including the thinking-skip guard), but publish only the final fingerprint.
    if (this.gacha?.fingerprint || this.gacha?.mode === 'autoqa' || this.gacha?.mode === 'habit' || (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning(this))) return null;
    try {
      const tsKind = typeof ThinkingStatus !== 'undefined' ? ThinkingStatus.of?.(this)?.kind : null;
      const openThink = tsKind === 'compat-thinking' || tsKind === 'open' || (tsKind !== 'closed-thinking' && !this.thinkStopped && !this.routedThink && Number(this.fmt?.rChars) > 0);
      const live = this.fmt && (this.fmt.ids.length || this.fmt.toolIds?.length || openThink);
      g = g || (live ? Fmt.guess({ ...this.fmt, done: true }) : null);
      if (openThink && (!g || ['gpt', 'claude', 'gemini', 'grok'].includes(g.fam))) {
        g = { fam: 'compat', sure: true, why: '思考块含可见思考文字（开源思考：仅匹配开源模型，绝不匹配闭源模型）' };
      }
      if (!g) return null;
      const old = Models.get(this.sid);
      const oldClosedOnOpen = openThink && tsKind !== 'closed-thinking' && !this.thinkStopped && !this.routedThink && old && /^(gpt|claude|gemini|grok|compat)/i.test(String(old.name || ''));
      if (!oldClosedOnOpen && (old?.fingerprint || old?.reverseInferred || old?.habitInferred || old?.userCorrected || old?.billingProbe || old?.pendingConfirm || (old && old.name && !old.guess))) return null;
      const lastUser = [...(this.messages || [])].reverse().find(x => x?.role === 'user'), std = Fmt.stdPrompt?.((lastUser?.parts || []).filter(p => p.type === 'text').map(p => p.text || '').join('\n'));
      const est = g.est || (live && !this.busy ? Fmt.est(this.fmt, g.fam, std) : null) || (old?.guess && old.name === Fmt.NAME[g.fam] ? old.est : null);
      const e = Fmt.entry(g, est);
      // 同步标题里已经有这个对话的测量结果（别的设备测过指纹 / 接口识别过）：以它为准，格式推测只是弱提示，不能把测过的型号打回「gpt / claude」。
      // 标题里不是测量结果、只是同厂商更具体的名字：同厂商才采用。两种情况都不再显示成「按回复格式推测」。
      try {
        const rm = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(this.sid) : null, tm = String(rm?.model || '').replace(/[（(]推测[）)]/g, '').trim();
        if (tm && !/^未/.test(tm)) {
          const measured = rm.source === 'fingerprint' || rm.source === 'api', sameVendor = typeof Brand !== 'undefined' && !!Brand.of(tm) && Brand.of(tm) === Brand.of(e.name);
          if ((measured || sameVendor) && tm.toLowerCase() !== String(e.name).toLowerCase()) {
            e.name = tm; e.fromTitle = true; e.why = ''; e.provider = '同步标题（另一台设备已测）'; e.sure = true; e.est = null;
          } else if ((measured || sameVendor)) { e.fromTitle = true; e.why = ''; e.provider = '同步标题（另一台设备已测）'; }
        }
      } catch {}
      if (old?.guess && old.name === e.name && old.sure === e.sure && JSON.stringify(old.est || null) === JSON.stringify(e.est || null)) return e;
      Models.set(this.sid, e); Bus.emit('model', this, e); this.emit(); return e;
    } catch { return null; }
  }
  // 识别本轮模型；返回 Promise（抽卡直接等它，不重复请求 Trigger）
  identify(tok, opt = {}) {
    if (this.identifying && this.idTok === tok) return this.idP;
    // A replay token alone does not identify the current turn. Do not attach it
    // to the last message or to a merely queued (not dispatched) input.
    const identityInput = opt.unscoped ? null : (opt.inputId || this.turnInput || null), identityMessage = opt.unscoped ? null : (opt.messageId || this.live?.id || null);
    const reqSid = this.sid, reqOwner = (typeof Acc !== 'undefined' && Acc.cur) ? Acc.cur : '';
    this.identifying = true; this.idTok = tok; this.idErr = null; this.emit();
    const my = this.idP = (async () => {
      try {
        const r = await Trigger.identify(tok, null, 45000, n => { if (this.idTok === tok && this.idP === my && this.sid === reqSid) { this.early = n; this.emit(); } });
        // Account dollar-balance capture retired; per-call cost measurements remain available.
        const casOk = this.idTok === tok && this.idP === my && this.sid === reqSid && (!reqOwner || typeof Acc === 'undefined' || Acc.cur === reqOwner) && (!identityInput || !this.turnInput || this.turnInput === identityInput) && (!identityMessage || !this.live?.id || this.live.id === identityMessage);
        if (r?.name && casOk) {
          const old = Models.get(this.sid);
          // 已经有完整结果（带内部名称）时，不让这次只识别到一部分的结果覆盖掉；再用 Trace 补一次
          if (!(r.partial && old && !old.partial && !old.guess && old.name && ((identityInput && old.inputId === identityInput) || (identityMessage && old.messageId === identityMessage)))) { const entry={...r,sid:reqSid,account:reqOwner||undefined,inputId:identityInput,messageId:identityMessage||null,...(old?.fingerprint?.skipped?{fingerprint:old.fingerprint}:{})}; Models.set(this.sid, entry); Bus.emit('model', this, entry); }
          if (r.partial) { try { Trace.adopt(this.sid); const m2 = Models.get(this.sid); if (m2 && !m2.partial && m2.name !== r.name) Bus.emit('model', this, m2); } catch {} }
        }
        return r;
      } catch (e) { if (this.idTok === tok && this.idP === my) this.idErr = describe(e); throw e; }
      finally { if (this.idP === my) { this.identifying = false; this.emit(); } }
    })();
    my.catch(() => {});
    return my;
  }
  // 旧对话：回放实时通道找到最近一轮的运行令牌（1 小时内有效）
  // 以往的对话补打分：打开时这个对话还没有强度分，就读一次实时通道回放，给最后一轮打分（识别结果不动）
  async scoreOld() {
    if (this.scoring || this.busy || this.gacha || Calib.last.get(this.sid) || (Calib.tried ||= new Set()).has(this.sid)) return;
    this.scoring = true; Calib.tried.add(this.sid);
    try {
      for (let i = 0; i < 20 && (!this.loaded || !this.lastSeq) && !this.busy; i++) await sleep(500);
      if (this.busy || !this.lastSeq || Calib.last.get(this.sid)) return;
      const m = [...(this.messages || [])].reverse().find(x => x.role === 'assistant'); if (!m) return;
      await this.ensureToken();
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '3', 'X-Peek-Settled': '1', 'Last-Event-ID': String(Math.max(0, +this.lastSeq - 1500)) }, signal: ctl.signal, cache: 'no-store' });
        const f = Fmt.lastTurn(await res.text());
        if (f && !this.busy && !Calib.last.get(this.sid)) Calib.turn(this, m, f);
      } finally { clearTimeout(tm); }
    } catch {} finally { this.scoring = false; }
  }
  async identifyOld() {
    if (this.identifying) return;
    this.identifying = true; this.idErr = null; this.emit();
    let tok = null;
    try {
      await this.ensureToken();
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
      try {
        const res = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '5', 'X-Peek-Settled': '1', 'Last-Event-ID': String(Math.max(0, +(this.lastSeq || 0) - 400)) }, signal: ctl.signal, cache: 'no-store' });
        const txt = await res.text();
        tok = runTokIn(txt);
        if (!tok || (jwt(tok)?.exp || 0) * 1000 < now()) { const lastAsst = [...(this.messages || [])].reverse().find(x => x?.role === 'assistant'); if (lastAsst && !lastAsst._fmt && typeof Fmt.lastTurn === 'function') lastAsst._fmt = Fmt.lastTurn(txt); const g = Fmt.fromReplay(txt); if (g && this.guessModel(g)) { tok = null; this.identifying = false; this.idErr = null; this.emit(); return; } }
      } finally { clearTimeout(tm); }
      if (!tok) throw new Error('没有找到运行记录');
      if ((jwt(tok)?.exp || 0) * 1000 < now()) throw new Error('运行令牌已过期（超过 1 小时），发送新消息后会自动识别');
    } catch (e) { this.idErr = describe(e); this.identifying = false; this.emit(); return; }
    this.identifying = false; await this.identify(tok, { unscoped: true });
  }
}

// ---------- 多设备同步：别的设备（手机 / 电脑 / 网页）在同一个对话里发消息、跑任务，这边实时看到 ----------
// 空闲时对打开着的对话挂一个长轮询（实时通道，从当前位置往后等）：一旦出现新一轮（分派 / start），
// 先从服务器拉最新消息（对方发的那条用户消息），再从这一轮的开头接上实时流 —— 和在那台设备上看到的一样，不用手动刷新
Object.assign(Chat.prototype, {
  watch() {
    if (this.watching || this.gacha) return; this.watching = true;
    const my = this.wGen = (this.wGen || 0) + 1;
    (async () => {
      let fails = 0;
      try {
        while (my === this.wGen) {
          if (!this.loaded || this.loading || this.busy || (this.streaming && !this.peeking) || this.syncing) { await sleep(1200); continue; }
          if (this.lastSeq == null) {
            const d = await this.drain(1500).catch(() => null);
            if (this.lastSeq == null) {
              try {
                await this.ensureToken();
                const r0 = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '1' }, cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
                if (r0 && r0.ok) {
                  const t0 = await r0.text().catch(() => '');
                  let mx = -1;
                  for (const mSq of t0.matchAll(/"seq_num"\s*:\s*(\d+)/g)) { const v = +mSq[1]; if (v > mx) mx = v; }
                  this.lastSeq = String(mx >= 0 ? mx : 0);
                } else {
                  this.lastSeq = d?.max != null && d.max >= 0 ? String(d.max) : '0';
                }
              } catch { this.lastSeq = '0'; }
            }
            if (my !== this.wGen || this.busy || (this.streaming && !this.peeking) || this.syncing) continue;
          }
          const ctl = new AbortController(); this.wCtl = ctl; const tm = setTimeout(() => ctl.abort(), 75000);
          const from = this.lastSeq; let hit = null, cur = from, headerTimer = 0, headerTimeout = false;
          try {
            await this.ensureToken();
            if (my !== this.wGen || this.busy || (this.streaming && !this.peeking) || this.lastSeq !== from) continue;
            headerTimer = setTimeout(() => { headerTimeout = true; ctl.abort(); }, 12000);
            const res = await rawFetch(OUT(this.sid), { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + this.token, 'Timeout-Seconds': '60', 'Last-Event-ID': String(from) }, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
            clearTimeout(headerTimer);
            if (res.status === 401 || res.status === 403) { this.tokenExp = 0; throw new HttpError(res.status, ''); }
            if (!res.ok) throw new HttpError(res.status, '');
            const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
            outer: for (;;) {
              const { done, value } = await rd.read(); if (done) break;
              if (my !== this.wGen || this.busy || (this.streaming && !this.peeking)) { ctl.abort(); break; }
              buf += dec.decode(value, { stream: true }); let i;
              while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
                const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
                const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
                if (!data || data.trim() === '[DONE]') continue;
                let j; try { j = JSON.parse(data); } catch { continue; }
                for (const rec of j.records || []) {
                  if (rec.seq_num == null || +rec.seq_num <= +(this.lastSeq ?? -1)) continue;
                  let b = null; try { b = rec.body ? JSON.parse(rec.body) : null; } catch {}
                  const ty = b?.data?.type;
                  if (ty === 'start' || ty === 'data-agent-dispatch') { hit = { seq: +rec.seq_num, ty, input: b.data?.data?.inputId || null }; ctl.abort(); break outer; }
                  // 中途接上的一轮（没读到 start / 分派，只有后面的内容）：不能当成「尾巴」悄悄跳过——对账一次，把服务器上的内容补进来
                  if (/^(text-start|text-delta|reasoning-start|reasoning-delta|tool-input-start|tool-input-delta|tool-input-available|tool-output-available|start-step)$/.test(ty || '')) { hit = { seq: +rec.seq_num, ty, mid: true }; ctl.abort(); break outer; }
                  // 上一轮的尾巴（保存工作区、多出来的结束标记）：只把位置往后挪
                  if (!this.busy && !(this.streaming && !this.peeking) && this.lastSeq === cur) this.lastSeq = cur = String(rec.seq_num);
                }
              }
              if (this.lastSeq !== cur) { ctl.abort(); break; }   // 位置被别的流程挪了：用新位置重新挂
            }
            fails = 0; this.wFails = 0;
          } catch (e) { if (e?.name !== 'AbortError' || headerTimeout) { fails++; this.wFails = fails; } }
          finally { clearTimeout(headerTimer); clearTimeout(tm); if (this.wCtl === ctl) this.wCtl = null; }
          if (my !== this.wGen) break;
          if (hit && !this.busy && !(this.streaming && !this.peeking)) { this.dbg?.('watch-hit', { seq: hit.seq, ty: hit.ty, mid: !!hit.mid }); this.remoteAt = now(); await this.remoteSync(hit).catch(() => {}); if (!this.busy && !(this.streaming && !this.peeking) && hit.seq != null && +(this.lastSeq ?? -1) < +hit.seq) this.lastSeq = String(hit.seq); if (hit.mid) await sleep(2500); continue; }
          await sleep(fails ? Math.min(30000, 1500 * 2 ** Math.min(fails, 5)) : 250);
        }
      } finally { if (my === this.wGen) { this.watching = false; this.wCtl = null; } }
    })();
  },
  unwatch() { this.wGen = (this.wGen || 0) + 1; this.watching = false; try { this.wCtl?.abort(); } catch {} this.wCtl = null; },
  // 服务器上的消息合并进来：本地已有且内容一样的保持原对象（不重绘），变了的换成新的，本地还没发出去的保留在末尾
  mergeServer(list, keep) {
    const rawSrv = (list || []).filter(m => !this._prunedDeadMsgIds?.has?.(m?.id)); if (!rawSrv.length) return false;
    const uText = m => m?.role === 'user' ? (m.parts || []).filter(p => p?.type === 'text').map(p => String(p.text || '')).join('\n').replace(/\s+/g, ' ').trim() : '';
    const isErrOnlyAsst = m => m?.role === 'assistant' && Array.isArray(m.parts) && m.parts.length > 0 && m.parts.every(p => p && (p.type === 'error' || p.type === 'step-start'));
    const srv = [];
    for (let i = 0; i < rawSrv.length; i++) {
      const m = rawSrv[i];
      if (m?.role === 'user' && isErrOnlyAsst(rawSrv[i + 1]) && rawSrv[i + 2]?.role === 'user') {
        const t1 = uText(m), t2 = uText(rawSrv[i + 2]);
        if (t1 && t1 === t2) { i += 1; continue; }
      }
      if (m?.role === 'assistant' && Array.isArray(m.parts) && m.parts.some(p => p?.type === 'error' && p.text && formatOfficialErrorText(p.text) !== p.text)) {
        srv.push({ ...m, parts: m.parts.map(p => p?.type === 'error' && p.text ? { ...p, rawText: p.rawText || p.text, text: formatOfficialErrorText(p.text) } : p) });
      } else {
        srv.push(m);
      }
    }
    if (!srv.length) return false;
    const loc = new Map();
    this.messages.forEach((m, i) => {
      if (!m) return;
      if (m.id) loc.set(m.id, i);
      if (m.metadata?.nodeId && !loc.has(m.metadata.nodeId)) loc.set(m.metadata.nodeId, i);
    });
    const first = srv.findIndex(m => loc.has(m.id) || (m.metadata?.nodeId && loc.has(m.metadata.nodeId)));
    let head;
    if (first < 0) head = [];
    else {
      const firstLocIdx = loc.get(srv[first].id) ?? loc.get(srv[first].metadata?.nodeId) ?? 0;
      head = this.messages.slice(0, firstLocIdx).filter(m => m && !m._local && (!keep || (m !== keep && m.id !== keep.id)) && !srv.some(x => x.id === m.id || (x.metadata?.nodeId && (x.metadata.nodeId === m.id || x.metadata.nodeId === m.metadata?.nodeId))) && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)));
    }
    const sig = m => {
      const ps = m.parts || [], n = ps.length;
      let s = n + '|' + (m.metadata?.pending ? 1 : 0) + '|' + (m.metadata?.aborted ? 1 : 0);
      for (let i = Math.max(0, n - 8); i < n; i++) {
        const p = ps[i]; if (!p) continue;
        const oLen = p.output === undefined ? -1 : typeof p.output === 'string' ? p.output.length : (p.output?.stdout?.length || 0) + (p.output?.stderr?.length || 0);
        s += ';' + p.type + ':' + (p.state || '') + ':' + (p.text?.length || 0) + ':' + (p.inputText?.length || 0) + ':' + oLen + ':' + (p.errorText ? 1 : 0);
      }
      let openScore = 0;
      for (let i = 0; i < n; i++) { const p = ps[i]; if (p?.toolCallId && p.state !== 'output-available' && p.state !== 'output-error' && p.state !== 'output-denied') openScore += (i + 1); }
      return s + '|o:' + openScore;
    };
    const patchAssistantParts = this._patchAssistantParts = (o, m) => {
      if (!Array.isArray(o.parts) || !Array.isArray(m.parts)) return false;
      const byTool = new Map(); for (const lp of o.parts) if (lp?.toolCallId) byTool.set(lp.toolCallId, lp);
      let patched = false;
      for (const sp of m.parts) {
        if (!sp) continue;
        if (sp.toolCallId && byTool.has(sp.toolCallId)) {
          const lp = byTool.get(sp.toolCallId);
          if (sp.output !== undefined && (lp.output === undefined || lp.state !== sp.state)) {
            lp.output = sp.output; lp.state = sp.state || 'output-available'; lp.preliminary = !!sp.preliminary; delete lp.errorText; delete lp._interruptedPending; patched = true;
          } else if (lp.state === 'output-error' && (lp.errorText === '未返回结果' || lp._interruptedPending) && sp.state && sp.state !== 'output-error') {
            lp.state = sp.state; if (sp.input && !lp.input) lp.input = sp.input; delete lp.errorText; delete lp._interruptedPending; patched = true;
          } else if (sp.input && !lp.input) {
            lp.input = sp.input; if (!lp.state || lp.state === 'input-streaming') lp.state = sp.state || 'input-available'; patched = true;
          }
        } else if (sp.toolCallId && !byTool.has(sp.toolCallId)) { o.parts.push(sp); byTool.set(sp.toolCallId, sp); patched = true; }
      }
      const sTexts = m.parts.filter(p => p && p.type === 'text' && String(p.text || '').trim());
      const lTextIdxs = [];
      for (let idx = 0; idx < o.parts.length; idx++) {
        if (o.parts[idx]?.type === 'text') lTextIdxs.push(idx);
      }
      if (sTexts.length > 0) {
        if (sTexts.length === lTextIdxs.length) {
          for (let k = 0; k < sTexts.length; k++) {
            const sp = sTexts[k], lp = o.parts[lTextIdxs[k]];
            if (sp.text && (!lp.text || sp.text.length > lp.text.length || (!m.metadata?.pending && sp.text !== lp.text && sp.text.length >= lp.text.length))) {
              o.parts[lTextIdxs[k]] = { ...lp, ...sp, id: lp.id || sp.id, text: sp.text, state: m.metadata?.pending ? (sp.state || lp.state) : 'done' };
              delete o.parts[lTextIdxs[k]]._mdEl;
              patched = true;
            }
          }
        } else if (sTexts.length > lTextIdxs.length) {
          for (let k = 0; k < lTextIdxs.length; k++) {
            const sp = sTexts[k], lp = o.parts[lTextIdxs[k]];
            if (sp.text && (!lp.text || sp.text.length > lp.text.length)) {
              o.parts[lTextIdxs[k]] = { ...lp, ...sp, id: lp.id || sp.id, text: sp.text, state: m.metadata?.pending ? (sp.state || lp.state) : 'done' };
              delete o.parts[lTextIdxs[k]]._mdEl;
              patched = true;
            }
          }
          for (let k = lTextIdxs.length; k < sTexts.length; k++) {
            const sp = sTexts[k];
            if (!o.parts.some(lp => lp?.type === 'text' && String(lp.text || '').trim() === String(sp.text || '').trim())) {
              o.parts.push({ ...sp, state: m.metadata?.pending ? (sp.state || 'streaming') : 'done' });
              patched = true;
            }
          }
        } else if (lTextIdxs.length > 0) {
          const lastSp = sTexts.at(-1), lastLIdx = lTextIdxs.at(-1), lastLp = o.parts[lastLIdx];
          if (lastSp?.text && (!lastLp?.text || lastSp.text.length > lastLp.text.length)) {
            o.parts[lastLIdx] = { ...lastLp, ...lastSp, id: lastLp?.id || lastSp.id, text: lastSp.text, state: m.metadata?.pending ? (lastSp.state || lastLp?.state) : 'done' };
            delete o.parts[lastLIdx]._mdEl;
            patched = true;
          }
        }
      }
      if (m.parts.length > o.parts.length) {
        for (const tp of m.parts.slice(o.parts.length)) {
          if (!tp || tp.type === 'step-start' || (tp.toolCallId && byTool.has(tp.toolCallId))) continue;
          if ((tp.type === 'text' || tp.type === 'reasoning') && o.parts.some(lp => lp?.type === tp.type && String(lp.text || '').trim() === String(tp.text || '').trim())) continue;
          o.parts.push(tp); patched = true;
        }
      }
      if (m.metadata) {
        const prevPend = Boolean(o.metadata?.pending);
        const mExplicitDone = Boolean(m.metadata?.timing?.completedAt || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn' || m.metadata?.aborted || m.metadata?.error);
        const keepLocalDone = Boolean((!prevPend && o._finishedAt && !o._forcedFinish && (now() - o._finishedAt < 60000) && o !== keep) || mExplicitDone);
        const nextPend = keepLocalDone ? false : Boolean(m.metadata.pending);
        const savedCompAt = o.metadata?.timing?.completedAt;
        o.metadata = { ...(o.metadata || {}), ...m.metadata, pending: nextPend };
        if (keepLocalDone && savedCompAt && !o.metadata?.timing?.completedAt) o.metadata.timing = { ...(o.metadata.timing || {}), completedAt: savedCompAt };
        if (nextPend) { delete o._finishedAt; delete o._forcedFinish; }
        else {
          delete o._incomplete;
          delete o._forcedFinish;
          if (!o.metadata.timing?.completedAt) {
            o.metadata.timing = { ...(o.metadata.timing || {}), startedAt: o.metadata.timing?.startedAt || idTime(o.id) || now(), completedAt: o._finishedAt || now() };
          }
        }
        if (prevPend !== nextPend) patched = true;
      }
      if (patched) o.v = (o.v || 0) + 1;
      return patched;
    };
    const partWeight = parts => (parts || []).reduce((acc, p) => {
      if (!p || p.type === 'step-start' || p.type === 'error') return acc;
      if (p.type === 'text' || p.type === 'reasoning') {
        const tLen = String(p.text || '').trim().length;
        return tLen > 0 ? acc + tLen + 10 : acc;
      }
      if (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') {
        const hasRealOut = p.output !== undefined && !(p.state === 'output-error' && (p.errorText === '未返回结果' || p._interruptedPending));
        return acc + 50 + (hasRealOut ? 50 : 0);
      }
      return acc + 5;
    }, 0);
    let changed = false, lagged = false;
    const matchedLocal = new Set();
    const normUText = m => (m?.parts || []).filter(p => p?.type === 'text').map(p => String(p.text || '')).join('').replace(/\s+/g, ' ').trim();
    const mid = srv.map((m, sIdx) => {
      let i = loc.get(m.id) ?? (m.metadata?.nodeId ? loc.get(m.metadata.nodeId) : undefined), o = i != null ? this.messages[i] : null;
      if (!o && m.role === 'user') {
        const mNodeId = m.metadata?.nodeId;
        const mText = normUText(m);
        const mTime = idTime(m.id) || 0;
        const mAttCount = (m.metadata?.uploads?.length || 0) + (m.parts || []).filter(p => p?.type === 'file').length;
        const prevSrvAsstId = sIdx > 0 && srv[sIdx - 1]?.role === 'assistant' ? srv[sIdx - 1].id : null;
        const cand = this.messages.find(x => x && x.role === 'user' && !matchedLocal.has(x) && !srv.some(sx => sx.id === x.id) && (
          (mNodeId && (x.id === mNodeId || x.metadata?.nodeId === mNodeId)) ||
          (x.metadata?.nodeId && x.metadata.nodeId === m.id) ||
          ((x._local || x._appendAccepted) && (!x._prevAsstId || !prevSrvAsstId || x._prevAsstId === prevSrvAsstId) && !(sIdx === 0 && x._prevAsstId && srv.some(sa => sa?.id === x._prevAsstId)) && (
            (mText && normUText(x) === mText) ||
            (!mText && !normUText(x) && mAttCount > 0 && ((x._prev?.length || 0) + (x.metadata?.uploads?.length || 0) + (x.parts || []).filter(p => p?.type === 'file').length) > 0)
          ) && (!mTime || !idTime(x.id) || Math.abs(mTime - idTime(x.id)) < 1800000))
        ));
        if (cand) {
          o = cand;
          for (const dup of this.messages) {
            if (dup && dup !== cand && dup.role === 'user' && (dup._local || dup._appendAccepted) && ((!dup._prevAsstId && !cand._prevAsstId) || dup._prevAsstId === cand._prevAsstId) && !srv.some(sx => sx.id === dup.id) && mText && normUText(dup) === mText && (!mTime || !idTime(dup.id) || Math.abs(mTime - (dup._sentAt || idTime(dup.id) || 0)) < 3600000)) {
              matchedLocal.add(dup);
            }
          }
          if (this.awaitId && (this.awaitId === cand.id || this.awaitId === cand.metadata?.nodeId)) {
            this.awaitId = m.id;
          }
        }
      }
      if (!o && m.role === 'assistant' && sIdx > 0) {
        const prevSrvU = srv[sIdx - 1];
        const prevUi = prevSrvU ? this.messages.findIndex(x => x && (x.id === prevSrvU.id || (prevSrvU.metadata?.nodeId && x.id === prevSrvU.metadata.nodeId) || matchedLocal.has(x) && x.role === 'user' && normUText(x) === normUText(prevSrvU))) : -1;
        const cand = prevUi >= 0 ? this.messages[prevUi + 1] : null;
        if (cand && cand.role === 'assistant' && !srv.some(x => x.id === cand.id)) {
          const mTools = new Set((m.parts || []).map(p => p?.toolCallId).filter(Boolean));
          const cTools = (cand.parts || []).map(p => p?.toolCallId).filter(Boolean);
          const toolConflict = mTools.size > 0 && cTools.length > 0 && !cTools.some(id => mTools.has(id));
          if (!toolConflict) o = cand;
        }
        if (!o && keep && keep.role === 'assistant' && !matchedLocal.has(keep) && sIdx === srv.length - 1 && !srv.some(x => x.id === keep.id)) {
          o = keep;
        }
      }
      if (o) matchedLocal.add(o);
      if (o && keep && o === keep) {
        if (o.role === 'assistant' && patchAssistantParts(o, m)) changed = true;
        return o;
      }
      if (o && o.role === 'assistant') {
        const hasNextUser = srv.slice(sIdx + 1).some(x => x && x.role === 'user');
        if (o._awaitingSnapshot) {
          if (!m.metadata?.aborted && !hasNextUser && (o.parts || []).some(p => Hitl.awaiting(p)) && !(m.parts || []).some(p => Hitl.awaiting(p))) {
            lagged = true; return o;
          }
          delete o._awaitingSnapshot;
        }
        const ow = partWeight(o.parts), mw = partWeight(m.parts);
        const hasInterruptedLocal = Boolean(o._forcedFinish || (o.parts || []).some(p => p?.toolCallId && (p._interruptedPending || p.errorText === '未返回结果')));
        const recFin = o._finishedAt && (now() - o._finishedAt < 60000);
        if (!hasInterruptedLocal && ((recFin && m.metadata?.pending && !o.metadata?.pending) || (recFin && ow > mw))) {
          lagged = true; if (patchAssistantParts(o, m)) changed = true; return o;
        }
        if (!o._local && !hasInterruptedLocal && sig(o) === sig(m)) return o;
        if (ow >= mw && !hasInterruptedLocal && (m.metadata?.pending || o.metadata?.pending || o._incomplete || ow > mw)) {
          if (patchAssistantParts(o, m)) { changed = true; return o; }
          if (ow > mw && (m.metadata?.pending || o.metadata?.pending || o._incomplete)) return o;
        }
      }
      if (o && !o._local && sig(o) === sig(m)) return o;
      changed = true;
      let mergedParts = m.parts;
      if (o?.role === 'assistant' && Array.isArray(o.parts) && Array.isArray(m.parts)) {
        const localReason = o.parts.filter(p => p && p.type === 'reasoning');
        const srvHasReason = m.parts.some(p => p && p.type === 'reasoning');
        if (localReason.length && !srvHasReason) mergedParts = [...localReason, ...m.parts];
        const localNonEmptyReason = localReason.filter(p => p.text);
        let rTextIdx = 0;
        const lIds = { reasoning: o.parts.filter(p => p?.type === 'reasoning' && p.id), text: o.parts.filter(p => p?.type === 'text' && p.id) }, idxMap = { reasoning: 0, text: 0 };
        mergedParts = mergedParts.map(sp => {
          if (!sp) return sp;
          let outP = (sp.type === 'reasoning' || sp.type === 'text') && !sp.id && lIds[sp.type]?.[idxMap[sp.type]]?.id ? { ...sp, id: lIds[sp.type][idxMap[sp.type]++].id } : sp;
          if (outP.type === 'reasoning' && !outP.text && localNonEmptyReason[rTextIdx]?.text) {
            const lr = localNonEmptyReason[rTextIdx++];
            outP = { ...outP, text: lr.text, id: outP.id || lr.id };
          }
          return outP;
        });
      }
      const mExplicitDone = Boolean(m.metadata?.timing?.completedAt || m.metadata?.finishReason === 'stop' || m.metadata?.finishReason === 'end-turn' || m.metadata?.aborted || m.metadata?.error);
      const srvMPend = Boolean(m.role === 'assistant' && m.metadata?.pending && sIdx === srv.length - 1 && !mExplicitDone && !(!o?.metadata?.pending && o?._finishedAt && !o?._forcedFinish && (now() - o._finishedAt < 60000) && o !== keep));
      const mergedMeta = (m.role === 'assistant' && m.metadata?.pending && !srvMPend) ? { ...m.metadata, pending: false } : m.metadata;
      if (m.role === 'assistant' && srvMPend && Array.isArray(mergedParts)) {
        mergedParts = mergedParts.map(sp => (sp?.toolCallId && sp.state === 'output-error' && (sp.errorText === '未返回结果' || sp._interruptedPending)) ? { ...sp, state: 'input-available', errorText: undefined, _interruptedPending: undefined } : sp);
      } else if (m.role === 'assistant' && !srvMPend && Array.isArray(mergedParts)) {
        mergedParts = mergedParts.map(sp => (sp?.toolCallId && !Hitl.name(sp) && /^(input-streaming|input-available)$/.test(sp.state || '')) ? { ...sp, state: 'output-error', errorText: sp.errorText || '未返回结果' } : sp);
      }
      return { ...m, metadata: mergedMeta, parts: mergedParts, _autoContinue: o?._autoContinue || m.metadata?.autoContinue, _streamed: o?._streamed, _finishedAt: srvMPend ? undefined : (o?._finishedAt || (m.role === 'assistant' ? (Date.parse(m.metadata?.timing?.completedAt || m.createdAt || '') || idTime(m.id) || now()) : undefined)), _forcedFinish: srvMPend ? undefined : o?._forcedFinish, _fmt: o?._fmt, _sseMeta: o?._sseMeta, ...(o?._localId || (o?.id && o.id !== m.id) ? { _localId: o._localId || o.id } : {}), ...(o?._prev ? { _prev: o._prev } : {}), ...(o?._sentAt ? { _sentAt: o._sentAt } : {}), ...(o?._appendAccepted ? { _appendAccepted: true } : {}), ...(o?._prevAsstId ? { _prevAsstId: o._prevAsstId } : {}), v: (o?.v || 0) + 1 };
    });
    head = head.filter(m => !matchedLocal.has(m));
    const ids = new Set(srv.map(m => m.id));
    const srvNodeIds = new Set(srv.map(m => m.metadata?.nodeId).filter(Boolean));
    const srvUserTextSet = new Set(srv.filter(m => m?.role === 'user').map(normUText).filter(Boolean));
    const srvLastMsg = srv.at(-1);
    const srvLastCompRaw = srvLastMsg?.metadata?.timing?.completedAt || srvLastMsg?.metadata?.timing?.startedAt;
    const srvLastCompMs = typeof srvLastCompRaw === 'number' ? srvLastCompRaw : (typeof srvLastCompRaw === 'string' ? Date.parse(srvLastCompRaw) : 0);
    const srvLastTime = idTime(srvLastMsg?.id) || 0;
    const srvLastEndTime = Math.max(srvLastTime, Number.isFinite(srvLastCompMs) ? srvLastCompMs : 0, srvLastMsg?._finishedAt || 0);
    let lastSrvInOldIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i]?.id && ids.has(this.messages[i].id)) { lastSrvInOldIdx = i; break; }
    }
    const willKeepTailAsst = (m, idx, forPrecedingUser = false) => {
      if (!m || m.role !== 'assistant') return false;
      if (forPrecedingUser && (ids.has(m.id) || matchedLocal.has(m))) return true;
      if (ids.has(m.id) || matchedLocal.has(m)) return false;
      if (typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)) return false;
      if (m._local || m._incomplete || m.metadata?.pending || (keep && m === keep)) return true;
      if (partWeight(m.parts) > 0) {
        if (m._awaitingSnapshot) {
          const srvLast = srv.at(-1);
          if (srvLast && srvLast.role === 'user' && srvLast.id !== this.messages[idx - 1]?.id) return false;
          return true;
        }
        const prevMsg = idx > 0 ? this.messages[idx - 1] : null;
        const hasUnmatchedPrevUser = Boolean(prevMsg && prevMsg.role === 'user' && !ids.has(prevMsg.id) && !matchedLocal.has(prevMsg));
        if (idx < this.messages.length - 1 || (srv.at(-1)?.role === 'assistant' && !hasUnmatchedPrevUser)) return false;
        const recFin = m._finishedAt && !m._forcedFinish && (now() - m._finishedAt < 60000);
        const isTrailing = idx >= this.messages.length - 2 || (lastSrvInOldIdx >= 0 && idx > lastSrvInOldIdx);
        const mTime = idTime(m.id) || 0;
        if (recFin || (isTrailing && (!srvLastTime || !mTime || mTime >= srvLastTime))) return true;
      }
      return false;
    };
    const srvLastExplicitDone = Boolean(srvLastMsg?.metadata?.timing?.completedAt || srvLastMsg?.metadata?.finishReason === 'stop' || srvLastMsg?.metadata?.finishReason === 'end-turn' || srvLastMsg?.metadata?.aborted || srvLastMsg?.metadata?.error);
    const srvLastIsRunning = Boolean(srvLastMsg?.role === 'assistant' && !srvLastExplicitDone && (srvLastMsg.metadata?.pending || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(srvLastMsg))));
    const oldAsstWeights = new Map();
    for (const om of this.messages) if (om?.role === 'assistant' && om.id) oldAsstWeights.set(om.id, (typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(om) : partWeight(om.parts));
    const tail = this.messages.filter((m, idx) => {
      if (!m || ids.has(m.id) || (m.metadata?.nodeId && (ids.has(m.metadata.nodeId) || srvNodeIds.has(m.metadata.nodeId))) || srvNodeIds.has(m.id) || matchedLocal.has(m)) return false;
      if (m.failed) {
        if (m.role === 'user') {
          const uTime = m._sentAt || idTime(m.id) || 0;
          const uTxt = normUText(m);
          const pIdx = m._prevAsstId ? srv.findIndex(x => x && x.id === m._prevAsstId) : (srvLastMsg?.role === 'assistant' ? srv.length - 1 : -1);
          const srvAfterP = pIdx >= 0 ? srv.slice(pIdx + 1) : srv;
          const inSrv = uTxt && srvAfterP.some(x => x?.role === 'user' && normUText(x) === uTxt);
          const hasSrvUserAfterP = pIdx >= 0 && srv.slice(pIdx + 1).some(x => x && x.role === 'user');
          const hasNewAsstAfterP = pIdx >= 0 && srv.slice(pIdx + 1).some(x => x && x.role === 'assistant' && x.id !== m._prevAsstId);
          const targetAsst = pIdx >= 0 ? srv[pIdx] : null;
          const tCompRaw = targetAsst?.metadata?.timing?.completedAt;
          const tCompMs = typeof tCompRaw === 'number' ? tCompRaw : (typeof tCompRaw === 'string' ? Date.parse(tCompRaw) : 0);
          const targetAsstEndTime = Math.max(idTime(targetAsst?.id) || 0, Number.isFinite(tCompMs) ? tCompMs : 0, targetAsst?._finishedAt || 0);
          const oldW = targetAsst ? (m._prevAsstWeight ?? oldAsstWeights.get(targetAsst.id) ?? null) : null;
          const newW = targetAsst ? ((typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(targetAsst) : partWeight(targetAsst.parts)) : 0;
          const targetSupplemented = Boolean(targetAsst && !hasSrvUserAfterP && !hasNewAsstAfterP && ((oldW != null && newW > oldW) || (targetAsstEndTime > 0 && uTime > 0 && targetAsstEndTime >= uTime + 1000 && (idTime(targetAsst.id) || 0) <= uTime + 5000)));
          if (!inSrv && !hasSrvUserAfterP && !hasNewAsstAfterP && (srvLastIsRunning || this.busy || this.streaming || this.live || targetSupplemented)) {
            try { if (typeof SentUserLog !== 'undefined' && SentUserLog.demoteToQueue) SentUserLog.demoteToQueue(this, m, { silent: true, running: Boolean(srvLastIsRunning || this.busy || this.streaming || this.live) }); } catch {}
            return false;
          }
          if (!inSrv && idx === this.messages.length - 1 && (!srvLastEndTime || !uTime || uTime >= srvLastEndTime - 30000)) return true;
        }
        try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(this.sid, m.id); } catch {}
        return false;
      }
      if (typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m)) return false;
      const isAheadOfSrv = lastSrvInOldIdx >= 0 && idx > lastSrvInOldIdx;
      if (keep && m === keep) return true;
      if (m._local || m._appendAccepted) {
        if (m.role === 'user') {
          const isAwaitingThis = Boolean(this.awaitId && (this.awaitId === m.id || this.awaitId === m.metadata?.nodeId) && (this.busy || this.sending || this.preSend));
          const uTxt = normUText(m);
          const uTime = m._sentAt || idTime(m.id) || 0;
          const pIdx = m._prevAsstId ? srv.findIndex(x => x && (x.id === m._prevAsstId || x._localId === m._prevAsstId)) : (srvLastMsg?.role === 'assistant' ? srv.length - 1 : -1);
          const srvScopeForU = pIdx >= 0 ? srv.slice(pIdx + 1) : srv;
          if (uTxt && srvUserTextSet.has(uTxt) && srvScopeForU.some(sm => sm?.role === 'user' && normUText(sm) === uTxt && (pIdx >= 0 || !uTime || !idTime(sm.id) || Math.abs(uTime - (sm._sentAt || idTime(sm.id) || 0)) < 3600000))) {
            try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(this.sid, m.id, uTxt, uTime); } catch {}
            return false;
          }
          const hasSrvUserAfterP = pIdx >= 0 && srv.slice(pIdx + 1).some(x => x && x.role === 'user');
          const hasLocalAsstAfterP = Boolean((keep && keep.role === 'assistant' && keep.id !== m._prevAsstId) || (this.live && this.live.role === 'assistant' && this.live.id !== m._prevAsstId));
          const hasNewAsstAfterP = (pIdx >= 0 && srv.slice(pIdx + 1).some(x => x && x.role === 'assistant' && x.id !== m._prevAsstId)) || hasLocalAsstAfterP;
          const targetAsst = pIdx >= 0 ? srv[pIdx] : null;
          const tCompRaw = targetAsst?.metadata?.timing?.completedAt;
          const tCompMs = typeof tCompRaw === 'number' ? tCompRaw : (typeof tCompRaw === 'string' ? Date.parse(tCompRaw) : 0);
          const targetAsstEndTime = Math.max(idTime(targetAsst?.id) || 0, Number.isFinite(tCompMs) ? tCompMs : 0, targetAsst?._finishedAt || 0);
          const tExplicitDone = Boolean(targetAsst?.metadata?.timing?.completedAt || targetAsst?.metadata?.finishReason === 'stop' || targetAsst?.metadata?.finishReason === 'end-turn' || targetAsst?.metadata?.aborted || targetAsst?.metadata?.error);
          const targetAsstIsRunning = Boolean(targetAsst && !tExplicitDone && (targetAsst.metadata?.pending || (typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(targetAsst))));
          const oldW = targetAsst ? (m._prevAsstWeight ?? oldAsstWeights.get(targetAsst.id) ?? null) : null;
          const newW = targetAsst ? ((typeof SentUserLog !== 'undefined' && SentUserLog.measureAsstWeight) ? SentUserLog.measureAsstWeight(targetAsst) : partWeight(targetAsst.parts)) : 0;
          const targetSupplemented = Boolean(targetAsst && !hasSrvUserAfterP && !hasNewAsstAfterP && ((oldW != null && newW > oldW) || (targetAsstEndTime > 0 && uTime > 0 && targetAsstEndTime >= uTime + 1000 && (idTime(targetAsst.id) || 0) <= uTime + 5000)));
          const prevTurnStillRunning = m._prevAsstId ? targetAsstIsRunning : (srvLastIsRunning && !m._appendAccepted);
          if (!hasSrvUserAfterP && !hasNewAsstAfterP && !(isAwaitingThis && (this.preSend || this.sending || this.oursAt || this.dlv === 'taken' || m._appendAccepted)) && (targetSupplemented || (prevTurnStillRunning && (!isAwaitingThis || (!this.oursAt && this.dlv !== 'taken'))))) {
            try { if (typeof SentUserLog !== 'undefined' && SentUserLog.demoteToQueue) SentUserLog.demoteToQueue(this, m, { silent: true, running: Boolean(srvLastIsRunning || this.busy || this.streaming || this.live) }); } catch {}
            return false;
          }
          if (isAwaitingThis) return true;
          if (srvLastEndTime > 0 && uTime > 0 && uTime < srvLastEndTime - 30000) {
            const firstSrvLastIdx = (typeof SentUserLog !== 'undefined' && SentUserLog.firstAsstIdxOfTurn && srvLastMsg?.role === 'assistant') ? SentUserLog.firstAsstIdxOfTurn(srv, srv.length - 1) : (srv.length - 1);
            const firstSrvLastMsg = srv[firstSrvLastIdx] || srvLastMsg;
            const srvLastStartTime = Number(firstSrvLastMsg?.metadata?.timing?.startedAt) || Date.parse(firstSrvLastMsg?.metadata?.timing?.startedAt || '') || idTime(firstSrvLastMsg?.id) || 0;
            const pEndIdx = pIdx >= 0 && typeof SentUserLog !== 'undefined' && SentUserLog.lastAsstIdxOfTurn ? SentUserLog.lastAsstIdxOfTurn(srv, pIdx) : pIdx;
            const fillsSrvGap = hasLocalAsstAfterP || (pEndIdx >= 0 && srv[pEndIdx + 1]?.role === 'assistant' && !(typeof SentUserLog !== 'undefined' && SentUserLog.isSameAsstTurnChunk?.(srv[pEndIdx], srv[pEndIdx + 1]))) || (srv.length >= 2 && srv.at(-1)?.role === 'assistant' && srv.at(-2)?.role === 'assistant' && !(typeof SentUserLog !== 'undefined' && SentUserLog.isSameAsstTurnChunk?.(srv.at(-2), srv.at(-1))) && uTime >= (idTime(srv.at(-2)?.id) || 0) - 60000) || (srvLastStartTime > 0 && uTime >= srvLastStartTime - 60000 && (firstSrvLastIdx < 1 || srv[firstSrvLastIdx - 1]?.role !== 'user'));
            if (!fillsSrvGap) {
              try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(this.sid, m.id, uTxt, uTime); } catch {}
              return false;
            }
          }
        }
        return true;
      }
      if (m.role === 'user' && (isAheadOfSrv || idx >= this.messages.length - 2)) {
        const nextLocal = this.messages[idx + 1];
        const midTailGap = mid.length >= 2 && mid.at(-1)?.role === 'assistant' && mid.at(-2)?.role === 'assistant' && !(typeof SentUserLog !== 'undefined' && SentUserLog.isSameAsstTurnChunk?.(mid.at(-2), mid.at(-1)));
        if (isAheadOfSrv || (nextLocal && (willKeepTailAsst(nextLocal, idx + 1, true) || (ids.has(nextLocal.id) && midTailGap)))) {
          lagged = true;
          return true;
        }
      }
      if (m.role === 'assistant' && (partWeight(m.parts) > 0 || m._incomplete || m.metadata?.pending)) {
        const mTailTs = Number(m?.metadata?.timing?.completedAt) || Number(m?.metadata?.timing?.startedAt) || Number(m?._finishedAt) || idTime(m?.id) || 0;
        if ((m._incomplete || m.metadata?.pending) && (!srvLastEndTime || !mTailTs || mTailTs >= srvLastEndTime - 5000)) { lagged = true; return true; }
        if (m._awaitingSnapshot) {
          const srvLast = srv.at(-1);
          if (srvLast && srvLast.role === 'user' && srvLast.id !== this.messages[idx - 1]?.id) {
            delete m._awaitingSnapshot;
            return false;
          }
          lagged = true;
          return true;
        }
        const prevMsg = idx > 0 ? this.messages[idx - 1] : null;
        const hasUnmatchedPrevUser = Boolean(prevMsg && prevMsg.role === 'user' && !ids.has(prevMsg.id) && !matchedLocal.has(prevMsg));
        if (idx < this.messages.length - 1 || (srv.at(-1)?.role === 'assistant' && !hasUnmatchedPrevUser)) return false;
        const recFin = m._finishedAt && !m._forcedFinish && (now() - m._finishedAt < 60000);
        const isTrailing = idx >= this.messages.length - 2 || isAheadOfSrv;
        const mTime = idTime(m.id) || 0;
        if (recFin || (isTrailing && (!srvLastTime || !mTime || mTime >= srvLastTime))) {
          lagged = true;
          return true;
        }
      }
      return false;
    });
    this._srvLagged = lagged;
    const tailIdSet = new Set(tail.map(x => x?.id).filter(Boolean));
    const next = [...head.filter(x => !x?.id || !tailIdSet.has(x.id)), ...mid];
    for (let tIdx = 0; tIdx < tail.length; tIdx++) {
      const tm = tail[tIdx];
      if (tm && tm.role === 'user' && tm._prevAsstId) {
        let pIdx = next.findIndex(x => x && (x.id === tm._prevAsstId || x._localId === tm._prevAsstId));
        if (pIdx >= 0 && typeof SentUserLog !== 'undefined' && SentUserLog.lastAsstIdxOfTurn) pIdx = SentUserLog.lastAsstIdxOfTurn(next, pIdx);
        if (pIdx >= 0 && next[pIdx + 1]?.role !== 'user') {
          next.splice(pIdx + 1, 0, tm);
          changed = true;
          continue;
        }
      }
      const hasAsstAfterInTail = tail.slice(tIdx + 1).some(x => x && x.role === 'assistant');
      if (tm && tm.role === 'user' && !tm._held && !hasAsstAfterInTail && next.at(-1)?.role === 'assistant') {
        const firstTailIdx = (typeof SentUserLog !== 'undefined' && SentUserLog.firstAsstIdxOfTurn) ? SentUserLog.firstAsstIdxOfTurn(next, next.length - 1) : (next.length - 1);
        const lastA = next[firstTailIdx] || next.at(-1);
        const prevBeforeA = firstTailIdx >= 1 ? next[firstTailIdx - 1] : null;
        const missingUserBeforeA = !prevBeforeA || prevBeforeA.role === 'assistant';
        const isAwaitingThisUser = Boolean(this.awaitId && (this.awaitId === tm.id || this.awaitId === tm.metadata?.nodeId));
        const uTime = tm._sentAt || idTime(tm.id) || 0;
        const aTime = Number(lastA?.metadata?.timing?.startedAt) || idTime(lastA?.id) || 0;
        const timeMatchesTail = isAwaitingThisUser || !uTime || !aTime || (uTime >= aTime - 300000 && uTime <= aTime + 30000);
        if (timeMatchesTail && (missingUserBeforeA || (lastA.metadata?.pending || lastA._incomplete || (keep && lastA === keep)))) {
          next.splice(firstTailIdx, 0, tm);
          changed = true;
          continue;
        }
      }
      next.push(tm);
    }
    if (next.length !== this.messages.length) changed = true;
    this.messages = next;
    if (typeof SentUserLog !== 'undefined' && SentUserLog.restoreInto(this, { srvPend: srvLastIsRunning })) changed = true;
    for (let i = this.messages.length - 1; i >= 1; i--) {
      const cur = this.messages[i], prev = this.messages[i - 1];
      if (cur?.role === 'user' && prev?.role === 'user' && !cur.failed && !prev.failed) {
        const ct = normUText(cur), pt = normUText(prev);
        if (cur.id === prev.id || (ct && ct === pt)) {
          this.messages.splice(cur._local && !prev._local ? i : (prev._local && !cur._local ? i - 1 : i), 1);
          changed = true;
        }
      }
    }
    let lastAIdx = -1;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i]?.role === 'assistant') { lastAIdx = i; break; }
    }
    if (lastAIdx > 0) {
      for (let i = lastAIdx - 1; i >= 0; i--) {
        const fm = this.messages[i];
        if (fm?.role === 'user' && fm.failed) {
          this.messages.splice(i, 1);
          try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(this.sid, fm.id); } catch {}
          try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(fm.id); } catch {}
          lastAIdx--;
          changed = true;
        }
      }
    }
    if (lastAIdx >= 0 && lastAIdx < this.messages.length - 1) {
      const firstLastTurnIdx = (typeof SentUserLog !== 'undefined' && SentUserLog.firstAsstIdxOfTurn) ? SentUserLog.firstAsstIdxOfTurn(this.messages, lastAIdx) : lastAIdx;
      const lastAMsg = this.messages[lastAIdx];
      const firstLastAMsg = this.messages[firstLastTurnIdx] || lastAMsg;
      const lastACompRaw = lastAMsg?.metadata?.timing?.completedAt || lastAMsg?.metadata?.timing?.startedAt;
      const lastACompMs = typeof lastACompRaw === 'number' ? lastACompRaw : (typeof lastACompRaw === 'string' ? Date.parse(lastACompRaw) : 0);
      const lastAEnd = Math.max(idTime(lastAMsg?.id) || 0, Number.isFinite(lastACompMs) ? lastACompMs : 0, lastAMsg?._finishedAt || 0);
      const earlierUsers = this.messages.slice(0, firstLastTurnIdx).filter(x => x && x.role === 'user');
      const lastAStart = Number(firstLastAMsg?.metadata?.timing?.startedAt) || Date.parse(firstLastAMsg?.metadata?.timing?.startedAt || '') || idTime(firstLastAMsg?.id) || 0;
      for (let i = this.messages.length - 1; i > lastAIdx; i--) {
        const tm = this.messages[i];
        if (!tm || tm.role !== 'user') continue;
        const isAwaitingThis = Boolean(this.awaitId && (this.awaitId === tm.id || this.awaitId === tm.metadata?.nodeId) && (this.busy || this.sending || this.preSend));
        if (isAwaitingThis) continue;
        const uTs = tm._sentAt || idTime(tm.id) || 0;
        const uTxt = normUText(tm);
        const isDupOfEarlier = earlierUsers.some(x => x.id === tm.id || (uTxt && normUText(x) === uTxt && ((tm._prevAsstId && x._prevAsstId && tm._prevAsstId === x._prevAsstId) || (!tm._prevAsstId && (!uTs || !(x._sentAt || idTime(x.id)) || Math.abs(uTs - (x._sentAt || idTime(x.id) || 0)) < 15000)))));
        if (!isDupOfEarlier && firstLastTurnIdx >= 1 && this.messages[firstLastTurnIdx - 1]?.role === 'assistant' && !(typeof SentUserLog !== 'undefined' && SentUserLog.isSameAsstTurnChunk?.(this.messages[firstLastTurnIdx - 1], this.messages[firstLastTurnIdx])) && (!lastAStart || !uTs || (uTs >= lastAStart - 120000 && uTs <= lastAStart + 30000))) {
          this.messages.splice(i, 1);
          this.messages.splice(firstLastTurnIdx, 0, tm);
          tm._prevAsstId = this.messages[firstLastTurnIdx - 1]?.id || tm._prevAsstId;
          lastAIdx++;
          changed = true;
          continue;
        }
        const lastAHasUser = firstLastTurnIdx >= 1 && this.messages[firstLastTurnIdx - 1]?.role === 'user';
        const isOlderThanLastAsst = lastAHasUser && lastAEnd > 0 && uTs > 0 && uTs < lastAEnd - 30000 && (!lastAStart || uTs < lastAStart - 30000);
        if (isOlderThanLastAsst || isDupOfEarlier) {
          this.messages.splice(i, 1);
          try { if (typeof SentUserLog !== 'undefined' && SentUserLog.remove) SentUserLog.remove(this.sid, tm.id, uTxt, uTs); } catch {}
          try { if (typeof Drafts !== 'undefined' && Drafts.ack) Drafts.ack(tm.id); } catch {}
          changed = true;
        }
      }
    }
    try { if (typeof MsgCache !== 'undefined' && typeof MsgCache.sanitize === 'function') MsgCache.sanitize(this.messages); } catch {}
    return changed;
  },
  // 和服务器对一次账（提问卡片的回答 / 别处提交的回答 / 别的设备发的消息）：正在输出的那条保持原对象不动
  reconcile(delay = 0) {
    const isKeptOrActive = !this.gacha || (typeof History !== 'undefined' && History.byId?.(this.sid)) || (typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid);
    if (delay > 0 && (!isKeptOrActive || !this.loaded)) return Promise.resolve(false);
    if (!this.sid) return Promise.resolve(false);
    if (this.recP) return this.recP;
    this.recoAt = now();
    const live0 = this.live, v0 = live0?.v || 0, gen0 = this.gen || 0;
    return this.recP = (async () => {
      if (delay) await sleep(delay);
      const isFg = typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid;
      const tailInterrupted = typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(this.messages?.at(-1));
      const hasGap = (typeof SentUserLog !== 'undefined' && SentUserLog.hasAdjacentAsstGap && SentUserLog.hasAdjacentAsstGap(this.messages));
      const recQuery = (this.busy || this.live || this.fakeEnd || this.midTurnStall || tailInterrupted || hasGap || (this.endAt && now() - this.endAt < 30000)) ? '?includeStreamToken=false' : '?includeStreamToken=false&recoverRun=false';
      let rec429 = false;
      const c = await api('/api/chat/' + this.sid + recQuery, { timeout: 35000, bg: true, noApiRetry: true }).catch(e => { if (e?.status === 429) rec429 = true; return null; });
      if (!c?.messages?.length || this.loading) {
        if (rec429 && !this.loading && !(this.streaming && !this.peeking) && typeof this.streamDirectFallback === 'function') {
          void this.streamDirectFallback().catch(() => false);
        }
        return false;
      }
      if ((this.gen || 0) !== gen0 || (live0 && this.live && this.live !== live0)) return false;
      if (this.busy && !this.live && this.status === 'submitted') return false;   // 自己刚发出、还没开始回复：交给发送流程
      this._srvLagged = false;
      const ch = this.mergeServer(c.messages, this.live);
      const liveIdxNow = this.live ? this.messages.indexOf(this.live) : -1;
      if (liveIdxNow > 0 && this.messages[liveIdxNow - 1]?.role === 'assistant' && typeof setTimeout === 'function') {
        if (typeof clearTimeout === 'function') clearTimeout(this._missingUserRecoT);
        this._missingUserRecoT = setTimeout(() => { this._missingUserRecoT = 0; if (this.loaded) void this.reconcile(0); }, 1500);
      }
      if (Array.isArray(this.messages) && this.messages.length > 0) this.loaded = true;
      const lagged = this._srvLagged;
      const last = c.messages.at(-1);
      const locLast = last ? (this.messages || []).find(m => m && m.id === last.id) : null;
      const noNewSrvEvents = Boolean(c.lastEventId != null && this.lastSeq != null && +c.lastEventId <= +this.lastSeq);
      const lastExplicitDone = Boolean(last?.metadata?.timing?.completedAt || last?.metadata?.finishReason === 'stop' || last?.metadata?.finishReason === 'end-turn' || last?.metadata?.aborted || last?.metadata?.error || (locLast?._finishedAt && !locLast?._forcedFinish && (noNewSrvEvents || now() - locLast._finishedAt < 60000)));
      const srvPend = !!last && ((last.role === 'user' && !locLast?.failed) || (last.metadata?.pending && !lastExplicitDone && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)))) && !(last.role === 'assistant' && Hitl.idleWait(this));
      this.dbg?.('reconcile', { n: c.messages.length, changed: !!ch, live: !!this.live, lagged, srvPend });
      if (c.publicAccessToken && !this.token) this.setToken(c.publicAccessToken);
      // 服务器说这一轮已经停在提问上（我们漏了结束标记）：别再显示「进行中」
      if (!this.live && this.status === 'streaming' && Hitl.idleWait(this)) { this.status = 'idle'; this.phase = ''; }
      else if (srvPend && !lagged && !this.busy && !(this.streaming && !this.peeking) && !this.syncing) {
        if (last.role === 'assistant' && last.metadata?.pending) this.live = this.messages.find(m => m.id === last.id) || null;
        const baseSeq = c.lastEventId != null ? Math.max(1, +c.lastEventId - 4000) : 1;
        this._remoteSyncSnap = { at: now(), c };
        if (this.remoteSync) void this.remoteSync({ seq: baseSeq, rewind: true, pend: true });
      } else if (!srvPend && !this.busy && !(this.streaming && !this.peeking)) {
        if (c.lastEventId != null) { this.lastSeq = String(c.lastEventId); this.fence = Math.max(this.fence || 0, +c.lastEventId); }
        const tailA = this.messages.at(-1);
        const tailCompRaw = tailA?.metadata?.timing?.completedAt;
        const tailCompMs = typeof tailCompRaw === 'number' ? tailCompRaw : (typeof tailCompRaw === 'string' ? Date.parse(tailCompRaw) : 0);
        const tailFinAt = Math.max(tailA?._finishedAt || 0, Number.isFinite(tailCompMs) ? tailCompMs : 0, this.endAt || 0, idTime(tailA?.id) || 0);
        if (tailA?.role === 'assistant' && !this.stopReq && !this.midTurnStall && (!tailFinAt || now() - tailFinAt < 90000)) {
          const st = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, tailA) : null;
          if (st) { this.endAt = this.endAt || (tailFinAt && now() - tailFinAt < 90000 ? tailFinAt : now()); this.midTurnStall = { at: this.endAt, why: st.why, key: st.key }; }
        }
      }
      if (ch) {
        this.messages.forEach(m => { if (m.parts?.some(p => p.toolCallId && Hitl.name(p))) m.v = (m.v || 0) + 1; });
        this.saveCache?.();
      }
      this.emit();
      if (lagged && !this.busy && !this.live && typeof setTimeout === 'function') {
        if (typeof clearTimeout === 'function') clearTimeout(this._lagRecoT);
        this._lagRecoT = setTimeout(() => { if (!this.busy && !this.live && this.loaded) void this.reconcile(0); }, 4500);
      }
      return ch;
    })().finally(() => { this.recP = null; this.recDone = now(); });
  },
  // 对账：以服务器上的对话记录为最终依据。
  async converge() {
    if (this.convP) return this.convP;
    this.convAt = now();
    const live0 = this.live, v0 = live0?.v || 0, gen0 = this.gen || 0;
    return this.convP = (async () => {
      if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
        if (this.busy || this._evalStreaming || this.loading) return false;
        try { await EvalEngine.loadChat(this, true); return true; } catch { return false; }
      }
      const isFg = typeof Tabs !== 'undefined' && Tabs.cur?.sid === this.sid;
      const isKeptOrActive = !this.gacha || (typeof History !== 'undefined' && History.byId?.(this.sid)) || isFg;
      const tailInterrupted = typeof hasInterruptedToolPart === 'function' && hasInterruptedToolPart(this.messages?.at(-1));
      const convQuery = (this.busy || this.live || this.fakeEnd || this.midTurnStall || tailInterrupted || (this._qSyncAt && now() - this._qSyncAt < 5000) || (this.endAt && now() - this.endAt < 30000)) ? '?includeStreamToken=false' : '?includeStreamToken=false&recoverRun=false';
      let conv429 = false;
      const c = await api('/api/chat/' + this.sid + convQuery, { timeout: 35000, bg: true, noApiRetry: true }).catch(e => { if (e?.status === 429) conv429 = true; return null; });
      if (!c?.messages?.length || this.loading || !isKeptOrActive) {
        if (conv429 && !this.loading && isKeptOrActive && !(this.streaming && !this.peeking) && typeof this.streamDirectFallback === 'function') {
          return await this.streamDirectFallback().catch(() => false);
        }
        return false;
      }
      if ((this.gen || 0) !== gen0 || (live0 && this.live && this.live !== live0)) return false;
      const live = this.live, last = c.messages.at(-1);
      const locLast = last ? (this.messages || []).find(m => m && m.id === last.id) : null;
      const noNewSrvEvents = Boolean(c.lastEventId != null && this.lastSeq != null && +c.lastEventId <= +this.lastSeq);
      const lastExplicitDone = Boolean(last?.metadata?.timing?.completedAt || last?.metadata?.finishReason === 'stop' || last?.metadata?.finishReason === 'end-turn' || last?.metadata?.aborted || last?.metadata?.error || (locLast?._finishedAt && noNewSrvEvents));
      const lastHasOpenTool = Boolean(last?.role === 'assistant' && !lastExplicitDone && !noNewSrvEvents && Array.isArray(last.parts) && last.parts.some(p => p?.toolCallId && !Hitl.name(p) && /^(input-streaming|input-available)$/.test(p.state || '')) && (now() - (idTime(last.id) || now()) < 15 * 60000));
      const srvPend = !!last && ((last.role === 'user' && !locLast?.failed) || (last.metadata?.pending && !lastExplicitDone && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last))) || lastHasOpenTool) && !(last.role === 'assistant' && Hitl.idleWait(this));
      this._lastConvergeSrvPend = srvPend;
      this.dbg?.('converge', { n: c.messages.length, live: !!live, pending: !!last?.metadata?.pending, srvPend, leid: c.lastEventId ?? null });
      if (!live) {
        if (this.busy || (this.streaming && !this.peeking) || this.syncing) return false;   // 这期间有别的流程在跑
        this._srvLagged = false;
        const ch = this.mergeServer(c.messages, null);
        const lagged = this._srvLagged;
        this.dbg?.('converge-merge', { changed: !!ch, srvPend, lagged });
        if (srvPend && !lagged) {
          if (last.role === 'assistant' && last.metadata?.pending) this.live = this.messages.find(m => m.id === last.id) || null;
          if (ch) this.saveCache?.();
          this.emit();
          const baseSeq = c.lastEventId != null ? Math.max(1, +c.lastEventId - 4000) : 1;
          this._remoteSyncSnap = { at: now(), c };
          if (this.remoteSync) void this.remoteSync({ seq: baseSeq, rewind: true, pend: true });
          return true;
        }
        if (!ch) {
          this._lastSyncedHistAt = (typeof History !== 'undefined' && History.byId?.(this.sid)?.updatedAt) || this._lastSyncedHistAt || null;
          return false;
        }
        // 服务器已经停下：位置跟到快照，空闲监听不会再把这一轮当成「别处新开的」重放一遍
        if (!last?.metadata?.pending && c.lastEventId != null) { this.lastSeq = String(c.lastEventId); this.fence = +c.lastEventId; }
        const tailA = this.messages.at(-1);
        const tailCompRaw = tailA?.metadata?.timing?.completedAt;
        const tailCompMs = typeof tailCompRaw === 'number' ? tailCompRaw : (typeof tailCompRaw === 'string' ? Date.parse(tailCompRaw) : 0);
        const tailFinAt = Math.max(tailA?._finishedAt || 0, Number.isFinite(tailCompMs) ? tailCompMs : 0, this.endAt || 0, idTime(tailA?.id) || 0);
        if (tailA?.role === 'assistant' && !this.stopReq && !this.midTurnStall && (!tailFinAt || now() - tailFinAt < 90000)) {
          const st = typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled ? KeepAlive.isMidTurnStalled(this, tailA) : null;
          if (st) { this.endAt = this.endAt || (tailFinAt && now() - tailFinAt < 90000 ? tailFinAt : now()); this.midTurnStall = { at: this.endAt, why: st.why, key: st.key }; }
        }
        this._lastSyncedHistAt = (typeof History !== 'undefined' && History.byId?.(this.sid)?.updatedAt) || null;
        this.messages.forEach(m => { if (m.parts?.some(p => p.toolCallId && Hitl.name(p))) m.v = (m.v || 0) + 1; });
        this.saveCache?.();
        this.emit(); return true;
      }
      const preLiveIdx = this.messages.indexOf(live);
      if (preLiveIdx > 0 && this.messages[preLiveIdx - 1]?.role === 'assistant' && typeof this.mergeServer === 'function') {
        if (this.mergeServer(c.messages, live)) { this.saveCache?.(); this.emit(); }
      }
      const liveIdx = this.messages.indexOf(live);
      const prevLocalUser = liveIdx > 0 ? [...this.messages.slice(0, liveIdx)].reverse().find(x => x && x.role === 'user') : null;
      const prevUserInSrvIdx = prevLocalUser ? c.messages.findIndex(x => x && (x.id === prevLocalUser.id || (prevLocalUser.metadata?.nodeId && x.metadata?.nodeId === prevLocalUser.metadata.nodeId))) : -1;
      const lastIsOlderTurn = Boolean(last && this.messages.some(x => x && x !== live && (x.id === last.id || (x.metadata?.nodeId && x.metadata?.nodeId === last.metadata?.nodeId))));
      const canFallbackToLast = Boolean(last?.role === 'assistant' && !lastIsOlderTurn && (!prevLocalUser || (prevUserInSrvIdx >= 0 && prevUserInSrvIdx < c.messages.length - 1)));
      const sv = c.messages.find(x => x && (x.id === live.id || (live.metadata?.nodeId && x.metadata?.nodeId === live.metadata.nodeId))) || (canFallbackToLast ? last : null);
      if (!sv || sv.role !== 'assistant' || live !== this.live || this.stopReq) return false;
      const body = x => (x.parts || []).filter(p => p.type !== 'step-start'), lp = body(live), sp = body(sv);
      const hasQuestions = p => Array.isArray(Hitl.input(p)?.questions) && Hitl.input(p).questions.length > 0;
      const lpById = new Map(lp.filter(p => p.toolCallId).map(p => [p.toolCallId, p]));
      const srvAsk = sp.some(p => {
        if (!Hitl.awaiting(p)) return false;
        const cur = lpById.get(p.toolCallId);
        if (!cur) return true;
        if (cur.state === 'input-streaming' && p.state !== 'input-streaming') return true;
        if (Hitl.name(p) === 'ask_user' && hasQuestions(p) && !hasQuestions(cur)) return true;
        return false;
      });
      const svSubstantive = typeof hasSubstantiveAssistantWork === 'function' ? hasSubstantiveAssistantWork(sv) : sp.length > 0;
      const svExplicitDone = Boolean(sv.metadata?.timing?.completedAt || sv.metadata?.aborted || sv.metadata?.error || sv.metadata?.finishReason === 'stop' || sv.metadata?.finishReason === 'end-turn' || sv._finishedAt);
      const srvDone = !sv.metadata?.pending && (sp.length > lp.length || svExplicitDone || live.metadata?.pending === false || ((svSubstantive || lp.length > 0) && sp.length >= lp.length));
      const tail = lp.at(-1), localAsk = !!tail && Hitl.awaiting(tail) && tail.state !== 'input-streaming' && (Hitl.name(tail) !== 'ask_user' || hasQuestions(tail));
      if (!srvAsk && !srvDone && !localAsk) {
        const patchFn = typeof this._patchAssistantParts === 'function' ? this._patchAssistantParts : null;
        if (srvPend && sp.length >= lp.length && patchFn) {
          if (patchFn(live, sv)) {
            live.v = (live.v || 0) + 1;
            this.saveCache?.();
            this.emit();
          }
        }
        return false;
      }
      this.dbg?.('converge-adopt', { srvAsk, srvDone, localAsk });
      if (srvAsk || srvDone) {
        live.id = sv.id;
        let nextParts = JSON.parse(JSON.stringify(sv.parts || []));
        if (Array.isArray(live.parts) && Array.isArray(nextParts)) {
          const localReason = live.parts.filter(p => p && p.type === 'reasoning');
          const srvHasReason = nextParts.some(p => p && p.type === 'reasoning');
          if (localReason.length && !srvHasReason) nextParts = [...localReason, ...nextParts];
          const lIds = { reasoning: live.parts.filter(p => p?.type === 'reasoning' && p.id), text: live.parts.filter(p => p?.type === 'text' && p.id) }, idxMap = { reasoning: 0, text: 0 };
          nextParts = nextParts.map(sp => (sp && (sp.type === 'reasoning' || sp.type === 'text') && !sp.id && lIds[sp.type]?.[idxMap[sp.type]]?.id) ? { ...sp, id: lIds[sp.type][idxMap[sp.type]++].id } : sp);
        }
        if (srvDone && Array.isArray(nextParts)) {
          nextParts = nextParts.map(sp => (sp?.toolCallId && !Hitl.name(sp) && /^(input-streaming|input-available)$/.test(sp.state || '')) ? { ...sp, state: 'output-error', errorText: sp.errorText || '未返回结果' } : sp);
        }
        live.parts = nextParts;
        live.metadata = { ...(live.metadata || {}), ...(sv.metadata || {}), pending: false };
      }
      if (srvDone) { this.finAt = this.finAt || now(); this.realTcAt = this.realTcAt || now(); }
      this.parts.clear(); live.v = (live.v || 0) + 1;
      this.finishTurn(null, true); return true;
    })().finally(() => { this.convP = null; });
  },
  // 前台对话的对账节奏（Sync 每 3 秒调一次）：空闲 20 秒一次；输出中超过 20 秒没有新记录，按退避对账。若末尾是未回复的用户消息或未完成回复则 2.5 秒一次。
  tickConverge() {
    if (document.hidden || this.gacha || !this.loaded || this.loading || this.convP || this.syncing || ReadLimit.active()) return;
    const fgSid = typeof Tabs !== 'undefined' ? Tabs.cur?.sid : null;
    if (fgSid && Chats.get(fgSid)?.loading) return;
    const t = now(); if (!this.convAt) { this.convAt = t; return; }
    if (this.live) { this.convGap = 0; if ((this.recAt || 0) > this.convAt) this.liveGap = 0; const lg = this.liveGap || 10000; if (t - (this.recAt || 0) > lg && t - this.convAt > lg) { this.liveGap = Math.min(60000, lg * 2); this.converge(); } return; }
    if (this.busy || (this.streaming && !this.peeking)) { this.convGap = 0; return; }
    const lastMsg = this.messages.at(-1);
    // const waitReply = !!lastMsg && (lastMsg.role === 'user' || lastMsg.metadata?.pending);
    const waitReply = !!lastMsg && ((lastMsg.role === 'user' && !lastMsg.failed) || lastMsg.metadata?.pending) && !Hitl.idleWait(this);
    const baseGap = waitReply ? 2500 : 20000;
    const gap = waitReply ? 2500 : Math.max(baseGap, this.convGap || baseGap), cap = this.watching && !this.wFails ? 900000 : 300000;
    if (t - this.convAt > gap) void this.converge().then(ch => { this.convGap = (ch || waitReply) ? (waitReply ? 2500 : baseGap) : Math.min(cap, gap * 2); }, () => { this.convGap = Math.min(cap, gap * 2); });
  },
  quickSync(force = false) {
    if (!this.loaded || this.loading || this.sending || this.sid.startsWith('local-') || window.__BRANA_BROWSE_MODE) return;
    const t = now();
    if (!force && t - (this._qSyncAt || 0) < 1000) return;
    this._qSyncAt = t;
    if (this.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(this))) {
      if (!this.busy && !this._evalStreaming) void EvalEngine.loadChat(this, true).catch(() => {});
      return;
    }
    this.convGap = 20000;
    this.convAt = 1;
    if (!this.busy && !(this.streaming && !this.peeking) && !this.syncing) {
      void this.converge();
      if (!this.watching) void this.watch();
    } else if (t - (this.recAt || this.evtAt || 0) > 3500) {
      void this.converge();
    }
  },
  // 发现别的设备开了新一轮：拉最新消息 → 这一轮还在跑就从开头接上实时流，已经跑完就直接显示结果
  async remoteSync(hit) {
    if (this.busy || this.syncing || this.gacha) return; this.syncing = true;
    try {
      const from = this.lastSeq;
      if (hit?.seq != null && (this.lastSeq == null || hit.rewind)) this.lastSeq = hit.seq > 0 ? String(hit.seq - 1) : null;
      const info = await this.drain(1500, { keepIfFinished: !!hit?.pend });
      const snap = (this._remoteSyncSnap && now() - (this._remoteSyncSnap.at || 0) < 5000) ? this._remoteSyncSnap.c : null;
      this._remoteSyncSnap = null;
      const c = hit?.chatSnap || snap || ((ReadLimit.active() && (info?.open || info?.run)) ? null : await api('/api/chat/' + this.sid + '?includeStreamToken=false', { timeout: 35000, bg: true, noApiRetry: true }).catch(() => null));
      if (this.busy || (this.streaming && !this.peeking)) return;
      if (c?.messages?.length && typeof this.mergeServer === 'function') this.mergeServer(c.messages, null);
      if (c?.publicAccessToken) this.setToken(c.publicAccessToken);
      const last = c?.messages?.at(-1);
      const srvPend = !!last && (last.role === 'user' || (last.metadata?.pending && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(last)))) && !(last.role === 'assistant' && Hitl.idleWait(this));
      const isStreamOpen = Boolean(info?.open || info?.run);
      const act = (isStreamOpen || srvPend) ? (hit?.mid ? (info?.runSeq ?? info?.act ?? null) : (info?.runSeq ?? info?.act ?? (hit?.seq && this.lastSeq === from ? hit.seq : null))) : null;
      if (isStreamOpen || srvPend) {
        const startSeq = act ?? info?.runSeq ?? hit?.seq ?? (c?.lastEventId != null ? Math.max(1, +c.lastEventId - 1200) : (info?.max ?? 1));
        this.lastSeq = String(Math.max(0, startSeq - 1)); this.fence = Math.max(0, startSeq - 1);
        this.status = 'streaming'; this.phase = '接收回复中'; this.remote = true; this.error = null;
        this.sentAt = now(); this.respAt = 0; this.finAt = 0; this.endAt = 0;
        const tailMsg = this.messages.at(-1);
        const tailIsPending = Boolean(tailMsg?.role === 'assistant' && (tailMsg.metadata?.pending || (last?.role === 'assistant' && last?.metadata?.pending && tailMsg.id === last.id) || isStreamOpen) && !(typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tailMsg)));
        if (tailIsPending) {
          this.live = tailMsg;
          this.parts.clear();
          (tailMsg.parts || []).forEach(p => {
            if (!p) return;
            if (p.toolCallId) this.parts.set('tool:' + p.toolCallId, p);
            if ((p.type === 'text' || p.type === 'reasoning') && p.id) this.parts.set(p.type[0] + ':' + p.id, p);
          });
        } else if (last?.role === 'assistant' && last?.metadata?.pending) {
          this.live = this.messages.find(m => m.id === last.id) || null;
        } else {
          this.live = null;
          this.parts.clear();
          if (tailMsg?.role === 'assistant') this.reconcile?.(700);
        }
        this.emit(); this.restream();
      } else {
        const maxSeq = Math.max(+(this.lastSeq || 0), info?.max != null && info.max >= 0 ? info.max : 0, c?.lastEventId != null ? +c.lastEventId : 0, hit?.seq != null ? +hit.seq : 0);
        if (maxSeq > 0) { this.lastSeq = String(maxSeq); this.fence = Math.max(this.fence || 0, maxSeq); }
        if (this.status === 'streaming' && !this.live && !this.awaitId && !this.preSend && !this.sending) {
          this.status = 'idle'; this.phase = '';
        }
        this.saveCache?.();
        if (typeof SendQ !== 'undefined' && SendQ.of?.(this)?.length) setTimeout(() => { try { SendQ.check(this); } catch {} }, 50);
        this.emit();
      }
      Bus.emit('remote', this);
    } finally { this.syncing = false; }
  },
});
// 被「重复 / 已读过」跳过的记录也记进轨迹（不改 onRecord 本身：位置没动 = 被跳过）
{ const orig = Chat.prototype.onRecord; Chat.prototype.onRecord = function (rec) { const b = this.lastSeq, r = orig.call(this, rec); try { if (rec?.seq_num != null && r !== 'done' && this.lastSeq === b) this.dbgRec?.(rec, 'skip'); } catch {} return r; }; }
// 挂哪些对话：当前窗口一定挂；其它打开着的窗口（已加载过的）也挂，电脑最多 4 个、手机最多 2 个

