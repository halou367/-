const Sync = {
  start() {
    if (this.t) return;
    this.t = setInterval(() => { this.tick(); }, 8000);
    this.ct = setInterval(() => { const c = typeof Tabs !== 'undefined' && Tabs.cur?.sid ? Chats.get(Tabs.cur.sid) : null; if (c) c.tickConverge(); }, 3000);
    let lastWakeAt = 0;
    const onWake = () => {
      if (document.hidden) return;
      const t = now(), sinceWake = t - lastWakeAt;
      lastWakeAt = t;
      const c = typeof Tabs !== 'undefined' && Tabs.cur?.sid ? Chats.get(Tabs.cur.sid) : null;
      const streamHealthy = Boolean(c && c.watching && !c.wFails);
      if (!streamHealthy || sinceWake > 30000) this.kick();
      try { if (typeof History !== 'undefined' && typeof History.auto === 'function') History.auto('front'); } catch {}
      if (c && c.loaded && (!streamHealthy || sinceWake > 30000)) { c.convAt = 1; c.quickSync?.(false); }
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    Bus.on('chat', c => { if (c.loaded && !c.watching && !c.gacha && this.want().has(c.sid)) this.tick(); });
    setTimeout(() => this.tick(), 1500);
  },
  want() {
    const out = new Set(); if (typeof Tabs === 'undefined') return out;
    const max = isMob() ? 2 : 4, cur = Tabs.cur;
    if (cur?.sid) out.add(cur.sid);
    for (const t of Tabs.list) { if (out.size >= max) break; if (t.sid && !t.kind && Chats.get(t.sid)?.loaded) out.add(t.sid); }
    return out;
  },
  tick() {
    const w = this.want();
    for (const c of Chats.values()) {
      if (c.isEvaluation || (typeof EvalEngine !== 'undefined' && EvalEngine.isEvalChat?.(c))) { if (c.watching) c.unwatch(); continue; }
      if (w.has(c.sid) && c.loaded && !c.gacha) c.watch(); else if (c.watching) c.unwatch();
    }
  },
  // 回到前台：长轮询多半已经断了 → 立刻重挂（从上次的位置往后读，期间别的设备做的事马上补上）
  kick() { for (const c of Chats.values()) if (c.watching) { c.unwatch(); } this.tick(); },
};

// ---------- 附件上传（照官方流程）：sha256 → generate-agent-upload-url → PUT 到 R2 → 消息 metadata.uploads ----------
const Uploads = {
  MIME: { txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', js: 'text/javascript', ts: 'text/plain', py: 'text/x-python', html: 'text/html', css: 'text/css', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4' },
  type(f) { return f.type || this.MIME[(/\.([\w]+)$/.exec(f.name || '')?.[1] || '').toLowerCase()] || 'application/octet-stream'; },
  async hash(buf) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); let s = ''; for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  findUrl(j) { if (!j || typeof j !== 'object') return null; for (const k of ['url', 'uploadUrl', 'signedUrl', 'presignedUrl', 'putUrl']) if (typeof j[k] === 'string' && /^https?:/.test(j[k])) return j[k]; for (const v of Object.values(j)) { if (typeof v === 'string' && /^https:\/\//.test(v)) return v; if (v && typeof v === 'object') { const u = this.findUrl(v); if (u) return u; } } return null; },
  // 和官方网页一致：sha256 → generate-agent-upload-url → 直接把文件（Blob，不再复制成 ArrayBuffer）PUT 到 R2；
  // 两步都自动重试 3 次（1s / 2s / 4s 退避，4xx 不重试）；上传用 XHR，能拿到实时进度
  // 返回 { key, filename, mediaType, size, hash, url }（url = 同源预览地址 /api/chat/workspace/cas/user/<hash>）
  webPath(hash) { return '/api/chat/workspace/cas/user/' + hash; },
  hashOfKey(key) { const m = /^cas\/users\/[^/]+\/([A-Za-z0-9_-]{43})$/.exec(String(key || '')); return m ? m[1] : null; },
  async retry(fn, tries = 4) {
    for (let i = 0; ; i++) {
      try { return await fn(i); }
      catch (e) { if (i >= tries - 1 || (e?.status >= 400 && e?.status < 500)) throw e; await sleep(1000 * 2 ** i); }
    }
  },
  put(url, file, mediaType, headers, onProg) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest(); x.open('PUT', url, true);
      x.setRequestHeader('Content-Type', mediaType);
      for (const [k, v] of Object.entries(headers || {})) if (!/^content-type$/i.test(k)) try { x.setRequestHeader(k, v); } catch {}
      x.upload.onprogress = e => { if (e.lengthComputable) onProg?.(e.loaded / e.total); };
      x.onload = () => x.status >= 200 && x.status < 300 ? res() : rej(new HttpError(x.status, '附件上传失败：' + String(x.responseText || '').slice(0, 200)));
      x.onerror = () => rej(new Error('附件上传失败：网络错误'));
      x.ontimeout = () => rej(new Error('附件上传超时'));
      x.timeout = Math.max(60000, file.size / 50);   // 至少 60 秒，大文件按 50KB/s 估
      x.send(file);
    });
  },
  async upload(file, onStage, onProg) {
    const mediaType = this.type(file);
    onStage?.('校验');
    const hash = await this.hash(await file.arrayBuffer());
    onStage?.('申请');
    const j = await this.retry(() => api('/api/storage/generate-agent-upload-url', { json: { hash, contentType: mediaType, size: file.size }, timeout: 20000 }));
    const uid = UI.me?.id || '';
    let key = (j && (j.key || j.objectKey || j.storageKey || j.data?.key)) || null;
    const url = this.findUrl(j);
    if (!key && url) { try { key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, '')); if (!/^cas\//.test(key)) key = null; } catch {} }
    if (!key) key = 'cas/users/' + uid + '/' + hash;
    key = String(key).replace(/^\/+/, '');
    if (url && !(j?.exists || j?.alreadyExists || j?.uploaded)) {
      onStage?.('上传'); onProg?.(0);
      await this.retry(() => this.put(url, file, mediaType, j?.headers && typeof j.headers === 'object' ? j.headers : null, onProg));
    }
    onProg?.(1);
    return { key, filename: file.name || 'file', mediaType, size: file.size, hash, url: this.webPath(hash) };
  },
  meta(files, node) { return files?.length ? { manifestNodeId: node || null, uploads: files.map(f => ({ key: f.key, filename: f.filename, mediaType: f.mediaType })) } : null; },
};

// ---------- 新建对话 ----------
// Brana 对「重复指令」的限流：HTTP 429 + {"error":"prompt failed"}。网页收到后不是等一分钟，而是弹 reCAPTCHA v2 人机验证，带着验证令牌原样重发（同一条消息 id）。
// 这不是新对话额度用完，所以不能记成 Quota 限流（以前记了 60 秒，客户端就一直显示「1 分钟后再试」）。
function promptFailed(status, body) {
  if (status !== 429) return false;
  let m = body; try { const j = JSON.parse(body); m = j?.error ?? body; } catch {}
  return typeof m === 'string' && /^\s*prompt failed\s*$/i.test(m);
}
function isOfficialTransientError(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/429|rate.?limit|too many|限流|频繁|quota|额度|recaptcha|captcha|人机验证|prompt failed|unauthori|401|403/i.test(s)) return false;
  return /\bFailed query:\s*select\b|\bagentic_session_nodes\b|The AI took too long to respond|The AI service rejected this request|An error occurred while generating|Something went wrong\.?\s*Please try again|Internal server error|database error|drizzle|postgres|deadlock detected|connection terminated unexpectedly|upstream.*(?:error|timeout|reset)|model.*(?:overloaded|timed out|unavailable)|service unavailable|bad gateway|gateway timeout/i.test(s);
}
function formatOfficialErrorText(raw) {
  const s = String(raw || '').trim();
  if (!s) return '未知错误';
  if (/\bFailed query:\s*select\b|\bagentic_session_nodes\b/i.test(s)) {
    return '官方服务响应超时（The AI took too long to respond. Please try again.）';
  }
  if (/^The AI took too long to respond\.?(?:\s*Please try again\.?)?$/i.test(s)) {
    return '官方服务响应超时（The AI took too long to respond. Please try again.）';
  }
  if (/The AI service rejected this request/i.test(s)) {
    return '官方服务拒绝请求：存在空回复死节点或上下文超限，已自动回退至上一正常节点重发（The AI service rejected this request.）';
  }
  return s;
}
function isOpenCandidateName(s) {
  const id = String(s || '').toLowerCase();
  if (!id) return false;
  const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
  if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return true;
  return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(id);
}
function hasInterruptedToolPart(m) {
  return Boolean(m && m.role === 'assistant' && Array.isArray(m.parts) && m.parts.some(p => p && p.toolCallId && (p._interruptedPending || p.errorText === '未返回结果' || /^(input-streaming|input-available|approval-requested)$/.test(p.state || ''))));
}
function isIncompleteAssistantMsg(m) {
  if (!m || m.role !== 'assistant') return false;
  if (m._userStopped || m.metadata?.aborted || m.metadata?.openThinkStopped || m.metadata?.feedback?.interruption === 'stop' || m.metadata?.error) return false;
  if (m.metadata?.pending || m._incomplete || m.status === 'pending' || m.status === 'streaming') return true;
  if (hasInterruptedToolPart(m)) return true;
  const parts = Array.isArray(m.parts) ? m.parts : [];
  let text = '';
  let hasReasonOrStep = false;
  let hasTool = false;
  for (const p of parts) {
    if (!p) continue;
    if (p.type === 'text' && typeof p.text === 'string') text += p.text;
    else if (p.type === 'reasoning' || p.type === 'step-start') hasReasonOrStep = true;
    else if (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') {
      hasTool = true;
      if (p.state === 'output-available' && p.output && typeof p.output === 'object' && p.output.status === 'running') return true;
    }
  }
  if (!text && typeof m.content === 'string') text = m.content;
  const trimmed = text.trim();
  if (!trimmed && hasReasonOrStep && !hasTool) return true;
  if (trimmed) {
    if (trimmed.endsWith('…[cached]')) return true;
    const lineFences = (trimmed.match(/(?:^|\n)[ \t]*`{3,}/g) || []).length;
    if (lineFences % 2 === 1) return true;
  }
  return false;
}
function isPhantomFinishStub(m) {
  if (!m || m.role !== 'assistant') return false;
  if (m.metadata?.pending || m.metadata?.aborted || m.metadata?.openThinkStopped || m.metadata?.error || m.metadata?.feedback?.interruption === 'stop') return false;
  const parts = Array.isArray(m.parts) ? m.parts : [];
  return !parts.some(p => p && p.type !== 'step-start' && !String(p.type || '').startsWith('data-') && ((p.type !== 'reasoning' && p.type !== 'text') || String(p.text || '').trim().length > 0));
}
function hasSubstantiveAssistantWork(m) {
  if (!m || m.role !== 'assistant') return false;
  const parts = Array.isArray(m.parts) ? m.parts : [];
  if (parts.some(p => p && p.type === 'text' && String(p.text || '').trim().length > 0)) return true;
  if (parts.some(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && p.state === 'output-available' && p.output?.status !== 'aborted' && p.output?.status !== 'error')) return true;
  if (m.metadata?.pending && parts.some(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool') && /^(input-streaming|input-available|approval-requested)$/.test(p.state || ''))) return true;
  return false;
}
function isDeadAssistantMsg(m) {
  if (!m || m.role !== 'assistant') return false;
  if (hasSubstantiveAssistantWork(m)) return false;
  if (m.metadata?.openThinkStopped || m.metadata?.aborted || m.metadata?.feedback?.interruption === 'stop' || m.metadata?.error) return true;
  if (m._routePivotRole === 'next' && m._turnModelLabel && isOpenCandidateName(m._turnModelLabel)) return true;
  if ((m.metadata?.pending || m._incomplete) && (!m._finishedAt || m._forcedFinish)) return false;
  const parts = Array.isArray(m.parts) ? m.parts : [];
  if (!parts.length) return true;
  if (parts.some(p => p?.type === 'error')) return true;
  const hasText = parts.some(p => p && p.type === 'text' && String(p.text || '').trim().length > 0);
  const toolParts = parts.filter(p => p && (p.toolCallId || String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool'));
  if (!hasText && toolParts.length > 0 && !m.metadata?.pending && !m._incomplete && !m._forcedFinish && toolParts.every(p => p.state === 'output-error' || p.output?.status === 'aborted')) return true;
  return !parts.some(p => p && (
    (p.type === 'text' && String(p.text || '').trim().length > 0) ||
    (p.type === 'reasoning' && String(p.text || '').trim().length > 0) ||
    p.toolCallId ||
    String(p.type || '').startsWith('tool-') ||
    p.type === 'dynamic-tool' ||
    p.type === 'file' ||
    String(p.type || '').startsWith('source-')
  ));
}
function isHitlToolResultUserMsg(u) {
  return Boolean(u && u.role === 'user' && Array.isArray(u.parts) && u.parts.some(p => p && p.type === 'data-tool-results'));
}
async function ensureHealthyHistoryLoaded(chat, maxPages = 1) {
  if (!chat || typeof chat.loadOlder !== 'function') return;
  if (Array.isArray(chat.messages) && chat.messages.some(m => m && m.role === 'user' && !m.failed)) return;
  for (let page = 0; page < maxPages; page++) {
    if (!chat.hasMore || !chat.cursor) break;
    if (findHealthyLastUser(chat.messages, null, chat._rejectedHealthyNodeIds)) break;
    const prevCursor = chat.cursor;
    await chat.loadOlder(true).catch(() => {});
    if (chat.cursor === prevCursor) break;
  }
}
function findFirstHealthyUser(msgs) {
  if (!Array.isArray(msgs) || !msgs.length) return null;
  for (let i = 0; i < msgs.length; i++) {
    const u = msgs[i];
    if (!u || u.role !== 'user' || u.failed || u._streamRejected) continue;
    for (let j = i + 1; j < msgs.length; j++) {
      const m = msgs[j];
      if (!m) continue;
      if (m.role === 'user') break;
      if (m.role === 'assistant' && !isDeadAssistantMsg(m)) return u;
    }
  }
  return null;
}
function findHealthyLastUser(msgs, excludeMsg = null, rejectedSet = null) {
  if (!Array.isArray(msgs) || !msgs.length) return null;
  let end = excludeMsg ? msgs.indexOf(excludeMsg) : -1;
  if (end < 0) end = msgs.length;
  let fallbackUser = null;
  let sawDeadTail = false;
  for (let i = end - 1; i >= 0; i--) {
    const u = msgs[i];
    const uKey = u ? String(u.metadata?.nodeId || u.id || '') : '';
    const isRejectedNode = !!(rejectedSet && typeof rejectedSet.has === 'function' && uKey && (rejectedSet.has(uKey) || rejectedSet.has(String(u.id || ''))));
    if (!u || u === excludeMsg || u.role !== 'user' || u.failed || (u._streamRejected && !isHitlToolResultUserMsg(u)) || isRejectedNode) {
      if (u && u !== excludeMsg && (u.failed || (u._streamRejected && !isHitlToolResultUserMsg(u)) || isRejectedNode || (u.role === 'assistant' && isDeadAssistantMsg(u)))) sawDeadTail = true;
      continue;
    }
    if (isHitlToolResultUserMsg(u) || (u._officialContinueParent && !u._streamRejected && !isRejectedNode)) return u;
    let hasAssistant = false, hasHealthyAssistant = false;
    for (let j = i + 1; j < end; j++) {
      const m = msgs[j];
      if (!m) continue;
      if (m.role === 'user') break;
      if (m.role === 'assistant') {
        hasAssistant = true;
        if (!isDeadAssistantMsg(m)) { hasHealthyAssistant = true; break; }
      }
    }
    if (hasHealthyAssistant) return u;
    if (hasAssistant && !hasHealthyAssistant) {
      sawDeadTail = true;
      if (!fallbackUser) fallbackUser = u;
      continue;
    }
    if (!hasAssistant && !sawDeadTail && !fallbackUser && i === end - 1) {
      fallbackUser = u;
    } else {
      sawDeadTail = true;
      if (!fallbackUser) fallbackUser = u;
    }
  }
  return fallbackUser;
}
function rebuildChatFmtFromMessages(chat) {
  if (!chat) return;
  const prev = chat.fmt;
  const nf = typeof Fmt !== 'undefined' && Fmt.fresh ? Fmt.fresh() : { ids: [], toolIds: [], rBlocks: 0, rChars: 0, rHead: '', tBlocks: 0, tChars: 0, head: '' };
  const msgs = Array.isArray(chat.messages) ? chat.messages : [];
  const healthyAsst = msgs.filter(m => m && m.role === 'assistant' && !isDeadAssistantMsg(m));
  const msgHasVis = m => (m?.parts || []).some(p => p?.type === 'reasoning' && (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.visible ? ThinkingStatus.visible(p) : /[^\s.…·。]/.test(String(p.text || ''))));
  const firstIsClosed = healthyAsst.length > 0 && !msgHasVis(healthyAsst[0]) && (healthyAsst[0].parts || []).some(p => p?.type === 'reasoning' || /^(?:toolu_|srvtoolu_|call_)/i.test(String(p?.toolCallId || '')));
  for (const m of healthyAsst) {
    if (firstIsClosed && msgHasVis(m)) break;
    const mf = m._fmt || m.fmt;
    if (mf && typeof mf === 'object') {
      for (const x of mf.ids || []) if (Array.isArray(x) && nf.ids.length < 32 && !nf.ids.some(y => y[0] === x[0] && y[1] === String(x[1]))) nf.ids.push([x[0], String(x[1])]);
      for (const id of mf.toolIds || []) if (id && nf.toolIds.length < 32 && !nf.toolIds.includes(String(id))) nf.toolIds.push(String(id));
      nf.tN = (nf.tN || 0) + Number(mf.tN || 0);
      nf.rN = (nf.rN || 0) + Number(mf.rN || 0);
      nf.tidCount = (nf.tidCount || 0) + Number(mf.tidCount || 0);
      nf.tidChars = (nf.tidChars || 0) + Number(mf.tidChars || 0);
      nf.rE = (nf.rE || 0) + Number(mf.rE || 0);
      nf.rWireDeltas = (nf.rWireDeltas || 0) + Number(mf.rWireDeltas || 0);
      nf.rWireEmptyDeltas = (nf.rWireEmptyDeltas || 0) + Number(mf.rWireEmptyDeltas || 0);
      nf.tools = (nf.tools || 0) + Number(mf.tools || 0);
      if (mf.t0 && mf.tEnd && mf.tEnd >= mf.t0 && (mf.tEnd - mf.t0) < 3600000) {
        nf.t0 = mf.t0;
        nf.tFirst = mf.tFirst || mf.t0;
        nf.tEnd = mf.tEnd;
      }
      if (mf.done) nf.done = true;
    }
    for (const p of m.parts || []) {
      if (!p) continue;
      if (p.toolCallId && nf.toolIds.length < 32 && !nf.toolIds.includes(String(p.toolCallId))) nf.toolIds.push(String(p.toolCallId));
      if (p.type === 'reasoning') {
        nf.rBlocks = (nf.rBlocks || 0) + 1;
        if (p.id && nf.ids.length < 32 && !nf.ids.some(y => y[0] === 'r' && y[1] === String(p.id))) nf.ids.push(['r', String(p.id)]);
        const vis = typeof ThinkingStatus !== 'undefined' && ThinkingStatus.visible ? ThinkingStatus.visible(p) : Boolean(String(p.text || '').trim());
        if (vis) {
          const rt = String(p.text || '');
          nf.rChars = (nf.rChars || 0) + rt.length;
          if ((nf.rHead || '').length < 400) nf.rHead = (nf.rHead || '') + rt.slice(0, 400 - (nf.rHead || '').length);
        }
      } else if (p.type === 'text') {
        nf.tBlocks = (nf.tBlocks || 0) + 1;
        if (p.id && nf.ids.length < 32 && !nf.ids.some(y => y[0] === 't' && y[1] === String(p.id))) nf.ids.push(['t', String(p.id)]);
        const tt = String(p.text || '');
        nf.tChars = (nf.tChars || 0) + tt.length;
        if ((nf.head || '').length < 400) nf.head = (nf.head || '') + tt.slice(0, 400 - (nf.head || '').length);
      }
    }
  }
  if (prev && typeof prev === 'object' && !(prev.rChars > 0 && nf.rChars === 0)) {
    for (const x of prev.ids || []) if (Array.isArray(x) && nf.ids.length < 32 && !nf.ids.some(y => y[0] === x[0] && y[1] === String(x[1]))) nf.ids.push([x[0], String(x[1])]);
    for (const id of prev.toolIds || []) if (id && nf.toolIds.length < 32 && !nf.toolIds.includes(String(id))) nf.toolIds.push(String(id));
    for (const k of ['tN', 'rN', 'tidCount', 'tidChars', 'rE', 'rWireDeltas', 'rWireEmptyDeltas', 'tools']) {
      if ((prev[k] || 0) > (nf[k] || 0)) nf[k] = prev[k];
    }
    if (!nf.t0 && !nf.tEnd && prev.t0 && prev.tEnd && prev.tEnd >= prev.t0 && (prev.tEnd - prev.t0) < 3600000) {
      nf.t0 = prev.t0;
      nf.tFirst = prev.tFirst || prev.t0;
      nf.tEnd = prev.tEnd;
    }
    if (nf.t0 && nf.tEnd && (nf.tEnd < nf.t0 || (nf.tEnd - nf.t0) >= 3600000)) {
      nf.t0 = 0;
      nf.tFirst = 0;
      nf.tEnd = 0;
    }
    if (prev.done) nf.done = true;
  }
  chat.fmt = nf;
}
function healChatModelAndBranch(chat, opt = {}) {
  if (!chat?.sid) return null;
  let pruned = null;
  if (opt.pruneTail) {
    pruned = pruneDeadTailTurns(chat);
  }
  chat.thinkStopped = false;
  chat.routedThink = false;
  chat._routePaused = false;
  rebuildChatFmtFromMessages(chat);
  const tsKind = typeof ThinkingStatus !== 'undefined' ? ThinkingStatus.of?.(chat)?.kind : null;
  const curM = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
  const curName = String(curM?.name || curM?.reverseLabel || '').trim();
  const isPollutedOpen = curM && (curName === '开源模型' || curM.fam === 'compat' || isOpenCandidateName(curName) || isOpenCandidateName(curM.reverseCandidateId)) && tsKind !== 'compat-thinking';
  const preRouteClosed = String(curM?.routeFrom || chat._routeBaseline?.label || '').trim();
  const hasClosedEvidence = tsKind === 'closed-thinking' || (chat.fmt?.toolIds || []).some(id => /^(?:toolu_|srvtoolu_|call_)/i.test(String(id || ''))) || (preRouteClosed && !isOpenCandidateName(preRouteClosed));
  if (isPollutedOpen && (hasClosedEvidence || opt.pruneTail)) {
    if (preRouteClosed && !isOpenCandidateName(preRouteClosed)) {
      const restored = {
        ...curM,
        name: preRouteClosed,
        candidateName: preRouteClosed,
        reverseLabel: preRouteClosed,
        routed: false,
        sure: true,
        guess: false,
      };
      delete restored.routeType;
      delete restored.routeFrom;
      delete restored.routeTo;
      delete restored.lastRouteNotice;
      delete restored.routeNotices;
      Models.set(chat.sid, restored);
      try { Bus.emit('model', chat, restored); } catch {}
    } else {
      try {
        if (typeof Models.del === 'function') Models.del(chat.sid);
        else { delete Models.map?.[chat.sid]; Models.save?.(); }
      } catch {}
      try { chat.guessModel?.(); } catch {}
    }
    try {
      if (typeof BillingProbe !== 'undefined') {
        if (typeof BillingProbe.invalidateAndRefresh === 'function') void BillingProbe.invalidateAndRefresh(chat);
        else if (typeof BillingProbe.schedule === 'function') BillingProbe.schedule(chat, 10);
      }
    } catch {}
  } else if (opt.pruneTail && typeof BillingProbe !== 'undefined') {
    try {
      if (typeof BillingProbe.invalidateAndRefresh === 'function') void BillingProbe.invalidateAndRefresh(chat);
      else if (typeof BillingProbe.schedule === 'function') BillingProbe.schedule(chat, 10);
    } catch {}
  }
  try { chat.emit?.(); } catch {}
  return pruned;
}
function pruneDeadTailTurns(chat) {
  const msgs = chat?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return null;
  if (msgs.some(m => m?.metadata?.openThinkStopped || (m?.role === 'assistant' && (m?.parts || []).some(p => p?.type === 'reasoning' && /[^\s.…·。]/.test(String(p.text || '')))))) {
    chat._hadOpenThinkStop = true;
    chat._allowOpenThink = true;
  }
  const rej = chat?._rejectedHealthyNodeIds;
  const healthyU = findHealthyLastUser(msgs, null, rej);
  let lastHealthyIdx = -1;
  if (healthyU) {
    const uIdx = msgs.indexOf(healthyU);
    if (uIdx >= 0) {
      lastHealthyIdx = uIdx;
      for (let j = uIdx + 1; j < msgs.length; j++) {
        const m = msgs[j];
        if (!m) continue;
        if (m.role === 'user') break;
        if (m.role === 'assistant' && !isDeadAssistantMsg(m)) lastHealthyIdx = j;
      }
    }
  }
  for (let k = msgs.length - 1; k > lastHealthyIdx; k--) {
    const mk = msgs[k];
    if (isHitlToolResultUserMsg(mk) || (mk?.role === 'user' && mk._officialContinueParent && !mk._streamRejected && !rej?.has?.(String(mk.metadata?.nodeId || mk.id || '')))) { lastHealthyIdx = k; break; }
  }
  const tailSlice = msgs.slice(lastHealthyIdx + 1);
  if (!tailSlice.length) return null;
  const hasDeadEvidence = tailSlice.some(m => m && (
    (m.role === 'assistant' && isDeadAssistantMsg(m)) ||
    (m.role === 'user' && (m.failed || (m._streamRejected && !isHitlToolResultUserMsg(m)) || m.metadata?.error || (rej?.has?.(String(m.metadata?.nodeId || m.id || '')))))
  )) || tailSlice.filter(m => m && m.role === 'user').length > 1;
  if (!hasDeadEvidence) return null;
  const deadUsers = tailSlice.filter(m => m && m.role === 'user' && !isHitlToolResultUserMsg(m));
  if (!deadUsers.length) {
    const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
    msgs.splice(lastHealthyIdx + 1);
    return { lastUser: null, origText: '', prunedCount: tailSlice.length };
  }
  const getText = u => (u?.parts || []).filter(p => p && p.type === 'text').map(p => p.text || '').join('\n').trim() || String(u?.text || '').trim();
  const isContinueFiller = u => /^(?:继续|continue|go on|keep going|接着|继续执行)[。.!！?？\s]*$/i.test(getText(u)) && !(u?.metadata?.uploads?.length > 0);
  const pickedUser = [...deadUsers].reverse().find(u => !isContinueFiller(u) && (getText(u) || u?.metadata?.uploads?.length > 0)) || deadUsers.at(-1);
  const maxResent = deadUsers.reduce((mx, u) => Math.max(mx, Number(u?._officialErrAutoResent) || 0), 0);
  pickedUser._officialErrAutoResent = maxResent;
  pickedUser._streamRejected = true;
  const prunedSet = (chat._prunedDeadMsgIds ||= new Set());
  for (const m of tailSlice) if (m?.id) prunedSet.add(m.id);
  msgs.splice(lastHealthyIdx + 1);
  return {
    lastUser: pickedUser,
    origText: getText(pickedUser),
    prunedCount: tailSlice.length,
  };
}
try {
  if (typeof window !== 'undefined') {
    window.isOfficialTransientError = isOfficialTransientError;
    window.formatOfficialErrorText = formatOfficialErrorText;
    window.isOpenCandidateName = isOpenCandidateName;
    window.isDeadAssistantMsg = isDeadAssistantMsg;
    window.isPhantomFinishStub = isPhantomFinishStub;
    window.hasInterruptedToolPart = hasInterruptedToolPart;
    window.ensureHealthyHistoryLoaded = ensureHealthyHistoryLoaded;
    window.findFirstHealthyUser = findFirstHealthyUser;
    window.findHealthyLastUser = findHealthyLastUser;
    window.pruneDeadTailTurns = pruneDeadTailTurns;
    window.healChatModelAndBranch = healChatModelAndBranch;
  }
} catch {}
function packClientInteraction(textLen = 8, kind = 'enter') {
  try {
    const vid = typeof getOrCreateVisitId === 'function' ? getOrCreateVisitId() : (typeof VISIT === 'string' && VISIT ? VISIT : 'local');
    const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x1000193) >>> 0; } return (h ^ (h >>> 16)) & 65535; };
    const salt = (typeof ProtocolSchema !== 'undefined' && Number.isFinite(ProtocolSchema.current?.cxSalt) && ProtocolSchema.current.cxSalt > 0)
      ? (ProtocolSchema.current.cxSalt & 65535)
      : 48664;
    const rawStr = typeof textLen === 'string' ? textLen : '';
    const len = Math.max(1, Math.min(255, typeof textLen === 'string' ? (textLen.length || 8) : (Number(textLen) || 8)));
    const cjkMatches = rawStr ? rawStr.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) : null;
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    const hasCjk = cjkCount > 0 ? 1 : 0;
    const insMulti = hasCjk ? Math.min(14, Math.max(2, Math.floor(cjkCount / 3))) : 0;
    const pasteCount = len > 140 ? 1 : 0;
    const isCoarse = (typeof isMob === 'function' && isMob()) || (typeof Host !== 'undefined' && Host.platform === 'android') ? 1 : 0;
    const isBtn = (kind === 'button' || kind === 'click') ? 1 : 0;
    const composeTicks = Math.min(65535, Math.max(38, len * (16 + Math.floor(Math.random() * 14)) + 42 + Math.floor(Math.random() * 85)));
    // Arena _CX_LAYOUT_V2 21-field 96-bit human interaction telemetry:
    // untrustedUiEvents=0, pasteWithoutModifier=0, docOwnProps=0, integrity=0 (0 tamper bits),
    // CJK IME composition awareness, and physiological press/pointer/coalesced buckets.
    const layout = [
      [2, isBtn], [2, 2], [4, 0],
      [8, len], [4, insMulti], [4, pasteCount],
      [1, 0], [1, hasCjk], [4, hasCjk], [3, 0], [1, isCoarse], [16, 0],
      [3, 2 + Math.floor(Math.random() * 3)], [2, 1 + Math.floor(Math.random() * 3)], [2, 1 + Math.floor(Math.random() * 3)],
      [2, 1 + Math.floor(Math.random() * 3)], [2, Math.floor(Math.random() * 2)], [2, 0], [1, 0],
      [16, fnv(String(vid || 'local'))], [16, Math.floor(now() / 60000) & 65535]
    ];
    let a = (0x5bd1e995 ^ salt) >>> 0;
    const rng = () => { let e = Math.imul((a = (a + 0x6d2b79f5) | 0) ^ (a >>> 15), 1 | a); return (((e ^= e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ (e >>> 14)) >>> 0); };
    const order = layout.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng() % (i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    const o = new Uint8Array(12); let s = 0;
    for (const idx of order) {
      const [bits, val] = layout[idx];
      for (let b = bits - 1; b >= 0; b--) { if ((val >>> b) & 1) o[s >> 3] |= 128 >>> (s & 7); s++; }
    }
    for (let i = 0; i < 12; i++) o[i] ^= (rng() & 255);
    const l = new Uint8Array(15); l[0] = 2; l[1] = salt >>> 8; l[2] = salt & 255; l.set(o, 3);
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let out = '';
    for (let i = 0; i < 15; i += 3) {
      const n = (l[i] << 16) | (l[i + 1] << 8) | l[i + 2];
      out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
    }
    return out;
  } catch { return undefined; }
}
// 抽卡：create-chat 要等 reCAPTCHA + 服务器创建（常常好几秒），先在左侧列表放一条「创建中」占位，拿到 ID 后原位替换
async function createChat(text, opt = {}) {
  const waiting = opt.gacha ? Quota.blockedUntil(true) - now() : 0;
  if (waiting > 0) throw Object.assign(Error(Quota.blockedUntil() > now() ? '服务端要求等待，请在 ' + Math.ceil(waiting / 1000) + ' 秒后重试' : '自动抽卡短暂退避，' + Math.ceil(waiting / 1000) + ' 秒后重试'), { status: 429, retryAfterMs: waiting, rateLimitedLocally: true });
  if (!opt.gacha) return createChat0(text, opt);
  const gNoPh = Number(opt.gacha?.no) || 0, gTitlePh = gNoPh > 0 ? ('#' + gNoPh) : '抽卡 · 正在创建对话…';
  const ts = new Date().toISOString(), ph = { type: 'agentic', id: 'pending:' + uuid7(), title: gTitlePh, ...(gNoPh > 0 ? { gachaNo: gNoPh, localTitle: gTitlePh } : {}), _pending: true, updatedAt: ts, createdAt: ts };
  History.items.unshift(ph); Bus.emit('history');
  try { return await createChat0(text, { ...opt, placeholder: ph }); }
  finally { const i = History.items.indexOf(ph); if (i >= 0) { History.items.splice(i, 1); Bus.emit('history'); } }
}
const CREATE_ACTION = 'agentic_chat_submit';
let _lastCreatePromptNorm = '';
async function createChat0(text, opt = {}) {
  const normCreateTxt = String(text || '').replace(/\s+/g, ' ').trim();
  if (normCreateTxt && _lastCreatePromptNorm === normCreateTxt && typeof rotateVisitId === 'function') {
    try { rotateVisitId(); } catch {}
  }
  if (normCreateTxt) _lastCreatePromptNorm = normCreateTxt;
  const id = uuid7(), msg = { id, role: 'user', parts: [{ type: 'text', text }] };
  const um = Uploads.meta(opt.files, null); if (um) msg.metadata = um;
  const cx = packClientInteraction(text || (String(text || '').length || 8), Math.random() < 0.45 ? 'button' : 'enter');
  const body = { message: msg, timezone: currentTimezone(), ...(cx ? { cx } : {}) };
  if (!opt.gacha && typeof Connectors !== 'undefined') { const c = Connectors.active(); if (c.length) body.enabledConnectors = c; }   // 和官方一样：新对话带上已启用的连接器（抽卡不带）
  if (opt.v2) { body.recaptchaV2Token = opt.v2; body.recaptchaV3Token = null; }
  // 网页新建 agent 对话用的 reCAPTCHA action 是 agentic_chat_submit（不是 chat_submit）；action 不对会拉低验证分数
  else {
    const v3IpBefore = (typeof IP !== 'undefined' && IP.ip) || '';
    const [v3Tok, prePure] = await Promise.all([
      (opt.gacha ? Recaptcha.v3(CREATE_ACTION) : Recaptcha.take(CREATE_ACTION)).catch(() => null),
      (typeof IPRep !== 'undefined' && typeof IPRep.ensurePreSendPure === 'function')
        ? IPRep.ensurePreSendPure({ timeoutMs: 1200 }).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (prePure?.switched || (v3IpBefore && typeof IP !== 'undefined' && IP.ip && IP.ip !== v3IpBefore)) {
      try { Recaptcha.clearCache?.(); } catch {}
      body.recaptchaV3Token = await Recaptcha.v3(CREATE_ACTION).catch(() => v3Tok);
    } else {
      body.recaptchaV3Token = v3Tok;
    }
  }
  // 同一个请求（同一条消息 id、同一个 attempt id）自动重发：
  //   409「This chat request is still in progress. Retry the same request.」= 服务器还在处理上一次的同一个请求 → 等一下原样重发，拿到的就是那次的结果；
  //   500 / 502 / 503 / 504、超时、网络断开 → 退避后原样重发（服务器按消息 id 去重，不会多建对话）
  let res; let att = uuid7(); const t0 = now(); let relog = false, escalated = false, retriedFreshV3 = false, rotated429 = false, n409 = 0, n5xx = 0, nNet = 0;
  for (;;) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 45000);
    let err = null;
    try { res = await rawFetch('/nextjs-api/stream/create-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-agent-browser-attempt-id': att }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', signal: ctl.signal }); }
    catch (e) { err = e; }
    finally { clearTimeout(tm); }
    const left = 150000 - (now() - t0);
    if (err) {
      if (typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch) await AutoRoute.onErrorSwitch(err.name === 'AbortError' ? { routeTimeout: true, message: 'create-chat timeout' } : { net: true, message: String(err.message || err) }, 'create-chat').catch(() => null);
      if (++nNet <= 2 && left > 20000) {
        try { Recaptcha.clearCache?.(); } catch {}
        if (!opt.v2 && !body.recaptchaV2Token) body.recaptchaV3Token = await Recaptcha.v3(CREATE_ACTION).catch(() => body.recaptchaV3Token);
        opt.onRetry?.('创建对话' + (err.name === 'AbortError' ? '超时' : '网络错误') + '，已秒切备用线路并重发（第 ' + nNet + ' 次）');
        await sleep(800 * nNet);
        continue;
      }
      throw new Error(err.name === 'AbortError' ? '创建对话超时（45 秒没有响应），请检查代理后重试' : '创建对话失败：' + (err.message || err));
    }
    if (res.status === 401 && !relog) { relog = true; if (await Auth.relogin()) continue; }
    if (res.status === 409 && ++n409 <= 10 && left > 5000) { const t409 = await res.text().catch(() => ''); if (/refresh_required/i.test(t409) && Pin.on()) { Pin.fallback('旧部署要求刷新（409 refresh_required）'); opt.onRetry?.('旧版固定不兼容，改用新版重发'); continue; } opt.onRetry?.('服务器还在处理这个请求（409），' + Math.min(6, 1 + n409) + ' 秒后原样重发'); await sleep(Math.min(6000, 1000 + n409 * 1000)); continue; }
    // 重复指令（429 prompt failed / verification required）或 v3 分数不足（403 recaptcha validation failed）：先自动轮换会话指纹 + 刷新 DOM 行为遥测与 v3 令牌静默重试一次；仍不过再按模式升级 v2
    if ((res.status === 429 || res.status === 403) && !opt.v2 && !escalated) {
      const tRc = await res.clone().text().catch(() => '');
      const isPf = promptFailed(res.status, tRc);
      const isRc = isPf || (res.status === 403 && /recaptcha|人机|验证失败/i.test(tRc)) || (res.status === 429 && /verification required/i.test(tRc));
      if (isRc) {
        if (!retriedFreshV3) {
          retriedFreshV3 = true;
          try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
          try { Recaptcha.clearCache?.(); } catch {}
          att = uuid7();
          const freshCx = packClientInteraction(text || (String(text || '').length || 8), Math.random() < 0.5 ? 'button' : 'enter');
          if (freshCx) body.cx = freshCx;
          await sleep(1100 + Math.floor(Math.random() * 500));
          const freshV3 = await Recaptcha.v3(CREATE_ACTION).catch(() => null);
          if (freshV3 && freshV3 !== body.recaptchaV3Token) {
            if (isPf) msg.id = uuid7();
            body.recaptchaV3Token = freshV3;
            opt.onRetry?.('正在刷新人机遥测与 v3 令牌静默重发…');
            continue;
          }
        }
        if (opt.gacha) break;
        if (res.status === 403 && !opt.v2) { try { IPRep.note('rc'); } catch {} }
        escalated = true; opt.onRetry?.(isPf ? 'Brana 要求人工验证（重复指令），请完成验证' : 'Brana 要求人工验证（reCAPTCHA），请完成验证');
        const tok = await Recaptcha.v2().catch(() => null);
        if (!tok) throw Object.assign(new Error('已取消人机验证，这条没有发送'), { status: 0 });
        body.recaptchaV2Token = tok; body.recaptchaV3Token = null; continue;
      }
    }
    // 429 速率限制（非重复指令）：不切换用户当前 IP，先轮换会话指纹（arena_visit_id + cx 交互特征 + 新 reCAPTCHA v3 令牌）原地绕过重试一次
    if (res.status === 429 && !rotated429 && left > 12000) {
      const t429 = await res.clone().text().catch(() => '');
      if (!promptFailed(429, t429) && !/verification required/i.test(t429)) {
        rotated429 = true;
        try { rotateVisitId(); } catch {}
        msg.id = uuid7();
        att = uuid7();
        const freshCx = packClientInteraction(text || (String(text || '').length || 8), Math.random() < 0.5 ? 'button' : 'enter');
        if (freshCx) body.cx = freshCx;
        if (!opt.v2) body.recaptchaV3Token = await Recaptcha.v3(CREATE_ACTION).catch(() => body.recaptchaV3Token);
        const waitMs = 2600 + Math.floor(Math.random() * 1400);
        opt.onRetry?.('触发 429 速率限制，正在轮换会话指纹原地绕过重试（不切换当前 IP）…');
        await sleep(waitMs);
        continue;
      }
    }
    if ([500, 502, 503, 504, 520, 522, 524].includes(res.status) && ++n5xx <= 3 && left > 10000) { if (typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch) await AutoRoute.onErrorSwitch({ status: res.status }, 'create-chat').catch(() => null); opt.onRetry?.('服务器临时错误（HTTP ' + res.status + '），已秒切备用线路并重发（第 ' + n5xx + ' 次）'); await res.text().catch(() => {}); await sleep(900 * n5xx); continue; }
    break;
  }
  const t = await res.text(), pf = promptFailed(res.status, t);
  if (!pf) Quota.note(res);   // 重复指令的 429 不是新对话额度限流，不能记成「1 分钟后再试」
  // 纯净度实测：v3 直接通过 / 被要求人机验证；429 保持当前出口原地冷却，不再自动换走用户已选的未限流 IP
  if (res.ok) { if (body.recaptchaV3Token) IPRep.note('ok'); } else if (res.status === 403 && /recaptcha/i.test(t)) { if (!opt.v2) IPRep.note('rc'); } else if (!res.ok && typeof AutoRoute !== 'undefined' && AutoRoute.onErrorSwitch && [408].includes(res.status)) { void AutoRoute.onErrorSwitch({ status: res.status }, 'create-chat'); }
  if (!res.ok) { let m = t; try { m = JSON.parse(t).error || t; } catch {} if (typeof m !== 'string') m = JSON.stringify(m); throw new HttpError(res.status, m, res); }
  const sid = JSON.parse(t).id; if (!sid) throw new Error('create-chat 没有返回对话 ID');
  const gNo0 = Number(opt.gacha?.no) || 0, gShort0 = gNo0 > 0 ? ('#' + gNo0) : '';
  const initChatTitle = gShort0 || text.slice(0, 60);
  const c = chatOf(sid);
  c.messages = [{ ...msg, metadata: msg.metadata || {}, v: 0 }]; c.loaded = true; c.lastSeq = null; c.status = 'submitted'; c.phase = '等待回复'; c.sentAt = now(); c.awaitId = msg.id; c.awaitFrom = c.sentAt; c.turnInput = msg.id; c.title = initChatTitle;
  if (gShort0) { c.localTitle = gShort0; c.gachaNo = gNo0; }
  if (!opt.gacha) c.armLost(c.messages[0]);
  if (opt.gacha) c.gacha = opt.gacha; else Bus.emit('sent', sid, now());
  if (!History.byId(sid)) { const ts = new Date().toISOString(), row = { type: 'agentic', id: sid, title: initChatTitle, ...(gShort0 ? { localTitle: gShort0, gachaNo: gNo0 } : {}), updatedAt: ts, createdAt: ts, _local: true }, pi = opt.placeholder ? History.items.indexOf(opt.placeholder) : -1; if (pi >= 0) History.items[pi] = row; else History.items.unshift(row); Bus.emit('history'); }
  c.emit();
  c.stream();
  Bus.emit('created', c);
  return c;
}

// ---------- 历史列表 ----------
// 会话时间（毫秒）：按条目对象记住解析结果（侧栏每次重绘 1500 条都要 parse 一遍）

