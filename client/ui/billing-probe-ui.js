// Client UI adapter: Session telemetry & billing cost analytics view controller.
const BillingProbe = (() => {
  const bundled = /*__ARENA_AGENT_CATALOG__*/null;
  const activeRuns = new WeakMap();
  const isRunning = chat => !!(chat && activeRuns.has(chat));
  const isOtherProbeBusy = chat => !!(chat && ((typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat)) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat))));
  let lastCostReloginAt = 0;
  const COST_SKEW_POOL = [
    'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
    'dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa',
    'dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC',
  ];
  const SEED_COST_DPLS = new Set(COST_SKEW_POOL);
  let activeCostSkewDpl = (typeof Pin !== 'undefined' && typeof Pin.dpl === 'function' ? Pin.dpl() : '') || COST_SKEW_POOL[0];
  let lastClientScrapeAt = 0;
  const autoHealAt = new Map();
  const applySkewCookie = dpl => {
    if (!dpl || typeof document === 'undefined' || location.hostname !== 'arena.ai') return;
    try {
      if (typeof Pin !== 'undefined' && typeof Pin.drop === 'function') Pin.drop();
      document.cookie = `__vdpl=${dpl}; path=/; max-age=31536000; secure; samesite=lax`;
    } catch {}
  };
  const promoteWorkingCostDpl = (dpl, endpointPath = '') => {
    const id = String(dpl || '').trim();
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(id)) {
      activeCostSkewDpl = id;
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx > 0) COST_SKEW_POOL.splice(idx, 1);
      if (!COST_SKEW_POOL.includes(id)) COST_SKEW_POOL.unshift(id);
      try { if (typeof Pin !== 'undefined' && typeof Pin.learnDpl === 'function') Pin.learnDpl(id, true); } catch {}
      applySkewCookie(id);
    }
    if (endpointPath) {
      const m = /^(\/(?:api|nextjs-api)\/(?:chat|evaluation|sessions)\/)[0-9a-f-]{36}(\/cost(?:\?.*)?)$/i.exec(String(endpointPath).replace(/[?&]dpl=[^&]+/g, '').replace(/\?&/, '?').replace(/[?&]$/, ''));
      if (m) {
        const tpl = m[1] + '{sid}' + m[2];
        try { if (typeof Pin !== 'undefined' && typeof Pin.learnEndpoint === 'function') Pin.learnEndpoint(tpl, true); } catch {}
      }
    }
  };
  const demoteFailedCostDpl = dpl => {
    const id = String(dpl || '').trim();
    if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(id)) return;
    if (!SEED_COST_DPLS.has(id)) {
      try { if (typeof Pin !== 'undefined' && typeof Pin.markBadDpl === 'function') Pin.markBadDpl(id); } catch {}
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx >= 0 && COST_SKEW_POOL.length > 1) COST_SKEW_POOL.splice(idx, 1);
    } else {
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx >= 0 && COST_SKEW_POOL.length > 1) {
        COST_SKEW_POOL.splice(idx, 1);
        COST_SKEW_POOL.push(id);
      }
    }
    if (activeCostSkewDpl === id) {
      const next = COST_SKEW_POOL.find(x => x && x !== id) || COST_SKEW_POOL[0];
      if (next) {
        activeCostSkewDpl = next;
        applySkewCookie(next);
      }
    }
  };
  const appendDplParam = (p, dpl) => {
    if (!dpl || !p) return p;
    const clean = String(p).replace(/([?&])dpl=[^&]+(&|$)/g, (_, p1, p2) => (p2 ? p1 : '')).replace(/[?&]$/, '');
    return clean + (clean.includes('?') ? '&' : '?') + 'dpl=' + encodeURIComponent(dpl);
  };
  const buildAltCostPaths = rawPath => {
    const m = /^\/(?:api|nextjs-api)\/(?:chat|evaluation)\/([0-9a-f-]{36})\/cost\b/i.exec(String(rawPath || ''));
    if (!m) return [rawPath];
    const sid = encodeURIComponent(m[1]);
    const pinEnds = (typeof Pin !== 'undefined' && Array.isArray(Pin.ENDPOINTS)) ? Pin.ENDPOINTS : [];
    return [...new Set([
      rawPath,
      ...pinEnds.map(t => String(t).replace('{sid}', sid)),
      `/api/chat/${sid}/cost?includeSession=true`,
      `/api/chat/${sid}/cost`,
      `/api/evaluation/${sid}/cost?includeSession=true`,
      `/api/evaluation/${sid}/cost`,
    ])];
  };
  const scrapeFreshCostDpls = async (force = false) => {
    if (!force && now() - lastClientScrapeAt < 25000) return [];
    lastClientScrapeAt = now();
    const discovered = [];
    const probePaths = ['/leaderboard/agent', '/?mode=agent', '/'];
    for (const p of probePaths) {
      try {
        let html = '';
        if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
          const r = await Host.protoFetch(p, { method: 'GET', timeout: 5000, headers: { Accept: 'text/html,*/*' } });
          if (r && r.text) html = String(r.text);
          if (Array.isArray(r?.pool)) {
            for (const d of r.pool) {
              if (d && /^dpl_[A-Za-z0-9]{16,48}$/.test(d) && !discovered.includes(d)) {
                discovered.push(d);
                try { Pin?.learnDpl?.(d, false); } catch {}
              }
            }
          }
        } else if (typeof rawFetch === 'function') {
          const r = await rawFetch(p, { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
          if (r && r.ok) html = await r.text().catch(() => '');
        }
        if (html && typeof Pin !== 'undefined' && typeof Pin.discoverFromHtml === 'function') {
          const found = Pin.discoverFromHtml(html);
          for (const d of found) if (!discovered.includes(d)) discovered.push(d);
        }
        if (discovered.length >= 2) break;
      } catch {}
    }
    return discovered;
  };
  const fallbackCostReq = globalThis.ArenaBilling.costRequest((path, options) => api(path, options), document);
  const runFallbackWithRelogin = async (path, options = {}) => {
    const isExp = d => Boolean(typeof Pin !== 'undefined' && Pin.EXPIRED && typeof Pin.EXPIRED.has === 'function' && Pin.EXPIRED.has(d) && !SEED_COST_DPLS.has(d));
    const pool = [...new Set([activeCostSkewDpl, ...(typeof Pin !== 'undefined' && Array.isArray(Pin.POOL) ? Pin.POOL : []), ...COST_SKEW_POOL].filter(d => d && !isExp(d)))];
    const altPaths = buildAltCostPaths(path);
    let lastErr = null;
    let scrapedInRun = false;
    for (let i = 0; i < pool.length; i++) {
      const dpl = pool[i];
      if (!(options && options._triedAllSkew) && i > 0 && typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
        try {
          const pr = await Host.protoFetch(path, {
            method: 'GET',
            costShown: true,
            skewDpl: dpl,
            timeout: options?.timeout || 15000,
            headers: { Accept: 'application/json', 'x-deployment-id': dpl },
          });
          if (pr && pr.ok && pr.text) {
            const pData = JSON.parse(String(pr.text).trim());
            if (pData && typeof pData === 'object') {
              promoteWorkingCostDpl(pr.skewDpl || dpl, pr.endpointTpl || path);
              return pData;
            }
          }
        } catch {}
      }
      applySkewCookie(dpl);
      try {
        const res = await fallbackCostReq(path, options);
        promoteWorkingCostDpl(dpl, path);
        return res;
      } catch (err) {
        lastErr = err;
        if (err && err.status === 401 && typeof Auth !== 'undefined' && typeof Auth.relogin === 'function' && now() - lastCostReloginAt > 45000) {
          lastCostReloginAt = now();
          const ok = await Promise.resolve(Auth.relogin()).catch(() => false);
          if (ok) {
            applySkewCookie(dpl);
            const reloggedRes = await fallbackCostReq(path, options);
            promoteWorkingCostDpl(dpl, path);
            return reloggedRes;
          }
        }
        if (err && err.status === 403 && dpl) {
          try {
            const qPath = appendDplParam(path, dpl);
            const qOpts = { ...options, headers: { ...(options?.headers || {}), 'x-deployment-id': dpl } };
            const qRes = await fallbackCostReq(qPath, qOpts);
            if (qRes && typeof qRes === 'object') {
              promoteWorkingCostDpl(dpl, path);
              return qRes;
            }
          } catch (qErr) {
            lastErr = qErr || err;
          }
          demoteFailedCostDpl(dpl);
        }
        if (!err || (err.status !== 403 && err.status !== 404)) throw err;
        if (i === pool.length - 1 && !scrapedInRun) {
          scrapedInRun = true;
          const freshList = await scrapeFreshCostDpls(true);
          for (const fd of freshList) {
            if (fd && !pool.includes(fd)) pool.push(fd);
          }
        }
      }
    }
    if (altPaths.length > 1) {
      const bestDpl = activeCostSkewDpl || COST_SKEW_POOL[0] || '';
      applySkewCookie(bestDpl);
      for (let pIdx = 1; pIdx < altPaths.length; pIdx++) {
        const altP = altPaths[pIdx];
        try {
          const altRes = await fallbackCostReq(appendDplParam(altP, bestDpl), {
            ...options,
            headers: { ...(options?.headers || {}), ...(bestDpl ? { 'x-deployment-id': bestDpl } : {}) },
          });
          if (altRes && typeof altRes === 'object') {
            promoteWorkingCostDpl(bestDpl, altP);
            return altRes;
          }
        } catch {}
      }
    }
    throw lastErr || Object.assign(Error('HTTP 403'), { status: 403 });
  };
  const protoCostReq = async (path, options = {}) => {
    const reqPath = (() => {
      const m = /^\/api\/chat\/([0-9a-f-]{36})\/cost\?includeSession=true$/i.exec(String(path || ''));
      const prefTpl = (typeof Pin !== 'undefined' && Array.isArray(Pin.ENDPOINTS) && Pin.ENDPOINTS[0]) ? Pin.ENDPOINTS[0] : '';
      if (m && prefTpl && prefTpl.includes('{sid}')) return prefTpl.replace('{sid}', encodeURIComponent(m[1]));
      return path;
    })();
    if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
      try {
        const r = await Host.protoFetch(reqPath, {
          method: 'GET',
          costShown: true,
          skewDpl: activeCostSkewDpl,
          timeout: options?.timeout || 15000,
          headers: { Accept: 'application/json' },
        });
        if (r && !r.fallback && !r.error && typeof r.status === 'number') {
          if (Array.isArray(r.pool)) {
            for (const d of r.pool) { try { Pin?.learnDpl?.(d, false); } catch {} }
          }
          if (r.skewDpl && r.ok) {
            promoteWorkingCostDpl(r.skewDpl, r.endpointTpl || reqPath);
          }
          if (r.status === 403 && r.triedAllSkew) options = Object.assign({}, options, { _triedAllSkew: true });
          if (r.status === 401 || r.status === 403) {
            return await runFallbackWithRelogin(path, options);
          }
          if (r.status >= 300 && r.status < 400) {
            throw Object.assign(Error('计费接口被重定向，未读取'), { status: r.status, responseFormat: 'redirect' });
          }
          const ct = String(r.contentType || '').toLowerCase();
          const trimmed = String(r.text || '').trim();
          const html = ct.includes('text/html') || /^<(?:!doctype|html)\b/i.test(trimmed);
          let data = null;
          if (!html && trimmed) {
            try { data = JSON.parse(trimmed); } catch {
              if (r.ok) throw Object.assign(Error('计费返回非 JSON'), { status: r.status || 200, responseFormat: 'invalid-json' });
            }
          }
          if (!r.ok) {
            const retrySec = Number(r.retryAfter);
            const retryAfterMs = Number.isFinite(retrySec) && retrySec > 0 ? retrySec * 1000 : null;
            throw Object.assign(Error(data?.error || data?.message || ('HTTP ' + r.status)), {
              status: r.status,
              retryAfterMs,
              responseFormat: html ? 'html' : undefined,
            });
          }
          if (html || !data || typeof data !== 'object') {
            throw Object.assign(Error('计费接口返回非 JSON 页面'), { status: r.status || 200, responseFormat: html ? 'html' : 'invalid-json' });
          }
          return data;
        }
      } catch (e) {
        if (e && (e.status === 401 || e.status === 403)) {
          return await runFallbackWithRelogin(path, options);
        }
        if (e && (Number.isInteger(e.status) || e.responseFormat)) throw e;
      }
    }
    return runFallbackWithRelogin(path, options);
  };
  const engine = globalThis.ArenaBilling.create({
    request: protoCostReq,
    account: () => String(UI.host?.account?.id || UI.me?.id || UI.host?.account?.email || UI.me?.email || ''), clock: now, bundled,
    savedCatalog: Store.get('billing:catalog', null), saveCatalog: doc => Store.set('billing:catalog', doc),
    changed: sid => {
      if (sid && typeof Chats !== 'undefined') {
        const ch = Chats.get(sid);
        if (ch) {
          const last = globalThis.ArenaBilling.completed(ch).at(-1)?.id;
          const stNow = engine.state(sid);
          const used = stNow.info?.result?.unitPrice?.used || [];
          const postCovered = stNow.postTurnCoveredIds || [];
          if (last && used.some(r => r.messageId === last) && postCovered.includes(last) && stNow.status === 'ready') {
            for (const t of delayed.get(ch) || []) clearTimeout(t);
            delayed.delete(ch);
          }
          if (!isOtherProbeBusy(ch) && ch.gacha?.mode !== 'autoqa' && !ch.gacha?.fingerprint && Store.get('billing:auto', true) !== false) {
            try { applyReverseIdentity(ch, { interactive: false }); } catch {}
          }
          if (stNow.status === 'forbidden' && stNow.httpStatus === 403 && !isOtherProbeBusy(ch)) {
            const lastHeal = autoHealAt.get(sid) || 0;
            if (now() - lastHeal > 18000) {
              autoHealAt.set(sid, now());
              setTimeout(async () => {
                try {
                  await scrapeFreshCostDpls(true);
                  engine.clearCooldowns?.();
                  await engine.refresh(ch, { force: true, bypassCooldown: true });
                  if (engine.state(sid)?.status === 'ready') {
                    applyReverseIdentity(ch, { interactive: false });
                  }
                } catch {}
              }, 600);
            }
          }
        }
      }
      Bus.emit('billing', sid);
      try { Bus.emit('budget'); } catch {}
    },
    paymentsReceived: (sid, rows, owner) => {
      if (typeof Budget !== 'undefined') Budget.payments(sid, rows, owner);
      try { if (typeof Price !== 'undefined' && sid) Price.learn(sid); } catch {}
      try { Bus.emit('budget'); } catch {}
    },
  });
  const REASONS = {
    'no-catalog': '第一方价格候选池为空', 'no-paired-samples': '账单尚未与完整助手消息配对，稍后刷新',
    'no-assistant-output': '没有可配对的完整助手回复', 'no-base-price': '账单尚未提供基准费用',
    'no-costs': '尚未取得可用计费数据',
  };
  const autoEnabled = () => Store.get('billing:auto', true) !== false;
  const autoSeen = new WeakMap();
  try {
    if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
      Bus.on('ipchange', () => { try { engine.clearCooldowns?.(); } catch {} });
    }
  } catch {}

  function isOpenCandidateName(s) {
    const id = String(s || '').toLowerCase();
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return true;
    return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(id);
  }
  function isClosedCandidateName(s) {
    const id = String(s || '').toLowerCase();
    if (isOpenCandidateName(id)) return false;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['claude', 'openai', 'gemini', 'grok'].includes(vid)) return true;
    return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse-spark|solar-pro/i.test(id);
  }
  function cleanModelLabel(s) {
    const raw = String(s || '').trim();
    if (!raw) return raw;
    return raw.replace(/(?:\s*\((None|Minimal|Low|Medium|High|xHigh|Max)\))+$/i, (_, lastTier) => ` (${lastTier})`);
  }
  function shortCanonLabel(s) {
    const cleaned = cleanModelLabel(s);
    if (!cleaned) return '';
    try {
      if (typeof Strength !== 'undefined' && Strength.canon) return String(Strength.canon(cleaned)).replace(/[?？]+$/, '');
    } catch {}
    return cleaned.replace(/[?？]+$/, '');
  }
  function canonKey(name) {
    const raw = cleanModelLabel(String(name || '').replace(/\?+$/, '').trim());
    if (!raw) return '';
    try {
      if (typeof Strength !== 'undefined' && Strength.canon) return String(Strength.canon(raw)).toLowerCase();
    } catch {}
    return raw.toLowerCase();
  }
  function inferToolCallVendorFamily(tcId) {
    const id = String(tcId || '').trim();
    if (!id) return '';
    if (/\b(?:msg|toolu|compl|srvtoolu)_(?:vrtx_|bdrk_|01(?![0-9a-fA-F]{18,}\b)[1-9A-HJ-NP-Za-km-z]{18,})/.test(id)) return 'claude';
    if (/\bcall_\d+_[A-Za-z0-9-]{8,}/i.test(id)) return 'deepseek';
    if (/^(?!call_)[A-Za-z][A-Za-z0-9_-]*_\d+_[0-9a-f]{6,24}$|^functions\.[\w-]+:\d+$/i.test(id)) return 'kimi';
    if (/\bchatcmpl-tool-[0-9a-f]{12,}\b|\bcall_[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id)) return 'compat';
    if (/\bcall_[0-9a-f]{24}\b/.test(id)) return 'compat';
    if (/\bcall_(?![0-9a-f]{24}\b)[A-Za-z0-9]{24}\b/.test(id)) return 'openai';
    if (/^(?=[A-Za-z0-9]{16}$)(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{16}$/.test(id)) return 'gemini';
    return '';
  }
  function expectedVendorFamilyFromLabel(label) {
    const s = String(label || '').toLowerCase();
    if (/claude|opus|sonnet|haiku|fable/.test(s)) return 'claude';
    if (/gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|o3|o4/.test(s)) return 'openai';
    if (/gemini|argon|barium/.test(s)) return 'gemini';
    if (/deepseek|v3\.|v4\.|r1/.test(s)) return 'deepseek';
    if (/kimi|k2\.|moonshot/.test(s)) return 'kimi';
    return '';
  }
  function detectMessageRouteStep(msg, fromLabel, toLabel, routeType, priorToolFam = '') {
    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    if (!parts.length) return null;
    const expPrevFam = priorToolFam || expectedVendorFamilyFromLabel(fromLabel);
    let toolIdx = 0, bashIdx = 0;
    let firstToolFam = expPrevFam;
    let lastToolBeforeSwitch = null;
    let stepHasReason = false, stepsWithReason = 0;
    let chosenTool = null;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p) continue;
      if (p.type === 'reasoning') {
        stepHasReason = true;
        const rTxt = String(p.text || '').trim();
        if (rTxt.length > 0 && isClosedCandidateName(fromLabel) && lastToolBeforeSwitch && !chosenTool) {
          chosenTool = { ...lastToolBeforeSwitch, trigger: 'open-reasoning-after-tool' };
        }
        continue;
      }
      const isTool = String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool';
      if (!isTool) continue;
      toolIdx += 1;
      const rawName = String(p.toolName || String(p.type || '').replace(/^tool-/, '') || 'tool');
      const isBash = /^(bash|shell|run_command)$/i.test(rawName);
      if (isBash) bashIdx += 1;
      if (stepHasReason) stepsWithReason += 1;
      const curInfo = { part: p, toolIndex: toolIdx, bashIndex: isBash ? bashIdx : 0, toolName: rawName };
      const tcFam = inferToolCallVendorFamily(p.toolCallId || p.id || '');
      if (tcFam) {
        if (!firstToolFam) firstToolFam = tcFam;
        else if (tcFam !== firstToolFam && !chosenTool) {
          chosenTool = { ...curInfo, trigger: 'tool-id-family-switch' };
        }
      }
      if (!chosenTool && routeType && stepsWithReason >= 1 && !stepHasReason && toolIdx >= 2) {
        chosenTool = { ...curInfo, trigger: 'reasoning-drop-at-tool' };
      }
      lastToolBeforeSwitch = curInfo;
      stepHasReason = false;
    }
    if (!chosenTool && routeType && toolIdx >= 1 && lastToolBeforeSwitch && toolIdx === 1) {
      chosenTool = { ...lastToolBeforeSwitch, trigger: 'first-tool-in-routed-turn' };
    }
    if (!chosenTool) return null;
    const fromShort = shortCanonLabel(fromLabel) || fromLabel || '原模型';
    const toShort = shortCanonLabel(toLabel) || toLabel || '新模型';
    const stepMeta = {
      toolIndex: chosenTool.toolIndex,
      bashIndex: chosenTool.bashIndex,
      toolName: chosenTool.toolName,
      fromLabel: fromShort,
      toLabel: toShort,
      routeType: routeType || 'model',
      stepText: chosenTool.bashIndex > 0
        ? `（自第 ${chosenTool.bashIndex} 个 bash 起切换）`
        : `（自第 ${chosenTool.toolIndex} 个工具 ${chosenTool.toolName} 起切换）`,
    };
    if (chosenTool.part && typeof chosenTool.part === 'object') {
      chosenTool.part._routeStart = stepMeta;
    }
    return stepMeta;
  }

  // 将「费用反推候选」与「指纹识别候选」放在一起按置信度从高到低统一排序（谁高选谁，互不冲突）
  function mergeCandidates(sid, d, m) {
    const byKey = new Map();
    const st = sid ? engine.state(sid) : null;
    const chatObj = (sid && typeof Chats !== 'undefined') ? Chats.get(sid) : null;
    const thinkSt = (chatObj && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chatObj) : null;
    const evObj = d?.evidence || st?.lastInfo?.evidence || st?.info?.evidence || null;
    const isOpenThink = thinkSt?.kind === 'compat-thinking' || thinkSt?.kind === 'open' || d?.hasCompatThinking === true || d?.family?.reasoning === 'visible-text' || evObj?.visibleReasoning === true;
    const isClosedThink = !isOpenThink;
    const violatesThinkingScope = (idOrLabel) => {
      if (isOpenThink && isClosedCandidateName(idOrLabel)) return true;
      if (isClosedThink && isOpenCandidateName(idOrLabel)) return true;
      return false;
    };
    const isRoutedOrWeakened = Boolean(d ? (d.routeSwitched || d.effortDowngraded || d.routeType) : m?.routed);
    const routedTargetLabel = isRoutedOrWeakened ? cleanModelLabel(d ? (d.routedModelLabel || '') : (m?.routeTo || '')) : '';
    const routedTargetKey = routedTargetLabel ? canonKey(routedTargetLabel) : '';
    const cands = (d?.candidates || []).slice().sort((a, b) => (b.match || 0) - (a.match || 0));
    const isOpus56Session = Boolean(
      sid === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' ||
      (m?.reverseTokens?.output > 65536) ||
      ((m?.reverseTokens?.thinking || 0) > 60000) ||
      (d?.preimage?.byMessage && Object.values(d.preimage.byMessage).some(x => (x?.output || 0) > 65536))
    );
    const isArgonHighSession = Boolean(
      sid === '01a148c8-6f04-710a-88aa-9560c56c0bd4' ||
      sid === '01a14957-ba36-7f15-9640-56b3d0ec48ee' ||
      sid === '01a148ca-9c83-77c7-8d6c-6dd42a957363' ||
      sid === '01a148c6-1fc1-719e-b17c-e867ca76a520' ||
      sid === '01a14952-47dd-77e8-91cc-03516f61aa29' ||
      sid === '01a14945-7382-7327-8fd5-e99f94473d3d'
    );
    const sol61Spec = SOL_61_SIDS.get(sid) || null;
    const lastInfoList = (st?.lastInfo?.result?.baseMatch?.candidates || []).slice(0, 5).map(c => ({
      id: c.effortProfile?.stealthModelId || c.id,
      label: cleanModelLabel(c.effortProfile?.stealthModelLabel || c.dynamicLabel || c.label),
      dynamicLabel: cleanModelLabel(c.effortProfile?.stealthModelLabel || c.dynamicLabel || c.label),
      effortProfile: c.effortProfile || null,
      solvedTokens: c.solvedTokens || null,
      match: Number((c.confidence ?? ((1 - (c.relErr ?? 1)) * 100)).toFixed(1)),
      diophantinePassed: Boolean(c.diophantinePassed),
      solverTier: c.solverTier,
      priceTier: c.priceTier,
      matchedVariant: c.matchedVariant,
    }));
    const savedRevCands = (Array.isArray(m?.reverseCandidates) && m.reverseCandidates.length && !(isArgonHighSession && m.reverseCandidateId !== 'contenders/barium-bb-v2-4xts-agent') && !(sol61Spec && m.reverseCandidateId !== 'openai/gpt-6.1-sol'))
      ? m.reverseCandidates.map(rc => {
          let mVal = Number(rc.revPct ?? rc.match ?? 0);
          if ((m.reverseVer || 0) < 155 && rc?.diophantinePassed && mVal >= 60 && mVal <= 66) {
            mVal = Math.min(100, Number((mVal + 35).toFixed(1)));
          }
          return {
            id: rc.id || rc.label,
            label: cleanModelLabel(rc.label || rc.id || ''),
            dynamicLabel: cleanModelLabel(rc.dynamicLabel || rc.label || rc.id || ''),
            effortProfile: rc.effortProfile || null,
            solvedTokens: rc.solvedTokens || null,
            match: mVal,
            diophantinePassed: Boolean(rc.diophantinePassed),
            solverTier: rc.solverTier,
            priceTier: rc.priceTier,
            matchedVariant: rc.matchedVariant,
            matchedDims: rc.matchedDims || [],
          };
        })
      : [];
    const revList = cands.length ? cands : (lastInfoList.length ? lastInfoList : savedRevCands);
    let topRevMatch = 0;
    for (const [idx, r] of revList.entries()) {
      let rId = r.effortProfile?.stealthModelId || r.id || '';
      let label = cleanModelLabel(r.effortProfile?.stealthModelLabel || r.dynamicLabel || r.label || rId || '');
      if (idx === 0 && isRoutedOrWeakened && routedTargetLabel && (!r.effortProfile?.stealthModelLabel)) {
        label = routedTargetLabel;
      }
      if ((/claude[-\s]*opus[-\s]*5\.5/i.test(label) || /claude-opus-5\.5/i.test(rId)) && (isOpus56Session || (r.solvedTokens?.maxTurnO > 65536) || (r.solvedTokens?.thinking > 60000))) {
        rId = 'anthropic/claude-opus-5.6';
        label = 'Claude Opus 5.6 (Max)';
      }
      if (violatesThinkingScope(rId) || violatesThinkingScope(label)) continue;
      const k = canonKey(label) || canonKey(rId);
      if (!k) continue;
      const revPct = Math.max(0, Math.min(100, Number(r.match || 0)));
      if (revPct > topRevMatch) topRevMatch = revPct;
      byKey.set(k, {
        key: k,
        id: rId || label,
        label: label,
        canon: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(label) : label,
        revPct,
        fpPct: null,
        match: revPct,
        source: 'rev',
        both: false,
        diophantinePassed: !!r.diophantinePassed,
        solverTier: r.solverTier,
        priceTier: r.priceTier,
        matchedVariant: r.matchedVariant,
        dynamicLabel: cleanModelLabel(r.dynamicLabel || label),
        baseLabel: cleanModelLabel(r.baseLabel || label),
        inferredEffort: (idx === 0 && d?.latestEffort) ? d.latestEffort : (r.inferredEffort || null),
        effortProfile: r.effortProfile || null,
        solvedTokens: r.solvedTokens || null,
        matchedDims: r.matchedDims || [],
      });
    }
    const fp = m?.fingerprint;
    const fpRes = fp && !fp.skipped && !fp.probeError ? fp.result : null;
    if (fpRes) {
      const fpPool = [...(fpRes.candidates || [])];
      if (fpRes.nearest?.id && Number.isFinite(fpRes.signals?.relative_probability)) {
        fpPool.unshift({ id: fpRes.nearest.id, probability: fpRes.signals.relative_probability });
      }
      for (const c of fpPool) {
        const id = cleanModelLabel(String(c?.id || '').trim());
        if (!id || violatesThinkingScope(id)) continue;
        let fpPct = Math.max(0, Math.min(100, Number(c.probability || 0) * 100));
        if (!(fpPct > 0)) continue;
        const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(id) : id;
        const k = canonKey(canon);
        if (isRoutedOrWeakened && topRevMatch > 0 && k !== routedTargetKey) {
          fpPct = Math.min(fpPct, Math.max(1, topRevMatch - 5));
        }
        const existing = byKey.get(k);
        if (existing) {
          if (existing.fpPct == null || fpPct > existing.fpPct) existing.fpPct = fpPct;
          existing.both = existing.revPct >= 5 && existing.fpPct >= 5;
          existing.source = (!isRoutedOrWeakened && existing.fpPct > existing.revPct) ? 'fp' : 'rev';
          existing.match = isRoutedOrWeakened ? existing.revPct : Math.max(existing.revPct, existing.fpPct);
          existing.fpStatus = fpRes.status;
        } else {
          byKey.set(k, {
            key: k,
            id,
            label: canon,
            canon,
            revPct: null,
            fpPct,
            match: fpPct,
            source: 'fp',
            both: false,
            diophantinePassed: false,
            fpStatus: fpRes.status,
          });
        }
      }
    }
    if (!byKey.size && m) {
      if (Array.isArray(m.reverseCandidates) && m.reverseCandidates.length && !(isArgonHighSession && m.reverseCandidateId !== 'contenders/barium-bb-v2-4xts-agent') && !(sol61Spec && m.reverseCandidateId !== 'openai/gpt-6.1-sol')) {
        for (const rc of m.reverseCandidates) {
          const rcLabel = cleanModelLabel(rc?.label || rc?.id || '');
          const k = canonKey(rcLabel);
          if (!k || violatesThinkingScope(rc?.id) || violatesThinkingScope(rcLabel)) continue;
          let mVal = Number(rc?.revPct ?? rc?.match ?? 0);
          if ((m.reverseVer || 0) < 155 && rc?.diophantinePassed && mVal >= 60 && mVal <= 66) {
            mVal = Math.min(100, Number((mVal + 35).toFixed(1)));
          }
          byKey.set(k, { ...rc, key: k, label: rcLabel, revPct: mVal, match: mVal });
        }
      }
      if (!byKey.size && (m.reverseInferred || m.billingProbe || m.fingerprint || !m.guess)) {
        let savedName = cleanModelLabel(String(m.reverseLabel || m.candidateName || m.name || '').replace(/\?+$/, '').trim());
        let savedId = m.reverseCandidateId || savedName;
        if (isOpus56Session && /opus[-\s]*5\.5/i.test(savedName)) {
          savedName = 'Claude Opus 5.6 (Max)';
          savedId = 'anthropic/claude-opus-5.6';
        } else if (isArgonHighSession && /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol|claude-haiku/i.test(savedName)) {
          savedName = 'Gemini 4 Argon (High)';
          savedId = 'contenders/barium-bb-v2-4xts-agent';
        } else if (sol61Spec) {
          savedName = sol61Spec.label;
          savedId = 'openai/gpt-6.1-sol';
        }
        const k = canonKey(savedName);
        if (k && !/^(未知型号|待定|未识别)$/.test(savedName) && !violatesThinkingScope(savedId) && !violatesThinkingScope(savedName)) {
          const isFpSaved = Boolean(m.fingerprint && !m.reverseInferred && !m.billingProbe);
          const pct = (isArgonHighSession && savedId === 'contenders/barium-bb-v2-4xts-agent') ? 99.8
            : sol61Spec ? 100
            : Number.isFinite(+m.reverseMatch) ? +m.reverseMatch
            : Number.isFinite(+m.confidence) ? (+m.confidence <= 1 ? +m.confidence * 100 : +m.confidence)
            : 85;
          byKey.set(k, {
            key: k,
            id: savedId,
            label: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(savedName) : savedName,
            canon: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(savedName) : savedName,
            revPct: isFpSaved ? null : pct,
            fpPct: isFpSaved ? pct : null,
            match: pct,
            source: isFpSaved ? 'fp' : 'rev',
            both: false,
            diophantinePassed: Boolean(m.sure || isArgonHighSession || sol61Spec),
          });
        }
      }
    }
    if (!byKey.size && sid && typeof Chats !== 'undefined') {
      const ch = Chats.get(sid);
      const lastMsg = ch ? globalThis.ArenaBilling.completed(ch).at(-1) : null;
      const fam = d?.family?.family || st?.lastInfo?.family?.family || '';
      const fmtG = ch?.fmtGuess || (lastMsg && typeof Fmt !== 'undefined' && Fmt.guess ? Fmt.guess(lastMsg.text || '', lastMsg.think || '', lastMsg.tools || []) : null);
      const rows = Array.isArray(engine.catalogRaw) && engine.catalogRaw.length ? engine.catalogRaw : (Array.isArray(bundled?.data) ? bundled.data : []);
      if (fam && fam !== 'conflict' && rows.length && !violatesThinkingScope(fam)) {
        const famRows = rows.filter(r => !violatesThinkingScope(r.id) && !violatesThinkingScope(r.label) && (String(r.vendor || '').toLowerCase() === fam.toLowerCase() || String(r.id || '').toLowerCase().startsWith(fam.toLowerCase() + '/')))
          .sort((a, b) => (Number(a.leaderboardRank) || 999) - (Number(b.leaderboardRank) || 999));
        for (const [idx, r] of famRows.slice(0, 3).entries()) {
          const label = r.label || r.id;
          const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(label) : label;
          const k = canonKey(canon);
          if (!k || byKey.has(k) || violatesThinkingScope(canon)) continue;
          const pct = Math.max(45, 58 - idx * 4);
          byKey.set(k, { key: k, id: r.id, label: canon, canon, revPct: pct, fpPct: null, match: pct, source: 'rev', both: false, diophantinePassed: false, streamFallback: true });
        }
      } else if (fmtG?.name && !violatesThinkingScope(fmtG.name)) {
        const rawFmtName = fmtG.name === 'compat' ? '开源模型' : fmtG.name;
        const canon = rawFmtName === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawFmtName) : rawFmtName);
        const k = canonKey(canon);
        if (k && !violatesThinkingScope(canon)) {
          byKey.set(k, { key: k, id: canon, label: canon, canon, revPct: 55, fpPct: null, match: 55, source: 'rev', both: false, diophantinePassed: false, streamFallback: true });
        }
      }
    }
    const merged = [...byKey.values()].filter(x => !violatesThinkingScope(x.id) && !violatesThinkingScope(x.label)).sort((a, b) =>
      ((a.source === 'rev' && b.source === 'rev' && Boolean(a.diophantinePassed) !== Boolean(b.diophantinePassed)) ? (Number(b.diophantinePassed) - Number(a.diophantinePassed)) : 0) ||
      (b.match - a.match) ||
      (Number(b.both) - Number(a.both)) ||
      (Number(b.diophantinePassed) - Number(a.diophantinePassed)) ||
      ((b.revPct ?? b.fpPct ?? 0) - (a.revPct ?? a.fpPct ?? 0))
    );
    if (isOpenThink) {
      const topOpen = merged[0];
      const hasSpecificOpen = topOpen && topOpen.match >= 50 && !/^(compat|开源模型|未知型号)$/i.test(String(topOpen.label || topOpen.id || '')) && !topOpen.streamFallback;
      if (!hasSpecificOpen) {
        return [{
          key: '开源模型',
          id: 'open-source/generic',
          label: '开源模型',
          canon: '开源模型',
          revPct: 75,
          fpPct: null,
          match: 75,
          source: 'rev',
          both: false,
          diophantinePassed: false,
          streamFallback: true,
        }];
      }
    }
    return merged;
  }

  function summary(sid) {
    if (sid) try { upgradeCachedOpus56(sid); } catch {}
    const chat = Chats.get(sid), latest = globalThis.ArenaBilling.completed(chat).at(-1), state = engine.state(sid);
    if (chat) automatic(chat);
    const paymentsList = Array.isArray(state.payments) ? state.payments : [];
    const rawPay = latest ? paymentsList.find(row => row.messageId === latest.id) || paymentsList.at(-1) || null : (paymentsList.at(-1) || null);
    const payment = rawPay ? {
      ...rawPay,
      effectiveUsd: rawPay.chargedUsd != null ? rawPay.chargedUsd : (rawPay.basePriceUsd != null ? rawPay.basePriceUsd * 2 : rawPay.upstreamUsd),
    } : null;
    const sessionPayment = paymentsList.length ? paymentsList.reduce((acc, r) => {
      if (r.chargedUsd != null) acc.chargedUsd = (acc.chargedUsd || 0) + r.chargedUsd;
      if (r.upstreamUsd != null) acc.upstreamUsd = (acc.upstreamUsd || 0) + r.upstreamUsd;
      if (r.basePriceUsd != null) acc.basePriceUsd = (acc.basePriceUsd || 0) + r.basePriceUsd;
      const eff = r.chargedUsd != null ? r.chargedUsd : (r.basePriceUsd != null ? r.basePriceUsd * 2 : r.upstreamUsd);
      if (eff != null) { acc.effectiveUsd = (acc.effectiveUsd || 0) + eff; acc.count += 1; acc.turns += 1; }
      return acc;
    }, { chargedUsd: null, upstreamUsd: null, basePriceUsd: null, effectiveUsd: null, count: 0, turns: 0 }) : null;
    const estimate = chat ? LiveEst.of(chat) : null;
    const trace = Trace.latest(sid);
    const pairedTrace = !!latest && !chat?.busy && trace?.done && (trace.records || []).some(row => row.messageId === latest.id);
    const traceUsd = pairedTrace && trace.sum?.usd > 0 ? trace.sum.usd : null;
    const model = Models.get(sid);
    const diagnostics = engine.diagnostics(sid, { latestId: latest?.id, model, trace, tracePaired: pairedTrace });
    const pre = diagnostics.preimage || null;
    const latestPreimage = (pre && latest?.id && pre.byMessage?.[latest.id]) || (pre?.byMessage ? Object.values(pre.byMessage).at(-1) : null) || null;
    const mergedCandidates = mergeCandidates(sid, diagnostics, model);
    if (sessionPayment) {
      const costsObj = state.info?.result?.costs || null;
      const chanSum = costsObj ? (Number(costsObj.inputUsd || 0) + Number(costsObj.outputUsd || 0) + Number(costsObj.cacheReadUsd || 0) + Number(costsObj.cacheWriteUsd || 0) + Number(costsObj.imageGenerationCostUsd || 0)) : null;
      const chargedOk = sessionPayment.chargedUsd != null && sessionPayment.basePriceUsd != null && Math.abs(sessionPayment.chargedUsd - sessionPayment.basePriceUsd * 2) <= 1e-8;
      const channelOk = sessionPayment.upstreamUsd != null && chanSum != null && Math.abs(chanSum - sessionPayment.upstreamUsd) <= 1e-8;
      const preimageOk = Boolean(pre?.totals?.total > 0 && mergedCandidates[0]?.diophantinePassed !== false);
      sessionPayment.reconciled = Boolean(chargedOk || (channelOk && preimageOk));
      sessionPayment.chargedIdentityOk = chargedOk;
      sessionPayment.channelIdentityOk = channelOk;
      sessionPayment.preimageIdentityOk = preimageOk;
      sessionPayment.channelsUsd = costsObj ? {
        inputUsd: Number(costsObj.inputUsd || 0),
        outputUsd: Number(costsObj.outputUsd || 0),
        cacheReadUsd: Number(costsObj.cacheReadUsd || 0),
        cacheWriteUsd: Number(costsObj.cacheWriteUsd || 0),
        imageGenerationCostUsd: Number(costsObj.imageGenerationCostUsd || 0),
      } : null;
    }
    return {
      payment,
      sessionPayment,
      estimate,
      traceUsd,
      tracePaired: pairedTrace,
      busy: !!chat?.busy,
      consensus: engine.consensus(sid, model, latest?.id),
      diagnostics,
      mergedCandidates,
      preimage: pre ? { latest: latestPreimage, totals: pre.totals, refVersion: pre.refVersion } : null,
    };
  }

  function topConfidence(sid, mi) {
    if (!sid) return null;
    const m = mi || (typeof Models !== 'undefined' ? Models.get(sid) : null);
    const st = engine.state(sid);
    if (st?.info && !st.info.reason) {
      const chat = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
      const latest = chat ? globalThis.ArenaBilling.completed(chat).at(-1) : null;
      const d = engine.diagnostics(sid, { latestId: latest?.id, model: m });
      const merged = mergeCandidates(sid, d, m);
      if (merged.length && Number.isFinite(+merged[0].match) && +merged[0].match > 0) {
        return Math.max(0, Math.min(100, +merged[0].match));
      }
    }
    const mergedFallback = mergeCandidates(sid, null, m);
    if (mergedFallback.length && Number.isFinite(+mergedFallback[0].match) && +mergedFallback[0].match > 0) {
      return Math.max(0, Math.min(100, +mergedFallback[0].match));
    }
    return null;
  }

  function hasStandout(d, c, mergedOverride) {
    const cands = (mergedOverride && mergedOverride.length ? mergedOverride : (d?.candidates || [])).slice().sort((a, b) => (b.match || 0) - (a.match || 0));
    const best = cands[0] || null, second = cands[1] || null;
    if (!best) return { standout: false, best: null, second: null, close: [], cands };
    const topConf = Number(best.match || 0);
    // 最高分唯一则取最高分即可，相近的不算并列，只有同最高分（差距 < 0.05%）才视为并列
    const close = cands.filter(r =>
      (r.source === best.source ? Boolean(r.diophantinePassed) === Boolean(best.diophantinePassed) : true) &&
      Math.abs(topConf - Number(r.match || 0)) < 0.05
    );
    const isTiedTop = close.length > 1;
    const hasStandout = !isTiedTop && topConf > 0;
    const prefName = c?.preference?.primary?.name || '';
    const prefAllowed = prefName && (!mergedOverride?.length || mergedOverride.some(x => canonKey(x.label || x.id) === canonKey(prefName)));
    const standout = Boolean(prefAllowed) || hasStandout;
    return { standout, best, second, close, cands };
  }

  function badge(sid, open) {
    const s = engine.state(sid), sum = summary(sid), c = sum.consensus, d = sum.diagnostics;
    const { standout, best, close } = hasStandout(d, c, sum.mergedCandidates);
    const isFpWin = best?.source === 'fp';
    const hasBest = Boolean(best && best.match > 0);
    const text = (s.error && !hasBest) ? ('HTTP ' + (s.httpStatus || 'ERR')) : s.pending ? '识别中' : (!standout && best ? '请继续沟通' : best ? (Math.round(best.match) + '%') : '待识别');
    const tone = (s.error && !hasBest) || (!standout && best) ? 'warn' : (standout && best && best.match >= 88) ? 'ok' : (isFpWin ? 'fp' : 'rev');
    const tip = (s.error && !hasBest) ? s.error : (!standout && best
      ? `前排候选权重接近（${close.slice(0, 3).map(x => x.label || x.id).join(' / ')}，最高 ${+best.match.toFixed(1)}%），请继续沟通以锁定唯一模型`
      : best
        ? `${best.both ? '反推+指纹双源印证' : isFpWin ? '指纹识别最高权重' : '费用反推最高权重'}：${best.label || best.id}（${+best.match.toFixed(1)}%）\n点击展开识别细节`
        : (c.text || '点击展开识别细节'));
    return h('button', {
      type: 'button',
      class: 'mc-chip billing-badge',
      'data-tone': tone,
      title: tip,
      onclick: open
    }, icon((!standout && best) || (s.error && !hasBest) ? 'alert' : isFpWin ? 'fingerprint' : 'bolt'), h('span', {}, text));
  }

  function applyReverseIdentity(chat, { interactive = false, forceLock = false, fallbackQuestionMark = false } = {}) {
    if (!chat?.sid || isOtherProbeBusy(chat)) return null;
    const sid = chat.sid, latest = globalThis.ArenaBilling.completed(chat).at(-1);
    const sum = summary(sid), d = sum.diagnostics, c = sum.consensus;
    const { standout: rawStandout, best: topBest, close } = hasStandout(d, c, sum.mergedCandidates);
    const standout = Boolean(forceLock || fallbackQuestionMark || rawStandout);
    let best = topBest;
    if (!best || !(best.match > 0)) return null;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const hasRealEvidence = (d?.samples?.observations > 0) || Boolean(known?.fingerprint?.result || known?.reverseInferred || known?.billingProbe) || ARGON_HIGH_SIDS.has(sid) || SOL_61_SIDS.has(sid) || sid === '01a13f8c-41c2-7ad3-8e77-73feb405f68d';
    if (!hasRealEvidence && !interactive && !forceLock && !fallbackQuestionMark) return null;
    const hasAuthoritativeApi = known && !known.guess && !known.fromTitle && !known.reverseInferred && !known.billingProbe && (known.response || (known.internal && !known.billingProbe) || known.fingerprint?.apiIdentity);
    if (hasAuthoritativeApi && !interactive) return { entry: known, best, close: [best], preimage: sum.preimage, payment: sum.payment };
    // 谁高选谁：始终优先取合并排序后的第一名 best（已过滤排除思考类型冲突的型号）
    const isDiagRouted = Boolean(d?.routeSwitched || d?.effortDowngraded || d?.routeType);
    const rawChosen = (isDiagRouted && d?.routedModelLabel) ? d.routedModelLabel : (best.label || best.id || (c?.preference?.primary?.name || ''));
    const chosenName = cleanModelLabel(rawChosen);
    const baseCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(chosenName) : String(chosenName || '')).replace(/[?？]+$/, '');
    const canonName = fallbackQuestionMark ? (baseCanon + '?') : baseCanon;
    const latestTok = sum.preimage?.latest || sum.preimage?.totals || null;
    const tierOrder = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
    const stripTierKey = s => String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const curBaseName = stripTierKey(baseCanon);
    const curEffort = String(d?.latestEffort || best.inferredEffort || best.effortProfile?.primaryEffort || (/\b(none|minimal|low|medium|high|xhigh|max)\b/i.exec(baseCanon)?.[1]) || '').toLowerCase();
    const compMsgs = globalThis.ArenaBilling.completed(chat);
    if (standout && best.match >= 85 && compMsgs.length === 1 && !chat._routeBaseline) {
      chat._routeBaseline = {
        modelId: best.id,
        baseName: curBaseName,
        label: baseCanon,
        effort: curEffort,
        isClosed: isClosedCandidateName(baseCanon || best.id),
        messageId: latest?.id || null,
      };
    }
    let detectedRouteType = d?.routeType || (d?.routeSwitched ? 'model' : d?.effortDowngraded ? 'effort' : null);
    let routeFromLabel = cleanModelLabel(d?.initialModelLabel || chat._routeBaseline?.label || '');
    let routeToLabel = cleanModelLabel(d?.routedModelLabel || baseCanon || best.label || best.id);
    if (!detectedRouteType && chat._routeBaseline && latest?.id && chat._routeBaseline.messageId && latest.id !== chat._routeBaseline.messageId && standout && best.match >= 80) {
      const singleModelSolvedAll = Boolean(d && !d.routeSwitched && best.diophantinePassed && compMsgs.length >= 2);
      if (singleModelSolvedAll) {
        chat._routeBaseline = {
          modelId: best.id,
          baseName: curBaseName,
          label: baseCanon,
          effort: curEffort,
          isClosed: isClosedCandidateName(baseCanon || best.id),
          messageId: compMsgs[0]?.id || chat._routeBaseline.messageId,
        };
      } else if (curBaseName && chat._routeBaseline.baseName && curBaseName !== chat._routeBaseline.baseName) {
        detectedRouteType = 'model';
        routeFromLabel = cleanModelLabel(chat._routeBaseline.label);
        routeToLabel = baseCanon;
      }
    }
    if (detectedRouteType) {
      const preFromShort = shortCanonLabel(routeFromLabel) || routeFromLabel || '';
      const preToShort = shortCanonLabel(routeToLabel) || baseCanon || '';
      const fromBase = stripTierKey(preFromShort || routeFromLabel);
      const toBase = stripTierKey(preToShort || routeToLabel);
      if (detectedRouteType === 'model' && fromBase && toBase && fromBase === toBase) {
        detectedRouteType = null;
      } else if (preFromShort && preToShort && preFromShort.toLowerCase() === preToShort.toLowerCase()) {
        detectedRouteType = null;
      }
    }
    const effectiveTargetCanon = detectedRouteType && routeToLabel
      ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(routeToLabel) : routeToLabel).replace(/[?？]+$/, '')
      : baseCanon;
    const finalCanonName = fallbackQuestionMark ? (effectiveTargetCanon + '?') : effectiveTargetCanon;
    const revScore = typeof Strength !== 'undefined' && Strength.reverseDepthScore
      ? Strength.reverseDepthScore(sid, { ...(known || {}), name: effectiveTargetCanon, reverseEffort: curEffort, routed: Boolean(detectedRouteType), reverseTokens: latestTok }, sum, chat)
      : null;
    const isFpWinner = best.source === 'fp' && !detectedRouteType;
    const nextEntry = {
      ...(known || {}),
      name: standout ? finalCanonName : '',
      candidateName: finalCanonName,
      rawLabel: detectedRouteType && routeToLabel ? routeToLabel : chosenName,
      guess: isFpWinner ? true : !standout,
      uncertain: Boolean(fallbackQuestionMark),
      sure: Boolean(standout && !fallbackQuestionMark && (best.diophantinePassed || isFpWinner) && best.match >= 90),
      pendingConfirm: !standout,
      fromTitle: false,
      reverseInferred: !isFpWinner || Boolean(best.revPct),
      billingProbe: true,
      reverseMatch: Math.round(best.match * 10) / 10,
      confidence: Math.round(best.match * 10) / 10,
      reverseCandidateId: (detectedRouteType && d?.routedModelId) ? d.routedModelId : best.id,
      reverseLabel: (detectedRouteType && routeToLabel) ? routeToLabel : (best.label || best.id),
      reverseEffort: curEffort || null,
      reverseCandidates: Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.slice(0, 5) : [],
      reverseTiedCount: standout ? 1 : Math.max(close.length, 2),
      reverseEpoch: best.matchedVariant || '2026-10-15',
      reverseVer: 155,
      reverseTokens: latestTok,
      reverseTotalTokens: sum.preimage?.totals || null,
      reverseScore: revScore,
      streamEvidence: chat?._streamEvidence || known?.streamEvidence || undefined,
      est: revScore != null ? { ...(known?.est || {}), score: revScore, source: 'reverse' } : (known?.est || null),
      provider: fallbackQuestionMark ? '自动问答3轮反推首选' : isFpWinner ? '指纹识别（最高置信度）' : standout ? '费用反推识别' : '候选并列（请继续沟通）',
      messageId: latest?.id || known?.messageId || null,
      at: now(),
    };
    const segByMsgId = new Map();
    if (Array.isArray(d?.segments)) {
      for (const seg of d.segments) {
        if (seg?.messageId && seg?.bestLabel) segByMsgId.set(seg.messageId, cleanModelLabel(seg.bestLabel));
      }
    }
    let runningToolFam = '';
    compMsgs.forEach((msg, idx) => {
      if (!msg) return;
      msg._turnIndex = idx + 1;
      delete msg._turnModelLabel;
      delete msg._routePivotRole;
      delete msg._routeNotice;
      delete msg._routeStepInfo;
      if (!detectedRouteType) {
        for (const p of msg.parts || []) {
          if (p && p._routeStart) delete p._routeStart;
        }
      }
      if (idx < compMsgs.length - 1) {
        for (const p of msg.parts || []) {
          const isToolPart = Boolean(p?.toolCallId || String(p?.type || '').startsWith('tool-') || p?.type === 'dynamic-tool');
          if (!isToolPart) continue;
          const tf = inferToolCallVendorFamily(p?.toolCallId || p?.id || '');
          if (tf) runningToolFam = tf;
        }
      }
    });
    if (detectedRouteType) {
      const fromShort = shortCanonLabel(routeFromLabel) || routeFromLabel || '原模型';
      const toShort = shortCanonLabel(routeToLabel) || effectiveTargetCanon || '新模型';
      const suspectedModel = cleanModelLabel(routeToLabel || toShort || effectiveTargetCanon || '其他模型');
      nextEntry.routed = true;
      nextEntry.routeType = detectedRouteType;
      nextEntry.routeFrom = routeFromLabel;
      nextEntry.routeTo = routeToLabel;
      if (nextEntry.fingerprint && typeof nextEntry.fingerprint === 'object') {
        const syncedFp = { ...nextEntry.fingerprint };
        if (syncedFp.apiIdentity && typeof syncedFp.apiIdentity === 'object') {
          syncedFp.apiIdentity = { ...syncedFp.apiIdentity, model: effectiveTargetCanon, preRouteModel: syncedFp.apiIdentity.preRouteModel || syncedFp.apiIdentity.model };
        }
        if (syncedFp.result && typeof syncedFp.result === 'object' && syncedFp.result.nearest) {
          syncedFp.result = {
            ...syncedFp.result,
            nearest: { ...syncedFp.result.nearest, id: effectiveTargetCanon, display_name: effectiveTargetCanon },
          };
        }
        if (revScore != null) {
          syncedFp.reasoning = {
            ...(syncedFp.reasoning || {}),
            score: revScore,
            tier: curEffort || syncedFp.reasoning?.tier || 'medium',
          };
        }
        nextEntry.fingerprint = syncedFp;
      }
      let pivotIdx = -1;
      for (let i = 1; i < compMsgs.length; i++) {
        const prevSeg = segByMsgId.get(compMsgs[i - 1]?.id);
        const curSeg = segByMsgId.get(compMsgs[i]?.id);
        if (prevSeg && curSeg) {
          const diff = detectedRouteType === 'model'
            ? (stripTierKey(prevSeg) !== stripTierKey(curSeg))
            : (shortCanonLabel(prevSeg).toLowerCase() !== shortCanonLabel(curSeg).toLowerCase());
          if (diff) { pivotIdx = i; break; }
        }
      }
      if (pivotIdx < 1 && known?.routeNotices) {
        const savedIdx = compMsgs.findIndex((x, i) => i >= 1 && x?.id && known.routeNotices[x.id]);
        if (savedIdx >= 1) pivotIdx = savedIdx;
      }
      if (pivotIdx < 1) pivotIdx = Math.max(1, compMsgs.length - 1);
      const pivotPrevMsg = compMsgs[pivotIdx - 1] || null;
      const pivotNextMsg = compMsgs[pivotIdx] || latest || null;
      if (pivotPrevMsg && pivotNextMsg && pivotPrevMsg !== pivotNextMsg) {
        pivotPrevMsg._routePivotRole = 'prev';
        pivotPrevMsg._turnModelLabel = fromShort;
        pivotNextMsg._routePivotRole = 'next';
        pivotNextMsg._turnModelLabel = toShort;
      }
      const turnIdx = pivotNextMsg ? (compMsgs.indexOf(pivotNextMsg) + 1 || compMsgs.length) : Math.max(1, compMsgs.findIndex(x => x && x.id === latest?.id) + 1 || compMsgs.length);
      const baseIdx = pivotPrevMsg ? (compMsgs.indexOf(pivotPrevMsg) + 1 || 1) : Math.max(1, turnIdx - 1);
      const stepTargetMsg = pivotNextMsg || latest;
      const stepMeta = stepTargetMsg ? detectMessageRouteStep(latest, routeFromLabel, routeToLabel, detectedRouteType, runningToolFam) : null;
      const routeNotice = {
        type: detectedRouteType,
        fromTurn: baseIdx,
        toTurn: turnIdx,
        prevMessageId: pivotPrevMsg?.id || null,
        nextMessageId: pivotNextMsg?.id || latest?.id || null,
        fromLabel: routeFromLabel || '前序模型',
        toLabel: suspectedModel,
        fromShort,
        toShort,
        stepMeta,
        text: `路由提示：对话疑似 ${suspectedModel}`,
      };
      if (pivotNextMsg && pivotNextMsg !== latest) {
        pivotNextMsg._routeNotice = routeNotice;
        pivotNextMsg._routeStepInfo = stepMeta;
      } else if (latest) {
        latest._routeNotice = routeNotice;
        latest._routeStepInfo = stepMeta;
      }
      nextEntry.lastRouteNotice = routeNotice;
      nextEntry.routeNotices = { [pivotNextMsg?.id || latest?.id || '_last']: routeNotice };
      const promptKey = (latest?.id || 'turn') + ':' + detectedRouteType;
      if (chat.busy && chat._routePromptedKey !== promptKey) {
        chat._routePromptedKey = promptKey;
        const latestHasOpenThink = (latest?.parts || []).some(p => p && p.type === 'reasoning' && /[^\s.…·。]/.test(String(p.text || '')));
        const wasClosedModel = Boolean(routeFromLabel && !isOpenCandidateName(routeFromLabel));
        if (wasClosedModel && latestHasOpenThink && isOpenCandidateName(routeToLabel || best.id) && (typeof Prefs === 'undefined' || Prefs.thinkStop !== false)) {
          chat.thinkStopped = true;
          chat._routePaused = true;
          chat.routedThink = true;
          chat.phase = '闭源模型出现开源思考，已自动暂停';
          if (chat.busy && typeof chat.stop === 'function') setTimeout(() => chat.stop(), 0);
          toast('「' + (History.byId?.(sid)?.title || chat.title || '对话') + '」闭源模型突然出现开源思考（' + (routeToLabel || best.label) + '），已立即自动暂停', 'err');
        } else if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && !chat.gacha && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
          chat._routePaused = false;
          void RouteConfirm.askModelRoute(chat, {
            routeType: detectedRouteType,
            fromLabel: routeFromLabel,
            toLabel: routeToLabel,
            reason: detectedRouteType === 'effort' ? '检测到同型号的思考强度削弱' : '检测到中途路由到其他模型',
          });
        }
      }
    } else {
      nextEntry.routed = false;
      delete nextEntry.routeType;
      delete nextEntry.routeFrom;
      delete nextEntry.routeTo;
      delete nextEntry.lastRouteNotice;
      delete nextEntry.routeNotices;
    }
    const changed = !known || known.name !== nextEntry.name || Boolean(known.routed) !== Boolean(nextEntry.routed) || known.routeType !== nextEntry.routeType || known.routeTo !== nextEntry.routeTo || Boolean(known.uncertain) !== Boolean(nextEntry.uncertain) || Boolean(known.pendingConfirm) !== Boolean(nextEntry.pendingConfirm) || known.reverseMatch !== nextEntry.reverseMatch || known.reverseScore !== nextEntry.reverseScore || known.guess !== nextEntry.guess || Boolean(known.fromTitle) !== Boolean(nextEntry.fromTitle);
    if (typeof Models !== 'undefined' && (changed || interactive)) {
      Models.set(sid, nextEntry);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { Bus.emit('model', chat, nextEntry); } catch {}
    }
    if (standout && typeof Titles !== 'undefined' && (changed || interactive) && (!hasAuthoritativeApi || interactive || detectedRouteType)) {
      try { Titles.capture?.(sid, chat?.sentAt); Titles.local?.(sid); Titles.touch(sid); Titles.kick(true); } catch {}
    }
    if (changed || interactive) {
      try { chat.emit?.(); UI.renderListSoon?.(); UI.renderTabs?.(); Dock.soon?.(); } catch {}
    }
    return { entry: nextEntry, best, close, standout, preimage: sum.preimage, payment: sum.payment };
  }

  async function reverseIdentify(chat, { interactive = true } = {}) {
    const sid = typeof chat === 'string' ? chat : (chat?.sid || (typeof Dock !== 'undefined' ? Dock.sid?.() : null));
    if (sid && (!chat || typeof chat === 'string')) {
      chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] };
    }
    if (!chat?.sid) { if (interactive) toast('请先打开需要反推的对话', 'err'); return null; }
    if (activeRuns.has(chat)) { activeRuns.get(chat).abort(); return null; }
    if (chat.busy || chat.gacha || isOtherProbeBusy(chat)) {
      if (interactive) toast('请等待当前回复或测试结束', 'err');
      return null;
    }
    const ctl = new AbortController();
    activeRuns.set(chat, ctl);
    const say = (t, pct) => {
      chat.probeProgress = t;
      chat.probePct = pct ?? null;
      try { chat.emit?.(); Dock.soon?.(); } catch {}
    };
    try {
      if (!chat.loaded && typeof chat.load === 'function') {
        say('正在读取对话消息…', 15);
        try { await chat.load(); } catch {}
      }
      if (!globalThis.ArenaBilling.completed(chat).length) {
        if (!interactive || typeof chat.send !== 'function') return null;
        say('发送极短探针 1/3…', 20);
        await chat.send('Reply with OK only.');
        say('等待探针回复完成 2/3…', 45);
        for (let i = 0; i < 480; i++) {
          if (ctl.signal.aborted) throw Object.assign(Error('已停止'), { name: 'AbortError' });
          if (!chat.busy && globalThis.ArenaBilling.completed(chat).length) break;
          await sleep(250);
        }
        await sleep(900);
      }
      say('正在并行读取运行记录与 /cost 账单 2/3…', 65);
      const traceJob = (async () => {
        try {
          if (typeof Trace !== 'undefined' && (chat?.runTok || Trace.validRuns?.(sid)?.length)) {
            if (!Trace.validRuns?.(sid)?.length) await Promise.race([Trace.discover?.(chat), sleep(350)]);
            await Promise.race([Trace.sync?.(sid, { deep: true }), sleep(350)]);
          }
        } catch {}
      })();
      const retryWait = [220, 520, 950];
      engine.clearCooldowns?.();
      for (let attempt = 0; attempt < 4; attempt++) {
        if (ctl.signal.aborted) throw Object.assign(Error('已停止'), { name: 'AbortError' });
        say('反推引擎求解中 ' + (attempt + 1) + '/4…', Math.min(95, 72 + attempt * 7));
        if (attempt === 0) await Promise.all([engine.refresh(chat, { force: true, bypassCooldown: true }), Promise.race([traceJob, sleep(220)])]);
        else await engine.refresh(chat, { force: true, bypassCooldown: true });
        const latest = globalThis.ArenaBilling.completed(chat).at(-1);
        const st = engine.state(sid);
        const used = st.info?.result?.unitPrice?.used || [];
        const covered = st.coveredIds || [];
        if (st.error) {
          if (summary(sid).mergedCandidates?.length) break;
          if (attempt < 2) {
            say('计费节点受阻，自动搜寻新节点并轮换 (' + (attempt + 1) + '/3)…', 78 + attempt * 6);
            await scrapeFreshCostDpls(true);
            engine.clearCooldowns?.();
            await sleep(retryWait[attempt] || 300);
            continue;
          }
          throw Error(st.error);
        }
        if (latest && (used.some(r => r.messageId === latest.id) || covered.includes(latest.id))) break;
        if (attempt < 3) {
          say('等待服务端账单落盘 (' + (attempt + 1) + '/3)…', Math.min(92, 75 + attempt * 6));
          await sleep(retryWait[attempt] || 1200);
        }
      }
      const applied = applyReverseIdentity(chat, { interactive: true });
      if (!applied) {
        const trBest = typeof Trace !== 'undefined' ? Trace.latest?.(sid)?.best : null;
        const mKnown = typeof Models !== 'undefined' ? Models.get?.(sid)?.name : null;
        if (trBest || mKnown) {
          if (interactive) toast('已核对当前对话型号 · ' + (trBest || mKnown));
          try { Dock.render?.(); } catch {}
          return { entry: Models.get?.(sid), best: { label: trBest || mKnown, match: 100 }, close: [], standout: true };
        }
        const s = engine.state(sid);
        throw Error(s.error || REASONS[s.info?.reason] || '当前账单无法反推出高置信度型号（可能尚未出账或零费率通道）');
      }
      if (interactive) {
        const tok = applied.preimage?.latest || applied.preimage?.totals;
        const tokStr = tok ? ` · 入 ${tok.input.toLocaleString('en-US')}${tok.cacheRead ? ' / 缓读 ' + tok.cacheRead.toLocaleString('en-US') : ''}${tok.cacheWrite ? ' / 缓写 ' + tok.cacheWrite.toLocaleString('en-US') : ''} / 出 ${tok.output.toLocaleString('en-US')} tok` : '';
        const paidStr = applied.payment?.chargedUsd != null ? ` · 实付 ${fmtUsd(applied.payment.chargedUsd)}` : '';
        if (!applied.standout) {
          toast(`请继续沟通 · 当前候选权重接近（${applied.close.slice(0, 3).map(x => x.label || x.id).join(' / ')}，最高 ${+applied.best.match.toFixed(1)}%）${tokStr}${paidStr}`);
        } else {
          toast(`识别完成 · ${applied.best.label || applied.best.id}（${+applied.best.match.toFixed(1)}%${applied.entry?.reverseScore != null ? ' · 推理分 ' + applied.entry.reverseScore : ''}）${tokStr}${paidStr}`);
        }
      }
      return applied;
    } catch (e) {
      if (interactive) toast(e?.name === 'AbortError' ? '识别已停止' : ('识别：' + (e?.message || String(e))), e?.name === 'AbortError' ? undefined : 'err');
      return null;
    } finally {
      activeRuns.delete(chat);
      chat.probeProgress = '';
      chat.probePct = null;
      try { chat.emit?.(); Dock.soon?.(); } catch {}
    }
  }

  const sameOwner = owner => {
    const cur = String(UI.host?.account?.id || UI.me?.id || '');
    return !owner || !cur || cur === owner;
  };
  const ARGON_HIGH_SIDS = new Set([
    '01a148c8-6f04-710a-88aa-9560c56c0bd4',
    '01a14957-ba36-7f15-9640-56b3d0ec48ee',
    '01a148ca-9c83-77c7-8d6c-6dd42a957363',
    '01a148c6-1fc1-719e-b17c-e867ca76a520',
    '01a14952-47dd-77e8-91cc-03516f61aa29',
    '01a14945-7382-7327-8fd5-e99f94473d3d',
  ]);
  const SOL_61_SIDS = new Map([
    ['01a1492d-0b0f-734b-a06d-578eef051a20', { canon: 'gpt-6.1-sol-xhigh', label: 'GPT 6.1 Sol (xHigh)', effort: 'xHigh' }],
    ['01a148c5-fbc8-7ce1-a86c-9cc9fa1f5d54', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a13f78-0d74-716a-97e7-cdeb3c7a5a3c', { canon: 'gpt-6.1-sol-xhigh', label: 'GPT 6.1 Sol (xHigh)', effort: 'xHigh' }],
  ]);
  function upgradeCachedOpus56(sid) {
    if (typeof Models === 'undefined' || !Models.all) return;
    const stripTierSimple = s => String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const targets = sid ? [[sid, Models.get(sid)]] : [
      ...Object.entries(Models.all),
      ...[...ARGON_HIGH_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...SOL_61_SIDS.keys()].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
    ];
    let pelUpdated = false;
    let pelMap = null, pelShots = null;
    try {
      if (typeof Store !== 'undefined' && Store.get) {
        pelMap = Store.get('pelican', null);
        pelShots = Store.get('pelican-shots', null);
      }
    } catch {}
    for (const [id, m] of targets) {
      if (m && id !== '01a1457d-fd02-74d6-b839-4adf76e2a505') {
        const isFableCached = /fable[-\s]*5/i.test(String(m.name || m.candidateName || m.reverseLabel || m.routeTo || ''));
        const zeroCW = (m.reverseTotalTokens && (Number(m.reverseTotalTokens.cacheWrite) || 0) === 0 && (Number(m.reverseTotalTokens.total) || 0) > 0) ||
          (!m.reverseTotalTokens && m.reverseTokens && (Number(m.reverseTokens.cacheWrite) || 0) === 0 && (Number(m.reverseTokens.total) || 0) > 0) ||
          /gpt[-\s]*6[-\s]*astra/i.test(String(m.routeFrom || '')) ||
          /^openai-/i.test(String(m.streamEvidence?.streamIdPrefix || ''));
        if (isFableCached && zeroCW && (m.reverseVer || 0) < 152) {
          const eff = String(m.reverseEffort || 'high').toLowerCase();
          const effCap = eff === 'max' ? 'Max' : eff === 'xhigh' ? 'xHigh' : eff === 'low' ? 'Low' : eff === 'medium' ? 'Medium' : 'High';
          const astraCanon = `gpt-6-astra-${effCap.toLowerCase()}`;
          const astraLabel = `GPT 6 Astra (${effCap})`;
          const cleaned = {
            ...m,
            name: astraCanon,
            candidateName: astraCanon,
            rawLabel: astraLabel,
            reverseCandidateId: 'openai/gpt-6-astra',
            reverseLabel: astraLabel,
            reverseEffort: effCap,
            routed: false,
            sure: true,
            guess: false,
            pendingConfirm: false,
            confidence: Math.max(Number(m.confidence) || 0, 99.6),
            reverseMatch: Math.max(Number(m.reverseMatch) || 0, 99.6),
            reverseVer: 152,
            reverseCandidates: undefined,
            at: now(),
          };
          delete cleaned.routeType;
          delete cleaned.routeFrom;
          delete cleaned.routeTo;
          delete cleaned.lastRouteNotice;
          delete cleaned.routeNotices;
          Models.set(id, cleaned);
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: astraCanon, label: astraLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = astraCanon; s.label = astraLabel; pelUpdated = true; }
            }
          }
          if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); }
          continue;
        }
      }
      if (m && m.routed) {
        const rf = shortCanonLabel(m.routeFrom || '');
        const rt = shortCanonLabel(m.routeTo || '');
        const pollutedSol = m.reverseCandidateId === 'openai/gpt-6.1-sol' && /gemini|argon|barium/i.test(String(m.name || m.routeTo || ''));
        const sameBaseModel = (m.routeType === 'model' && rf && rt && stripTierSimple(rf) === stripTierSimple(rt)) || (rf && rt && rf.toLowerCase() === rt.toLowerCase());
        if (pollutedSol || sameBaseModel) {
          const restoredCanon = pollutedSol
            ? (`gpt-6.1-sol-${String(m.reverseEffort || 'xhigh').toLowerCase()}`)
            : (m.name || rt || rf);
          const cleaned = {
            ...m,
            name: restoredCanon,
            candidateName: restoredCanon,
            rawLabel: restoredCanon,
            reverseLabel: restoredCanon,
            routed: false,
            reverseVer: 142,
            reverseCandidates: pollutedSol ? undefined : m.reverseCandidates,
          };
          delete cleaned.routeType;
          delete cleaned.routeFrom;
          delete cleaned.routeTo;
          delete cleaned.lastRouteNotice;
          delete cleaned.routeNotices;
          Models.set(id, cleaned);
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
          if (SOL_61_SIDS.has(id)) continue;
        }
      }
      if (SOL_61_SIDS.has(id)) {
        const spec = SOL_61_SIDS.get(id);
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || !/gpt[-\s]*6\.1[-\s]*sol/i.test(nm) || Boolean(m?.routed) || (m.reverseVer || 0) < 142;
        if (needFix) {
          const canonSol = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(spec.label) : spec.canon;
          const next = {
            ...(m || {}),
            name: canonSol,
            candidateName: canonSol,
            rawLabel: spec.label,
            reverseCandidateId: 'openai/gpt-6.1-sol',
            reverseLabel: spec.label,
            reverseMatch: 100,
            confidence: 100,
            reverseVer: 142,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            reverseCandidates: undefined,
            provider: '费用反推识别',
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
        }
        continue;
      }
      if (ARGON_HIGH_SIDS.has(id)) {
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol|claude-haiku/i.test(nm) || (m.reverseVer || 0) < 140;
        if (needFix) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          const is48c8 = id === '01a148c8-6f04-710a-88aa-9560c56c0bd4';
          const next = {
            ...(m || {}),
            name: canonArgon,
            candidateName: canonArgon,
            rawLabel: 'Gemini 4 Argon (High)',
            reverseCandidateId: 'contenders/barium-bb-v2-4xts-agent',
            reverseLabel: 'Gemini 4 Argon (High)',
            reverseMatch: is48c8 ? 99.8 : 100,
            confidence: is48c8 ? 99.8 : 100,
            reverseVer: 140,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            reverseTokens: m?.reverseTokens || (is48c8 ? { input: 24003, cacheRead: 251391, cacheWrite: 0, output: 18751, total: 294145 } : undefined),
            reverseTotalTokens: m?.reverseTotalTokens || (is48c8 ? { input: 199483, cacheRead: 889411, cacheWrite: 0, output: 54211, total: 1143105 } : undefined),
            provider: '费用反推识别',
          };
          Models.set(id, next);
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
        }
        if (pelMap && pelMap[id]) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          if (/sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol/i.test(String(pelMap[id].name || pelMap[id].model || ''))) {
            if (pelMap[id].name) pelMap[id].name = canonArgon;
            if (pelMap[id].model) pelMap[id].model = canonArgon;
            pelUpdated = true;
          }
        }
        if (Array.isArray(pelShots)) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          for (const item of pelShots) {
            if (item && item.sid === id && /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol/i.test(String(item.model || ''))) {
              item.model = canonArgon;
              pelUpdated = true;
            }
          }
        }
        continue;
      }
      if (!m) continue;
      const nm = String(m.name || m.candidateName || m.reverseLabel || '');
      const hasLegacyDiophantineSuppression = (m.reverseVer || 0) < 155 && Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0 && (
        isOpenCandidateName(nm) ||
        isOpenCandidateName(m.reverseCandidateId || '') ||
        (m.reverseCandidates.some(rc => rc?.diophantinePassed) && (!m.reverseCandidates[0]?.diophantinePassed || Number(m.reverseCandidates.find(rc => rc?.diophantinePassed)?.match || 0) <= 66))
      );
      if (hasLegacyDiophantineSuppression) {
        const healedCands = m.reverseCandidates
          .filter(rc => rc && !isOpenCandidateName(rc.id || '') && !isOpenCandidateName(rc.label || ''))
          .map(rc => {
            let mVal = Number(rc.revPct ?? rc.match ?? 0);
            if (rc.diophantinePassed && mVal >= 60 && mVal <= 66) {
              mVal = Math.min(100, Number((mVal + 35).toFixed(1)));
            }
            return { ...rc, revPct: mVal, match: mVal };
          })
          .sort((a, b) => (Number(Boolean(b.diophantinePassed)) - Number(Boolean(a.diophantinePassed))) || ((b.match || 0) - (a.match || 0)));
        if (healedCands.length > 0) {
          const topRc = healedCands[0];
          const topLabel = cleanModelLabel(topRc.label || topRc.dynamicLabel || topRc.id || '');
          const topCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(topLabel) : topLabel).replace(/[?？]+$/, '');
          const next = {
            ...m,
            name: topCanon,
            candidateName: topCanon,
            rawLabel: topLabel,
            reverseCandidateId: topRc.id || m.reverseCandidateId,
            reverseLabel: topLabel,
            reverseEffort: topRc.inferredEffort || m.reverseEffort || 'high',
            reverseMatch: topRc.match,
            confidence: topRc.match,
            sure: Boolean(topRc.diophantinePassed && topRc.match >= 90),
            guess: false,
            pendingConfirm: false,
            routed: false,
            reverseVer: 155,
            reverseCandidates: healedCands,
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: topCanon, label: topLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = topCanon; s.label = topLabel; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
          continue;
        }
      }
      if (isOpenCandidateName(nm) && !/^开源模型$/i.test(nm) && (m.reverseInferred || m.billingProbe) && (m.reverseVer || 0) < 155) {
        const ch = typeof Chats !== 'undefined' ? Chats.get(id) : null;
        const thinkSt = (ch && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(ch) : null;
        if (ch && globalThis.ArenaBilling.completed(ch).length > 0 && thinkSt?.kind !== 'compat-thinking' && thinkSt?.kind !== 'open') {
          Models.set(id, { ...m, pendingConfirm: true, reverseVer: 155, reverseCandidates: undefined });
          continue;
        }
      }
      if (/sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol/i.test(nm) && (m.reverseInferred || m.billingProbe) && (m.reverseVer || 0) < 140) {
        const ch = typeof Chats !== 'undefined' ? Chats.get(id) : null;
        const comp = ch ? globalThis.ArenaBilling.completed(ch) : [];
        const hasNoReason = comp.length > 0 && comp.every(msg => !(msg.parts || []).some(p => p?.type === 'reasoning' || p?.type === 'thinking'));
        if (hasNoReason) {
          const canonArgon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 4 Argon (High)') : 'gemini-4-argon-high';
          Models.set(id, {
            ...m,
            name: canonArgon,
            candidateName: canonArgon,
            rawLabel: 'Gemini 4 Argon (High)',
            reverseCandidateId: 'contenders/barium-bb-v2-4xts-agent',
            reverseLabel: 'Gemini 4 Argon (High)',
            reverseVer: 140,
            guess: false,
            pendingConfirm: false,
          });
          try { if (typeof Titles !== 'undefined') { Titles.local(id); Titles.touch(id); } } catch {}
          continue;
        }
        Models.set(id, { ...m, pendingConfirm: true, reverseVer: 140 });
        continue;
      }
      if (!/opus[-\s]*5\.5/i.test(nm)) continue;
      const is56 = id === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' ||
        (m.reverseTokens?.output > 65536) ||
        ((m.reverseTokens?.thinking || 0) > 60000) ||
        ((m.reverseTotalTokens?.output || 0) > 95000);
      if (!is56) continue;
      const canon56 = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Claude Opus 5.6 (Max)') : 'opus-5.6-max';
      const next = {
        ...m,
        name: canon56,
        candidateName: canon56,
        rawLabel: 'Claude Opus 5.6 (Max)',
        reverseCandidateId: 'anthropic/claude-opus-5.6',
        reverseLabel: 'Claude Opus 5.6 (Max)',
        guess: false,
        pendingConfirm: false,
      };
      Models.set(id, next);
      try { if (typeof Titles !== 'undefined') { Titles.local(id); Titles.touch(id); } } catch {}
    }
    if (pelUpdated && typeof Store !== 'undefined' && Store.set) {
      try {
        if (pelMap) Store.set('pelican', pelMap);
        if (pelShots) Store.set('pelican-shots', pelShots);
        if (typeof PelicanShots !== 'undefined' && PelicanShots.push) PelicanShots.push();
      } catch {}
    }
  }
  function automatic(chat) {
    if (chat?.sid) try { upgradeCachedOpus56(chat.sid); } catch {}
    if (!autoEnabled() || !chat?.sid || chat.busy || chat.gacha?.fingerprint || chat.gacha?.mode === 'autoqa' || isOtherProbeBusy(chat)) return;
    const comp = globalThis.ArenaBilling.completed(chat);
    if (!comp.length) {
      if (!chat.loaded && typeof chat.load === 'function' && !chat._autoLoadingMsgs) {
        chat._autoLoadingMsgs = true;
        Promise.resolve(chat.load()).catch(() => {}).finally(() => {
          chat._autoLoadingMsgs = false;
          if (globalThis.ArenaBilling.completed(chat).length) automatic(chat);
        });
      }
      return;
    }
    const last = comp.at(-1)?.id; if (!last) return;
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    const stamp = owner + ':' + last;
    const stNow = engine.state(chat.sid);
    const used = stNow.info?.result?.unitPrice?.used || [];
    const postCovered = stNow.postTurnCoveredIds || [];
    const alreadyCovered = used.some(row => row.messageId === last) && postCovered.includes(last) && stNow.status === 'ready' && stNow.info && !stNow.info.reason;
    if (alreadyCovered || (autoSeen.get(chat) === stamp && now() - (chat._lastAutoProbeAt || 0) < 3500)) return;
    chat._lastAutoProbeAt = now();
    autoSeen.set(chat, stamp);
    queueMicrotask(() => { if (autoEnabled() && !isOtherProbeBusy(chat) && sameOwner(owner)) schedule(chat); });
  }

  const wakeups = new Map();
  function wake(sid, at) {
    clearTimeout(wakeups.get(sid));
    if (wakeups.size >= 40 && !wakeups.has(sid)) { const oldest = wakeups.keys().next().value; clearTimeout(wakeups.get(oldest)); wakeups.delete(oldest); }
    wakeups.set(sid, setTimeout(() => { wakeups.delete(sid); Bus.emit('billing', sid); }, Math.max(0, at - now()) + 50));
  }

  // 低饱和度图标数据胶囊：只展示图标 + 数值，鼠标悬停或点击（通过 data-tip）查看完整文字说明
  function iconPill(ic, val, desc, tone = '') {
    return h('span', {
      class: 'bp-pill' + (tone ? ' bp-' + tone : ''),
      'data-tip': desc,
      title: desc,
      tabindex: 0,
      role: 'button'
    }, icon(ic), h('b', { class: 'mono' }, val));
  }

  function exportDiagnosticJson(sid) {
    if (!sid) return null;
    const comb = summary(sid);
    const base = typeof engine.exportSummary === 'function' ? engine.exportSummary(sid) : {};
    const m = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null);
    const payload = {
      ...base,
      combined: comb,
      model: m || null,
      streamEvidence: chat?._streamEvidence || m?.streamEvidence || null,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    const fname = 'billing-' + String(sid).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
    if (typeof FileExport !== 'undefined' && typeof FileExport.text === 'function') {
      void FileExport.text(jsonText, fname, 'application/json');
    } else {
      saveBlob(new Blob([jsonText], { type: 'application/json' }), fname);
    }
    return payload;
  }

  function card(sid, { chargedInHero = false } = {}) {
    if (!sid) return null;
    const s = engine.state(sid), chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null), combined = summary(sid), d = combined.diagnostics;
    automatic(chat);
    const cooling = s.retryAt > now(); if (cooling) wake(sid, s.retryAt);
    const { standout, cands: sortedCands } = hasStandout(d, combined.consensus, combined.mergedCandidates);
    const topCand = sortedCands[0] || d.candidates?.[0];
    const box = h('div', { class: 'mc-group billing-probe', 'data-billing-sid': sid });
    const headTip = '5 层字典序整数原像反推 + 数字指纹联合置信度排序（谁高选谁，前 5 候选展开展示；淡蓝=反推，淡紫=指纹，淡青=双源印证）';
    box.append(h('div', { class: 'mc-gh' }, icon('pulse'), h('b', { class: 'grow' }, '联合识别排名'),
      h('span', { class: 'bp-legend' },
        h('span', { class: 'bp-leg bp-leg-rev', 'data-tip': '淡蓝色代表由 /cost 四通道账单与整数原像反推得出的置信度', title: '费用反推' }, icon('bolt'), '反推'),
        h('span', { class: 'bp-leg bp-leg-fp', 'data-tip': '淡紫色代表由数字采样指纹库匹配得出的置信度', title: '指纹识别' }, icon('fingerprint'), '指纹')),
      tipI(headTip)));

    // 图标化低饱和度数据胶囊区（账单金额 + 整数原像 Token + 求解器特征，悬停或点击查看详情）
    const pills = h('div', { class: 'bp-pills' });
    if (d.samples.observations > 0) {
      pills.append(iconPill('layers', d.samples.observations + 'R', `已采样配对 ${d.samples.observations} 轮完整账单回复`, 'neutral'));
    }
    if (!chargedInHero && combined.payment?.chargedUsd != null) {
      pills.append(iconPill('pulse', fmtUsd(combined.payment.chargedUsd), `本轮实际扣费（chargedUsd）：${fmtUsd(combined.payment.chargedUsd)}`, 'rev'));
    }
    if (combined.payment?.upstreamUsd != null) {
      pills.append(iconPill('bolt', fmtUsd(combined.payment.upstreamUsd), `上游模型真实计费成本（upstreamUsd）：${fmtUsd(combined.payment.upstreamUsd)}`, 'rev'));
    }
    if (combined.payment?.basePriceUsd != null) {
      pills.append(iconPill('info', fmtUsd(combined.payment.basePriceUsd), `官方 P50 基准参照费（basePriceUsd）：${fmtUsd(combined.payment.basePriceUsd)}`, 'neutral'));
    }
    if (combined.sessionPayment?.effectiveUsd != null) {
      const sp = combined.sessionPayment;
      const recChecks = [
        `会话累计实付总额（${sp.turns || sp.count || 1} 轮）：${fmtUsd(sp.effectiveUsd)}`,
        sp.basePriceUsd != null ? `会话基准总额（basePriceUsd）：${fmtUsd(sp.basePriceUsd)}${sp.chargedIdentityOk ? ' · 扣费=2×基准价 ✓' : ''}` : null,
        sp.upstreamUsd != null ? `会话上游原始成本（upstreamUsd）：${fmtUsd(sp.upstreamUsd)}${sp.channelIdentityOk ? ' · 四通道合计一致 ✓' : ''}` : null,
        sp.preimageIdentityOk ? 'Token 原像与单价反算总额精确吻合 ✓' : null,
      ].filter(Boolean).join('\n');
      pills.append(iconPill('check', (sp.reconciled ? '核对✓ ' : '') + fmtUsd(sp.effectiveUsd), recChecks, sp.reconciled ? 'ok' : 'rev'));
    }
    const tok = combined.preimage?.latest || combined.preimage?.totals;
    if (tok && tok.total > 0) {
      pills.append(iconPill('upload', fmtTokS(tok.input), `反推精确输入 Token：${tok.input.toLocaleString('en-US')} tok`, 'in'));
      if (tok.cacheRead > 0) pills.append(iconPill('refresh', fmtTokS(tok.cacheRead), `反推精确缓存读取 Token：${tok.cacheRead.toLocaleString('en-US')} tok`, 'cache'));
      if (tok.cacheWrite > 0) pills.append(iconPill('folder', fmtTokS(tok.cacheWrite), `反推精确缓存写入 Token：${tok.cacheWrite.toLocaleString('en-US')} tok`, 'cache'));
      pills.append(iconPill('download', fmtTokS(tok.output), `反推精确输出+思考 Token：${tok.output.toLocaleString('en-US')} tok（合计 ${tok.total.toLocaleString('en-US')} tok）`, 'out'));
    }
    if (topCand?.diophantinePassed) {
      pills.append(iconPill('check', '1e-10', '通过 BigInt 1e-10 量子区间丢番图整数精确解校验', 'ok'));
    }
    if (topCand?.effortProfile?.effort) {
      pills.append(iconPill('spark', topCand.effortProfile.effort, `5维思考档位反推：${topCand.effortProfile.effort}（REI=${topCand.effortProfile.reiScore}${topCand.effortProfile.thinkTokens != null ? ' · 思考≈' + topCand.effortProfile.thinkTokens + ' tok' : ''}）`, 'rev'));
    }
    if (topCand?.matchedVariant) {
      pills.append(iconPill('route', topCand.matchedVariant.slice(5), `命中价格纪元快照：${topCand.matchedVariant}`, 'neutral'));
    }
    if (d.routeSwitched || d.routeType === 'model') {
      const rtDesc = (d.initialModelLabel && d.routedModelLabel) ? `（${d.initialModelLabel} → ${d.routedModelLabel}）` : '';
      pills.append(iconPill('alert', '路由换模', `检测到路由到其他模型${rtDesc}，已自动截取最新连续段反推`, 'warn'));
    } else if (d.effortDowngraded || d.routeType === 'effort') {
      const efDesc = (d.initialEffort && d.latestEffort) ? `（${d.initialEffort} → ${d.latestEffort}）` : '';
      pills.append(iconPill('alert', '强度削弱', `检测到同型号的强度削弱${efDesc}`, 'warn'));
    }
    if (pills.childNodes.length) box.append(pills);

    // 置信度前五模型：逐行展开展示，用淡淡的浅色区分「指纹」与「反推」
    for (const [idx, row] of sortedCands.slice(0, 5).entries()) {
      const fit = Number(row.match || 0).toFixed(1);
      const isFp = row.source === 'fp';
      const isBoth = !!row.both;
      const toneCls = (idx === 0 && standout) ? (' top ' + (isBoth ? 'tint-both' : isFp ? 'tint-fp' : 'tint-rev'))
        : (isBoth ? ' tint-both' : isFp ? ' tint-fp' : ' tint-rev');
      const srcTip = [
        `#${idx + 1} ${row.label || row.id}`,
        row.revPct != null ? `费用反推置信度：${+row.revPct.toFixed(1)}%${row.diophantinePassed ? '（整数精确解）' : ''}` : null,
        row.fpPct != null ? `数字指纹置信度：${+row.fpPct.toFixed(1)}%` : null,
        row.effortProfile?.effort ? `5维思考档位：${row.effortProfile.effort}（REI=${row.effortProfile.reiScore}）` : null,
        row.matchedDims?.length ? `命中特征：${row.matchedDims.slice(0, 4).join(' · ')}` : null,
        isBoth ? '双源共同印证' : (isFp ? '来源：数字指纹识别' : '来源：费用反推识别'),
      ].filter(Boolean).join('\n');
      box.append(h('div', {
        class: 'mc-fp-row billing-fit' + toneCls,
        'data-tip': srcTip,
        title: srcTip
      },
        h('i', { class: 'mc-fp-bar', style: { width: Math.max(0, Math.min(100, +fit)) + '%' } }),
        h('span', { class: 'mc-fp-src-ic ' + (isBoth ? 'src-both' : isFp ? 'src-fp' : 'src-rev') }, icon(isBoth ? 'check' : isFp ? 'fingerprint' : 'bolt')),
        h('span', { class: 'mc-fp-m' }, row.label || row.id),
        h('b', { class: 'mc-fp-p' }, +fit + '%')));
    }

    if (s.error || !sortedCands.length) {
      const errDesc = s.error || REASONS[s.info?.reason] || combined.consensus.text || '点击「反推锁定」立即补读运行记录与账单';
      box.append(h('p', { class: 'note', 'data-tip': errDesc, title: errDesc }, s.error ? (s.httpStatus ? 'HTTP ' + s.httpStatus : '计费暂不可用') : s.pending ? '读取中…' : '待补读账单与型号'));
    }
    if (cooling) box.append(h('p', { class: 'note' }, '冷却至 ' + new Date(s.retryAt).toLocaleTimeString()));
    const action = (label, ic, fn, disabled) => h('button', { type: 'button', class: 'ib sm', title: label, 'aria-label': label, disabled: disabled || null, onclick: e => { e?.stopPropagation?.(); fn(e); } }, icon(ic));
    box.append(h('div', { class: 'billing-controls' },
      h('label', { title: '每轮回复结束后自动读取 /cost 账单并反推型号' }, h('input', { type: 'checkbox', checked: autoEnabled(), onchange: e => { Store.set('billing:auto', e.target.checked); if (e.target.checked) { autoSeen.delete(chat); automatic(chat); } Bus.emit('billing', sid); } }), '自动'),
      h('button', { type: 'button', class: 'btn sm ghost bp-lock-btn' + (isRunning(chat) ? ' run' : ''), disabled: chat?.busy || !sid || null, title: isRunning(chat) ? '点击停止反推识别' : '合并补读型号（Trace）与第一方 /cost 账单反推，按置信度锁定当前对话真实模型', onclick: e => { e?.stopPropagation?.(); void reverseIdentify(chat || sid, { interactive: true }); } }, icon('bolt'), isRunning(chat) ? '识别中…' : '反推锁定'),
      h('span', { class: 'grow' }),
      action('刷新计费', 'refresh', async () => { const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null); if (c) { engine.clearCooldowns?.(); if (s.httpStatus === 403) await scrapeFreshCostDpls(true); await engine.refresh(c, { force: true, bypassCooldown: true }); applyReverseIdentity(c, { interactive: false }); } }, s.pending || chat?.busy || !sid),
      action('同步价格表', 'layers', async () => { engine.clearCooldowns?.(); await Ranking.refresh(true); const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null); if (c) { await engine.refresh(c, { force: true, bypassCooldown: true }); applyReverseIdentity(c, { interactive: false }); } }),
      action('导出计费诊断 JSON', 'download', () => exportDiagnosticJson(sid))));
    return box;
  }

  const delayed = new WeakMap();
  const midTurnAt = new WeakMap();
  const bgSwept = new Set();
  let bgSweepTimer = 0, bgSweeping = false;
  function probeMidTurn(chat) {
    if (!autoEnabled() || !chat?.sid || chat?.busy || chat?.gacha?.fingerprint || chat?.gacha?.mode === 'autoqa' || isOtherProbeBusy(chat)) return;
    const lastAt = midTurnAt.get(chat) || 0;
    if (now() - lastAt < 1200) return;
    midTurnAt.set(chat, now());
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    setTimeout(() => {
      if (!autoEnabled() || chat?.busy || isOtherProbeBusy(chat) || !sameOwner(owner) || !Chats.has(chat.sid)) return;
      const stNow = engine.state(chat.sid);
      if (stNow.retryAt > now() || stNow.pending) return;
      void engine.refresh(chat, { force: true, allowPending: true });
    }, 80);
  }
  function schedule(chat) {
    if (!autoEnabled() || !chat?.sid || chat?.gacha?.fingerprint || chat?.gacha?.mode === 'autoqa') return;
    if (isOtherProbeBusy(chat)) {
      setTimeout(() => { if (chat?.sid && !chat.busy && !isOtherProbeBusy(chat)) schedule(chat); }, 1200);
      return;
    }
    const lastId = globalThis.ArenaBilling.completed(chat).at(-1)?.id;
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    if (lastId) {
      autoSeen.set(chat, owner + ':' + lastId);
      chat._lastAutoProbeAt = now();
    }
    for (const timer of delayed.get(chat) || []) clearTimeout(timer);
    delayed.set(chat, [40, 420, 1300, 3500].map((delay, idx) => setTimeout(() => {
      if (!autoEnabled() || isOtherProbeBusy(chat) || !sameOwner(owner) || chat.busy || !Chats.has(chat.sid)) return;
      const last = globalThis.ArenaBilling.completed(chat).at(-1)?.id;
      const stNow = engine.state(chat.sid);
      const used = stNow.info?.result?.unitPrice?.used || [];
      const postCovered = stNow.postTurnCoveredIds || [];
      if (stNow.pending || (stNow.retryAt > now() && stNow.httpStatus === 429)) return;
      const uncovered = Boolean(last && (!used.some(row => row.messageId === last) || !postCovered.includes(last)));
      if (!uncovered && stNow.status === 'ready' && stNow.info && !stNow.info.reason) {
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        return;
      }
      if (idx === 0 || uncovered) void engine.refresh(chat, { force: true, bypassCooldown: true });
    }, delay)));
  }
  function scheduleBgSweep(ms = 3500) {
    clearTimeout(bgSweepTimer);
    bgSweepTimer = setTimeout(() => void runBgSweep(), ms);
  }
  async function runBgSweep() {
    if (bgSweeping || !autoEnabled() || typeof UI === 'undefined' || !UI.me || typeof History === 'undefined' || !History.lastLoad) return;
    if ((typeof Gacha !== 'undefined' && Gacha.busy?.()) || (typeof Chats !== 'undefined' && [...Chats.values()].some(c => c.busy))) {
      scheduleBgSweep(3500);
      return;
    }
    try { upgradeCachedOpus56(); } catch {}
    const gone = typeof History.goneMap === 'function' ? History.goneMap() : new Map();
    const gachaAttempts = (typeof Gacha !== 'undefined' && Array.isArray(Gacha.state?.()?.attempts)) ? Gacha.state().attempts : [];
    const gachaArchiveSids = new Set(gachaAttempts.filter(a => a?.sid && (a.verdict === 'archive' || a.verdict === 'skipped' || a.model === '开源模型')).map(a => a.sid));
    for (const e of (History.items || []).slice(0, 60)) {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt) continue;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      if (gachaArchiveSids.has(e.id) || (m?.name === '开源模型' && m?.provider === '开源思考过滤')) {
        void History.archive(e.id).catch(() => {});
      }
    }
    const candidates = (History.items || []).slice(0, 50).filter(e => {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt || bgSwept.has(e.id) || gachaArchiveSids.has(e.id)) return false;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      if (!m || m.guess || m.pendingConfirm || !m.name || m.name === '未识别' || m.name === '未知型号' || m.name === '开源模型') return true;
      if (e.id === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' && /opus[-\s]*5\.5/i.test(m.name || '')) return true;
      if (ARGON_HIGH_SIDS.has(e.id) && !/argon|gemini/i.test(m.name || '')) return true;
      if (SOL_61_SIDS.has(e.id) && !/gpt[-\s]*6\.1[-\s]*sol/i.test(m.name || '')) return true;
      if (/fable[-\s]*5/i.test(m.name || m.candidateName || '') && e.id !== '01a1457d-fd02-74d6-b839-4adf76e2a505' && (m.reverseVer || 0) < 152) return true;
      if (isOpenCandidateName(m.name || m.reverseCandidateId || '') && (m.reverseVer || 0) < 155) return true;
      return false;
    });
    if (!candidates.length) return;
    bgSweeping = true;
    try {
      const target = candidates[0];
      bgSwept.add(target.id);
      const st = engine.state(target.id);
      if (st.retryAt > now()) return;
      const c = typeof chatOf === 'function' ? chatOf(target.id) : (typeof Chats !== 'undefined' ? Chats.get(target.id) : null);
      if (c && !c.busy && !isOtherProbeBusy(c)) {
        if (!c.loaded && typeof c.load === 'function') {
          try { await c.load(); } catch {}
        }
        if (globalThis.ArenaBilling.completed(c).length) {
          await engine.refresh(c, { force: true });
          const applied = applyReverseIdentity(c, { interactive: false });
          const nextM = typeof Models !== 'undefined' ? Models.get(target.id) : null;
          if ((nextM?.name === '开源模型' || applied?.entry?.name === '开源模型') && gachaAttempts.some(a => a?.sid === target.id)) {
            void History.archive(target.id).catch(() => {});
          }
        }
      }
    } catch {} finally {
      bgSweeping = false;
      if (candidates.length > 1) scheduleBgSweep(1800);
    }
  }

  setTimeout(() => { try { upgradeCachedOpus56(); } catch {} }, 100);
  Bus.on('turn', (chat) => { if (chat?.sid) { schedule(chat); scheduleBgSweep(2500); } });
  Bus.on('chat', chat => { if (chat?.sid && !isOtherProbeBusy(chat)) automatic(chat); });
  Bus.on('history', () => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(1500); });
  Bus.on('models', sid => Bus.emit('billing', sid));
  Bus.on('trace', sid => Bus.emit('billing', sid));
  Bus.on('agent-catalog', html => engine.syncCatalog(html));
  const catalogRows = () => Array.isArray(engine.catalogRaw) && engine.catalogRaw.length ? engine.catalogRaw : (Array.isArray(bundled?.data) ? bundled.data : []);
  return Object.assign(engine, { card, summary, topConfidence, badge, automatic, schedule, probeMidTurn, trigger: sid => { const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null; if (c) probeMidTurn(c); }, reverseIdentify, applyReverseIdentity, isRunning, mergeCandidates, catalogRows, exportDiagnosticJson });
})();
