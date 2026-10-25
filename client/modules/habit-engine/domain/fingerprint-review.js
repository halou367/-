// Offline response telemetry re-evaluator: re-runs structural and metric rules against stored conversation turns
const FingerprintReview = (() => {
  function resolveProbe(uTxt, ansTxt, chat) {
    const text = String(uTxt || '').trim();
    const probes = typeof Fingerprint !== 'undefined' ? Fingerprint.PROBES : [];
    const standard = probes.find(pr => pr.prompt === text);
    if (standard) return standard;

    if (Array.isArray(chat?.gacha?.challenges)) {
      const gachaP = chat.gacha.challenges.find(pr => pr.prompt === text);
      if (gachaP) return gachaP;
    }

    let expected = null;
    const countMatch = /(\d{2,4})\s*(?:integers|positions|whole-number|numbers|items|values|个整数|个数字|项)/i.exec(text)
      || /(?:provide exactly|producing exactly|select exactly|giving exactly|fill exactly|choose|provide|fill|select|generate|output|生成|输出|提供|选择)\s*(\d{2,4})/i.exec(text)
      || /(\d{2,4})\s*(?:between|in|从)/i.exec(text);
    if (countMatch) {
      const n = parseInt(countMatch[1], 10);
      if (n >= 50 && n <= 1000) expected = n;
    }

    const has355 = /(?:between\s*1\s*and\s*355|from\s*1\s*to\s*355|\[\s*1\s*,\s*355\s*\]|1\s*[-–~到至]\s*355|1\s*and\s*355|1\s*到\s*355|1\s*至\s*355)/i.test(text);

    if (!expected && has355 && ansTxt) {
      const nums = typeof ProbeLib !== 'undefined' ? ProbeLib.numbers(ansTxt) : [];
      if (nums.length >= 50 && nums.length <= 1000) expected = nums.length;
    } else if (!expected && ansTxt) {
      const nums = typeof ProbeLib !== 'undefined' ? ProbeLib.numbers(ansTxt) : [];
      if (nums.length >= 80 && nums.length <= 1000) expected = nums.length;
    }

    if (expected) {
      return {
        id: 'dynamic-' + expected,
        expected_count: expected,
        prompt: text,
        dynamic: true
      };
    }
    return null;
  }

  function isReviewable(chat, message) {
    if (!message || message.role !== 'assistant') return false;
    const messages = chat?.messages || [];
    const idx = messages.indexOf(message);
    if (idx <= 0) return false;
    const prev = messages[idx - 1];
    if (!prev || prev.role !== 'user') return false;
    const userTxt = (typeof Fingerprint !== 'undefined' ? Fingerprint.textOf(prev) : String(prev.content || '')).trim();
    const msgTxt = typeof Fingerprint !== 'undefined' ? Fingerprint.textOf(message) : String(message.content || '');
    if (resolveProbe(userTxt, msgTxt, chat)) return true;
    if (typeof ProbeLib !== 'undefined' && ProbeLib.numbers(msgTxt).length >= 50) return true;
    return false;
  }

  const sane = n => Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;   // 推理分只有 0–100；更大的是旧强度分遗留值
  function previousMetrics(chat, mi) {
    const out = { average: null, score: null };
    const fp = mi?.fingerprint;
    if (Number.isFinite(fp?.avgProbeSec) && fp.avgProbeSec >= 1) out.average = fp.avgProbeSec;
    if (sane(fp?.reasoning?.score) != null) out.score = fp.reasoning.score;
    if (out.average != null && out.score != null) return out;
    try {
      const labels = [];
      if (typeof Titles !== 'undefined') { const v = Titles.view(chat.sid, chat.title); labels.push(v?.model, v?.plain, v?.title); }
      labels.push(chat.title);
      for (const t of labels.filter(Boolean)) {
        const p = ConversationLabels.parse(String(t).split('/')[0]);
        if (out.average == null && Number.isFinite(p.average) && p.average >= 1) out.average = p.average;
        if (out.score == null && Number.isFinite(p.score)) out.score = p.score;
      }
    } catch {}
    return out;
  }
  const textTokens = s => { s = String(s || ''); if (!s) return 0; const cjk = (s.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g) || []).length; return Math.round(cjk + (s.length - cjk) / 3.6); };
  function estimateFromText(batch, model, sec) {
    if (!model || typeof Strength === 'undefined' || typeof Price === 'undefined') return null;
    const n = batch.length || 1;
    const out = Math.round(batch.reduce((a, x) => a + (x.answer?.parts || []).reduce((b, p) => b + (p.type === 'text' || p.type === 'reasoning' ? textTokens(p.text) : 0), 0) || textTokens(x.text), 0) / n);
    const inp = Math.round(batch.reduce((a, x) => a + textTokens(x.probe?.prompt), 0) / n);
    if (!(out > 0)) return null;
    const [pi, po] = Price.ref(String(model).replace(/\?$/, ''));
    const usd = (inp * pi + out * po) / 1e6;
    const x = { out, tok: out + inp, usd, sec: Number.isFinite(sec) && sec >= 1 ? sec : null };
    const score = Strength.scoreOf(x);
    return Number.isFinite(score) ? { score, source: 'estimated-text', ...x, basis: '按 ' + model + ' 参考价 + 回复文本约 ' + out + ' token' + (x.sec ? ' + 平均 ' + x.sec + ' 秒' : '') + ' 估算' } : null;
  }

  // 对话里所有合格的指纹测试回复（按先后顺序）：message = 指定要包含的那条回复（多条回复的一轮里只认它）
  function scan(chat, message) {
    const messages = chat.messages || [], found = [];
    for (let i = 0; i < messages.length; i++) {
      const u = messages[i];
      if (u.role !== 'user') continue;
      const uTxt = Fingerprint.textOf(u).trim();
      let end = i + 1;
      while (end < messages.length && messages[end].role !== 'user') end++;
      const answers = messages.slice(i + 1, end).filter(a => a.role === 'assistant');
      if (!answers.length) continue;
      const ans = answers.includes(message) ? message : (answers.length === 1 ? answers[0] : null);
      if (!ans || ans.metadata?.aborted || ans.metadata?.pending) continue;

      try {
        const txt = Fingerprint.extractAnswer(ans);
        const p = resolveProbe(uTxt, txt, chat);
        if (!p) continue;
        const numbers = ProbeLib.numbers(txt);
        const minCount = Math.ceil(p.expected_count * 0.90);
        const maxCount = Math.floor(p.expected_count * 1.10);
        if (numbers.length < minCount || numbers.length > maxCount) continue;
        if (ProbeOutputGuard.inspect(txt, p.expected_count, false)) continue;
        found.push({ text: txt, numbers, probe: p, answer: ans, sentAt: Date.parse(u.createdAt || u.created_at || '') });
      } catch {}
    }
    return found;
  }

  /* opts.auto：没有指纹信息的对话打开后自动按历史里的指纹测试回复校准——静默（失败不弹错误提示），只取最近 3 条，已有型号名不被「？」降级 */
  async function calibrate(chat, message, opts = {}) {
    const auto = !!opts.auto, note = (t, k) => { if (auto && (k === 'err' || /^正在校准/.test(t))) return; toast(t, k); };
    if (!chat || !message) return;
    if (chat.busy) { note('请等待当前回复完成再校准', 'err'); return; }
    if (typeof Fingerprint !== 'undefined' && Fingerprint.isRunning(chat)) { note('当前对话正在测指纹，请稍候', 'err'); return; }

    // 严加完整性检查：已停止或尚未完成的回复不评分
    if (message.metadata?.aborted || message.metadata?.pending) {
      note('已停止或尚未完成的回复无法校准指纹', 'err');
      return;
    }

    const messages = chat.messages || [];
    const idx = messages.indexOf(message);
    if (idx < 0) { note('未找到所选消息', 'err'); return; }

    const rawMsgText = typeof Fingerprint !== 'undefined' ? Fingerprint.extractAnswer(message) : String(message.content || '');
    if (!rawMsgText.trim()) { note('回复内容为空，无法校准', 'err'); return; }

    // 优先尝试利用已有的完整探针组（3组），若无则抽取包含当前消息的有效探针组
    const reusable = typeof FingerprintBatch !== 'undefined' ? FingerprintBatch.reusable(chat) : null;
    let batch = null;

    if (reusable && reusable.batch.some(b => b.answer === message || b.answer?.id === message?.id)) {
      batch = reusable.batch;
    } else {
      const found = scan(chat, message);
      if (found.length >= 1) batch = auto ? found.slice(-3) : found;

      // 若未从历史串联中匹配到，直接以当前所选消息进行匹配
      if (!batch && idx > 0 && messages[idx - 1]?.role === 'user') {
        const u = messages[idx - 1];
        const uTxt = Fingerprint.textOf(u).trim();
        try {
          const txt = Fingerprint.extractAnswer(message);
          const numbers = ProbeLib.numbers(txt);
          if (numbers.length >= 50) {
            const p = resolveProbe(uTxt, txt, chat) || { id: 'dynamic-' + numbers.length, expected_count: numbers.length, prompt: uTxt, dynamic: true };
            if (!ProbeOutputGuard.inspect(txt, p.expected_count, false)) {
              batch = [{ text: txt, numbers, probe: p, answer: message, sentAt: Date.parse(u.createdAt || u.created_at || '') || now() }];
            }
          }
        } catch {}
      }
    }

    if (!batch || !batch.length) {
      note('未找到完整合格的指纹回复（可能数量不足或格式异常），无法校准', 'err');
      return;
    }

    note('正在校准指纹（不发送新消息）…');
    try {
      // 和测指纹同一道门（ProbeLib.prepareOutputs：空回复 / 重复回复 / 数量越界等）：不合格的那条不参与识别和评分，不再悄悄少算
      const gate = ProbeLib.prepareOutputs(batch.map(x => ({ text: x.text, challenge_id: x.probe.id, expected_count: x.probe.expected_count })));
      const okAt = gate.checks.map(c => c.level === 'ok');
      if (okAt.some(v => !v)) batch = batch.filter((_, i) => okAt[i]);
      if (!batch.length) { note('已有回复都没有通过指纹门控（' + (gate.checks.find(c => c.level !== 'ok')?.message || '格式异常') + '），无法校准', 'err'); return; }
      const outputs = batch.map(x => ({ text: x.text, challenge_id: x.probe.id, expected_count: x.probe.expected_count }));
      const base = await ProbeBankCache.load();
      let loaded;
      try {
        loaded = (typeof PersonalFP !== 'undefined') ? await PersonalFP.load(base, { sid: chat.sid, context: 'history' }) : base;
      } catch (e) {
        loaded = { ...base, personalError: (typeof describe === 'function' ? describe(e) : e?.message || String(e)) };
      }

      const isOpenThink = !!(
        (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of?.(chat)?.kind === 'compat-thinking') ||
        (typeof FPLibs !== 'undefined' && FPLibs.thought?.(messages))
      );
      const isClosedFpId = id => {
        const s = String(id || '').toLowerCase();
        if (/qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|开源|国产|compat/i.test(s)) return false;
        return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse-spark|inkling|solar-pro/i.test(s);
      };
      const result = (typeof FPLibs!=='undefined'?await FPLibs.inspect(outputs,loaded,{thought:isOpenThink || FPLibs.thought?.(batch.map(x=>x.answer))}):ProbeLib.inspectAndIdentify(outputs,loaded.bank)).result;
      if (isOpenThink && result && Array.isArray(result.candidates)) {
        const openCands = result.candidates.filter(c => !isClosedFpId(c.id));
        if (openCands.length) {
          const sumP = openCands.reduce((a, c) => a + (Number(c.probability) || 0), 0) || 1;
          result.candidates = openCands.map(c => ({ ...c, probability: (Number(c.probability) || 0) / sumP }));
          result.nearest = { ...(result.nearest || {}), ...result.candidates[0] };
          if (result.signals) result.signals.relative_probability = result.candidates[0].probability;
        }
      }
      if (result.status !== 'clear') {
        const meta = loaded.bank.models.find(m => m.id === result.nearest.id);
        if (meta?.personal_only && (meta.reference_groups < 3 || meta.context_mismatch)) {
          result.status = 'close';
          result.reason = meta.context_mismatch ? 'personal_context_mismatch' : 'personal_samples_insufficient';
        }
      }

      // 只有对话里最新的一轮才能用实时数据（思考静默时长等）；更早的回复只用 Trace 记录，避免串到别的轮次
      const lastAnswer = [...messages].reverse().find(m => m.role === 'assistant');
      const measurements = batch.map(x => {
        return Fingerprint.reasonScore(chat, x.probe, result?.nearest?.family, { live: x.answer === lastAnswer && !chat.busy });
      });

      // 用时 = 服务器 trace 里这一轮对话的总时长（以前用「回复时间戳 − 发送时间戳」：历史消息两个时间戳常常一样，算出 0.1 秒）。
      // trace 没读过（或令牌过期）就先读一次；仍没有才退回时间戳，时间戳也不可信（<1 秒）就保留之前的平均用时。
      const hasTrace = () => typeof Trace !== 'undefined' && (Trace.turns(chat.sid) || []).some(t => t.done && !t.outcome && Trace.turnSec(t) >= 1);
      if (typeof Trace !== 'undefined' && !hasTrace()) {
        try {
          const run = async () => { if (!Trace.validRuns(chat.sid).length) await Trace.discover(chat); await Trace.sync(chat.sid, { deep: true }); };
          await Promise.race([run(), new Promise(r => setTimeout(r, 15000))]);
        } catch {}
      }
      const usedTurns = new Set();
      const traceSec = batch.map(x => {
        if (typeof Trace === 'undefined') return null;
        const cand = (Trace.turns(chat.sid) || []).filter(t => t.done && !t.outcome && !usedTurns.has(t.key) && String(t.prompt || '').trim() === String(x.probe?.prompt || '').trim() && Trace.turnSec(t) >= 1);
        if (!cand.length) return null;
        const t = Number.isFinite(x.sentAt) ? cand.slice().sort((a, b) => Math.abs((a.at || 0) - x.sentAt) - Math.abs((b.at || 0) - x.sentAt))[0] : cand[0];
        usedTurns.add(t.key); return Trace.turnSec(t);
      });
      const durations = batch.map((x, i) => {
        if (traceSec[i] != null) return traceSec[i];
        const a = x.answer;
        const completedAt = Number.isFinite(a?.metadata?.timing?.completedAt) ? a.metadata.timing.completedAt : Date.parse(a?.createdAt || a?.created_at || '') || now();
        const startedAt = Number.isFinite(x.sentAt) ? x.sentAt : completedAt;
        return Math.max(0.1, (completedAt - startedAt) / 1000);
      });

      // 历史消息常常没有计时（用户消息与回复时间戳相同）→ 算出来接近 0 秒。<1 秒的不可信：保留之前的平均用时，不覆盖。
      const existingMi = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
      const prev = previousMetrics(chat, existingMi);
      const trusted = durations.filter(d => d >= 1);
      let avgProbeSec = trusted.length === durations.length && durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length * 10) / 10 : null;
      if (avgProbeSec == null && trusted.length) avgProbeSec = Math.round(trusted.reduce((a, b) => a + b, 0) / trusted.length * 10) / 10;
      if (avgProbeSec == null) avgProbeSec = prev.average;
      let measurement = measurements[0] || { score: null, source: 'unavailable' }, reuseOnly = false;
      // 动态英文题：和测指纹一样取各条平均；标准题取第一条
      if (batch.some(x => x.probe.dynamic)) { const sc = measurements.map(m => m?.score).filter(Number.isFinite); if (sc.length) measurement = { ...measurement, score: Math.round(sc.reduce((p, q) => p + q, 0) / sc.length * 10) / 10 }; }
      if (measurement.score == null) {
        // 注意：Calib.last 的 s 是「强度分」（满分 10000，另一套分数），绝不能当推理分用，否则对话名称里会出现几千的“推理分”
        const existingScore = [existingMi?.fingerprint?.reasoning?.score, existingMi?.est?.score, prev.score].find(x => sane(x) != null);
        if (Number.isFinite(existingScore)) {
          measurement = { score: existingScore, source: existingMi?.fingerprint?.reasoning?.source || (prev.score === existingScore ? 'title' : 'measured') }; reuseOnly = true;
        }
      }
      // 仍没有：用识别出的型号的官方参考价 + 回复文本 token 数 + 用时估算（与实测推理分同一公式，来源标为估算）
      if (measurement.score == null) {
        const est = estimateFromText(batch, result.nearest?.id, avgProbeSec);
        if (est) measurement = est;
      }

      const isDynamic = batch.some(x => x.probe.dynamic);
      const cal = isDynamic
        ? { tier: null, reference: '动态英文题未进行档位校准' }
        : ProbeLib.calibrateReasoning(measurement.score, {
            family: ProbeLib.baseModelId(result.nearest.id),
            promptKey: Fingerprint.promptKey(batch[0].probe.prompt),
            source: measurement.source
          }, loaded.personalCalibration || []);

      const reasoning = {
        ...measurement,
        ...cal,
        score: (typeof Strength !== 'undefined' ? Strength.settle?.(chat.sid, reuseOnly ? { ...measurement, reuse: true } : measurement, Strength.priorOf?.(chat.sid)) : undefined) ?? measurement.score,
        model: ProbeLib.baseModelId(result.nearest.id),
        tier: result.status === 'clear' ? cal.tier : null,
        confidence: typeof PersonalMath !== 'undefined' ? PersonalMath.tierConfidence(measurement.score, cal) : null
      };

      const fp = {
        protocol: isDynamic ? (typeof GachaPrompts !== 'undefined' ? GachaPrompts.PROTOCOL : 'modeltrace-dynamic-en-v1') : ProbeLib.PROBE_PROTOCOL,
        count: batch.length,
        avgProbeSec,
        probeDurations: durations,
        result,
        error: '',
        conflict: false,
        source: loaded.source,
        personal: loaded.personal,
        personalError: loaded.personalError || '',
        measurements,
        reasoning,
        suffix: ProbeLib.confidenceSuffix(result, batch.length),
        calibrated: true,
        reused: true,
        warning: '校准已有探针回复；不发送新测试消息。'
      };

      const fpBlockedByOpen = isOpenThink && isClosedFpId(result.nearest?.id);
      const fpPctNow = (result?.signals?.relative_probability ?? result?.nearest?.probability ?? 0) * 100;
      const revPctNow = Number(existingMi?.reverseMatch ?? existingMi?.revPct ?? existingMi?.confidence ?? 0);
      const keepExistingName = fpBlockedByOpen || (existingMi?.name && (
        existingMi.userCorrected ||
        (!existingMi.guess && !existingMi.reverseInferred && !existingMi.habitInferred && !existingMi.billingProbe) ||
        ((existingMi.reverseInferred || existingMi.habitInferred || existingMi.billingProbe) && !(isOpenThink && isClosedFpId(existingMi.name)) && (revPctNow >= fpPctNow)) ||
        (auto && (!/\?$/.test(existingMi.name) && result.status !== 'clear'))
      ));
      const name = fpBlockedByOpen ? (existingMi?.name && !isClosedFpId(existingMi.name) ? existingMi.name : '开源模型') : (result.nearest.id + (result.status === 'clear' ? '' : '?'));
      let entry = { ...(existingMi || {}), name, guess: true, fingerprint: fp, tier: reasoning.tier || existingMi?.tier || null, est: /^estimated/.test(measurement.source || '') ? measurement : (existingMi?.est || null) };
      /* 自动校准不降级已有型号：已经是确定型号（Trace / 标题 / 更高置信度的反推），或者这次只是「接近」（带 ?），都保留原名，只把指纹详情补上 */
      if (keepExistingName && existingMi?.name && !(isOpenThink && isClosedFpId(existingMi.name))) entry = { ...existingMi, fingerprint: fp, est: existingMi.est || entry.est };

      Models.set(chat.sid, entry);
      Bus.emit('model', chat, entry);
      chat.probeNumbers = batch.map(x => ({ challenge_id: x.probe.id, expected_count: x.probe.expected_count, numbers: x.numbers }));

      // 立即在本地更新并同步名称
      if (typeof Titles !== 'undefined') {
        Titles.touch(chat.sid);
        Titles.kick(true);
      }
      chat.emit();
      try { UI.renderTabs?.(); UI.renderListSoon?.(); } catch {}

      const scoreInfo = (reasoning.score != null ? ' · ' + (/^estimated/.test(reasoning.source || '') ? '估算 ' : '') + reasoning.score + '分' : '');
      note((auto ? '已按对话里的指纹测试自动校准：' : '指纹校准完成：') + entry.name + scoreInfo + (typeof Fingerprint !== 'undefined' ? Fingerprint.libNote?.(entry) || '' : ''));
    } catch (e) {
      note('校准失败：' + (typeof describe === 'function' ? describe(e) : e?.message || String(e)), 'err');
    }
  }

  /* 没有指纹信息的对话（换设备 / 只同步到名称 / 数据被清）：历史里有指纹测试回复就自动校准——
     三条完整的标准探针优先；缺了就取最近的 3 条合格回复，只有 1 条就校准这 1 条。不发送任何消息；同一状态只试一次，失败不反复重试。 */
  function auto(chat) {
    try {
      if (!chat?.sid || !chat.loaded || chat.hasMore || chat.error) return false;
      if (chat.busy || chat.gacha || chat.fpLocked || chat.fpBatchLoad || chat.queue?.length || chat.allLoading) return false;
      if (typeof Fingerprint === 'undefined' || Fingerprint.isRunning(chat)) return false;
      if (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning(chat)) return false;
      if (typeof Tabs !== 'undefined' && Tabs.cur?.sid !== chat.sid) return false;
      const mi = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
      if (mi?.fingerprint || mi?.userCorrected || ((mi?.habitInferred || mi?.reverseInferred) && !mi?.pendingConfirm && !mi?.guess)) return false;
      const last = (chat.messages || []).at(-1), key = (chat.messages || []).length + ':' + (last?.id || '');
      if (chat.fpAutoKey === key) return false; chat.fpAutoKey = key;
      const found = scan(chat, null); if (!found.length) return false;
      void calibrate(chat, found[found.length - 1].answer, { auto: true });
      return true;
    } catch { return false; }
  }

  return { isReviewable, calibrate, resolveProbe, scan, auto };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FingerprintReview;
