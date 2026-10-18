// A queue item stays owned by the queue until Chat.send durably hands it to the outbox.
// Failed/uncertain business POSTs are never automatically replayed by this scheduler.
const SendQ = {
  of(chat) { if (chat && !chat._qh) Drafts.hydrateQ(chat); return chat ? (chat.queue ||= []) : []; },
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
    if (chat._qBusy && chat._qBusyAt && now() - chat._qBusyAt > 12000 && !chat.busy) chat._qBusy = false;
    if (chat.busy || chat.stopReq || chat.preSend || chat._qBusy) return '上一条仍在处理';
    if (chat.gacha || chat.fpLocked || Fingerprint.isRunning(chat)) return '等待抽卡或指纹任务结束';
    if (Hitl.pending(chat).length && !(manual && SendQ.skippable(chat))) return SendQ.skippable(chat) ? '等待选择（可点「立即发送」跳过选择直接发）' : '等待交互问题的回答';
    if ((chat.messages || []).some(m => m.deliveryUnknown && m._local)) return '上条消息送达状态未确认，请先刷新对话核对，勿重复发送';
    if (Drafts.load().o.some(o => o.sid === chat.sid && !chat._oOk?.has(o.id) && !(chat.messages || []).some(m => m.id === o.id && m.failed && !m.deliveryUnknown))) return '上一条输入尚未确认，请先刷新核对或重试失败消息';
    if (!manual && (chat._qHold || 0) > now()) return chat._qHoldWhy || '正在核对服务器状态';
    if (manual && chat._routePaused) chat._routePaused = false;
    if (!manual && chat._routePaused) return '检测到模型路由已暂停，点「立即发送」继续';
    if (!manual && (chat._qPaused || chat.error || chat.status === 'error')) return chat._qPaused || '上一轮出错，队列已暂停';
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
      if ((chat?.queue || []).length && !this.blocked(chat, true) && !chat._qPaused && !chat.error && chat.status !== 'error' && !chat.fakeEnd && !chat._ka?.plan && !chat.midTurnStall) {
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
    const localLast = (chat?.messages || []).filter(m => !m?._held).at(-1);
    const localDone = !!localLast && localLast.role === 'assistant' && !localLast.metadata?.pending && !chat.busy && !chat.live;
    const doneAt = Math.max(chat?.endAt || 0, chat?.tcAt || 0, chat?.finAt || 0, localLast?._finishedAt || 0);
    if (localDone && (manual || (doneAt && now() - doneAt >= 1500))) {
      if (chat.tcAt && now() - chat.tcAt < 1800) await sleep(Math.max(0, 1800 - (now() - chat.tcAt)));
      return '';
    }
    let j; try { j = await api('/api/chat/' + chat.sid, { timeout: 10000 }); } catch { return localDone ? '' : '暂时无法核对服务器状态，稍后重试'; }
    if (!Array.isArray(j?.messages)) return localDone ? '' : '暂时无法核对服务器状态，稍后重试';
    const last = j.messages.at(-1);
    if (last && (last.role === 'user' || last.metadata?.pending) && !(last.role === 'assistant' && Hitl.idleWait(chat))) {
      if (!localDone) return '服务器还在处理上一轮';
    }
    const pk = await chat.peekTurn(chat.lastSeq, null, 2000, { settleCheck: true });
    if (pk?.busy) return '服务器还在处理上一轮';
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
    if (!q.length) chat._qPaused = '';
    try { Drafts.setQ(chat, true); } catch {}
    const curDraft = (typeof Drafts !== 'undefined' && Drafts.get?.(chat.sid)) || '';
    const nextDraft = curDraft && item.text ? (curDraft + '\n' + item.text) : (item.text || curDraft);
    try { Drafts.set?.(chat.sid, nextDraft); } catch {}
    if (Array.isArray(item.atts) && item.atts.length) {
      if (typeof UI !== 'undefined' && UI.atts && typeof Tabs !== 'undefined') {
        const tab = (Tabs.list || []).find(t => t.sid === chat.sid) || Tabs.cur;
        if (tab) {
          const list = UI.atts.get(tab.key) || [];
          UI.atts.set(tab.key, list);
          for (const a of item.atts) if (!list.includes(a)) list.push(a);
          try { UI.paintAtt?.(); } catch {}
        }
      } else if (typeof Att !== 'undefined') {
        const list = Att.of(chat);
        for (const a of item.atts) if (!list.includes(a)) list.push(a);
      }
    }
    const ta = typeof document !== 'undefined' ? document.querySelector('#inp') : null;
    if (ta && typeof UI !== 'undefined' && UI.els?.chat === chat) {
      ta.value = nextDraft;
      ta.style.height = 'auto';
      ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
      try { ta.focus(); } catch {}
    }
    chat.emit();
    try { toast('已撤回至输入框'); } catch {}
    return true;
  },
  remove(chat, item) { const q = this.of(chat), i = q.indexOf(item); if (i >= 0) q.splice(i, 1); if (!q.length) chat._qPaused = ''; chat.emit(); },
  clear(chat) { this.of(chat).splice(0); chat._qPaused = ''; clearTimeout(chat._qT); chat._qT = 0; chat.emit(); },
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
          const q = this.of(chat); for (const item of batch) { const i = q.indexOf(item); if (i >= 0) q.splice(i, 1); }
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
      if (this.ready(chat)) this.check(chat);
    }
  },
  start() {
    if (this.started) return; this.started = true;
    const tick = () => {
      if (!UI.authed || !UI.me || (navigator.onLine === false && !(typeof NetHealth !== 'undefined' && NetHealth.recent()))) return;
      for (const c of Chats.values()) if (this.of(c).length) this.check(c);
      // Restore unopened queued chats as well, with bounded loading and failure backoff.
      const pending = Object.entries(Drafts.load().q).filter(([, q]) => q?.items?.length && !q.paused);
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
};
