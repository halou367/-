// ---------- 自动保活与协议级增量续接（查漏补缺 + 中途断链无感自动续推）----------
const KeepAlive = (() => {
  const GAP = 12e3, WIN = 10 * 60e3, MAX_WIN = 8, PAUSE = 10 * 60e3, COUNT = 3, PRE_MAX = 180e3;
  const OPEN_TOOL = /^(input-streaming|input-available)$/;
  const ASK_TOOL = /(^|[-_])(ask|question|confirm|approval|approve|choice|choose|select|form|clarif|human|user[-_]?input|request[-_]?input)/i;
  const MID_TOOL = /(^|[-_])(read|read_file|bash|shell|exec|edit|edit_file|write|write_file|search|web_search|fetch|fetch_page|grep|glob|ls|list_dir|find|cat|python|node)/i;
  const LIMITED = /429|rate.?limit|too many|限流|频繁|quota|额度|recaptcha|captcha|人机验证|unauthori|401|403/i;
  const OFFICIAL_ERR = /\bFailed query:\s*select\b|\bagentic_session_nodes\b|The AI took too long to respond|The AI service rejected this request|官方服务响应超时|官方服务拒绝请求|An error occurred while generating|Something went wrong\.?\s*Please try again|Internal server error|database error|drizzle|postgres|deadlock detected|connection terminated unexpectedly|upstream.*(?:error|timeout|reset)|model.*(?:overloaded|timed out|unavailable)|service unavailable|bad gateway|gateway timeout/i;
  const on = () => Prefs.keepAlive !== false;
  const S = c => c._ka ||= { plan: null, cancelled: new Set(), hist: [], paused: 0, reconAt: 0, recon: 0, sig: '', sigAt: now(), errSeen: 0, fakeSeen: 0, stallSeen: 0, autoContCount: 0, lastToolCount: 0, tools: new Map(), noStreamAt: 0, turnAt: 0 };
  const visible = c => !document.hidden && UI.els?.chat === c;
  const log = (c, text, lvl = '') => { try { Trace.log.push({ at: now(), sid: c.sid, text: '保活：' + text, lvl }); if (Trace.log.length > 400) Trace.log.splice(0, Trace.log.length - 400); Bus.emit('tracelog'); } catch {} };
  const secs = ms => Math.max(0, Math.round(ms / 1000)) + ' 秒';
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒'; };

  // 识别官方任务在 Read / bash 等工具调用后中途停止，或结尾未完全完成（未完成最终交付，刷新也无效，需自动发「继续」推进）
  const DELIVER_TOOL = /(?:^|[:._-])(present_file|ask_user|add_voice|generate_image|generate_speech|show_file|open_file)$/i;
  const DONE_TEXT = /(?:已完成|已修复|已解决|已更新|已发布|已实现|已经完成|全部完成|修改完成|完成更新|完成修复|完成修改|测试通过|验证通过|已生成|已打包|已同步|总结如下|如下所示|以上就是|完毕|现在[你您]可以)/;
  function isMidTurnStalled(c, msg) {
    if (!c || c.gacha || (typeof Gacha !== 'undefined' && Gacha.owns?.(c.sid))) return null;
    if (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(c)) return null;
    if (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0) return null;
    if (c.endStop || c.stopReq || c.error || c.status === 'error') return null;
    try { if (Hitl.idleWait(c) || (typeof Hitl.pending === 'function' && Hitl.pending(c).length > 0)) return null; } catch {}
    const m = msg || [...(c.messages || [])].reverse().find(x => x && !(typeof isPhantomFinishStub === 'function' && isPhantomFinishStub(x)));
    if (!m || m.role !== 'assistant' || m.metadata?.aborted || m.metadata?.openThinkStopped || m.metadata?.feedback?.interruption === 'stop') return null;
    const isTool = p => !!(p && (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool'));
    const tname = p => String(p?.toolName || String(p?.type || '').replace(/^tool-/, '') || '');
    // 过滤 step-start、data-*、error 以及空白 text（服务端常在工具步结尾追加空 text-start/text-end 占位，不能让空 text 掩盖末尾的 bash 工具块）
    const rawMeaningful = (m.parts || []).filter(p => {
      if (!p || !p.type || p.type === 'step-start' || String(p.type).startsWith('data-') || p.type === 'error') return false;
      if (p.type === 'text' && !String(p.text || '').trim()) return false;
      return true;
    });
    // 若工具块后面紧跟空闭源思考占位（text 为空的 reasoning），同样忽略该尾部空思考以暴露真实的末尾工具或正文
    let meaningful = rawMeaningful;
    while (meaningful.length > 1 && meaningful.at(-1)?.type === 'reasoning' && !String(meaningful.at(-1)?.text || '').trim() && meaningful.slice(0, -1).some(p => isTool(p) || p.type === 'text')) {
      meaningful = meaningful.slice(0, -1);
    }
    if (!meaningful.length) return null;
    // 只要本轮已调用过交付类/提问类工具（如 present_file / ask_user / generate_image），说明本轮任务已交付或等待用户操作，绝不触发自动续接
    if (meaningful.some(p => isTool(p) && (Hitl.name(p) || ASK_TOOL.test(tname(p)) || DELIVER_TOOL.test(tname(p)) || p.state === 'approval-requested'))) return null;
    const lastP = meaningful.at(-1);
    // 特征 1：完全由 bash / 工具调用结尾（无论 output-available 还是 input-available / input-streaming / output-error，后面没有任何总结正文）
    if (isTool(lastP)) {
      const tn = tname(lastP);
      if (!DELIVER_TOOL.test(tn) && !ASK_TOOL.test(tn) && !Hitl.name(lastP) && lastP.errorText !== '已停止' && lastP.state !== 'output-denied') {
        return { why: '工具中断自动续接', tool: tn || 'tool', key: 'stall-tool|' + m.id + '|' + meaningful.length };
      }
      return null;
    }
    // 特征 2：finishReason 仍为 tool-calls 却已结束本轮
    if (m.metadata?.finishReason === 'tool-calls') {
      return { why: '步骤中断自动续接', tool: 'tool-calls', key: 'stall-fr|' + m.id + '|' + meaningful.length };
    }
    // 特征 3：最后只停在思考（reasoning），思考后没有任何正文或交付输出
    if (lastP.type === 'reasoning') {
      return { why: '思考中断自动续接', tool: 'reasoning', key: 'stall-rs|' + m.id + '|' + meaningful.length };
    }
    // 特征 4：finishReason 明确为 length / max_tokens 导致输出截断
    if (m.metadata?.finishReason === 'length' || m.metadata?.finishReason === 'max_tokens') {
      return { why: '输出截断自动续接', tool: 'length', key: 'stall-len|' + m.id + '|' + meaningful.length };
    }
    // 特征 5：没有完全完成结束的结尾（代码块未闭合、过渡动作预告未执行、冒号/逗号/半截话截断）
    if (lastP.type === 'text') {
      const txt = String(lastP.text || '');
      const trimmed = txt.trim();
      if (trimmed.length > 0) {
        // 5A: Markdown 代码块未闭合（奇数个 ```）
        const fenceCount = (trimmed.match(/(?:^|\n)[ \t]*`{3,}/g) || []).length;
        if (fenceCount % 2 === 1) {
          return { why: '代码未完自动续接', tool: 'code-fence', key: 'stall-fence|' + m.id + '|' + meaningful.length };
        }
        const lines = trimmed.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const lastLine = lines.at(-1) || '';
        if (!DONE_TEXT.test(trimmed) && !DONE_TEXT.test(lastLine)) {
          // 5B: 末尾行是过渡语 / 下一步操作预告（如「接下来我将读取配置文件并修改对应的参数」「正在为您修改文件：」），无论是否收到 stop / finish
          if (lastLine.length > 0 && lastLine.length <= 140) {
            const isActionIntent =
              /^(?:好的[，,。！\s]*|明白[，,。！\s]*|收到[，,。！\s]*|好[，,。！\s]*)?(?:接下来|下面|现在|下一步|紧接着|然后|接着|我先|先来|让我|我将|我来|正在|继续|再去|先去)(?:为您|帮您|先|继续|再)?[^。！？\n]{0,60}(?:读取|查看|检查|修改|编辑|写入|创建|运行|执行|测试|验证|搜索|查找|分析|实现|修复|更新|安装|构建|编译|处理|排查|打包|同步|重启|调整|优化|定位|确认|对比|补齐|恢复)[^。！？\n]{0,35}[。.:：…]*$/.test(lastLine) ||
              /[，,。；;]\s*(?:接下来|下面|现在|下一步|紧接着|然后|让我|我将|我来|正在)(?:为您|帮您|先|继续|再)?[^。！？\n]{0,50}(?:读取|查看|检查|修改|编辑|写入|创建|运行|执行|测试|验证|搜索|查找|分析|实现|修复|更新|安装|构建|编译|处理|排查|打包|同步|重启)[^。！？\n]{0,30}[。.:：…]*$/.test(lastLine) ||
              /^(?:ok(?:ay)?[,.!\s]*|alright[,.!\s]*|sure[,.!\s]*)?(?:let me|i will|i'll|next,? i(?:'ll| will)|now,? i(?:'ll| will)|now let's|let's)\s+(?:read|check|inspect|edit|update|write|create|run|execute|test|verify|search|fix|implement|build|patch|repack|restart|continue)\b[^.!?\n]{0,80}[.:…]*$/i.test(lastLine);
            const isTrailingColon = /[:：]\s*$/.test(lastLine) && lines.length <= 8;
            if (isActionIntent || isTrailingColon) {
              return { why: '过渡中断自动续接', tool: 'transition', key: 'stall-tr|' + m.id + '|' + meaningful.length };
            }
          }
          // 5C: 结尾停在逗号/顿号/分号/破折号/未闭合括号/空列表项，或异常强制断流且末尾无句末标点
          const isMidClauseCutoff = /[，,、；;—\-(（\[{《“‘\\]\s*$/.test(trimmed);
          const isBareMarker = /(?:^|\n)[ \t]*(?:[-*+]|\d+\.|#{1,6})[ \t]*$/.test(trimmed);
          const isForcedMidSentence = Boolean(m._forcedFinish && trimmed.length >= 4 && !/[。！？.!?…`'"”’）)\]}》]\s*$/.test(trimmed));
          if (isMidClauseCutoff || isBareMarker || isForcedMidSentence) {
            return { why: '结尾未完自动续接', tool: 'cutoff', key: 'stall-cut|' + m.id + '|' + meaningful.length };
          }
        }
      }
    }
    return null;
  }

  function canAutoResendOfficialError(c) {
    if (!c || c.gacha || (typeof Gacha !== 'undefined' && Gacha.owns?.(c.sid))) return null;
    if (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(c)) return null;
    if (c.endStop || c.stopReq) return null;
    const msgs = c.messages || [];
    const tail = msgs.at(-1);
    const hasErrPart = !!(tail?.role === 'assistant' && Array.isArray(tail.parts) && tail.parts.some(p => p && p.type === 'error'));
    const errOnlyTail = !!(tail?.role === 'assistant' && ((typeof isDeadAssistantMsg === 'function' && isDeadAssistantMsg(tail)) || (Array.isArray(tail.parts) && tail.parts.length > 0 && tail.parts.every(p => p && (p.type === 'error' || p.type === 'step-start')))));
    let lastUser = (errOnlyTail || hasErrPart) ? msgs.at(-2) : (tail?.role === 'user' ? tail : null);
    const isHitlUser = u => Boolean(u && u.role === 'user' && Array.isArray(u.parts) && u.parts.some(p => p && p.type === 'data-tool-results'));
    let lastHealthyIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m) continue;
      if (isHitlUser(m)) { lastHealthyIdx = i; break; }
      if (m.role === 'assistant' && !(typeof isDeadAssistantMsg === 'function' ? isDeadAssistantMsg(m) : (Array.isArray(m.parts) && m.parts.every(p => p && (p.type === 'error' || p.type === 'step-start'))))) {
        lastHealthyIdx = i;
        break;
      }
    }
    const deadUsers = msgs.slice(lastHealthyIdx + 1).filter(m => m && m.role === 'user' && !isHitlUser(m));
    const getText = u => (u?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n').trim();
    const isContinueFiller = u => /^(?:继续|continue|go on|keep going|接着|继续执行)[。.!！?？\s]*$/i.test(getText(u)) && !(u?.metadata?.uploads?.length > 0);
    if (deadUsers.length > 1) {
      const picked = [...deadUsers].reverse().find(u => !isContinueFiller(u) && (getText(u) || u?.metadata?.uploads?.length > 0));
      if (picked) lastUser = picked;
    }
    if (!lastUser || lastUser.role !== 'user') return null;
    const hitlTurn = isHitlUser(lastUser);
    const partErr = (errOnlyTail || hasErrPart) && Array.isArray(tail?.parts) ? tail.parts.find(p => p?.type === 'error') : null;
    const errTxt = String(c.errText || c.error || partErr?.rawText || partErr?.text || '').trim();
    if (!errTxt || LIMITED.test(errTxt)) return null;
    const isOfficial = (typeof isOfficialTransientError === 'function' && isOfficialTransientError(errTxt)) || OFFICIAL_ERR.test(errTxt);
    if (!isOfficial) return null;
    const isGraphReject = /The AI service rejected this request|\bagentic_session_nodes\b|\bFailed query:\s*select\b/i.test(errTxt);
    const hasWork = Boolean(tail?.role === 'assistant' && typeof hasSubstantiveAssistantWork === 'function' && hasSubstantiveAssistantWork(tail));
    const useContinue = Boolean(hitlTurn || (!isGraphReject && (hasWork || lastUser._appendAccepted || lastUser._officialContinueParent || !lastUser._local)));
    const maxResent = deadUsers.length ? deadUsers.reduce((mx, u) => Math.max(mx, Number(u?._officialErrAutoResent) || 0), 0) : (lastUser._officialErrAutoResent || 0);
    const allowLimit = (isGraphReject && lastUser._officialContinuedOnce) ? 2 : 1;
    if (maxResent >= allowLimit) return null;
    const origText = (hitlTurn || useContinue) ? '继续' : (lastUser.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n');
    if (!origText.trim() && !(lastUser.metadata?.uploads?.length > 0)) return null;
    return { lastUser, errTail: (errOnlyTail || hasErrPart) ? tail : null, origText, errTxt, isHitl: hitlTurn, useContinue, isGraphReject, hasWork };
  }

  function lastInfo(c) {
    const m = c.messages?.at(-1); if (!m) return null;
    const parts = m.parts || []; let len = 0, toolCnt = 0;
    for (const p of parts) {
      if (typeof p.text === 'string') len += p.text.length;
      else if (typeof p.inputText === 'string') len += p.inputText.length;
      if (p?.toolCallId || String(p?.type || '').startsWith('tool-')) toolCnt++;
    }
    const lp = parts.filter(p => p.type !== 'step-start').at(-1) || {};
    const open = parts.filter(p => p.toolCallId && !Hitl.name(p) && !ASK_TOOL.test(String(p.toolName || p.type || '')) && (OPEN_TOOL.test(p.state || '') || (p.state === 'output-available' && p.output && typeof p.output === 'object' && p.output.status === 'running')));
    const ask = parts.some(p => p.toolCallId && (Hitl.awaiting(p) || p.state === 'approval-requested' || (OPEN_TOOL.test(p.state || '') && ASK_TOOL.test(String(p.toolName || p.type || '')))));
    const streaming = parts.some(p => p.type === 'text' && p.state === 'streaming');
    const reasoning = parts.some(p => p.type === 'reasoning' && p.state === 'streaming');
    const compact = parts.some(p => (p.type === 'data-compaction' && p.data?.phase === 'start' && !p.data?.summary) || (p.type === 'tool-compact' && p.state && !/^output-/.test(p.state)));
    return { m, role: m.role, toolCnt, sig: c.messages.length + ':' + parts.length + ':' + len + ':' + (lp.type || '') + ':' + (lp.state || ''), open, ask, streaming, reasoning, compact };
  }
  function toolOverdue(c, st, info, t) {
    for (const p of info.open) {
      let x = st.tools.get(p.toolCallId); if (!x) { x = t; st.tools.set(p.toolCallId, x); if (st.tools.size > 60) st.tools.delete(st.tools.keys().next().value); }
      const inp = p.input && typeof p.input === 'object' ? p.input : {}; let lim = +(inp.timeout ?? inp.timeout_ms ?? inp.timeoutMs ?? 0) || 0;
      if (lim > 0 && lim < 7200) lim *= 1000; lim = Math.min(lim || 600e3, 7200e3) + 45e3;
      if (t - x > lim && t - Math.max(st.sigAt, c.progAt || 0) > 45e3) return (p.toolName || '工具') + ' 超时同步';
    }
    return '';
  }
  function budget(c, st, pk, max, gapMs = GAP, kind = '') {
    const t = now(); st.hist = st.hist.filter(x => t - x.at < 30 * 60e3);
    const isContKind = kind === 'cont' || kind === 'resend-official';
    if (st.hist.some(x => (isContKind ? x.kind === kind : true) && t - x.at < gapMs)) return { ok: false, wait: true };
    const recent = st.hist.filter(x => (isContKind ? x.kind === kind : (x.kind !== 'cont' && x.kind !== 'resend-official')) && t - x.at < WIN);
    if (recent.length >= MAX_WIN || st.hist.filter(x => x.pk === pk).length >= max) return { ok: false, n: recent.length || st.hist.length };
    return { ok: true };
  }
  function isEval(c) {
    return Boolean(!c || c.isEvaluation || c.evalMode === 'battle' || c.evalMode === 'direct' || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(c)));
  }
  function restream(c, st, why) { if (isEval(c)) return; st.recon++; st.reconAt = now(); log(c, '重连实时通道：' + why); c.restream(); }
  function propose(c, st, kind, why, max = 2, countSec = COUNT) {
    if (isEval(c)) return false;
    const pk = kind + '|' + (c.messages?.at(-1)?.id || '') + '|' + (c.messages?.at(-1)?.parts?.length || 0);
    if (st.cancelled.has(pk)) {
      if (kind === 'fake' && c.fakeEnd) { st.fakeSeen = c.fakeEnd.at; c.fakeEnd = null; }
      if (kind === 'cont' && c.midTurnStall) { st.stallSeen = c.midTurnStall.at; c.midTurnStall = null; }
      return true;
    }
    if (st.plan || c.gacha) return false;
    const b = budget(c, st, pk, max, (kind === 'cont' || kind === 'resend-official') ? 6000 : GAP, kind);
    if (!b.ok) {
      if (b.wait) return false;
      if (kind === 'fake' && c.fakeEnd) { st.fakeSeen = c.fakeEnd.at; c.fakeEnd = null; }
      if (kind === 'cont' && c.midTurnStall) { st.stallSeen = c.midTurnStall.at; c.midTurnStall = null; }
      st.paused = now() + PAUSE; log(c, why + ' · 已自动重试多次，暂停 10 分钟', 'warn');
      return true;
    }
    const durMs = countSec * 1000;
    st.plan = { kind, why, pk, totalMs: durMs, at: now() + durMs };
    log(c, why + ' → ' + countSec + ' 秒后自动执行');
    run(c, st);
    return true;
  }
  function run(c, st) {
    const p = st.plan; if (!p) return;
    const leftMs = Math.max(0, p.at - now());
    if (leftMs > 0) {
      const pct = Math.max(5, Math.min(100, Math.round((1 - leftMs / (p.totalMs || 3000)) * 100)));
      const shortLabel = p.kind === 'cont' ? '⚡ 自动续接' : (p.kind === 'resend-official' ? '⚡ 官方报错 · 自动续推' : '增量同步');
      if (visible(c)) Pill.show(c, shortLabel, [['×', () => cancel(c)]], 'graphic', pct);
      return;
    }
    fire(c, p);
  }
  function cancel(c) { const st = S(c); if (st.plan) { st.cancelled.add(st.plan.pk); if (st.plan.kind === 'fake') c.fakeEnd = null; if (st.plan.kind === 'cont') c.midTurnStall = null; log(c, '已取消（' + st.plan.why + '）'); } st.plan = null; Pill.hide(c); }
  async function fire(c, p, manual) {
    const st = S(c); st.plan = null;
    if (!manual) st.hist.push({ at: now(), pk: p.pk, kind: p.kind });
    if (p.kind === 'resend-official') {
      Pill.hide(c);
      if (c.busy || c.endStop || (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0)) return;
      if (c.streaming && !c.busy && (c.peeking || !c.live)) {
        c.gen = (c.gen || 0) + 1;
        try { c.ctl?.abort(); } catch {}
        c.streaming = false;
        c.peeking = false;
      }
      const info = canAutoResendOfficialError(c);
      if (!info) return;
      let useCont = Boolean(info.isHitl || info.useContinue);
      if (useCont && !info.isHitl && typeof c.verifyTurnForContinue === 'function') {
        const vr = await c.verifyTurnForContinue(info.lastUser, info.origText);
        if (vr?.mode === 'already-done' || vr?.mode === 'server-busy') {
          if (info.lastUser) info.lastUser._officialErrAutoResent = (info.lastUser._officialErrAutoResent || 0) + 1;
          if (c.errAt) st.errSeen = c.errAt;
          log(c, vr.mode === 'already-done' ? '核验服务端消息：本轮已在服务端完成，已自动同步结果' : '核验服务端消息：服务端仍在继续生成，已重连实时流');
          return;
        }
        if (vr?.mode === 'resend-orig' || vr?.mode === 'rewind-resend') {
          useCont = false;
        }
      }
      const pruned = (!useCont && typeof pruneDeadTailTurns === 'function') ? pruneDeadTailTurns(c) : null;
      const lastUser = pruned?.lastUser || info.lastUser;
      const origText = pruned?.origText || info.origText;
      const errTail = info.errTail;
      lastUser._officialErrAutoResent = (lastUser._officialErrAutoResent || 0) + 1;
      if (useCont) {
        lastUser._officialContinueParent = true;
        lastUser._officialContinuedOnce = true;
        delete lastUser._streamRejected;
        if (errTail && c.messages.at(-1) === errTail) {
          const nonErr = (errTail.parts || []).filter(pt => pt && pt.type !== 'error');
          if (!nonErr.filter(pt => pt.type !== 'step-start').length) {
            if (errTail.id) (c._prunedDeadMsgIds ||= new Set()).add(errTail.id);
            c.messages.pop();
          } else {
            errTail.parts = nonErr;
            errTail.v = (errTail.v || 0) + 1;
          }
        }
      } else {
        lastUser._streamRejected = true;
        delete lastUser._officialContinueParent;
        if (!pruned && errTail && c.messages.at(-1) === errTail) {
          if (errTail.id) (c._prunedDeadMsgIds ||= new Set()).add(errTail.id);
          c.messages.pop();
        }
      }
      c.error = null;
      c.errText = '';
      c._officialTurnErrAt = 0;
      log(c, useCont
        ? '检测到官方服务报错/超时，保留当前节点进度并自动发送「继续」推进流程（第 ' + lastUser._officialErrAutoResent + ' 次）'
        : '检测到官方服务拒绝节点，已清理死节点并回退至上一正常节点自动重发原文（第 ' + lastUser._officialErrAutoResent + ' 次）');
      try {
        if (useCont) {
          await c.send('继续', { autoContinue: true, officialAutoResend: true });
        } else {
          const fallbackText = (origText && origText !== '继续') ? origText : ((lastUser.parts || []).filter(pt => pt && pt.type === 'text').map(pt => pt.text || '').join('\n') || origText);
          await c.send(fallbackText, { files: lastUser.metadata?.uploads, retryOf: lastUser, officialAutoResend: true });
        }
      } catch (e) {
      }
      return;
    }
    if (p.kind === 'cont') {
      Pill.hide(c);
      if (c.busy || c.endStop || (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0)) { c.midTurnStall = null; return; }
      if (c.streaming && !c.busy && (c.peeking || !c.live)) {
        c.gen = (c.gen || 0) + 1;
        try { c.ctl?.abort(); } catch {}
        c.streaming = false;
        c.peeking = false;
      }
      if (c.streaming && c.live) return;
      const srvBusy = await c.serverMidTurn?.().catch(() => false);
      if (srvBusy) { await (c.resumeIncremental ? c.resumeIncremental('server-active') : c.reload('server-active')); return; }
      if (!isMidTurnStalled(c)) { c.midTurnStall = null; return; }
      c.midTurnStall = null;
      st.autoContCount = (st.autoContCount || 0) + 1;
      log(c, '检测到任务中途假结束，自动发送「继续」推进任务（第 ' + st.autoContCount + ' 次）');
      try { await c.send('继续', [], null, { autoContinue: true }); } catch (e) { log(c, '自动发送继续失败：' + (e?.message || e), 'bad'); }
      return;
    }
    if (visible(c)) Pill.show(c, '增量同步', [], 'loading', 95);
    const ok = await (c.resumeIncremental ? c.resumeIncremental(p.why) : c.reload(p.why));
    if (p.kind === 'fake' && c.fakeEnd) c.fakeEnd = null;
    st.recon = 0; st.reconAt = 0; st.turnAt = 0; st.tools.clear(); st.noStreamAt = 0; st.sigAt = now();
    log(c, (ok ? '已增量同步：' : '同步失败：') + p.why, ok ? '' : 'bad');
    Pill.hide(c);
    if (!c.busy && !c.endStop && (st.autoContCount || 0) < 3) {
      const stallAfter = isMidTurnStalled(c);
      if (stallAfter) {
        const nextAt = Math.max(1, now() - 1800);
        if ((st.stallSeen || 0) >= nextAt) st.stallSeen = Math.max(0, nextAt - 1);
        c.midTurnStall = { at: nextAt, why: stallAfter.why, key: stallAfter.key };
      }
    }
  }

  function check(c) {
    if (isEval(c)) { if (c?._ka?.plan || c?._ka?.pill) { c._ka.plan = null; Pill.hide(c); } return; }
    if (typeof AutoRoute !== 'undefined' && AutoRoute.enabled() && (AutoRoute.busy || now() - AutoRoute.lastChanged < 5000)) { if (c._ka?.plan?.kind === 'conn') { c._ka.plan = null; Pill.hide(c); } return; }
    if (!c.loaded || c.loading) return;
    const st = S(c), t = now();
    if (!on()) { st.plan = null; Pill.hide(c); return; }
    if (st.plan) { run(c, st); return; }
    const info = lastInfo(c), busy = c.busy;
    if (t < st.paused && (busy || (!c.midTurnStall && !isMidTurnStalled(c) && !canAutoResendOfficialError(c)))) return;
    if (!st.inited) {
      st.inited = 1;
      if (!busy) {
        st.errSeen = c.errAt || 0;
        st.fakeSeen = c.fakeEnd?.at || 0;
        st.stallSeen = (c.midTurnStall?.at && t - c.midTurnStall.at >= 90e3) ? c.midTurnStall.at : 0;
      }
    }
    const key = info ? info.sig : '-';
    if (key !== st.sig) {
      const msgId = info?.m?.id || '';
      if (msgId && msgId !== st.lastMsgId) {
        st.lastMsgId = msgId;
        st.lastToolCount = 0;
        st.lastTextLen = 0;
      }
      if (info && (info.toolCnt > (st.lastToolCount || 0) || (info.m?.role === 'assistant' && info.len > (st.lastTextLen || 0) + 20))) {
        st.autoContCount = 0;
      }
      if (info) {
        st.lastToolCount = info.toolCnt;
        st.lastTextLen = info.len || 0;
      }
      st.sig = key; st.sigAt = t;
    }
    if (busy && !st.turnAt) st.turnAt = c.sentAt && t - c.sentAt < 600e3 ? c.sentAt : t; if (!busy) st.turnAt = 0;
    const pre = busy && !!c.sentAt && !(c.respAt >= c.sentAt) && t - c.sentAt < PRE_MAX;
    // ① 出错
    if (c.errAt && c.errAt > st.errSeen) {
      const txt = String(c.errText || c.error || '');
      if (LIMITED.test(txt)) { st.errSeen = c.errAt; log(c, '出错：限流/验证类错误，不自动刷新'); }
      else if (canAutoResendOfficialError(c)) {
        if (!busy) {
          if (propose(c, st, 'resend-official', '官方报错自动续推', 2, 1)) st.errSeen = c.errAt;
        }
        return;
      } else if (pre) { st.errSeen = c.errAt; log(c, '出错：刚发送未开始，不自动刷新'); }
      else if (!busy && !(c.sentAt && t - c.sentAt < 30 * 60e3)) { st.errSeen = c.errAt; log(c, '旧回合错误，不自动刷新'); }
      else {
        if (propose(c, st, 'error', '增量恢复', 2, 2)) st.errSeen = c.errAt;
        return;
      }
    }
    if (busy && /^实时通道错误/.test(c.error || '') && !pre && !c.streaming) return propose(c, st, 'conn', '通道重连', 2, 2);
    if (!busy) {
      if (!c.endStop && c.sentAt && t - c.sentAt < 180e3 && !(typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0)) {
        const resendInfo = canAutoResendOfficialError(c);
        if (resendInfo && propose(c, st, 'resend-official', '官方报错自动续推', 2, 1)) {
          if (c.errAt) st.errSeen = c.errAt;
          return;
        }
      }
      // ② 假结束：增量查漏补缺（不清空已有工具）
      if (c.fakeEnd && (c.endStop || (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0))) {
        c.fakeEnd = null;
      }
      if (c.fakeEnd && c.fakeEnd.at > st.fakeSeen && !c.endStop) {
        if (t - c.fakeEnd.at < 5 * 60e3) {
          if (propose(c, st, 'fake', '增量补齐', 2, 2)) st.fakeSeen = c.fakeEnd.at;
          else c.fakeEnd = null;
          return;
        }
        st.fakeSeen = c.fakeEnd.at;
        c.fakeEnd = null;
      } else if (c.fakeEnd && c.fakeEnd.at <= (st.fakeSeen || 0) && st.plan?.kind !== 'fake') {
        c.fakeEnd = null;
      }
      // ②-b 官方在 Read / bash 等工具后中途断链停止或结尾未完成交付：等待 2 秒确认未自启下一轮后，自动发送「继续」
      if (c.midTurnStall && (c.endStop || (st.autoContCount || 0) >= 3 || (typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0))) {
        c.midTurnStall = null;
      }
      if (!c.endStop && (st.autoContCount || 0) < 3 && !(typeof SendQ !== 'undefined' && SendQ.of?.(c)?.length > 0)) {
        const liveStall = isMidTurnStalled(c);
        if (!liveStall && c.midTurnStall) c.midTurnStall = null;
        const tailM = c.messages?.at(-1);
        const compRaw = tailM?.metadata?.timing?.completedAt;
        const compMs = typeof compRaw === 'number' ? compRaw : (typeof compRaw === 'string' ? Date.parse(compRaw) : 0);
        const recentEndAt = Math.max(
          c.midTurnStall?.at || 0,
          c.endAt || 0,
          tailM?._finishedAt || 0,
          Number.isFinite(compMs) ? compMs : 0
        );
        const stall = liveStall ? (c.midTurnStall || (recentEndAt && t - recentEndAt < 90e3 ? liveStall : null)) : null;
        const stallAt = c.midTurnStall?.at || recentEndAt || 0;
        if (stall && (stallAt > (st.stallSeen || 0) || (stall.key && stall.key !== st.stallKeySeen && t - stallAt < 90e3)) && t - stallAt >= 1800 && t - stallAt < 90e3) {
          if (propose(c, st, 'cont', stall.why || '自动续接', 3, 2)) {
            st.stallSeen = stallAt;
            st.stallKeySeen = stall.key || '';
          }
          return;
        }
      }
      if (st.pillKind !== 'warn') Pill.hide(c);
      return;
    }
    // ③ 进行中
    const quietFrom = Math.max(c.byteAt || 0, st.turnAt || 0, c.reloadAt || 0, c.connAt && !c.byteAt ? c.connAt : 0), quiet = t - quietFrom;
    if (pre) {
      if (!c.streaming && t - st.reconAt > 10e3) restream(c, st, '发送后实时通道未连接');
      else if (c.streaming && c.streamOpenAt && quiet > 30e3 && typeof AutoRoute !== 'undefined') void AutoRoute.silent(c);
      return;
    }
    if (c.finAt && c.finAt >= (st.turnAt || 0)) {
      if (t - c.finAt > 8000 && !st.recon) restream(c, st, '收尾重连');
      if (t - c.finAt > 15000) return propose(c, st, 'fin', '增量收尾', 2, 2);
    }
    if (!c.streaming) {
      st.noStreamAt ||= t;
      if (t - st.noStreamAt > 5000 && t - st.reconAt > 12e3) restream(c, st, '进行中重连');
      else if (t - st.noStreamAt > 14e3 && st.reconAt && t - st.reconAt > 8e3) return propose(c, st, 'noconn', '增量同步', 3, 1);
    } else {
      st.noStreamAt = 0;
      if (quiet > 22e3 && (!info || (!info.ask && !info.compact)) && t - (st.bgSyncAt || 0) > 25e3) {
        st.bgSyncAt = t;
        void c.reconcile?.(0)?.catch?.(() => {});
      }
      if (c.streamOpenAt && quiet > 35e3 && typeof AutoRoute !== 'undefined') void AutoRoute.silent(c);
    }
    if (!info) return;
    const od = toolOverdue(c, st, info, t); if (od) return propose(c, st, 'tool', od, 2, 2);
    const prog = Math.max(st.sigAt, c.progAt || 0);
    if (info.streaming && !info.reasoning && !info.open.length && !info.compact && !info.ask && t - prog > (c.streaming ? 85e3 : 45e3)) return propose(c, st, 'stream', '增量同步', 3, 1);
    if (!info.open.length && !info.compact && !info.ask && !info.reasoning && t - prog > (c.streaming ? 150e3 : 60e3)) return propose(c, st, 'idle', '增量同步', 3, 1);
    if (info.open.length && t - prog > 900e3 && !od) return propose(c, st, 'idle', '增量同步', 2, 2);
    if (visible(c) && info.compact && t - st.sigAt > 4000) Pill.show(c, '上下文压缩', [], 'graphic', 60);
    else if (st.pillKind === 'info' || (st.pillKind === 'graphic' && !st.plan)) Pill.hide(c);
  }
  function tick() {
    const t = now();
    for (const c of Chats.values()) {
      const isFg = UI.els?.chat === c;
      if (!c || (!isFg && !c.busy && !c._ka?.plan && !c._ka?.pill && !c.fakeEnd && !c.midTurnStall && !(c.errAt && t - c.errAt < 180e3) && !(c.sentAt && t - c.sentAt < 180e3) && !(c.endAt && t - c.endAt < 90e3))) continue;
      try { check(c); } catch (e) { console.warn('keepalive', e); }
    }
    Pill.sync();
  }

  // 极简图形化状态胶囊（少文字、带微缩进度条、不弹弹窗）
  const Pill = {
    el: null, cur: null,
    show(c, text, btns, kind, pct = 50) {
      const st = S(c); st.pillKind = kind; st.pill = { text, btns, kind, pct };
      this.sync();
    },
    hide(c) { const st = S(c); if (!st.pill) return; st.pill = null; st.pillKind = ''; this.sync(); },
    sync() {
      const c = UI.els?.chat, st = c ? S(c) : null, p = st?.pill, view = document.getElementById('view');
      if (!p || !view || document.hidden) { this.el?.remove(); this.el = null; this.key = ''; return; }
      const key = c.sid + '|' + p.kind + '|' + p.text + '|' + (p.pct || 0);
      if (this.el?.isConnected && this.key === key && view.contains(this.el)) return;
      this.key = key;
      const isGraphic = p.kind === 'graphic' || p.kind === 'count' || p.kind === 'loading';
      const el = isGraphic
        ? h('div', { class: 'kapill ka-graphic', 'data-kind': p.kind },
            p.kind === 'loading' ? h('i', { class: 'spin' }) : h('i', { class: 'ka-pulse' }),
            h('span', { class: 'grow' }, p.text),
            h('span', { class: 'ka-mini-bar' }, h('i', { class: 'ka-mini-fill', style: { width: (p.pct || 60) + '%' } })),
            ...p.btns.map(([l, f]) => h('button', { class: 'kabtn', title: '取消', onclick: f }, l)))
        : h('div', { class: 'kapill', 'data-kind': p.kind }, icon(p.kind === 'warn' ? 'alert' : 'info'), h('span', { class: 'grow' }, p.text), ...p.btns.map(([l, f]) => h('button', { class: 'kabtn', onclick: f }, l)));
      const comp = view.querySelector('.composer') || view.lastElementChild;
      if (this.el?.isConnected) this.el.replaceWith(el); else if (comp) comp.before(el); else view.append(el);
      this.el = el;
    },
  };

  let started = false;
  function start() {
    if (started) return; started = true;
    let w = null;
    try { w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000)'], { type: 'text/javascript' }))); w.onmessage = tick; } catch { w = null; }
    if (!w) setInterval(tick, 1000);
    const wake = () => { for (const c of Chats.values()) if (c.busy && c.loaded && !isEval(c)) { const st = S(c); if (now() - Math.max(c.byteAt || 0, c.connAt || 0) > 15e3 && now() - st.reconAt > 15e3) restream(c, st, '后台恢复'); } tick(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    addEventListener('online', wake); addEventListener('focus', () => setTimeout(tick, 50));
    let rel = null; setInterval(() => { const busy = [...Chats.values()].some(c => c.busy); if (busy && !rel) { try { navigator.locks?.request('anc-keepalive', () => new Promise(r => { rel = r; })).catch(() => {}); } catch {} } else if (!busy && rel) { rel(); rel = null; } }, 3000);
  }
  Bus.on('chat', c => { if (c === UI.els?.chat) Pill.sync(); });
  return { start, check, tick, cancel, isMidTurnStalled, canAutoResendOfficialError, state: c => S(c), Pill };
})();
