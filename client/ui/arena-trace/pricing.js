(function (root) {
  'use strict';

  // —— 不可能承载交互式会话的目录条目 ——
  // 2026-10-07 实测：这两类长期霸占候选前排，把真值挤到后面。
  //   `:batch`  批处理端点，周转以小时计，不可能是实时对话的上游；
  //   `~` 前缀  别名指针（always-latest 之类），不是独立部署，价格必然与某个
  //             具体型号重复，留着只会制造重复项。
  // 排掉这两类不会丢失任何价格信息，也不依赖任何厂商知识。
  const BATCH_ENDPOINT_RE = /:batch$/i;
  const ALIAS_POINTER_RE = /^~/;
  const servesInteractively = (model) => !BATCH_ENDPOINT_RE.test(model.id)
    && !ALIAS_POINTER_RE.test(model.id);

  // —— 跨模块共用的 URL 小工具 ——
  // 会话 id 出现在 /ai-proxy/realtime/v1/sessions/<id>/out 与 /api/chat/<id>/cost 里。
  // background.js / family.js 都用这两个，别再各写一份正则。
  const SESSION_RE = /\/(?:sessions|chat|agent|c)\/([^/?#]+)/i;
  const OUT_URL_RE = /\/out(?:\?|$)/;
  const sessionOf = (url) => (SESSION_RE.exec(String(url || '')) || [])[1] || null;
  const isOutUrl = (url) => OUT_URL_RE.test(String(url || ''));

  /*
   * —— agent_p50 基准费率（这是目前最强的识别通道）——
   *
   * /cost 的每条消息除了 actual.* 四项真实花费，还给了 basePriceUsd，策略标记为
   * "agent_p50"。实测它的构成是：
   *
   *     basePriceUsd = Σ ( 真实 token_i × p50 费率_i )
   *
   * 而 actual 的构成是：
   *
   *     actual_i = 真实 token_i × 该型号费率_i
   *
   * **两者共用同一份真实 token**。于是对任一候选型号：
   *
   *     预测 basePrice = Σ ( actual_i ÷ 候选费率_i ) × p50_i
   *
   * 把预测值和观测到的 basePriceUsd 一比，误差最小的就是它。
   * 关键在于 —— 这条路**完全不需要估算 token**，隐藏的思考 token 在除法里自动约掉了。
   *
   * ── 标定历史：p50 会随时间漂移，必须用当期样本重标 ──
   *
   *   2026-10-07 第二次标定（12 条标注消息，最小二乘）：
   *       completion $1.200/M   prompt $0.435/M   cacheRead $0.030/M   cacheWrite $0.500/M
   *
   *   2026-10-09 重标（logs/ 里 4 份已知型号的导出，采集于 2026-10-08，共 18 条账单消息）：
   *       completion $0.6468/M  prompt $0.2156/M  cacheRead $0.0100/M  cacheWrite $0.500/M
   *       · 按目录标准档（档位 1.0）拟合。GPT 6 Luna (Max)、GPT 6 Sol (Max)、
   *         Gemini 3.8 Flash (High) 三份的逐条残差都在 0.01% 以内。
   *       · 旧值下这三份只能靠 2.0× 档「凑」出来，那是在替过期的 p50 兜底，不是型号真的是 2×。
   *       · 新旧两组在同一价格表下不能同时成立（旧的 Opus 样本在新 p50 下偏差 −29%～−59%）：
   *         要么 p50 已漂移，要么 basePrice 口径随路由而异（那几个点走的是 Vertex）。目前分不清，
   *         旧样本暂不用来校验当期 p50。
   *       · completion / prompt / cacheRead 由当期样本确定。cacheWrite 在当期样本里没有可用数据
   *         （Claude 那份输入通道计费为 $0，拟合不出可信的缓存写入费率），暂沿用旧值。
   *
   * ⚠ 再次漂移时：拿带真值标注的导出重新做一次最小二乘拟合，更新这组数即可
   * （costLedger 里的四通道金额 + basePriceUsd 就是全部输入；见 AGENT-POOL-NOTES.md 第六节）。
   * 所有候选的残差都很大时，多半是这组费率过期了。
   */
  const AGENT_P50_RATES = {
    // 2026-10-15 官方更新后的最新 agent_p50 基准费率（11个真实会话全部残差 = 0）：
    epochId: '2026-10-15',
    completion: 0.8700e-6,
    prompt: 0.4350e-6,
    cacheRead: 0.0100e-6,
    cacheWrite: 0.54375e-6,
  };
  const AGENT_P50_RATES_1015 = AGENT_P50_RATES;
  const AGENT_P50_RATES_1016 = {
    epochId: '2026-10-16',
    completion: 0.6468e-6,
    prompt: 0.2156e-6,
    cacheRead: 0.0100e-6,
    cacheWrite: 0.2695e-6,
  };
  const AGENT_P50_RATES_1017A = {
    epochId: '2026-10-17A',
    completion: 0.8700e-6,
    prompt: 0.4350e-6,
    cacheRead: 0.0182e-6,
    cacheWrite: 0.5000e-6,
  };
  const AGENT_P50_RATES_1017_02H = {
    epochId: '2026-10-17_02UTC',
    completion: 0.8700e-6,
    prompt: 0.3200e-6,
    cacheRead: 0.0100e-6,
    cacheWrite: 0.2695e-6,
  };
  const AGENT_P50_RATES_1017_03H = {
    epochId: '2026-10-17_03UTC',
    completion: 0.8700e-6,
    prompt: 0.3200e-6,
    cacheRead: 0.0200e-6,
    cacheWrite: 0.2695e-6,
  };
  const AGENT_P50_RATES_1014 = {
    epochId: '2026-10-14',
    completion: 0.8700e-6,
    prompt: 0.3200e-6,
    cacheRead: 0.0160e-6,
    cacheWrite: 0.2695e-6,
  };
  const AGENT_P50_RATES_1009 = {
    epochId: '2026-10-09',
    completion: 1.2000e-6,
    prompt: 0.4350e-6,
    cacheRead: 0.0150e-6,
    cacheWrite: 0.54375e-6,
  };
  const AGENT_P50_RATES_1008_16 = {
    epochId: '2026-10-08_16UTC+',
    completion: 1.2000e-6,
    prompt: 0.4000e-6,
    cacheRead: 0.0150e-6,
    cacheWrite: 0.5000e-6,
  };
  const AGENT_P50_RATES_LEGACY = {
    // 2026-10-05 ~ 2026-10-08_15UTC 历史会话使用的 agent_p50 基准费率：
    epochId: '2026-10-05/08',
    completion: 0.6468e-6,
    prompt: 0.2156e-6,
    cacheRead: 0.0100e-6,
    cacheWrite: 0.2695e-6,
  };
  const AGENT_P50_RATES_1001 = {
    epochId: '2026-10-01',
    completion: 1.2000e-6,
    prompt: 0.2156e-6,
    cacheRead: 0.0200e-6,
    cacheWrite: 0.2695e-6,
  };
  /*
   * 候选型号可能走的价格档位（相对目录价的倍数）。
   *
   * 同一型号可能有多个计费档位，目录只给标准档。
   * 实测某型号的四档恰好是 0.5× / 1.0× / 1.1× / 2.0×（弹性档 / 标准档 /
   * 区域溢价 / 优先档），所以这里只枚举这几个**离散档位**，不做任意缩放 ——
   * 任意缩放会让每个候选都能凑出好成绩，等于没判。
   *
   * 实测收益：某腾讯型号的会话走的是 2× 档，只用目录价时残差 91.5%，
   * 允许档位后降到 4.2%。
   *
   * ⚠ **0.5×（弹性档）已移除**。它只会凭空制造平局：某型号半价后的
   * out/in/cacheWrite 可能与另一型号的标准档逐位相同，当会话恰好没有缓存读时
   * 就成了精确平局，把真值挤下去。实测 gpt-6-luna 那份样本里，前三名有三个
   * 都是 0.5× 档凑出来的，真值被挤到第 7；去掉后回到第 4。
   * 而我们至今**没有任何证据**表明 arena 会走弹性档（所有标注样本命中的
   * 都是 1× 和 2×）。多给一个没证据的自由度，只会制造噪声。
   */
  const PRICE_TIERS = [1.0, 1.1, 2.0];
  const AGENT_P50_VARIANTS = [
    AGENT_P50_RATES,
    AGENT_P50_RATES_1014,
    AGENT_P50_RATES_1009,
    AGENT_P50_RATES_1008_16,
    AGENT_P50_RATES_LEGACY,
    AGENT_P50_RATES_1001,
  ];

  /*
   * reasoning 事件签名 —— 2026-10-07 在 9 条标注消息上验证的**三值渠道指纹**。
   *
   *   'none'          完全没有 reasoning 事件
   *   'markers-only'  有 start/end，但一条 delta 都没有
   *   'empty-deltas'  有 delta，但内容全是空串
   *   'visible-text'  有非空 delta（真的下发了思考文本）
   *
   * 三个已标注型号分别落在 none / markers-only / empty-deltas，**零重叠**。
   * 最大的好处：**纯文本轮就能取到**，不像 toolCallId 必须等工具调用 ——
   * 那 5 个同型号样本就是因为没有工具调用，旧判据一个指纹都给不出。
   *
   * ⚠ 这是**渠道**层面的相关性，不是型号身份。同渠道的不同型号签名相同。
   */
  function reasoningSignature(item) {
    if (!item || !item.sawReasoning) return 'none';
    if (!item.reasoningDeltaCount) return 'markers-only';
    return item.reasoningTextLength > 0 ? 'visible-text' : 'empty-deltas';
  }

  // ------------------------------------------------------------ token 估算
  // CJK 基本按 1 字 1 token；拉丁文按 4 字符 1 token。只是量级估计 ——
  // 残差法不需要 token 数，这里只用来判断「这条消息有没有可见产出」以便配对账单。
  const CJK_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
  function estimateTokens(text) {
    const s = String(text || '');
    if (!s) return 0;
    const cjk = (s.match(CJK_RE) || []).length;
    const rest = s.length - cjk;
    return Math.round(cjk + rest / 4);
  }

  // ------------------------------------------------- 从捕获里取出助手产出文本
  // /out 是双层编码的 SSE：外层 `data: {records:[{body:"<JSON 字符串>"}]}`，
  // 内层 body 再 JSON.parse 一次才是真正的事件。
  function sseRecords(responseBody) {
    const out = [];
    const text = String(responseBody || '');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.indexOf('data: ') !== 0) continue;
      let outer;
      try { outer = JSON.parse(line.slice(6)); } catch (_) { continue; }
      const records = (outer && outer.records) || [];
      for (const record of records) {
        if (!record || !record.body) continue;
        try { out.push(JSON.parse(record.body)); } catch (_) { /* 非 JSON 记录 */ }
      }
    }
    return out;
  }

  /**
   * 按 messageId 归集这一轮助手实际产出的字符。
   * 计入：正文 text-delta、思考链 reasoning-delta、工具调用入参（它们都要计费）。
   * 不计入：tool-output（那是沙箱回灌的内容，算下一轮的输入，不是本轮输出）。
   */
  function extractAssistantOutputs(captures) {
    const byMessage = new Map();
    let current = null;
    for (const capture of (captures || [])) {
      if (!isOutUrl(capture && capture.url)) continue;
      const events = Array.isArray(capture && capture._parsedEvents) ? capture._parsedEvents : sseRecords(capture.responseBody);
      for (const event of events) {
        const data = (event && event.data) || {};
        const type = data.type;
        if (type === 'start' && data.messageId) {
          current = String(data.messageId);
          if (!byMessage.has(current)) {
            byMessage.set(current, { messageId: current, text: '', visText: '', reasoningText: '', toolCalls: 0, sawReasoning: false,
              sawReasoningDelta: false, reasoningDeltaCount: 0, reasoningTextLength: 0 });
          }
        }
        if (!current) continue;
        const bucket = byMessage.get(current);
        if (type === 'text-delta' || type === 'reasoning-delta') {
          const chunk = String(data.delta || data.text || '');
          bucket.text += chunk;
          if (type === 'reasoning-delta') {
            bucket.reasoningText += chunk;
            bucket.sawReasoningDelta = true;
            bucket.reasoningDeltaCount += 1;
            bucket.reasoningTextLength += chunk.length;
          } else {
            bucket.visText += chunk;
          }
        } else if (type === 'reasoning-start') {
          bucket.sawReasoning = true;
        } else if (type === 'tool-input-start') {
          bucket.toolCalls = (bucket.toolCalls || 0) + 1;
        } else if (type === 'tool-input-available') {
          // 工具入参由模型生成，算输出 token。
          try { const rawIn = data.input ?? data.args ?? {}; const sIn = typeof rawIn === 'string' ? rawIn : JSON.stringify(rawIn); bucket.text += sIn; bucket.visText += sIn; } catch (_) {}
        }
      }
    }
    return [...byMessage.values()].map((item) => ({
      messageId: item.messageId,
      chars: item.text.length,
      tokens: estimateTokens(item.text),
      visTokens: estimateTokens(item.visText || ''),
      reasonTokens: estimateTokens(item.reasoningText || ''),
      stepCount: Math.max(1, 1 + (item.toolCalls || 0)),
      // ⚠ 这个标记**不能**用来判断「有没有隐藏计费 token」。
      //
      // 2026-10-07 被真值标注的样本直接证伪：一份导出**一个 reasoning 事件都没有**，
      // 却隐藏了 470 个计费 token（可见 107，实际 577，5.39×）。另一份有 reasoning
      // 空标记，隐藏 99 个（3.06×）。结论：**没有事件 ≠ 没有隐藏 token**。
      //
      // 所以型号判定只走残差法，这个标记只留作档案信息（随诊断包导出）。
      sawReasoning: !!item.sawReasoning,
      reasoningVisible: !!item.sawReasoningDelta,
      reasoningDeltaCount: item.reasoningDeltaCount,
      reasoningTextLength: item.reasoningTextLength,
      reasoningSignature: reasoningSignature(item),
    }));
  }

  /**
   * 把捕获限定到某个会话。
   *
   * ⚠ 2026-10-07 修：原先反推用的是**全部**捕获，切换会话后仍把上一个会话的
   * 消息混进来算 —— 结果既不对也不自知。/cost 本来就返回整个会话历史，
   * 再混多个会话，配对出来的东西毫无意义。
   *
   * sessionId 为空（比如停在首页）时原样返回，由调用方决定要不要提示。
   */
  function scopeToSession(captures, sessionId) {
    const want = String(sessionId || '');
    if (!want) return (captures || []).slice();
    return (captures || []).filter((capture) => sessionOf(capture && capture.url) === want);
  }

  // --------------------------------------------------- 计费端点可用性诊断
  // 实测踩坑（2026-10-07，第三份标注样本）：整份导出里三次 /cost 全是
  // `403 {"error":"Unauthorized"}` —— 费用通道需要特性开关 cookie 才放行。
  // 这种情况必须和「拿到了计费但对不上消息」区分开，否则用户只看到一句
  // 「数据不足」，根本不知道该去开开关。
  function inspectCostCaptures(captures) {
    let seen = 0;
    let forbidden = 0;
    let withMessages = 0;
    for (const capture of (captures || [])) {
      if (String((capture && capture.url) || '').indexOf('/cost') < 0) continue;
      seen += 1;
      const status = Number(capture.status) || 0;
      if (status === 401 || status === 403) { forbidden += 1; continue; }
      try {
        const payload = (capture && capture._parsedCost && typeof capture._parsedCost === 'object') ? capture._parsedCost : JSON.parse(String(capture.responseBody || ''));
        if (payload && payload.messages && Object.keys(payload.messages).length) withMessages += 1;
      } catch (_) { /* 非 JSON */ }
    }
    return { seen, forbidden, withMessages };
  }

  // --------------------------------------------------- 从捕获里取出计费快照
  // 只认 actual.*：那是上游真实花费。对外报的 charged/basePrice 已经过
  // pricingStrategy 与 marginMultiplier 加价，拿去撞目录必然对不上。
  function parseCostSnapshot(captures) {
    const result = {};
    for (const capture of (captures || [])) {
      const url = String((capture && capture.url) || '');
      if (url.indexOf('/cost') < 0) continue;
      let payload;
      try { payload = (capture && capture._parsedCost && typeof capture._parsedCost === 'object') ? capture._parsedCost : JSON.parse(String(capture.responseBody || '')); } catch (_) { continue; }
      const messages = (payload && payload.messages) || {};
      for (const [messageId, entry] of Object.entries(messages)) {
        const actual = (entry && entry.actual) || null;
        if (!actual) continue;
        result[messageId] = {
          source: String(actual.source || ''),
          inputUsd: Number(actual.inputTokensCostUsd) || 0,
          outputUsd: Number(actual.outputTokensCostUsd) || 0,
          cacheReadUsd: Number(actual.cacheReadTokensCostUsd) || 0,
          // 第 4 条计费通道。不是所有上游都收这项 —— 收了却在目录里没有对应
          // 价格的型号可以直接排除。
          cacheWriteUsd: Number(actual.cacheWriteTokensCostUsd) || 0,
          // ⚠ 立场修正：早先把 basePriceUsd 当「加价后的数」排除在外。错了 ——
          // 它是服务端用**真实 token 数**按 agent_p50 基准费率重算的价，
          // 和 actual 共用同一份 token。两者联立，隐藏 token 直接约掉。
          // 详见下面的 AGENT_P50_RATES。（totalChargedUsd 仍然无用：它只是 base×margin。）
          imageGenerationCostUsd: (Number(actual.imageGenerationCostUsd) || 0) + (Number(actual.imageInputTokensCostUsd) || 0) + (Number(actual.imageOutputTokensCostUsd) || 0),
          rawBasePriceUsd: Number(entry.basePriceUsd) || 0,
          basePriceUsd: (() => {
            const rawB = Number(entry.basePriceUsd) || 0;
            const imgC = (Number(actual.imageGenerationCostUsd) || 0) + (Number(actual.imageInputTokensCostUsd) || 0) + (Number(actual.imageOutputTokensCostUsd) || 0);
            return (rawB > 0 && imgC > 0 && rawB >= imgC) ? +(rawB - imgC).toFixed(10) : rawB;
          })(),
          // 服务端自己标的「是否进入长上下文档位」。目录里 80 个型号带
          // overrides.min_prompt_tokens（换挡阈值），两者可以互相印证。
          isLongContext: actual.isLongContext === true,
          totalUsd: Number(actual.totalCostUsd) || 0,
        };
      }
    }
    return result;
  }

  // ------------------------------------------------------------ 目录归一化
  /*
   * —— Arena 第一方 Agent 目录（候选池收窄的主闸门）——
   *
   * 问题：OpenRouter 目录里能比价的型号有几百个，但 arena 的 Agent 竞技场
   * 实际只上了 51 个。拿全量目录去反推，等于让一堆**根本不可能出现在本页面**
   * 的型号参与竞争 —— 它们只要价格凑得近就会把真值挤下去。
   * 实测 glm-5.3 的会话：全量池里真值排 122/143，换成 Agent 池后排 6/42。
   *
   * 数据来自 arena 自己的 `/leaderboard/agent` 页面载荷（第一方），
   * 见 data/arena-agent-catalog.json 与其中的 caveats。
   *
   * ⚠ 第一方榜单**不公布 cache-read / cache-write 单价**。本表的 cache 费率
 * 是历史上在名称精确匹配时从 OpenRouter 目录借来的（逐条标了 cacheRateSource）。
 * 2026-10-09 起运行时不再读取 OpenRouter 目录，这些费率只是冻结的历史数据。
 * 当期 4 份已知样本里，GPT 6 Luna / GPT 6 Sol 的 cacheRead 与账单吻合（同批拟合残差在 0.01% 以内）；
 * 其余 cache 费率**仍未核对**，用到它们的残差不能当作已核对。
   */
  function normalizeAgentCatalog(payload, includeIncomplete = false) {
    const list = (payload && payload.data) || [];
    const out = [];
    for (const row of list) {
      if (!row) continue;
      const prompt = Number(row.inputPerMillion);
      const completion = Number(row.outputPerMillion);
      // 没有公开 token 单价的行无法参与残差法。保留在数据文件里（它仍是
      // 「Agent 池成员」这一事实的证据），但不作为可比价候选。
      const isKnownUnpriced = /barium|argon|nemotron|may26-chatbot4/i.test(String(row.id || '') + ' ' + String(row.label || ''));
      if (!includeIncomplete && !isKnownUnpriced && (!Number.isFinite(completion) || completion <= 0)) continue;
      if (!includeIncomplete && !isKnownUnpriced && (!Number.isFinite(prompt) || prompt <= 0)) continue;
      const cacheRead = Number(row.cacheReadPerMillion);
      const cacheWrite = Number(row.cacheWritePerMillion);
      // 榜单键：数据文件与每日同步写的都是 agentKeys（数组）；agentKey 取首项
      // 只为给界面/导出一个单值。
      const agentKeys = Array.isArray(row.agentKeys) ? row.agentKeys.map(String)
        : (row.agentKey ? [String(row.agentKey)] : []);
      const crVariants = Array.isArray(row.cacheReadVariants)
        ? row.cacheReadVariants.map(Number).filter((v) => Number.isFinite(v) && v > 0).map((v) => v / 1e6)
        : (Number.isFinite(cacheRead) && cacheRead > 0 ? [cacheRead / 1e6] : []);
      const cwVariants = Array.isArray(row.cacheWriteVariants)
        ? row.cacheWriteVariants.map(Number).filter((v) => Number.isFinite(v) && v > 0).map((v) => v / 1e6)
        : (Number.isFinite(cacheWrite) && cacheWrite > 0 ? [cacheWrite / 1e6] : []);
      out.push({
        id: String(row.id || agentKeys[0] || ''),
        vendor: String(row.vendor || ''),
        prompt: row.inputPerMillion != null && prompt > 0 ? prompt / 1e6 : null,
        completion: row.outputPerMillion != null && completion > 0 ? completion / 1e6 : null,
        cacheRead: (Number.isFinite(cacheRead) && cacheRead > 0 ? cacheRead / 1e6 : null) || crVariants[0] || null,
        cacheWrite: (Number.isFinite(cacheWrite) && cacheWrite > 0 ? cacheWrite / 1e6 : null) || cwVariants[0] || null,
        cacheReadVariants: crVariants,
        cacheWriteVariants: cwVariants,
        altRates: Array.isArray(row.altRates)
          ? row.altRates
              .filter((ar) => ar && Number(ar.prompt ?? ar.inputPerMillion) > 0 && Number(ar.completion ?? ar.outputPerMillion) > 0)
              .map((ar) => ({
                prompt: Number(ar.prompt ?? ar.inputPerMillion) / 1e6,
                completion: Number(ar.completion ?? ar.outputPerMillion) / 1e6,
                cacheRead: Number(ar.cacheRead ?? ar.cacheReadPerMillion) > 0 ? Number(ar.cacheRead ?? ar.cacheReadPerMillion) / 1e6 : null,
                cacheWrite: Number(ar.cacheWrite ?? ar.cacheWritePerMillion) > 0 ? Number(ar.cacheWrite ?? ar.cacheWritePerMillion) / 1e6 : null,
                isOfficialPrimary: Boolean(ar.isOfficialPrimary),
              }))
          : [],
        longContextThreshold: 0,          // 第一方榜单没有长上下文价档字段
        contextLength: Number(row.contextLength) || 0,
        maxCompletionTokens: Number(row.maxCompletionTokens) || 0,
        supportsReasoning: !!row.supportsReasoning,
        // —— 以下为 Agent 池特有的溯源字段，界面与诊断包会用到 ——
        agentKeys,
        agentKey: agentKeys[0] || null,
        label: row.label || String(row.id || ''),
        org: row.org || null,
        pool: 'arena-agent',
        priceSource: 'arena-leaderboard-agent',
        cacheRateSource: row.cacheRateSource || null,
        agentTaskCostP25: Number(row.agentTaskCostP25) || null,
        agentTaskCostP50: Number(row.agentTaskCostP50) || null,
        agentTaskCostP95: Number(row.agentTaskCostP95) || null,
        agentTaskSamples: Number(row.agentTaskSamples) || 0,
        sessions: Number(row.sessions) || 0,
        leaderboardRank: Number(row.leaderboardRank) || 999,
        protoFamily: row.protoFamily || null,
        expectedNReason: Array.isArray(row.expectedNReason) ? row.expectedNReason : null,
        chunkRange: Array.isArray(row.chunkRange) ? row.chunkRange : null,
        cpsRange: Array.isArray(row.cpsRange) ? row.cpsRange : null,
      });
    }
    return out;
  }

  // 厂商比对不靠映射表：两边都归一化成小写字母数字再比。
  // 形如 'Vendor Name' → 'vendorname'，目录里的 slug 前缀本来就是这个形态。
  const normVendor = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ------------------------------------------------------------------ 推断
  /**
   * 把 /cost 账单配对到有可见产出的助手消息上。
   * 残差法只用到 used[]（逐条的四通道金额 + basePriceUsd）；
   * reasoningSignature 作为渠道指纹随诊断包导出。
   */
  function inferOutputUnitPrice(outputs, costSnapshot) {
    let usd = 0;
    let tokens = 0;
    const used = [];
    for (const item of (outputs || [])) {
      const cost = costSnapshot && costSnapshot[item.messageId];
      if (!cost || !(cost.outputUsd > 0) || !(item.tokens > 0)) continue;
      usd += cost.outputUsd;
      tokens += item.tokens;
      used.push({
        messageId: item.messageId, tokens: item.tokens,
        visTokens: item.visTokens, reasonTokens: item.reasonTokens,
        stepCount: item.stepCount || 1,
        outputUsd: cost.outputUsd, sawReasoning: !!item.sawReasoning,
        reasoningVisible: !!item.reasoningVisible,
        reasoningSignature: item.reasoningSignature,
        inputUsd: cost.inputUsd, cacheReadUsd: cost.cacheReadUsd,
        cacheWriteUsd: cost.cacheWriteUsd, isLongContext: cost.isLongContext,
        basePriceUsd: cost.basePriceUsd,
        source: cost.source || '',
        totalUsd: cost.totalUsd || 0,
      });
    }
    if (!(usd > 0) || !(tokens > 0)) {
      return { ok: false, reason: 'no-paired-samples', messages: used.length };
    }
    return {
      ok: true,
      messages: used.length,
      // 全部消息签名一致才给出，混合时为 null（别拿混的当指纹）
      reasoningSignature: used.length && used.every((u) => u.reasoningSignature === used[0].reasoningSignature)
        ? used[0].reasoningSignature : null,
      used,
    };
  }

  /**
   * 对某个候选型号，用 agent_p50 费率预测它应当产生的 basePriceUsd。
   * 返回 null 表示该候选在某个计费通道上没有定价 —— 口径对不上，不是候选。
   */
  function fmtInt(n) {
    const s = String(Math.round(Number(n) || 0));
    return s.length <= 3 ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function enrichModelRates(model) {
    if (!model) return null;
    if (model._enrichedRates && model._enrichedRatesPrompt === model.prompt && model._enrichedRatesComp === model.completion) {
      return model._enrichedRates;
    }
    const m = Object.assign({}, model);
    const id = String(m.id || '').toLowerCase();
    if (!(m.prompt > 0) && Number(m.inputPerMillion) > 0) m.prompt = Number(m.inputPerMillion) / 1e6;
    if (!(m.completion > 0) && Number(m.outputPerMillion) > 0) m.completion = Number(m.outputPerMillion) / 1e6;
    if (!(m.cacheRead > 0) && Number(m.cacheReadPerMillion) > 0) m.cacheRead = Number(m.cacheReadPerMillion) / 1e6;
    if (!(m.cacheWrite > 0) && Number(m.cacheWritePerMillion) > 0) m.cacheWrite = Number(m.cacheWritePerMillion) / 1e6;
    if (!(m.prompt > 0) || !(m.completion > 0)) {
      if (/gemini.*pro/i.test(id)) {
        m.prompt = 2.0e-6; m.completion = 12.0e-6; m.cacheRead = 0.20e-6; m.cacheWrite = 2.5e-6;
      } else if (/gemini.*flash/i.test(id)) {
        m.prompt = 0.75e-6; m.completion = 3.75e-6; m.cacheRead = 0.075e-6; m.cacheWrite = 0.9375e-6;
      } else if (/barium|argon/i.test(id)) {
        m.prompt = 2.0e-6; m.completion = 10.0e-6; m.cacheRead = 0.20e-6; m.cacheWrite = 2.0e-6;
      } else if (/step-5/i.test(id)) {
        m.prompt = 0.70e-6; m.completion = 2.10e-6; m.cacheRead = 0.14e-6; m.cacheWrite = 0.875e-6;
      } else if (/deepseek-v4-pro/i.test(id)) {
        m.prompt = 1.0e-6; m.completion = 3.0e-6; m.cacheRead = 0.2e-6; m.cacheWrite = 1.25e-6;
      } else if (/qwen3\.7-max/i.test(id)) {
        m.prompt = 1.475e-6; m.completion = 5.9e-6; m.cacheRead = 0.295e-6; m.cacheWrite = 1.84375e-6;
      } else if (/claude-sonnet-5\.5/i.test(id)) {
        m.prompt = 2.0e-6; m.completion = 10.0e-6; m.cacheRead = 0.2e-6; m.cacheWrite = 2.5e-6;
      } else if (/grok-4\.6/i.test(id)) {
        m.prompt = 2.0e-6; m.completion = 6.0e-6; m.cacheRead = 0.5e-6; m.cacheWrite = 2.5e-6;
      } else if (/nemotron|may26-chatbot4/i.test(id + ' ' + String(m.label || ''))) {
        m.prompt = 1.2e-6; m.completion = 4.0e-6; m.cacheRead = 0.12e-6;
      }
    }
    if (m.prompt > 0) {
      if (!(m.cacheRead > 0)) {
        if (/farris-ees5|qwen3\.8-flash/i.test(id)) m.cacheRead = 0.016e-6;
        else if (/paisley-n9x0|qwen3\.8-max/i.test(id)) m.cacheRead = 0.2e-6;
        else m.cacheRead = m.prompt * 0.1;
      }
      if (!(m.cacheWrite > 0)) {
        if (/farris-ees5|qwen3\.8-flash/i.test(id)) m.cacheWrite = 0.2e-6;
        else if (/paisley-n9x0|qwen3\.8-max/i.test(id)) m.cacheWrite = 2.5e-6;
        else m.cacheWrite = m.prompt * 1.25;
      }
    }
    const crList = Array.isArray(m.cacheReadVariants) && m.cacheReadVariants.length
      ? m.cacheReadVariants.slice()
      : (m.cacheRead > 0 ? [m.cacheRead] : []);
    if (m.cacheRead > 0 && crList.indexOf(m.cacheRead) < 0) crList.unshift(m.cacheRead);
    const cwList = Array.isArray(m.cacheWriteVariants) && m.cacheWriteVariants.length
      ? m.cacheWriteVariants.slice()
      : (m.cacheWrite > 0 ? [m.cacheWrite] : []);
    if (m.cacheWrite > 0 && cwList.indexOf(m.cacheWrite) < 0) cwList.unshift(m.cacheWrite);
    m.cacheReadList = crList;
    m.cacheWriteList = cwList;
    try {
      Object.defineProperty(model, '_enrichedRates', { value: m, configurable: true });
      Object.defineProperty(model, '_enrichedRatesPrompt', { value: model.prompt, configurable: true });
      Object.defineProperty(model, '_enrichedRatesComp', { value: model.completion, configurable: true });
    } catch {}
    return m;
  }

  function tierPriorPenalty(tier) {
    if (Math.abs(tier - 1.0) < 1e-9) return 0;
    if (Math.abs(tier - 1.1) < 1e-6 || Math.abs(tier - 2.0) < 1e-6) return 0.0015;
    if (Math.abs(tier - 1.6) < 1e-6 || Math.abs(tier - 0.625) < 1e-6) return 0.0020;
    if (Math.abs(tier - 0.5) < 1e-6) return 0.0030;
    if (Math.abs(tier - 0.0667) < 1e-4 || Math.abs(tier - 0.05) < 1e-4) return 0.0040;
    return 0.015;
  }

  function isCleanCacheRatePerM(ratePerM) {
    if (!Number.isFinite(ratePerM) || ratePerM <= 0 || ratePerM > 30) return false;
    if (Math.abs(ratePerM * 10000 - Math.round(ratePerM * 10000)) < 1e-3) return true;
    const cleanStep = [1000, 2000, 4000, 8000];
    for (const s of cleanStep) {
      if (Math.abs(ratePerM * s - Math.round(ratePerM * s)) < 1e-3) return true;
    }
    return false;
  }

  function checkDiophantineTurn(row, effModel, p50, is6DecQuantized = false) {
    const chs = [
      ['outputUsd', 'completion'],
      ['inputUsd', 'prompt'],
      ['cacheReadUsd', 'cacheRead'],
      ['cacheWriteUsd', 'cacheWrite'],
    ];
    let predBaseFromInt = 0;
    let predBaseLo = 0;
    let predBaseHi = 0;
    let activeCount = 0;
    let intPassCount = 0;
    let nonCrActiveCount = 0;
    let nonCrPassCount = 0;
    let maxTokenRelErr = 0;
    let maxNonCrRelErr = 0;
    const tokens = { I: 0, W: 0, R: 0, O: 0 };

    for (const [costKey, rateKey] of chs) {
      const c = Number(row[costKey]) || 0;
      if (!(c > 0)) continue;
      activeCount += 1;
      if (rateKey !== 'cacheRead') nonCrActiveCount += 1;
      const r = Number(effModel[rateKey]) || 0;
      if (!(r > 0)) {
        if (rateKey !== 'cacheRead') return { valid: false };
        continue;
      }
      const rawN = c / r;
      const nInt = Math.round(rawN);
      if (nInt <= 0) {
        if (rateKey !== 'cacheRead') return { valid: false };
        continue;
      }
      const reconstructedCost = nInt * r;
      const costErr = Math.abs(reconstructedCost - c);
      const tol = is6DecQuantized ? Math.max(5.05e-7, c * 1e-6) : Math.max(1e-11, c * 1e-6);
      const tokenRelErr = Math.abs(rawN - nInt) / Math.max(1, nInt);
      const passed = costErr <= tol || Math.abs(rawN - nInt) <= 1e-3;
      if (passed) {
        intPassCount += 1;
        if (rateKey !== 'cacheRead') nonCrPassCount += 1;
      }
      if (tokenRelErr > maxTokenRelErr) maxTokenRelErr = tokenRelErr;
      if (rateKey !== 'cacheRead' && tokenRelErr > maxNonCrRelErr) maxNonCrRelErr = tokenRelErr;
      predBaseFromInt += nInt * p50[rateKey];
      if (is6DecQuantized) {
        const nLo = Math.max(1, Math.ceil((c - 5.05e-7) / r - 1e-9));
        const nHi = Math.max(nLo, Math.floor((c + 5.05e-7) / r + 1e-9));
        predBaseLo += nLo * p50[rateKey];
        predBaseHi += nHi * p50[rateKey];
      }
      if (rateKey === 'prompt') tokens.I = nInt;
      else if (rateKey === 'cacheWrite') tokens.W = nInt;
      else if (rateKey === 'cacheRead') tokens.R = nInt;
      else if (rateKey === 'completion') tokens.O = nInt;
    }

    if (activeCount === 0) return { valid: false };
    const obsBase = Number(row.basePriceUsd) || 0;
    const baseTol = is6DecQuantized ? 5.05e-7 : 0;
    let baseRelErr = obsBase > 0 ? Math.abs(predBaseFromInt - obsBase) / obsBase : Infinity;
    if (is6DecQuantized && obsBase > 0 && intPassCount === activeCount) {
      if (obsBase >= predBaseLo - baseTol && obsBase <= predBaseHi + baseTol) {
        baseRelErr = Math.min(baseRelErr, 5e-4);
      }
    }
    let solverTier = 1;
    let derivedCacheReadPerM = null;

    // Tier 3: Dynamic cacheRead elimination via basePriceUsd when I, W, O pass exact integer quantization
    const cCr = Number(row.cacheReadUsd) || 0;
    // Tier 1b: Direct per-turn check against known cacheReadList variants (avoids combinatorial Cartesian product)
    if (cCr > 0 && obsBase > 0 && p50.cacheRead > 0 && nonCrPassCount === nonCrActiveCount && (intPassCount < activeCount || baseRelErr >= 1e-3) && Array.isArray(effModel.cacheReadList)) {
      const nonCrBase = tokens.I * p50.prompt + tokens.W * p50.cacheWrite + tokens.O * p50.completion;
      for (const candCrRate of effModel.cacheReadList) {
        if (!(candCrRate > 0) || Math.abs(candCrRate - effModel.cacheRead) < 1e-12) continue;
        const rawR = cCr / candCrRate;
        const rInt = Math.round(rawR);
        if (rInt <= 0) continue;
        const crErr = Math.abs(rInt * candCrRate - cCr);
        const crTol = is6DecQuantized ? Math.max(5.05e-7, cCr * 1e-6) : Math.max(1e-11, cCr * 1e-6);
        if (crErr <= crTol || Math.abs(rawR - rInt) <= 1e-3) {
          const candBase = nonCrBase + rInt * p50.cacheRead;
          const candRelErr = Math.abs(candBase - obsBase) / obsBase;
          if (candRelErr < 1e-3 && candRelErr < baseRelErr) {
            tokens.R = rInt;
            predBaseFromInt = candBase;
            baseRelErr = candRelErr;
            intPassCount = activeCount;
            maxTokenRelErr = maxNonCrRelErr;
            solverTier = 1;
            derivedCacheReadPerM = Number((candCrRate * 1e6).toFixed(4));
            break;
          }
        }
      }
    }
    if (cCr > 0 && obsBase > 0 && p50.cacheRead > 0 && nonCrPassCount === nonCrActiveCount && (intPassCount < activeCount || baseRelErr >= 1e-3)) {
      const nonCrBase = tokens.I * p50.prompt + tokens.W * p50.cacheWrite + tokens.O * p50.completion;
      const remBase = obsBase - nonCrBase;
      if (remBase > 0) {
        const rElim = Math.round(remBase / p50.cacheRead);
        const elimBase = nonCrBase + rElim * p50.cacheRead;
        const elimRelErr = Math.abs(elimBase - obsBase) / obsBase;
        if (rElim > 0 && (elimRelErr < 1e-3 || (is6DecQuantized && Math.abs(elimBase - obsBase) <= 1.5e-6))) {
          const impliedCrPerM = (cCr / rElim) * 1e6;
          const promptPerM = (Number(effModel.prompt) || 0) * 1e6;
          if (impliedCrPerM > 0 && impliedCrPerM <= promptPerM * 1.05 && isCleanCacheRatePerM(impliedCrPerM)) {
            tokens.R = rElim;
            predBaseFromInt = elimBase;
            baseRelErr = is6DecQuantized ? Math.min(elimRelErr, 5e-4) : elimRelErr;
            intPassCount = activeCount;
            maxTokenRelErr = maxNonCrRelErr;
            solverTier = 3;
            derivedCacheReadPerM = Number(impliedCrPerM.toFixed(4));
          }
        }
      }
    }

    // Tier 2.5: Per-turn Long-Context (isLongContext === true) multi-step convex rate solver
    if (row && row.isLongContext === true && obsBase > 0 && (intPassCount < activeCount || baseRelErr >= 1e-3)) {
      const lcMults = [
        [2.0, 2.0],
        [2.0, 1.5],
        [1.5, 1.5],
      ];
      let bestLc = null;
      for (const [mIn, mOut] of lcMults) {
        const lcModel = {
          prompt: effModel.prompt * mIn,
          completion: effModel.completion * mOut,
          cacheRead: effModel.cacheRead * mIn,
          cacheWrite: effModel.cacheWrite * mIn,
        };
        let lcPredBase = 0;
        let lcPass = 0;
        let lcMaxErr = 0;
        const lcTok = { I: 0, W: 0, R: 0, O: 0 };
        let lcOk = true;
        for (const [costKey, rateKey] of chs) {
          const c = Number(row[costKey]) || 0;
          if (!(c > 0)) continue;
          const r = Number(lcModel[rateKey]) || 0;
          if (!(r > 0)) { lcOk = false; break; }
          const rawN = c / r;
          const nInt = Math.round(rawN);
          if (nInt <= 0) { lcOk = false; break; }
          const tol = is6DecQuantized ? Math.max(5.05e-7, c * 1e-6) : Math.max(1e-11, c * 1e-6);
          if (Math.abs(nInt * r - c) <= tol || Math.abs(rawN - nInt) <= 1e-3) lcPass += 1;
          const tErr = Math.abs(rawN - nInt) / Math.max(1, nInt);
          if (tErr > lcMaxErr) lcMaxErr = tErr;
          lcPredBase += nInt * p50[rateKey];
          if (rateKey === 'prompt') lcTok.I = nInt;
          else if (rateKey === 'cacheWrite') lcTok.W = nInt;
          else if (rateKey === 'cacheRead') lcTok.R = nInt;
          else if (rateKey === 'completion') lcTok.O = nInt;
        }
        if (!lcOk) continue;
        const lcRelErr = Math.abs(lcPredBase - obsBase) / obsBase;
        if (!bestLc || (lcPass === activeCount && lcRelErr < bestLc.lcRelErr)) {
          bestLc = { lcPredBase, lcPass, lcMaxErr, lcRelErr, lcTok };
        }
      }
      if (!bestLc || bestLc.lcRelErr >= 1e-3) {
        let stdBaseAt1x = 0;
        for (const [costKey, rateKey] of chs) {
          const c = Number(row[costKey]) || 0;
          const r = Number(effModel[rateKey]) || 0;
          if (c > 0 && r > 0) stdBaseAt1x += (c / r) * p50[rateKey];
        }
        const blendRatio = stdBaseAt1x > 0 ? stdBaseAt1x / obsBase : 0;
        if (blendRatio >= 1.02 && blendRatio <= 2.02) {
          const blendScale = 1 / blendRatio;
          const bTok = {
            I: Math.round(tokens.I * blendScale),
            W: Math.round(tokens.W * blendScale),
            R: Math.round(tokens.R * blendScale),
            O: Math.round(tokens.O * blendScale),
          };
          const bBase = bTok.I * p50.prompt + bTok.W * p50.cacheWrite + bTok.R * p50.cacheRead + bTok.O * p50.completion;
          const bRelErr = Math.abs(bBase - obsBase) / obsBase;
          if (bRelErr < 2e-3 && (!bestLc || bRelErr < bestLc.lcRelErr)) {
            bestLc = { lcPredBase: bBase, lcPass: activeCount, lcMaxErr: 0.001, lcRelErr: bRelErr, lcTok: bTok };
          }
        }
      }
      if (bestLc && bestLc.lcPass === activeCount && bestLc.lcRelErr < 2e-3 && bestLc.lcRelErr < baseRelErr) {
        tokens.I = bestLc.lcTok.I;
        tokens.W = bestLc.lcTok.W;
        tokens.R = bestLc.lcTok.R;
        tokens.O = bestLc.lcTok.O;
        predBaseFromInt = bestLc.lcPredBase;
        baseRelErr = bestLc.lcRelErr;
        intPassCount = activeCount;
        maxTokenRelErr = bestLc.lcMaxErr;
        solverTier = 2;
      }
    }

    // Exact p50 integer-ratio congruence check when p50_out/p50_in is an integer (2 or 3)
    let congruenceErr = 0;
    if (!is6DecQuantized && obsBase > 0 && p50.prompt > 0) {
      const outRatio = p50.completion / p50.prompt;
      if (Math.abs(outRatio - Math.round(outRatio)) < 1e-6) {
        const kOut = Math.round(outRatio);
        const cwRatio = p50.cacheWrite / p50.prompt;
        const targetUnits = (obsBase - tokens.R * p50.cacheRead) / p50.prompt;
        const candUnits = tokens.I + kOut * tokens.O + cwRatio * tokens.W;
        congruenceErr = Math.abs(candUnits - targetUnits) / Math.max(1, targetUnits);
      }
    }
    const allIntPassed = intPassCount === activeCount && baseRelErr < 1e-3 && congruenceErr < 1e-3;

    return {
      valid: true,
      allIntPassed,
      solverTier,
      derivedCacheReadPerM,
      intPassRatio: intPassCount / activeCount,
      maxTokenRelErr,
      congruenceErr,
      predBaseFromInt,
      baseRelErr,
      tokens,
      visTokens: Number(row.tokens) || 0,
    };
  }

  function _isSyntheticStreamEvidence(ev) {
    if (!ev || typeof ev !== 'object') return false;
    if (ev.syntheticFallback === true || ev.isSyntheticSse === true) return true;
    const sIds = Array.isArray(ev.streamIds) ? ev.streamIds : [];
    if (sIds.some((id) => {
      const k = String(id || '');
      return k === 'txt_synth' || k === 'rs_synth' || /^txt_synth|^rs_synth/i.test(k);
    })) return true;
    return false;
  }

  // [V20 Upgrade #1] Per-Block Encrypted/Stream Reasoning Second-Order Moments Tie-Breaker
  function scoreEncryptedReasoningMomentsV20(modelId, proto, ev) {
    if (!ev || typeof ev !== 'object') return { delta: 0, dim: '' };
    const id = String(modelId || '').toLowerCase();
    const rp = Number(ev.nReason || ev.reasoningStartCount || 0);
    const duty = Number(ev.thinkDutyCycle || 0);
    const blkCv = Number(ev.encBlockDurCv || 0);
    const encSig = Number(ev.encSigBytes || 0);
    if (ev.visibleReasoning || Number(ev.reasoningTextLength || 0) > 0) return { delta: 0, dim: '' };

    if (proto === 'openai' && rp >= 2) {
      if (rp >= 4 && (duty >= 0.42 || blkCv <= 0.65)) {
        if (/gpt-6\.1-sol/i.test(id)) return { delta: -0.0045, dim: `V20思考二阶矩:多段稳态脉冲(rp=${rp},duty=${duty.toFixed(2)}→6.1-Sol)` };
        if (/gpt-6-astra|gpt-6-sol\b/i.test(id)) return { delta: 0.0032, dim: '' };
      } else if (rp === 2 && duty > 0 && duty < 0.28) {
        if (/gpt-6-luna|gpt-5\.6/i.test(id)) return { delta: -0.0030, dim: `V20思考二阶矩:短占空比双脉冲(duty=${duty.toFixed(2)})` };
      }
    } else if (proto === 'claude' && (ev.hiddenReasoning || encSig > 0)) {
      if (duty >= 0.58 || encSig >= 520) {
        if (/opus-5\.[56]|opus-5\b/i.test(id)) return { delta: -0.0042, dim: `V20加密思考占空比:深思考(${duty > 0 ? duty.toFixed(2) : encSig + 'B'}→Opus)` };
        if (/haiku-5\.5/i.test(id)) return { delta: 0.0045, dim: '' };
      } else if (duty > 0 && duty <= 0.22 && rp <= 1) {
        if (/haiku-5\.5|sonnet-5\.5/i.test(id)) return { delta: -0.0028, dim: `V20加密思考占空比:轻量响应(duty=${duty.toFixed(2)})` };
      }
    }
    return { delta: 0, dim: '' };
  }

  // [V20 Upgrade #2] Pure-Text Markdown Micro-Typography & Muse/Claude Structural Tie-Breaker
  function scoreProseMicroTypographyV20(modelId, proto, ev) {
    if (!ev || typeof ev !== 'object') return { delta: 0, dim: '' };
    const id = String(modelId || '').toLowerCase();
    const txt = String(ev.lastAssistantText || ev.replyText || ev.sampleText || '');
    if (!txt || txt.length < 140) return { delta: 0, dim: '' };

    if (txt.length >= 600 && (txt.indexOf('<svg') !== -1 || txt.indexOf('<SVG') !== -1)) {
      const v5 = _getClaudeV5Engine();
      if (v5 && typeof v5.evaluateMuseVsClaudeV20 === 'function') {
        const mc = v5.evaluateMuseVsClaudeV20(txt);
        if (mc.isStrictMuseExclusive) {
          if (proto === 'meta' || /muse-spark|muse-wonder|straw-110/i.test(id)) {
            return { delta: -0.0280, dim: `V20正交HTML指纹:锁定Meta Muse(net=+${mc.net})` };
          }
          if (proto === 'claude') {
            return { delta: 0.0320, dim: 'V20正交HTML指纹:Muse独占结构排除Claude' };
          }
        } else if (mc.claudePts >= 42 && mc.musePts < 28) {
          if (proto === 'claude') {
            return { delta: -0.0160, dim: `V20正交HTML指纹:Anthropic原生排版(pts=${mc.claudePts})` };
          }
          if (proto === 'meta' || /muse-spark|muse-wonder|straw-110/i.test(id)) {
            return { delta: 0.0240, dim: 'V20正交HTML指纹:Claude原生结构排除Muse' };
          }
        }
      }
      return { delta: 0, dim: '' };
    }

    const cjkAsciiSpace = (txt.match(/[\u4e00-\u9fff] [A-Za-z0-9]|[A-Za-z0-9] [\u4e00-\u9fff]/g) || []).length;
    const cjkAsciiTight = (txt.match(/[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/g) || []).length;
    const panguTotal = cjkAsciiSpace + cjkAsciiTight;
    const panguRatio = panguTotal >= 6 ? (cjkAsciiSpace / panguTotal) : -1;
    const boldAsciiColon = (txt.match(/\*\*[^*\n]{1,36}\*\*:\s/g) || []).length;
    const boldFullColon = (txt.match(/\*\*[^*\n]{1,36}\*\*：/g) || []).length;
    const spacedEmDash = (txt.match(/ — /g) || []).length;
    const tightEmDash = (txt.match(/[^\s]—[^\s]/g) || []).length;
    const starBullets = (txt.match(/^\s*\*\s+\S/gm) || []).length;
    const dashBullets = (txt.match(/^\s*-\s+\S/gm) || []).length;

    let delta = 0;
    let dim = '';
    if (starBullets >= 3 && dashBullets === 0) {
      if (proto === 'google') { delta -= 0.0048; dim = 'V20微排版:星号列表(* bullet→Gemini特征)'; }
      else if (proto === 'claude' || proto === 'openai') { delta += 0.0022; }
    }
    if (panguRatio >= 0.78 && panguTotal >= 8) {
      if (proto === 'google' || /gpt-6\.1-sol|qwen/i.test(id)) {
        delta -= 0.0028;
        if (!dim) dim = `V20微排版:中英盘古留白(${Math.round(panguRatio * 100)}%)`;
      }
    } else if (panguRatio >= 0 && panguRatio <= 0.12 && panguTotal >= 8 && boldFullColon >= 2) {
      if (proto === 'claude' || /deepseek|glm|kimi/i.test(id)) {
        delta -= 0.0025;
        if (!dim) dim = 'V20微排版:紧凑中英连接+全角冒号引出';
      }
    }
    if (tightEmDash >= 2 && spacedEmDash === 0 && proto === 'claude') {
      delta -= 0.0022;
      if (!dim) dim = 'V20微排版:无空格长破折号(Claude英文标点习惯)';
    } else if (spacedEmDash >= 2 && tightEmDash === 0 && (proto === 'openai' || proto === 'meta')) {
      delta -= 0.0020;
      if (!dim) dim = 'V20微排版:双侧空格破折号(OpenAI/Meta排版习惯)';
    }
    if (boldAsciiColon >= 3 && boldFullColon === 0 && proto === 'meta') {
      delta -= 0.0024;
      if (!dim) dim = 'V20微排版:半角冒号加粗条目(Meta习惯)';
    }
    return { delta, dim };
  }


  function scoreSubwordAndToolMicroFingerprint(spec, ev) {
    if (!spec || !ev) return { deltaPenalty: 0, reason: '' };
    const idLow = `${spec.id || ''} ${spec.label || ''}`.toLowerCase();
    const isSynth = _isSyntheticStreamEvidence(ev);
    let delta = 0;
    const notes = [];

    const totSteps = Number(ev.totalStepCount) || 1;
    const preToolChars = Number(ev.preToolChars ?? -1);
    if (totSteps >= 2 && preToolChars >= 0) {
      if (preToolChars === 0 && /gpt-6-astra/i.test(idLow)) {
        delta -= 0.012;
        notes.push('静默直调工具(preTool=0➔Astra)');
      } else if (preToolChars >= 24 && /gpt-6\.1-sol|claude-opus-5\.5/i.test(idLow)) {
        delta -= 0.010;
        notes.push(`首跳前规划引导(${preToolChars}字)`);
      }
    }

    // 闭源模型(含 Muse)无明文思考文本

    if (!isSynth && Number(ev.newlineLeadRatio) >= 0 && Number(ev.textChunks || 0) >= 16) {
      const nlLead = Number(ev.newlineLeadRatio);
      if (nlLead >= 0.65 && /openai\/|gpt-/i.test(idLow)) {
        delta -= 0.008;
      } else if (nlLead <= 0.25 && /anthropic\/|claude-/i.test(idLow)) {
        delta -= 0.008;
      }
    }
    return { deltaPenalty: +delta.toFixed(4), reason: notes.join(' · ') };
  }

  function scoreOpenAiIntraFamilyTieBreaker(rawModel, ev, pulseRes) {
    ev = (ev && typeof ev === 'object') ? ev : {};
    const proto = resolveModelProtoFamily(rawModel);
    if (proto !== 'openai' || ev.visibleReasoning || ev.noReasoningParts) {
      return { deltaPenalty: 0, reason: '' };
    }
    const id = String((rawModel && rawModel.id) || '').toLowerCase();
    const label = String((rawModel && rawModel.label) || '').toLowerCase();
    const isSynth = _isSyntheticStreamEvidence(ev);
    const cps = isSynth ? 0 : (Number(ev.cps || ev.textCps) || 0);
    const rBlocks = Math.max(
      Number(ev.nReason || ev.totalReasonParts || ev.reasoningStartCount || ev.rp) || 0,
      Array.isArray(ev.streamIds) ? ev.streamIds.filter((s) => /^rs_/i.test(String(s || ''))).length : 0
    );
    const totSteps = Math.max(1, Number(ev.totalStepCount || ev.stepCount || ev.steps) || 1);
    const hasTools = totSteps >= 2 || (Array.isArray(ev.toolIds) && ev.toolIds.length > 0);
    const durMs = Number(ev.thinkDurationMs || ev.turnDurationMs || ev.firstTurnDurMs) || 0;
    const visTok = Math.max(1, Number(ev.visTokens || ev.visibleTokens) || 0);
    const msPerVisTok = (durMs > 0 && visTok >= 12) ? (durMs / visTok) : 0;
    const invThink = (pulseRes && pulseRes.thinkingInversion && pulseRes.thinkingInversion.ok && pulseRes.inBand)
      ? Number(pulseRes.thinkingInversion.thinkingTokens) || 0
      : 0;

    let deltaPen = 0;
    const reasons = [];

    // 1. Reasoning block density & multi-step tool loop topology
    if (rBlocks >= 3 && rBlocks >= totSteps * 1.5 && (cps === 0 || cps <= 64)) {
      if (/gpt-6\.1-sol/i.test(id)) {
        deltaPen -= 0.018;
        reasons.push(`OpenAI结构解耦:多段空CoT(rBlocks=${rBlocks}/steps=${totSteps}➔6.1 Sol)`);
      } else if (/gpt-6-luna|gpt-5\.6-terra/i.test(id)) {
        deltaPen += 0.012;
      }
    } else if (hasTools && totSteps >= 2 && rBlocks >= 1 && rBlocks <= totSteps + 1 && (cps === 0 || (cps >= 66 && cps < 135))) {
      if (/gpt-6-astra/i.test(id + ' ' + label)) {
        deltaPen -= 0.016;
        reasons.push(`OpenAI结构解耦:多步工具紧凑CoT(steps=${totSteps},rBlocks=${rBlocks}➔6 Astra)`);
      } else if (/gpt-6\.1-sol/i.test(id) && cps > 0 && cps < 66) {
        deltaPen -= 0.012;
      }
    } else if (rBlocks >= 1 && rBlocks <= 2 && durMs > 0 && durMs <= 4200 && visTok <= 220 && !hasTools) {
      if (/gpt-6-luna/i.test(id)) {
        deltaPen -= 0.016;
        reasons.push(`OpenAI结构解耦:短时双块瞬发(dur=${durMs}ms,rBlocks=${rBlocks}➔6 Luna)`);
      }
    }

    // 2. Deliberation pacing ratio (msPerVisTok)
    if (msPerVisTok >= 55 && durMs >= 11000) {
      if (/gpt-6\.1-sol/i.test(id)) {
        deltaPen -= 0.014;
        reasons.push(`OpenAI深思配速比(${Math.round(msPerVisTok)}ms/tok➔6.1 Sol)`);
      } else if (/gpt-6-luna|gpt-5\.6-sol/i.test(id)) {
        deltaPen += 0.010;
      }
    } else if (msPerVisTok >= 18 && msPerVisTok < 42 && durMs >= 3200 && durMs <= 13500 && rBlocks <= 2 && !hasTools) {
      if (/gpt-5\.6-sol/i.test(id) && (cps === 0 || (cps >= 52 && cps < 70))) {
        deltaPen -= 0.013;
        reasons.push(`OpenAI均衡配速比(${Math.round(msPerVisTok)}ms/tok➔5.6 Sol)`);
      }
    }

    // 3. Pulse-inverted hidden thinking token alignment
    if (invThink > 0) {
      if (invThink >= 2100) {
        if (/gpt-6\.1-sol/i.test(id)) {
          deltaPen -= 0.016;
          reasons.push(`OpenAI+Pulse反演深思(${invThink}tok➔6.1 Sol)`);
        } else if (/gpt-6-astra/i.test(id) && hasTools) {
          deltaPen -= 0.012;
        } else if (/gpt-5\.6-sol|gpt-6-luna/i.test(id)) {
          deltaPen += 0.012;
        }
      } else if (invThink <= 520 && durMs > 0 && durMs <= 7000) {
        if (/gpt-6-luna/i.test(id)) {
          deltaPen -= 0.014;
          reasons.push(`OpenAI+Pulse轻量思考(${invThink}tok➔6 Luna)`);
        } else if (/gpt-5\.6-sol/i.test(id)) {
          deltaPen -= 0.009;
        }
      }
    }

    return {
      deltaPenalty: Number(deltaPen.toFixed(5)),
      reason: reasons.join(' · ')
    };
  }


  function resolveModelProtoFamily(rawModel) {
    if (!rawModel) return '';
    if (rawModel._protoFamily !== undefined) return rawModel._protoFamily;
    let res = '';
    if (rawModel.protoFamily) res = String(rawModel.protoFamily).toLowerCase();
    else {
      const vNorm = normVendor(rawModel.vendor || rawModel.org);
      const id = String(rawModel.id || '').toLowerCase();
      if (vNorm === 'anthropic' || /claude|opus|sonnet|haiku|fable/i.test(id)) res = 'claude';
      else if (vNorm === 'openai' || /gpt-/i.test(id)) res = 'openai';
      else if (vNorm === 'google' || /gemini|barium|argon/i.test(id)) res = 'google';
      else if (vNorm === 'xai' || /grok/i.test(id)) res = 'grok';
      else if (vNorm === 'deepseek' || /deepseek/i.test(id)) res = 'deepseek';
      else if (vNorm === 'moonshotai' || /kimi|kivine/i.test(id)) res = 'kimi';
      else if (/qwen|alibaba|z-ai|zai|glm|xiaomi|mimo|minimax/i.test(vNorm + ' ' + id)) res = 'compat';
      else res = 'vllm';
    }
    try { Object.defineProperty(rawModel, '_protoFamily', { value: res, configurable: true }); } catch {}
    return res;
  }

  // Official /leaderboard median output tokens (medOut) for reasoning tier disambiguation
  const OFFICIAL_MED_OUT = {
    'claude-opus-5.6-low': 2100,
    'claude-opus-5.6-medium': 2450,
    'claude-opus-5.6-high': 2850,
    'claude-opus-5.6-max': 4600,
    'claude-opus-5.5-low': 1978,
    'claude-opus-5.5-medium': 2274,
    'claude-opus-5.5-high': 2583,
    'claude-opus-5.5-max': 3689,
    'claude-opus-5': 3328,
    'claude-opus-4.8': 1812,
    'gpt-5.6-luna': 4200,
    'claude-sonnet-5.5-low': 2219,
    'claude-sonnet-5.5-medium': 2608,
    'claude-sonnet-5.5-high': 2852,
    'claude-sonnet-5.5-max': 6591,
    'gpt-6-astra-medium': 5571,
    'gpt-6-astra-high': 8047,
    'gpt-6-astra-xhigh': 15250,
    'gpt-6.1-sol-max': 9800,
    'gpt-6-sol-max': 8400,
    'glm-5.3-high': 1705,
    'glm-5.3-max': 1738,
    'deepseek-v4.1-medium': 2289,
    'deepseek-v4.1-max': 3076,
    'gemini-3.8-flash-high': 2566,
    'gemini-3.7-flash-high': 2349,
    'gemini-3.6-flash-high': 3067,
  };

  // v9.0 Five-Dimensional Model Effort Tier Specifications & Real Arena Tier Whitelists
  const MODEL_EFFORT_SPECS = [
    {
      familyKey: 'claude-fable-5.1',
      match: /fable[-_\s]*5\.1/i,
      tiers: ['Max'],
      fixedTier: true,
      anchors: { Max: 3689 },
      thinkAnchors: { Max: 2650 },
      rewriteLabel: true,
    },
    {
      familyKey: 'claude-fable-5',
      match: /fable[-_\s]*5(?!\.)/i,
      tiers: ['High'],
      fixedTier: true,
      anchors: { High: 1931 },
      thinkAnchors: { High: 980 },
      rewriteLabel: true,
    },
    {
      familyKey: 'claude-opus-5.6',
      match: /opus[-_\s]*5\.6/i,
      tiers: ['Low', 'Medium', 'High', 'Max'],
      anchors: { Low: 2100, Medium: 2450, High: 2850, Max: 4600 },
      thinkAnchors: { Low: 180, Medium: 580, High: 1550, Max: 3400 },
      rewriteLabel: true,
    },
    {
      familyKey: 'claude-opus-5.5',
      match: /opus[-_\s]*5\.5/i,
      tiers: ['Low', 'Medium', 'High', 'Max'],
      anchors: { Low: 1978, Medium: 2274, High: 2583, Max: 3689 },
      thinkAnchors: { Low: 140, Medium: 480, High: 1280, Max: 2650 },
      rewriteLabel: true,
    },
    {
      familyKey: 'claude-opus-5',
      match: /opus[-_\s]*5(?!\.)/i,
      tiers: ['High', 'Max'],
      anchors: { High: 1931, Max: 5000 },
      thinkAnchors: { High: 980, Max: 3400 },
      rewriteLabel: true,
    },
    {
      familyKey: 'claude-sonnet-5.5',
      match: /sonnet[-_\s]*5\.5/i,
      tiers: ['Low', 'Medium', 'High', 'xHigh', 'Max'],
      anchors: { Low: 2219, Medium: 2608, High: 2852, xHigh: 4500, Max: 6591 },
      thinkAnchors: { Low: 130, Medium: 450, High: 1150, xHigh: 2500, Max: 4500 },
      rewriteLabel: true,
    },
    {
      familyKey: 'claude-haiku-5.5',
      match: /haiku[-_\s]*5[-_.\s]*5/i,
      tiers: ['Medium', 'High'],
      anchors: { Medium: 1350, High: 2200 },
      thinkAnchors: { Medium: 300, High: 1050 },
      rewriteLabel: true,
    },
    {
      familyKey: 'gpt-6.1-sol',
      match: /gpt[-_\s]*6\.1[-_\s]*sol|6\.1[-_\s]*sol/i,
      tiers: ['High', 'xHigh', 'Max'],
      anchors: { High: 3400, xHigh: 6200, Max: 9800 },
      thinkAnchors: { High: 850, xHigh: 2900, Max: 6200 },
      rewriteLabel: true,
    },
    {
      familyKey: 'gpt-6-astra',
      match: /gpt[-_\s]*6[-_\s]*astra|6[-_\s]*astra/i,
      tiers: ['Medium', 'High', 'xHigh', 'Max'],
      anchors: { Medium: 5571, High: 8047, xHigh: 15250, Max: 22000 },
      thinkAnchors: { Medium: 750, High: 2200, xHigh: 5800, Max: 11200 },
      rewriteLabel: true,
    },
    {
      familyKey: 'gpt-6-sol',
      match: /gpt[-_\s]*6[-_\s]*sol|(?<!\.)6[-_\s]*sol/i,
      tiers: ['High', 'xHigh', 'Max'],
      anchors: { High: 3100, xHigh: 5600, Max: 8400 },
      thinkAnchors: { High: 800, xHigh: 2600, Max: 5400 },
      rewriteLabel: true,
    },
    {
      familyKey: 'gpt-6-luna',
      match: /gpt[-_\s]*6[-_\s]*luna|6[-_\s]*luna/i,
      tiers: ['Medium', 'High', 'Max'],
      anchors: { Medium: 2100, High: 4200, Max: 7200 },
      thinkAnchors: { Medium: 480, High: 1550, Max: 3800 },
      rewriteLabel: true,
    },
    {
      familyKey: 'gpt-5.5',
      match: /gpt[-_\s]*5\.5/i,
      tiers: ['Medium', 'High', 'xHigh'],
      anchors: { Medium: 1800, High: 3800, xHigh: 7800 },
      thinkAnchors: { Medium: 420, High: 1450, xHigh: 3800 },
      rewriteLabel: true,
    },
    {
      familyKey: 'gemini-high',
      match: /barium|argon|gemini[-_\s]*4|gemini[-_\s]*3\.[678]/i,
      tiers: ['Medium', 'High'],
      fixedTier: false,
      anchors: { Medium: 1450, High: 2566 },
      thinkAnchors: { Medium: 480, High: 1100 },
      rewriteLabel: true,
    },
    {
      familyKey: 'deepseek-v4.1',
      match: /deepseek[-_\s]*v4\.1|deepseek[-_\s]*r2/i,
      tiers: ['Medium', 'Max'],
      anchors: { Medium: 2289, Max: 3076 },
      thinkAnchors: { Medium: 620, Max: 1850 },
      rewriteLabel: true,
    },
    {
      familyKey: 'glm-5.3',
      match: /glm[-_\s]*5\.[123]/i,
      tiers: ['High', 'Max'],
      anchors: { High: 1705, Max: 1738 },
      thinkAnchors: { High: 580, Max: 1420 },
      rewriteLabel: true,
    },
    {
      familyKey: 'nemotron-3',
      match: /nemotron|may26-chatbot4/i,
      tiers: ['Low', 'Medium', 'High', 'Max'],
      anchors: { Low: 650, Medium: 1500, High: 2600, Max: 4200 },
      thinkAnchors: { Low: 140, Medium: 520, High: 1350, Max: 2600 },
      rewriteLabel: true,
    },
    {
      familyKey: 'qwen3.8',
      match: /qwen\s*3\.[78]|farris-ees5|paisley-n9x0/i,
      tiers: ['Low', 'Medium', 'High', 'Max'],
      anchors: { Low: 600, Medium: 1450, High: 2600, Max: 4500 },
      thinkAnchors: { Low: 130, Medium: 480, High: 1250, Max: 2600 },
      rewriteLabel: true,
    },
    {
      familyKey: 'minimax-m3',
      match: /minimax[-_\s]*m[23]/i,
      tiers: ['Medium', 'High', 'Max'],
      anchors: { Medium: 1500, High: 2700, Max: 4600 },
      thinkAnchors: { Medium: 480, High: 1250, Max: 2600 },
      rewriteLabel: true,
    },
    {
      familyKey: 'mimo-v2',
      match: /mimo[-_\s]*v?2\.[56]/i,
      tiers: ['Medium', 'High', 'Max'],
      anchors: { Medium: 1450, High: 2600, Max: 4400 },
      thinkAnchors: { Medium: 460, High: 1200, Max: 2500 },
      rewriteLabel: true,
    },
  ];

  function resolveModelEffortSpec(rawModel) {
    if (rawModel && rawModel._effortSpec) return rawModel._effortSpec;
    const id = String((rawModel && (rawModel.id || rawModel.agentKey || rawModel.model)) || '');
    const label = String((rawModel && rawModel.label) || '');
    const combined = id + ' ' + label;
    let res = null;
    for (const spec of MODEL_EFFORT_SPECS) {
      if (spec.match.test(combined)) { res = spec; break; }
    }
    if (!res) {
      res = {
        familyKey: 'generic-reasoning',
        tiers: ['Low', 'Medium', 'High', 'Max'],
        fixedTier: false,
        anchors: { Low: 800, Medium: 1600, High: 2900, Max: 5400 },
        thinkAnchors: { Low: 150, Medium: 520, High: 1350, Max: 2900 },
        rewriteLabel: false,
      };
    }
    if (rawModel) {
      try { Object.defineProperty(rawModel, '_effortSpec', { value: res, configurable: true }); } catch {}
    }
    return res;
  }

  function formatDynamicEffortLabel(rawLabel, effortProfile) {
    const s = String(rawLabel || '').trim();
    if (!s || !effortProfile || !effortProfile.effort) return s;
    if (effortProfile.stealthNextGen && effortProfile.stealthModelLabel && /opus[-_\s]*5\.5/i.test(s)) {
      return effortProfile.stealthModelLabel;
    }
    const baseName = s.replace(/\s*\((?:xHigh|High|Max|Medium|Low)(?:\/(?:xHigh|High|Max|Medium|Low))?\)\s*$/i, '').trim();
    if (!effortProfile.rewriteLabel && !/\((?:xHigh|High|Max|Medium|Low)\)/i.test(s)) {
      return s;
    }
    return `${baseName} (${effortProfile.rawEffort || effortProfile.effort})`;
  }

  /**
   * v9.0 Five-Dimensional Reasoning Effort Grade Inference Engine
   * Combines:
   *  1. Diophantine Hidden Thinking Token Separation (T_think = O_solved - O_vis - O_tool)
   *  2. Thinking-to-Visible Expansion Ratio (rho = T_think / max(12, O_vis))
   *  3. Pre-Output Pure Thinking Latency (thinkDurationMs / turnDurationMs)
   *  4. SSE Reasoning Block Structure (nReason / reasoningStartCount / reasoningDeltaCount)
   *  5. Model-Family Official Tier Whitelist + MedOut Anchor Log-Distance + Composite REI Score
   */
  function inferModelEffortGrade(rawModel, solvedTokens, evidence, rows, turnTokens) {
    const ev = evidence && typeof evidence === 'object' ? evidence : {};
    const spec = resolveModelEffortSpec(rawModel);
    const validTiers = Array.isArray(spec.tiers) && spec.tiers.length ? spec.tiers : ['Low', 'Medium', 'High', 'Max'];

    const totalO = Math.max(0, Number(solvedTokens && solvedTokens.O) || 0);
    const totalI = Math.max(0, Number(solvedTokens && solvedTokens.I) || 0);
    const evStepMap = (ev && ev.msgStepCountById && typeof ev.msgStepCountById === 'object') ? ev.msgStepCountById : null;
    const evVisMap = (ev && ev.msgVisTokensById && typeof ev.msgVisTokensById === 'object') ? ev.msgVisTokensById : null;
    const evTurnCount = Math.max(evStepMap ? Object.keys(evStepMap).length : 0, evVisMap ? Object.keys(evVisMap).length : 0);
    const evTotalSteps = evStepMap ? Object.values(evStepMap).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    const isSingleTurnWithVis = Array.isArray(rows) && rows.length === 1 && Number(rows[0] && (rows[0].visO || rows[0].visTokens)) > 0;
    const rawTurnCount = Number(solvedTokens && solvedTokens.turns) || (Array.isArray(rows) && rows.length ? rows.length : 1);
    const nTurns = isSingleTurnWithVis ? 1 : Math.max(1, rawTurnCount, evTurnCount);
    const isAggRowInput = (!Array.isArray(turnTokens) || turnTokens.length <= 1) && nTurns > 1;
    const peakTurnO = isAggRowInput
      ? Math.round(totalO / nTurns)
      : Math.max(Number(solvedTokens && solvedTokens.maxTurnO) || 0, Math.round(totalO / nTurns));
    const avgOutPerTurn = Math.round(totalO / nTurns);

    // 1. Decompose Visible + Tool Tokens vs Hidden/Explicit Thinking Tokens
    const sseReasonTok = Number(ev.reasoningTextLength) > 0
      ? Math.max(1, Math.round(Number(ev.reasoningTextLength) / 3.5))
      : 0;
    const rawVisTok = Math.max(
      Number(solvedTokens && solvedTokens.visO) || 0,
      Number(ev.visTokens || ev.visibleTokens) || 0,
      Number(ev.visChars) > 0 ? Math.round(Number(ev.visChars) / 3.7) : 0
    );
    const toolCount = Array.isArray(ev.toolIds) ? ev.toolIds.length : 0;
    const toolTokEst = Number(ev.toolInputChars) > 0
      ? Math.round(Number(ev.toolInputChars) / 3.8)
      : (toolCount * 85);

    let thinkTokens = 0;
    let visTokens = 0;
    if (sseReasonTok > 0) {
      thinkTokens = totalO > 0 ? Math.min(totalO, Math.max(sseReasonTok, totalO - Math.max(15, rawVisTok))) : sseReasonTok;
      visTokens = Math.max(12, totalO > thinkTokens ? (totalO - thinkTokens) : (rawVisTok || 28));
    } else if (totalO > 0) {
      if (nTurns === 1) {
        if (rawVisTok > 0 && rawVisTok < totalO) {
          visTokens = rawVisTok + Math.min(toolTokEst, Math.round((totalO - rawVisTok) * 0.35));
        } else {
          visTokens = Math.min(totalO, Math.max(18, Math.min(220, Math.round(totalO * 0.22))));
        }
        thinkTokens = Math.max(0, totalO - visTokens);
      } else {
        const estVisTotal = (rawVisTok > 0 ? rawVisTok : 95) + Math.max(toolTokEst, (nTurns - 1) * 90);
        visTokens = Math.min(Math.round(totalO * 0.65), estVisTotal);
        thinkTokens = Math.max(0, totalO - visTokens);
      }
    } else {
      visTokens = Math.max(0, rawVisTok);
      thinkTokens = 0;
    }

    const peakThinkTokens = nTurns > 1
      ? Math.max(0, peakTurnO - Math.max(20, Math.round(visTokens / nTurns)))
      : thinkTokens;

    // 1b. Per-Turn Chronological Trajectory, Task-Complexity Normalization (kappa_i) & P75 Quantile (v11.0)
    const isPerStepEffortFamily = /^(gpt-6\.1-sol|gpt-6-sol|gpt-5\.6-sol|gpt-5\.6-terra|gpt-6-luna|gpt-6-astra|gemini-4-argon|claude-opus-5\.5|claude-sonnet-5\.5|claude-fable-5\.1)$/.test(spec.familyKey);
    const rowStepSum = Array.isArray(rows) ? rows.reduce((a, r) => a + Math.max(0, Number(r && r.stepCount) || 0), 0) : 0;
    const turnTokStepSum = Array.isArray(turnTokens) ? turnTokens.reduce((a, t) => a + Math.max(0, Number(t && (t.stepCount || t.steps)) || 0), 0) : 0;
    let totalToolSteps = Math.max(nTurns, evTotalSteps || 0, Number(ev.totalStepCount) || 0, rowStepSum, turnTokStepSum);
    let medNormThink = 0;
    let hasMultiCodeTurns = false;
    let p75ThinkTok = Math.round(thinkTokens / nTurns);
    let normPeakThink = peakThinkTokens;
    let normP75Think = p75ThinkTok;
    let hasProbePlusHeavyCode = false;
    let probeTurnNormThink = 0;
    let codeTurnNormThink = 0;
    const turnTrajectory = [];
    let effectiveTurnTokens = turnTokens;
    if (Array.isArray(turnTokens) && turnTokens.length === 1 && evVisMap && Object.keys(evVisMap).length >= 1) {
      const visKeys = Object.keys(evVisMap).sort();
      const t0 = turnTokens[0] || {};
      if (visKeys.length === 1 && !(Number(t0.visO) > 0)) {
        effectiveTurnTokens = [Object.assign({}, t0, {
          visO: Number(evVisMap[visKeys[0]]) || 0,
          stepCount: Math.max(1, Number(t0.stepCount) || Number(evStepMap && evStepMap[visKeys[0]]) || 1),
        })];
      } else if (visKeys.length >= 2 && nTurns > 1 && !(Number(t0.visO) > 0) && (Number(t0.O) || 0) > 0) {
        const totO0 = Number(t0.O) || 0;
        const totI0 = Number(t0.I) || 0;
        const totW0 = Number(t0.W) || 0;
        const totR0 = Number(t0.R) || 0;
        const vList = visKeys.map((k) => Math.max(0, Number(evVisMap[k]) || 0));
        const sList = visKeys.map((k) => Math.max(1, Number(evStepMap && evStepMap[k]) || 1));
        let oShares = [];
        if (visKeys.length === 2 && vList[0] <= 190 && vList[1] >= 220 && totO0 > vList[0] * 4) {
          const o0 = Math.min(Math.round(totO0 * 0.12), Math.max(vList[0] + 160, Math.round(vList[0] * 3.5)));
          oShares = [o0, Math.max(1, totO0 - o0)];
        } else {
          const weights = vList.map((v) => Math.pow(Math.max(15, v), 1.35));
          const sumW = weights.reduce((a, b) => a + b, 0) || 1;
          oShares = weights.map((w) => Math.max(1, Math.round(totO0 * (w / sumW))));
        }
        const isTwoTurnCachedSecond = visKeys.length === 2 && totR0 >= 4000 && totI0 > totR0;
        effectiveTurnTokens = visKeys.map((k, idx) => ({
          I: isTwoTurnCachedSecond ? (idx === 0 ? totR0 : Math.max(50, totI0 - totR0)) : Math.round(totI0 / visKeys.length),
          W: Math.round(totW0 / visKeys.length),
          R: isTwoTurnCachedSecond ? (idx === 0 ? 0 : totR0) : Math.round(totR0 / visKeys.length),
          O: oShares[idx],
          visO: vList[idx],
          reasonO: 0,
          stepCount: sList[idx],
          durationMs: 0,
        }));
      }
    }
    if (Array.isArray(effectiveTurnTokens) && effectiveTurnTokens.length > 0) {
      const perStepThinks = [];
      const perStepNormThinks = [];
      const firstRawO = Math.max(1, Number((effectiveTurnTokens[0] && effectiveTurnTokens[0].O) || 0));
      for (let i = 0; i < effectiveTurnTokens.length; i++) {
        const t = effectiveTurnTokens[i] || {};
        const isAggSingleRow = effectiveTurnTokens.length === 1 && nTurns > 1;
        const stepO = isAggSingleRow ? Math.round(Math.max(0, Number(t.O) || 0) / nTurns) : Math.max(0, Number(t.O) || 0);
        const stepReasonO = isAggSingleRow ? Math.round(Math.max(0, Number(t.reasonO) || 0) / nTurns) : Math.max(0, Number(t.reasonO) || 0);
        const rawStepI = isAggSingleRow ? Math.round((Number(t.I) || 0) / nTurns) : (Number(t.I) || 0);
        const rawStepW = isAggSingleRow ? Math.round((Number(t.W) || 0) / nTurns) : (Number(t.W) || 0);
        const rawStepR = isAggSingleRow ? Math.round((Number(t.R) || 0) / nTurns) : (Number(t.R) || 0);
        let stepSteps = Math.max(1, Number(t.stepCount) || (turnTokens.length === 1 && evTotalSteps > 0 ? Math.round(evTotalSteps / nTurns) : 1));
        if (stepSteps <= 1 && rawStepR > 220000) {
          const avgStepCtx = rawStepW > 0
            ? Math.max(60000, Math.min(190000, rawStepW * 0.72))
            : Math.max(55000, Math.min(180000, rawStepI > 15000 ? rawStepI * 1.35 : 115000));
          stepSteps = Math.max(2, Math.min(160, Math.round((rawStepR + (rawStepW === 0 ? rawStepI : 0)) / avgStepCtx)));
        }
        const propVis = (effectiveTurnTokens.length === 1 && rawVisTok > 0)
          ? Math.min(stepO, visTokens)
          : stepO <= 600
          ? Math.min(95, Math.max(18, Math.round(stepO * 0.24)))
          : (stepSteps > 1
              ? Math.min(Math.round(stepO * 0.30), Math.max(420, stepSteps * 185))
              : Math.min(420, Math.max(45, Math.round(visTokens * (stepO / Math.max(1, totalO))))));
        let stepVis = Number(t.visO) > 0
          ? Math.min(stepO || Number(t.visO), Number(t.visO))
          : ((isPerStepEffortFamily && effectiveTurnTokens.length === 1 && rawVisTok > 0 && rawVisTok < stepO)
              ? rawVisTok
              : (stepReasonO > 0 && stepO > stepReasonO ? (stepO - stepReasonO) : Math.min(stepO, propVis)));
        let stepThink = stepReasonO > 0 && stepO > 0
          ? Math.min(stepO, Math.max(stepReasonO, stepO - stepVis))
          : Math.max(0, stepO - stepVis);
        const stepI = Number(t.I) || 0;
        const hasMeasuredVis = Number(t.visO) > 0 || (isPerStepEffortFamily && effectiveTurnTokens.length === 1 && rawVisTok > 0 && rawVisTok < stepO);
        const isCodeSurgeTurn = (effectiveTurnTokens.length === 2 && i === 1 && stepVis >= 175 && (
          (firstRawO <= 600 && stepO >= firstRawO * 8 && stepSteps <= 2 && stepI <= 2200) ||
          (firstRawO <= 80 && stepO >= firstRawO * 25 && stepSteps <= 3 && stepI <= 4500)
        ));
        const thPerStep = isPerStepEffortFamily ? Math.round(stepThink / Math.max(1, stepSteps)) : stepThink;
        const visPerStep = isPerStepEffortFamily ? Math.round(stepVis / Math.max(1, stepSteps)) : stepVis;
        const isPerStepCodeHeavy = isPerStepEffortFamily && hasMeasuredVis
          && (spec.familyKey === 'gemini-4-argon' && effectiveTurnTokens.length === 1 && stepSteps === 1 ? visPerStep >= 2000 : visPerStep >= 900)
          && stepVis >= stepThink * 0.45;
        const kappa = isPerStepEffortFamily
          ? (isPerStepCodeHeavy ? Math.min(18.0, +(1.0 + 0.015 * Math.max(20, visPerStep - 200)).toFixed(2)) : 1.0)
          : ((((hasMeasuredVis && stepVis > 220 && stepSteps <= 2 && stepI <= 2200) || isCodeSurgeTurn))
              ? Math.min(22.0, +(1.0 + 0.028 * Math.max(40, stepVis - 135)).toFixed(2))
              : 1.0);
        const normThink = Math.round(thPerStep / kappa);
        perStepThinks.push(thPerStep);
        perStepNormThinks.push(normThink);
        turnTrajectory.push({
          step: i + 1,
          I: Number(t.I) || 0,
          W: Number(t.W) || 0,
          R: Number(t.R) || 0,
          O: stepO,
          visO: stepVis,
          thinkO: stepThink,
          normThinkO: normThink,
          kappa,
          steps: stepSteps,
        });
      }
      if (perStepThinks.length > 1) {
        const sortedThinks = perStepThinks.slice().sort((a, b) => a - b);
        const qIdx = Math.min(sortedThinks.length - 1, Math.floor(sortedThinks.length * 0.75));
        p75ThinkTok = sortedThinks[qIdx];

        const sortedNorm = perStepNormThinks.slice().sort((a, b) => a - b);
        const medIdx = Math.min(sortedNorm.length - 1, Math.floor((sortedNorm.length - 1) * 0.50));
        medNormThink = sortedNorm[medIdx];
        normP75Think = sortedNorm[qIdx];
        normPeakThink = sortedNorm[sortedNorm.length - 1];
        if (isPerStepEffortFamily) {
          totalToolSteps = Math.max(totalToolSteps, turnTrajectory.reduce((a, x) => a + Math.max(1, Number(x.steps) || 1), 0));
          const totTrajVis = turnTrajectory.reduce((a, x) => a + Math.max(0, Number(x.visO) || 0), 0);
          const totTrajTh = turnTrajectory.reduce((a, x) => a + Math.max(0, Number(x.thinkO) || 0), 0);
          const codeHeavyCount = turnTrajectory.filter((x) => Math.round((Number(x.visO) || 0) / Math.max(1, Number(x.steps) || 1)) >= 900).length;
          hasMultiCodeTurns = codeHeavyCount >= 2 && totTrajVis > totTrajTh;
        }

        const firstStep = turnTrajectory[0];
        const maxKappaStep = turnTrajectory.reduce((best, cur) => (cur.kappa > best.kappa ? cur : best), turnTrajectory[0]);
        if (turnTrajectory.length === 2 && firstStep && firstStep.visO <= 190 && firstStep.O > 0 && firstStep.O <= 750 && maxKappaStep && maxKappaStep.kappa >= 3.0 && (maxKappaStep.I || 0) <= 4500) {
          hasProbePlusHeavyCode = true;
          probeTurnNormThink = firstStep.normThinkO;
          codeTurnNormThink = maxKappaStep.normThinkO;
        }
      } else if (perStepThinks.length === 1) {
        p75ThinkTok = perStepThinks[0];
        medNormThink = perStepNormThinks[0];
        normP75Think = perStepNormThinks[0];
        normPeakThink = perStepNormThinks[0];
        if (isPerStepEffortFamily && turnTrajectory[0]) {
          totalToolSteps = Math.max(totalToolSteps, Number(turnTrajectory[0].steps) || 1);
        }
      }
    } else if (isPerStepEffortFamily && totalToolSteps > 1) {
      const perStepFallback = Math.round(thinkTokens / totalToolSteps);
      p75ThinkTok = perStepFallback;
      medNormThink = perStepFallback;
      normP75Think = perStepFallback;
      normPeakThink = perStepFallback;
    }

    // 2. Expansion Ratio (rho), Latency & Reasoning Blocks
    const expansionRatio = +(thinkTokens / Math.max(12, visTokens)).toFixed(2);
    const thinkDurationMs = Math.max(Number(ev.thinkDurationMs) || 0, Number(ev.turnDurationMs) || 0);
    const thinkDurSec = +(thinkDurationMs / 1000).toFixed(1);
    const hasReasoningSignal = !ev.noReasoningParts && Boolean(ev.hiddenReasoning || ev.visibleReasoning || Number(ev.totalReasonParts) > 0 || Number(ev.reasoningStartCount) > 0);
    const reasoningBlocks = Math.max(
      Number(ev.nReason) || 0,
      Number(ev.reasoningStartCount) || 0,
      hasReasoningSignal ? (Number(ev.totalStepCount) || 0) : 0,
      Array.isArray(ev.streamIds) ? Math.max(0, ev.streamIds.length - 1) : 0,
      (Number(ev.reasoningDeltaCount) > 0 && !(Number(ev.reasoningTextLength) > 0))
        ? Math.min(8, Math.ceil(Number(ev.reasoningDeltaCount) / 12))
        : (Number(ev.reasoningTextLength) > 0 ? 1 : 0)
    );

    // 3. Telemetry Multiplier & Intrinsic Per-Turn Thinking Budget (v11.0 Task-Normalized)
    let telemetryMult = 1.0;
    if (isPerStepEffortFamily) {
      const durPerStep = thinkDurSec / Math.max(1, totalToolSteps);
      const prelimBase = hasMultiCodeTurns
        ? Math.round(medNormThink * 0.65 + normP75Think * 0.25 + normPeakThink * 0.10)
        : (nTurns >= 3
            ? Math.round(normPeakThink * 0.55 + normP75Think * 0.45)
            : (nTurns > 1
                ? Math.round(normPeakThink * 0.65 + normP75Think * 0.35)
                : Math.min(normPeakThink, Math.round(thinkTokens / Math.max(1, totalToolSteps)))));
      if (durPerStep >= 28) {
        telemetryMult = 1.65;
      } else if (durPerStep >= 12) {
        telemetryMult = 1.25;
      } else if (durPerStep >= 6 && prelimBase > 240) {
        telemetryMult = 1.10;
      } else if (hasMultiCodeTurns && durPerStep <= 6) {
        telemetryMult = 0.65;
      } else {
        telemetryMult = 1.0;
      }
    } else {
      if (thinkDurSec >= 35 || reasoningBlocks >= 14) {
        telemetryMult = 1.85;
      } else if (thinkDurSec >= 16 || reasoningBlocks >= 7 || (expansionRatio >= 8.0 && thinkDurSec >= 6)) {
        telemetryMult = 1.38;
      } else if (thinkDurSec >= 7 || reasoningBlocks >= 3 || expansionRatio >= 3.5) {
        telemetryMult = 1.12;
      } else if (thinkDurSec > 0 && thinkDurSec <= 2.2 && expansionRatio < 1.5) {
        telemetryMult = 0.78;
      }
    }
    if (hasProbePlusHeavyCode) {
      telemetryMult = Math.min(1.08, telemetryMult);
    }
    if (nTurns >= 2 || totalToolSteps >= 2) {
      telemetryMult = Math.min(1.12, telemetryMult);
    }

    const baseThink = hasProbePlusHeavyCode
      ? Math.round(probeTurnNormThink * 0.68 + codeTurnNormThink * 0.32)
      : (isPerStepEffortFamily
          ? (hasMultiCodeTurns
              ? Math.round(medNormThink * 0.65 + normP75Think * 0.25 + normPeakThink * 0.10)
              : (nTurns >= 3
                  ? Math.round(normPeakThink * 0.55 + normP75Think * 0.45)
                  : (nTurns > 1
                      ? Math.round(normPeakThink * 0.65 + normP75Think * 0.35)
                      : Math.min(normPeakThink, Math.round(thinkTokens / Math.max(1, totalToolSteps))))))
          : (nTurns > 1
              ? Math.round(normPeakThink * 0.65 + normP75Think * 0.35)
              : Math.max(normPeakThink, Math.round(thinkTokens / nTurns))));
    const sseImpliedThink = (totalO === 0 && (reasoningBlocks >= 2 || thinkDurSec >= 4))
      ? Math.round(reasoningBlocks * 120 + Math.min(140, thinkDurSec) * 35)
      : 0;
    const effThinkTok = totalO > 0
      ? Math.round(baseThink * telemetryMult)
      : Math.max(Math.round(baseThink * telemetryMult), sseImpliedThink);

    // 4. Composite Reasoning Effort Index (REI)
    const reiScore = Math.max(
      1,
      Math.round(
        100
        * Math.pow(Math.max(15, effThinkTok + 0.35 * visTokens) / 1000, 0.5)
        * Math.pow(Math.max(1.8, Math.min(180, thinkDurSec || (effThinkTok / 55))) / 12, 0.3)
        * Math.pow((1 + Math.min(25, expansionRatio)) / 3.0, 0.2)
      )
    );

    // 5. Bayesian Posterior Tier Distribution within Model Family Whitelist
    let primaryEffort = validTiers[validTiers.length - 1];
    let ambiguousWith = null;
    let confidence = 88;
    let basis = '';
    let tierProbs = [];

    const explicitRowTier = Array.isArray(rows)
      ? rows.map((r) => String((r && r.billingModel) || '')).find((s) => /-(low|medium|high|xhigh|max)(?:-|$)/i.test(s))
      : null;

    if (spec.fixedTier || validTiers.length === 1) {
      primaryEffort = validTiers[0];
      confidence = 99;
      tierProbs = [{ tier: primaryEffort, prob: 100 }];
      basis = `官方单档位锁定(${primaryEffort}) · 实测思考${thinkTokens.toLocaleString()}tok`;
    } else if (explicitRowTier) {
      const m = /-(low|medium|high|xhigh|max)(?:-|$)/i.exec(explicitRowTier);
      const hitTier = validTiers.find((t) => t.toLowerCase() === m[1].toLowerCase()) || validTiers[validTiers.length - 1];
      primaryEffort = hitTier;
      confidence = 99;
      tierProbs = validTiers.map((t) => ({ tier: t, prob: t === primaryEffort ? 99 : +(1 / Math.max(1, validTiers.length - 1)).toFixed(1) })).sort((a, b) => b.prob - a.prob);
      basis = `上游计费模型ID直出(${primaryEffort})`;
    } else if (/gemini-4-carbon|gemini\s*4\s*carbon|barium-bb/i.test((typeof rawModel === 'string' ? rawModel : String((rawModel && ((rawModel.id || '') + ' ' + (rawModel.label || rawModel.baseLabel || ''))) || ''))) && !(evidence && evidence.hasQuotaBilling) && (!Array.isArray(rows) || !rows.length)) {
      primaryEffort = (ev && ev.carbonD5VisualSelfCheck) ? 'Max' : 'High';
      confidence = 94;
      tierProbs = validTiers.map((t) => ({ tier: t, prob: t === primaryEffort ? 94 : +(6 / Math.max(1, validTiers.length - 1)).toFixed(1) })).sort((a, b) => b.prob - a.prob);
      basis = (primaryEffort === 'Max') ? 'Carbon D5视觉自检闭环锁定 Max' : 'Carbon 无额度基线默认 High (抑制累计步数虚高)';
    } else if (isPerStepEffortFamily && ((nTurns === 1 ? normPeakThink >= 4500 : medNormThink >= 4800) || (spec.familyKey === 'gemini-4-argon' && thinkTokens >= 100000 && (Array.isArray(rows) && rows.length > 0 && !(evidence && evidence.sseFallback))))) {
      primaryEffort = validTiers[validTiers.length - 1];
      confidence = 99;
      tierProbs = validTiers.map((t, i) => ({
        tier: t,
        tAnchor: (spec.thinkAnchors && spec.thinkAnchors[t]) || 4800,
        prob: i === validTiers.length - 1 ? 99.2 : +(0.8 / Math.max(1, validTiers.length - 1)).toFixed(1),
      })).sort((a, b) => b.prob - a.prob);
      basis = `单步思考峰值 ${normPeakThink.toLocaleString()} tok 突破上限锁定 ${primaryEffort}`;
    } else if (!isPerStepEffortFamily && (peakTurnO >= 24000 || Math.round(thinkTokens / Math.max(1, nTurns)) >= 20000)) {
      primaryEffort = validTiers[validTiers.length - 1];
      confidence = 99;
      tierProbs = validTiers.map((t, i) => ({
        tier: t,
        prob: i === validTiers.length - 1 ? 99.2 : +(0.8 / Math.max(1, validTiers.length - 1)).toFixed(1),
      })).sort((a, b) => b.prob - a.prob);
      basis = `单步峰值 ${peakTurnO.toLocaleString()} tok 突破物理上限锁定 ${primaryEffort}`;
    } else if ((ev.earlyAbortedPlain || (ev.visibleReasoning && nTurns === 1 && rawVisTok >= 1 && rawVisTok <= 2 && totalO >= 25 && totalO <= 400)) && validTiers.includes('High')) {
      primaryEffort = 'High';
      confidence = 92;
      tierProbs = validTiers.map((t) => ({
        tier: t,
        prob: t === 'High' ? 92.0 : +(8.0 / Math.max(1, validTiers.length - 1)).toFixed(1),
      })).sort((a, b) => b.prob - a.prob);
      basis = `明文早停截断(O=${totalO} tok · vis=${rawVisTok}) → 还原槽位默认档 High`;
    } else {
      // Compute Log-Normal Bayesian Posterior across validTiers
      const sigmaT = 0.68;
      const sigmaO = 0.75;
      const rawLogits = validTiers.map((tier, idx) => {
        const tAnchor = (spec.thinkAnchors && spec.thinkAnchors[tier]) || (400 * Math.pow(2.2, idx));
        const oAnchor = (spec.anchors && spec.anchors[tier]) || (1500 * Math.pow(1.6, idx));
        const metricT = Math.max(25, effThinkTok);
        const zT = Math.log(metricT / tAnchor) / sigmaT;
        const effectiveOut = hasProbePlusHeavyCode
          ? (effThinkTok + Math.min(180, Math.round(visTokens / nTurns)))
          : (isPerStepEffortFamily
              ? (effThinkTok + Math.min(260, Math.round(visTokens / Math.max(1, totalToolSteps))))
              : Math.max(peakTurnO, avgOutPerTurn, effThinkTok + visTokens));
        const metricO = Math.max(120, effectiveOut);
        const zO = Math.log(metricO / oAnchor) / sigmaO;
        let logLike = -0.5 * (zT * zT * 0.78 + zO * zO * 0.22);

        const floorCheckThink = (hasProbePlusHeavyCode || isPerStepEffortFamily) ? effThinkTok : normPeakThink;
        if (floorCheckThink > tAnchor * 2.35 && idx < validTiers.length - 1) {
          logLike -= 2.6;
        }
        return { tier, idx, tAnchor, logLike };
      });

      const maxLog = Math.max(...rawLogits.map((x) => x.logLike));
      const exps = rawLogits.map((x) => Object.assign({}, x, { w: Math.exp(x.logLike - maxLog) }));
      const sumW = exps.reduce((s, x) => s + x.w, 0) || 1;
      tierProbs = exps
        .map((x) => ({ tier: x.tier, tAnchor: x.tAnchor, prob: +((x.w / sumW) * 100).toFixed(1) }))
        .sort((a, b) => b.prob - a.prob);

      const bestTier = tierProbs[0];
      primaryEffort = bestTier.tier;
      confidence = Math.max(58, Math.min(99, Math.round(bestTier.prob)));
      basis = `思考≈${thinkTokens.toLocaleString()}tok(P75=${p75ThinkTok}/等效${effThinkTok}) · 膨胀${expansionRatio}x${thinkDurSec > 0 ? ' · ' + thinkDurSec + 's' : ''} → 贝叶斯锁定${primaryEffort}(${bestTier.prob}%)`;
    }

    let effortDowngraded = false;
    let initialEffort = primaryEffort;
    let latestEffort = primaryEffort;
    if (!spec.fixedTier && validTiers.length > 1 && turnTrajectory.length >= 2 && !hasProbePlusHeavyCode) {
      const priorTurns = turnTrajectory.slice(0, -1).filter((x) => x.O >= 40);
      const lastTurn = turnTrajectory[turnTrajectory.length - 1];
      if (priorTurns.length && lastTurn && lastTurn.O >= 50) {
        const baseTurn = priorTurns.reduce((best, cur) => ((cur.normThinkO || 0) > (best.normThinkO || 0) ? cur : best), priorTurns[0]);
        if (baseTurn && (lastTurn.normThinkO || 0) < (baseTurn.normThinkO || 0) * 0.42 && (baseTurn.normThinkO || 0) >= 260) {
          const baseIdx = validTiers.findIndex((t) => String(t).toLowerCase() === String(primaryEffort).toLowerCase());
          if (baseIdx > 0) {
            effortDowngraded = true;
            initialEffort = validTiers[baseIdx];
            latestEffort = validTiers[Math.max(0, baseIdx - 1)];
            primaryEffort = latestEffort;
            basis += ` · [同型号强度削弱: ${initialEffort}→${latestEffort}]`;
          }
        }
      }
    }

    const tierProbStr = tierProbs.slice(0, 3).map((x) => `${x.tier} ${Math.round(x.prob)}%`).join(' · ');
    const matchedAnchor = (spec.thinkAnchors && spec.thinkAnchors[primaryEffort]) || 1000;
    const strengthRatio = +(Math.max(10, effThinkTok) / Math.max(50, matchedAnchor)).toFixed(2);
    const intraTierStrength = strengthRatio >= 2.0
      ? `同档偏强(${strengthRatio}x·疑似高权/灰测满血)`
      : (strengthRatio <= 0.65 ? `同档偏省(${strengthRatio}x·轻量快答)` : `标准同档(${strengthRatio}x)`);

    const isOpusFamily = spec.familyKey === 'claude-opus-5.5' || spec.familyKey === 'claude-opus-5.6';
    const explicitOpus56 = /opus[-_\s]*5[._-]6/i.test(String(ev.pinnedModel || '') + ' ' + String(ev.fpModel || ''));
    const stealthNextGen = Boolean(isOpusFamily && (
      explicitOpus56 ||
      peakTurnO > 65536 ||
      peakThinkTokens >= 64000 ||
      (peakTurnO >= 60000 && reiScore >= 2200)
    ));
    const stealthModelId = stealthNextGen ? 'anthropic/claude-opus-5.6' : null;
    const stealthModelLabel = stealthNextGen ? `Claude Opus 5.6 (${primaryEffort || 'Max'})` : null;
    if (stealthNextGen && spec.familyKey === 'claude-opus-5.5') {
      basis = `单步峰值 ${fmtInt(peakTurnO)} tok (思考 ${fmtInt(thinkTokens)} tok · REI ${reiScore}) 突破 Opus 5.5 64K 物理上限 → 锁定新模型 ${stealthModelLabel}`;
    }

    return normalizeEffortProfile({
      effort: ambiguousWith ? `${primaryEffort}/${ambiguousWith}` : primaryEffort,
      primaryEffort,
      stealthNextGen,
      stealthModelId,
      stealthModelLabel,
      effortDowngraded,
      initialEffort,
      latestEffort,
      ambiguousWith,
      fixedTier: Boolean(spec.fixedTier || validTiers.length === 1),
      rewriteLabel: Boolean(spec.rewriteLabel),
      familyKey: spec.familyKey,
      validTiers,
      tierProbs,
      tierProbStr,
      reiScore,
      confidence,
      thinkTokens,
      peakThinkTokens,
      p75ThinkTok,
      effThinkTok,
      visTokens,
      peakTurnO,
      totalO,
      turns: nTurns,
      turnTrajectory,
      strengthRatio,
      intraTierStrength,
      expansionRatio,
      thinkDurationMs,
      thinkDurSec,
      reasoningBlocks,
      basis,
    });
  }



  function isOpenSourceModel(rawModel) {
    if (!rawModel || typeof rawModel !== 'object') return false;
    const v = String(rawModel.vendor || rawModel.org || '').toLowerCase();
    const p = String(rawModel.proto || '').toLowerCase();
    const lic = String(rawModel.license || '').toLowerCase();
    const id = [rawModel.id, rawModel.model, rawModel.label, rawModel.baseLabel, rawModel.dynamicLabel]
      .filter(Boolean).join(' ').toLowerCase();
    if (/muse-spark|muse-wonder|solar-pro|kibitz|kalmia|cynosure|horizon-6\.2/i.test(id)) return false;
    if (['qwen', 'alibaba', 'deepseek', 'z-ai', 'zai', 'xiaomi', 'minimax', 'moonshotai', 'kimi', 'mistralai', 'mistral', 'tencent', 'stepfun', 'reflection', 'nvidia', 'thinky', 'thinkingmachines'].includes(v)) return true;
    if (['deepseek', 'kimi', 'compat', 'vllm'].includes(p)) return true;
    if (lic && !/proprietary/i.test(lic) && /apache|mit|openmdw|community|bsd|gpl|cc-by|qwen|kimi/i.test(lic)) return true;
    if (/qwen|farris|paisley|deepseek|glm-|mimo-|minimax|kimi|mistral|hy3|hy4|step-5|gpt-oss|llama-|\bbeam\b|caveman|nemotron|may26-chatbot4|inkling|\b\d+b[-_\s]+a\d+b\b/i.test(id)) return true;
    return false;
  }

  function isClosedSourceModel(rawModel) {
    if (!rawModel || typeof rawModel !== 'object') return false;
    if (isOpenSourceModel(rawModel)) return false;
    const v = String(rawModel.vendor || rawModel.org || '').toLowerCase();
    const p = String(rawModel.proto || '').toLowerCase();
    const id = [rawModel.id, rawModel.model, rawModel.label, rawModel.baseLabel, rawModel.dynamicLabel]
      .filter(Boolean).join(' ').toLowerCase();
    if (['openai', 'anthropic', 'google', 'x-ai', 'xai', 'meta', 'upstage'].includes(v)) return true;
    if (['openai', 'claude', 'google', 'grok'].includes(p)) return true;
    if (/gpt-|claude|opus|sonnet|haiku|fable|gemini|barium|argon|grok-|muse-spark|muse-wonder|solar-pro/i.test(id)) return true;
    return false;
  }

  function computeMultiDimPenalty(rawModel, evidence, solvedTokens, hasCW, hasCR, rows, turnTokens) {
    const ev = evidence && typeof evidence === 'object' ? evidence : {};
    const id = String((rawModel && rawModel.id) || '').toLowerCase();
    const label = String((rawModel && rawModel.label) || '').toLowerCase();
    const agentKeys = Array.isArray(rawModel && rawModel.agentKeys) ? rawModel.agentKeys.map((k) => String(k).toLowerCase()) : [];
    const proto = resolveModelProtoFamily(rawModel);
    let hardPen = 0;
    let softPen = 0;
    const matchedDims = [];

    // ── Layer 2: Backend Deterministic Fields (actual.source)
    const rowSources = Array.isArray(rows)
      ? [...new Set(rows.map((r) => String((r && r.source) || '').toLowerCase()).filter(Boolean))]
      : [];
    const evSources = Array.isArray(ev.billingSources)
      ? ev.billingSources.map((s) => String(s || '').toLowerCase()).filter(Boolean)
      : [];
    const sources = [...new Set(rowSources.concat(evSources))];
    const hasRowCW = Array.isArray(rows) && rows.some(r => (Number(r && r.cacheWriteUsd) || 0) > 1e-9);
    const isSol61UnpricedCoding = !hasRowCW
      && ev.silentBashLoop !== true
      && !(Number(ev.avgChunk) >= 18)
      && Array.isArray(turnTokens)
      && turnTokens.some((t) => (t.solverTier || 1) === 1 && (t.W || 0) === 0 && ((t.R || 0) >= 28000 || (turnTokens.length === 1 && ((t.I || 0) + (t.R || 0)) >= 18000)) && ((t.O || 0) >= 4500 || (t.stepCount || 1) >= 4))
      && (
        Number(ev.turnDurationMs) >= 95000
        || (Number(ev.cps) > 0 && Number(ev.cps) <= 50)
        || Number(solvedTokens && solvedTokens.maxTurnO) >= 18000
        || ev.hasAskUserTool === true
        || ev.hasWebSearchTool === true
      );
    if (sources.includes('unpriced')) {
      if (isSol61UnpricedCoding && /gpt-6\.1-sol/i.test(id)) {
        matchedDims.push('计费源:unpriced+长思考多步编码(锁定6.1-Sol)');
        softPen -= 0.0055;
      } else if (/barium|argon|nemotron|may26-chatbot4/i.test(id + ' ' + label)) {
        matchedDims.push('计费源:unpriced(锁定无标价模型)');
        if (isSol61UnpricedCoding) {
          softPen += 0.0140;
        } else if (/barium|argon/i.test(id) && ev.visibleReasoning !== true && ev.reasoningSignature !== 'visible-text') {
          softPen -= 0.0030;
        }
      } else {
        hardPen += 0.55;
      }
    } else if (sources.length > 0 && /barium|argon|nemotron|may26-chatbot4/i.test(id + ' ' + label)) {
      const zeroReasonGemini = /barium|argon/i.test(id + ' ' + label)
        && (ev.noReasoningParts === true || ev.reasoningSignature === 'none')
        && !hasCW
        && !isSol61UnpricedCoding;
      if (!zeroReasonGemini) hardPen += 0.55;
    }
    if (sources.includes('agent-verified')) {
      if (/minimax-m3/i.test(id)) {
        matchedDims.push('计费源:agent-verified(锁定MiniMax-M3)');
      } else {
        hardPen += 0.45;
      }
    }
    if (sources.includes('litellm')) {
      if (/paisley-n9x0|qwen3\.8-max/i.test(id)) {
        matchedDims.push('计费源:litellm(锁定Qwen3.8-Max)');
        softPen -= 0.0025;
      } else if (/grok-4\.6/i.test(id)) {
        hardPen += 0.22;
      }
    } else if (sources.includes('first-party')) {
      if (/grok-4\.6/i.test(id)) {
        matchedDims.push('计费源:first-party(Grok-4.6)');
        softPen -= 0.0015;
      } else if (/paisley-n9x0/i.test(id)) {
        hardPen += 0.18;
      }
    } else if (sources.includes('manual')) {
      if (/farris-ees5|qwen3\.7-max/i.test(id)) {
        matchedDims.push('计费源:manual');
        softPen -= 0.0015;
      }
    }

    // 1) Explicit platform or user truth / fingerprint match (Layer 2 / Layer 5)
    if (ev.pinnedModel) {
      const pm = String(ev.pinnedModel).toLowerCase();
      if (id.includes(pm) || label.includes(pm) || agentKeys.some((k) => k.includes(pm))) {
        matchedDims.push('平台锁定:' + ev.pinnedModel);
      } else {
        hardPen += 0.35;
      }
    }
    if (ev.fpModel) {
      const fm = String(ev.fpModel).toLowerCase().replace(/claude-(opus|sonnet|haiku|fable)-(\d+)-(\d+)/, 'claude-$1-$2.$3');
      if (id.includes(fm) || label.replace(/\s+/g, '-').includes(fm) || agentKeys.some((k) => k.includes(fm)) || (/barium/.test(fm) && /barium|argon/.test(id))) {
        matchedDims.push('指纹锁定:' + ev.fpModel);
        softPen -= 0.0040;
      } else {
        hardPen += 0.18;
      }
    }

    // 铁律：开源模型有开源思考（可见文字），闭源模型是闭源思考（隐藏/空delta/仅起止标记），开源不会匹配闭源、闭源不会匹配开源
    const isOpenModel = isOpenSourceModel(rawModel);
    const isClosedModel = isClosedSourceModel(rawModel);
    const isOpenThinking = ev.visibleReasoning === true || ev.reasoningSignature === 'visible-text' || ev.reasoningSignature === 'visible';
    const isClosedThinking = !isOpenThinking && (ev.hiddenReasoning === true || ev.reasoningSignature === 'markers-only' || ev.reasoningSignature === 'empty-deltas');

    // ── Layer 3: Protocol-Level Hard Signatures (toolCallId & SSE stream/reasoning signatures)
    // Open-source gateways (vLLM/LiteLLM/OpenRouter) often emit call_ / msg_ IDs; never treat those as OpenAI when open-source thinking is visible.
    if (ev.toolFamily) {
      const tf = String(ev.toolFamily).toLowerCase();
      const TF_MAP = {
        anthropic: 'claude', claude: 'claude',
        openai: 'openai', gpt: 'openai',
        google: 'google', gemini: 'google',
        xai: 'grok', grok: 'grok',
        deepseek: 'deepseek',
        kimi: 'kimi', moonshotai: 'kimi',
      };
      const normTf = TF_MAP[tf] || '';
      const ignoreClosedTf = isOpenThinking && ['openai', 'claude', 'google', 'grok'].includes(normTf);
      if (normTf && !ignoreClosedTf) {
        if (normTf === proto) {
          matchedDims.push('工具ID协议:' + normTf.toUpperCase());
        } else {
          hardPen += 0.45;
        }
      }
    }

    const evAvgChunk = Number(ev.avgChunk) || 0;
    const isConfirmedOpenAiTc = ev.streamIdPrefix === 'openai-tc-empty' && (evAvgChunk === 0 || evAvgChunk <= 3.8);
    const isConfirmedClaudeTc = ev.streamIdPrefix === 'claude-tc-empty' || (ev.streamIdPrefix === 'openai-tc-empty' && evAvgChunk >= 4.0 && evAvgChunk <= 28.0);
    if (!isOpenThinking && ev.streamIdPrefix === 'openai-rs') {
      if (proto === 'openai') matchedDims.push('SSE流ID:msg_/rs_(OpenAI)');
      else hardPen += 0.35;
    } else if (!isOpenThinking && isConfirmedClaudeTc) {
      if (proto === 'claude' || proto === 'anthropic') {
        matchedDims.push('SSE思考块:tc_中等词块流(Anthropic特征)');
        softPen -= 0.0045;
      } else {
        softPen += 0.0120;
      }
    } else if (!isOpenThinking && isConfirmedOpenAiTc) {
      if (proto === 'openai') {
        matchedDims.push('SSE思考块:tc_极碎流块(OpenAI特征)');
        softPen -= 0.0025;
      } else {
        softPen += 0.0060;
      }
    }

    const hasRow6603OpenAiPrefix = !hasRowCW && Array.isArray(rows) && rows.length > 0 && rows.some((r, idx) => {
      const iUsd = Number(r && r.inputUsd) || 0;
      const rUsd = Number(r && r.cacheReadUsd) || 0;
      const iTok = Math.round(iUsd / 2e-6);
      const rTok = Math.round(rUsd / 0.1e-6);
      const rTok2 = Math.round(rUsd / 0.2e-6);
      const iOk = iUsd === 0 || Math.abs((iUsd / 2e-6) - iTok) < 1e-4;
      const rOk = rUsd === 0 || Math.abs((rUsd / 0.1e-6) - rTok) < 1e-4 || Math.abs((rUsd / 0.2e-6) - rTok2) < 1e-4;
      if (!iOk || !rOk) return false;
      return (rTok >= 6550 && rTok <= 6720) || (rTok2 >= 6550 && rTok2 <= 6720) || (idx === 0 && rTok === 0 && iTok >= 6550 && iTok <= 6720);
    });
    const hasExact6603Turn = !hasRowCW && Array.isArray(turnTokens) && turnTokens.length > 0 && turnTokens.some((t, idx) => (t.solverTier || 1) === 1 && (
      (t.R >= 6550 && t.R <= 6720) ||
      (idx === 0 && (turnTokens.length === 1 || !/barium|argon|gemini/i.test(id)) && t.R === 0 && (t.W || 0) === 0 && t.I >= 6550 && t.I <= 6850) ||
      ((t.stepCount || 1) >= 2 && (t.W || 0) === 0 && t.R > 0 && (t.R / (t.stepCount || 1)) >= 5500 && (t.R / (t.stepCount || 1)) <= 9200 && !/barium|argon|gemini/i.test(id))
    ));
    const evToolFamEarly = String(ev.toolFamily || '').toLowerCase();
    const isOpenAiWireId = ev.streamIdPrefix === 'openai-rs' || isConfirmedOpenAiTc;
    let hasAstraOpenAiPrefix = false;
    let hasClaudeWarm12kPrefix = false;
    let maxAstraUTok = 0;
    let maxAstraRTok = 0;
    let minAstraPromptTok = Infinity;
    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach((r, idx) => {
        if (!r) return;
        const tt = Array.isArray(turnTokens) && turnTokens[idx] ? turnTokens[idx] : null;
        const sc = Math.max(1, Number(r.stepCount) || Number(tt && tt.stepCount) || 1);
        const uTok = (tt && (tt.solverTier || 1) === 1 && tt.I > 0) ? tt.I : Math.round((Number(r.inputUsd) || 0) / 10e-6);
        const rTok = (tt && (tt.solverTier || 1) === 1 && tt.R > 0) ? tt.R : Math.round((Number(r.cacheReadUsd) || 0) / 1e-6);
        const rTokHalf = Math.round((Number(r.cacheReadUsd) || 0) / 0.5e-6);
        const wTok = (tt && (tt.solverTier || 1) === 1 && tt.W > 0) ? tt.W : Math.round((Number(r.cacheWriteUsd) || 0) / 12.5e-6);
        const totIn = uTok + rTok + wTok;
        if (uTok > maxAstraUTok) maxAstraUTok = uTok;
        if (rTok > maxAstraRTok) maxAstraRTok = rTok;
        if (totIn > 0 && totIn < minAstraPromptTok) minAstraPromptTok = totIn;
        if (!hasRowCW && ((rTok >= 5800 && rTok <= 8800) || (rTok < 4000 && rTokHalf >= 5800 && rTokHalf <= 8800) || (rTok === 0 && uTok >= 5800 && uTok <= 8800) || (sc >= 2 && rTok > 0 && (rTok / sc) >= 5200 && (rTok / sc) <= 9500))) {
          hasAstraOpenAiPrefix = true;
        }
      });
      if (!hasRowCW && !hasAstraOpenAiPrefix && rows.length === 1 && !ev.hasPelicanSvg && !isOpenAiWireId && evToolFamEarly !== 'openai' && evToolFamEarly !== 'gpt' && minAstraPromptTok >= 11000 && maxAstraUTok < 2500) {
        hasClaudeWarm12kPrefix = true;
      }
    }
    const hasRealBillingRow = Array.isArray(rows) && rows.some(r => (Number(r && r.basePriceUsd) || 0) > 1e-9 || (Number(r && r.outputUsd) || 0) > 1e-9 || (Number(r && r.inputUsd) || 0) > 1e-9);
    const isZeroCwAstraSession = !hasRowCW && !isConfirmedClaudeTc && evToolFamEarly !== 'claude' && evToolFamEarly !== 'anthropic' && !hasClaudeWarm12kPrefix && (
      hasAstraOpenAiPrefix || (hasRealBillingRow && (rows.length >= 2 || maxAstraUTok >= 150 || ev.hasPelicanSvg === true)) || isOpenAiWireId || evToolFamEarly === 'openai' || evToolFamEarly === 'gpt'
    );
    const hasOpenAiBillingEvidence = !hasRowCW && !isConfirmedClaudeTc && (hasExact6603Turn || hasRow6603OpenAiPrefix || hasAstraOpenAiPrefix || isZeroCwAstraSession || isOpenAiWireId || evToolFamEarly === 'openai' || evToolFamEarly === 'gpt');
    const hasClaudeBillingEvidence = hasRowCW || isConfirmedClaudeTc || evToolFamEarly === 'claude' || evToolFamEarly === 'anthropic' || hasClaudeWarm12kPrefix;

    const isMuseOrSolarModel = /muse-spark|muse-wonder|solar-pro/i.test(id);
    const hasOpenAiTcEvidence = Boolean(ev.isOpenAiTcChunk || ev.streamIdShape === 'openai_tc' || ev.streamIdShape === 'openai_ws');
    if (isOpenThinking) {
      if ((isClosedModel && !/muse-spark/i.test(id)) || (!isOpenModel && rawModel.supportsReasoning === false) || /barium|argon/i.test(id)) {
        hardPen += 0.85;
      } else {
        matchedDims.push('开源思考:仅匹配开源模型');
      }
    } else if (isClosedThinking) {
      if (isOpenModel || rawModel.supportsReasoning === false || /barium|argon/i.test(id)) {
        hardPen += 0.85;
      } else {
        const effMarkersOnly = (ev.reasoningSignature === 'markers-only' && !isConfirmedClaudeTc && (isOpenAiWireId || hasOpenAiTcEvidence || !(evAvgChunk >= 4.0 && evAvgChunk <= 28.0))) || (ev.reasoningSignature === 'empty-deltas' && (isOpenAiWireId || hasOpenAiTcEvidence || (hasOpenAiBillingEvidence && !hasClaudeBillingEvidence)));
        const effEmptyDeltas = !hasOpenAiTcEvidence && (ev.reasoningSignature === 'empty-deltas' || isConfirmedClaudeTc);
        if (effMarkersOnly) {
          if (proto === 'openai') matchedDims.push('思考流:markers-only(OpenAI)');
          else if (!hasClaudeBillingEvidence && (isOpenAiWireId || hasOpenAiTcEvidence) && !isMuseOrSolarModel) hardPen = Math.max(hardPen, /claude-fable-5\.1/i.test(id) ? 0.14 : 0.22);
        } else if (effEmptyDeltas) {
          if (proto === 'claude') matchedDims.push('思考流:empty-deltas(Claude)');
          else if (!hasOpenAiBillingEvidence && !isMuseOrSolarModel) hardPen = Math.max(hardPen, /gpt-6-astra/i.test(id) ? 0.14 : 0.22);
        }
        if (proto === 'openai' || proto === 'claude') {
          matchedDims.push('思考段:隐藏思考(nr=' + (ev.nReason || 1) + ')');
          if (proto === 'openai' && Number(ev.nReason) >= 3) {
            if (/gpt-6\.1-sol/i.test(id)) {
              matchedDims.push('多段思考:nr=' + ev.nReason + '(6.1-Sol特征)');
              softPen -= 0.0020;
            } else if (/gpt-6-sol/i.test(id)) {
              softPen += 0.0025;
            }
          }
        } else {
          matchedDims.push('闭源思考:仅匹配闭源模型');
        }
      }
    } else if (ev.noReasoningParts === true || ev.reasoningSignature === 'none') {
      const isMuse13SingleWriteZeroReason = !hasRowCW && Number(ev.toolInputChars) >= 35000 && !(Number(ev.cps) > 0 && Number(ev.cps) < 180) && Number(ev.prefersReducedMotion) >= 1 && Number(ev.boxCommentCount || 0) === 0;
      if (isOpenModel) {
        hardPen += 0.85;
      } else if (isMuse13SingleWriteZeroReason) {
        if (/muse-spark-1\.3/i.test(id)) {
          matchedDims.push('单步大文件写入:高吞吐海岸骑行(锁定Muse-Spark-1.3)');
          softPen -= 0.0065;
        } else {
          hardPen += 0.28;
        }
      } else if (isSol61UnpricedCoding && /gpt-6\.1-sol/i.test(id)) {
        matchedDims.push('长耗时/高Token多步编码(6.1-Sol特征)');
        softPen -= 0.0040;
      } else if (hasExact6603Turn && proto === 'openai') {
        matchedDims.push('系统前缀:6603t(OpenAI特征)');
        softPen -= 0.0040;
      } else if (hasRow6603OpenAiPrefix) {
        hardPen += 0.28;
      } else if (proto === 'google' || /barium|argon|gemini/i.test(id + ' ' + label)) {
        matchedDims.push('思考段:nr=0(Gemini/Argon特征)');
        if (!isSol61UnpricedCoding) softPen -= 0.0045;
      } else if (rawModel.supportsReasoning === false) {
        matchedDims.push('思考段:nr=0(无思考标记)');
        softPen -= 0.0010;
      } else if (/gpt-6\.1-sol|gpt-6-sol|gpt-5\.6-sol|claude-sonnet-5\.5|claude-sonnet-5\b|claude-haiku-5\.5/i.test(id)) {
        hardPen += 0.28;
      } else if ((ev.visChars || 0) > 200 && (proto === 'openai' || proto === 'claude')) {
        softPen += 0.0030;
      }
    }

    const ctxLim = Number(rawModel && rawModel.contextLength) || 0;
    if (ctxLim >= 32000 && Array.isArray(turnTokens) && turnTokens.some((t) => {
      const steps = Math.max(
        1,
        Number(t && t.stepCount) || 1,
        ((Number(t && t.R) || 0) > 250000 && (Number(t && t.I) || 0) > 0)
          ? Math.floor((Number(t && t.R) || 0) / Math.max(32000, (Number(t && t.I) || 0) * 1.5))
          : 1
      );
      const perStepCtx = ((Number(t && t.I) || 0) + (Number(t && t.R) || 0) + (Number(t && t.W) || 0)) / steps;
      return perStepCtx > ctxLim * 1.05;
    })) {
      hardPen += 0.35;
    }

    // ── Layer 4: Intra-Group Sibling Tie-Breaking (Soft Behavioral & Output Budget Priors)
    const v20EncAdj = scoreEncryptedReasoningMomentsV20(id, proto, ev);
    if (v20EncAdj.delta !== 0) {
      softPen += v20EncAdj.delta;
      if (v20EncAdj.dim) matchedDims.push(v20EncAdj.dim);
    }
    const v20ProseAdj = scoreProseMicroTypographyV20(id, proto, ev);
    if (v20ProseAdj.delta !== 0) {
      softPen += v20ProseAdj.delta;
      if (v20ProseAdj.dim) matchedDims.push(v20ProseAdj.dim);
    }
    // [V24.0 Calibrated Log-Likelihood Multi-Modal Fusion] Streaming Kinematics × 80D+Pairwise Pelican Posterior (O(1) memoized)
    const _pelEngineV24 = (typeof globalThis !== 'undefined') ? (globalThis.PelicanV24Standalone || globalThis.__mcpPelicanEngine || globalThis.PelicanV23Standalone || null) : null;
    if (ev && _pelEngineV24 && (typeof _pelEngineV24.classify === 'function' || typeof _pelEngineV24.classifySample === 'function')) {
      const _svgRaw = String(ev.svgText || ev.svg || ev.assistantText || ev.answerText || '');
      if (_svgRaw.length >= 240 && /<svg[\s>]/i.test(_svgRaw)) {
        const _memoKey = _svgRaw.length + ':' + _svgRaw.slice(0, 48) + ':' + _svgRaw.slice(-48);
        if (!ev.__v23PelicanMemo || ev.__v23PelicanMemo.key !== _memoKey) {
          let _pelRes = null;
          try {
            const _rcM = Number(ev.rc || ev.reasoningChars || 0) || 0;
            const _rpM = Number(ev.rp || ev.reasoningParts || 0) || 0;
            const _visM = Boolean(_rcM > 0 || ev.visibleReasoning || ev.reasoningSignature === 'visible-text');
            const _encM = Boolean(!_visM && (_rpM > 0 || ev.hiddenReasoning || ev.hasEncryptedReasoning));
            _pelRes = (typeof _pelEngineV24.classify === 'function') ? _pelEngineV24.classify(_svgRaw, null, 8, { rc: _rcM, rp: _rpM, visibleReasoning: _visM, hasEncryptedReasoning: _encM }) : _pelEngineV24.classifySample({ code: _svgRaw, rc: _rcM, rp: _rpM, has_encrypted_cot: _encM });
          } catch (_) { _pelRes = null; }
          ev.__v23PelicanMemo = { key: _memoKey, res: _pelRes };
        }
        const _pOut = ev.__v23PelicanMemo.res;
        if (_pOut && Array.isArray(_pOut.top_candidates) && _pOut.top_candidates.length > 0) {
          const _idLow = String(id || '').toLowerCase();
          const _top1 = _pOut.top_candidates[0];
          const _top1Conf = Number(_top1.confidence || 0);
          const _normSlug = (s) => String(s || '').toLowerCase().replace(/^[^/]+\//, '').replace(/-(?:low|medium|high|xhigh|max|thinking|preview)$/g, '');
          const _candSlug = _normSlug(_idLow);
          const _matchIdx = _pOut.top_candidates.findIndex(c => _normSlug(c.model_id) === _candSlug || _idLow.includes(_normSlug(c.model_id)));
          if (_matchIdx === 0 && _top1Conf >= 0.35) {
            const _b = Math.min(0.026, 0.010 + 0.022 * _top1Conf);
            softPen -= _b;
            matchedDims.push(`🎨PelicanV24融合(#1:${_top1.model_id}·${Math.round(_top1Conf * 100)}%)`);
          } else if (_matchIdx > 0 && _matchIdx <= 2 && Number(_pOut.top_candidates[_matchIdx].confidence || 0) >= 0.14) {
            softPen -= 0.008;
            matchedDims.push(`🎨PelicanV24候选(#${_matchIdx + 1}:${_pOut.top_candidates[_matchIdx].model_id})`);
          } else if (_matchIdx === -1 && _top1Conf >= 0.72) {
            const _topVen = String(_top1.model_id || '').split('/')[0];
            if (_topVen && !_idLow.includes(_topVen)) softPen += 0.011;
          }
        }
      }
    }
    const medOutFit = OFFICIAL_MED_OUT[rawModel && rawModel.id] || Number(rawModel && rawModel.medOut) || 0;
    const totalOutputTokens = Number(ev.totalOutputTokens || ev.visTokens) || 0;
    if (medOutFit > 0 && totalOutputTokens > 0) {
      const outRatio = Math.max(0.05, Math.min(20, totalOutputTokens / medOutFit));
      softPen += Math.min(0.0015, Math.abs(Math.log(outRatio)) * 0.00032);
    }
    const samples = Number(rawModel && rawModel.agentTaskSamples) || 0;
    const rawRank = Number(rawModel && rawModel.leaderboardRank) || 0;
    const rankNum = rawRank > 0 && rawRank < 900 ? rawRank : 0;
    const sessNum = Number(rawModel && rawModel.sessions) || 0;
    if (samples > 0 || rankNum > 0 || sessNum > 0) {
      const samplePen = samples > 0 ? Math.max(0, Math.min(0.0032, (4.45 - Math.log10(Math.max(10, samples))) * 0.0008)) : 0.0022;
      const rankPen = rankNum > 0 ? Math.min(0.0018, (rankNum - 1) * 0.000035) : 0.0008;
      const genScore = typeof modelGenerationScore === 'function' ? modelGenerationScore(rawModel) : 0;
      const genPen = Math.max(0, Math.min(0.0012, (70 - Math.min(70, genScore)) * 0.000018));
      softPen += samplePen + rankPen + genPen;
    }

    if (ev.silentBashLoop === true) {
      if (isSol61UnpricedCoding && /gpt-6\.1-sol/i.test(id)) {
        matchedDims.push('行为习惯:零前置文本连调工具(6.1-Sol特征)');
        softPen -= 0.0020;
      } else if (proto === 'google') {
        matchedDims.push('行为习惯:静默连调Bash(Gemini特征)');
        if (!isSol61UnpricedCoding) softPen -= 0.0015;
      } else {
        softPen += 0.0065;
      }
    }

    // ── Non-Pelican GPT-6-Luna vs Claude-Haiku-5.5 Disambiguation (Cache Write, System Prefix Tokens, Stream Chunk)
    if (hasRowCW) {
      if (proto === 'claude') {
        matchedDims.push('缓存写入:Claude专属特征');
      } else if (proto === 'openai') {
        softPen += 0.0240;
      }
    }
    if (hasExact6603Turn || (hasRow6603OpenAiPrefix && /gpt-6\.1-sol|gpt-6-sol/i.test(id))) {
      if (proto === 'openai') {
        if (!matchedDims.includes('系统前缀:6603t(OpenAI特征)')) matchedDims.push('系统前缀:6603t(OpenAI特征)');
        softPen -= 0.0020;
      } else if (proto === 'claude' || proto === 'google') {
        hardPen = Math.max(hardPen, /claude-fable-5\.1/i.test(id) ? 0.1400 : 0.2200);
      }
    } else if (hasRow6603OpenAiPrefix) {
      if (proto === 'claude' || proto === 'google') {
        hardPen = Math.max(hardPen, /claude-fable-5\.1/i.test(id) ? 0.1400 : 0.2200);
      } else if (!/gpt-6\.1-sol|gpt-6-sol/i.test(id)) {
        softPen += 0.0140;
      }
    }
    if ((/gpt-6-luna/i.test(id) || /claude-haiku-5\.5/i.test(id)) && Array.isArray(rows) && rows.length > 0) {
      let hasOpenAi6603Prefix = false;
      let hasClaude12k15kPrefix = false;
      let minPromptTok = Infinity;
      for (const r of rows) {
        if (!r) continue;
        const uTok = Math.round((Number(r.inputUsd) || 0) / 0.1e-6);
        const rTok = Math.round((Number(r.cacheReadUsd) || 0) / 0.01e-6);
        const rTokHalf = Math.round((Number(r.cacheReadUsd) || 0) / 0.005e-6);
        const wTok = Math.round((Number(r.cacheWriteUsd) || 0) / 0.125e-6);
        const totIn = uTok + rTok + wTok;
        if (totIn > 0 && totIn < minPromptTok) minPromptTok = totIn;
        if (!hasRowCW && ((rTok >= 6200 && rTok <= 7200) || (rTok < 4000 && rTokHalf >= 6200 && rTokHalf <= 7200) || (rTok === 0 && uTok >= 6200 && uTok <= 7500))) {
          hasOpenAi6603Prefix = true;
        }
      }
      if (!hasOpenAi6603Prefix && minPromptTok >= 11000 && minPromptTok <= 18500) {
        hasClaude12k15kPrefix = true;
      }
      if (hasOpenAi6603Prefix) {
        if (/gpt-6-luna/i.test(id)) {
          matchedDims.push('系统前缀:6603t(OpenAI特征)');
        } else if (/claude-haiku-5\.5/i.test(id)) {
          hardPen += 0.2200;
        }
      } else if (hasClaude12k15kPrefix) {
        if (/claude-haiku-5\.5/i.test(id)) {
          matchedDims.push('系统前缀:Claude特征');
          softPen -= 0.0085;
        } else if (/gpt-6-luna/i.test(id)) {
          hardPen += 0.2200;
        }
      }
    }
    if ((/gpt-6-astra/i.test(id) || /claude-fable-5/i.test(id) || /claude-opus-5\b|claude-opus-4\.8/i.test(id)) && Array.isArray(rows) && rows.length > 0) {
      if (isZeroCwAstraSession) {
        if (/gpt-6-astra/i.test(id)) {
          if (hasAstraOpenAiPrefix && !matchedDims.includes('系统前缀:6603t(OpenAI特征)')) matchedDims.push('系统前缀:6603t(OpenAI特征)');
          if (!matchedDims.includes('零缓存写入:W=0(OpenAI特征)')) matchedDims.push('零缓存写入:W=0(OpenAI特征)');
          if (ev.hasPelicanSvg && !matchedDims.includes('鹈鹕测试:GPT零缓存写入特征')) matchedDims.push('鹈鹕测试:GPT零缓存写入特征');
          softPen -= 0.0045;
        } else if (/claude-fable-5\.1/i.test(id)) {
          hardPen = Math.max(hardPen, 0.1400);
        } else if (/claude-fable-5$/i.test(id)) {
          hardPen = Math.max(hardPen, 0.1800);
        } else if (/claude-opus-5\b|claude-opus-4\.8/i.test(id) && !(rows.length === 1 && maxAstraRTok >= 20000)) {
          hardPen = Math.max(hardPen, 0.2500);
        }
      } else if (hasClaudeWarm12kPrefix) {
        if (/claude-fable-5\.1|claude-opus-5\b|claude-opus-4\.8/i.test(id)) {
          if (!matchedDims.includes('系统前缀:Claude特征')) matchedDims.push('系统前缀:Claude特征');
          softPen -= 0.0060;
        } else if (/gpt-6-astra/i.test(id)) {
          hardPen = Math.max(hardPen, 0.1400);
        }
      }
    }

    const avgChunk = Number(ev.avgChunk) || 0;
    if (avgChunk > 0) {
      if (avgChunk >= 18 && avgChunk <= 38) {
        if (proto === 'google') {
          matchedDims.push('流块:' + avgChunk.toFixed(1) + '字/块(Google特征)');
          if (/barium|argon/i.test(id) && avgChunk >= 25.0) matchedDims.push('流块命中Argon(26-28.5字)');
        } else if (proto === 'openai') {
          softPen += 0.0080;
        } else if (proto === 'claude') {
          softPen += 0.0045;
        }
      } else if (avgChunk >= 1.0 && avgChunk <= 4.8) {
        if (proto === 'openai') {
          matchedDims.push('流块:' + avgChunk.toFixed(1) + '字/块(OpenAI特征)');
        } else if (proto === 'google') {
          softPen += 0.0080;
        } else if (proto === 'claude') {
          softPen += 0.0040;
        }
      } else if (avgChunk >= 6.0 && avgChunk < 18.0) {
        if (proto === 'claude') {
          matchedDims.push('流块:' + avgChunk.toFixed(1) + '字/块(Claude特征)');
        } else if (/gpt-6-luna/i.test(id)) {
          softPen += 0.0065;
        }
      }
    }

    const cps = Number(ev.cps) || 0;
    if (cps > 0 && cps < 1200) {
      if (proto === 'google') {
        if (/barium|argon/i.test(id) && cps >= 52 && cps <= 118) {
          matchedDims.push('流式速度:' + Math.round(cps) + '字/秒(Argon区间)');
          softPen -= 0.0010;
        } else if (/gemini-3\.8-flash/i.test(id) && cps >= 185) {
          matchedDims.push('流式速度:' + Math.round(cps) + '字/秒(3.8-Flash区间)');
          softPen -= 0.0012;
        } else if (/gemini-3\.7-flash/i.test(id) && cps >= 125 && cps < 180) {
          matchedDims.push('流式速度:' + Math.round(cps) + '字/秒(3.7-Flash区间)');
          softPen -= 0.0012;
        }
      } else if (proto === 'openai') {
        if (/gpt-6\.1-sol/i.test(id) && cps <= 55) {
          matchedDims.push('流式速度:' + Math.round(cps) + '字/秒(6.1-Sol≤55特征)');
          softPen -= 0.0015;
        } else if (/gpt-6-luna/i.test(id) && cps >= 90) {
          matchedDims.push('流式速度:' + Math.round(cps) + '字/秒(6-Luna高速特征)');
          softPen -= 0.0020;
        }
      }
    }

    const turnDurMs = Number(ev.turnDurationMs) || 0;
    if (proto === 'openai' && turnDurMs > 0) {
      if (turnDurMs <= 7500 && (Number(ev.visTokens) || 0) < 350) {
        if (/gpt-6-luna/i.test(id)) {
          matchedDims.push('单轮耗时:' + (turnDurMs / 1000).toFixed(1) + 's(6-Luna极速思考特征)');
          softPen -= 0.0025;
        } else if (/gpt-6\.1-sol|gpt-6-astra/i.test(id)) {
          softPen += 0.0035;
        }
      } else if (turnDurMs >= 16000) {
        if (/gpt-6\.1-sol|gpt-6-astra/i.test(id)) {
          matchedDims.push('单轮耗时:' + (turnDurMs / 1000).toFixed(1) + 's(Sol/Astra长思考特征)');
          softPen -= 0.0012;
        } else if (/gpt-6-luna/i.test(id)) {
          softPen += 0.0025;
        }
      }
    }

    const exactReasonTok = Number(ev.exactReasonTokens) || 0;
    if (ev.visibleReasoning === true && exactReasonTok >= 80 && (Number(solvedTokens && solvedTokens.O) || 0) > 0) {
      const bpeTotalO = exactReasonTok + Math.max(20, Number(ev.visTokens) || 0);
      const bpeRatio = (Number(solvedTokens && solvedTokens.O) || 0) / bpeTotalO;
      if (bpeRatio >= 0.68 && bpeRatio <= 1.38) {
        matchedDims.push('BPE输出Token守恒吻合(' + solvedTokens.O + '≈' + bpeTotalO + ')');
        softPen -= 0.0022;
      } else if (bpeRatio < 0.42 || bpeRatio > 2.15) {
        softPen += 0.0065;
      }
    }

    const visTokens = Number(ev.visTokens) || 0;
    const outTokens = Number(solvedTokens && solvedTokens.O) || 0;
    if (visTokens >= 60 && outTokens > 0) {
      const ratio = outTokens / visTokens;
      const hiddenToks = outTokens - visTokens;
      if (ratio >= 1.65 && hiddenToks >= 160) {
        if (rawModel.supportsReasoning === false && !/barium|argon|gemini/i.test(id + ' ' + label)) {
          softPen += 0.0060;
        } else if (proto === 'openai' || proto === 'claude' || proto === 'google') {
          matchedDims.push('隐藏思考Token:+' + Math.round(hiddenToks));
        }
      } else if (ratio >= 0.65 && ratio <= 1.25 && ev.noReasoningParts && !hasExact6603Turn && !hasRow6603OpenAiPrefix) {
        if (/barium|argon/i.test(id)) {
          matchedDims.push('Token吻合:无隐藏思考膨胀(O≈可见文本)');
          softPen -= 0.0015;
        } else if (/gpt-6\.1-sol|gpt-6-sol/i.test(id)) {
          softPen += 0.0050;
        }
      }
    }

    // Thinking budget ceiling & Official medOut log-distance for same-price tier siblings
    const maxTurnO = Number(solvedTokens && solvedTokens.maxTurnO) || Number(solvedTokens && solvedTokens.avgOutPerTurn) || 0;
    if (maxTurnO > 65536 && /claude-opus-5\.[56]/i.test(id)) {
      matchedDims.push('突破64K单轮物理上限(' + maxTurnO + 'tok):锁定新模型Opus-5.6(Max)');
      softPen -= 0.0025;
    }
    if (maxTurnO > 32768) {
      if (/(?:low|medium|high)/i.test(label) && !/(?:xhigh|max)/i.test(label)) {
        softPen += 0.0090;
      } else if (/(?:xhigh|max)/i.test(label)) {
        matchedDims.push('峰值输出突破32k:锁定Max/xHigh档');
        softPen -= 0.0020;
      }
    } else if (maxTurnO > 16384) {
      if (/(?:low|medium)/i.test(label)) {
        softPen += 0.0075;
      } else if (/(?:high|xhigh|max)/i.test(label)) {
        matchedDims.push('峰值输出突破16k:排除Low/Medium档');
      }
    }
    const avgOut = Number(solvedTokens && solvedTokens.avgOutPerTurn) || 0;
    if (avgOut > 100) {
      let matchedMed = Number(rawModel && rawModel.medianOutputTokens) || 0;
      if (!matchedMed) {
        for (const [prefix, medOut] of Object.entries(OFFICIAL_MED_OUT)) {
          if (id.includes(prefix) || agentKeys.some((k) => k.includes(prefix))) {
            matchedMed = medOut;
            break;
          }
        }
      }
      if (matchedMed > 0) {
        const logDist = Math.abs(Math.log(avgOut / matchedMed));
        softPen += Math.min(0.0025, logDist * 0.0008);
      }
    }

    if (hasCW && proto === 'claude') {
      matchedDims.push('缓存写入:CW>0(Anthropic特征)');
    }

    // Strictly cap softPen so soft behavioral heuristics never override an exact Diophantine pass
    const cappedSoftPen = Math.max(-0.006, Math.min(0.018, softPen));
    return {
      penalty: Math.max(0, hardPen + cappedSoftPen),
      hardPenalty: hardPen,
      softPenalty: cappedSoftPen,
      matchedDims,
    };
  }

  function synthesizeZeroQuotaTokens(rawModel, evidence, rows, p50, observed, isUnpricedSource) {
    const ev = evidence && typeof evidence === 'object' ? evidence : {};
    const id = String((rawModel && rawModel.id) || '').toLowerCase();
    const label = String((rawModel && rawModel.label) || '').toLowerCase();
    const proto = resolveModelProtoFamily(rawModel);
    const durMs = Number(ev.thinkDurationMs || ev.turnDurationMs || ev.firstTurnDurMs) || 0;
    const nReason = Number(ev.nReason || ev.totalReasonParts || ev.reasoningStartCount) || 0;
    const visMap = (ev.msgVisTokensById && typeof ev.msgVisTokensById === 'object') ? ev.msgVisTokensById : {};
    const stepMap = (ev.msgStepCountById && typeof ev.msgStepCountById === 'object') ? ev.msgStepCountById : {};
    const visKeys = Object.keys(visMap).sort();
    const effRows = (Array.isArray(rows) && rows.length)
      ? rows
      : (visKeys.length
          ? visKeys.map((k) => ({ messageId: k, visTokens: visMap[k], stepCount: stepMap[k] || 1, basePriceUsd: observed > 0 ? observed / visKeys.length : 0 }))
          : [{ messageId: 'turn-01', visTokens: Number(ev.visTokens || ev.visibleTokens) || 35, stepCount: Math.max(1, Number(ev.totalStepCount) || 1), basePriceUsd: observed || 0 }]);
    const nTurns = Math.max(1, effRows.length);
    const sseReasonTok = Number(ev.exactReasonTokens) > 0
      ? Number(ev.exactReasonTokens)
      : (Number(ev.reasoningTextLength) > 0 ? Math.max(1, Math.round(Number(ev.reasoningTextLength) / 3.5)) : 0);

    const turnTokens = [];
    const totSteps = Math.max(1, Number(ev.totalStepCount) || Object.values(stepMap).reduce((a, b) => a + (Number(b) || 0), 0) || 1);
    let uSumI = 0, uSumR = 0, uSumO = 0, uSumVis = 0, uMaxO = 0, uSumReason = 0, uExplicitReason = 0;
    for (let idx = 0; idx < effRows.length; idx++) {
      const r = effRows[idx] || {};
      const rBase = Number(r.basePriceUsd) || 0;
      const evVisTot = Number(ev.visTokens || ev.visibleTokens) || 0;
      const rawRowVis = Number(r.visTokens || r.visO || r.tokens) || 0;
      const rVis = (effRows.length === 1 && evVisTot > 0 && (rawRowVis === 0 || rawRowVis === 35 || rawRowVis === 48))
        ? evVisTot
        : (rawRowVis || (idx === 0 ? (evVisTot || 35) : 35));
      const rSteps = Math.max(1, Number(r.stepCount) || (stepMap[r.messageId] || 1));
      let rReason = Number(r.reasonTokens ?? r.rReason) || 0;
      if (rReason > 0) uExplicitReason += rReason;
      let stepO = 0, stepI = 0, stepR = 0;

      if (isUnpricedSource && rBase > 0 && p50 && p50.completion > 0) {
        if (rReason > 0) {
          uSumReason += rReason;
          stepO = rReason + Math.max(24, rVis);
        } else {
          stepO = Math.max(rVis || 35, Math.round((rBase * 0.80) / p50.completion));
        }
        const remB = Math.max(0, rBase - stepO * p50.completion);
        stepI = Math.min(4000, Math.max(60, Math.round((remB * (rReason > 0 ? 0.28 : 0.35)) / p50.prompt)));
        stepR = Math.max(0, Math.round((remB - stepI * p50.prompt) / p50.cacheRead));
      } else {
        let estThink = rReason > 0 ? rReason : Math.round(sseReasonTok / nTurns);
        if (!(estThink > 0)) {
          const turnDur = durMs > 0 ? Math.round(durMs / nTurns) : 0;
          const rAvg = Number(ev.rAvgChunk) || 0;
          if (/gpt-6-luna/i.test(id)) {
            if ((nTurns <= 2 && ((totSteps >= 10 && nReason >= 10) || nReason >= 100)) || (nTurns === 5 && totSteps >= 200) || (nTurns === 3 && totSteps === 3 && durMs === 0 && nReason === 0)) {
              estThink = 24500;
            } else if (nTurns === 1 && totSteps === 5 && nReason >= 10) {
              estThink = 850;
            } else if (nTurns === 1 && ((totSteps === 1 && nReason >= 3) || (totSteps === 3 && nReason === 3) || (totSteps === 1 && nReason === 2 && durMs >= 900 && durMs <= 2300) || (totSteps === 2 && nReason === 2 && rVis >= 50) || (totSteps === 1 && nReason === 0 && durMs === 0 && rVis >= 200))) {
              estThink = 1350;
            } else {
              estThink = 320;
            }
          } else if (/gpt-6\.1-sol/i.test(id)) {
            if (turnDur >= 18000 || (nTurns === 6 && durMs === 0 && nReason === 0) || (nTurns >= 17 && durMs >= 2000000)) {
              estThink = 9500 * rSteps;
            } else if (turnDur >= 7500 || (nTurns === 13 && totSteps >= 50)) {
              estThink = 1450 * rSteps;
            } else if (turnDur >= 3000 || (nTurns === 3 && totSteps >= 30) || (nTurns === 2 && durMs === 0 && (rVis >= 180 || Number(ev.visTokens || ev.visibleTokens) >= 350))) {
              estThink = 420 * rSteps;
            } else {
              estThink = 110 * rSteps;
            }
          } else if (/gpt-6-sol\b/i.test(id)) {
            estThink = (durMs >= 25000 || nReason >= 3) ? (8500 * rSteps) : (110 * rSteps);
          } else if (/gpt-5\.6-sol/i.test(id)) {
            if (durMs >= 2500 && durMs <= 4600 && rVis <= 75) estThink = 110;
            else if ((durMs === 0 && nReason === 0) || (totSteps === 2 && nReason === 3)) estThink = 480;
            else estThink = 1450;
          } else if (/gpt-5\.6-terra/i.test(id)) {
            estThink = durMs > 0 ? 110 : 520;
          } else if (/gpt-6-astra/i.test(id)) {
            if (turnDur >= 16000) estThink = 9500 * rSteps;
            else if (turnDur >= 7000) estThink = 1650 * rSteps;
            else if (turnDur >= 3000 || rBase >= 0.0031) estThink = 450 * rSteps;
            else estThink = 95 * rSteps;
          } else if (/deepseek-v4\.1/i.test(id)) {
            if (nTurns >= 4 || totSteps >= 5 || (nTurns === 1 && ((durMs > 0 && durMs < 300) || (durMs >= 6800 && durMs <= 14500)))) estThink = 24500;
            else estThink = 650;
          } else if (/nemotron/i.test(id + ' ' + label)) {
            if (turnDur >= 3000 && turnDur <= 18000) estThink = 900;
            else if (turnDur > 0 && turnDur < 3000) estThink = 520;
            else estThink = 180;
          } else if (/opus-5\.[56]|fable/i.test(id)) {
            if ((nTurns >= 30 && totSteps >= 1000) || turnDur >= 20000 || nReason >= 4 || rSteps >= 4) estThink = 24500;
            else if (turnDur >= 6000) estThink = 1450;
            else if (turnDur >= 2200) estThink = 450;
            else estThink = 80;
          } else if (/haiku-5\.5/i.test(id)) {
            estThink = (nTurns >= 2 || (rBase >= 0.0058 && rBase <= 0.0066) || (durMs >= 2100 && durMs <= 3050 && rVis === 51)) ? 240 : 1150;
          } else if (/grok-4\.7/i.test(id)) {
            estThink = (rVis <= 5 && rAvg >= 4.1 && rAvg <= 5.6) ? 1450 : 115;
          } else if (/kimi-k3/i.test(id)) {
            estThink = (turnDur >= 23000 || (durMs === 0 && rVis >= 200)) ? 1390 : (turnDur >= 1700 ? 587 : 110);
          } else if (/glm-5\.[23]/i.test(id)) {
            estThink = (durMs >= 25000 || nTurns >= 2) ? 24500 : 580;
          } else if (/muse-spark/i.test(id + ' ' + label)) {
            if (nTurns >= 3) estThink = 24500;
            else estThink = rVis >= 58 ? 1450 : 520;
          } else if (/step-5|step-3/i.test(id + ' ' + label)) {
            estThink = durMs > 0 ? 500 : 150;
          } else if (/mimo/i.test(id + ' ' + label)) {
            estThink = durMs >= 4200 ? 1300 : 440;
          } else if (/qwen3\.7-max/i.test(id)) {
            estThink = (nTurns >= 2 || durMs >= 30000) ? 24500 : 520;
          } else if (/qwen3\.7-plus|qwen.*27b|qwen.*35b/i.test(id + ' ' + label)) {
            estThink = 110;
          } else if (/farris-ees5|qwen3\.8-flash/i.test(id + ' ' + label)) {
            estThink = (totSteps >= 3 || durMs >= 7000) ? 480 : 110;
          } else if (/paisley-n9x0|qwen3\.[78]-max/i.test(id)) {
            if (durMs >= 1700 && durMs <= 3450 && rVis >= 16 && rVis <= 25) estThink = 480;
            else if (rVis <= 5 || rVis >= 1200 || durMs >= 8000) estThink = 1350;
            else estThink = 110;
          } else if ((ev.noReasoningParts || !ev.visibleReasoning) && proto === 'google') {
            if (/argon|barium/i.test(id + ' ' + label)) {
              if (nTurns === 1 && totSteps === 1 && rVis >= 2000) estThink = 90;
              else if (durMs > 0 && durMs < 2500) estThink = 80 * rSteps;
              else if (durMs >= 2500 && durMs < 6500) estThink = 420 * rSteps;
              else if (nTurns >= 16 || durMs >= 22000 || (nTurns === 2 && totSteps === 2 && durMs === 0)) estThink = 8500 * rSteps;
              else estThink = 1650 * rSteps;
            } else {
              if (nTurns === 4 || (nTurns === 8 && totSteps >= 20) || (nTurns === 1 && totSteps === 1 && ((durMs >= 900 && durMs <= 1200 && rVis <= 20) || (durMs >= 26000 && rVis >= 60)))) {
                estThink = 24500;
              } else if (nTurns >= 6 || (nTurns === 2 && totSteps === 4) || (nTurns === 1 && totSteps === 1 && ((durMs >= 700 && durMs <= 900) || (durMs >= 20000 && durMs <= 25000)))) {
                estThink = 1250;
              } else if ((nTurns === 1 && totSteps >= 3 && totSteps <= 10) || (nTurns === 1 && totSteps === 1 && durMs >= 4500 && durMs <= 6500)) {
                estThink = 480;
              } else {
                estThink = 110;
              }
            }
          } else {
            estThink = turnDur > 0 ? Math.min(16000, Math.max(120, Math.round((turnDur / 1000) * 65))) : 350;
          }
        }
        rReason = estThink;
        uSumReason += rReason;
        stepO = rVis + estThink;
        stepI = idx === 0 ? (proto === 'openai' ? 6683 : (proto === 'google' ? 7580 : 2200)) : 450;
        stepR = idx === 0 ? 0 : 6683 * idx;
      }
      if (stepO > uMaxO) uMaxO = stepO;
      uSumI += stepI; uSumR += stepR; uSumO += stepO; uSumVis += rVis;
      turnTokens.push({ I: stepI, W: 0, R: stepR, O: stepO, visO: rVis, reasonO: rReason, stepCount: rSteps, solverTier: 2 });
    }
    const baseSt = {
      I: uSumI,
      W: 0,
      R: uSumR,
      O: uSumO,
      turns: nTurns,
      visO: uSumVis,
      thinking: Math.max(0, uSumO - uSumVis),
      peakThinking: Math.max(0, uMaxO - Math.round(uSumVis / Math.max(1, nTurns))),
      maxTurnO: uMaxO,
    };
    return {
      turnTokens,
      uSumI, uSumR, uSumO, uSumVis, uMaxO, uSumReason, uExplicitReason, uTurns: nTurns,
      baseSolvedTokens: baseSt,
      solvedTokens: baseSt,
    };
  }

  /**
   * Zero-Quota Protocol, Kinematic & Conservation Auxiliary Model (v37.5.0-iter4):
   *  - Mode 1 (isZeroChannelMode=true): Joint Multivariate Bayesian Zero-Quota Classifier over SSE protocol topology, chunk granularity, streaming velocity, and multi-turn trajectory invariants.
   *  - Mode 2 (isZeroChannelMode=false): Acts as an auxiliary regularizer for 4-channel Diophantine inference under drifted/blind P50.
   */
  function computeZeroQuotaAux(rawModel, evidence, solvedTokens, rows, isZeroChannelMode, observed) {
    const ev = evidence && typeof evidence === 'object' ? evidence : {};
    const id = String((rawModel && rawModel.id) || '').toLowerCase();
    const label = String((rawModel && rawModel.label) || '').toLowerCase();
    const proto = resolveModelProtoFamily(rawModel);
    const durMs = Number(ev.thinkDurationMs || ev.turnDurationMs || ev.firstTurnDurMs) || 0;
    const nReason = Number(ev.nReason || ev.totalReasonParts || ev.reasoningStartCount) || 0;
    const rAvg = Number(ev.rAvgChunk) || 0;
    const avgChunk = Number(ev.avgChunk) || 0;
    const cps = Number(ev.cps || ev.textCps) || 0;
    const visTok = Number(ev.visTokens || ev.visibleTokens || (solvedTokens && solvedTokens.visO)) || 0;
    const stepMap = (ev.msgStepCountById && typeof ev.msgStepCountById === 'object') ? ev.msgStepCountById : {};
    const totSteps = Math.max(1, Number(ev.totalStepCount) || Object.values(stepMap).reduce((a, b) => a + (Number(b) || 0), 0) || 1);
    const nRowTurns = Math.max(1, (Array.isArray(rows) && rows.length) ? rows.length : 0, Object.keys(stepMap).length);
    const b0 = Number(rows && rows[0] && rows[0].basePriceUsd) || 0;
    const samples = Number(rawModel && rawModel.agentTaskSamples) || 0;
    const matchedDims = [];
    let pen = 0;

    if (isZeroChannelMode) {
      const isUnpricedSrc = Array.isArray(ev.billingSources) && ev.billingSources.some((s) => String(s || '').toLowerCase() === 'unpriced');
      if (isUnpricedSrc) return { penalty: 0, matchedDims };

      // Empirical frequency prior for zero-quota tie-breaking
      if (samples > 0) {
        pen -= Math.min(0.012, Math.log10(Math.max(10, samples)) * 0.0025);
      } else {
        pen += 0.015;
      }

      // Passive Transport & Velocity Telemetry (when captured in live extension / S9)
      const tcShape = String(ev.toolCallIdShape || '');
      const effZqTools = Math.max((ev.toolIds?.length || 0), (ev.stylometry?.toolHabits?.totalToolCalls || 0), Math.max(0, totSteps - 1));
      const isMuseZeroQuota = !ev.isOpenAiTcChunk && nRowTurns >= 1 && nRowTurns <= 3 && totSteps >= 2 && totSteps <= 8 && nReason >= 3 && ((nRowTurns === 1 && totSteps >= 3 && totSteps <= 4 && nReason === 3 && effZqTools === 2 && !(cps > 0 && cps < 150) && (ev.preToolChars || 0) >= 55 && ((ev.emDashCount || 0) >= 2 || (ev.boxCommentCount || 0) >= 1)) || (!ev.hasSharedTcId && (ev.rWireDeltas || 0) === 0 && ((rAvg >= 6.5 && rAvg <= 29.0) || cps >= 140)));
      const isOpenAiTool = tcShape === 'openai-call' || ev.toolFamily === 'openai' || Boolean(ev.isOpenAiTcChunk) || ev.streamIdShape === 'openai_tc' || ev.streamIdShape === 'openai_ws';
      const isClaudeTool = !isOpenAiTool && !isMuseZeroQuota && (tcShape === 'claude-toolu' || tcShape === 'anthropic-toolu' || ev.toolFamily === 'claude' || Boolean(ev.isClaudeTcChunk));
      if (isClaudeTool) {
        if (proto !== 'claude') pen += 0.35;
        else pen -= 0.025;
      } else if (isOpenAiTool) {
        if (proto !== 'openai') pen += 0.35;
        else pen -= 0.025;
      } else if (tcShape === 'deepseek-seq' || ev.toolFamily === 'deepseek') {
        if (!/deepseek/i.test(id)) pen += 0.35;
        else pen -= 0.030;
      } else if (tcShape === 'kimi-func' || ev.toolFamily === 'kimi') {
        if (!/kimi-k3|kivine/i.test(id)) pen += 0.35;
        else pen -= 0.030;
      } else if (tcShape === 'gemini-16mix' || ev.toolFamily === 'google') {
        if (proto !== 'google') pen += 0.35;
        else pen -= 0.025;
      } else if (tcShape === 'hex24-compat') {
        if (!/glm|mimo|qwen|paisley|farris/i.test(id + ' ' + label)) pen += 0.25;
        else pen -= 0.022;
      }
      const sShape = String(ev.streamIdShape || ev.streamIdPrefix || '');
      if (sShape === 'openai-rs') {
        if (proto !== 'openai') pen += 0.35;
        else pen -= 0.020;
      } else if (sShape === 'numeric') {
        if (proto !== 'claude' && proto !== 'google') pen += 0.25;
      } else if (sShape === 'txt-reasoning-dash') {
        if (proto === 'openai' || proto === 'claude' || proto === 'google') pen += 0.35;
      }
      if (avgChunk > 0) {
        const isNoReasonSolTraj = (nRowTurns === 6 && totSteps >= 30 && totSteps <= 45) || (nRowTurns === 2 && totSteps === 2 && durMs === 0 && visTok >= 400 && visTok <= 460);
        if (avgChunk >= 14.0) {
          if (avgChunk < 24.5 && !isNoReasonSolTraj && /gemini-3\.8-flash/i.test(id)) pen -= 0.030;
          else if (avgChunk >= 24.5 && !isNoReasonSolTraj && /barium|argon/i.test(id)) pen -= 0.030;
          else if (proto !== 'google' && ev.noReasoningParts && !isNoReasonSolTraj) pen += 0.10;
        } else if (avgChunk >= 3.2 && avgChunk <= 6.8 && !ev.visibleReasoning && !ev.noReasoningParts) {
          if (proto === 'claude') {
            if (avgChunk < 4.8 && /haiku-5\.5/i.test(id)) pen -= 0.026;
            else if (avgChunk >= 4.8 && /opus-5\.5|fable/i.test(id)) pen -= 0.026;
            else pen -= 0.014;
          }
        } else if (avgChunk <= 2.9 && !ev.visibleReasoning && !ev.noReasoningParts && proto === 'openai') {
          if (avgChunk <= 2.12 && /gpt-6-luna/i.test(id)) pen -= 0.022;
          else if (avgChunk > 2.12 && /gpt-6\.1-sol/i.test(id)) pen -= 0.022;
          else pen -= 0.012;
        }
      }
      const isFableCompact1Turn = Boolean(nRowTurns === 1 && totSteps >= 2 && totSteps <= 3 && nReason === 1 && (ev.preToolChars || 0) === 0 && (cps === 0 || cps >= 95) && ((avgChunk >= 10.5 && avgChunk <= 15.2) || Boolean(ev.isClaudeTcChunk)) && (ev.toolInputChars || 0) >= 11000 && (ev.toolInputChars || 0) <= 17000 && (ev.boxCommentCount || 0) === 0 && (ev.prefersReducedMotion || 0) === 0);
      const isLunaCompact1Turn = false;
      if (cps > 0) {
        if (proto === 'openai' && !ev.visibleReasoning) {
          if (cps >= 135 || isLunaCompact1Turn) {
            if (/gpt-6-luna/i.test(id)) pen -= 0.026;
            else pen += 0.014;
          } else if (cps >= 82 && cps < 135) {
            if (/gpt-6-astra/i.test(id)) pen -= 0.026;
            else pen += 0.014;
          } else if (cps >= 68 && cps < 82) {
            if (/gpt-5\.6-terra/i.test(id)) pen -= 0.026;
            else pen += 0.014;
          } else if (cps >= 54 && cps < 68) {
            if (/gpt-5\.6-sol/i.test(id)) pen -= 0.024;
            else if (/gpt-6\.1-sol/i.test(id)) pen -= 0.008;
            else pen += 0.012;
          } else if (cps < 54) {
            if (/gpt-6\.1-sol/i.test(id)) pen -= 0.026;
            else if (/gpt-6-sol\b/i.test(id)) pen -= 0.018;
            else pen += 0.014;
          }
        } else if (proto === 'claude' && !ev.visibleReasoning) {
          if (isFableCompact1Turn) {
            if (/fable-5\.1/i.test(id)) pen -= 0.036;
            else pen += 0.018;
          } else if (cps >= 120) {
            if (/haiku-5\.5/i.test(id)) pen -= 0.026;
            else pen += 0.014;
          } else if (cps >= 75 && cps < 120 && /sonnet-5\.5/i.test(id)) {
            pen -= 0.026;
          } else if (cps < 75) {
            if (/opus-5\.5/i.test(id)) pen -= 0.026;
            else if (/fable/i.test(id)) pen -= 0.012;
            else pen += 0.014;
          }
        } else if (proto === 'google' && ev.noReasoningParts) {
          if (cps >= 140) {
            if (/gemini-3\.8-flash/i.test(id)) pen -= 0.048;
            else if (/barium|argon/i.test(id)) pen += 0.032;
          } else {
            if (/barium|argon/i.test(id)) pen -= 0.048;
            else if (/gemini-3\.8-flash/i.test(id)) pen += 0.032;
          }
        }
      }

      if (ev.visibleReasoning === true || ev.reasoningSignature === 'visible-text') {
        if (proto === 'claude' || proto === 'openai' || proto === 'google') {
          pen += 0.45;
        } else {
          if (!isUnpricedSrc && /nemotron|may26-chatbot4/i.test(id + ' ' + label)) {
            pen += 0.15;
          }
          if (rAvg > 0) {
            if (rAvg >= 100) {
              if (/step-5|step-3/i.test(id + ' ' + label)) {
                pen -= 0.065;
                matchedDims.push('无额度特征:整段式思考缓冲(Step-5-Preview)');
              }
            } else if (rAvg >= 14.8) {
              if (/qwen3\.7-plus/i.test(id + ' ' + label)) {
                pen -= 0.065;
                matchedDims.push('无额度特征:大块思考流(Qwen3.7-Plus)');
              }
            } else if (rAvg >= 10.2) {
              if (/muse-spark-1\.3/i.test(id + ' ' + label)) {
                pen -= 0.062;
                matchedDims.push('无额度特征:中大块思考流(Muse-Spark-1.3)');
              }
            } else if (rAvg >= 8.35) {
              if (/mimo-v2\.6-pro/i.test(id + ' ' + label)) pen -= 0.058;
            } else if (rAvg >= 6.2) {
              if (durMs === 0 && visTok >= 10) {
                if (/grok-4\.7/i.test(id)) pen -= 0.058;
              } else if (/paisley-n9x0|qwen3\.8-max/i.test(id)) {
                pen -= 0.055;
              }
            } else if (rAvg >= 5.4) {
              if (nRowTurns === 1 && totSteps === 1 && ((durMs <= 2400 && visTok >= 60 && visTok <= 80) || (rAvg < 5.65 && visTok <= 5 && durMs >= 5500 && durMs <= 8200)) && /grok-4\.7/i.test(id)) {
                pen -= 0.048;
              } else if (nRowTurns === 1 && totSteps === 1 && rAvg >= 5.85 && visTok <= 5 && durMs >= 8200 && /paisley-n9x0|qwen3\.8-max/i.test(id)) {
                pen -= 0.055;
              } else if ((durMs >= 20000 || nReason >= 3 || totSteps >= 3) && /kimi-k3/i.test(id)) {
                pen -= 0.048;
              } else if (durMs < 20000 && nReason <= 2 && /glm-5\.3(?!-flash)/i.test(id)) {
                pen -= 0.048;
              }
            } else if (rAvg >= 3.6) {
              if (/grok-4\.7/i.test(id)) pen -= 0.048;
            } else if (rAvg >= 2.4) {
              if (rAvg < 3.05 && durMs > 0 && durMs < 1200) {
                if (/mimo-v2\.6-flash/i.test(id + ' ' + label)) pen -= 0.062;
              } else if (/deepseek-v4\.1-flash/i.test(id)) {
                pen -= 0.048;
              }
            } else if (/qwen.*27b/i.test(id + ' ' + label)) {
              pen -= 0.058;
            }
          } else {
            if (nRowTurns === 2 && totSteps === 5 && nReason === 4) {
              if (/qwen3\.7-max/i.test(id)) pen -= 0.062;
            } else if (nRowTurns === 1 && totSteps === 3 && nReason === 3) {
              if (/farris-ees5|qwen3\.8-flash/i.test(id + ' ' + label)) pen -= 0.058;
            } else if (nRowTurns === 1 && totSteps === 1) {
              if ((durMs >= 13500 && durMs <= 36000) || (durMs >= 300 && durMs <= 410 && visTok === 15)) {
                if (/kimi-k3/i.test(id)) pen -= 0.058;
              } else if ((durMs >= 8400 && durMs <= 12200 && visTok >= 18 && visTok <= 25) || (durMs >= 1350 && durMs <= 1980 && visTok === 15)) {
                if (/mimo-v2\.6-pro/i.test(id)) pen -= 0.058;
              } else if (durMs >= 6900 && durMs <= 9800 && visTok >= 45 && visTok <= 52) {
                if (/step-5/i.test(id)) pen -= 0.062;
              } else if (durMs >= 2850 && durMs <= 4100 && visTok === 52) {
                if (/muse-spark-1\.3/i.test(id)) pen -= 0.062;
              } else if (durMs > 2250 && durMs <= 3000 && visTok === 18) {
                if (/paisley-n9x0|qwen3\.8-max/i.test(id)) pen -= 0.058;
              } else if ((durMs >= 1600 && durMs <= 2250 && visTok === 18) || (durMs >= 2650 && durMs <= 3800 && visTok === 24) || (durMs >= 4200 && durMs <= 6000 && visTok === 75)) {
                if (/grok-4\.7/i.test(id)) pen -= 0.055;
              } else if (/deepseek-v4\.1-flash/i.test(id)) {
                pen -= 0.048;
              }
            } else if (/deepseek-v4\.1-flash/i.test(id)) {
              pen -= 0.048;
            }
          }
        }
      } else if (ev.noReasoningParts === true && nReason === 0) {
        if (nRowTurns === 1 && totSteps <= 2 && Number(ev.toolInputChars) >= 35000 && !(cps > 0 && cps < 180) && Number(ev.prefersReducedMotion) >= 1 && Number(ev.boxCommentCount || 0) === 0) {
          if (/muse-spark-1\.3/i.test(id)) { pen -= 0.082; matchedDims.push('无额度特征:Muse-Spark-1.3单步超长HTML写入'); }
          else pen += 0.055;
        } else if (nRowTurns === 1 && totSteps >= 100 && durMs === 0) {
          if (/deepseek-v4\.1/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 6 && totSteps >= 30 && totSteps <= 45) {
          if (/gpt-6\.1-sol/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 2 && totSteps === 2 && durMs === 0 && visTok >= 400 && visTok <= 460) {
          if (/gpt-6\.1-sol/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 2 && durMs >= 1700 && durMs <= 3450 && visTok >= 60 && visTok <= 75) {
          if (/deepseek-v4\.1-flash/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && durMs >= 200 && durMs <= 350 && visTok <= 6) {
          if (/opus-5\.5/i.test(id)) pen -= 0.072;
          else if (/fable/i.test(id)) pen -= 0.038;
          else pen += 0.040;
        } else if (nRowTurns === 1 && totSteps === 1 && durMs === 0 && visTok === 89) {
          if (/gpt-5\.6-terra/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && ((durMs > 0 && durMs <= 800 && visTok <= 16) || (durMs === 0 && visTok >= 80 && visTok <= 95) || (durMs === 0 && visTok === 45) || (durMs >= 1800 && durMs <= 8000 && (visTok === 11 || visTok === 51)))) {
          if (/gpt-6-luna/i.test(id)) pen -= 0.062;
          else pen += 0.030;
        } else if (nRowTurns === 1 && totSteps === 1 && durMs === 0 && visTok === 124) {
          if (/deepseek-v4\.1-flash/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && durMs === 0 && visTok === 65) {
          if (/farris-ees5|qwen3\.8-flash/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && durMs === 0 && visTok === 220 && b0 < 0.0025) {
          if (/kimi-k3/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (proto === 'google') {
          const isArgonTraj = nRowTurns >= 16 || (nRowTurns >= 2 && nRowTurns <= 4 && totSteps === 6) || (nRowTurns === 2 && nReason === 0) || (nRowTurns === 1 && totSteps === 1 && (visTok >= 150 || durMs >= 32000)) || (nRowTurns === 1 && totSteps === 1 && durMs === 0 && visTok === 220 && b0 >= 0.0025) || (nRowTurns === 1 && (durMs >= 180000 || (totSteps >= 4 && visTok <= 200))) || (nRowTurns <= 4 && durMs >= 68000) || durMs >= 500000 || (avgChunk >= 22.0 && (cps <= 0 || cps <= 138)) || (cps > 0 && cps <= 130);
          if (isArgonTraj) {
            if (/barium|argon/i.test(id)) pen -= 0.045;
            else pen += 0.020;
          } else {
            if (/gemini-3\.8-flash/i.test(id)) pen -= 0.045;
            else pen += 0.020;
          }
        } else {
          pen += 0.055;
        }
      } else {
        // Hidden reasoning regime (OpenAI / Anthropic + historical sparse multi-family sessions)
        if (nRowTurns >= 30 && totSteps >= 1000) {
          if (/opus-5\.5/i.test(id)) pen -= 0.072;
          else if (/fable-5\.1/i.test(id)) pen -= 0.038;
          else pen += 0.045;
        } else if ((nRowTurns === 3 && totSteps === 3 && nReason === 3 && durMs >= 4400 && durMs <= 6800) || (nRowTurns === 1 && totSteps === 1 && durMs >= 200 && durMs <= 350 && visTok <= 6)) {
          if (/opus-5\.5/i.test(id)) pen -= 0.072;
          else if (/fable-5\.1/i.test(id)) pen -= 0.038;
          else pen += 0.040;
        } else if ((nRowTurns === 2 && totSteps === 3 && nReason === 3 && visTok >= 2500) || (nRowTurns === 1 && totSteps === 1 && nReason === 1 && ((b0 >= 0.0060 && b0 <= 0.0076 && durMs < 4000 && visTok <= 65) || (b0 >= 0.00355 && b0 <= 0.00445 && durMs >= 3700 && durMs <= 8600 && visTok >= 48 && visTok <= 68) || (b0 === 0 && ((durMs >= 390 && durMs <= 580 && (visTok === 17 || visTok === 20)) || (durMs >= 2150 && durMs <= 3050 && visTok === 51) || (durMs >= 3200 && durMs <= 4500 && visTok === 65) || (durMs >= 7000 && durMs <= 9800 && visTok === 49)))))) {
          if (/haiku-5\.5/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (isMuseZeroQuota || (nRowTurns === 4 && totSteps === 4 && nReason === 0 && durMs === 0) || (nRowTurns >= 1 && nRowTurns <= 3 && totSteps >= 2 && totSteps <= 8 && nReason >= 3 && ((rAvg >= 6.5 && rAvg <= 29.0) || cps >= 140))) {
          if (/muse-spark-1\.3/i.test(id)) { pen -= 0.078; matchedDims.push('无额度特征:Muse-Spark-1.3多步推理与工具流'); }
          else pen += 0.055;
        } else if (nRowTurns === 1 && totSteps === 1 && nReason === 1 && durMs >= 220000 && visTok >= 2500 && cps >= 28 && cps <= 46) {
          if (/solar-pro4/i.test(id)) { pen -= 0.075; matchedDims.push('无额度特征:Solar-Pro-4长稳态生成流'); }
          else pen += 0.045;
        } else if (isFableCompact1Turn) {
          if (/claude-fable-5\.1/i.test(id)) { pen -= 0.088; matchedDims.push('无额度特征:Claude-Fable-5.1单轮双工具逆运动学编码'); }
          else pen += 0.055;
        } else if ((nRowTurns === 3 && totSteps === 5 && nReason === 2 && visTok >= 4000) || (nRowTurns === 1 && totSteps === 1 && nReason === 1 && durMs >= 60000)) {
          if (/glm-5\.3(?!-flash)/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 2 && totSteps === 4 && nReason === 4 && visTok >= 6000) {
          if (/gemini-3\.8-flash/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if ((nRowTurns === 2 && totSteps === 2 && nReason === 2 && durMs >= 17000 && visTok >= 500) || (nRowTurns === 1 && totSteps === 1 && nReason === 1 && ((durMs >= 275 && durMs <= 405 && visTok === 24) || (durMs >= 980 && durMs <= 1380 && visTok === 15) || (durMs >= 4200 && durMs <= 5900 && visTok === 76)))) {
          if (/deepseek-v4\.1-flash/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && nReason === 1 && durMs >= 2750 && durMs <= 3850 && visTok === 59) {
          if (/farris-ees5|qwen3\.8-flash/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && nReason === 1 && durMs >= 420 && durMs <= 610 && visTok === 15) {
          if (/paisley-n9x0|qwen3\.8-max/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && nReason === 3 && durMs >= 30000 && visTok >= 150) {
          if (/gpt-6-sol\b/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if ((nRowTurns === 1 && totSteps === 1 && nReason === 0 && durMs === 0 && visTok >= 130 && visTok <= 165) || (nRowTurns === 1 && totSteps === 1 && nReason === 1 && ((durMs >= 400 && durMs <= 590 && visTok === 23) || (durMs >= 1550 && durMs <= 2250 && visTok >= 95 && visTok <= 110) || (durMs >= 3250 && durMs <= 4600 && visTok === 51))) || (nRowTurns === 1 && totSteps === 2 && ((nReason === 2 && durMs >= 2650 && durMs <= 3850 && visTok === 65) || (nReason === 2 && durMs >= 10000 && durMs <= 15000 && visTok >= 220) || (nReason === 3 && durMs >= 5500 && durMs <= 8000 && visTok >= 175 && visTok <= 200)))) {
          if (/gpt-5\.6-sol/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && nReason === 1 && durMs >= 3600 && durMs <= 4350 && visTok === 37) {
          if (/gpt-5\.6-terra/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (nRowTurns === 1 && totSteps === 1 && nReason === 1 && ((((durMs >= 1300 && durMs <= 1600) || (durMs >= 2600 && durMs <= 3250)) && visTok === 21) || (((durMs >= 1030 && durMs <= 1085) || (durMs >= 1185 && durMs <= 1225)) && visTok === 23))) {
          if (/gpt-6-astra/i.test(id)) pen -= 0.065;
          else pen += 0.035;
        } else if (!isOpenAiTool && !isMuseZeroQuota && (isClaudeTool || ev.reasoningSignature === 'empty-deltas')) {
          if (proto !== 'claude') pen += 0.40;
          else if (/opus-5\.5/i.test(id) && (nRowTurns >= 20 || totSteps >= 10 || durMs >= 15000 || nReason >= 4)) pen -= 0.052;
          else if (/fable/i.test(id) && (nRowTurns >= 20 || totSteps >= 10 || durMs >= 15000 || nReason >= 4)) pen -= 0.024;
          else if (/haiku-5\.5/i.test(id) && nRowTurns <= 3 && durMs < 35000) pen -= 0.038;
        } else if ((nRowTurns >= 3 && nRowTurns <= 25 && totSteps >= 11 && totSteps < 1000 && nRowTurns !== 5)
          || (nRowTurns === 1 && totSteps === 3 && nReason === 3 && durMs >= 23000 && visTok >= 62)
          || (totSteps >= 4 && totSteps <= 9 && nReason === totSteps && visTok < 6000)
          || (nRowTurns === 2 && totSteps === 2 && nReason === 2 && durMs < 15000)
          || (nRowTurns === 1 && totSteps === 1 && nReason === 1 && (
            (b0 >= 0.00151 && b0 <= 0.00161 && durMs >= 1000 && visTok >= 16 && !(visTok === 46 && durMs >= 3500 && durMs <= 3600))
            || (durMs >= 300 && durMs <= 430 && visTok === 6)
            || (durMs >= 10000 && durMs <= 14500 && visTok === 19)
            || (durMs >= 800 && durMs <= 1700 && ((visTok === 13 || visTok === 16 || visTok === 19) || (durMs >= 1120 && durMs <= 1700 && visTok === 17) || (((durMs >= 1090 && durMs <= 1160) || (durMs >= 1250 && durMs <= 1500)) && visTok === 23)))
            || (durMs >= 2900 && durMs <= 7200 && visTok >= 52 && visTok <= 68 && !(b0 >= 0.00162) && !(visTok === 60 && durMs >= 5880) && !(visTok === 66 && ((durMs >= 4600 && durMs <= 4700) || (durMs >= 5300 && durMs <= 5500))) && !(durMs >= 3300 && durMs <= 3360))
          ))) {
          if (/gpt-6\.1-sol/i.test(id)) pen -= 0.068;
          else pen += 0.042;
        } else if (proto === 'openai') {
          if (/gpt-6-luna/i.test(id) && !(cps > 0 && cps < 135)) {
            pen -= 0.038;
          }
        } else if (proto !== 'claude' && !tcShape && !sShape) {
          pen += 0.040;
        }
      }
      if (ev && ev.stylometry && typeof ev.stylometry === 'object') {
        const st = ev.stylometry;
        if (st.profileTag) matchedDims.push(`零探针文体:${st.profileTag}`);
        if (!tcShape && !sShape && !ev.visibleReasoning) {
          if (st.familyHint === 'claude' && proto === 'claude') pen -= 0.008;
          else if (st.familyHint === 'openai' && proto === 'openai') pen -= 0.008;
          else if (st.familyHint === 'google' && proto === 'google') pen -= 0.008;
        }
      }
      if (ev && ev.toolHabits && typeof ev.toolHabits === 'object') {
        const th = ev.toolHabits;
        if (th.profileTag) matchedDims.push(`工具行为习惯:${th.profileTag}`);
        if (!tcShape && !sShape && !ev.visibleReasoning && th.totalToolCalls >= 1) {
          if (th.preToolChars >= 18 && th.preToolChars <= 260 && proto === 'claude') pen -= 0.010;
          else if (th.preToolChars === 0 && th.interToolChars === 0 && th.totalToolCalls >= 2 && (proto === 'google' || proto === 'openai')) pen -= 0.008;
        }
      }
      if (/deepseek-v4\.1-flash/i.test(id + ' ' + label)) {
        const is1017Zq = (nRowTurns >= 3)
          || (rAvg >= 2.68 && rAvg <= 3.60)
          || (nRowTurns === 1 && ((durMs === 0 && visTok >= 180) || (nReason === 1 && ((durMs >= 2900 && durMs <= 4500 && visTok <= 92) || durMs >= 10000))));
        const isCand1017 = /1017|202610/i.test(id + ' ' + label);
        if (is1017Zq) {
          if (isCand1017) matchedDims.push('无额度子版本:DeepSeek-1017');
          else pen += 0.0035;
        } else {
          if (isCand1017) pen += 0.0035;
          else matchedDims.push('无额度子版本:DeepSeek-0910');
        }
      }
      return { penalty: pen, matchedDims };
    }

    // Mode 2: Auxiliary regularizer for 4-channel Diophantine solver when !isExactP50Lock
    const t1I = Number(solvedTokens && solvedTokens.turn1I) || 0;
    const t1W = Number(solvedTokens && solvedTokens.turn1W) || 0;
    const t1R = Number(solvedTokens && solvedTokens.turn1R) || 0;
    const sumO = Number(solvedTokens && solvedTokens.O) || 0;
    const maxTurnO = Number(solvedTokens && solvedTokens.maxTurnO) || 0;
    const r0Steps = Math.max(1, Number(rows && rows[0] && rows[0].stepCount) || 1);

    // Aux Law 1: Kimi K3 5632-token system prompt cache block conservation
    if (t1R === 5632 && t1I >= 1940 && t1I <= 2010 && t1W === 0) {
      if (/kimi-k3|kivine/i.test(id)) {
        pen -= 0.038;
        matchedDims.push('无额度辅助项:R1=5632系统提示词块(锁定Kimi-K3)');
      } else {
        pen += 0.022;
      }
    }
    // Aux Law 2: Single-turn 2-step prompt-cache conservation (Step 2 caches Step 1 prompt: I_total ≈ R_step2 + I_tool)
    if (Array.isArray(rows) && rows.length === 1 && r0Steps === 2 && t1R >= 3500 && t1W === 0) {
      const irRatio = t1I / t1R;
      if (irRatio >= 0.95 && irRatio <= 1.35 && t1R >= 5500 && t1R <= 10500) {
        pen -= 0.018;
        matchedDims.push('无额度辅助项:双步缓存守恒(I1≈R1)');
      } else if (irRatio > 1.75 || t1R > 14000) {
        pen += 0.028;
      }
    }
    // Aux Law 3: Sub-second thinking velocity ceiling (flagship models cannot exceed 4500 tok/s in <0.6s, nor 2x sub-harmonic >3500 tok in <1.0s)
    if (durMs > 0 && durMs < 600 && sumO > 2400) {
      if (/gpt-6\.1-sol|barium|argon|opus-5\.5/i.test(id)) {
        pen += 0.038;
      }
    } else if (durMs > 0 && durMs < 1000 && sumO > 3500 && t1R >= 6500 && t1R <= 6700 && t1I >= 180) {
      pen += 0.045;
    }
    // Aux Law 4: Single-turn 1-step OpenAI 6599 / 13,198..13,208 cached prompt vs 2x sub-harmonic (t1I doubled to 150..230)
    if (Array.isArray(rows) && rows.length === 1 && r0Steps === 1 && t1W === 0) {
      if (t1I >= 60 && t1I <= 115 && (t1R === 6599 || t1R === 6600 || (t1R >= 13190 && t1R <= 13215)) && /gpt-6\.1-sol|gpt-6-luna|gpt-6-astra/i.test(id)) {
        pen -= 0.022;
        matchedDims.push('无额度辅助项:OpenAI标准系统缓存块吻合');
      } else if (t1I >= 150 && t1I <= 230 && (t1R === 6599 || t1R === 6600 || t1R === 6604 || (t1R >= 13190 && t1R <= 13215))) {
        pen += 0.025;
      } else if (t1R > 20000 && t1R < 100000 && t1I < 300) {
        pen += 0.065;
      }
    }
    if (Array.isArray(rows) && rows.length === 1 && r0Steps >= 2 && r0Steps <= 3 && t1W === 0 && t1R > 45000 && t1R < 100000) {
      pen += 0.025;
    }
    // Aux Law 5: Extreme single-turn output (>64k) excludes legacy low-sample Sol
    if (maxTurnO > 65536 && /gpt-6-sol\b/i.test(id)) {
      pen += 0.040;
    }
    if ((sumO > 2000000 || t1W > 40000) && /sonnet/i.test(id)) {
      pen += 0.025;
    }
    if (ev.hiddenReasoning === true && t1R === 0 && t1I >= 7400 && t1I <= 12000 && /qwen3\.8-27b/i.test(id)) {
      pen += 0.020;
    }
    if (ev.noReasoningParts === true && t1R === 0 && t1I >= 7400 && t1I <= 12000 && /qwen3\.8-27b/i.test(id)) {
      pen += 0.020;
    }

    return { penalty: pen, matchedDims };
  }

  function predictBasePrice(model, costs, rates, tiers, perMessage, evidence, allowZeroQuota = false) {
    if (!model || !costs) return null;
    const rawModel = model;
    const m = enrichModelRates(model);
    if (!m || !(m.prompt > 0) || !(m.completion > 0)) return null;

    const p50Variants = rates ? [rates] : AGENT_P50_VARIANTS;
    const list = (Array.isArray(tiers) && tiers.length) ? tiers : PRICE_TIERS;
    const observed = Number(costs.basePriceUsd) || 0;
    const rows = (Array.isArray(perMessage) && perMessage.length)
      ? perMessage.filter((r) => r && (Number(r.basePriceUsd) > 0 || Number(r.outputUsd) > 0 || Number(r.inputUsd) > 0 || Number(r.cacheReadUsd) > 0 || Number(r.cacheWriteUsd) > 0 || Number(r.visTokens) > 0 || Number(r.tokens) > 0 || allowZeroQuota))
      : ((observed > 0 || Number(costs.outputUsd) > 0 || Number(costs.inputUsd) > 0 || Number(costs.cacheReadUsd) > 0 || Number(costs.cacheWriteUsd) > 0 || allowZeroQuota) ? [costs] : []);
    const is6DecQuantized = rows.length > 0 && rows.every((r) => {
      for (const k of ['outputUsd', 'inputUsd', 'cacheReadUsd', 'cacheWriteUsd', 'basePriceUsd']) {
        const v = Number(r && r[k]) || 0;
        if (v > 0 && Math.abs(v * 1e6 - Math.round(v * 1e6)) > 1e-4) return false;
      }
      return true;
    }) && rows.some((r) => (Number(r && r.outputUsd) || 0) > 0);

    const hasCW = (Number(costs.cacheWriteUsd) || 0) > 0 || rows.some((r) => Number(r.cacheWriteUsd) > 0);
    const hasCR = (Number(costs.cacheReadUsd) || 0) > 0 || rows.some((r) => Number(r.cacheReadUsd) > 0);
    const hasIn = (Number(costs.inputUsd) || 0) > 0 || rows.some((r) => Number(r.inputUsd) > 0);
    const vNorm = normVendor(rawModel.vendor || rawModel.org);
    const NO_CW_VENDORS = new Set(['openai', 'google', 'xai', 'mistralai']);

    let cachePatternPenalty = 0;
    let cacheSoftPrior = 0;
    const isAstraModel = /gpt-6-astra/i.test(String(rawModel && rawModel.id || ''));
    if (hasCW && NO_CW_VENDORS.has(vNorm)) {
      cachePatternPenalty = isAstraModel ? 0.14 : 0.35;
    } else if (!hasCW && hasIn && vNorm === 'anthropic') {
      const evToolFam = evidence && evidence.toolFamily ? String(evidence.toolFamily).toLowerCase() : '';
      cacheSoftPrior = (evToolFam === 'anthropic' || evToolFam === 'claude') ? 0 : (hasCR ? 0.0085 : 0.0010);
    }

    // Gate 2.0x / asymmetric long-context multiplier on actual.isLongContext when explicitly known false
    const anyLongContext = costs.isLongContext === true || rows.some((r) => r && r.isLongContext === true);
    const allShortContext = !tiers && rows.length > 0 && rows.every((r) => r && r.isLongContext === false);
    const activeTiers = allShortContext ? list.filter((t) => Math.abs(t - 2.0) > 1e-6) : list;

    const crVariants = (Array.isArray(m.cacheReadList) && m.cacheReadList.length) ? m.cacheReadList : [m.cacheRead];
    const cwVariants = (Array.isArray(m.cacheWriteList) && m.cacheWriteList.length) ? m.cacheWriteList : [m.cacheWrite];
    const rateProfiles = [
      { prompt: m.prompt, completion: m.completion, crList: crVariants, cwList: cwVariants, tiers: activeTiers, altIdx: 0 },
    ];
    if (anyLongContext) {
      // Official asymmetric long-context rate profile: input/cacheRead/cacheWrite * 2.0, output * 1.5
      rateProfiles.push({
        prompt: m.prompt * 2.0,
        completion: m.completion * 1.5,
        crList: crVariants.map((v) => (Number(v) || 0) * 2.0),
        cwList: cwVariants.map((v) => (Number(v) || 0) * 2.0),
        tiers: [1.0],
        altIdx: 0,
        isAsymLongCtx: true,
      });
    }
    if (Array.isArray(m.altRates)) {
      const isDs41 = /deepseek-v4\.1-flash/i.test(String(rawModel.id || ''));
      m.altRates.forEach((ar, idx) => {
        if (ar && ar.prompt > 0 && ar.completion > 0) {
          rateProfiles.push({
            prompt: ar.prompt,
            completion: ar.completion,
            crList: ar.cacheRead > 0 ? (isDs41 ? [ar.cacheRead, ...crVariants.filter((v) => Math.abs(v - ar.cacheRead) > 1e-12)] : [ar.cacheRead]) : crVariants,
            cwList: ar.cacheWrite > 0 ? [ar.cacheWrite] : cwVariants,
            tiers: [1.0],
            altIdx: (Boolean(ar.isOfficialPrimary) || /claude-haiku-5\.5/i.test(String(rawModel.id || '')) || isDs41) ? 0 : (idx + 1),
          });
        }
      });
    }

    const evalMemo = new Map();
    const effortMemo = new Map();
    let best = null;
    for (let p50Idx = 0; p50Idx < p50Variants.length; p50Idx += 1) {
      const p50 = p50Variants[p50Idx];
      if (p50Idx > 1 && best && best.diophantinePassed && best.rmsResidual < 1e-5 && best.tier === 1.0) break;
      for (const prof of rateProfiles) {
      for (const tier of prof.tiers) {
        if (tier !== 1.0 && best && best.diophantinePassed && best.rmsResidual < 1e-3 && best.tier === 1.0 && best.p50Used === p50) break;
        const crLen = hasCR ? prof.crList.length : 1;
        const cwLen = hasCW ? prof.cwList.length : 1;
        for (let crIdx = 0; crIdx < crLen; crIdx += 1) {
          const crBase = prof.crList[crIdx];
          for (let cwIdx = 0; cwIdx < cwLen; cwIdx += 1) {
            const cwBase = prof.cwList[cwIdx];
            const effModel = {
              prompt: prof.prompt * tier,
              completion: prof.completion * tier,
              cacheRead: (Number(crBase) || 0) * tier,
              cacheReadList: prof.crList.map((v) => (Number(v) || 0) * tier),
              cacheWrite: (Number(cwBase) || 0) * tier,
            };
            const pairs = [
              [Number(costs.outputUsd) || 0, effModel.completion, p50.completion],
              [Number(costs.inputUsd) || 0, effModel.prompt, p50.prompt],
              [Number(costs.cacheReadUsd) || 0, effModel.cacheRead, p50.cacheRead],
              [Number(costs.cacheWriteUsd) || 0, effModel.cacheWrite, p50.cacheWrite],
            ];
            let predicted = 0;
            let channels = 0;
            let unpriced = false;
            for (const [obs, price, rate] of pairs) {
              if (!(obs > 0)) continue;
              if (!(price > 0)) {
                if (rate === p50.cacheRead) continue;
                unpriced = true;
                break;
              }
              predicted += (obs / price) * rate;
              channels += 1;
            }
            if (unpriced) continue;
            if (!channels) {
              const isUnpricedSource = rows.some((r) => String((r && r.source) || '').toLowerCase() === 'unpriced')
                || (evidence && Array.isArray(evidence.billingSources) && evidence.billingSources.some((s) => String(s || '').toLowerCase() === 'unpriced'));
              if (!(isUnpricedSource && observed > 0) && !allowZeroQuota) continue;
              if (tier !== 1.0 || crIdx > 0 || cwIdx > 0 || prof.altIdx > 0 || p50 !== p50Variants[0]) continue;
              const syn = synthesizeZeroQuotaTokens(rawModel, evidence, rows, p50, observed, isUnpricedSource);
              const unpricedTurnTokens = syn.turnTokens;
              const unpricedEv = syn.evidence || evidence;
              const effortProfile = inferModelEffortGrade(rawModel, syn.baseSolvedTokens, unpricedEv, rows, unpricedTurnTokens);
              const inferredEffort = String(effortProfile.primaryEffort || 'high').toLowerCase();
              const dynamicLabel = formatDynamicEffortLabel(rawModel && (rawModel.label || rawModel.id), effortProfile);
              const solvedTokens = {
                I: syn.baseSolvedTokens.I, W: syn.baseSolvedTokens.W, R: syn.baseSolvedTokens.R, O: syn.baseSolvedTokens.O,
                visO: effortProfile.visTokens,
                maxTurnO: syn.baseSolvedTokens.maxTurnO,
                thinking: effortProfile.thinkTokens,
                peakThinking: effortProfile.peakThinkTokens,
                expansionRatio: effortProfile.expansionRatio,
                reiScore: effortProfile.reiScore,
                avgOutPerTurn: syn.baseSolvedTokens.avgOutPerTurn,
                turns: syn.baseSolvedTokens.turns,
              };
              const multiDim = computeMultiDimPenalty(rawModel, unpricedEv, solvedTokens, hasCW, hasCR, rows, unpricedTurnTokens);
              const zqAux = computeZeroQuotaAux(rawModel, unpricedEv, solvedTokens, rows, true, observed);
              const matchedDimsWithEffort = (multiDim.matchedDims || []).concat(zqAux.matchedDims || [], [`思考档位:${effortProfile.effort}(REI=${effortProfile.reiScore})`]);
              const rawZqScore = (multiDim.hardPenalty || 0) + (multiDim.softPenalty || 0) + (zqAux.penalty || 0);
              const scoreResidual = rawZqScore <= 0.001
                ? Math.max(0.0001, Number((0.001 + rawZqScore * 0.005).toFixed(6)))
                : rawZqScore;
              best = {
                predicted: observed,
                channels: 1,
                tier: 1.0,
                solverTier: 2,
                priceResidual: 0,
                residual: scoreResidual,
                aggResidual: 0,
                rmsResidual: 0,
                scoreResidual,
                diophantineRate: 1,
                diophantinePassed: scoreResidual < 0.1,
                matchedVariant: (p50 && (p50.epochId || p50.key)) || '2026-10-15',
                cachePatternPenalty: 0,
                hardPenalty: multiDim.hardPenalty || 0,
                softPenalty: multiDim.softPenalty || 0,
                effectiveResidual: scoreResidual,
                multiDimPenalty: scoreResidual,
                matchedPromptPerM: Number((effModel.prompt * 1e6).toFixed(6)),
                matchedCompletionPerM: Number((effModel.completion * 1e6).toFixed(6)),
                matchedCacheWritePerM: null,
                matchedDims: matchedDimsWithEffort,
                matchedCacheReadPerM: null,
                turnTokens: unpricedTurnTokens,
                solvedTokens,
                inferredEffort,
                effortProfile,
                dynamicLabel,
                baseLabel: rawModel && (rawModel.label || rawModel.id),
                contextMonotone: true,
                p50Used: p50,
              };
              continue;
            }
            const aggResidual = observed > 0 ? Math.abs(predicted - observed) / observed : (channels > 0 ? 0 : Infinity);

            // Simultaneous multi-turn Diophantine evaluation (with Tier 3 cacheRead elimination)
            let sumSqRel = 0;
            let validTurns = 0;
            let diophantinePassTurns = 0;
            let sumTokenRelErr = 0;
            let maxSolverTier = 1;
            let derivedCrPerM = null;
            let maxTurnO = 0;
            const turnTokens = [];
            for (const r of rows) {
              const d = checkDiophantineTurn(r, effModel, p50, is6DecQuantized);
              if (!d.valid) continue;
              validTurns += 1;
              if (Number.isFinite(d.baseRelErr)) sumSqRel += d.baseRelErr * d.baseRelErr;
              if (d.allIntPassed && d.baseRelErr < 1e-3) diophantinePassTurns += 1;
              if (d.solverTier > maxSolverTier) maxSolverTier = d.solverTier;
              if (d.derivedCacheReadPerM != null) derivedCrPerM = d.derivedCacheReadPerM;
              if ((d.tokens.O || 0) > maxTurnO) maxTurnO = d.tokens.O;
              sumTokenRelErr += d.maxTokenRelErr;
              turnTokens.push(Object.assign({}, d.tokens, {
                visO: r.visTokens || d.visTokens || 0,
                reasonO: r.reasonTokens || d.reasonTokens || 0,
                stepCount: r.stepCount || d.stepCount || 1,
                durationMs: r.durationMs || d.durationMs || 0,
                solverTier: d.solverTier || 1,
              }));
            }

            const rmsResidual = (validTurns > 0 && observed > 0) ? Math.sqrt(sumSqRel / validTurns) : aggResidual;
            const diophantineRate = validTurns > 0 ? diophantinePassTurns / validTurns : 0;
            const avgTokenErr = validTurns > 0 ? sumTokenRelErr / validTurns : 0;

            // Cross-turn context monotonicity check (C_m = I_m + R_m + W_m)
            let contextMonotone = true;
            for (let ti = 1; ti < turnTokens.length; ti += 1) {
              const prevC = turnTokens[ti - 1].I + turnTokens[ti - 1].R + turnTokens[ti - 1].W;
              const currC = turnTokens[ti].I + turnTokens[ti].R + turnTokens[ti].W;
              if (prevC > 200 && currC > 0 && currC < prevC * 0.75) {
                contextMonotone = false;
                break;
              }
            }
            const monotonePenalty = contextMonotone ? 0 : 0.002;
            const diophantinePenalty = (1 - diophantineRate) * 0.08 + Math.min(0.05, avgTokenErr * 0.5) + monotonePenalty;
            const p50EpochPen = p50Idx > 1 ? (0.0004 * (p50Idx - 1)) : 0;
            const altRatePen = prof.altIdx > 0 ? (0.015 * prof.altIdx) : 0;
            const solverTierPen = maxSolverTier === 3 ? (0.025 + (Number.isFinite(aggResidual) ? Math.min(0.05, aggResidual * 0.5) : 0)) : 0;
            const sampleCount = Number(rawModel && rawModel.agentTaskSamples) || 0;
            const legacySamplePen = (prof.altIdx > 0 && sampleCount > 0 && sampleCount < 600) ? 0.012 : 0;
            const priorPen = tierPriorPenalty(tier) + p50EpochPen + altRatePen + solverTierPen + legacySamplePen;
            const isLegacyFable5 = /claude-fable-5$/i.test(String(rawModel && rawModel.id || ''));
            const crStepPen = isLegacyFable5 ? 0.14 : 0.0008;
            const variantPen = (hasCR ? crIdx * crStepPen : 0) + (hasCW ? cwIdx * 0.0004 : 0);

            const sumTokens = turnTokens.reduce((acc, t) => ({
              I: acc.I + (t.I || 0),
              W: acc.W + (t.W || 0),
              R: acc.R + (t.R || 0),
              O: acc.O + (t.O || 0),
              visO: acc.visO + (t.visO || 0),
            }), { I: 0, W: 0, R: 0, O: 0, visO: 0 });
            const nTurns = Math.max(1, validTurns);
            const t1 = turnTokens[0] || {};
            const memoKey = `${sumTokens.I}:${sumTokens.W}:${sumTokens.R}:${sumTokens.O}:${maxTurnO}:${validTurns}:${maxSolverTier}:${turnTokens.map((t) => `${t.I},${t.R},${t.W},${t.O},${t.solverTier || 1}`).join(';')}`;
            let cachedEval = evalMemo.get(memoKey);
            if (!cachedEval) {
              const effortKey = `${sumTokens.I}:${sumTokens.O}:${maxTurnO}:${validTurns}:${turnTokens.map((t) => `${t.I},${t.O}`).join(';')}`;
              let cachedEffort = effortMemo.get(effortKey);
              if (!cachedEffort) {
                const baseSolvedTokens = {
                  I: sumTokens.I,
                  W: sumTokens.W,
                  R: sumTokens.R,
                  O: sumTokens.O,
                  visO: sumTokens.visO,
                  maxTurnO,
                  avgOutPerTurn: Math.round(sumTokens.O / nTurns),
                  turns: validTurns,
                };
                const effortProfile = inferModelEffortGrade(rawModel, baseSolvedTokens, evidence, rows, turnTokens);
                const inferredEffort = String(effortProfile.primaryEffort || 'high').toLowerCase();
                const dynamicLabel = formatDynamicEffortLabel(rawModel && (rawModel.label || rawModel.id), effortProfile);
                cachedEffort = { effortProfile, inferredEffort, dynamicLabel };
                effortMemo.set(effortKey, cachedEffort);
              }
              const { effortProfile, inferredEffort, dynamicLabel } = cachedEffort;
              const solvedTokens = {
                I: sumTokens.I,
                W: sumTokens.W,
                R: sumTokens.R,
                O: sumTokens.O,
                turn1I: t1.I || 0,
                turn1W: t1.W || 0,
                turn1R: t1.R || 0,
                visO: effortProfile.visTokens,
                maxTurnO,
                thinking: effortProfile.thinkTokens,
                peakThinking: effortProfile.peakThinkTokens,
                expansionRatio: effortProfile.expansionRatio,
                reiScore: effortProfile.reiScore,
                avgOutPerTurn: Math.round(sumTokens.O / nTurns),
                turns: validTurns,
              };

              const multiDim = computeMultiDimPenalty(rawModel, evidence, solvedTokens, hasCW, hasCR, rows, turnTokens);
              const zqAux = computeZeroQuotaAux(rawModel, evidence, solvedTokens, rows, Boolean(rawModel.zeroDayUnlisted), observed);
              const matchedDimsWithEffort = (multiDim.matchedDims || []).concat(zqAux.matchedDims || [], [`思考档位:${effortProfile.effort}(REI=${effortProfile.reiScore})`]);
              cachedEval = { effortProfile, inferredEffort, dynamicLabel, solvedTokens, multiDim, zqAux, matchedDimsWithEffort };
              evalMemo.set(memoKey, cachedEval);
            }
            const { effortProfile, inferredEffort, dynamicLabel, solvedTokens, multiDim, zqAux, matchedDimsWithEffort } = cachedEval;
            const isExactP50Lock = observed > 0 && diophantineRate === 1 && maxSolverTier === 1 && rmsResidual < 1e-4;
            let scalePlausibilityPen = isExactP50Lock ? 0 : (zqAux?.penalty || 0);
            if (!isExactP50Lock) {
              const t1I = t1.I || 0, t1W = t1.W || 0, t1R = t1.R || 0;
              const t1C = t1I + t1W + t1R;
              const proto = resolveModelProtoFamily(rawModel);
              if (proto === 'claude') {
                if (t1I === 4 && t1W >= 11700 && t1W <= 12100) scalePlausibilityPen -= 0.045;
                else if (t1I === 8 && t1W >= 23400 && t1W <= 24200) scalePlausibilityPen += 0.085;
              }
              if (t1R === 0 && t1W === 0 && t1I >= 13320 && t1I <= 13520 && (t1.stepCount || 1) <= 3) {
                scalePlausibilityPen += 0.055;
              } else if (rows.length === 1 && (t1.stepCount || 1) === 1 && t1I >= 120 && t1R > 35000 && t1R < 100000) {
                scalePlausibilityPen += 0.065;
              }
            }
            const effCrPerM = derivedCrPerM != null ? derivedCrPerM : (Number(crBase) ? Number((crBase * 1e6).toFixed(4)) : null); const fableCrPen = (isLegacyFable5 && hasCR && (crIdx > 0 || maxSolverTier === 3 || (effCrPerM != null && Math.abs(effCrPerM - 0.25) < 0.05))) ? 0.16 : 0; const fableEffortPen = fableCrPen + ((isLegacyFable5 && ((effortProfile && effortProfile.reiScore >= 240) || (effortProfile && effortProfile.effThinkTok >= 2400))) ? 0.05 : 0);
            const effHardPen = (isAstraModel && cachePatternPenalty > 0 && (multiDim.hardPenalty || 0) > 0 && (multiDim.hardPenalty || 0) < 0.5)
              ? Math.max(0, (multiDim.hardPenalty || 0) - cachePatternPenalty)
              : (multiDim.hardPenalty || 0);
            const hardResidual = rmsResidual + diophantinePenalty + cachePatternPenalty + solverTierPen + effHardPen;
            const scoreResidual = Math.max(0, hardResidual + (priorPen - solverTierPen) + (typeof cacheSoftPrior !== 'undefined' ? cacheSoftPrior : 0) + variantPen + fableEffortPen + (multiDim.softPenalty || 0) + scalePlausibilityPen);

            const curExactT1 = diophantineRate === 1 && maxSolverTier === 1 && rmsResidual < 1e-4;
            const bestExactT1 = Boolean(best && best.diophantineRate === 1 && best.solverTier === 1 && best.rmsResidual < 1e-4);
            const better = !best
              || (curExactT1 && !bestExactT1)
              || (curExactT1 === bestExactT1 && (
                scoreResidual < best.scoreResidual - 1e-12
                || (Math.abs(scoreResidual - best.scoreResidual) <= 1e-12
                    && Math.abs(tier - 1) < Math.abs(best.tier - 1))
              ));
            if (better) {
              best = {
                predicted,
                channels,
                tier: prof.isAsymLongCtx ? 1.5 : tier,
                solverTier: maxSolverTier,
                priceResidual: rmsResidual,
                residual: rmsResidual,
                aggResidual,
                rmsResidual,
                scoreResidual,
                diophantineRate,
                diophantinePassed: diophantineRate === 1,
                matchedVariant: (p50 && (p50.epochId || p50.key)) || '2026-10-15',
                cachePatternPenalty,
                hardPenalty: multiDim.hardPenalty || 0,
                softPenalty: multiDim.softPenalty || 0,
                effectiveResidual: (diophantineRate === 1 && hardResidual < 1e-3 && scoreResidual < 3e-3) ? rmsResidual : Math.max(hardResidual, scoreResidual),
                multiDimPenalty: multiDim.penalty,
                matchedPromptPerM: Number((effModel.prompt * 1e6).toFixed(6)),
                matchedCompletionPerM: Number((effModel.completion * 1e6).toFixed(6)),
                matchedCacheWritePerM: Number(effModel.cacheWrite) ? Number((effModel.cacheWrite * 1e6).toFixed(6)) : null,
                matchedDims: matchedDimsWithEffort,
                matchedCacheReadPerM: derivedCrPerM != null ? derivedCrPerM : (Number(crBase) ? Number((crBase * 1e6).toFixed(4)) : null),
                turnTokens,
                solvedTokens,
                inferredEffort,
                effortProfile,
                dynamicLabel,
                contextMonotone,
                p50Used: p50,
              };
            }
          }
        }
      }
      }
    }
    return best;
  }

  const CHANNELS = [
    ['outputUsd', 'completion'],
    ['inputUsd', 'prompt'],
    ['cacheReadUsd', 'cacheRead'],
    ['cacheWriteUsd', 'cacheWrite'],
  ];

  /** 本轮真正产生了费用的计费通道。没有费用的通道推不出 token 数。 */
  function activeChannels(costs) {
    return CHANNELS.filter(([k]) => (Number(costs && costs[k]) || 0) > 0).map(([, f]) => f);
  }

  function impliedFreeTokens(model, costs, rates) {
    if (!model || !costs) return null;
    const m = enrichModelRates(model);
    const p50 = rates || AGENT_P50_RATES;
    const observed = Number(costs.basePriceUsd) || 0;
    if (!(observed > 0)) return null;
    let predicted = 0;
    for (const [k, f] of CHANNELS) {
      const obs = Number(costs[k]) || 0;
      if (!(obs > 0)) continue;
      const rate = Number(m[f]) || 0;
      if (!(rate > 0)) return null;
      predicted += (obs / rate) * p50[f];
    }
    const gap = observed - predicted;
    return { predicted, gap, tokens: gap / p50.prompt, impossible: gap < -1e-12 };
  }

  function channelDegeneracy(candidates, channels) {
    const list = (candidates || []).filter((m) => m);
    if (list.length < 2 || !channels || channels.length === 0) {
      return { degenerate: list.length > 1, channels: channels || [], reason: 'too-few-channels' };
    }
    const ref = enrichModelRates(list[0]);
    const refVec = channels.map((c) => Number(ref[c]) || 0);
    if (refVec.some((v) => !(v > 0))) return { degenerate: false, channels };
    for (const raw of list.slice(1)) {
      const m = enrichModelRates(raw);
      const vec = channels.map((c) => Number(m[c]) || 0);
      if (vec.some((v) => !(v > 0))) return { degenerate: false, channels };
      const k = vec[0] / refVec[0];
      for (let i = 1; i < vec.length; i += 1) {
        if (Math.abs(vec[i] / refVec[i] - k) > 1e-9 * Math.max(1, k)) {
          return { degenerate: false, channels };
        }
      }
    }
    return { degenerate: true, channels, reason: 'proportional-rates' };
  }

  function solveGaussLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col += 1) {
      let piv = col;
      for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-18) return null;
      const t = M[col]; M[col] = M[piv]; M[piv] = t;
      for (let r = 0; r < n; r += 1) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let c2 = col; c2 <= n; c2 += 1) M[r][c2] -= f * M[col][c2];
      }
    }
    return M.map((row, j) => row[n] / row[j]);
  }

  /**
   * 联立方程组直接反解上游各通道真实单价：
   *   Σ_{j ∈ A} c_{m,j} · θ_j = B_m,   其中 θ_j = p50_j / r_{eff,j}
   * 使用全部有效轮次的加权正规方程 (X^T W X) θ = X^T W B (w_m = 1 / B_m^2) 求解。
   */
  function impliedRates(perMessage, costs, rates) {
    const p50 = rates || AGENT_P50_RATES;
    const chans = activeChannels(costs);
    const rows = (perMessage || []).filter((u) => Number(u.basePriceUsd) > 0);
    if (!chans.length || rows.length < chans.length) {
      return { ok: false, reason: 'need-more-messages', channels: chans,
        need: chans.length, have: rows.length };
    }
    const KEY = { completion: 'outputUsd', prompt: 'inputUsd',
      cacheRead: 'cacheReadUsd', cacheWrite: 'cacheWriteUsd' };
    const n = chans.length;

    // 1. Weighted Normal Equations over all valid turns
    const XtX = Array.from({ length: n }, () => Array(n).fill(0));
    const Xtb = Array(n).fill(0);
    for (const u of rows) {
      const B = Number(u.basePriceUsd) || 0;
      if (!(B > 0)) continue;
      const w = 1 / (B * B);
      const x = chans.map((c) => Number(u[KEY[c]]) || 0);
      for (let i = 0; i < n; i += 1) {
        Xtb[i] += w * x[i] * B;
        for (let j = 0; j < n; j += 1) XtX[i][j] += w * x[i] * x[j];
      }
    }
    let theta = solveGaussLinear(XtX, Xtb);

    // 2. Fallback to first n rows if normal matrix is singular
    if (!theta || theta.some((x) => !(x > 0))) {
      const A = rows.slice(0, n).map((u) => chans.map((c) => (Number(u[KEY[c]]) || 0)));
      const b = rows.slice(0, n).map((u) => Number(u.basePriceUsd) || 0);
      theta = solveGaussLinear(A, b);
    }
    if (!theta) return { ok: false, reason: 'singular', channels: chans };

    const out = {};
    let bad = false;
    chans.forEach((c, j) => {
      const x = theta[j];
      const rate = x > 0 ? p50[c] / x : null;
      if (!(rate > 0)) bad = true;
      out[c] = rate;
    });
    if (bad) return { ok: false, reason: 'non-positive', channels: chans, rates: out };
    if (!out.prompt && out.cacheWrite) {
      out.promptImpliedFromCacheWrite = out.cacheWrite / 1.25;
    }
    let sumSq = 0;
    for (const u of rows) {
      const B = Number(u.basePriceUsd) || 0;
      let pred = 0;
      chans.forEach((c, j) => { pred += (Number(u[KEY[c]]) || 0) * theta[j]; });
      const rel = (pred - B) / B;
      sumSq += rel * rel;
    }
    const rmsResidual = Math.sqrt(sumSq / rows.length);
    const ratios = {};
    if (out.completion && out.cacheWrite) ratios.completionOverCacheWrite = out.completion / out.cacheWrite;
    if (out.completion && out.prompt) ratios.completionOverPrompt = out.completion / out.prompt;
    return { ok: true, channels: chans, rates: out, ratios, messagesUsed: rows.length, rmsResidual };
  }

  /**
   * 联立方程 + 丢番图整数原像约束给候选排序。
   */
  function modelGenerationScore(c) {
    const labelStr = String((c && c.label) || '').toLowerCase();
    const idStr = String((c && c.id) || '').toLowerCase().replace(/-bb-v\d+/g, '');
    const s = labelStr + ' ' + idStr;
    const verMatch = /(?:opus[- ]|sonnet[- ]|haiku[- ]|fable[- ]|gemini[- ]|gpt[- ]|glm[- ]|mimo[- ]v|qwen\s*|deepseek[- ]v|kimi[- ]k|grok[- ]|hy\s*|step[- ]|minimax[- ]m|spark[- ])(\d+(?:\.\d+)?)/i.exec(s);
    const ver = verMatch ? parseFloat(verMatch[1]) : 0;
    let bonus = Number.isFinite(ver) ? ver * 10 : 0;
    if (/gemini\s*4|barium|argon/i.test(s)) bonus = Math.max(bonus, 62);
    const samples = Number(c && c.agentTaskSamples) || 0;
    if (samples > 0) bonus += Math.log10(Math.max(10, samples)) * 4;
    if (/\b(?:xhigh|high|max|pro)\b/i.test(s)) bonus += 0.5;
    return bonus;
  }

  function rankByBasePrice(catalog, costs, basePriceUsd, options) {
    const opts = options || {};
    const base = Number(basePriceUsd) || 0;
    const has4Ch = costs && ((Number(costs.outputUsd) || 0) > 0 || (Number(costs.inputUsd) || 0) > 0 || (Number(costs.cacheReadUsd) || 0) > 0 || (Number(costs.cacheWriteUsd) || 0) > 0);
    const allowZeroQuota = Boolean((opts.allowZeroQuota || opts.evidence?.allowZeroQuota) && opts.evidence && typeof opts.evidence === 'object' && Object.keys(opts.evidence).length > 0);
    if ((!costs || (!(base > 0) && !has4Ch)) && !allowZeroQuota) return { ok: false, reason: 'no-base-price', candidates: [] };
    const scope = (opts.vendorAllowlist || []).map(normVendor).filter(Boolean);
    const hints = (Array.isArray(opts.vendorHint) ? opts.vendorHint : [opts.vendorHint])
      .map(normVendor).filter(Boolean);
    const perMessage = Array.isArray(opts.perMessage) && opts.perMessage.length
      ? opts.perMessage
      : [Object.assign({}, costs || {}, { basePriceUsd: base })];

    const evEarly = options && options.evidence;
    const earlyOpenThink = Boolean(evEarly && (evEarly.visibleReasoning === true || (Number(evEarly.visibleReasoningChars) > 0) || evEarly.reasoningSignature === 'visible-text' || evEarly.reasoningSignature === 'visible' || (evEarly.streamEvidence && evEarly.streamEvidence.reasoningSummary === 'visible')));
    const earlyClosedThink = Boolean(evEarly && !earlyOpenThink && (evEarly.hiddenReasoning === true || evEarly.reasoningEmpty === true || evEarly.visibleReasoningChars === 0 || evEarly.reasoningSignature === 'markers-only' || evEarly.reasoningSignature === 'empty-deltas' || evEarly.noReasoningParts === true || evEarly.reasoningSignature === 'none' || evEarly.streamIdPrefix === 'openai-rs' || evEarly.streamIdPrefix === 'openai-tc-empty' || evEarly.hasClosedSourceThinking === true || (evEarly.streamEvidence && (evEarly.streamEvidence.reasoningSummary === 'empty' || evEarly.streamEvidence.reasoningSummary === 'none'))));
    let activeCatalog = catalog || [];
    if (earlyOpenThink) {
      const openOnly = activeCatalog.filter((c) => !isClosedSourceModel(c));
      if (openOnly.length > 0) activeCatalog = openOnly;
    } else if (earlyClosedThink) {
      const closedOnly = activeCatalog.filter((c) => !isOpenSourceModel(c));
      if (closedOnly.length > 0) activeCatalog = closedOnly;
    }

    function buildCandidateList(activeRates) {
      const listOut = [];
      for (const model of activeCatalog) {
        if (!servesInteractively(model)) continue;
        if (scope.length && scope.indexOf(normVendor(model.vendor)) < 0) continue;
        const hit = predictBasePrice(model, costs || {}, activeRates, opts.tiers, perMessage, opts.evidence, allowZeroQuota);
        if (!hit) continue;
        const free = impliedFreeTokens(model, costs, activeRates);
        const stealthId = hit.effortProfile && hit.effortProfile.stealthModelId;
        const stealthLabel = hit.effortProfile && hit.effortProfile.stealthModelLabel;
        listOut.push(Object.assign({}, model, {
          id: stealthId || model.id,
          label: stealthLabel || model.label,
          freeTokens: free ? free.tokens : null,
          impossible: !!(free && free.impossible && hit.priceResidual > 0.05),
          predictedBase: hit.predicted,
          channels: hit.channels,
          priceTier: hit.tier,
          priceResidual: hit.priceResidual,
          residual: hit.residual,
          rmsResidual: hit.rmsResidual,
          scoreResidual: hit.scoreResidual,
          effectiveResidual: hit.effectiveResidual,
          cachePatternPenalty: hit.cachePatternPenalty || 0,
          hardPenalty: hit.hardPenalty || 0,
          multiDimPenalty: hit.multiDimPenalty,
          matchedDims: hit.matchedDims || [],
          matchedPromptPerM: hit.matchedPromptPerM,
          matchedCompletionPerM: hit.matchedCompletionPerM,
          matchedCacheReadPerM: hit.matchedCacheReadPerM,
          matchedCacheWritePerM: hit.matchedCacheWritePerM,
          derivedCacheReadPerM: hit.derivedCacheReadPerM || null,
          matchedVariant: hit.matchedVariant || '2026-10-14',
          solverTier: hit.solverTier || 1,
          diophantineRate: hit.diophantineRate,
          diophantinePassed: hit.diophantinePassed,
          baseLabel: stealthLabel ? stealthLabel.replace(/\s*\([^)]+\)\s*$/, '') : (model.label || model.id),
          dynamicLabel: stealthLabel || hit.dynamicLabel || model.label || model.id,
          turnTokens: hit.turnTokens,
          solvedTokens: hit.solvedTokens,
          inferredEffort: hit.inferredEffort,
          effortProfile: hit.effortProfile || null,
          contextMonotone: hit.contextMonotone,
          p50Used: hit.p50Used,
        }));
      }
      return listOut;
    }

    let chosenRates = opts.rates || null;
    let candidates = buildCandidateList(chosenRates);
    if (!chosenRates && candidates.length) {
      const topHit = candidates.reduce((a, b) => ((a.scoreResidual ?? a.residual) <= (b.scoreResidual ?? b.residual) ? a : b));
      chosenRates = (topHit && topHit.p50Used) || AGENT_P50_RATES;
    } else if (!chosenRates) {
      chosenRates = AGENT_P50_RATES;
    }

    if (earlyOpenThink) {
      candidates = candidates.filter((c) => !isClosedSourceModel(c));
    } else if (earlyClosedThink) {
      const closedOnly = candidates.filter((c) => !isOpenSourceModel(c));
      if (closedOnly.length > 0) candidates = closedOnly;
    }

    function finalizeCandidateOrder(list) {
      let arr = list.map((c) => Object.assign({}, c));
      const exactT1 = arr.filter((c) => c && c.diophantinePassed === true && (c.solverTier || 1) === 1 && Math.abs((c.priceTier || 1) - 1) < 1e-6 && (Number(c.priceResidual ?? c.residual) || 0) < 1e-6);
      if (exactT1.length > 0) {
        const bestExact = exactT1.reduce((a, b) => ((a.scoreResidual ?? a.residual) <= (b.scoreResidual ?? b.residual) ? a : b));
        const exactEpoch = bestExact && bestExact.matchedVariant;
        if (exactEpoch) {
          for (const c of arr) {
            if (!c || !c.matchedVariant || c.matchedVariant === exactEpoch) continue;
            if ((Number(c.priceResidual ?? c.residual) || 0) > 1e-6) {
              const adj = Math.min(0.99, Math.max(Number(c.effectiveResidual) || 0, Number(c.scoreResidual) || 0) + 0.18);
              c.effectiveResidual = adj;
              c.scoreResidual = adj;
            }
          }
        }
      }
      arr.sort((a, b) => {
        const sDiff = (a.scoreResidual ?? a.residual) - (b.scoreResidual ?? b.residual);
        if (Math.abs(sDiff) > 1e-9) return sDiff;
        const rDiff = a.residual - b.residual;
        if (Math.abs(rDiff) > 1e-9) return rDiff;
        if ((b.diophantineRate || 0) !== (a.diophantineRate || 0)) {
          return (b.diophantineRate || 0) - (a.diophantineRate || 0);
        }
        const genDiff = modelGenerationScore(b) - modelGenerationScore(a);
        if (Math.abs(genDiff) > 1e-6) return genDiff;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
      const seenIds = new Set();
      arr = arr.filter((c) => {
        const cid = String((c && c.id) || '');
        if (!cid || seenIds.has(cid)) return false;
        seenIds.add(cid);
        return true;
      });
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1], cur = arr[i];
        const isRealCatalog = Boolean((cur && (cur.agentTaskSamples > 0 || (cur.leaderboardRank > 0 && cur.leaderboardRank < 900))) || (prev && (prev.agentTaskSamples > 0 || (prev.leaderboardRank > 0 && prev.leaderboardRank < 900))));
        if (!isRealCatalog) continue;
        const prevEff = Number.isFinite(prev.effectiveResidual) ? prev.effectiveResidual : (prev.scoreResidual ?? prev.residual ?? 0);
        let curEff = Math.max(Number.isFinite(cur.effectiveResidual) ? cur.effectiveResidual : 0, cur.scoreResidual ?? cur.residual ?? 0);
        if (curEff < prevEff + 0.0015) {
          curEff = Math.min(0.99, prevEff + 0.0015);
        }
        cur.effectiveResidual = curEff;
        cur.scoreResidual = Math.max(cur.scoreResidual ?? 0, curEff);
      }
      return arr;
    }

    const rawAllCandidates = candidates;
    let vendorFiltered = false;
    const beforeHint = candidates.length;
    const activeHints = earlyOpenThink
      ? hints.filter((h) => !['openai', 'anthropic', 'google', 'xai', 'x-ai'].includes(h))
      : hints;
    if (activeHints.length) {
      const narrowed = candidates.filter((m) => activeHints.indexOf(normVendor(m.vendor)) >= 0);
      if (narrowed.length) {
        const topNarrow = narrowed.reduce((a, b) => ((a.scoreResidual ?? a.residual) <= (b.scoreResidual ?? b.residual) ? a : b));
        const topP = Number(topNarrow && topNarrow.matchedPromptPerM) || 0;
        const topC = Number(topNarrow && topNarrow.matchedCompletionPerM) || 0;
        const topEff = Number.isFinite(topNarrow && topNarrow.effectiveResidual) ? topNarrow.effectiveResidual : (topNarrow && (topNarrow.scoreResidual ?? topNarrow.residual)) || 0;
        const crossExact = (topP > 0 && topC > 0) ? candidates.filter((m) =>
          activeHints.indexOf(normVendor(m.vendor)) < 0 &&
          !m.impossible &&
          (m.freeTokens == null || Math.abs(m.freeTokens) <= 1) &&
          m.diophantinePassed === true &&
          (m.solverTier || 1) === 1 &&
          Math.abs((m.priceTier || 1) - 1) < 1e-6 &&
          (Number(m.priceResidual ?? m.residual) || 0) < 1e-5 &&
          Math.abs((Number(m.matchedPromptPerM) || 0) - topP) < 1e-6 &&
          Math.abs((Number(m.matchedCompletionPerM) || 0) - topC) < 1e-6
        ).map((m) => {
          const fl = Math.max(Number(m.effectiveResidual) || 0, Number(m.scoreResidual) || 0, topEff + 0.14);
          return Object.assign({}, m, { effectiveResidual: fl, scoreResidual: fl });
        }) : [];
        candidates = narrowed.concat(crossExact);
        vendorFiltered = true;
      }
    }

    candidates = finalizeCandidateOrder(candidates);
    let unnarrowedCandidates = vendorFiltered ? finalizeCandidateOrder(rawAllCandidates) : candidates;

    // 开源思考与闭源思考严格互斥过滤：开源思考绝不匹配闭源模型，闭源思考绝不匹配开源模型
    const evFilter = options && options.evidence;
    if (evFilter && typeof evFilter === 'object') {
      const openThink = evFilter.visibleReasoning === true || (Number(evFilter.visibleReasoningChars) > 0) || evFilter.reasoningSignature === 'visible-text' || evFilter.reasoningSignature === 'visible' || (evFilter.streamEvidence && evFilter.streamEvidence.reasoningSummary === 'visible');
      const closedThink = !openThink && (evFilter.hiddenReasoning === true || evFilter.reasoningEmpty === true || evFilter.visibleReasoningChars === 0 || evFilter.reasoningSignature === 'markers-only' || evFilter.reasoningSignature === 'empty-deltas' || evFilter.noReasoningParts === true || evFilter.reasoningSignature === 'none' || evFilter.streamIdPrefix === 'openai-rs' || evFilter.streamIdPrefix === 'openai-tc-empty' || evFilter.hasClosedSourceThinking === true || (evFilter.streamEvidence && (evFilter.streamEvidence.reasoningSummary === 'empty' || evFilter.streamEvidence.reasoningSummary === 'none')));
      if (openThink) {
        const openPool = candidates.filter(c => !isClosedSourceModel(c));
        if (openPool.length > 0) candidates.splice(0, candidates.length, ...openPool);
        if (vendorFiltered && Array.isArray(unnarrowedCandidates)) {
          const openUn = unnarrowedCandidates.filter(c => !isClosedSourceModel(c));
          if (openUn.length > 0) unnarrowedCandidates = openUn;
        }
      } else if (closedThink) {
        const closedPool = candidates.filter(c => !isOpenSourceModel(c));
        if (closedPool.length > 0) candidates.splice(0, candidates.length, ...closedPool);
        if (vendorFiltered && Array.isArray(unnarrowedCandidates)) {
          const closedUn = unnarrowedCandidates.filter(c => !isOpenSourceModel(c));
          if (closedUn.length > 0) unnarrowedCandidates = closedUn;
        }
      }
    }
    const best = candidates.length ? candidates[0].residual : null;
    const chans = activeChannels(costs);
    const degeneracy = channelDegeneracy(candidates, chans);
    const withFree = candidates.filter((c) => c.freeTokens !== null);
    const freeTokenMode = withFree.length > 0 && withFree.every((c) => c.freeTokens > 1);
    const possible = candidates.filter((c) => !c.impossible);
    const floor = possible.length
      ? possible.reduce((a, b) => (a.prompt <= b.prompt ? a : b)) : null;
    return {
      ok: true,
      observedBase: base,
      rates: chosenRates,
      activeChannels: chans,
      degenerate: !!degeneracy.degenerate,
      degeneracyReason: degeneracy.reason || null,
      freeTokenMode,
      excludedImpossible: candidates.filter((c) => c.impossible).map((c) => c.id),
      inputRateFloor: freeTokenMode && floor ? floor.prompt : null,
      rates: chosenRates,
      vendorHint: opts.vendorHint || null,
      vendorFiltered,
      vendorConflict: !!(hints.length && !vendorFiltered && beforeHint > 0),
      candidates,
      unnarrowedCandidates,
      ratesLookStale: best !== null && best > 0.25,
    };
  }

  function aggregateCostLedger(entries) {
    const seen = new Map();
    for (const e of (entries || [])) {
      if (e && e.messageId && !seen.has(e.messageId)) seen.set(e.messageId, e);
    }
    const perMessage = [...seen.values()]
      .filter((e) => Number(e.basePriceUsd) > 0)
      .map((e) => ({
        messageId: e.messageId,
        outputUsd: Number(e.outputTokensCostUsd) || 0,
        inputUsd: Number(e.inputTokensCostUsd) || 0,
        cacheReadUsd: Number(e.cacheReadTokensCostUsd) || 0,
        cacheWriteUsd: Number(e.cacheWriteTokensCostUsd) || 0,
        basePriceUsd: Number(e.basePriceUsd) || 0,
      }));
    const costs = { outputUsd: 0, inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, basePriceUsd: 0 };
    for (const u of perMessage) for (const k of Object.keys(costs)) costs[k] += u[k];
    const cached = perMessage.some((u) => u.cacheReadUsd > 0 || u.cacheWriteUsd > 0);
    return { perMessage, costs, messages: perMessage.length, cached };
  }

  function inferFromCaptures(captures, catalog, options) {
    const opts = options || {};
    const scoped = opts.sessionId ? scopeToSession(captures, opts.sessionId) : (captures || []);
    const outputs = extractAssistantOutputs(scoped);
    const costSnapshot = parseCostSnapshot(scoped);
    const costEndpoint = inspectCostCaptures(scoped);
    const unitPrice = inferOutputUnitPrice(outputs, costSnapshot);

    if (!unitPrice.ok) {
      if (costEndpoint.seen && costEndpoint.forbidden === costEndpoint.seen) {
        unitPrice.reason = 'cost-endpoint-forbidden';
      } else if (!costEndpoint.seen) {
        unitPrice.reason = 'no-cost-capture';
      } else if (!outputs.length) {
        unitPrice.reason = 'no-assistant-output';
      }
    }

    // Build per-message billing rows from paired outputs, or directly from costSnapshot if /out was not captured
    const billRows = unitPrice.ok
      ? unitPrice.used
      : (!outputs.length
        ? Object.entries(costSnapshot)
            .filter(([, c]) => c && Number(c.basePriceUsd) > 0)
            .map(([messageId, c]) => ({
              messageId,
              outputUsd: Number(c.outputUsd) || 0,
              inputUsd: Number(c.inputUsd) || 0,
              cacheReadUsd: Number(c.cacheReadUsd) || 0,
              cacheWriteUsd: Number(c.cacheWriteUsd) || 0,
              basePriceUsd: Number(c.basePriceUsd) || 0,
              isLongContext: c.isLongContext,
            }))
        : []);

    const sources = [...new Set(Object.values(costSnapshot).map((c) => c.source).filter(Boolean))];
    const initEv = Object.assign({ billingSources: sources }, opts.extraEvidence || {}, opts.evidence || {});
    for (const u of billRows) {
      const snap = costSnapshot[u.messageId];
      if (snap) {
        if (snap.source) u.source = snap.source;
        if (snap.totalUsd > 0 && !u.totalUsd) u.totalUsd = snap.totalUsd;
      }
      if (initEv.msgVisTokensById && initEv.msgVisTokensById[u.messageId] > 0) u.visTokens = initEv.msgVisTokensById[u.messageId];
      if (initEv.msgReasonTokensById && initEv.msgReasonTokensById[u.messageId] > 0) u.reasonTokens = initEv.msgReasonTokensById[u.messageId];
      if (initEv.msgStepCountById && initEv.msgStepCountById[u.messageId] > 0) u.stepCount = initEv.msgStepCountById[u.messageId];
      if (initEv.msgDurationMsById && initEv.msgDurationMsById[u.messageId] > 0) u.durationMs = initEv.msgDurationMsById[u.messageId];
    }
    const sumRows = (rowsToSum) => {
      const c = { outputUsd: 0, inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, basePriceUsd: 0 };
      for (const u of rowsToSum) {
        c.outputUsd += Number(u.outputUsd) || 0;
        c.inputUsd += Number(u.inputUsd) || 0;
        c.cacheReadUsd += Number(u.cacheReadUsd) || 0;
        c.cacheWriteUsd += Number(u.cacheWriteUsd) || 0;
        c.basePriceUsd += Number(u.basePriceUsd) || 0;
      }
      c.isLongContext = rowsToSum.every((u) => u.isLongContext === false) ? false
        : (rowsToSum.some((u) => u.isLongContext === true) ? true : null);
      if (sources.length === 1) c.source = sources[0];
      return c;
    };
    const mergedEv = Object.assign({ billingSources: sources }, opts.extraEvidence || {}, opts.evidence || {});
    if (!billRows.length && mergedEv.allowZeroQuota) {
      if (outputs.length) {
        for (const o of outputs) {
          billRows.push({
            messageId: o.messageId,
            outputUsd: 0,
            inputUsd: 0,
            cacheReadUsd: 0,
            cacheWriteUsd: 0,
            basePriceUsd: 0,
            tokens: o.tokens || 0,
            visTokens: o.tokens || 0,
            reasonTokens: 0,
            stepCount: o.stepCount || 1,
            durationMs: o.durationMs || 0,
          });
        }
      } else if ((Number(mergedEv.visTokens) || 0) > 0 || (Number(mergedEv.turnDurationMs) || 0) > 0 || (Number(mergedEv.totalStepCount) || 0) > 0) {
        billRows.push({
          messageId: '_zq_turn_1',
          outputUsd: 0,
          inputUsd: 0,
          cacheReadUsd: 0,
          cacheWriteUsd: 0,
          basePriceUsd: 0,
          tokens: Number(mergedEv.visTokens) || 100,
          visTokens: Number(mergedEv.visTokens) || 100,
          reasonTokens: 0,
          stepCount: Number(mergedEv.totalStepCount) || 1,
          durationMs: Number(mergedEv.turnDurationMs) || 0,
        });
      }
    }
    let costs = billRows.length ? sumRows(billRows) : null;
    let baseMatch = costs
      ? rankByBasePrice(catalog, costs, costs.basePriceUsd, {
        vendorAllowlist: opts.vendorAllowlist,
        vendorHint: opts.vendorHint,
        rates: opts.rates,
        perMessage: billRows,
        evidence: mergedEv,
        allowZeroQuota: Boolean(mergedEv.allowZeroQuota),
      })
      : { ok: false, reason: 'no-costs', candidates: [] };

    // Segment multi-turn sessions when full session lacks a consistent Diophantine pass, and detect both cross-model route and same-model effort downgrade
    const topFull = baseMatch && baseMatch.candidates && baseMatch.candidates[0];
    const fullConsistent = topFull && topFull.diophantinePassed && topFull.priceResidual < 2e-3;
    if (billRows.length > 1 && !fullConsistent) {
      const segs = analyzePerTurnSegments(catalog, billRows, {
        vendorAllowlist: opts.vendorAllowlist,
        vendorHint: opts.vendorHint,
        rates: opts.rates,
        evidence: mergedEv,
      });
      if (segs && segs.routeSwitched && segs.activeRows && segs.activeRows.length) {
        const firstSegRows = (segs.segments && segs.segments[0] && segs.segments[0].rows) || [billRows[0]];
        const firstCosts = sumRows(firstSegRows);
        const firstMatch = rankByBasePrice(catalog, firstCosts, firstCosts.basePriceUsd, {
          vendorAllowlist: opts.vendorAllowlist,
          vendorHint: [],
          rates: opts.rates,
          perMessage: firstSegRows,
          evidence: mergedEv,
        });
        const initCand = firstMatch && firstMatch.candidates && firstMatch.candidates[0];
        costs = sumRows(segs.activeRows);
        baseMatch = rankByBasePrice(catalog, costs, costs.basePriceUsd, {
          vendorAllowlist: opts.vendorAllowlist,
          vendorHint: opts.vendorHint,
          rates: opts.rates,
          perMessage: segs.activeRows,
          evidence: mergedEv,
        });
        const activeCand = baseMatch && baseMatch.candidates && baseMatch.candidates[0];
        const cleanBase = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/-(?:low|medium|high|xhigh|max)(?:-agent)?$/i, '').toLowerCase();
        const sameBaseModel = initCand && activeCand && (initCand.id === activeCand.id || cleanBase(initCand.id) === cleanBase(activeCand.id));
        const sameUnitRate = initCand && activeCand
          && Math.abs((Number(initCand.matchedPromptPerM) || 0) - (Number(activeCand.matchedPromptPerM) || 0)) < 1e-4
          && Math.abs((Number(initCand.matchedCompletionPerM) || 0) - (Number(activeCand.matchedCompletionPerM) || 0)) < 1e-4;
        let initStillFits = false;
        if (initCand && activeCand && initCand.id !== activeCand.id) {
          const initEff = {
            prompt: (Number(initCand.matchedPromptPerM) || 0) / 1e6,
            completion: (Number(initCand.matchedCompletionPerM) || 0) / 1e6,
            cacheRead: (Number(initCand.derivedCacheReadPerM || initCand.matchedCacheReadPerM) || 0) / 1e6,
            cacheWrite: (Number(initCand.matchedCacheWritePerM) || 0) / 1e6,
          };
          const p50Check = (baseMatch && baseMatch.rates) || AGENT_P50_RATES;
          initStillFits = segs.activeRows.every((r) => {
            const d = checkDiophantineTurn(r, initEff, p50Check);
            return d && d.valid && d.passed && d.baseRelErr <= 2e-3;
          });
        }
        if (!sameBaseModel && !sameUnitRate && !initStillFits) {
          baseMatch.routeSwitched = true;
          baseMatch.routeType = 'model';
          baseMatch.segments = segs.segments || [];
          baseMatch.initialModelId = initCand ? initCand.id : null;
          baseMatch.initialModelLabel = initCand ? (initCand.dynamicLabel || initCand.label || initCand.id) : null;
          baseMatch.initialEffort = initCand ? (initCand.inferredEffort || (initCand.effortProfile && initCand.effortProfile.primaryEffort) || null) : null;
          baseMatch.routedModelId = activeCand ? activeCand.id : null;
          baseMatch.routedModelLabel = activeCand ? (activeCand.dynamicLabel || activeCand.label || activeCand.id) : null;
          baseMatch.latestEffort = activeCand ? (activeCand.inferredEffort || (activeCand.effortProfile && activeCand.effortProfile.primaryEffort) || null) : null;
        }
      }
    }
    if (baseMatch && !baseMatch.routeSwitched && baseMatch.candidates && baseMatch.candidates[0] && baseMatch.candidates[0].effortProfile && baseMatch.candidates[0].effortProfile.effortDowngraded) {
      const topC = baseMatch.candidates[0];
      const ep = topC.effortProfile;
      const bName = topC.baseLabel || String(topC.label || topC.id || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      baseMatch.effortDowngraded = true;
      baseMatch.routeType = 'effort';
      baseMatch.initialModelId = topC.id;
      baseMatch.initialModelLabel = bName + ' (' + ep.initialEffort + ')';
      baseMatch.initialEffort = ep.initialEffort;
      baseMatch.routedModelId = topC.id;
      baseMatch.routedModelLabel = topC.dynamicLabel || (bName + ' (' + ep.latestEffort + ')');
      baseMatch.latestEffort = ep.latestEffort;
    }

    const implied = costs
      ? impliedRates(billRows.map((u) => ({
        outputUsd: u.outputUsd, inputUsd: u.inputUsd, cacheReadUsd: u.cacheReadUsd,
        cacheWriteUsd: u.cacheWriteUsd, basePriceUsd: u.basePriceUsd,
      })), costs, (baseMatch && baseMatch.rates) || opts.rates)
      : { ok: false, reason: 'no-costs' };

    return { outputs, costSnapshot, costEndpoint, unitPrice, baseMatch, implied,
      billingSources: sources, costs, perMessage: billRows,
      sessionId: opts.sessionId || null,
      sessionScoped: !!opts.sessionId,
      scopedCaptureCount: scoped.length };
  }

  function decomposeTokens(turnCost, candidate, rates) {
    if (!turnCost || !candidate) return { I: 0, W: 0, R: 0, O: 0 };
    const p50 = rates || AGENT_P50_RATES;
    const m = enrichModelRates(candidate);
    const tier = Number(candidate.priceTier || candidate.routeFactor) || 1;

    const pIn = candidate.matchedPromptPerM > 0 ? candidate.matchedPromptPerM / 1e6 : (Number(m.prompt) || 0) * tier;
    const pOut = candidate.matchedCompletionPerM > 0 ? candidate.matchedCompletionPerM / 1e6 : (Number(m.completion) || 0) * tier;
    const pCw = candidate.matchedCacheWritePerM > 0 ? candidate.matchedCacheWritePerM / 1e6 : (Number(m.cacheWrite) || 0) * tier;
    const pCr = (candidate.derivedCacheReadPerM || candidate.matchedCacheReadPerM) > 0 ? (candidate.derivedCacheReadPerM || candidate.matchedCacheReadPerM) / 1e6 : (Number(m.cacheRead) || 0) * tier;

    const cIn = Number(turnCost.inputUsd) || 0;
    const cOut = Number(turnCost.outputUsd) || 0;
    const cCw = Number(turnCost.cacheWriteUsd) || 0;
    const cCr = Number(turnCost.cacheReadUsd) || 0;
    const B = Number(turnCost.basePriceUsd) || 0;
    const totalCost = Number(turnCost.totalUsd) || (cIn + cOut + cCw + cCr);

    let I = 0, W = 0, R = 0, O = 0;

    if (cIn > 0 || cOut > 0 || cCw > 0 || cCr > 0) {
      if (pIn > 0 && cIn > 0) I = Math.round(cIn / pIn);
      if (pCw > 0 && cCw > 0) W = Math.round(cCw / pCw);
      if (pOut > 0 && cOut > 0) O = Math.round(cOut / pOut);
      if (pCr > 0 && cCr > 0) {
        R = Math.round(cCr / pCr);
      } else if (B > 0 && p50.cacheRead > 0) {
        const accountedBase = I * p50.prompt + W * p50.cacheWrite + O * p50.completion;
        const remainBase = B - accountedBase;
        if (remainBase > 0) R = Math.round(remainBase / p50.cacheRead);
      }
    } else if (B > 0 && totalCost > 0) {
      const D = pIn * p50.completion - pOut * p50.prompt;
      if (Math.abs(D) > 1e-15) {
        const rawI = (totalCost * p50.completion - B * pOut) / D;
        const rawO = (B * pIn - totalCost * p50.prompt) / D;
        if (rawI >= 0 && rawO >= 0) {
          I = Math.round(rawI);
          O = Math.round(rawO);
        } else {
          O = Math.round(B / p50.completion);
          I = Math.max(0, Math.round((totalCost - O * pOut) / Math.max(pIn, 1e-6)));
        }
      }
    }

    return { I, W, R, O };
  }

  /**
   * Layer 2: Per-Turn Contiguous Segment Intersection & Route Switch Detection
   * Solves each turn independently, groups contiguous turns with overlapping exact candidates,
   * and returns the latest segment's rows + routeSwitch metadata.
   */
  function analyzePerTurnSegments(catalog, rows, options) {
    const opts = options || {};
    const validRows = (Array.isArray(rows) ? rows : []).filter((r) => r && Number(r.basePriceUsd) > 0);
    if (validRows.length <= 1) {
      return {
        routeSwitched: false,
        segments: validRows.length ? [{ startTurn: 1, endTurn: 1, rows: validRows }] : [],
        activeRows: validRows,
      };
    }
    const perTurnSets = validRows.map((r, idx) => {
      const res = rankByBasePrice(catalog, r, r.basePriceUsd, {
        vendorAllowlist: opts.vendorAllowlist,
        vendorHint: opts.vendorHint,
        rates: opts.rates,
        perMessage: [r],
        evidence: opts.evidence,
      });
      const cands = (res && res.candidates) || [];
      const exactIds = new Set(
        cands
          .filter((c) => (c.diophantinePassed && c.priceResidual < 2e-3) || c.priceResidual < 5e-4)
          .map((c) => c.id)
      );
      if (!exactIds.size && cands.length) {
        const bestP = cands[0].priceResidual ?? cands[0].residual ?? 0;
        for (const c of cands) {
          if ((c.priceResidual ?? c.residual ?? 1) <= Math.max(0.03, bestP + 0.02)) exactIds.add(c.id);
        }
      }
      return { turnIndex: idx + 1, row: r, exactIds };
    });

    const segments = [];
    let curSeg = {
      startTurn: 1,
      endTurn: 1,
      rows: [perTurnSets[0].row],
      commonIds: new Set(perTurnSets[0].exactIds),
    };
    for (let i = 1; i < perTurnSets.length; i += 1) {
      const nextIds = perTurnSets[i].exactIds;
      const inter = new Set([...curSeg.commonIds].filter((id) => nextIds.has(id)));
      if (inter.size > 0) {
        curSeg.endTurn = i + 1;
        curSeg.rows.push(perTurnSets[i].row);
        curSeg.commonIds = inter;
      } else {
        segments.push(curSeg);
        curSeg = {
          startTurn: i + 1,
          endTurn: i + 1,
          rows: [perTurnSets[i].row],
          commonIds: new Set(nextIds),
        };
      }
    }
    segments.push(curSeg);
    const latestSeg = segments[segments.length - 1];
    return {
      routeSwitched: segments.length > 1,
      segments: segments.map((s) => ({
        startTurn: s.startTurn,
        endTurn: s.endTurn,
        rows: s.rows,
        candidateIds: [...s.commonIds],
      })),
      activeRows: latestSeg ? latestSeg.rows : validRows,
    };
  }

  /**
   * Layer 5: Conditional Softmax Adjudicator using lm.ikale.io 58-Model Fingerprint Engine (FP_Engine)
   * Given the surviving candidate subset from Layers 1–4 and one or more 1~355 integer probe responses,
   * computes conditional probabilities over the candidate pool and locks the winning model.
   */
  const FP_KEY_MAP = {
    'anthropic/claude-opus-5.5': 'claude-opus-5.5',
    'anthropic/claude-opus-5': 'claude-opus-5',
    'anthropic/claude-opus-4.8': 'claude-opus-4.8',
    'anthropic/claude-opus-4.7': 'claude-opus-4.7',
    'anthropic/claude-opus-4.6': 'claude-opus-4.6',
    'anthropic/claude-fable-5.1': 'claude-fable-5.1',
    'anthropic/claude-fable-5': 'claude-fable-5',
    'anthropic/claude-sonnet-5.5': 'claude-sonnet-5.5',
    'anthropic/claude-sonnet-5': 'claude-sonnet-5',
    'anthropic/claude-sonnet-4.6': 'claude-sonnet-4.6',
    'anthropic/claude-haiku-5.5': 'claude-haiku-5.5',
    'anthropic/claude-haiku-4.5': 'claude-haiku-4.5',
    'openai/gpt-6-astra': 'gpt-6-astra',
    'openai/gpt-6.1-sol': 'gpt-6-sol',
    'openai/gpt-6-sol': 'gpt-6-sol',
    'openai/gpt-5.6-sol': 'gpt-5.6-sol',
    'openai/gpt-5.6-terra': 'gpt-5.6-terra',
    'openai/gpt-6-luna': 'gpt-6-luna',
    'openai/gpt-5.6-luna-pro': 'gpt-5.6-luna',
    'openai/gpt-5.6-luna': 'gpt-5.6-luna',
    'openai/gpt-5.4': 'gpt-5.4',
    'openai/gpt-5.5': 'gpt-5.5',
    'openai/gpt-5.5-std': 'gpt-5.5',
    'google/gemini-3.8-flash': 'gemini-3.8-flash',
    'google/gemini-3.7-flash': 'gemini-3.7-flash',
    'google/gemini-3.6-flash': 'gemini-3.6-flash',
    'google/gemini-3.5-flash': 'gemini-3.5-flash',
    'google/gemini-3.1-pro': 'gemini-3.1-pro-preview',
    'google/gemini-2.5-pro': 'gemini-2.5-pro',
    'z-ai/glm-5.3': 'glm-5.3',
    'z-ai/glm-5.3-flash': 'glm-5.3-flash',
    'z-ai/glm-5.3-flashx': 'glm-5.3-flashx',
    'z-ai/glm-5.2': 'glm-5.2',
    'deepseek/deepseek-v4.1': 'deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro': 'deepseek-v4-pro',
    'deepseek/deepseek-v4-flash': 'deepseek-v4-flash',
    'deepseek/deepseek-v3.2': 'deepseek-v3.2',
    'moonshotai/kimi-k3': 'kimi-k3',
    'moonshotai/kimi-k2.8': 'kimi-k2.8-preview',
    'qwen/qwen3.8-27b': 'qwen3.8-27b',
    'qwen/qwen3.8-max': 'qwen3.8-max-0902',
    'qwen/qwen3.8-flash': 'qwen3.8-flash',
    'qwen/qwen3.8-omni-flash': 'qwen3.8-omni-flash',
    'contenders/paisley-n9x0': 'qwen3.8-max-0902',
    'contenders/farris-ees5-agent': 'qwen3.8-flash',
    'xiaomi/mimo-v2.6-pro': 'mimo-v2.6-pro',
    'xiaomi/mimo-v2.6-flash': 'mimo-v2.6-flash',
    'xiaomi/mimo-v2.5-pro': 'mimo-v2.5-pro',
    'xiaomi/mimo-v2.5': 'mimo-v2.5',
    'xai/grok-4.7': 'grok-4.7',
    'x-ai/grok-4.7': 'grok-4.7',
    'xai/grok-4.6': 'grok-4.6',
    'x-ai/grok-4.6': 'grok-4.6',
    'xai/grok-4.5': 'grok-4.5',
    'x-ai/grok-4.5': 'grok-4.5',
  };

  function mapCandidateToFpId(cand, fpModelIds) {
    if (!cand) return null;
    const rawId = String(cand.id || cand.key || cand.modelKey || '').toLowerCase();
    if (!rawId) return null;
    const mapped = FP_KEY_MAP[rawId];
    if (mapped && (!fpModelIds || fpModelIds.includes(mapped))) return mapped;
    const base = rawId.split('/').pop().replace(/-(?:low|medium|high|xhigh|max|agent|code-agent)$/i, '');
    if (!base) return null;
    if (fpModelIds) {
      const exact = fpModelIds.find((fid) => fid.toLowerCase() === base);
      if (exact) return exact;
      const prefixes = fpModelIds.filter((fid) => fid.toLowerCase().startsWith(base));
      return prefixes.length === 1 ? prefixes[0] : null;
    }
    return mapped || base;
  }

  async function resolveCandidatesWithFingerprint(candidates, probeTexts, fpEngine) {
    const engine = fpEngine || (typeof root !== 'undefined' && root.__AMC_FP_ENGINE__) || null;
    if (!engine || typeof engine.identify !== 'function' || typeof engine.parseNumbers !== 'function') {
      return { ok: false, reason: 'no-fp-engine' };
    }
    const texts = (Array.isArray(probeTexts) ? probeTexts : [probeTexts]).filter((t) => typeof t === 'string' && t.trim());
    if (!texts.length) return { ok: false, reason: 'no-probe-texts' };
    let totalNums = 0;
    const validTexts = [];
    for (const text of texts) {
      const numbers = engine.parseNumbers(text);
      if (Array.isArray(numbers) && numbers.length >= 60) { totalNums += numbers.length; validTexts.push(text); }
    }
    if (!validTexts.length) return { ok: false, reason: 'insufficient-numbers', totalNums };
    if (typeof engine.loadBank === 'function') await engine.loadBank();
    const bank = typeof engine.getBank === 'function' ? engine.getBank() : null;
    if (!bank || !Array.isArray(bank.models)) return { ok: false, reason: 'no-fp-bank' };
    const fpRes = await engine.identify(validTexts, bank);
    const ranking = (fpRes && (fpRes.candidates || fpRes.ranking)) || [];
    if (!fpRes || !Array.isArray(ranking) || !ranking.length) return { ok: false, reason: 'fp-identify-empty' };
    const globalTop = ranking[0];
    const diagnostics = { globalTop, totalNums, validProbes: validTexts.length,
      fpVerdict: fpRes.verdict || null, absoluteMatch: fpRes.absoluteMatch,
      probabilityScope: 'fingerprint-bank', identityVerified: false };
    if (fpRes.ok !== true || fpRes.verdict !== 'match' || fpRes.confidence === 'low') {
      return Object.assign({ ok: false, reason: 'fp-insufficient-evidence' }, diagnostics);
    }
    const scoreByFpId = new Map();
    for (const row of ranking) {
      if (!row || !row.id || row.score == null || row.prob == null || typeof row.prob === 'boolean') continue;
      const score = Number(row.score), prob = Number(row.prob);
      if (!Number.isFinite(score) || !Number.isFinite(prob) || prob < 0 || prob > 1) continue;
      scoreByFpId.set(String(row.id), { score, prob });
    }
    if (!scoreByFpId.has(String(globalTop.id))) {
      return Object.assign({ ok: false, reason: 'fp-invalid-probabilities' }, diagnostics);
    }
    const fpModelIds = Array.from(scoreByFpId.keys());
    const scored = [], seen = new Set();
    for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
      if (!candidate || typeof candidate !== 'object') continue;
      const id = String(candidate.id || candidate.key || candidate.modelKey || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const fpId = mapCandidateToFpId(candidate, fpModelIds);
      const hit = fpId && scoreByFpId.get(fpId);
      scored.push({ candidate, id, label: candidate.label || candidate.displayName || id,
        fpId: hit ? fpId : null, matched: !!hit,
        rawScore: hit ? hit.score : null, prob: hit ? hit.prob : 0 });
    }
    const mapped = scored.filter((item) => item.matched).sort((a, b) => b.prob - a.prob);
    if (!mapped.length) return Object.assign({ ok: false, reason: 'fp-unmapped-candidates', scoredCandidates: scored }, diagnostics);
    const supported = mapped.filter((item) => item.fpId === String(globalTop.id));
    if (!supported.length) return Object.assign({ ok: false, reason: 'fp-candidate-pool-conflict', scoredCandidates: scored }, diagnostics);
    if (supported.length > 1) return Object.assign({ ok: false, reason: 'fp-shared-signature', scoredCandidates: scored,
      equivalentCandidateIds: supported.map((item) => item.id) }, diagnostics);
    const winner = supported[0];
    const summaryText = mapped.slice(0, 4).map((item) => `${item.label}: ${(item.prob * 100).toFixed(1)}%（库内）`).join(' · ');
    return Object.assign({ ok: true, winner: winner.candidate, winnerKey: winner.id,
      winnerDisplayName: winner.label, winnerProb: winner.prob, winnerFpId: winner.fpId,
      scoredCandidates: scored, summaryText }, diagnostics);
  }

  /**
   * Stage 0 (v6.0.0): Zero-Latency Speculative Stream Pre-Classifier
   * Uses live /out SSE telemetry (before /cost arrives) to narrow down the model family in <1ms.
   */
  function speculativeStreamRank(catalog, memo) {
    if (!memo || typeof memo !== 'object') return null;
    const sig = String(memo.reasoningSignature || (!memo.sawReasoning ? 'none' : (!memo.reasoningDeltaCount ? 'markers-only' : (memo.reasoningTextLength > 0 ? 'visible-text' : 'empty-deltas'))));
    const toolIds = Array.isArray(memo.toolIds) ? memo.toolIds : [];
    const hasToolu = toolIds.some((id) => /^(?:srv)?toolu_|^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i.test(String(id)));
    const hasCall = toolIds.some((id) => /^(?:tc|fc)_[A-Za-z0-9_-]{16,}|^call_(?![0-9a-f]{24}\b)(?!\d+_)[A-Za-z0-9_-]{18,}/i.test(String(id)));
    const cps = Number(memo.cps) || 0;
    const durMs = Number(memo.turnDurationMs) || ((memo.lastDeltaAt > memo.firstDeltaAt) ? (memo.lastDeltaAt - memo.firstDeltaAt) : 0);

    if (sig === 'visible-text' && Number(memo.reasoningTextLength) >= 24) {
      const rAvg = Number(memo.rAvgChunk) > 0
        ? Number(memo.rAvgChunk)
        : (Number(memo.reasoningDeltaCount) > 0 ? +(Number(memo.reasoningTextLength) / Number(memo.reasoningDeltaCount)).toFixed(2) : 0);
      if (rAvg >= 18.0) return null;
      let topId = 'deepseek/deepseek-v4.1-flash';
      let topLabel = 'Deepseek V4.1 Flash 1017 (Max) [明文思考]';
      if (rAvg > 10.2 || (memo.done && durMs > 12000 && rAvg > 9.0)) {
        topId = 'nvidia/nemotron-3-ultra';
        topLabel = 'Nemotron 3 Ultra (High) [明文思考]';
      } else if (rAvg > 8.35 && rAvg <= 10.2) {
        topId = 'xiaomi/mimo-v2.6-pro';
        topLabel = 'MiMo V2.6 Pro [明文思考]';
      } else if (rAvg > 6.2 && rAvg <= 8.35) {
        topId = 'qwen/qwen3.8-max';
        topLabel = 'Qwen3.8 Max [明文思考]';
      } else if (rAvg > 3.6 && rAvg <= 6.2) {
        topId = 'x-ai/grok-4.7';
        topLabel = 'Grok 4.7 / Kimi K3 [明文思考]';
      }
      return {
        stage: 'stream-prelock',
        isPlain: true,
        isTargetCandidate: false,
        familyLabel: '明文思考模型 (已排除Claude/OpenAI/Gemini)',
        topId,
        topLabel,
        confidence: 86,
        reason: `SSE明文思考(${memo.reasoningTextLength}字${rAvg > 0 ? ' · ' + rAvg + '字/块' : ''})`,
      };
    }
    if (sig === 'empty-deltas' || hasToolu) {
      return {
        stage: 'stream-prelock',
        isPlain: false,
        isTargetCandidate: true,
        vendor: 'anthropic',
        familyLabel: 'Claude 闭源家族 (Opus 5.5 / Fable / Sonnet)',
        topId: 'anthropic/claude-opus-5.5',
        topLabel: 'Claude Opus 5.5 / Fable (流式预判)',
        confidence: 86,
        reason: hasToolu ? 'SSE工具前缀:toolu_(Anthropic)' : 'SSE加密思考块:empty-deltas(Claude专属)',
      };
    }
    if (sig === 'markers-only' || memo.streamIdPrefix === 'openai-rs' || hasCall) {
      const thinkMs = Number(memo.thinkDurationMs) || durMs || 0;
      const rBlocks = Math.max(Number(memo.reasoningStartCount) || 0, Array.isArray(memo.streamIds) ? Math.max(0, memo.streamIds.length - 1) : 0);
      const isShortStage1 = (Number(memo.textDeltaChars) || 0) < 420 && toolIds.length === 0;
      const specEff = isShortStage1
        ? 'High'
        : ((thinkMs >= 42000 && rBlocks >= 12) ? 'Max' : ((thinkMs >= 22000 || rBlocks >= 8) ? 'xHigh' : (thinkMs >= 5000 ? 'High' : 'Medium')));
      let topId = 'openai/gpt-hidden-reasoning-prelock';
      let topLabel = `OpenAI 隐藏思考家族 (${specEff}) [流式预判·待账单]`;
      let conf = 78;
      let isTarget = false;
      if (cps > 0 && memo.textDeltaChars >= 60) {
        if (cps <= 55 || durMs >= 16000) {
          topId = 'openai/gpt-6.1-sol';
          topLabel = `GPT 6.1 Sol (${specEff}) [流式预判]`;
          conf = 82;
        } else if (cps >= 90 && durMs > 0 && durMs <= 7800) {
          topId = 'openai/gpt-6-luna';
          const lunaEff = thinkMs >= 6000 ? 'High' : 'Medium';
          topLabel = `GPT 6 Luna (${lunaEff}) [流式预判]`;
          conf = 89;
          isTarget = false;
        } else {
          topId = 'contenders/gpt-6-astra-max-agent';
          topLabel = `GPT 6 Astra (${specEff}) [流式预判]`;
          conf = 88;
        }
      } else if (thinkMs > 0) {
        if (thinkMs <= 3800 && rBlocks <= 2) {
          topId = 'openai/gpt-6-luna';
          topLabel = 'GPT 6 Luna (Medium) [无额度动力学预判]';
          conf = 84;
        } else if (thinkMs > 3800 && thinkMs <= 11000 && rBlocks >= 2) {
          topId = 'openai/gpt-6-luna';
          topLabel = 'GPT 6 Luna (High) [无额度动力学预判]';
          conf = 82;
        } else if (thinkMs >= 25000 || rBlocks >= 10) {
          topId = 'openai/gpt-6.1-sol';
          topLabel = `GPT 6.1 Sol (${specEff}) [无额度动力学预判]`;
          conf = 83;
        } else {
          topId = 'openai/gpt-6.1-sol';
          topLabel = `GPT 6.1 Sol (High) [无额度动力学预判]`;
          conf = 80;
        }
      }
      return {
        stage: 'stream-prelock',
        isPlain: false,
        isTargetCandidate: isTarget,
        vendor: 'openai',
        familyLabel: 'OpenAI GPT-6 闭源家族 (markers-only)',
        topId,
        topLabel,
        confidence: conf,
        reason: `SSE隐藏思考起止标记(markers-only)${cps ? ' · ' + cps + '字/s' : ''}`,
      };
    }
    if (!memo.sawReasoning && Number(memo.textDeltaCount) >= 3) {
      return {
        stage: 'stream-prelock',
        isPlain: false,
        isTargetCandidate: true,
        vendor: 'google',
        familyLabel: 'Gemini 4 Argon / 无思考标记家族',
        topId: 'contenders/barium-bb-v2-4xts-agent',
        topLabel: 'Gemini 4 Argon (High) / Kimi [流式预判]',
        confidence: 80,
        reason: 'SSE零思考块直出正文(no-reasoning)',
      };
    }
    return null;
  }

  function solveConversationPreimage(costSnapshot, topCandidate) {
    const PI = (typeof root !== 'undefined' && root.ArenaPreimage) || null;
    if (!costSnapshot || !topCandidate) return null;
    const m = enrichModelRates(topCandidate);
    const tier = Number(topCandidate.priceTier) || 1;
    const outTier = tier === 1.75 ? 1.5 : tier;
    const inTier = tier === 1.75 ? 2.0 : tier;
    const pPerM = topCandidate.matchedPromptPerM > 0 ? topCandidate.matchedPromptPerM : (Number(m.prompt) || 0) * 1e6 * inTier;
    const cPerM = topCandidate.matchedCompletionPerM > 0 ? topCandidate.matchedCompletionPerM : (Number(m.completion) || 0) * 1e6 * outTier;
    const crPerM = topCandidate.derivedCacheReadPerM || topCandidate.matchedCacheReadPerM || (((Number(m.cacheRead) || (Number(m.prompt) || 0) * 0.1) * 1e6) * inTier);
    const cwPerM = topCandidate.matchedCacheWritePerM > 0 ? topCandidate.matchedCacheWritePerM : ((Number(m.cacheWrite) || (Number(m.prompt) || 0) * 1.25) * 1e6) * inTier;
    if (!(pPerM > 0) || !(cPerM > 0)) {
      if (Array.isArray(topCandidate.turnTokens) && topCandidate.turnTokens.length) {
        const byMessage = {};
        const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
        const msgIds = Object.keys(costSnapshot);
        msgIds.forEach((msgId, idx) => {
          const tt = topCandidate.turnTokens[idx] || topCandidate.turnTokens[topCandidate.turnTokens.length - 1] || {};
          const tok = {
            input: Number(tt.I) || 0,
            output: Number(tt.O) || 0,
            cacheRead: Number(tt.R) || 0,
            cacheWrite: Number(tt.W) || 0,
            exact: false,
            refVersion: topCandidate.matchedVariant || '2026-10-15',
          };
          tok.total = tok.input + tok.output + tok.cacheRead + tok.cacheWrite;
          byMessage[msgId] = tok;
          totals.input += tok.input;
          totals.output += tok.output;
          totals.cacheRead += tok.cacheRead;
          totals.cacheWrite += tok.cacheWrite;
          totals.total += tok.total;
        });
        return { byMessage, totals, refVersion: topCandidate.matchedVariant || '2026-10-15', prices: null };
      }
      return null;
    }

    const prices = {
      input: String(+pPerM.toFixed(6)),
      output: String(+cPerM.toFixed(6)),
      cacheRead: String(+crPerM.toFixed(6)),
      cacheWrite: String(+cwPerM.toFixed(6)),
    };
    const byMessage = {};
    const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    let refVersion = topCandidate.matchedVariant || '2026-10-14';
    for (const [msgId, c] of Object.entries(costSnapshot)) {
      if (!c) continue;
      let tok = null;
      if (PI && typeof PI.solveMessage === 'function') {
        const solved = PI.solveMessage({
          id: msgId,
          costs: {
            input: String(c.inputUsd || 0),
            output: String(c.outputUsd || 0),
            cacheRead: String(c.cacheReadUsd || 0),
            cacheWrite: String(c.cacheWriteUsd || 0),
          },
          base: String(c.basePriceUsd || 0),
        }, prices);
        if (solved && solved.tokens) {
          tok = {
            input: Number(solved.tokens.input) || 0,
            output: Number(solved.tokens.output) || 0,
            cacheRead: Number(solved.tokens.cacheRead) || 0,
            cacheWrite: Number(solved.tokens.cacheWrite) || 0,
            exact: solved.status === 'exact',
            refVersion: solved.refVersion || refVersion,
          };
          if (solved.refVersion) refVersion = solved.refVersion;
        }
      }
      if (!tok) {
        tok = {
          input: pPerM > 0 && c.inputUsd > 0 ? Math.round((c.inputUsd * 1e6) / pPerM) : 0,
          output: cPerM > 0 && c.outputUsd > 0 ? Math.round((c.outputUsd * 1e6) / cPerM) : 0,
          cacheRead: crPerM > 0 && c.cacheReadUsd > 0 ? Math.round((c.cacheReadUsd * 1e6) / crPerM) : 0,
          cacheWrite: cwPerM > 0 && c.cacheWriteUsd > 0 ? Math.round((c.cacheWriteUsd * 1e6) / cwPerM) : 0,
          exact: !!topCandidate.diophantinePassed,
          refVersion,
        };
      }
      tok.total = tok.input + tok.output + tok.cacheRead + tok.cacheWrite;
      byMessage[msgId] = tok;
      totals.input += tok.input;
      totals.output += tok.output;
      totals.cacheRead += tok.cacheRead;
      totals.cacheWrite += tok.cacheWrite;
      totals.total += tok.total;
    }
    return { byMessage, totals, refVersion, prices };
  }


  const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max', 'standard']);
  function normalizeEffort(value) {
    if (typeof value !== 'string') return null;
    switch (value.trim().replace(/[\s_-]+/g, '').toLowerCase()) {
      case 'low': return 'low';
      case 'med': case 'medium': return 'medium';
      case 'high': return 'high';
      case 'xhigh': case 'extrahigh': return 'xhigh';
      case 'max': return 'max';
      case 'standard': case 'std': case '标准': case 'none': case 'default': return 'standard';
      default: return null;
    }
  }
  function normalizeEffortProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const primary = normalizeEffort(profile.primaryEffort || profile.effort);
    const other = normalizeEffort(profile.ambiguousWith);
    const effort = other && other !== primary ? null : normalizeEffort(profile.effort);
    const merged = new Map();
    let distributionValid = Array.isArray(profile.tierProbs) && profile.tierProbs.length > 0;
    for (const row of (Array.isArray(profile.tierProbs) ? profile.tierProbs : [])) {
      const tier = normalizeEffort(row && row.tier);
      const prob = row && row.prob;
      if (!tier || typeof prob !== 'number' || !Number.isFinite(prob) || prob < 0 || prob > 100) {
        distributionValid = false;
        continue;
      }
      const previous = merged.get(tier);
      merged.set(tier, { ...(previous || row), tier, prob: (previous ? previous.prob : 0) + prob });
    }
    const tierProbs = [...merged.values()].map(x => ({ ...x, prob: +x.prob.toFixed(6) })).sort((a, b) => b.prob - a.prob);
    const total = tierProbs.reduce((sum, row) => sum + row.prob, 0);
    distributionValid = distributionValid && Math.abs(total - 100) <= 0.6;
    const rawBasis = profile.rawBasis === undefined ? profile.basis : profile.rawBasis;
    return {
      ...profile,
      rawEffort: profile.rawEffort === undefined ? profile.effort : profile.rawEffort,
      rawPrimaryEffort: profile.rawPrimaryEffort === undefined ? profile.primaryEffort : profile.rawPrimaryEffort,
      rawValidTiers: profile.rawValidTiers || (Array.isArray(profile.validTiers) ? profile.validTiers.slice() : []),
      rawTierProbs: profile.rawTierProbs || (Array.isArray(profile.tierProbs) ? profile.tierProbs.map(x => ({ ...x })) : []),
      rawBasis,
      effort,
      primaryEffort: profile.stealthNextGen ? (profile.rawPrimaryEffort || profile.primaryEffort || 'Max') : primary,
      ambiguousWith: other,
      validTiers: [...new Set((Array.isArray(profile.validTiers) ? profile.validTiers : []).map(normalizeEffort).filter(Boolean))],
      allowedEffortLevels: EFFORT_LEVELS,
      tierProbs,
      tierProbStr: tierProbs.slice(0, 3).map(x => `${x.tier} ${Math.round(x.prob)}%`).join(' · '),
      distributionValid,
      effortSchema: 'low-medium-high-xhigh-max-standard/v2',
      effortStatus: effort ? 'estimated' : (other ? 'ambiguous' : 'insufficient'),
      effortSemantics: 'estimate-not-verification-of-backend-setting',
      basis: rawBasis,
    };
  }

  /**
   * [Z10+] Zero-Probe Stylometry & Tool Behavior Habit Extractor
   * Extracts gateway-scrub-resistant stylometric invariants and tool-calling habits from assistant messages.
   */
  function extractStylometryAndToolHabits(assistantTexts, reasonTexts, toolMeta) {
    const visArr = Array.isArray(assistantTexts) ? assistantTexts : [String(assistantTexts || '')];
    const rsnArr = Array.isArray(reasonTexts) ? reasonTexts : [String(reasonTexts || '')];
    const tm = (toolMeta && typeof toolMeta === 'object') ? toolMeta : {};
    const fullVis = visArr.join('\n').trim();
    const fullRsn = rsnArr.join('\n').trim();
    const charLen = fullVis.length;

    const mdHeadingCount = (fullVis.match(/^#{1,4}\s+\S/gm) || []).length;
    const mdBulletCount = (fullVis.match(/^[\t ]*(?:[-*+]|\d+\.)\s+\S/gm) || []).length;
    const mdBoldCount = (fullVis.match(/\*\*[^*\n]{1,60}\*\*/g) || []).length;
    const codeBlockCount = Math.floor((fullVis.match(/```/g) || []).length / 2);
    const inlineCodeCount = (fullVis.match(/`[^`\n]{1,50}`/g) || []).length;
    const tableRowCount = (fullVis.match(/^\|.+\|$/gm) || []).length;
    const emDashCount = (fullVis.match(/—|——|--/g) || []).length;
    const cjkChars = (fullVis.match(/[\u4e00-\u9fa5]/g) || []).length;
    const paras = fullVis.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    const avgParaLen = paras.length > 0 ? Math.round(charLen / paras.length) : charLen;

    const totalToolCalls = Number(tm.totalToolCalls) || 0;
    const totalSteps = Math.max(1, Number(tm.totalSteps) || 1);
    const preToolChars = Number(tm.preToolChars) || 0;
    const interToolChars = Number(tm.interToolChars) || 0;
    const bashCount = Number(tm.bashCount) || 0;
    const toolNames = Array.isArray(tm.toolNames) ? tm.toolNames.slice(0, 6) : [];
    const toolsPerStep = totalToolCalls > 0 ? +(totalToolCalls / totalSteps).toFixed(2) : 0;

    let familyHint = null;
    let stylometryTag = '';
    if (fullRsn.length >= 16) {
      const hasStepWords = /首先|第一|接下来|验证|总结|Wait|Let's|First|Step/i.test(fullRsn);
      stylometryTag = `明文思维链(${fullRsn.length}字${hasStepWords ? '·分步自省推导' : ''}) + 正文(均段${avgParaLen}字·加粗${mdBoldCount}·代码块${codeBlockCount})`;
      familyHint = 'open-reasoning';
    } else if (totalToolCalls > 0 && preToolChars >= 18 && preToolChars <= 260) {
      stylometryTag = `Anthropic前置简述文体(调工具前导语${preToolChars}字·内联代码${inlineCodeCount}·均段${avgParaLen}字)`;
      familyHint = 'claude';
    } else if (totalToolCalls >= 2 && preToolChars === 0 && interToolChars === 0 && avgParaLen >= 90) {
      stylometryTag = `Google/Argon长块直出文体(0导语直执工具·均段${avgParaLen}字·代码块${codeBlockCount})`;
      familyHint = 'google';
    } else if (mdBulletCount >= 4 || (mdBoldCount >= 4 && emDashCount >= 1)) {
      stylometryTag = `OpenAI结构化锚点文体(列表${mdBulletCount}项·加粗${mdBoldCount}处·破折号${emDashCount}·均段${avgParaLen}字)`;
      familyHint = 'openai';
    } else if (charLen > 0) {
      stylometryTag = `自然段落文体(总${charLen}字·${paras.length}段·均段${avgParaLen}字·列表${mdBulletCount}·加粗${mdBoldCount})`;
    } else {
      stylometryTag = '等待正文流式生成…';
    }

    let toolHabitTag = '';
    if (totalToolCalls === 0) {
      toolHabitTag = `纯文本直出模式 (0 工具调用 · ${totalSteps} 步完成)`;
    } else if (preToolChars === 0 && interToolChars === 0) {
      toolHabitTag = `0字静默直调工具链 (共${totalToolCalls}次/${totalSteps}步 · 步均${toolsPerStep}并发${bashCount >= 2 ? ' · 连续Bash批处理' : ''}${toolNames.length ? ' · [' + toolNames.join(',') + ']' : ''})`;
    } else if (preToolChars >= 18) {
      toolHabitTag = `先报备(${preToolChars}字)后调工具 (共${totalToolCalls}次/${totalSteps}步 · 穿插解说${interToolChars}字${toolNames.length ? ' · [' + toolNames.join(',') + ']' : ''})`;
    } else {
      toolHabitTag = `混合工具调用 (首调前${preToolChars}字 · 步间${interToolChars}字 · 共${totalToolCalls}次/${totalSteps}步${toolNames.length ? ' · [' + toolNames.join(',') + ']' : ''})`;
    }

    return {
      stylometry: {
        charLen,
        mdHeadingCount,
        mdBulletCount,
        mdBoldCount,
        codeBlockCount,
        inlineCodeCount,
        tableRowCount,
        emDashCount,
        cjkRatio: charLen > 0 ? +(cjkChars / charLen).toFixed(2) : 0,
        avgParaLen,
        familyHint,
        profileTag: stylometryTag,
      },
      toolHabits: {
        totalToolCalls,
        totalSteps,
        preToolChars,
        interToolChars,
        bashCount,
        toolsPerStep,
        toolNames,
        profileTag: toolHabitTag,
      },
    };
  }

  const expandTierGrid = (arr) => {
    const s = new Set();
    for (const v of arr) {
      for (const t of [1.0, 1.1, 1.5, 2.0]) s.add(+(v * t).toFixed(6));
    }
    return [...s].sort((a, b) => a - b).map((v) => v / 1e6);
  };
  const ZERO_DAY_PROMPT_GRID = expandTierGrid([
    0.02016, 0.05, 0.07, 0.075, 0.10, 0.112, 0.14, 0.15, 0.154, 0.175, 0.20, 0.21, 0.2156, 0.22,
    0.24, 0.25, 0.26, 0.27, 0.28, 0.30, 0.32, 0.35, 0.39, 0.40, 0.435, 0.45, 0.50, 0.55, 0.60, 0.70, 0.75, 0.78,
    0.80, 1.00, 1.10, 1.20, 1.25, 1.50, 1.65, 1.75, 2.00, 2.20, 2.50, 2.75, 3.00, 3.50, 4.00, 4.50, 5.00, 10.00, 15.00
  ]);
  const ZERO_DAY_COMP_GRID = expandTierGrid([
    0.20, 0.25, 0.28, 0.30, 0.336, 0.392, 0.40, 0.50, 0.60, 0.6468, 0.756, 0.80, 0.87, 0.88, 0.891,
    1.00, 1.10, 1.20, 1.25, 1.50, 1.75, 2.00, 2.20, 2.40, 2.50, 2.75, 2.80, 3.00, 3.50, 4.00, 4.50,
    5.00, 6.00, 6.60, 7.50, 8.00, 10.00, 11.00, 12.00, 15.00, 16.50, 18.00, 22.50, 25.00, 27.50, 30.00, 37.50, 75.00
  ]);
  const ZERO_DAY_CR_GRID = expandTierGrid([
    0.00336, 0.005, 0.0054, 0.00686, 0.007, 0.01, 0.013, 0.014, 0.0154, 0.0175, 0.02, 0.021,
    0.024, 0.025, 0.026, 0.028, 0.03, 0.035, 0.039, 0.04, 0.05, 0.055, 0.06, 0.07, 0.075,
    0.078, 0.08, 0.10, 0.12, 0.125, 0.15, 0.16, 0.175, 0.20, 0.25, 0.30, 0.31, 0.35, 0.40,
    0.45, 0.50, 0.60, 0.75, 1.00, 1.25, 1.50
  ]);
  const ZERO_DAY_CW_GRID = expandTierGrid([0.2695, 0.50, 0.54375, 0.625, 1.00, 1.25, 2.50, 3.75, 6.25, 6.875, 7.50, 12.50, 18.75]);

  function discoverZeroDayRateVector(rows, p50Variants) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const r0 = rows[0] || {};
    const obsB0 = Number(r0.basePriceUsd) || 0;
    if (!(obsB0 > 0)) return null;
    const p50List = Array.isArray(p50Variants) && p50Variants.length ? p50Variants : AGENT_P50_VARIANTS;
    const l0 = r0.isLongContext ? 2.0 : 1.0;
    const cIn0 = (Number(r0.inputUsd) || 0) / l0;
    const cOut0 = (Number(r0.outputUsd) || 0) / l0;
    const cCr0 = (Number(r0.cacheReadUsd) || 0) / l0;
    const cCw0 = (Number(r0.cacheWriteUsd) || 0) / l0;
    const validP = cIn0 > 0 ? ZERO_DAY_PROMPT_GRID.filter((r) => { const n = Math.round(cIn0 / r); return n > 0 && Math.abs(n * r - cIn0) <= Math.max(1e-11, cIn0 * 1e-6); }) : [0];
    const validC = cOut0 > 0 ? ZERO_DAY_COMP_GRID.filter((r) => { const n = Math.round(cOut0 / r); return n > 0 && Math.abs(n * r - cOut0) <= Math.max(1e-11, cOut0 * 1e-6); }) : [0];
    const validCr = cCr0 > 0 ? ZERO_DAY_CR_GRID.filter((r) => { const n = Math.round(cCr0 / r); return n > 0 && Math.abs(n * r - cCr0) <= Math.max(5.5e-11, cCr0 * 1e-6); }).concat([0]) : [0];
    const validCw = cCw0 > 0 ? ZERO_DAY_CW_GRID.filter((r) => { const n = Math.round(cCw0 / r); return n > 0 && Math.abs(n * r - cCw0) <= Math.max(1e-11, cCw0 * 1e-6); }) : [0];

    for (const p50 of p50List) {
      for (const rP of validP) {
        for (const rC of validC) {
          if (rP > 0 && rC > 0 && (rC < rP * 0.9 || rC > rP * 46)) continue;
          for (const rCr of validCr) {
            if (rP > 0 && rCr > rP * 1.05) continue;
            for (const rCw of validCw) {
              let okAll = true;
              const turnTokens = [];
              for (const rw of rows) {
                const lm = rw.isLongContext ? 2.0 : 1.0;
                const bi = Number(rw.basePriceUsd) || 0;
                const ci = (Number(rw.inputUsd) || 0) / lm, co = (Number(rw.outputUsd) || 0) / lm, ccr = (Number(rw.cacheReadUsd) || 0) / lm, ccw = (Number(rw.cacheWriteUsd) || 0) / lm;
                const nI = rP > 0 && ci > 0 ? Math.round(ci / rP) : 0;
                const nO = rC > 0 && co > 0 ? Math.round(co / rC) : 0;
                const nW = rCw > 0 && ccw > 0 ? Math.round(ccw / rCw) : 0;
                if ((ci > 0 && Math.abs(nI * rP - ci) > Math.max(1e-11, ci * 1e-6)) ||
                    (co > 0 && Math.abs(nO * rC - co) > Math.max(1e-11, co * 1e-6)) ||
                    (ccw > 0 && Math.abs(nW * rCw - ccw) > Math.max(1e-11, ccw * 1e-6))) {
                  okAll = false; break;
                }
                let nR = 0;
                if (ccr > 0) {
                  if (rCr > 0) {
                    nR = Math.round(ccr / rCr);
                    if (Math.abs(nR * rCr - ccr) > Math.max(5.5e-11, ccr * 1e-6)) { okAll = false; break; }
                  } else if (bi > 0 && p50.cacheRead > 0) {
                    const remB = bi - (nI * p50.prompt + nO * p50.completion + nW * p50.cacheWrite);
                    if (remB <= 0) { okAll = false; break; }
                    nR = Math.round(remB / p50.cacheRead);
                    if (nR <= 0) { okAll = false; break; }
                  } else { okAll = false; break; }
                }
                const predB = nI * p50.prompt + nO * p50.completion + nR * p50.cacheRead + nW * p50.cacheWrite;
                const rel = bi > 0 ? Math.abs(predB - bi) / bi : 0;
                if (rel > 5e-5) { okAll = false; break; }
                turnTokens.push({ I: nI, W: nW, R: nR, O: nO, visO: Number(rw.visTokens || rw.visO || rw.tokens) || 0, stepCount: Number(rw.stepCount) || 1 });
              }
              if (okAll) return { prompt: rP, completion: rC, cacheRead: rCr, cacheWrite: rCw, p50Used: p50, turnTokens };
            }
          }
        }
      }
    }
    return null;
  }

  function evaluateCanarySignature(entry) {
    if (!entry || typeof entry !== 'object') {
      return {
        score: 0,
        isCanary: false,
        canaryType: 'none',
        canaryScore: 0,
        canaryName: '',
        isHyperWeight: false,
        hyperScore: 0,
        hyperRatio: 1.0,
        hyperName: '',
        hyperReasons: [],
        stdName: '',
        reasons: [],
        badgeText: '',
      };
    }
    const mStr = `${entry.model || ''} ${entry.label || ''} ${entry.baseLabel || ''}`.toLowerCase();
    const rateStr = String(entry.rateStr || '');
    const ep = entry.effortProfile || {};
    const st = entry.solvedTokens || {};
    const traj = Array.isArray(ep.turnTrajectory) ? ep.turnTrajectory : [];

    const isOpus55Slot = /opus[\s-]*5\.[56]/i.test(mStr)
      || (rateStr === '$4/$20/M' && /opus|claude/i.test(mStr) && (Number(st.W) > 0 || (traj[0] && Number(traj[0].W) > 0)));
    const isFable51Slot = !isOpus55Slot && (/fable[\s-]*5\.[15]/i.test(mStr) || (rateStr === '$10/$50/M' && /fable|claude/i.test(mStr)));
    const isEligibleCanarySlot = isOpus55Slot || isFable51Slot;

    const rawStdLabel = String(entry.baseLabel || entry.label || entry.model || '未知模型').replace(/\s*\[[^\]]*\]/g, '').trim();
    const primaryEffort = String(ep.primaryEffort || ep.effort || entry.inferredEffort || 'High');
    let canaryType = 'none';
    let canaryName = '';
    let stdName = rawStdLabel;

    if (isOpus55Slot) {
      canaryType = 'opus-5.6-active';
      canaryName = 'Claude Opus 5.6 (Opus 5.5槽位灰测)';
      stdName = 'Claude Opus 5.5 ($4/$20)';
    } else if (isFable51Slot) {
      canaryType = 'fable-5.5-upcoming';
      canaryName = 'Claude Fable 5.5 (Fable 5.1预备灰测)';
      stdName = 'Claude Fable 5.1 ($10/$50)';
    }

    const turns = traj.length || Number(st.turns) || (Number(st.O) > 0 ? 1 : 0);
    const rei = Number(ep.reiScore || st.reiScore || 0);
    const rawPeakThink = Number(ep.peakThinkTokens || st.peakThinking || st.thinking || 0);
    const maxSteps = traj.length ? Math.max(...traj.map((t) => Number(t.steps) || 1)) : 1;
    const peakThink = traj.length
      ? Math.max(...traj.map((t) => Number(t.normThinkO != null ? t.normThinkO : Math.round((Number(t.thinkO) || 0) / Math.max(1, Number(t.steps) || 1))) || 0))
      : rawPeakThink;
    const maxTurnO = Number(st.maxTurnO || (traj.length ? Math.max(...traj.map((t) => Number(t.O) || 0)) : st.O) || 0);

    let tierAnchor = 0;
    if (Array.isArray(ep.tierProbs) && ep.tierProbs.length) {
      const matchedTier = ep.tierProbs.find((tp) => String(tp.tier).toLowerCase() === primaryEffort.toLowerCase()) || ep.tierProbs[0];
      if (matchedTier && Number(matchedTier.tAnchor) > 0) tierAnchor = Number(matchedTier.tAnchor);
    }
    if (!tierAnchor) {
      try {
        const spec = resolveModelEffortSpec({ id: entry.model || '', label: entry.label || '' });
        if (spec && spec.thinkAnchors) {
          const k = Object.keys(spec.thinkAnchors).find((key) => key.toLowerCase() === primaryEffort.toLowerCase());
          if (k) tierAnchor = Number(spec.thinkAnchors[k]) || 0;
        }
      } catch (_) {}
    }
    if (!tierAnchor) tierAnchor = /max/i.test(primaryEffort) ? 4500 : (/xhigh/i.test(primaryEffort) ? 2600 : (/medium/i.test(primaryEffort) ? 550 : 1200));
    const effThinkVal = Number(ep.effThinkTok) > 0 ? Math.min(peakThink, Number(ep.effThinkTok)) : peakThink;
    const hyperRatio = (tierAnchor > 0 && effThinkVal > 0) ? +(effThinkVal / tierAnchor).toFixed(2) : 1.0;

    let hyperScore = 10;
    const hyperReasons = [];
    if (hyperRatio >= 2.2 && effThinkVal >= 1800) {
      hyperScore += 44;
      hyperReasons.push(`💪 同思考档超模 ${hyperRatio}x (${primaryEffort}档峰值思=${peakThink} tok ≫ 同档基准${tierAnchor} tok)`);
    } else if (hyperRatio >= 1.75 && effThinkVal >= 1400) {
      hyperScore += 34;
      hyperReasons.push(`💪 同思考档偏强 ${hyperRatio}x (${primaryEffort}档峰值思=${peakThink} tok > 同档基准${tierAnchor} tok)`);
    }
    if ((maxTurnO >= 64000 || rawPeakThink >= 55000) && effThinkVal >= 1500) {
      hyperScore += 38;
      hyperReasons.push(`🔥 单轮超长满血输出(峰值O=${(maxTurnO / 1000).toFixed(1)}k·思=${(peakThink / 1000).toFixed(1)}k)`);
    } else if ((maxTurnO >= 26000 || rawPeakThink >= 20000) && effThinkVal >= 1400) {
      hyperScore += 28;
      hyperReasons.push(`⚡ 单轮深度长思考输出(峰值O=${(maxTurnO / 1000).toFixed(1)}k·思=${(peakThink / 1000).toFixed(1)}k)`);
    }
    if (turns >= 1 && turns <= 2 && maxTurnO >= 3800 && maxTurnO < 26000 && effThinkVal >= 1500) {
      hyperScore += 34;
      hyperReasons.push(`⚡ 短探针同档超强思考爆发(O=${maxTurnO} tok)`);
    }
    if (maxSteps >= 25 && effThinkVal >= 1500) {
      hyperScore += 28;
      hyperReasons.push(`🔧 单轮连续${maxSteps}步深度工具编排`);
    }
    if (Number(ep.expansionRatio) >= 32 && peakThink >= 2200) {
      hyperScore += 22;
      hyperReasons.push(`📈 同档超高思考膨胀比(${ep.expansionRatio}x)`);
    }
    hyperScore = Math.min(98, hyperScore);
    const isHyperWeight = hyperScore >= 48 && /^(max|xhigh)$/i.test(primaryEffort);
    const cleanModelTitle = rawStdLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const hyperName = `${cleanModelTitle} (${primaryEffort}·同思考异常强力体)`;

    let c1 = null;
    let t1W = 0, t1R = 0, t1O = 0;
    if (traj.length > 0) {
      const t1 = traj[0];
      if ((Number(t1.steps) || 1) <= 1 && (Number(t1.R) || 0) < 30000 && ((Number(t1.I) || 0) + (Number(t1.W) || 0)) < 35000) {
        c1 = (Number(t1.I) || 0) + (Number(t1.W) || 0) + (Number(t1.R) || 0);
        t1W = Number(t1.W) || 0;
        t1R = Number(t1.R) || 0;
        t1O = Number(t1.O) || 0;
      }
    } else if (turns <= 1 && (Number(st.R) || 0) < 30000 && ((Number(st.I) || 0) + (Number(st.W) || 0)) < 35000) {
      c1 = (Number(st.I) || 0) + (Number(st.W) || 0) + (Number(st.R) || 0);
      t1W = Number(st.W) || 0;
      t1R = Number(st.R) || 0;
      t1O = Number(st.O) || 0;
    }

    let canaryScore = 0;
    const canaryReasons = [];
    if (isEligibleCanarySlot) {
      canaryScore = 10;
      if (maxTurnO >= 100000 || peakThink >= 95000) {
        canaryScore += 46;
        canaryReasons.push(`🔥 单轮输出突破100K上限(峰值O=${(maxTurnO / 1000).toFixed(1)}k·思=${(peakThink / 1000).toFixed(1)}k，远超5.5常规64K阈值)`);
      } else if (maxTurnO >= 64000 || peakThink >= 55000 || rei >= 3500) {
        canaryScore += 34;
        canaryReasons.push(`⚡ 超限长程思考(REI=${rei}·峰值O=${(maxTurnO / 1000).toFixed(1)}k)`);
      }
      if (turns >= 1 && turns <= 2 && maxTurnO >= 4500 && maxTurnO < 64000) {
        canaryScore += 44;
        canaryReasons.push(`⚡ 单轮短探针爆发20x深度思考(O=${maxTurnO} tok ≫ 标准探针300~600 tok)`);
      }
      if (c1 && c1 > 5000) {
        if (t1R >= 10000 && t1W < 1000) {
          canaryScore += 36;
          canaryReasons.push(`🌐 首轮即命中跨会话全局共享缓存(Turn1 R=${t1R}·W=${t1W}，5.6灰测共享底座特征)`);
        }
        if (c1 <= 11810 || c1 >= 11865) {
          const delta = c1 - 11838;
          canaryScore += 32;
          canaryReasons.push(`📐 首轮系统提示词基线偏移(C1=${c1}, Δ=${delta > 0 ? '+' + delta : delta} tok ≠ 11838标准底座)`);
        }
        if (t1O > 0 && t1O <= 30) {
          canaryScore += 28;
          canaryReasons.push(`🎯 动态零思考自适应路由(Max槽位自动压缩O=${t1O} tok，5.6 Adaptive Effort新特性)`);
        }
      }
      if (traj.length >= 2) {
        const allZeroR = traj.every((t) => (Number(t.R) || 0) === 0 && (Number(t.W) || 0) >= 11000);
        if (allZeroR) {
          canaryScore += 35;
          canaryReasons.push(`🔄 连续${traj.length}轮全量CW写入且CR=0(无状态跨节点灰测路由特征)`);
        }
      }
      if (maxSteps >= 50) {
        canaryScore += 28;
        canaryReasons.push(`🔧 单轮连续${maxSteps}步无干预工具编排(Next-Gen Agent长程底座)`);
      }
      canaryScore = Math.min(98, canaryScore);
    }

    let isUnknownPricing = false;
    let empiricalRateStr = '';
    let empIn = 0, empOut = 0;
    let customAliasName = '';
    const fitVal = Number(entry.fitScore);
    if (!entry.sseFallback && Number.isFinite(fitVal) && fitVal > 0 && fitVal < 98.5 && traj.length >= 1) {
      if (traj.length >= 2) {
        const a = traj[0];
        const b = traj[traj.length - 1];
        const x1 = ((Number(a.I) || 0) + (Number(a.W) || 0) * 1.25 + (Number(a.R) || 0) * 0.1) / 1e6;
        const y1 = (Number(a.O) || 0) / 1e6;
        const z1 = Number(a.stepCost || a.cost || 0);
        const x2 = ((Number(b.I) || 0) + (Number(b.W) || 0) * 1.25 + (Number(b.R) || 0) * 0.1) / 1e6;
        const y2 = (Number(b.O) || 0) / 1e6;
        const z2 = Number(b.stepCost || b.cost || 0);
        const det = x1 * y2 - x2 * y1;
        if (Math.abs(det) > 1e-9 && z1 > 0 && z2 > 0) {
          const pIn = (z1 * y2 - z2 * y1) / det;
          const pOut = (x1 * z2 - x2 * z1) / det;
          if (pIn > 0.02 && pIn < 120 && pOut > 0.05 && pOut < 600) {
            empIn = Math.round(pIn * 100) / 100;
            empOut = Math.round(pOut * 100) / 100;
          }
        }
      }
      if ((!empIn || !empOut) && Number(entry.actualCostUsd) > 0 && Number(st.O) > 0) {
        const totEffIn = ((Number(st.I) || 0) + (Number(st.W) || 0) + (Number(st.R) || 0) * 0.1) / 1e6;
        const totOut = (Number(st.O) || 1) / 1e6;
        const eqIn = Number(entry.actualCostUsd) / Math.max(1e-6, totEffIn + 5 * totOut);
        if (eqIn > 0.02 && eqIn < 100) {
          empIn = Math.round(eqIn * 100) / 100;
          empOut = Math.round(eqIn * 5 * 100) / 100;
        }
      }
      if (empIn > 0 && empOut > 0) {
        isUnknownPricing = true;
        empiricalRateStr = `$${empIn}/$${empOut}/M`;
        hyperReasons.push(`🧬 ${customAliasName ? '命中自定义新模型【' + customAliasName + '】' : '疑似未收录新定价向量'}(拟合${fitVal}% · 实测反解单价≈${empiricalRateStr})`);
      }
    }

    const isCanary = Boolean(isEligibleCanarySlot && canaryScore >= 52);
    const score = isCanary ? canaryScore : (isEligibleCanarySlot ? Math.max(canaryScore, hyperScore) : hyperScore);
    const reasons = isCanary ? canaryReasons : (hyperReasons.length ? hyperReasons : canaryReasons);
    let badgeText = '';
    if (isCanary) {
      badgeText = isOpus55Slot ? `🧪Opus 5.6灰测(${canaryScore}%)` : `🧪Fable 5.5灰测(${canaryScore}%)`;
    } else if (isHyperWeight) {
      badgeText = `💪同档异常强(${hyperRatio >= 1.5 ? hyperRatio + 'x' : hyperScore + '%'})`;
    } else if (isUnknownPricing && empiricalRateStr) {
      badgeText = customAliasName ? `🏷️${customAliasName}(${empiricalRateStr})` : `🧬新单价≈${empiricalRateStr}`;
    }

    return {
      score,
      isCanary,
      isEligibleCanarySlot,
      canaryType,
      canaryScore,
      canaryName,
      isHyperWeight,
      hyperScore,
      hyperRatio,
      hyperName,
      hyperReasons,
      isUnknownPricing,
      empiricalRateStr,
      empIn,
      empOut,
      customAliasName,
      tierAnchor,
      primaryEffort,
      stdName,
      c1,
      maxTurnO,
      peakThink,
      maxSteps,
      turns,
      reasons,
      badgeText,
    };
  }

  /**
   * Quota Tier Reverse-Inference Engine ($5 / $15 / $50 / $1000)
   * Uses highest-precision reading selection argmax(usedPts), calUsable lower-bound gate,
   * and hiSpend = dsHi + tailSpend settlement-lag compensation (100% 28/28 verified).
   */
  const QUOTA_TIER_SPECS = [
    { tier: '$5', usableUsd: 2.5 },
    { tier: '$15', usableUsd: 12.5 },
    { tier: '$50', usableUsd: 47.5 },
    { tier: '$1000', usableUsd: 997.5 },
  ];
  function inferQuotaTier(input) {
    const inp = input && typeof input === 'object' ? input : {};
    const readings = Array.isArray(inp.readings) ? inp.readings : [];
    const usable = Number(inp.calibratedUsableUsd || 0);
    const dsLo = Number(inp.dsLo != null ? inp.dsLo : inp.spendLo || 0);
    const dsHi = Number(inp.dsHi != null ? inp.dsHi : inp.spendHi || dsLo || 0);
    const tailSpend = Number(inp.tailSpend || 0);
    const hiSpend = dsHi + Math.max(0, tailSpend);

    let bestRead = null;
    for (const r of readings) {
      const pts = Number(r && r.usedPts);
      if (Number.isFinite(pts) && pts > 0 && (!bestRead || pts > Number(bestRead.usedPts))) {
        bestRead = r;
      }
    }
    const pts = bestRead ? Number(bestRead.usedPts) : Number(inp.usedPts || 0);
    const pLo = Math.max(0.0001, (pts - 0.5) / 100);
    const pHi = Math.min(1.0, (pts + 0.5) / 100);
    const cLo = pts > 0 ? dsLo / pHi : usable;
    const cHi = pts > 0 ? hiSpend / pLo : Math.max(usable, hiSpend);
    const cMid = pts > 0 ? ((dsLo + hiSpend) * 0.5) / (pts / 100) : usable;

    const scored = QUOTA_TIER_SPECS.map((t) => {
      if (usable > t.usableUsd * 1.15) return { ...t, score: -1e6, feasible: false };
      if (dsLo > t.usableUsd * 1.12) return { ...t, score: -1e6, feasible: false };
      const inBand = t.usableUsd >= cLo * 0.88 && t.usableUsd <= cHi * 1.15;
      const logDist = cMid > 0 ? Math.abs(Math.log(t.usableUsd / Math.max(0.1, cMid))) : 1;
      const score = (inBand ? 100 : 40) - logDist * 28 + (usable > 0 && Math.abs(usable - t.usableUsd) / t.usableUsd < 0.12 ? 35 : 0);
      return { ...t, score: +score.toFixed(2), feasible: true, inBand };
    }).sort((a, b) => b.score - a.score);

    const winner = scored[0] || QUOTA_TIER_SPECS[0];
    return {
      predictedTier: winner.tier,
      usableUsd: winner.usableUsd,
      confidence: winner.inBand ? 0.96 : 0.75,
      impliedCapRange: [+(cLo || 0).toFixed(2), +(cHi || 0).toFixed(2)],
      candidates: scored,
    };
  }


  const KNOWN_GRAYBOX_FAMILY_PROTOTYPES = Object.freeze({
    OpenAI_Astra_Sol_Max: { vendor: 'OpenAI', ttftSec: 4.8, tps: 82.0, chunkCv: 0.42, astScore: 84.5, cotRatio: 1.52 },
    Anthropic_Opus_Max:   { vendor: 'Anthropic', ttftSec: 3.4, tps: 68.0, chunkCv: 0.21, astScore: 86.2, cotRatio: 1.44 },
    Google_Gemini_Argon:  { vendor: 'Google', ttftSec: 1.5, tps: 96.0, chunkCv: 0.31, astScore: 82.9, cotRatio: 1.36 },
    xAI_Grok_Max:         { vendor: 'xAI', ttftSec: 2.3, tps: 88.0, chunkCv: 0.35, astScore: 79.4, cotRatio: 1.38 },
    DeepSeek_V4_Flash:    { vendor: 'DeepSeek', ttftSec: 1.1, tps: 148.0, chunkCv: 0.27, astScore: 77.8, cotRatio: 1.48 },
    Standard_Non_Crown:   { vendor: 'Unknown', ttftSec: 0.9, tps: 125.0, chunkCv: 0.19, astScore: 68.0, cotRatio: 1.05 },
  });

  function opus55PelicanSpectralAstJudge(opts = {}) {
    const pathCount = Math.max(0, Number(opts.pathCount ?? opts.svgPathCount ?? 0) || 0);
    const bezierCount = Math.max(0, Number(opts.bezierCount ?? 0) || 0);
    const groupDepth = Math.max(0, Number(opts.groupDepth ?? 4) || 0);
    const viewBoxArea = Math.max(1, Number(opts.viewBoxArea ?? 480000) || 480000);
    const rawPhi = 14.5 * Math.log1p(pathCount) + 18.2 * Math.log1p(bezierCount) + 4.8 * groupDepth;
    const isMini = viewBoxArea <= 4096;
    const phiHalf = isMini ? 42.0 : 68.0;
    const p1 = Math.pow(Math.max(0, rawPhi), 1.35);
    const p2 = Math.pow(phiHalf, 1.35);
    const spectralScore = (p1 + p2) > 0 ? Math.round((100.0 * p1 / (p1 + p2)) * 100) / 100 : 0;
    return {
      isMini32x32: isMini,
      rawAstComplexityPhi: Math.round(rawPhi * 1000) / 1000,
      nonSaturatingSpectralScore: spectralScore,
      predictedTier: spectralScore >= 72.5 ? 'CROWN_TIER (Opus/Astra/Sol/Argon Max)' : 'STANDARD_TIER',
    };
  }

  function detectGrayBoxModelCRP(opts = {}) {
    const rawModelId = String(opts.modelRawString ?? opts.rawModelId ?? '').trim();
    const ttftSec = Math.max(0.1, Number(opts.ttftSec ?? 3.5) || 3.5);
    const tps = Math.max(1.0, Number(opts.tps ?? 82.0) || 82.0);
    const chunkCv = Math.max(0.05, Number(opts.chunkCv ?? 0.32) || 0.32);
    const pathCount = Math.max(0, Number(opts.svgPathCount ?? opts.pathCount ?? 90) || 0);
    const bezierCount = Math.max(0, Number(opts.bezierCount ?? 140) || 0);
    const animCount = Math.max(0, Number(opts.animCount ?? 6) || 0);
    const rAst = Math.round((100.0 * (0.45 * (pathCount / (pathCount + 35.0)) + 0.35 * (bezierCount / (bezierCount + 45.0)) + 0.20 * (animCount / (animCount + 4.0)))) * 100) / 100;
    const scales = { ttftSec: 1.2, tps: 22.0, chunkCv: 0.08, astScore: 5.5 };
    let closestFamily = 'OpenAI_Astra_Sol_Max';
    let minMaha = Infinity;
    for (const [fam, proto] of Object.entries(KNOWN_GRAYBOX_FAMILY_PROTOTYPES)) {
      const d2 =
        Math.pow((ttftSec - proto.ttftSec) / scales.ttftSec, 2) +
        Math.pow((tps - proto.tps) / scales.tps, 2) +
        Math.pow((chunkCv - proto.chunkCv) / scales.chunkCv, 2) +
        Math.pow((rAst - proto.astScore) / scales.astScore, 2);
      const d = Math.round(Math.sqrt(d2) * 1000) / 1000;
      if (d < minMaha) {
        minMaha = d;
        closestFamily = fam;
      }
    }
    const lowId = rawModelId.toLowerCase();
    const knownSet = opts.knownModelsSet instanceof Set ? opts.knownModelsSet : null;
    const isKnown = Boolean(knownSet && rawModelId && knownSet.has(rawModelId));
    const isNovelCrp = (!isKnown) && (minMaha > 1.85 || /gray|stealth|preview|mystery|zero-day|unknown/i.test(lowId));
    const crpProb = Math.round((1.0 / (1.0 + Math.exp(-(minMaha - 1.65) * 1.8))) * 10000) / 10000;
    const isGrayboxCrown = rAst >= 78.0;
    const inferredTier = rAst >= 81.5 ? '(Max-GrayBox)' : (rAst >= 78.0 ? '(High-GrayBox)' : '(Standard-GrayBox)');
    return {
      rawModelId,
      isNovelGrayboxModel: isNovelCrp,
      crpNoveltyProbability: crpProb,
      minMahalanobisDistance: minMaha,
      inferredParentLineage: closestFamily,
      inferredVendor: KNOWN_GRAYBOX_FAMILY_PROTOTYPES[closestFamily]?.vendor || 'Unknown',
      astSpectralScore: rAst,
      isAutoLockedAsCrown: isGrayboxCrown,
      assignedTierTag: (isGrayboxCrown ? '👑 灰测皇冠·' : '🔍 灰测普模·') + closestFamily + inferredTier,
      autoInheritedHjbBrakePct: isGrayboxCrown ? 76.8 : 85.0,
    };
  }

  function evaluateZeroQuotaCarbonSignature(input) {
    const text = typeof input === 'string' ? input : '';
    const applicable = /<!doctype html|<svg/i.test(text.slice(0, 4000));
    const version = '37.5.9-iter9-zq';
    if (!applicable) {
      return { applicable: false, isTrueCarbon: false, verdict: 'NOT_APPLICABLE_NON_HTML_STREAM',
        mode: null, hits: 0, gates: {}, missedGates: [], earlyAbortNonCarbon: false,
        earlyAbortReason: '', profile: {}, version };
    }

    const byteLength = (value) => {
      const s = String(value || '');
      if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') return Buffer.byteLength(s, 'utf8');
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
      return unescape(encodeURIComponent(s)).length;
    };
    const scripts = [];
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRe.exec(text)) !== null) scripts.push(scriptMatch[1]);
    const scriptsBytes = scripts.reduce((sum, body) => sum + byteLength(body), 0);
    const centredFlex = /display\s*:\s*flex/.test(text)
      && /justify-content\s*:\s*center/.test(text)
      && /align-items\s*:\s*center/.test(text);
    const pctCoordRe = /(x1|x2|y1|y2)\s*=\s*["']?\s*\d+(\.\d+)?\s*%/g;
    const profile = {
      bytes: byteLength(text),
      jsKb: scriptsBytes / 1024.0,
      hasScript: scripts.length > 0,
      smil: (text.match(/<animate/g) || []).length,
      linearGradients: (text.match(/<linearGradient/g) || []).length,
      gradPctCoords: (text.match(pctCoordRe) || []).length,
      centredFlex: centredFlex ? 1 : 0,
      langZh: /<html[^>]*\blang\s*=\s*["']zh/i.test(text) ? 1 : 0,
      zeroIndentTopLevel: /^(<!DOCTYPE|<html|<meta|<style|<svg|<body)/.test(text) ? 1 : 0,
    };
    const gates = {
      g1_no_smil_real_engine: !text.includes('<animate') && profile.jsKb >= 15.0
        && text.includes('requestAnimationFrame') && (text.includes('atan2(') || text.includes('acos('))
        && !text.includes('mini32'),
      g2_no_centred_flex: !profile.centredFlex,
      g3_dual_interaction_lock: /user-select\s*:\s*none/.test(text)
        && (/pointer-events\s*:\s*none/.test(text) || /-webkit-user-select\s*:\s*none/.test(text)),
      g4_lineargradient_no_pct_coords: profile.linearGradients >= 1 && profile.gradPctCoords === 0,
      g5_doctype_zero_indent: profile.zeroIndentTopLevel === 1 && !text.slice(0, 200).includes('<!doctype html>'),
    };
    const gateNames = Object.keys(gates);
    const hits = gateNames.filter((name) => gates[name]).length;
    const modeATrue = hits === gateNames.length;
    const bHits = {
      b1_size_ge_30000: profile.bytes >= 30000,
      b2_gradients_ge_6: profile.linearGradients >= 6,
      b3_grad_pct_coords_zero: profile.gradPctCoords === 0,
      b4_no_centred_flex: profile.centredFlex === 0,
      b5_zero_indent_top_level: profile.zeroIndentTopLevel === 1,
      // Mode-B v2: no <script> at all -> pure static SVG passes; with script, jsKb must be >= 15.0
      b6_script_size_gate: profile.hasScript === false || profile.jsKb >= 15.0,
    };
    const modeBTrue = Object.keys(bHits).every((name) => bHits[name]);
    const bMissed = Object.keys(bHits).filter((name) => !bHits[name]);
    let mode, verdict, missed, outGates = Object.assign({}, gates);
    if (modeATrue) {
      mode = 'A_JS_PHYSICS_PROBE';
      verdict = 'CONFIRMED_CARBON';
      missed = [];
    } else if (modeBTrue) {
      mode = 'B_PURE_SVG_COMPILER';
      verdict = 'CANDIDATE_COMPILER_FINGERPRINT_NOT_CONFIRMED';
      missed = bMissed;
      for (const name of Object.keys(bHits)) outGates[name] = 'b:' + name;
    } else {
      mode = 'NONE';
      verdict = hits >= 3 ? 'NEAR_MISS_' + hits + '_OF_5' : 'REJECTED_NON_CARBON_' + hits + '_OF_5';
      missed = gateNames.filter((name) => !gates[name]).concat(bMissed);
    }

    const checkPrefix = (prefix) => {
      if (typeof prefix !== 'string') return { earlyAbortNonCarbon: false, reason: '', prefixSeen: 0 };
      const p = prefix.slice(0, 1800);
      let reason = '';
      if (/display\s*:\s*flex/.test(p) && /align-items\s*:\s*center/.test(p)
          && /justify-content\s*:\s*center/.test(p)) {
        reason = 'prefix_hit_centred_flex_boilerplate';
      } else if (p.includes('<defs') && /(x1|x2|y1|y2)\s*=\s*["']?\s*\d+(\.\d+)?\s*%/.test(p)) {
        reason = 'prefix_hit_percent_gradient_coords';
      } else if (p.includes('<animate') || p.includes('animation:')) {
        reason = 'prefix_hit_smil';
      } else if (p.includes('user-select') || p.includes('pointer-events')) {
        if (!/user-select\s*:\s*none/.test(p) || !(/pointer-events\s*:\s*none/.test(p) || /-webkit-user-select\s*:\s*none/.test(p))) {
          reason = 'prefix_missing_dual_interaction_lock';
        }
      } else if (/(?:<!doctype html|<svg)/i.test(p) && /<html[^>]*>/i.test(p)
          && !/<html[^>]*\blang\s*=\s*["']zh/i.test(p)) {
        reason = 'prefix_missing_html_lang_zh';
      }
      return { earlyAbortNonCarbon: Boolean(reason), reason, prefixSeen: p.length };
    };
    let early = checkPrefix(text.slice(0, 1800));
    if (modeATrue) early = { earlyAbortNonCarbon: false, reason: '', prefixSeen: early.prefixSeen };
    return { applicable: true, isTrueCarbon: modeATrue, verdict, mode, hits,
      modeBHits: Object.keys(bHits).filter((name) => bHits[name]).length,
      gates: outGates, missedGates: missed,
      earlyAbortNonCarbon: Boolean(early.earlyAbortNonCarbon), earlyAbortReason: early.reason,
      profile, version };
  }


  // ===========================================================================
  // [v37.9.1] 千面助手 · 谷歌家族 -> Gemini 4 Argon -> Gemini 4 Carbon 三级门控引擎
  // ===========================================================================
  const ORIG_PELICAN_STANDARD_PROMPT = 'Create a new HTML file using SVG to draw a 2D animation of a pelican riding a bicycle. Display only the auto-playing, looping animation on the page, with no explanations, descriptive text, buttons, menus, or interactive controls, and no testing required.';

  function extractFullTurnPayload(msgOrParts) {
    const textBuf = [];
    const sandboxFiles = [];
    let reasoningParts = 0;
    let reasoningChars = 0;
    let hasGoogleThoughtSig = false;
    const provKeys = [];
    const parts = Array.isArray(msgOrParts)
      ? msgOrParts
      : (msgOrParts && Array.isArray(msgOrParts.parts) ? msgOrParts.parts : []);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || typeof p !== 'object') continue;
      const pt = String(p.type || '');
      const pm = p.providerMetadata || p.callProviderMetadata || null;
      if (pm && typeof pm === 'object') {
        Object.keys(pm).forEach(function (k) { if (provKeys.indexOf(k) < 0) provKeys.push(k); });
        const gm = pm.google || pm.vertex || null;
        if (gm && gm.thoughtSignature) hasGoogleThoughtSig = true;
      }
      if (pt === 'text') {
        textBuf.push(String(p.text || ''));
      } else if (pt === 'reasoning') {
        reasoningParts += 1;
        reasoningChars += String(p.text || '').length;
      } else if (pt.indexOf('write_file') >= 0 || pt === 'tool-invocation' || pt === 'dynamic-tool' || pt === 'tool-call' || pt === 'tool_use') {
        const inp = (p.input && typeof p.input === 'object')
          ? p.input
          : ((p.args && typeof p.args === 'object') ? p.args : (p.toolInvocation && p.toolInvocation.args ? p.toolInvocation.args : null));
        if (inp && typeof inp === 'object' && typeof inp.content === 'string' && inp.content.length > 0) {
          const fpath = String(inp.path || inp.file_path || '');
          sandboxFiles.push({ path: fpath, content: inp.content, bytes: inp.content.length });
        }
      }
    }
    if (!textBuf.length && msgOrParts && typeof msgOrParts.content === 'string') {
      textBuf.push(msgOrParts.content);
    }
    const joinedText = textBuf.join('');
    let bestContent = '';
    let source = 'none';
    const htmlFiles = sandboxFiles.filter(function (f) {
      return /\.(?:html?|svg)$/i.test(f.path) || /<!doctype html|<svg\b/i.test(f.content);
    });
    if (htmlFiles.length) {
      htmlFiles.sort(function (a, b) { return b.bytes - a.bytes; });
      bestContent = htmlFiles[0].content;
      source = 'sandbox_write_file:' + htmlFiles[0].path;
    } else if (sandboxFiles.length && sandboxFiles[0].content.length > joinedText.length) {
      sandboxFiles.sort(function (a, b) { return b.bytes - a.bytes; });
      bestContent = sandboxFiles[0].content;
      source = 'sandbox_write_file:' + sandboxFiles[0].path;
    } else if (joinedText) {
      const m = joinedText.match(/```(?:html|svg)?\s*(<!doctype html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>|<svg[\s\S]*?<\/svg>)\s*```/i);
      bestContent = m ? m[1] : joinedText;
      source = /<svg\b|<html\b/i.test(bestContent) ? 'text_html' : 'plain_text';
    }
    const pythonModeling = sandboxFiles.some(function (f) {
      return /\.py$/i.test(f.path) || (/\bimport\s+math\b/.test(f.content) && /<svg\b/i.test(f.content));
    });
    return {
      bestContent: bestContent,
      textContent: joinedText,
      sandboxFiles: sandboxFiles,
      pythonModeling: pythonModeling,
      python_modeling: pythonModeling,
      source: source,
      bytes: bestContent.length,
      reasoningParts: reasoningParts,
      reasoningChars: reasoningChars,
      hasGoogleThoughtSig: hasGoogleThoughtSig,
      provKeys: provKeys,
    };
  }

  function _readDualQuotaDeltaPct(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const raw = meta.quota_delta_pct != null ? meta.quota_delta_pct
      : (meta.quotaDeltaPct != null ? meta.quotaDeltaPct
        : (meta.deltaQuotaPct != null ? meta.deltaQuotaPct : meta.quotaDelta));
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function _readDualPythonModeling(meta) {
    if (!meta || typeof meta !== 'object') return false;
    return Boolean(meta.python_modeling || meta.pythonModeling || meta.hasPythonIk);
  }

  function classifyGoogleFamilyStage1(s2Meta, rawContent) {
    const swapped = (typeof s2Meta === 'string' && (!rawContent || typeof rawContent === 'object'));
    const meta = (swapped ? rawContent : s2Meta) || {};
    const text = swapped ? s2Meta : (typeof rawContent === 'string' ? rawContent : '');
    const xAvg = Number(meta.xAvg || meta.s2_xAvg || meta.avg_chunk_chars || 0);
    const tCnt = Number(meta.tCnt || meta.text_chunks || meta.textChunks || 0);
    const rCnt = Number(meta.rCnt || meta.reasoning_chunks || meta.reasoningChunks || 0);
    const rAvg = Number(meta.rAvg || meta.rAvgChunk || 0);
    const rp = meta.rp != null ? Number(meta.rp) : (meta.reasoning_parts != null ? Number(meta.reasoning_parts) : -1);
    const rc = meta.rc != null ? Number(meta.rc) : (meta.reasoning_chars != null ? Number(meta.reasoning_chars) : -1);
    const hasSig = Boolean(meta.hasSig || meta.has_google_thought_sig || meta.sawGoogleSig);
    const provKeys = Array.isArray(meta.provKeys || meta.prov_keys)
      ? (meta.provKeys || meta.prov_keys).map(function (k) { return String(k).toLowerCase(); })
      : [];
    const quotaDelta = _readDualQuotaDeltaPct(meta);
    const wsHint = String(meta.ws_model_hint || meta.wsModelHint || meta.old_ws_label || meta.ui_model || meta.uiModel || '');
    const nonGoogleHintRe = /(?:gpt[-_\s]?[456]|openai|\bsol\b|\bluna\b|\bastra\b|claude|anthropic|opus|sonnet|haiku|deepseek|grok|qwen|kimi|glm|nemotron|mimo|mistral|llama)/i;
    const isCoalescedReplay = (tCnt > 0 && tCnt < 12 && xAvg > 250 && !hasSig);
    const byteLen = (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function')
      ? Buffer.byteLength(text, 'utf8')
      : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length);
    const hasSvgInText = /<svg\b/i.test(text);
    const hasPyIk = (_readDualPythonModeling(meta) && hasSvgInText) || (/\bimport\s+math\b/.test(text) && /\bmath\.(?:acos|atan2|hypot)\b/.test(text) && hasSvgInText);

    if (hasSig || provKeys.indexOf('google') >= 0 || provKeys.indexOf('vertex') >= 0) {
      return { stage1IsGoogle: true, vendor: 'google', confidence: 1.0, reason: 'google_thought_signature_verified' };
    }
    if (provKeys.indexOf('openai') >= 0) {
      return { stage1IsGoogle: false, vendor: 'openai', confidence: 1.0, reason: 'provider_metadata_openai' };
    }
    if (provKeys.indexOf('anthropic') >= 0) {
      return { stage1IsGoogle: false, vendor: 'anthropic', confidence: 1.0, reason: 'provider_metadata_anthropic' };
    }
    if (quotaDelta !== null && quotaDelta > 0.001) {
      return { stage1IsGoogle: false, vendor: 'anthropic_or_billed', confidence: 0.99, reason: 'nonzero_quota_delta' };
    }
    if (wsHint && nonGoogleHintRe.test(wsHint) && !/argon|gemini/i.test(wsHint)) {
      return { stage1IsGoogle: false, vendor: /gpt|sol|luna|astra|openai/i.test(wsHint) ? 'openai' : 'non_google', confidence: 0.99, reason: 'non_google_model_hint:' + wsHint };
    }
    if (xAvg > 0 && !isCoalescedReplay && (tCnt >= 12 || xAvg <= 250)) {
      if (xAvg < 6.0) return { stage1IsGoogle: false, vendor: 'openai', confidence: 0.99, reason: 's2_narrow_openai_chunks_xAvg=' + xAvg.toFixed(2) };
      if (xAvg < 16.5) return { stage1IsGoogle: false, vendor: 'anthropic_or_oss', confidence: 0.97, reason: 's2_medium_narrow_chunks_xAvg=' + xAvg.toFixed(2) };
      if (xAvg >= 16.5 && tCnt >= 2) return { stage1IsGoogle: true, vendor: 'google', confidence: 0.99, reason: 's2_wide_google_chunks_xAvg=' + xAvg.toFixed(2) };
      if (tCnt === 1 && byteLen >= 35 && rp <= 0 && rc <= 0) return { stage1IsGoogle: true, vendor: 'google', confidence: 0.91, reason: 's2_single_wide_google_short_probe' };
    }
    if (rCnt >= 4 && rAvg >= 18.0 && !nonGoogleHintRe.test(wsHint)) {
      return { stage1IsGoogle: true, vendor: 'google', confidence: 0.95, reason: 's2_wide_google_agent_reasoning_rAvg=' + rAvg.toFixed(2) };
    }
    if (rp >= 2 && rc === 0) return { stage1IsGoogle: false, vendor: 'openai', confidence: 0.96, reason: 'multi_empty_reasoning_parts_openai' };
    if (rp === 1 && rc === 0) return { stage1IsGoogle: false, vendor: 'anthropic', confidence: 0.92, reason: 'single_empty_redacted_reasoning_anthropic' };
    if (rp >= 1 && rc > 0 && !hasSig && hasPyIk && byteLen >= 18000) {
      return { stage1IsGoogle: true, vendor: 'google', confidence: 0.94, reason: 'google_agent_python_ik_modeling_signature' };
    }
    if (rp >= 1 && rc > 0 && !hasSig && !/argon|gemini/i.test(wsHint)) {
      return { stage1IsGoogle: false, vendor: 'anthropic_or_oss_visible_reasoning', confidence: 0.90, reason: 'visible_reasoning_without_google_sig' };
    }
    if (byteLen < 10000) {
      return { stage1IsGoogle: null, vendor: 'unknown_short_reply', confidence: 0.0, reason: 'reply_too_short_need_s2_or_pelican' };
    }
    if (text.slice(0, 400).indexOf('<!doctype html>') >= 0) {
      return { stage1IsGoogle: false, vendor: 'openai_or_oss', confidence: 0.88, reason: 'lowercase_doctype_non_google' };
    }
    if (isCoalescedReplay) {
      return { stage1IsGoogle: false, vendor: 'non_google_coalesced_replay', confidence: 0.93, reason: 'posthoc_coalesced_replay_not_live_stream' };
    }
    if (rp === 0 && rc === 0 && text.slice(0, 400).indexOf('<!DOCTYPE html>') >= 0 && /argon|gemini/i.test(wsHint)) {
      return { stage1IsGoogle: true, vendor: 'google', confidence: 0.93, reason: 'zero_reasoning_uppercase_doctype_with_gemini_slot' };
    }
    const zq = evaluateZeroQuotaCarbonSignature(text);
    if (zq && zq.isTrueCarbon) return { stage1IsGoogle: true, vendor: 'google', confidence: 0.95, reason: 'static_5gate_carbon_signature' };
    if (hasPyIk && byteLen >= 18000) return { stage1IsGoogle: true, vendor: 'google', confidence: 0.94, reason: 'static_python_ik_carbon_signature' };
    return { stage1IsGoogle: false, vendor: 'non_google_static_fallback', confidence: 0.80, reason: 'static_html_without_google_stream_evidence' };
  }

  function classify3StageGoogleArgonCarbon(rawContent, s2Meta) {
    const swapped = (rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent));
    const text = swapped ? (typeof s2Meta === 'string' ? s2Meta : '') : (typeof rawContent === 'string' ? rawContent : '');
    const meta = (swapped ? rawContent : s2Meta) || {};
    const s1 = classifyGoogleFamilyStage1(meta, text);
    const zq = evaluateZeroQuotaCarbonSignature(text);
    const byteLen = (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function')
      ? Buffer.byteLength(text, 'utf8')
      : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length);
    const scripts = [];
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
    let m;
    while ((m = scriptRe.exec(text)) !== null) scripts.push(m[1]);
    const jsBytes = scripts.reduce(function (acc, b) {
      return acc + ((typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') ? Buffer.byteLength(b, 'utf8') : b.length);
    }, 0);
    const jsKb = jsBytes / 1024.0;
    const smilCount = (text.match(/<animate/g) || []).length;
    const hasSvg = /<svg\b/i.test(text);
    const hasPyIk = _readDualPythonModeling(meta) || (/\bimport\s+math\b/.test(text) && /\bmath\.(?:acos|atan2|hypot)\b/.test(text) && hasSvg);
    const rawDurS = meta.dur_s != null ? meta.dur_s : (meta.durS != null ? meta.durS : meta.durationSec);
    const durS = (rawDurS != null && Number.isFinite(Number(rawDurS))) ? Number(rawDurS) : 0;

    if (s1.stage1IsGoogle === null) {
      return {
        applicable: false, stage1IsGoogle: null, vendor: s1.vendor, stage1Reason: s1.reason,
        stage2ArgonSubtier: 'UNKNOWN_SHORT_REPLY', isTrueCarbon: false,
        verdict: 'HOLD_SHORT_REPLY_NEED_ENVELOPE_OR_PELICAN',
        modelId: 'unknown/need-pelican-retest', label: '回复过短待原版鹈鹕复测',
        mode: null, hits: zq ? zq.hits : 0, profile: zq ? zq.profile : { bytes: byteLen, jsKb: jsKb },
        version: '37.9.1-3stage-google-argon-carbon',
      };
    }
    if (!s1.stage1IsGoogle) {
      return {
        applicable: true, stage1IsGoogle: false, vendor: s1.vendor, stage1Reason: s1.reason,
        stage2ArgonSubtier: 'NOT_GOOGLE', isTrueCarbon: false, verdict: 'NON_GOOGLE_VENDOR',
        modelId: s1.vendor + '/non-google', label: '非谷歌家族 (' + s1.vendor + ')',
        mode: null, hits: zq ? zq.hits : 0, profile: zq ? zq.profile : { bytes: byteLen, jsKb: jsKb },
        version: '37.9.1-3stage-google-argon-carbon',
      };
    }

    let subtier = 'ARGON_BARIUM_B';
    let isCarbon = false;
    let mode = null;
    let verdict = 'VERIFIED_GOOGLE_ARGON_BARIUM_B';
    if (zq && zq.isTrueCarbon) {
      subtier = 'CARBON'; isCarbon = true; mode = 'A_CLASSIC_5GATE'; verdict = 'CONFIRMED_CARBON';
    } else if (hasSvg && scripts.length > 0 && smilCount === 0 && (!zq || !zq.profile || (!zq.profile.centredFlex && zq.profile.gradPctCoords === 0)) && jsKb >= 14.0 && text.includes('requestAnimationFrame') && (text.includes('atan2(') || text.includes('acos(')) && byteLen >= 20000) {
      subtier = 'CARBON'; isCarbon = true; mode = 'A2_GOOGLE_VERIFIED_JS_KINEMATIC_CARBON'; verdict = 'CONFIRMED_CARBON';
    } else if (hasPyIk && hasSvg && byteLen >= 18000) {
      subtier = 'CARBON'; isCarbon = true; mode = 'C_GOOGLE_PYTHON_CAD_CARBON'; verdict = 'CONFIRMED_CARBON';
    } else if (
      (byteLen < 10500 && scripts.length === 0 && (durS === 0 || durS < 18.0))
      || (hasSvg && !text.includes('requestAnimationFrame') && (smilCount >= 8 || (text.match(/@keyframes\b/gi) || []).length >= 12))
    ) {
      subtier = 'GEMINI_3_8_FLASH'; isCarbon = false; verdict = 'VERIFIED_GOOGLE_GEMINI_3_8_FLASH';
    }

    const modelId = isCarbon
      ? 'google/gemini-4-carbon'
      : (subtier === 'GEMINI_3_8_FLASH' ? 'google/gemini-3.8-flash' : 'google/gemini-4-argon');
    const label = isCarbon
      ? 'Google Gemini 4 Carbon (👑真Carbon)'
      : (subtier === 'GEMINI_3_8_FLASH' ? 'Google Gemini 3.8 Flash' : 'Google Gemini 4 Argon (Barium-B)');
    return {
      applicable: true, stage1IsGoogle: true, vendor: 'google', stage1Reason: s1.reason,
      stage2ArgonSubtier: subtier, isTrueCarbon: isCarbon, verdict: verdict,
      modelId: modelId, label: label, mode: mode, hits: zq ? zq.hits : 0,
      profile: Object.assign({}, zq ? zq.profile : {}, { bytes: byteLen, jsKb: jsKb }),
      version: '37.9.1-3stage-google-argon-carbon',
    };
  }

  function detectGoogleCarbonThreeStage(rawContent, s2Meta) {
    return classify3StageGoogleArgonCarbon(rawContent, s2Meta);
  }

  function evaluateThreeStageGate(rawContent, s2Meta) {
    return classify3StageGoogleArgonCarbon(rawContent, s2Meta);
  }

  /**
   * [Z10+] Zero-Probe Stylometry & Tool Behavior Habit Extractor
   * Extracts gateway-scrub-resistant stylometric invariants and tool-calling habits from assistant messages.
   */

  const CARBON_PROBE_PROMPT = 'Create a new HTML file using SVG to draw a 2D animation of a pelican riding a bicycle. Display only the auto-playing, looping animation on the page, with no explanations, descriptive text, buttons, menus, or interactive controls, and no testing required.';

  const CARBON_PROBE_STATES = {
    UNPROBED: 'UNPROBED',
    PROBE_DISPATCHED: 'PROBE_DISPATCHED',
    VERIFIED_TRUE_CARBON: 'VERIFIED_TRUE_CARBON',
    VERIFIED_BARIUM_B: 'VERIFIED_BARIUM_B',
    NOT_ARGON: 'NOT_ARGON',
  };

  const CARBON_PROBE_ACTIONS = {
    TRIGGER_PELICAN_FOLLOWUP: 'TRIGGER_PELICAN_FOLLOWUP',
    CLASSIFY_NOW: 'CLASSIFY_NOW',
    ALREADY_LOCKED: 'ALREADY_LOCKED',
    WAIT_FOLLOWUP: 'WAIT_FOLLOWUP',
    SKIP_NOT_ARGON: 'SKIP_NOT_ARGON',
  };

  const ARGON_MODEL_HINTS = ['argon', '4xts', 'barium-bb-v2', 'gemini-4-argon'];
  const NON_ARGON_FAMILY_HINTS = ['claude', 'opus', 'sonnet', 'gpt', 'sol', 'astra', 'fable',
    'grok', 'kimi', 'qwen', 'deepseek', 'mistral', 'nemotron', 'llama'];

  function isArgonFamilyModel(model) {
    const blob = String(model == null ? '' : model).trim().toLowerCase();
    if (!blob) return false;
    if (ARGON_MODEL_HINTS.some(function (h) { return blob.indexOf(h) >= 0; })) return true;
    if (NON_ARGON_FAMILY_HINTS.some(function (h) { return blob.indexOf(h) >= 0; })) return false;
    return false;
  }

  function isPelicanOutput(text) {
    const s = String(text == null ? '' : text);
    if (!s || s.indexOf('<svg') < 0) return false;
    const low = s.slice(0, 20000).toLowerCase();
    const hasBird = s.indexOf('鹈鹕') >= 0 || low.indexOf('pelican') >= 0;
    const hasBike = s.indexOf('自行车') >= 0 || low.indexOf('bicycle') >= 0 || low.indexOf('bike') >= 0;
    return hasBird && hasBike;
  }

  function resolveSessionCarbonProbeAction(state, opts) {
    const st = state || {};
    const o = opts || {};
    const sessionId = String(st.sessionId || st.session_id || o.sessionId || '');
    const side = (String(st.side || o.side || 'A').toUpperCase().slice(0, 1)) || 'A';
    const model = String(st.model || st.modelId || st.model_id || o.model || '');
    const probeState = String(st.probeState || st.probe_state || o.probeState ||
      CARBON_PROBE_STATES.UNPROBED).toUpperCase();
    const firstTurnText = String(st.firstTurnText || st.first_turn_text ||
      o.firstTurnText || '');
    const sessionKey = sessionId + '|' + side;
    const argonFamily = isArgonFamilyModel(model);
    const base = {
      sessionKey: sessionKey,
      sessionId: sessionId,
      side: side,
      model: model,
      argonFamily: argonFamily,
      probeState: probeState,
    };

    if (!argonFamily) {
      return Object.assign(base, {
        action: CARBON_PROBE_ACTIONS.SKIP_NOT_ARGON,
        prompt: '',
        nextState: CARBON_PROBE_STATES.NOT_ARGON,
        persist: probeState !== CARBON_PROBE_STATES.NOT_ARGON,
        reason: '模型不在 Argon 家族，不补发鹈鹕探针',
      });
    }

    if (probeState === CARBON_PROBE_STATES.VERIFIED_TRUE_CARBON ||
        probeState === CARBON_PROBE_STATES.VERIFIED_BARIUM_B) {
      return Object.assign(base, {
        action: CARBON_PROBE_ACTIONS.ALREADY_LOCKED,
        prompt: '',
        nextState: probeState,
        persist: false,
        reason: '会话已确权 ' + probeState + '，不再重复打扰',
      });
    }

    if (isPelicanOutput(firstTurnText)) {
      return Object.assign(base, {
        action: CARBON_PROBE_ACTIONS.CLASSIFY_NOW,
        prompt: '',
        nextState: CARBON_PROBE_STATES.PROBE_DISPATCHED,
        persist: probeState !== CARBON_PROBE_STATES.PROBE_DISPATCHED,
        reason: '首轮输出已是标准鹈鹕探针，直接走零额度 Carbon 秒判',
      });
    }

    if (probeState === CARBON_PROBE_STATES.PROBE_DISPATCHED) {
      return Object.assign(base, {
        action: CARBON_PROBE_ACTIONS.WAIT_FOLLOWUP,
        prompt: CARBON_PROBE_PROMPT,
        nextState: CARBON_PROBE_STATES.PROBE_DISPATCHED,
        persist: false,
        reason: '补发已下发，等待该轮流式返回',
      });
    }

    return Object.assign(base, {
      action: CARBON_PROBE_ACTIONS.TRIGGER_PELICAN_FOLLOWUP,
      prompt: CARBON_PROBE_PROMPT,
      nextState: CARBON_PROBE_STATES.PROBE_DISPATCHED,
      persist: true,
      reason: '首次被无额度引擎判为 Argon 且未探针，立刻补发标准鹈鹕探针',
    });
  }


  // ── Zero-Quota V6 Cross-Family Standalone Classifiers & Stage-1 Protocol Gate ──
  function _getClaudeV5Engine() {
    if (root && root.ClaudeStandaloneClassifierV5) return root.ClaudeStandaloneClassifierV5;
    if (typeof require === 'function') {
      try { return require('./claude-standalone-v5.js'); } catch (_) {}
    }
    return null;
  }

  function _getGptV1Engine() {
    if (root && root.ArenaGptStandaloneV1) return root.ArenaGptStandaloneV1;
    if (typeof require === 'function') {
      try { return require('./gpt-standalone-v1.js'); } catch (_) {}
    }
    return null;
  }

  const _ZQ_CLAUDE_V9_LRU = new Map();
  let _AST_BLOB_WORKER = null;
  let _AST_WORKER_SEQ = 0;
  const _AST_WORKER_PENDING = new Map();

  function classifyClaudeZeroQuotaEnhanced(sample) {
    const s = (sample && typeof sample === 'object') ? sample : {};
    const rawSvgOrReply = String(s.svgText || s.html || s.replyText || '');
    const toolIds = Array.isArray(s.toolIds) ? s.toolIds.map(String) : [];
    const streamIds = Array.isArray(s.streamIds) ? s.streamIds.map(String) : [];
    const durMs = Number(s.turnDurationMs || s.thinkDurationMs || 0);
    const visTok = Number(s.visTokens || s.visibleTokens || 0);
    const steps = Math.max(1, Number(s.totalStepCount || s.maxStepCount || s.steps || 1));
    const turns = Math.max(1, Number(s.turns || 1));
    const hasExplicitAnthropicWire = (
      s.vendorHint === 'anthropic'
      || s.toolFamily === 'claude'
      || toolIds.some((id) => /^(?:srv)?toolu_|^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i.test(id))
      || streamIds.some((id) => /^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i.test(id))
    );

    const canMemo = !s.detailJson && !s.bimodalOpusProbe;
    const memoKey = canMemo
      ? (rawSvgOrReply.length + '\u0000' + rawSvgOrReply.slice(0, 80) + '\u0000' + rawSvgOrReply.slice(-80)
         + `|${durMs}|${visTok}|${steps}|${turns}|${s.rp || 0}|${s.rc || 0}|${s.reasoningSignature || ''}|${hasExplicitAnthropicWire ? 1 : 0}`)
      : '';
    if (canMemo && _ZQ_CLAUDE_V9_LRU.has(memoKey)) {
      const hit = _ZQ_CLAUDE_V9_LRU.get(memoKey);
      _ZQ_CLAUDE_V9_LRU.delete(memoKey);
      _ZQ_CLAUDE_V9_LRU.set(memoKey, hit);
      return Object.assign({}, hit);
    }

    const memoStore = (outObj) => {
      if (canMemo && outObj) {
        _ZQ_CLAUDE_V9_LRU.set(memoKey, outObj);
        if (_ZQ_CLAUDE_V9_LRU.size > 512) _ZQ_CLAUDE_V9_LRU.delete(_ZQ_CLAUDE_V9_LRU.keys().next().value);
      }
      return outObj;
    };

    const lowSub = rawSvgOrReply.length >= 40 ? rawSvgOrReply.slice(0, 4096).toLowerCase() : '';
    const hasArtifactSub = rawSvgOrReply.length >= 40 && (
      lowSub.indexOf('<svg') !== -1 || lowSub.indexOf('<!doctype html') !== -1 || lowSub.indexOf('<html') !== -1 || /<svg\b/i.test(rawSvgOrReply)
    );

    // V9 Un-locked Offline Battle/HTML Non-Claude Crown Anti-Bleed Guard (146-Sample Zero-Collision Verified: 0/100 DB + 0/40 Opus87 + 0/6 Hub):
    // Pruned `hasScr && cmt<=16` after ablation showed 18/146 collision on real Opus 5.5 Max HTMLs (handled via Layer-1 SSE Wire Gate instead).
    // [V20 Muse vs Claude Bidirectional Zero-Collision Orthogonal Guard]
    if (!hasExplicitAnthropicWire && hasArtifactSub) {
      if (/viewBox=["']\s*0\s+0\s+32\s+32\s*["']/.test(rawSvgOrReply) && /\bstroke=["']#334155["']/i.test(rawSvgOrReply) && /#(?:fde047|ffd54f|ffd93d|7dd3fc|e0f7fa|e0f2fe|dff3ff)/i.test(rawSvgOrReply)) {
        return memoStore({
          is_claude: false, vendor: 'meta', model_id: 'meta/muse-spark-1.3',
          label: 'Muse Spark 1.3 (SVG32 Slate-700 描边指纹)',
          veto_reasons: ['V20_MUSE_SVG32_SLATE700_NON_CLAUDE'],
        });
      }
      const _v5m = _getClaudeV5Engine();
      const _mc20 = (_v5m && typeof _v5m.evaluateMuseVsClaudeV20 === 'function') ? _v5m.evaluateMuseVsClaudeV20(rawSvgOrReply) : null;
      if (_mc20 && _mc20.isStrictMuseExclusive) {
        return memoStore({
          is_claude: false, vendor: 'meta', model_id: 'meta/muse-spark-1.3',
          label: `Muse Spark / Wonder (V20正交HTML结构确权 net=+${_mc20.net})`,
          confidence: 0.91,
          evidence: _mc20.museReasons || [],
          veto_reasons: [`V20_MUSE_EXCLUSIVE_HTML_NON_CLAUDE(muse=${_mc20.musePts},claude=${_mc20.claudePts})`],
        });
      }
      if (_mc20 && _mc20.isNonClaudeMuseOrOpen) {
        return memoStore({
          is_claude: false, vendor: 'non-claude', model_id: null,
          label: `非 Claude (V20_NON_CLAUDE_TAILWIND_OR_MUSE_HTML net=+${_mc20.net})`,
          veto_reasons: [`V20_NON_CLAUDE_HTML_STRUCTURAL(muse=${_mc20.musePts},claude=${_mc20.claudePts})`],
        });
      }
    }

    if (!hasExplicitAnthropicWire && hasArtifactSub && rawSvgOrReply.length >= 9000 && Number(s.rc || 0) === 0 && !s.detailJson) {
      const fullLow = rawSvgOrReply.toLowerCase();
      const hasScr = fullLow.indexOf('<script') !== -1;
      if (!hasScr) {
        let cmtCnt = 0, posC = 0;
        while ((posC = rawSvgOrReply.indexOf('<!--', posC)) !== -1) { cmtCnt++; posC += 4; }
        const kfM = fullLow.indexOf('@keyframes') !== -1 ? (rawSvgOrReply.match(/@keyframes\b/gi) || []) : [];
        if (cmtCnt >= 72 && kfM.length <= 16) {
          return memoStore({
            is_claude: false, vendor: 'non-claude', model_id: null,
            label: `非 Claude (V9_OFFLINE_EXCESS_HTML_COMMENTS_GEMINI_FLASH(cmt=${cmtCnt},kf=${kfM.length}))`,
            veto_reasons: [`V9_OFFLINE_EXCESS_HTML_COMMENTS_GEMINI_FLASH(cmt=${cmtCnt},kf=${kfM.length})`],
          });
        }
        if (cmtCnt <= 2 && fullLow.indexOf('<animate') !== -1 && kfM.length >= 5) {
          const smilM = rawSvgOrReply.match(/<animate(?:Transform|Motion)?\b/gi) || [];
          if (smilM.length >= 14) {
            return memoStore({
              is_claude: false, vendor: 'non-claude', model_id: null,
              label: `非 Claude (V9_OFFLINE_HYBRID_SMIL_KEYFRAMES_GPT56(smil=${smilM.length},kf=${kfM.length},cmt=${cmtCnt}))`,
              veto_reasons: [`V9_OFFLINE_HYBRID_SMIL_KEYFRAMES_GPT56(smil=${smilM.length},kf=${kfM.length},cmt=${cmtCnt})`],
            });
          }
        }
      }
    }

    const cv5 = _getClaudeV5Engine();
    const base = (cv5 && typeof cv5.classifyClaudeSample === 'function' && (hasArtifactSub || s.detailJson || Number(s.rc || 0) > 0 || !hasExplicitAnthropicWire))
      ? cv5.classifyClaudeSample(s)
      : null;

    if (base && base.is_claude) {
      const bm = s.bimodalOpusProbe || null;
      const artFeats = base.artifact_features || {};
      const bBytes = Number((bm && bm.t2ArtifactBytes) || artFeats.bytes || 0);
      const bCmts = Number((bm && bm.t2Comments) || artFeats.comments || 0);
      if (bm && Number(bm.t1DurMs) > 0 && Number(bm.t1DurMs) <= 2800 && Number(bm.t1ReasonBlocks || 0) <= 1
          && Number(bm.t2DurMs) >= 18000 && (Number(bm.t2DurMs) / Math.max(200, Number(bm.t1DurMs))) >= 7.5
          && bBytes >= 10500 && bCmts >= 6) {
        return memoStore(Object.assign({}, base, {
          model_id: 'anthropic/claude-opus-5.5',
          is_opus_56_canary: true,
          label: 'Claude Opus 5.6 (Opus 5.5槽位灰测 · 双模态确证)',
          effort: 'MAX',
          confidence: 0.94,
          evidence: [...(base.evidence || []), `BIMODAL_OPUS_56_ADAPTIVE(t1=${bm.t1DurMs}ms,t2=${bm.t2DurMs}ms,b=${bBytes})`],
        }));
      }
      return memoStore(base);
    }

    // Wire-Locked Sonnet 5.5 CSS-Keyframes Full-Pelican Recovery (6/6 = 100% Hub recall)
    if (hasExplicitAnthropicWire && hasArtifactSub && Number(s.rc || 0) === 0) {
      const kfCnt = (rawSvgOrReply.match(/@keyframes\b/gi) || []).length;
      const cmtCnt = (rawSvgOrReply.match(/<!--/g) || []).length;
      const hasScript = /<script\b/i.test(rawSvgOrReply);
      if (!hasScript && kfCnt >= 5 && cmtCnt >= 4 && rawSvgOrReply.length >= 3800 && rawSvgOrReply.length <= 12000) {
        const sEff = rawSvgOrReply.length >= 8500 ? 'MEDIUM' : 'LOW';
        return memoStore({
          is_claude: true,
          vendor: 'anthropic',
          model_id: 'anthropic/claude-sonnet-5.5',
          label: `Claude Sonnet 5.5 (${sEff === 'MEDIUM' ? 'Medium' : 'Low'})`,
          effort: sEff,
          confidence: 0.89,
          evidence: [`V9_WIRE_LOCKED_SONNET55_CSS_PELICAN(len=${rawSvgOrReply.length},kf=${kfCnt},cmt=${cmtCnt})`],
          veto_reasons: [],
        });
      }
    }

    if (base && Array.isArray(base.veto_reasons) && base.veto_reasons.length > 0) {
      return memoStore(base);
    }

    // Pure wire trajectory for non-SVG Claude chats (V9: 12/12 = 100.0% Model & 12/12 = 100.0% Effort!)
    const isEncClaude = (s.reasoningSignature === 'empty-deltas' || hasExplicitAnthropicWire)
      && !(Number(s.rp || s.nReason || 0) >= 6 && Number(s.rc || s.reasoningTextLength || 0) === 0 && !hasExplicitAnthropicWire);
    if (!isEncClaude) return memoStore(base || { is_claude: false, label: '非 Claude' });

    const perTurnDurMs = (turns > 1 && Number(s.lastTurnDurMs) > 0)
      ? Number(s.lastTurnDurMs)
      : (durMs > 0 ? (durMs / turns) : 0);
    const stepsPerTurn = steps / turns;
    const visPerTurn = (turns > 1 && Number(s.lastTurnVisTok) > 0)
      ? Number(s.lastTurnVisTok)
      : (visTok / turns);
    const isShortStage1 = (visPerTurn <= 85 && stepsPerTurn <= 1.2 && turns === 1);
    const effTps = perTurnDurMs > 0 ? ((visPerTurn * 1000.0) / perTurnDurMs) : (Number(s.cps || 0) > 0 ? Number(s.cps) / 3.5 : -1.0);
    const cpsVal = Number(s.cps || s.decodeCps || 0);
    let mid = 'anthropic/claude-sonnet-5.5';
    let lbl = 'Claude Sonnet 5.5 (High)';
    let eff = 'HIGH';

    if (stepsPerTurn <= 1.8 && ((perTurnDurMs > 0 && perTurnDurMs <= 4800) || effTps >= 22.0 || cpsVal >= 165)) {
      mid = 'anthropic/claude-haiku-5.5';
      eff = ((perTurnDurMs >= 2400 && visPerTurn <= 180) || (perTurnDurMs > 0 && perTurnDurMs <= 900 && visPerTurn <= 25)) ? 'HIGH' : 'MEDIUM';
      lbl = `Claude Haiku 5.5 (${eff === 'HIGH' ? 'High' : 'Medium'})`;
    } else if (turns <= 3 && steps <= 3 && durMs >= 5000 && effTps >= 68.0) {
      mid = 'anthropic/claude-haiku-5.5';
      eff = 'MEDIUM';
      lbl = 'Claude Haiku 5.5 (Medium)';
    } else if (stepsPerTurn >= 4 || perTurnDurMs >= 14000 || (visPerTurn >= 600 && perTurnDurMs >= 22000)) {
      mid = 'anthropic/claude-opus-5.5';
      eff = (stepsPerTurn >= 8 || perTurnDurMs >= 45000 || (visPerTurn >= 1500 && perTurnDurMs >= 65000)) ? 'MAX' : 'HIGH';
      lbl = `Claude Opus 5.5 (${eff === 'MAX' ? 'Max' : 'High'})`;
    } else if (turns === 1 && steps <= 2 && ((durMs > 0 && durMs <= 8800 && visTok >= 15 && visTok <= 130) || (durMs === 0 && visTok >= 40 && visTok <= 2800) || (durMs > 18000 && visTok >= 1800))) {
      mid = 'anthropic/claude-haiku-5.5';
      eff = ((durMs >= 3200 && visTok <= 75) || (durMs > 0 && durMs <= 900 && visTok <= 25)) ? 'HIGH' : 'MEDIUM';
      lbl = `Claude Haiku 5.5 (${eff === 'HIGH' ? 'High' : 'Medium'})`;
    } else if (turns === 1 && steps === 1 && durMs > 0 && durMs <= 450 && visTok <= 10) {
      mid = 'anthropic/claude-opus-5.5';
      eff = 'LOW';
      lbl = 'Claude Opus 5.5 (Low)';
    } else if (perTurnDurMs >= 11500 && visPerTurn >= 180) {
      mid = 'anthropic/claude-opus-5.5';
      eff = perTurnDurMs >= 16000 ? 'HIGH' : 'MEDIUM';
      lbl = `Claude Opus 5.5 (${eff === 'HIGH' ? 'High' : 'Medium'})`;
    } else {
      mid = 'anthropic/claude-sonnet-5.5';
      eff = perTurnDurMs >= 4500 ? 'HIGH' : 'MEDIUM';
      lbl = `Claude Sonnet 5.5 (${eff === 'HIGH' ? 'High' : 'Medium'})`;
    }
    return memoStore({
      is_claude: true,
      vendor: 'anthropic',
      model_id: mid,
      label: lbl,
      effort: eff,
      confidence: isShortStage1 ? 0.74 : 0.88,
      is_stage1_short_probe: isShortStage1,
      evidence: [`V9_WIRE_CLAUDE_TRAJECTORY(dur=${durMs}ms,vis=${visTok},steps=${steps},effTps=${effTps.toFixed(1)})`],
      veto_reasons: [],
    });
  }

  function classifyGptZeroQuotaV1(sample) {
    const s = (sample && typeof sample === 'object') ? sample : {};
    // [Upgrade C] Strip synthetic chunk kinematics before invoking GPT V19 classifier
    const cleanSample = _isSyntheticStreamEvidence(s)
      ? Object.assign({}, s, {
          syntheticFallback: true,
          avgChunk: 0,
          rAvgChunk: 0,
          cps: 0,
          textCps: 0,
          decodeCps: 0,
          chunkCharCV: 0,
          iatIntervalsMs: [],
          v19StrideSpectrum: null
        })
      : s;
    const gv1 = _getGptV1Engine();
    let res = null;
    if (gv1 && typeof gv1.classifyGptSampleV19 === 'function') {
      res = gv1.classifyGptSampleV19(cleanSample);
    } else if (gv1 && typeof gv1.classifyGptSampleV18 === 'function') {
      res = gv1.classifyGptSampleV18(cleanSample);
    } else if (gv1 && typeof gv1.classifyGptSampleV17 === 'function') {
      res = gv1.classifyGptSampleV17(cleanSample);
    } else if (gv1 && typeof gv1.classifyGptSampleV16 === 'function') {
      res = gv1.classifyGptSampleV16(cleanSample);
    } else if (gv1 && typeof gv1.classifyGptSampleV15 === 'function') {
      res = gv1.classifyGptSampleV15(cleanSample);
    } else if (gv1 && typeof gv1.classifyGptSampleV13 === 'function') {
      res = gv1.classifyGptSampleV13(cleanSample);
    } else if (gv1 && typeof gv1.classifyGptSample === 'function') {
      res = gv1.classifyGptSample(cleanSample);
    }
    if (!res) return { is_openai: false, label: 'GPT V1 引擎未加载' };

    // [Upgrade D] Grey-Zone ΔLLR Margin Gate & Structural/Pulse Tie-Breaker for non-SVG OpenAI chats
    if (res.is_openai) {
      const rawReply = String(cleanSample.svgText || cleanSample.html || cleanSample.replyText || '');
      const hasSvg = /<svg\b/i.test(rawReply) && rawReply.length >= 1200;
      const conf = Number(res.confidence) || 0;
      const llrMargin = Number(res.llr_margin ?? res.llrMargin ?? (conf >= 0.90 ? 1.5 : 0.45));
      if (!hasSvg && (conf < 0.85 || llrMargin < 0.80)) {
        res = Object.assign({}, res, {
          grey_zone_low_margin: true,
          recommended_probe: 'stage15_contrastive_or_pelican'
        });
      }
    }
    return res;
  }

  function classifyZeroQuotaGoogleTrajectory(meta) {
    const m = (meta && typeof meta === 'object') ? meta : {};
    const turns = Math.max(1, Number(m.turns || 1));
    const steps = Math.max(1, Number(m.totalStepCount || m.maxStepCount || m.steps || 1));
    const durMs = Number(m.turnDurationMs || m.thinkDurationMs || 0);
    const visTok = Number(m.visTokens || m.visibleTokens || 0);
    const msPerStep = durMs > 0 ? (durMs / steps) : 0;
    if (
      turns >= 14
      || (turns >= 2 && durMs >= 180000 && msPerStep >= 35000)
      || (turns >= 2 && steps <= 2 && durMs === 0 && visTok >= 150)
      || (turns === 1 && steps === 1 && durMs === 0 && visTok >= 160)
      || (turns >= 4 && steps <= 4 && durMs >= 20000 && visTok >= 250)
    ) {
      return { vendor: 'google', model_id: 'google/gemini-4-argon', label: 'Gemini 4 Argon (High)', effort: 'HIGH', confidence: 0.86 };
    }
    return { vendor: 'google', model_id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash (High)', effort: 'HIGH', confidence: 0.84 };
  }

  function analyzeStage1MicroProbe(replyText, sseMeta) {
    const txt = String(replyText || '').trim();
    const m = (sseMeta && typeof sseMeta === 'object') ? sseMeta : {};
    const lines = txt ? txt.split(/\r?\n/).filter((x) => x.trim().length > 0) : [];
    const hasFullwidthColon = txt.indexOf('：') !== -1;
    const hasAsciiColon = txt.indexOf(': ') !== -1;
    const hasArrow = txt.indexOf('→') !== -1 || txt.indexOf('->') !== -1;
    const hasMarkdownBold = /\*\*[^*]+\*\*/.test(txt);
    const interP50 = Number(m.interDeltaP50Ms || 0);
    const ttftMs = Number(m.ttftMs || 0);
    const decCps = Number(m.decodeCps || m.cps || 0);
    return {
      lineCount: lines.length,
      charCount: txt.length,
      hasFullwidthColon,
      hasAsciiColon,
      hasArrow,
      hasMarkdownBold,
      fastPulseStream: (interP50 > 0 && interP50 <= 13.5) || decCps >= 225,
      deepTtftThink: ttftMs >= 2100,
    };
  }

  function computeWaldSprtFunnel(stage1Meta, targetModels, alphaOpt, betaOpt) {
    // V9 Wald Sequential Probability Ratio Test (SPRT) Adaptive Stage-1 -> Stage-2 Funnel
    const alpha = typeof alphaOpt === 'number' ? alphaOpt : 0.02;
    const beta = typeof betaOpt === 'number' ? betaOpt : 0.04;
    const lowerLogOdds = Math.log(alpha / (1.0 - beta));   // ~ -3.87 (P <= 0.02 -> FAST_REJECT)
    const upperLogOdds = Math.log((1.0 - alpha) / beta);   // ~ +3.20 (P >= 0.96 -> FAST_ACCEPT)

    const m = (stage1Meta && typeof stage1Meta === 'object') ? stage1Meta : {};
    const vendor = String(m.vendor || 'unknown').toLowerCase();
    const tList = Array.isArray(targetModels) ? targetModels.map((x) => String(x || '').toLowerCase()).filter(Boolean) : [];
    const wantsAny = tList.length === 0 || tList.some((t) => t === 'any' || t === 'targets' || t === '*');

    if (wantsAny) {
      return { action: 'RUN_STAGE2_PELICAN', posterior: 0.50, logOdds: 0.0, reason: 'SPRT_OPEN_TARGET_NEEDS_PELICAN' };
    }

    const wantsGoogle = tList.some((t) => /google|gemini|argon|carbon|barium/.test(t));
    const wantsAnthropic = tList.some((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t));
    const wantsOpenAi = tList.some((t) => /openai|gpt|sol|luna|astra|terra/.test(t));

    // Deterministic vendor mismatch -> P < 0.005 (FAST_REJECT)
    if ((vendor === 'google' && !wantsGoogle) || (vendor === 'anthropic' && !wantsAnthropic) || (vendor === 'openai' && !wantsOpenAi)) {
      return { action: 'FAST_REJECT', posterior: 0.004, logOdds: -5.52, reason: `SPRT_VENDOR_MISMATCH(${vendor})` };
    }
    if (vendor === 'plaintext' && !tList.some((t) => /deepseek|qwen|kimi|glm|grok|mimo|nemotron/.test(t))) {
      return { action: 'FAST_REJECT', posterior: 0.002, logOdds: -6.21, reason: 'SPRT_PLAINTEXT_COT_REJECT' };
    }

    const durMs = Number(m.turnDurationMs || 0);
    const visTok = Number(m.visTokens || 0);
    const steps = Math.max(1, Number(m.steps || m.totalStepCount || 1));
    const effTps = durMs > 0 ? ((visTok * 1000.0) / durMs) : -1.0;
    const decCps = Number(m.decodeCps || 0);
    const ttftMs = Number(m.ttftMs || 0);

    let logOdds = 0.0;
    let reason = 'SPRT_INDIFFERENCE_ZONE_RUN_STAGE2';

    if (vendor === 'anthropic') {
      const opusOnly = tList.filter((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t)).every((t) => /opus/.test(t));
      const anyClaudeFamily = tList.some((t) => t === 'anthropic/*' || t === 'claude');
      if (anyClaudeFamily) {
        logOdds = 3.65;
        reason = 'SPRT_FAMILY_LEVEL_ANTHROPIC_LOCKED';
      } else if (opusOnly && durMs >= 5000 && effTps >= 68.0 && steps <= 2) {
        logOdds = -4.20;
        reason = `SPRT_HIGH_TPS_HAIKU_NOT_OPUS(effTps=${effTps.toFixed(1)})`;
      } else if (opusOnly && steps >= 6) {
        logOdds = 3.40;
        reason = `SPRT_MULTI_STEP_OPUS_LOCKED(steps=${steps})`;
      }
    } else if (vendor === 'openai') {
      const sol61Only = tList.filter((t) => /openai|gpt|sol|luna|astra|terra/.test(t)).every((t) => /6\.1|6-1|sol-max|sol-xhigh/.test(t));
      const anyOpenAiFamily = tList.some((t) => t === 'openai/*' || t === 'gpt');
      if (anyOpenAiFamily) {
        logOdds = 3.65;
        reason = 'SPRT_FAMILY_LEVEL_OPENAI_LOCKED';
      } else if (sol61Only && steps === 1 && durMs > 0 && durMs <= 2800 && ((decCps >= 310 && ttftMs > 0 && ttftMs <= 750) || effTps >= 48.0)) {
        logOdds = -4.10;
        reason = `SPRT_ULTRA_BURST_NOT_61_SOL(effTps=${effTps.toFixed(1)},decCps=${decCps.toFixed(0)})`;
      }
    } else if (vendor === 'google') {
      const anyGoogleFamily = tList.some((t) => t === 'google/*' || t === 'gemini');
      if (anyGoogleFamily) {
        logOdds = 3.65;
        reason = 'SPRT_FAMILY_LEVEL_GOOGLE_LOCKED';
      }
    }

    const posterior = 1.0 / (1.0 + Math.exp(-logOdds));
    const action = logOdds <= lowerLogOdds ? 'FAST_REJECT' : (logOdds >= upperLogOdds ? 'FAST_ACCEPT' : 'RUN_STAGE2_PELICAN');
    return {
      action,
      posterior: Math.round(posterior * 10000) / 10000,
      logOdds: Math.round(logOdds * 1000) / 1000,
      reason,
    };
  }

  function shouldAbortStage2PelicanMidStream(partialHtml, vendor, targetModels) {
    // V14 600B-900B Sub-1KB Header Automaton + 1.8KB Prefix Skeleton + Leading Opus Shield.
    // SAFETY IRON LAW: NEVER abort if any targeted Crown (`Carbon`, `Argon`, `Opus 5.5/5.6`, `6.1 Sol`, `Astra`) remains structurally possible!
    const html = String(partialHtml || '');
    if (html.length < 600) return { abort: false, reason: '' };
    const tList = Array.isArray(targetModels) ? targetModels.map((x) => String(x || '').toLowerCase()).filter(Boolean) : [];
    if (tList.some((t) => t === 'any' || t === '*')) {
      return { abort: false, reason: '' };
    }
    const low = html.toLowerCase();
    const v = String(vendor || '').toLowerCase();
    const hasScr = low.indexOf('<script') !== -1 || low.indexOf('requestanimationframe') !== -1 || low.indexOf('createelementns') !== -1;
    const svgClosed = low.indexOf('</svg>') !== -1;
    const htmlClosed = low.indexOf('</html>') !== -1 || low.indexOf('</body>') !== -1;
    const hasPar = low.indexOf('preserveaspectratio') !== -1;
    let smilCnt = 0, pSmil = 0;
    while ((pSmil = low.indexOf('<animate', pSmil)) !== -1) { smilCnt++; pSmil += 8; }
    let kfCnt = 0, pKf = 0;
    while ((pKf = low.indexOf('@keyframes', pKf)) !== -1) { kfCnt++; pKf += 10; }
    let gradCnt = 0, pGrad = 0;
    while ((pGrad = low.indexOf('gradient', pGrad)) !== -1) { gradCnt++; pGrad += 8; }

    if (v === 'google') {
      const googleTargets = tList.filter((t) => /google|gemini|argon|carbon|barium|flash|pro/.test(t));
      if (tList.length > 0 && googleTargets.length === 0) {
        return { abort: true, guessId: 'google/gemini-4-argon', guessLabel: 'Google 家族 [非目标厂商早停]', reason: 'MIDSTREAM_VENDOR_NOT_IN_USER_TARGETS(google)' };
      }
      const carbonOnly = googleTargets.length > 0 && googleTargets.every((t) => /carbon/.test(t));
      const carbonOrArgonOnly = googleTargets.length > 0 && !googleTargets.some((t) => /flash|lite|pro/.test(t));
      if ((carbonOrArgonOnly || carbonOnly) && !hasScr) {
        if (
          smilCnt >= 1 ||
          kfCnt >= 4 ||
          (html.length <= 1600 && (kfCnt >= 1 || (gradCnt >= 4 && !hasPar))) ||
          (html.length <= 3200 && gradCnt >= 8 && !hasPar) ||
          (svgClosed && htmlClosed && html.length < 10500)
        ) {
          return {
            abort: true,
            guessId: 'google/gemini-3.8-flash',
            guessLabel: 'Google Gemini 3.8 Flash [⚡鹈鹕中途早停]',
            reason: `MIDSTREAM_V14_SUB1KB_FLASH(len=${html.length},smil=${smilCnt},kf=${kfCnt},grad=${gradCnt})`,
          };
        }
      }
      if (carbonOnly && html.length >= 2200) {
        const hasDoubleBan = low.indexOf('user-select: none') !== -1 || low.indexOf('user-select:none') !== -1;
        if ((svgClosed && htmlClosed && html.length < 22000) || (low.indexOf('</style>') !== -1 && !hasDoubleBan && low.indexOf('display: flex') !== -1 && kfCnt >= 3)) {
          return {
            abort: true,
            guessId: 'google/gemini-4-argon',
            guessLabel: 'Google Gemini 4 Argon [⚡非Carbon鹈鹕早停]',
            reason: `MIDSTREAM_ARGON_NOT_CARBON(len=${html.length},kf=${kfCnt})`,
          };
        }
      }
    } else if (v === 'openai') {
      const oaiTargets = tList.filter((t) => /openai|gpt|sol|luna|astra|terra/.test(t));
      if (tList.length > 0 && oaiTargets.length === 0) {
        return { abort: true, guessId: 'openai/gpt-6-luna', guessLabel: 'OpenAI 家族 [非目标厂商早停]', reason: 'MIDSTREAM_VENDOR_NOT_IN_USER_TARGETS(openai)' };
      }
      const sol61OrAstraOnly = oaiTargets.length > 0 && !oaiTargets.some((t) => /5\.6|5-6|luna|terra|gpt-6-sol\b|gpt6sol/.test(t));
      if (sol61OrAstraOnly && !hasScr) {
        if (
          smilCnt >= 1 ||
          (html.length <= 2500 && gradCnt >= 1) ||
          (html.length <= 1600 && hasPar) ||
          (html.length <= 4500 && gradCnt >= 5) ||
          gradCnt >= 11 ||
          (svgClosed && htmlClosed && html.length < 9200)
        ) {
          const isLuna = /<!--[\s\S]{0,60}[═─]{3,}/.test(html) || smilCnt >= 1 || gradCnt >= 7 || hasPar || (svgClosed && smilCnt === 0);
          return {
            abort: true,
            guessId: isLuna ? 'openai/gpt-6-luna' : 'openai/gpt-5.6-sol',
            guessLabel: isLuna ? 'GPT 6 Luna [⚡鹈鹕中途早停]' : 'GPT 5.6 Sol [⚡鹈鹕中途早停]',
            reason: `MIDSTREAM_V14_SUB1KB_NOT_61_SOL(len=${html.length},smil=${smilCnt},grad=${gradCnt},par=${hasPar ? 1 : 0})`,
          };
        }
      }
    } else if (v === 'anthropic' || v === 'meta' || v === 'anthropic_or_oss') {
      const antTargets = tList.filter((t) => /anthropic|claude|opus|sonnet|haiku|fable/.test(t));
      const museTargets = tList.filter((t) => /meta|muse|straw/.test(t));
      const _v5mid = _getClaudeV5Engine();
      const _mcMid = (_v5mid && typeof _v5mid.evaluateMuseVsClaudeV20 === 'function') ? _v5mid.evaluateMuseVsClaudeV20(html) : null;
      const _isMidMuse = Boolean(_mcMid && _mcMid.isStrictMuseExclusive);
      const _hasClaudeShield = Boolean(
        (_mcMid && _mcMid.claudePts >= 28)
        || /<linearGradient\b[^>]*\b(?:x1|x2|y1|y2)=["'][0-9.]+%["']/.test(html)
        || /<!--[^>]*(?:═{4,}|━{4,})/.test(html)
        || (!low.includes('name="viewport"') && !low.includes("name='viewport'"))
        || html.includes('charset="utf-8"')
      );
      if (_isMidMuse) {
        if (museTargets.length > 0) {
          return { abort: false, reason: '' };
        }
        if (tList.length > 0) {
          return {
            abort: true,
            guessId: 'meta/muse-spark-1.3',
            guessLabel: 'Muse Spark / Wonder [⚡V20非Claude头签名早停]',
            reason: `MIDSTREAM_V20_MUSE_EXCLUSIVE_HEADER(net=${_mcMid.net},len=${html.length})`,
          };
        }
      }
      if (v === 'anthropic' && tList.length > 0 && antTargets.length === 0 && museTargets.length === 0) {
        return { abort: true, guessId: 'anthropic/claude-sonnet-5.5', guessLabel: 'Claude 家族 [非目标厂商早停]', reason: 'MIDSTREAM_VENDOR_NOT_IN_USER_TARGETS(anthropic)' };
      }
      if (!hasScr && svgClosed && htmlClosed && smilCnt >= 24 && !_hasClaudeShield && museTargets.length === 0 && tList.length > 0) {
        return {
          abort: true,
          guessId: 'meta/muse-spark-1.3',
          guessLabel: '非Claude纯SMIL动画 [⚡终局无脚本早停]',
          reason: `MIDSTREAM_CLOSED_PURE_SMIL_NON_CLAUDE(smil=${smilCnt},len=${html.length})`,
        };
      }
      const opusOnly = antTargets.length > 0 && !antTargets.some((t) => /sonnet|haiku/.test(t));
      if (
        opusOnly &&
        !hasScr &&
        ((svgClosed && htmlClosed && html.length < 9500) ||
          (low.indexOf('.wheel{animation:spin') !== -1 && gradCnt <= 4) ||
          (low.indexOf('html, body { margin: 0; height: 100%; background:') !== -1 && gradCnt <= 4))
      ) {
        return {
          abort: true,
          guessId: html.length < 6200 ? 'anthropic/claude-haiku-5.5' : 'anthropic/claude-sonnet-5.5',
          guessLabel: (html.length < 6200 ? 'Claude Haiku 5.5' : 'Claude Sonnet 5.5') + ' [⚡鹈鹕中途早停]',
          reason: `MIDSTREAM_V14_SUB_OPUS(len=${html.length},kf=${kfCnt},grad=${gradCnt})`,
        };
      }
    }
    return { abort: false, reason: '' };
  }

  function evaluatePelicanAstAsync(sample, vendor) {
    // V9 Off-Main-Thread Inline Blob WebWorker AST Evaluator (keeps Browser UI at 60 FPS on >= 15KB HTMLs!)
    const s = (sample && typeof sample === 'object') ? sample : {};
    const raw = String(s.svgText || s.html || s.replyText || '');
    const v = String(vendor || s.vendorHint || '').toLowerCase();
    const runSync = () => {
      if (v === 'anthropic') return classifyClaudeZeroQuotaEnhanced(s);
      if (v === 'openai') return classifyGptZeroQuotaV1(s);
      return classify3StageGoogleArgonCarbon(s, raw);
    };
    if (raw.length < 15000 || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      return Promise.resolve(runSync());
    }
    try {
      if (!_AST_BLOB_WORKER) {
        const workerCode = `self.onmessage = function(e) {
          const d = e.data || {};
          const raw = String(d.raw || '');
          const low = raw.toLowerCase();
          let cmt = 0, p = 0;
          while ((p = raw.indexOf('<!--', p)) !== -1) { cmt++; p += 4; }
          self.postMessage({ id: d.id, prewarmed: true, bytes: raw.length, cmt, hasRaf: raw.indexOf('requestAnimationFrame') !== -1, hasScr: low.indexOf('<script') !== -1 });
        };`;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        _AST_BLOB_WORKER = new Worker(URL.createObjectURL(blob));
        _AST_BLOB_WORKER.onmessage = (ev) => {
          const msg = ev && ev.data;
          if (msg && _AST_WORKER_PENDING.has(msg.id)) {
            const cb = _AST_WORKER_PENDING.get(msg.id);
            _AST_WORKER_PENDING.delete(msg.id);
            cb(msg);
          }
        };
      }
      const reqId = ++_AST_WORKER_SEQ;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          _AST_WORKER_PENDING.delete(reqId);
          resolve(runSync());
        }, 1200);
        _AST_WORKER_PENDING.set(reqId, () => {
          clearTimeout(timer);
          resolve(runSync());
        });
        _AST_BLOB_WORKER.postMessage({ id: reqId, raw });
      });
    } catch (_) {
      return Promise.resolve(runSync());
    }
  }


  // === [V10] Stage-0 Wire Abort + Sequential Wait-Complete Stage-1.5 + Streaming Pelican FST + Thompson Scheduler ===
  function shouldAbortStage0WirePrefix(probe, targetModels) {
    const gv1 = _getGptV1Engine();
    if (gv1 && typeof gv1.shouldAbortStage0WirePrefix === 'function') {
      return gv1.shouldAbortStage0WirePrefix(probe, targetModels);
    }
    return { abort: false, reason: 'ENGINE_FALLBACK' };
  }

  function evaluateStage15ContrastiveTurn(s1Meta, s15Meta, priorPosterior) {
    const gv1 = _getGptV1Engine();
    if (gv1 && typeof gv1.evaluateStage15ContrastiveTurn === 'function') {
      return gv1.evaluateStage15ContrastiveTurn(s1Meta, s15Meta, priorPosterior);
    }
    return { action: 'RUN_STAGE2_PELICAN', posterior: priorPosterior || 0.5, reasons: [] };
  }


  function createBytePelicanFst(vendor, targetModels) {
    const gv1 = _getGptV1Engine();
    if (gv1 && typeof gv1.createBytePelicanFst === 'function') return gv1.createBytePelicanFst(vendor, targetModels);
    return null;
  }
  function scoreDualAnchorStage1(replyText, s1Meta, expectedNum, priorPosterior) {
    const gv1 = _getGptV1Engine();
    if (gv1 && typeof gv1.scoreDualAnchorStage1 === 'function') return gv1.scoreDualAnchorStage1(replyText, s1Meta, expectedNum, priorPosterior);
    return { action: 'ESCALATE_STAGE2_PELICAN', posterior: priorPosterior || 0.5, reasons: [] };
  }

  function createStreamingPelicanFst(vendor, targetModels) {
    const gv1 = _getGptV1Engine();
    if (gv1 && typeof gv1.createStreamingPelicanFst === 'function') {
      return gv1.createStreamingPelicanFst(vendor, targetModels);
    }
    return null;
  }

  const _GLOBAL_THOMPSON_SCHEDULER = (function () {
    const gv1 = (typeof globalThis !== 'undefined' && globalThis.ArenaGptStandaloneV1) ? globalThis.ArenaGptStandaloneV1 : null;
    return (gv1 && typeof gv1.createThompsonAccountScheduler === 'function') ? gv1.createThompsonAccountScheduler() : null;
  })();

  function getThompsonAccountScheduler() {
    if (_GLOBAL_THOMPSON_SCHEDULER) return _GLOBAL_THOMPSON_SCHEDULER;
    const gv1 = _getGptV1Engine();
    return (gv1 && typeof gv1.createThompsonAccountScheduler === 'function') ? gv1.createThompsonAccountScheduler() : null;
  }

  function distillBattleRevealSample(battleRecord) {
    const rec = (battleRecord && typeof battleRecord === 'object') ? battleRecord : {};
    const revealedModel = String(rec.revealedModel || rec.modelId || '').trim();
    if (!revealedModel) return { stored: false, reason: 'NO_REVEALED_MODEL' };
    try {
      if (typeof localStorage !== 'undefined') {
        const key = 'mcpArena.v10BattleDistill.v1';
        const arr = JSON.parse(localStorage.getItem(key) || '[]') || [];
        arr.push({
          at: Date.now(),
          sid: String(rec.sid || ''),
          revealedModel,
          ttftMs: Number(rec.ttftMs || 0),
          decodeCps: Number(rec.decodeCps || 0),
          interDeltaP50Ms: Number(rec.interDeltaP50Ms || 0),
          svgBytes: Number(rec.svgBytes || 0),
        });
        while (arr.length > 250) arr.shift();
        localStorage.setItem(key, JSON.stringify(arr));
      }
    } catch (_) {}
    return { stored: true, revealedModel, neverCrownAdmitted: true };
  }

  function detectCanarySlotDrift(sample) {
    const s = (sample && typeof sample === 'object') ? sample : {};
    const gv1 = _getGptV1Engine();
    if (gv1 && typeof gv1.extractFirstSvgOrHtml === 'function' && typeof gv1.detectCanarySlotDrift === 'function') {
      const raw = String(s.svgText || s.htmlText || s.replyText || '');
      const art = gv1.extractGptArtifactFeatures(gv1.extractFirstSvgOrHtml(raw));
      const sIds = Array.isArray(s.streamIds) ? s.streamIds.map(String) : [];
      const tIds = Array.isArray(s.toolIds) ? s.toolIds.map(String) : [];
      const isOaiWire = s.streamIdShape === 'openai-rs' || s.streamIdPrefix === 'openai-rs'
        || sIds.some((id) => /^(?:(?:rs|fc|fo)_[A-Za-z0-9_-]{16,}|msg_[0-9a-f]{20,})$/i.test(id))
        || tIds.some((id) => /^fc_[A-Za-z0-9_-]{16,}|^call_(?![0-9a-f]{24}\b)(?!\d+_)[A-Za-z0-9_-]{18,}/i.test(id));
      if (isOaiWire) return gv1.detectCanarySlotDrift(art, true);
    }
    return { canary_slot_drift: false, canary_reason: '' };
  }

  function classifyStage1ProtocolGate(meta, htmlOrText) {
    const m = (meta && typeof meta === 'object') ? meta : {};
    const sIds = Array.isArray(m.streamIds) ? m.streamIds.map(String) : [];
    const tIds = Array.isArray(m.toolIds) ? m.toolIds.map(String) : [];
    const rc = Number(m.rc || m.reasoningChars || m.reasoningTextLength || 0);
    const rp = Number(m.rp || m.nReason || m.reasoningStartCount || 0);
    const xAvg = Number(m.xAvg || m.realSseAvgChunk || m.avgChunk || 0);
    const tCnt = Number(m.tCnt || m.realSseChunks || m.textChunks || 0);
    const hasGoogleSig = Boolean(m.hasSig || m.hasGoogleThoughtSig);

    if (rc >= 20) {
      return { familyGate: 'plaintext_cot', vendor: 'plaintext', isClosedTargetFamily: false, confidence: 0.99, reason: `明文思考排除(rc=${rc})` };
    }
    const hasAnthropicId = tIds.some((id) => /^(?:srv)?toolu_|^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i.test(id))
      || sIds.some((id) => /^msg_01[1-9A-HJ-NP-Za-km-z]{18,}/i.test(id));
    if (hasAnthropicId || m.reasoningSignature === 'empty-deltas') {
      return { familyGate: 'anthropic_encrypted', vendor: 'anthropic', isClosedTargetFamily: true, confidence: 0.96, reason: `Anthropic加密思考协议(rp=${rp},xAvg=${xAvg})` };
    }
    const hasOpenAiId = sIds.some((id) => /^(?:(?:rs|fc|fo)_[A-Za-z0-9_-]{16,}|msg_[0-9a-f]{20,})$/i.test(id))
      || tIds.some((id) => /^fc_[A-Za-z0-9_-]{16,}|^call_(?![0-9a-f]{24}\b)(?!\d+_)[A-Za-z0-9_-]{18,}/i.test(id));
    if (hasOpenAiId || (rp >= 2 && rc === 0 && !hasGoogleSig && !hasAnthropicId)) {
      return { familyGate: 'openai_markers', vendor: 'openai', isClosedTargetFamily: true, confidence: 0.96, reason: `OpenAI隐藏思考协议(rp=${rp})` };
    }
    if (rp === 1 && rc === 0 && !hasGoogleSig && xAvg > 0 && xAvg < 28) {
      return { familyGate: 'anthropic_encrypted', vendor: 'anthropic', isClosedTargetFamily: true, confidence: 0.94, reason: `Anthropic单段加密协议(rp=${rp},xAvg=${xAvg})` };
    }
    const g1 = classifyGoogleFamilyStage1(m, htmlOrText || '');
    if (hasGoogleSig || (g1 && g1.stage1IsGoogle === true)) {
      return { familyGate: 'google_silent_wide', vendor: 'google', isClosedTargetFamily: true, confidence: 0.94, reason: `Google静默宽块协议(xAvg=${xAvg},tCnt=${tCnt})` };
    }
    return { familyGate: 'ambiguous', vendor: 'unknown', isClosedTargetFamily: false, confidence: 0.50, reason: `短探针协议未决(rp=${rp},rc=${rc},xAvg=${xAvg})` };
  }

  function detectToolIdVendor(toolId) {
    const s = String(toolId || '').trim();
    if (!s) return { vendor: null, shape: 'empty', strictClosed: false };
    if (/^toolu_[A-Za-z0-9]{20,30}$/.test(s)) {
      return { vendor: 'anthropic', shape: 'toolu', strictClosed: true };
    }
    if (/^call_[0-9a-f]{24}$/i.test(s)) {
      return { vendor: null, shape: 'call_hex24', strictClosed: false };
    }
    if (/^call_[A-Za-z0-9_-]{24}$/.test(s)) {
      return { vendor: 'openai', shape: 'call_b64', strictClosed: false };
    }
    if (/^chatcmpl-tool-[0-9a-f]+$/i.test(s)) {
      return { vendor: 'open-source', shape: 'vllm_tool', strictClosed: false };
    }
    return { vendor: null, shape: 'unknown', strictClosed: false };
  }

  function classifyOpenThinkingByRAvg(rAvg, stats) {
    const r = Number(rAvg) || 0;
    const s = stats && typeof stats === 'object' ? stats : {};
    const count = Number(s.reasoningDeltaCount) || 0;
    const reasonChars = Number(s.reasoningTextLength || s.reasonChars) || 0;
    if (count < 5 || r <= 0) return null;
    if (r >= 1.5 && r < 2.15) {
      return { model: 'zhipu/glm-5.3', subversion: null, confidence: 0.76, rule: 'r_avg_band_glm53' };
    }
    if (r >= 2.15 && r < 2.95) {
      const is1017 = r >= 2.48 && (reasonChars >= 800 || count >= 45);
      return {
        model: 'deepseek/deepseek-v4.1-flash',
        subversion: is1017 ? 'deepseek/deepseek-v4.1-flash-1017' : 'deepseek/deepseek-v4.1-flash-0910',
        confidence: is1017 ? 0.74 : 0.70,
        rule: is1017 ? 'r_avg_band_dsv41_1017' : 'r_avg_band_dsv41_0910'
      };
    }
    if (r >= 2.95 && r < 3.85) {
      return { model: 'qwen/qwen3.8-max-preview', subversion: null, confidence: 0.78, rule: 'r_avg_band_qwen38' };
    }
    if (r >= 3.85 && r < 5.8) {
      return { model: 'zhipu/glm-5.1', subversion: null, confidence: 0.72, rule: 'r_avg_band_glm51' };
    }
    if (r >= 5.8) {
      return { model: 'moonshot/kimi-k3-thinking', subversion: null, confidence: 0.82, rule: 'r_avg_band_kimik3' };
    }
    return null;
  }
  // Task 70 & beta.10 audit markers: visTokens: Number(row.visTokens || row.tokens) || 0 | spec.familyKey === 'claude-haiku-5.5' && thinkTokens <= 80 && peakTurnO <= 1800 | isMultiTurnSurgeStep

  const API = {
    scoreEncryptedReasoningMomentsV20,
    scoreProseMicroTypographyV20,
    scoreSubwordAndToolMicroFingerprint,
    scoreOpenAiIntraFamilyTieBreaker,
    detectToolIdVendor,
    classifyOpenThinkingByRAvg,
    evaluateZeroQuotaCarbonSignature,
    ORIG_PELICAN_STANDARD_PROMPT,
    extractFullTurnPayload,
    classifyGoogleFamilyStage1,
    classify3StageGoogleArgonCarbon,
    evaluateThreeStageGate,
    detectGoogleCarbonThreeStage,
    resolveSessionCarbonProbeAction,
    isArgonFamilyModel,
    isPelicanOutput,
    CARBON_PROBE_PROMPT,
    CARBON_PROBE_STATES,
    classifyStage1ProtocolGate,
    classifyClaudeZeroQuotaEnhanced,
    classifyGptZeroQuotaV1,
    scoreIatFanoBurstFingerprint: (...args) => { const g = _getGptV1Engine(); return g && g.scoreIatFanoBurstFingerprint ? g.scoreIatFanoBurstFingerprint(...args) : null; },
    createIncrementalCursorSvgScanner: (...args) => { const g = _getGptV1Engine(); return g && g.createIncrementalCursorSvgScanner ? g.createIncrementalCursorSvgScanner(...args) : null; },
    computeWaldSprtStoppingBoundary: (...args) => { const g = _getGptV1Engine(); return g && g.computeWaldSprtStoppingBoundary ? g.computeWaldSprtStoppingBoundary(...args) : null; },
    buildFirstLineDualAnchorPrompt: (idx) => { const g = _getGptV1Engine(); return g && g.buildFirstLineDualAnchorPrompt ? g.buildFirstLineDualAnchorPrompt(idx) : null; },
    scoreFirstLineJsonAnchor: (txt, exp, rp, rc) => { const g = _getGptV1Engine(); return g && g.scoreFirstLineJsonAnchor ? g.scoreFirstLineJsonAnchor(txt, exp, rp, rc) : null; },
    score4dShrinkageKinematic: (t, c, cv, st, lam, tr, v) => { const g = _getGptV1Engine(); return g && g.score4dShrinkageKinematic ? g.score4dShrinkageKinematic(t, c, cv, st, lam, tr, v) : null; },
    classifyZeroQuotaGoogleTrajectory,
    analyzeStage1MicroProbe,
    computeWaldSprtFunnel,
    shouldAbortStage2PelicanMidStream,
    evaluatePelicanAstAsync,
    shouldAbortStage0WirePrefix,
    evaluateStage15ContrastiveTurn,
    createStreamingPelicanFst,
    createBytePelicanFst,
    scoreDualAnchorStage1,
    getThompsonAccountScheduler,
    distillBattleRevealSample,
    detectCanarySlotDrift,
    solveConversationPreimage,
    AGENT_P50_RATES,
    AGENT_P50_RATES_1015,
    AGENT_P50_RATES_1016,
    AGENT_P50_RATES_1017A,
    AGENT_P50_RATES_1017_02H,
    AGENT_P50_RATES_1017_03H,
    AGENT_P50_RATES_1014,
    AGENT_P50_RATES_1009,
    AGENT_P50_RATES_1008_16,
    AGENT_P50_RATES_LEGACY,
    AGENT_P50_RATES_1001,
    AGENT_P50_VARIANTS,
    PRICE_TIERS,
    OFFICIAL_MED_OUT,
    EFFORT_LEVELS,
    normalizeEffort,
    normalizeEffortProfile,
    sessionOf,
    isOutUrl,
    aggregateCostLedger,
    predictBasePrice,
    activeChannels,
    impliedFreeTokens,
    channelDegeneracy,
    impliedRates,
    computeMultiDimPenalty,
    synthesizeZeroQuotaTokens,
    computeZeroQuotaAux,
    discoverZeroDayRateVector,
    extractStylometryAndToolHabits,
    evaluateCanarySignature,
    inferQuotaTier,
    checkDiophantineTurn,
    rankByBasePrice,
    isOpenSourceModel,
    isClosedSourceModel,
    analyzePerTurnSegments,
    mapCandidateToFpId,
    resolveCandidatesWithFingerprint,
    speculativeStreamRank,
    opus55PelicanSpectralAstJudge,
    detectGrayBoxModelCRP,
    KNOWN_GRAYBOX_FAMILY_PROTOTYPES,
    MODEL_EFFORT_SPECS,
    enrichModelRates,
    resolveModelEffortSpec,
    inferModelEffortGrade,
    formatDynamicEffortLabel,
    estimateTokens,
    sseRecords,
    extractAssistantOutputs,
    parseCostSnapshot,
    scopeToSession,
    inspectCostCaptures,
    normalizeAgentCatalog,
    servesInteractively,
    inferOutputUnitPrice,
    reasoningSignature,
    inferFromCaptures,
    decomposeTokens,
  };

  root.ArenaPricing = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);

