// A queue item stays owned by the queue until Chat.send durably hands it to the outbox.
// Failed/uncertain business POSTs are never automatically replayed by this scheduler.
const SendQ = {
  of(chat) { if (chat && (!chat._qh || (typeof Drafts !== 'undefined' && (chat._qhScope !== Drafts.scope || (!chat._qhReady && Drafts.ready))))) Drafts.hydrateQ(chat); return chat ? (chat.queue ||= []) : []; },
  mode(chat) {
    if (chat?._qMode === 'split' || chat?._qMode === 'merge') return chat._qMode;
    if (typeof Prefs !== 'undefined' && (Prefs.qMode === 'split' || Prefs.qMode === 'merge')) return Prefs.qMode;
    return typeof Prefs !== 'undefined' ? 'split' : 'merge';
  },
  setMode(chat, m) {
    const next = m === 'merge' ? 'merge' : 'split';
    if (chat) chat._qMode = next;
    if (typeof Prefs !== 'undefined') { Prefs.qMode = next; try { savePrefs?.(); } catch {} }
    if (chat) chat.emit();
    return next;
  },
  toggleMode(chat) {
    return this.setMode(chat, this.mode(chat) === 'split' ? 'merge' : 'split');
  },
  add(chat, text, atts = []) {
    if (!chat || (!String(text || '').trim() && !atts.length)) return false;
    const q = this.of(chat), item = { id: uuid7(), text: String(text || ''), atts: atts.slice(), at: now() }; q.push(item);
    if (Drafts.setQ(chat, true) === false) { q.splice(q.indexOf(item),1); chat.emit(); toast('队列保存失败，输入已保留，请检查存储空间','err'); return false; }
    chat.emit(); return true;
  },
  blocked(chat, manual = false) {
    if (!chat || !this.of(chat).length) return '队列为空';
    if (!manual && typeof UI !== 'undefined' && (!UI.authed || !UI.me)) return '等待账号核对';
    if (!chat.loaded || chat.loading) return '等待对话同步';
    if ((chat._startupResuming || chat._recoveringIncomplete) && chat.loaded && !chat.cached && !chat.loading && chat.status === 'streaming' && !chat.live && !chat.awaitId && !chat.preSend && !chat.sending) {
      const lastVis = (chat.messages || []).filter(m => m && !m._held && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m))).at(-1);
      const isTailSettled = Boolean(lastVis && lastVis.role === 'assistant' && !lastVis.metadata?.pending && !lastVis._incomplete && Boolean(lastVis._finishedAt || lastVis.metadata?.timing?.completedAt || lastVis.metadata?.aborted || lastVis.metadata?.error || lastVis.metadata?.finishReason === 'stop' || lastVis.metadata?.finishReason === 'end-turn'));
      if (isTailSettled && !(typeof Hitl !== 'undefined' && Hitl.idleWait(chat))) {
        chat.status = 'idle';
        chat.phase = '';
        chat._startupResuming = false;
        chat._recoveringIncomplete = false;
        if (typeof RunningTracker !== 'undefined') { try { RunningTracker.onChatUpdate(chat); } catch {} }
      }
    }
    if (chat._qBusy && chat._qBusyAt && now() - chat._qBusyAt > 12000 && !chat.busy) chat._qBusy = false;
    if ((typeof Hitl !== 'undefined' && typeof Hitl.blocked === 'function' ? Hitl.blocked(chat) : chat.busy) || chat.stopReq || chat.preSend || chat._qBusy) return '上一条仍在处理';
    if (chat.gacha && chat.sid && typeof Gacha !== 'undefined' && typeof Gacha.stepOf === 'function' && !Gacha.stepOf(chat.sid) && !Gacha.running) chat.gacha = null;
    if (chat.gacha || chat.fpLocked || Fingerprint.isRunning(chat)) return '等待抽卡或指纹任务结束';
    if (Hitl.pending(chat).length && !(manual && SendQ.skippable(chat))) return SendQ.skippable(chat) ? '等待选择（可点「立即发送」跳过选择直接发）' : '等待交互问题的回答';
    if ((chat.messages || []).some(m => m.deliveryUnknown && m._local)) return '上条消息送达状态未确认，请先刷新对话核对，勿重复发送';
    if (Drafts.load().o.some(o => o.sid === chat.sid && !chat._oOk?.has(o.id) && !(chat.messages || []).some(m => m.id === o.id && m.failed && !m.deliveryUnknown))) return '上一条输入尚未确认，请先刷新核对或重试失败消息';
    if (!manual && (chat._qHold || 0) > now()) return chat._qHoldWhy || '正在核对服务器状态';
    if (manual && chat._routePaused) chat._routePaused = false;
    if (chat._routePaused && !chat.thinkStopped) chat._routePaused = false;
    if (!manual && chat._routePaused && chat.thinkStopped) return '闭源模型出现开源思考已暂停，点「立即发送」继续';
    if (!manual && (chat._qPaused || chat.error || chat.status === 'error')) return chat._qPaused || '上一轮出错，队列已暂停';
    if (this.of(chat).length > 0) {
      if (chat.midTurnStall) chat.midTurnStall = null;
      if (chat._ka?.plan?.kind === 'cont') chat._ka.plan = null;
    }
    if (!manual && (chat.fakeEnd || chat._ka?.plan || chat.midTurnStall || (typeof KeepAlive !== 'undefined' && KeepAlive.isMidTurnStalled?.(chat)))) return '等待上一轮任务自动继续完成';
    if (!manual && chat.tcAt && now() - chat.tcAt < 2200 && typeof KeepAlive !== 'undefined' && typeof KeepAlive.isMidTurnStalled === 'function') return '正在核对上一轮是否完整结束';
    return '';
  },
  skippable(chat) { return typeof Hitl.skippable === 'function' ? Hitl.skippable(chat) : null; },
  blockedExceptBusy(chat, manual) { chat._qBusy = false; const r = this.blocked(chat, manual); chat._qBusy = true; return r; },
  ready(chat) { return !this.blocked(chat); },
  check(chat) {
    if (typeof UI !== 'undefined' && !UI.authed) return;
    if (chat && !chat.busy && typeof Drafts !== 'undefined' && Drafts.load?.().o.some(o => o.sid === chat.sid)) {
      try { Drafts.check?.(chat); } catch {}
    }
    if (chat?._qT) return;
    if (!this.ready(chat)) {
      if (this.of(chat).length && !this.blocked(chat, true) && !chat._qPaused && !chat.error && chat.status !== 'error' && !chat.fakeEnd && !chat._ka?.plan && !chat.midTurnStall) {
        const waitTc = chat.tcAt && now() - chat.tcAt < 2200 ? Math.max(200, 2250 - (now() - chat.tcAt)) : 0;
        const waitHold = (chat._qHold || 0) > now() ? Math.max(200, chat._qHold - now() + 50) : 0;
        const waitMs = Math.max(waitTc, waitHold);
        if (waitMs > 0) {
          chat._qT = setTimeout(() => { chat._qT = 0; if (this.ready(chat)) void this.flush(chat); }, waitMs);
        }
      }
      return;
    }
    chat._qT = setTimeout(() => { chat._qT = 0; if (this.ready(chat)) void this.flush(chat); }, 1500);
  },
  // 发送前的最终核对（以服务器为准，不只看本地标志）：对话快照里最后一条不是 pending / 未回复的用户消息，
  // 且实时通道上没有进行中的一轮。返回 '' = 可以发；否则是原因。未知（网络错误）也不发，稍后重试。
  async serverSettled(chat, { manual = false } = {}) {
    const localLast = (chat?.messages || []).filter(m => !m?._held && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(m))).at(-1);
    const localDone = !!localLast && localLast.role === 'assistant' && !localLast.metadata?.pending && !chat.busy && !chat.live;
    const isTrulyLocalDone = localDone && !localLast?._incomplete;
    const msgDoneAt = (!localLast?.metadata?.pending && (Date.parse(localLast?.metadata?.timing?.completedAt || localLast?.createdAt || '') || (typeof idTime === 'function' ? idTime(localLast?.id) : 0))) || 0;
    const doneAt = Math.max(chat?.endAt || 0, chat?.tcAt || 0, chat?.finAt || 0, localLast?._finishedAt || 0, msgDoneAt);
    if (isTrulyLocalDone && (manual || !chat?.cached || (doneAt && now() - doneAt >= 1500))) {
      if (chat.tcAt && now() - chat.tcAt < 1800) await sleep(Math.max(0, 1800 - (now() - chat.tcAt)));
      return '';
    }
    let j; try { j = await api('/api/chat/' + chat.sid + '?includeStreamToken=false&recoverRun=false', { timeout: 10000, bg: true }); } catch (err) {
      if (localDone) return '';
      if (err?.status === 429 || err?.rateLimitedLocally) {
        const pk429 = await chat.peekTurn(chat.lastSeq, null, 2000, { settleCheck: true }).catch(() => null);
        if (pk429?.last != null && (chat.lastSeq == null || pk429.last > +chat.lastSeq)) chat.lastSeq = String(pk429.last);
        if (pk429?.busy) return '服务器还在处理上一轮';
        if (pk429 && !pk429.busy && (pk429.done || pk429.settled)) return '';
      }
      return '暂时无法核对服务器状态，稍后重试';
    }
    if (!Array.isArray(j?.messages)) return localDone ? '' : '暂时无法核对服务器状态，稍后重试';
    const last = j.messages.at(-1);
    const lastDone = Boolean(last && (last.metadata?.timing?.completedAt || last.metadata?.finishReason === 'stop' || last.metadata?.finishReason === 'end-turn' || last.metadata?.aborted || last.metadata?.error || last.status === 'completed' || last.status === 'failed' || last.status === 'error'));
    const lastTs = Date.parse(last?.metadata?.timing?.completedAt || last?.createdAt || '') || (typeof idTime === 'function' ? idTime(last?.id) : 0) || 0;
    const lastStale = lastTs > 0 && now() - lastTs > 60000;
    if (j?.lastEventId != null && (!last?.metadata?.pending || lastDone) && (chat.lastSeq == null || +j.lastEventId > +chat.lastSeq)) {
      chat.lastSeq = String(j.lastEventId);
    }
    const pk = await chat.peekTurn(chat.lastSeq, null, 2000, { settleCheck: true });
    if (pk?.last != null && (chat.lastSeq == null || pk.last > +chat.lastSeq)) chat.lastSeq = String(pk.last);
    if (pk?.busy) return '服务器还在处理上一轮';
    if (last && (last.role === 'user' || (last.metadata?.pending && !lastDone)) && !(last.role === 'assistant' && Hitl.idleWait(chat))) {
      if (!localDone && !lastStale && !(pk && !pk.busy && pk.done)) return '服务器还在处理上一轮';
    }
    if (!pk && !localDone && !manual) {
      chat._qUnk = (chat._qUnk || 0) + 1;
      if (chat._qUnk <= 1) return '暂时无法核对实时通道，稍后重试';
    }
    chat._qUnk = 0;
    if (now() - (chat.tcAt || 0) < 1800) await sleep(Math.max(0, 1800 - (now() - (chat.tcAt || 0))));
    return '';
  },
  status(chat) { return chat?._qBusy ? '正在准备队列附件…' : this.blocked(chat) || (this.mode(chat) === 'split' ? '本轮真正完成后按顺序逐条分列发送' : '本轮结束后按顺序合并发送'); },
  async copy(chat, item) {
    const txt = String(item?.text || '');
    if (!txt) { try { toast('该条队列没有文字可复制', 'err'); } catch {} return false; }
    try { await navigator.clipboard.writeText(txt); toast('已复制队列内容'); return true; }
    catch { try { toast('复制失败', 'err'); } catch {} return false; }
  },
  recall(chat, item) {
    if (!chat || !item) return false;
    const q = this.of(chat), i = q.indexOf(item);
    if (i < 0) return false;
    q.splice(i, 1);
    if (item.id) chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), item.id])].slice(-32);
    if (!q.length) chat._qPaused = '';
    try { Drafts.setQ(chat, true); } catch {}
    const tab = typeof Tabs !== 'undefined'
      ? ((Tabs.list || []).find(t => t && t.sid === chat.sid && !t.kind)
        || ((Tabs.list || []).find(t => t && t.sid === chat.sid))
        || (Tabs.cur && (!Tabs.cur.sid || Tabs.cur.sid === chat.sid) && !Tabs.cur.kind ? Tabs.cur : null))
      : null;
    const tas = [];
    if (typeof document !== 'undefined') {
      if (tab?.key && typeof document.querySelectorAll === 'function') {
        for (const el of document.querySelectorAll('textarea[data-tab="' + tab.key + '"]')) {
          if (el && !tas.includes(el)) tas.push(el);
        }
      }
      if (!tas.length && typeof document.querySelector === 'function') {
        const canFallback = typeof UI === 'undefined' || !UI.els?.chat || UI.els.chat === chat || (typeof Tabs !== 'undefined' && Tabs.cur === tab);
        if (canFallback) {
          const fallbackTa = document.querySelector('#inp') || document.querySelector('.cbox textarea') || (tab?.key ? document.querySelector('textarea[data-tab="' + tab.key + '"]') : null);
          if (fallbackTa && !tas.includes(fallbackTa)) tas.push(fallbackTa);
        }
      }
    }
    const liveVal = tas[0] && typeof tas[0].value === 'string' ? tas[0].value : '';
    const tabVal = tab && typeof tab.draft === 'string' ? tab.draft : '';
    const storeVal = (typeof Drafts !== 'undefined' && Drafts.get?.(chat.sid)) || '';
    const curDraft = liveVal || tabVal || storeVal || '';
    const recText = String(item.text || '');
    const nextDraft = curDraft && recText ? (curDraft + '\n' + recText) : (recText || curDraft);
    if (tab) tab.draft = nextDraft;
    try { Drafts.set?.(chat.sid, nextDraft); } catch {}
    if (Array.isArray(item.atts) && item.atts.length) {
      if (typeof UI !== 'undefined' && UI.atts && tab) {
        const list = UI.atts.get(tab.key) || [];
        UI.atts.set(tab.key, list);
        for (const a of item.atts) if (!list.includes(a)) list.push(a);
        try { UI.paintAtt?.(); } catch {}
      } else if (typeof Att !== 'undefined') {
        const list = Att.of(chat);
        for (const a of item.atts) if (!list.includes(a)) list.push(a);
      }
    }
    if (tab && typeof Drafts !== 'undefined' && typeof Drafts.setTab === 'function') {
      try { Drafts.setTab(tab, typeof UI !== 'undefined' && UI.atts ? UI.atts.get(tab.key) : undefined); } catch {}
      try { Tabs?.save?.(); } catch {}
    } else if (chat.sid && typeof Drafts !== 'undefined' && typeof Drafts.load === 'function') {
      try {
        const d = Drafts.load(), k = 'sid:' + chat.sid, o = d.t?.[k];
        if (d.t) {
          d.t[k] = {
            v: nextDraft,
            at: typeof now === 'function' ? now() : Date.now(),
            atts: [...(o?.atts || []), ...(item.atts || []).map(a => Drafts.attOut?.(a)).filter(Boolean)],
            missing: [...(o?.missing || []), ...(Drafts.missing?.(item.atts) || [])]
          };
          Drafts.write?.(true);
        }
      } catch {}
    }
    for (const ta of tas) {
      ta.value = nextDraft;
      if (ta.style) {
        ta.style.height = 'auto';
        ta.style.height = Math.min(200, ta.scrollHeight || 40) + 'px';
      }
      try { if (typeof Event === 'function') ta.dispatchEvent?.(new Event('input')); } catch {}
      try { ta.focus?.(); } catch {}
    }
    chat.emit();
    try { UI?.paintQ?.(); } catch {}
    try { toast('已撤回至输入框'); } catch {}
    return true;
  },
  remove(chat, item) { const q = this.of(chat), i = q.indexOf(item); if (i >= 0) { q.splice(i, 1); if (item?.id) chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), item.id])].slice(-32); } if (!q.length) chat._qPaused = ''; try { Drafts.setQ?.(chat, true); } catch {} chat.emit(); },
  clear(chat) { const q = this.of(chat); const ids = q.map(x => x?.id).filter(Boolean); if (ids.length) chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), ...ids])].slice(-32); chat._qClearedAt = now(); q.splice(0); chat._qPaused = ''; clearTimeout(chat._qT); chat._qT = 0; try { Drafts.setQ?.(chat, true); } catch {} chat.emit(); },
  // Reserved for explicit transfer back to the composer, never used before async sends.
  take(chat) { if (chat?._qBusy) return { text: '', atts: [] }; const items = this.of(chat).splice(0); chat.emit(); return { text: items.map(i => i.text).filter(Boolean).join('\n'), atts: items.flatMap(i => i.atts || []) }; },
  async flush(chat, { manual = false } = {}) {
    let reason = this.blocked(chat, manual);
    // 手动「立即发送」被待确认记录挡住：当场向服务器核对一次，确认后直接发
    if (manual && /上一条输入尚未确认/.test(reason) && typeof Drafts !== 'undefined') { toast('正在向服务器核对上一条…'); const ok = await Drafts.verify(chat).catch(() => false);
      // 用户明确点了「立即发送」、核对后仍未知（没有被放回队首）：不再挡住，发送前仍以服务器状态为准做最后核对
      if (!ok && chat._qPaused) { toast(chat._qPaused, 'err'); return false; }   // 旧消息确实没送达、已放回队首：先让用户核对
      if (!ok) { chat._oOk ||= new Set(); for (const o of Drafts.load().o) if (o.sid === chat.sid) chat._oOk.add(o.id); }
      reason = this.blocked(chat, manual); }
    if (reason) { if (manual) toast(reason, 'err'); return false; }
    clearTimeout(chat._qT); chat._qT = 0; chat._qBusy = true; chat._qBusyAt = now(); chat._qPaused = '';
    const qAll = this.of(chat).slice(), batch = this.mode(chat) === 'split' ? qAll.slice(0, 1) : qAll, atts = batch.flatMap(i => i.atts || []);
    let handedOff = false;
    try {
      // Validate uploads before creating a local message. A missing upload after restart
      // must not silently turn an attachment request into a text-only message.
      if (atts.some(a => a.state === 'bad' || (!a.res && !a.p))) throw Error('队列附件不可用，请移出该条并重新添加附件');
      const files = atts.length ? await NetPolicy.deadline(() => Promise.all(atts.map(a => a.res || a.p)), { timeout: 90000 }) : null;
      if (files?.some(f => !f?.key)) throw Error('队列附件上传失败，请移出该条并重新添加附件');
      // The user may have removed/cleared an item while its upload was pending.
      if (!batch.every(item => this.of(chat).includes(item))) return false;
      chat._qBusy = false; const changed = this.blocked(chat, manual); chat._qBusy = true;
      if (changed) throw Error(changed);
      // 以服务器状态为准做最后核对；没结束 / 未知时消息留在队列里，过几秒再试（不算失败、不暂停）
      const sv = await this.serverSettled(chat, { manual });
      if (sv) {
        chat._qHold = now() + 4000; chat._qHoldWhy = sv;
        if (/还在处理/.test(sv) && !chat.busy && now() - (chat._qSyncAt || 0) > 20000) { chat._qSyncAt = now(); void chat.reload('队列发现服务器仍在处理上一轮').catch(() => {}); }
        if (manual) toast(sv, 'err');
        return false;
      }
      if (!batch.every(item => this.of(chat).includes(item)) || this.blockedExceptBusy(chat, manual)) return false;
      const text = batch.map(i => i.text).filter(Boolean).join('\n') || '请查看附件：' + atts.map(a => a.name).join('、');
      if (UI.els?.chat === chat) UI.stick = true;
      const skip = manual && !!SendQ.skippable(chat);   // 立即发送：没选的图片 / 声音按 Skip 提交，和队列文字一起发
      await (skip ? chat.skipHitlSend.bind(chat) : chat.send.bind(chat))(text, {
        ...(files ? { files, previews: atts } : {}), queueIds: batch.map(i => i.id),
        onPrepared: () => {
          handedOff = true;
          const bIds = batch.map(i => i?.id).filter(Boolean);
          if (bIds.length) chat._qRemovedIds = [...new Set([...(chat._qRemovedIds || []), ...bIds])].slice(-64);
          const q = this.of(chat); for (const item of batch) { const i = q.indexOf(item); if (i >= 0) q.splice(i, 1); }
          if (!q.length) chat._qClearedAt = now();
          try { if (typeof Drafts !== 'undefined' && typeof Drafts.setQ === 'function') Drafts.setQ(chat, true); } catch {}
        },
      });
      if (!handedOff) throw Error('消息未进入发送流程，已保留队列，请检查前置任务');
      return true;
    } catch (e) {
      // After handoff, the failed local message + outbox own the content. Restoring it
      // to the auto queue here would duplicate an already accepted but timed-out POST.
      chat._qPaused = handedOff ? '上一条发送未完成，请先核对消息状态' : describe(e);
      toast('队列已暂停：' + describe(e), 'err'); return false;
    } finally {
      chat._qBusy = false; chat.emit();
      if (this.of(chat).length) this.check(chat);
    }
  },
  start() {
    if (this.started) return; this.started = true;
    const tick = () => {
      if (!UI.authed || !UI.me || (navigator.onLine === false && !(typeof NetHealth !== 'undefined' && NetHealth.recent()))) return;
      for (const c of Chats.values()) if (c.queue?.length || (!c._qh && Drafts.load().q?.[c.sid]?.items?.length)) this.check(c);
      // Restore unopened queued chats as well, with bounded loading and failure backoff.
      const qMap = Drafts.load().q;
      if (!qMap) return;
      const pending = Object.entries(qMap).filter(([, q]) => q?.items?.length && !q.paused);
      for (const [sid] of pending) {
        const c = chatOf(sid); if (c.loaded || c.loading || c.gacha || (c._qLoadAt || 0) > now() || (this.loads || 0) >= 2) continue;
        c._qLoadAt = now() + 30000; this.loads = (this.loads || 0) + 1;
        void c.load().then(() => { c._qLoadFailures = 0; }).catch(e => {
          c._qLoadFailures = (c._qLoadFailures || 0) + 1;
          c._qLoadAt = now() + Math.max(+e.retryAfterMs || 0, Math.min(300000, 30000 * 2 ** Math.min(c._qLoadFailures,4)));
          if (e.status === 404 || e.status === 403) { c._qPaused = '对话无法读取，队列已保留：' + describe(e); c.emit(); }
        }).finally(() => { this.loads--; this.check(c); });
      }
    };
    this.timer = setInterval(tick, 2500);
    addEventListener('online', tick); document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  },
  demoteToQueue(chat, msgOrEntry, opt = {}) {
    if (!chat || !chat.sid || chat.gacha || !msgOrEntry) return false;
    if (msgOrEntry._autoContinue || msgOrEntry.metadata?.autoContinue) return false;
    const parts = Array.isArray(msgOrEntry.parts) ? msgOrEntry.parts : [];
    if (parts.length > 0 && parts.every(p => p?.type === 'data-tool-results')) return false;
    try { if (typeof Drafts !== 'undefined' && !chat._qh && typeof Drafts.hydrateQ === 'function') Drafts.hydrateQ(chat); } catch {}
    const q = (chat.queue ||= []);
    const norm = s => String(s || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    const id = msgOrEntry.id || (typeof uuid7 === 'function' ? uuid7() : ('q-' + Date.now()));
    const rawText = (parts.length ? parts.filter(p => p && p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('\n') : '') || String(msgOrEntry.text || msgOrEntry.content || '');
    const text = rawText.trim();
    const tNorm = norm(text);
    const at = msgOrEntry._sentAt || msgOrEntry.at || (typeof idTime === 'function' ? idTime(id) : 0) || (typeof now === 'function' ? now() : Date.now());
    let atts = [];
    if (Array.isArray(msgOrEntry._prev) && msgOrEntry._prev.length) {
      atts = msgOrEntry._prev.slice();
    } else if (typeof Drafts !== 'undefined') {
      const outEntry = opt?.fromDraft || (typeof Drafts.load === 'function' ? (Drafts.load()?.o || []).find(x => x && x.id === id) : null);
      if (outEntry && ((outEntry.atts && outEntry.atts.length) || (outEntry.missing && outEntry.missing.length)) && typeof Drafts.entryAtts === 'function') {
        atts = Drafts.entryAtts(outEntry);
      } else if (Array.isArray(msgOrEntry.metadata?.uploads) && msgOrEntry.metadata.uploads.length && typeof Drafts.attIn === 'function') {
        atts = msgOrEntry.metadata.uploads.map(u => Drafts.attIn(u));
      } else if (Array.isArray(msgOrEntry.atts) && msgOrEntry.atts.length) {
        atts = typeof Drafts.entryAtts === 'function' ? Drafts.entryAtts(msgOrEntry) : msgOrEntry.atts.slice();
      }
    }
    if (!text && !atts.length) return false;
    const alreadyInQ = q.some(it => it && (it.id === id || (tNorm && norm(it.text) === tNorm && Boolean(it.atts?.length) === Boolean(atts.length))));
    if (!alreadyInQ) {
      const item = { id, text, at, atts };
      const insIdx = q.findIndex(it => it && (it.at || 0) > at);
      if (insIdx >= 0) q.splice(insIdx, 0, item);
      else q.push(item);
    }
    if (Array.isArray(chat._qRemovedIds) && chat._qRemovedIds.includes(id)) {
      chat._qRemovedIds = chat._qRemovedIds.filter(x => x !== id);
    }
    chat._qPaused = '';
    chat._qHoldUntil = 0;
    if (Array.isArray(chat.messages)) {
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        const m = chat.messages[i];
        if (!m || m.role !== 'user') continue;
        const mTxt = norm((Array.isArray(m.parts) ? m.parts.filter(p => p?.type === 'text').map(p => p.text || '').join('\n') : '') || m.text || '');
        if (m === msgOrEntry || m.id === id || ((m._local || m.failed) && tNorm && mTxt === tNorm)) {
          chat.messages.splice(i, 1);
        }
      }
    }
    try { if (typeof SentUserLog !== 'undefined' && typeof SentUserLog.remove === 'function') SentUserLog.remove(chat.sid, id, text, at); } catch {}
    try {
      if (typeof Drafts !== 'undefined' && typeof Drafts.load === 'function') {
        const d = Drafts.load();
        if (Array.isArray(d?.o)) {
          const n0 = d.o.length;
          d.o = d.o.filter(x => x && x.id !== id && !(x.sid === chat.sid && tNorm && norm(x.text) === tNorm));
          if (d.o.length !== n0 && typeof Drafts.write === 'function') Drafts.write(true);
        }
        if (typeof Drafts.setQ === 'function') {
          if (typeof Drafts.qsig === 'function') chat._qsig = Drafts.qsig(chat);
          Drafts.setQ(chat);
        }
      }
    } catch {}
    if (chat.awaitId && (chat.awaitId === id || chat.awaitId === msgOrEntry?.metadata?.nodeId)) {
      chat.awaitId = null;
      chat.awaitFrom = 0;
      chat.preSend = false;
      try { clearTimeout(chat.lostT); clearTimeout(chat.startT); } catch {}
    }
    if (chat._pendingTimeoutMsg?.msg && (chat._pendingTimeoutMsg.msg === msgOrEntry || chat._pendingTimeoutMsg.msg.id === id)) {
      chat._pendingTimeoutMsg = null;
    }
    const isRunning = Boolean(opt?.running || chat.streaming || chat.live || (chat.messages?.at(-1)?.role === 'assistant' && chat.messages.at(-1)?.metadata?.pending));
    if (chat.error && (isRunning || /未发出|未收到|没有收到|可以点重试|响应超时|未接收/.test(String(chat.error)))) {
      chat.error = null;
    }
    if (chat.status === 'error') {
      chat.status = isRunning ? 'streaming' : 'idle';
      if (isRunning && !chat.phase) chat.phase = '接收回复中';
    }
    if (isRunning && !chat.sentAt) {
      chat.sentAt = Number(chat.live?._sentAt) || (typeof idTime === 'function' ? idTime(chat.live?.id || chat.messages?.at(-1)?.id) : 0) || (typeof now === 'function' ? now() : Date.now());
    }
    try { if (typeof MsgCache !== 'undefined' && typeof MsgCache.put === 'function') MsgCache.put(chat); } catch {}
    if (!opt?.silent) {
      try { chat.emit?.(); } catch {}
      try { if (typeof UI !== 'undefined') { UI.paintQ?.(); UI.syncComposer?.(chat); } } catch {}
    }
    return true;
  },
};
