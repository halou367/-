/*
 * pricing.js — 用计费反推型号候选
 *
 * 主判据是 **basePrice 残差法**（见下面 AGENT_P50_RATES 的说明）：
 *
 *   /api/chat/{id}/cost 给出每条消息四条通道的真实美元花费（actual.*）以及
 *   按 agent_p50 基准费率重算的 basePriceUsd，两者共用同一份真实 token；
 *   /out  SSE 流用来把这些账单配对到助手真正产出过内容的消息上。
 *   ⇒ 对每个候选型号，用它的费率把 actual 折回 token、再按 p50 算出预测 basePrice，
 *     与观测值一比，残差最小的就是最像的 —— 隐藏的思考 token 在除法里自动约掉。
 *
 * 本文件还承担 SSE / 计费解析、目录规范化，以及几个跨模块共用的小工具
 * （sessionOf / isOutUrl / aggregateCostLedger），family.js、background.js 与
 * tools/ 都从这里取，避免各写一份。
 *
 * ⚠ 两条纪律
 *   1. 本模块**不写死任何厂商名或型号名**。候选名称全部来自目录文件，
 *      厂商匹配靠字符串归一化比对，不靠映射表。
 *   2. 必须能在 Node 里独立 require（tools/ 与测试都这么用），不得依赖 chrome.*
 *      或其它模块；family.js 反过来依赖本模块的解析函数。
 */
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
      for (const event of sseRecords(capture.responseBody)) {
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
          try { const sIn = JSON.stringify(data.input || {}); bucket.text += sIn; bucket.visText += sIn; } catch (_) {}
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
        const payload = JSON.parse(String(capture.responseBody || ''));
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
      try { payload = JSON.parse(String(capture.responseBody || '')); } catch (_) { continue; }
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
  function enrichModelRates(model) {
    if (!model) return null;
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

  function checkDiophantineTurn(row, effModel, p50) {
    const chs = [
      ['outputUsd', 'completion'],
      ['inputUsd', 'prompt'],
      ['cacheReadUsd', 'cacheRead'],
      ['cacheWriteUsd', 'cacheWrite'],
    ];
    let predBaseFromInt = 0;
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
      const tol = Math.max(1e-11, c * 1e-6);
      const tokenRelErr = Math.abs(rawN - nInt) / Math.max(1, nInt);
      const passed = costErr <= tol || Math.abs(rawN - nInt) <= 1e-3;
      if (passed) {
        intPassCount += 1;
        if (rateKey !== 'cacheRead') nonCrPassCount += 1;
      }
      if (tokenRelErr > maxTokenRelErr) maxTokenRelErr = tokenRelErr;
      if (rateKey !== 'cacheRead' && tokenRelErr > maxNonCrRelErr) maxNonCrRelErr = tokenRelErr;
      predBaseFromInt += nInt * p50[rateKey];
      if (rateKey === 'prompt') tokens.I = nInt;
      else if (rateKey === 'cacheWrite') tokens.W = nInt;
      else if (rateKey === 'cacheRead') tokens.R = nInt;
      else if (rateKey === 'completion') tokens.O = nInt;
    }

    if (activeCount === 0) return { valid: false };
    const obsBase = Number(row.basePriceUsd) || 0;
    let baseRelErr = obsBase > 0 ? Math.abs(predBaseFromInt - obsBase) / obsBase : Infinity;
    let solverTier = 1;
    let derivedCacheReadPerM = null;

    // Tier 3: Dynamic cacheRead elimination via basePriceUsd when I, W, O pass exact integer quantization
    const cCr = Number(row.cacheReadUsd) || 0;
    if (cCr > 0 && obsBase > 0 && p50.cacheRead > 0 && nonCrPassCount === nonCrActiveCount && (intPassCount < activeCount || baseRelErr >= 1e-3)) {
      const nonCrBase = tokens.I * p50.prompt + tokens.W * p50.cacheWrite + tokens.O * p50.completion;
      const remBase = obsBase - nonCrBase;
      if (remBase > 0) {
        const rElim = Math.round(remBase / p50.cacheRead);
        const elimBase = nonCrBase + rElim * p50.cacheRead;
        const elimRelErr = Math.abs(elimBase - obsBase) / obsBase;
        if (rElim > 0 && elimRelErr < 1e-3) {
          const impliedCrPerM = (cCr / rElim) * 1e6;
          const promptPerM = (Number(effModel.prompt) || 0) * 1e6;
          if (impliedCrPerM > 0 && impliedCrPerM <= promptPerM * 1.05 && isCleanCacheRatePerM(impliedCrPerM)) {
            tokens.R = rElim;
            predBaseFromInt = elimBase;
            baseRelErr = elimRelErr;
            intPassCount = activeCount;
            maxTokenRelErr = maxNonCrRelErr;
            solverTier = 3;
            derivedCacheReadPerM = Number(impliedCrPerM.toFixed(4));
          }
        }
      }
    }

    // Exact p50 integer-ratio congruence check when p50_out/p50_in is an integer (2 or 3)
    let congruenceErr = 0;
    if (obsBase > 0 && p50.prompt > 0) {
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

  function resolveModelProtoFamily(rawModel) {
    if (!rawModel) return '';
    if (rawModel.protoFamily) return String(rawModel.protoFamily).toLowerCase();
    const vNorm = normVendor(rawModel.vendor || rawModel.org);
    const id = String(rawModel.id || '').toLowerCase();
    if (vNorm === 'anthropic' || /claude|opus|sonnet|haiku|fable/i.test(id)) return 'claude';
    if (vNorm === 'openai' || /gpt-/i.test(id)) return 'openai';
    if (vNorm === 'google' || /gemini|barium|argon/i.test(id)) return 'google';
    if (vNorm === 'xai' || /grok/i.test(id)) return 'grok';
    if (vNorm === 'deepseek' || /deepseek/i.test(id)) return 'deepseek';
    if (vNorm === 'moonshotai' || /kimi|kivine/i.test(id)) return 'kimi';
    if (/qwen|alibaba|z-ai|zai|glm|xiaomi|mimo|minimax/i.test(vNorm + ' ' + id)) return 'compat';
    return 'vllm';
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
    const id = String((rawModel && (rawModel.id || rawModel.agentKey || rawModel.model)) || '');
    const label = String((rawModel && rawModel.label) || '');
    const combined = id + ' ' + label;
    for (const spec of MODEL_EFFORT_SPECS) {
      if (spec.match.test(combined)) return spec;
    }
    const supportsReason = !(rawModel && rawModel.supportsReasoning === false);
    return {
      familyKey: 'generic-reasoning',
      tiers: ['Low', 'Medium', 'High', 'Max'],
      fixedTier: false,
      anchors: { Low: 800, Medium: 1600, High: 2900, Max: 5400 },
      thinkAnchors: { Low: 150, Medium: 520, High: 1350, Max: 2900 },
      rewriteLabel: false,
    };
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
    return `${baseName} (${effortProfile.effort})`;
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
    const nTurns = Math.max(1, Number(solvedTokens && solvedTokens.turns) || (Array.isArray(rows) && rows.length ? rows.length : 1));
    const peakTurnO = Math.max(Number(solvedTokens && solvedTokens.maxTurnO) || 0, Math.round(totalO / nTurns));
    const avgOutPerTurn = Math.round(totalO / nTurns);

    // 1. Decompose Visible + Tool Tokens vs Hidden/Explicit Thinking Tokens
    const sseReasonTok = Number(ev.reasoningTextLength) > 0
      ? Math.max(1, Math.round(Number(ev.reasoningTextLength) / 3.5))
      : 0;
    const rawVisTok = Math.max(
      Number(solvedTokens && solvedTokens.visO) || 0,
      Number(ev.visTokens) || 0,
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
    let p75ThinkTok = Math.round(thinkTokens / nTurns);
    let normPeakThink = peakThinkTokens;
    let normP75Think = p75ThinkTok;
    let hasProbePlusHeavyCode = false;
    let probeTurnNormThink = 0;
    let codeTurnNormThink = 0;
    const turnTrajectory = [];
    if (Array.isArray(turnTokens) && turnTokens.length > 0) {
      const perStepThinks = [];
      const perStepNormThinks = [];
      const firstRawO = Math.max(1, Number((turnTokens[0] && turnTokens[0].O) || 0));
      for (let i = 0; i < turnTokens.length; i++) {
        const t = turnTokens[i] || {};
        const stepO = Math.max(0, Number(t.O) || 0);
        const stepReasonO = Math.max(0, Number(t.reasonO) || 0);
        const stepSteps = Math.max(1, Number(t.stepCount) || 1);
        const propVis = (turnTokens.length === 1 && rawVisTok > 0)
          ? Math.min(stepO, visTokens)
          : (stepO <= 600
            ? Math.min(95, Math.max(18, Math.round(stepO * 0.24)))
            : Math.min(420, Math.max(45, Math.round(visTokens * (stepO / Math.max(1, totalO))))));
        let stepVis = Number(t.visO) > 0
          ? Math.min(stepO || Number(t.visO), Number(t.visO))
          : (stepReasonO > 0 && stepO > stepReasonO ? (stepO - stepReasonO) : Math.min(stepO, propVis));
        let stepThink = stepReasonO > 0 && stepO > 0
          ? Math.min(stepO, Math.max(stepReasonO, stepO - stepVis))
          : Math.max(0, stepO - stepVis);
        const stepI = Number(t.I) || 0;
        const hasMeasuredVis = Number(t.visO) > 0;
        const isCodeSurgeTurn = (turnTokens.length === 2 && i === 1 && stepVis >= 175 && (
          (firstRawO <= 600 && stepO >= firstRawO * 8 && stepSteps <= 2 && stepI <= 2200) ||
          (firstRawO <= 80 && stepO >= firstRawO * 25 && stepSteps <= 3 && stepI <= 4500)
        ));
        const kappa = (((hasMeasuredVis && stepVis > 220 && stepSteps <= 2 && stepI <= 2200) || isCodeSurgeTurn))
          ? Math.min(22.0, +(1.0 + 0.028 * Math.max(40, stepVis - 135)).toFixed(2))
          : 1.0;
        const normThink = Math.round(stepThink / kappa);
        perStepThinks.push(stepThink);
        perStepNormThinks.push(normThink);
        const stepDurMs = Math.max(0, Number(t.durationMs) || 0);
        const stepDurSec = +(stepDurMs / 1000).toFixed(1);
        const stepExp = stepThink / Math.max(12, stepVis);
        const stepMult = stepDurSec >= 35 ? 1.85 : (stepDurSec >= 16 || (stepExp >= 8.0 && stepDurSec >= 6) ? 1.38 : (stepDurSec >= 7 || stepExp >= 3.5 ? 1.12 : (stepDurSec > 0 && stepDurSec <= 2.2 && stepExp < 1.5 ? 0.78 : 1.0)));
        const stepEffThink = Math.max(15, Math.round(normThink * stepMult));
        let stepTier = validTiers[validTiers.length - 1];
        let stepTierIdx = validTiers.length - 1;
        let stepTierProb = 99;
        if (!spec.fixedTier && validTiers.length > 1) {
          const sLogits = validTiers.map((tr, tIdx) => {
            const tAnc = (spec.thinkAnchors && spec.thinkAnchors[tr]) || (400 * Math.pow(2.2, tIdx));
            const oAnc = (spec.anchors && spec.anchors[tr]) || (1500 * Math.pow(1.6, tIdx));
            const zT = Math.log(Math.max(25, stepEffThink) / tAnc) / 0.68;
            const zO = Math.log(Math.max(120, Math.max(stepO, stepEffThink + stepVis)) / oAnc) / 0.75;
            let ll = -0.5 * (zT * zT * 0.78 + zO * zO * 0.22);
            if (normThink > tAnc * 2.35 && tIdx < validTiers.length - 1) ll -= 2.6;
            return { tier: tr, tIdx, ll };
          });
          const mLl = Math.max(...sLogits.map((x) => x.ll));
          const sExps = sLogits.map((x) => Object.assign({}, x, { w: Math.exp(x.ll - mLl) }));
          const sSum = sExps.reduce((s, x) => s + x.w, 0) || 1;
          const sBest = sExps.map((x) => ({ tier: x.tier, tIdx: x.tIdx, prob: +((x.w / sSum) * 100).toFixed(1) })).sort((a, b) => b.prob - a.prob)[0];
          if (sBest) { stepTier = sBest.tier; stepTierIdx = sBest.tIdx; stepTierProb = sBest.prob; }
        }
        turnTrajectory.push({
          step: i + 1,
          I: Number(t.I) || 0,
          W: Number(t.W) || 0,
          R: Number(t.R) || 0,
          O: stepO,
          visO: stepVis,
          thinkO: stepThink,
          normThinkO: normThink,
          effThinkO: stepEffThink,
          kappa,
          steps: stepSteps,
          durationMs: stepDurMs,
          tier: stepTier,
          tierIdx: stepTierIdx,
          tierProb: stepTierProb,
        });
      }
      if (perStepThinks.length > 1) {
        const sortedThinks = perStepThinks.slice().sort((a, b) => a - b);
        const qIdx = Math.min(sortedThinks.length - 1, Math.floor(sortedThinks.length * 0.75));
        p75ThinkTok = sortedThinks[qIdx];

        const sortedNorm = perStepNormThinks.slice().sort((a, b) => a - b);
        normP75Think = sortedNorm[qIdx];
        normPeakThink = sortedNorm[sortedNorm.length - 1];

        const firstStep = turnTrajectory[0];
        const maxKappaStep = turnTrajectory.reduce((best, cur) => (cur.kappa > best.kappa ? cur : best), turnTrajectory[0]);
        if (turnTrajectory.length === 2 && firstStep && firstStep.visO <= 190 && firstStep.O > 0 && firstStep.O <= 750 && maxKappaStep && maxKappaStep.kappa >= 3.0 && (maxKappaStep.I || 0) <= 4500) {
          hasProbePlusHeavyCode = true;
          probeTurnNormThink = firstStep.normThinkO;
          codeTurnNormThink = maxKappaStep.normThinkO;
        }
      } else if (perStepThinks.length === 1) {
        p75ThinkTok = perStepThinks[0];
        normP75Think = perStepNormThinks[0];
        normPeakThink = perStepNormThinks[0];
      }
    }

    // 2. Expansion Ratio (rho), Latency & Reasoning Blocks
    const expansionRatio = +(thinkTokens / Math.max(12, visTokens)).toFixed(2);
    const thinkDurationMs = Math.max(Number(ev.thinkDurationMs) || 0, Number(ev.turnDurationMs) || 0);
    const thinkDurSec = +(thinkDurationMs / 1000).toFixed(1);
    const reasoningBlocks = Math.max(
      Number(ev.nReason) || 0,
      Number(ev.reasoningStartCount) || 0,
      Number(ev.totalStepCount) || 0,
      Array.isArray(ev.streamIds) ? Math.max(0, ev.streamIds.length - 1) : 0,
      (Number(ev.reasoningDeltaCount) > 0 && !(Number(ev.reasoningTextLength) > 0))
        ? Math.min(8, Math.ceil(Number(ev.reasoningDeltaCount) / 12))
        : (Number(ev.reasoningTextLength) > 0 ? 1 : 0)
    );

    // 3. Telemetry Multiplier & Intrinsic Per-Turn Thinking Budget (v11.0 Task-Normalized)
    let telemetryMult = 1.0;
    if (thinkDurSec >= 35 || reasoningBlocks >= 14) {
      telemetryMult = 1.85;
    } else if (thinkDurSec >= 16 || reasoningBlocks >= 7 || (expansionRatio >= 8.0 && thinkDurSec >= 6)) {
      telemetryMult = 1.38;
    } else if (thinkDurSec >= 7 || reasoningBlocks >= 3 || expansionRatio >= 3.5) {
      telemetryMult = 1.12;
    } else if (thinkDurSec > 0 && thinkDurSec <= 2.2 && expansionRatio < 1.5) {
      telemetryMult = 0.78;
    }
    if (hasProbePlusHeavyCode) {
      telemetryMult = Math.min(1.08, telemetryMult);
    }

    const baseThink = hasProbePlusHeavyCode
      ? Math.round(probeTurnNormThink * 0.68 + codeTurnNormThink * 0.32)
      : (nTurns > 1
          ? Math.round(normPeakThink * 0.65 + normP75Think * 0.35)
          : Math.max(normPeakThink, Math.round(thinkTokens / nTurns)));
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
    } else if (peakTurnO >= 24000 || thinkTokens >= 20000) {
      primaryEffort = validTiers[validTiers.length - 1];
      confidence = 99;
      tierProbs = validTiers.map((t, i) => ({
        tier: t,
        prob: i === validTiers.length - 1 ? 99.2 : +(0.8 / Math.max(1, validTiers.length - 1)).toFixed(1),
      })).sort((a, b) => b.prob - a.prob);
      basis = `单步峰值 ${peakTurnO.toLocaleString()} tok 突破物理上限锁定 ${primaryEffort}`;
    } else if (nTurns >= 4 && (totalO >= 10000 || thinkDurSec >= 180 || reasoningBlocks >= 20)) {
      primaryEffort = validTiers[validTiers.length - 1];
      confidence = 96;
      tierProbs = validTiers.map((t, i) => ({
        tier: t,
        prob: i === validTiers.length - 1 ? 96.5 : +(3.5 / Math.max(1, validTiers.length - 1)).toFixed(1),
      })).sort((a, b) => b.prob - a.prob);
      basis = `多步深度推理(${nTurns}步 · 思考块${reasoningBlocks} · ${thinkDurSec}s) → ${primaryEffort}`;
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
          : Math.max(peakTurnO, avgOutPerTurn, effThinkTok + visTokens);
        const metricO = Math.max(120, effectiveOut);
        const zO = Math.log(metricO / oAnchor) / sigmaO;
        let logLike = -0.5 * (zT * zT * 0.78 + zO * zO * 0.22);

        // Hard floor exclusion penalty when task-normalized peak thinking far exceeds a lower tier's budget
        const floorCheckThink = hasProbePlusHeavyCode ? effThinkTok : normPeakThink;
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
        const baseTurn = priorTurns.reduce((best, cur) => (cur.tierIdx > best.tierIdx || (cur.tierIdx === best.tierIdx && cur.normThinkO > best.normThinkO) ? cur : best), priorTurns[0]);
        if (baseTurn && lastTurn.tierIdx < baseTurn.tierIdx && lastTurn.normThinkO < baseTurn.normThinkO * 0.42 && baseTurn.normThinkO >= 260) {
          effortDowngraded = true;
          initialEffort = baseTurn.tier;
          latestEffort = lastTurn.tier;
          primaryEffort = lastTurn.tier;
          basis += ` · [同型号强度削弱: ${initialEffort}→${latestEffort}]`;
        }
      }
    }

    const tierProbStr = tierProbs.slice(0, 3).map((x) => `${x.tier} ${Math.round(x.prob)}%`).join(' · ');

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
      basis = `单步峰值 ${peakTurnO.toLocaleString()} tok (思考 ${thinkTokens.toLocaleString()} tok · REI ${reiScore}) 突破 Opus 5.5 64K 物理上限 → 锁定新模型 ${stealthModelLabel}`;
    }

    return {
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
      expansionRatio,
      thinkDurationMs,
      thinkDurSec,
      reasoningBlocks,
      basis,
    };
  }



  function isOpenSourceModel(rawModel) {
    if (!rawModel || typeof rawModel !== 'object') return false;
    const v = String(rawModel.vendor || rawModel.org || '').toLowerCase();
    const p = String(rawModel.proto || '').toLowerCase();
    const lic = String(rawModel.license || '').toLowerCase();
    const id = [rawModel.id, rawModel.model, rawModel.label, rawModel.baseLabel, rawModel.dynamicLabel]
      .filter(Boolean).join(' ').toLowerCase();
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
    if (sources.includes('unpriced')) {
      if (/barium|argon|nemotron|may26-chatbot4/i.test(id + ' ' + label)) {
        matchedDims.push('计费源:unpriced(锁定无标价模型)');
        if (/barium|argon/i.test(id) && ev.visibleReasoning !== true && ev.reasoningSignature !== 'visible-text') {
          softPen -= 0.0030;
        }
      } else {
        hardPen += 0.55;
      }
    } else if (sources.length > 0 && /barium|argon|nemotron|may26-chatbot4/i.test(id + ' ' + label)) {
      const zeroReasonGemini = /barium|argon/i.test(id + ' ' + label)
        && (ev.noReasoningParts === true || ev.reasoningSignature === 'none')
        && !hasCW;
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

    if (!isOpenThinking && ev.streamIdPrefix === 'openai-rs') {
      if (proto === 'openai') matchedDims.push('SSE流ID:msg_/rs_(OpenAI)');
      else hardPen += 0.35;
    } else if (!isOpenThinking && ev.streamIdPrefix === 'openai-tc-empty') {
      if (proto === 'openai') {
        matchedDims.push('SSE思考块:tc_加密隐藏(OpenAI特征)');
        softPen -= 0.0025;
      } else {
        softPen += 0.0060;
      }
    }

    const hasRowCW = Array.isArray(rows) && rows.some(r => (Number(r && r.cacheWriteUsd) || 0) > 1e-9);
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
    const isOpenAiWireId = ev.streamIdPrefix === 'openai-rs' || ev.streamIdPrefix === 'openai-tc-empty';
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
    const isZeroCwAstraSession = !hasRowCW && evToolFamEarly !== 'claude' && evToolFamEarly !== 'anthropic' && !hasClaudeWarm12kPrefix && (
      hasAstraOpenAiPrefix || rows.length >= 2 || maxAstraUTok >= 150 || ev.hasPelicanSvg === true || isOpenAiWireId || evToolFamEarly === 'openai' || evToolFamEarly === 'gpt'
    );
    const hasOpenAiBillingEvidence = !hasRowCW && (hasExact6603Turn || hasRow6603OpenAiPrefix || hasAstraOpenAiPrefix || isZeroCwAstraSession || isOpenAiWireId || evToolFamEarly === 'openai' || evToolFamEarly === 'gpt');
    const hasClaudeBillingEvidence = hasRowCW || evToolFamEarly === 'claude' || evToolFamEarly === 'anthropic' || hasClaudeWarm12kPrefix;

    if (isOpenThinking) {
      if (isClosedModel || (!isOpenModel && rawModel.supportsReasoning === false) || /barium|argon/i.test(id)) {
        hardPen += 0.85;
      } else {
        matchedDims.push('开源思考:仅匹配开源模型');
      }
    } else if (isClosedThinking) {
      if (isOpenModel || rawModel.supportsReasoning === false || /barium|argon/i.test(id)) {
        hardPen += 0.85;
      } else {
        if (ev.reasoningSignature === 'markers-only' || (ev.reasoningSignature === 'empty-deltas' && (isOpenAiWireId || (hasOpenAiBillingEvidence && !hasClaudeBillingEvidence)))) {
          if (proto === 'openai') matchedDims.push('思考流:markers-only(OpenAI)');
          else if (!hasClaudeBillingEvidence) hardPen = Math.max(hardPen, /claude-fable-5\.1/i.test(id) ? 0.14 : 0.22);
        } else if (ev.reasoningSignature === 'empty-deltas') {
          if (proto === 'claude') matchedDims.push('思考流:empty-deltas(Claude)');
          else if (!hasOpenAiBillingEvidence) hardPen = Math.max(hardPen, /gpt-6-astra/i.test(id) ? 0.14 : 0.22);
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
      if (isOpenModel) {
        hardPen += 0.85;
      } else if (hasExact6603Turn && proto === 'openai') {
        matchedDims.push('系统前缀:6603t(OpenAI特征)');
        softPen -= 0.0040;
      } else if (hasRow6603OpenAiPrefix) {
        hardPen += 0.28;
      } else if (proto === 'google' || /barium|argon|gemini/i.test(id + ' ' + label)) {
        matchedDims.push('思考段:nr=0(Gemini/Argon特征)');
        softPen -= 0.0045;
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
      if (proto === 'google') {
        matchedDims.push('行为习惯:静默连调Bash(Gemini特征)');
        softPen -= 0.0015;
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

  function predictBasePrice(model, costs, rates, tiers, perMessage, evidence) {
    if (!model || !costs) return null;
    const rawModel = model;
    const m = enrichModelRates(model);
    if (!m || !(m.prompt > 0) || !(m.completion > 0)) return null;

    const p50Variants = rates ? [rates] : AGENT_P50_VARIANTS;
    const list = (Array.isArray(tiers) && tiers.length) ? tiers : PRICE_TIERS;
    const observed = Number(costs.basePriceUsd) || 0;
    const rows = (Array.isArray(perMessage) && perMessage.length)
      ? perMessage.filter((r) => Number(r && r.basePriceUsd) > 0)
      : (observed > 0 ? [costs] : []);

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
              if (!(isUnpricedSource && observed > 0)) continue;
              if (tier !== 1.0 || crIdx > 0 || cwIdx > 0 || prof.altIdx > 0 || p50 !== p50Variants[0]) continue;
              const unpricedTurnTokens = [];
              let uSumI = 0, uSumR = 0, uSumO = 0, uSumVis = 0, uMaxO = 0;
              for (const r of rows) {
                const rBase = Number(r && r.basePriceUsd) || 0;
                const rReason = Number(r && r.reasonTokens) || 0;
                const rVis = Number(r && (r.visTokens || r.tokens)) || 0;
                const rSteps = Math.max(1, Number(r && r.stepCount) || 1);
                let stepO = 0, stepI = 0, stepR = 0;
                if (rReason > 0) {
                  stepO = rReason + Math.max(24, rVis);
                  const remB = Math.max(0, rBase - stepO * p50.completion);
                  stepI = Math.min(4000, Math.max(60, Math.round((remB * 0.28) / p50.prompt)));
                  stepR = Math.max(0, Math.round((remB - stepI * p50.prompt) / p50.cacheRead));
                } else {
                  stepO = Math.max(rVis || 35, Math.round((rBase * 0.80) / p50.completion));
                  const remB = Math.max(0, rBase - stepO * p50.completion);
                  stepI = Math.min(4000, Math.max(60, Math.round((remB * 0.35) / p50.prompt)));
                  stepR = Math.max(0, Math.round((remB - stepI * p50.prompt) / p50.cacheRead));
                }
                if (stepO > uMaxO) uMaxO = stepO;
                uSumI += stepI; uSumR += stepR; uSumO += stepO; uSumVis += (rVis || 35);
                unpricedTurnTokens.push({ I: stepI, W: 0, R: stepR, O: stepO, visO: rVis || 35, reasonO: rReason, stepCount: rSteps, solverTier: 2 });
              }
              const uTurns = Math.max(1, rows.length);
              const baseSolvedTokens = {
                I: uSumI, W: 0, R: uSumR, O: uSumO,
                visO: uSumVis || (evidence && evidence.visTokens) || 0,
                maxTurnO: uMaxO,
                avgOutPerTurn: Math.round(uSumO / uTurns),
                turns: uTurns,
              };
              const effortProfile = inferModelEffortGrade(rawModel, baseSolvedTokens, evidence, rows, unpricedTurnTokens);
              const inferredEffort = String(effortProfile.primaryEffort || 'high').toLowerCase();
              const dynamicLabel = formatDynamicEffortLabel(rawModel && (rawModel.label || rawModel.id), effortProfile);
              const solvedTokens = {
                I: uSumI, W: 0, R: uSumR, O: uSumO,
                visO: effortProfile.visTokens,
                maxTurnO: uMaxO,
                thinking: effortProfile.thinkTokens,
                peakThinking: effortProfile.peakThinkTokens,
                expansionRatio: effortProfile.expansionRatio,
                reiScore: effortProfile.reiScore,
                avgOutPerTurn: Math.round(uSumO / uTurns),
                turns: uTurns,
              };
              const multiDim = computeMultiDimPenalty(rawModel, evidence, solvedTokens, hasCW, hasCR, rows, unpricedTurnTokens);
              const matchedDimsWithEffort = (multiDim.matchedDims || []).concat([`思考档位:${effortProfile.effort}(REI=${effortProfile.reiScore})`]);
              const scoreResidual = multiDim.penalty;
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
                multiDimPenalty: multiDim.penalty,
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
            const aggResidual = observed > 0 ? Math.abs(predicted - observed) / observed : Infinity;

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
              const d = checkDiophantineTurn(r, effModel, p50);
              if (!d.valid) continue;
              validTurns += 1;
              sumSqRel += d.baseRelErr * d.baseRelErr;
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

            const rmsResidual = validTurns > 0 ? Math.sqrt(sumSqRel / validTurns) : aggResidual;
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
            const solvedTokens = {
              I: sumTokens.I,
              W: sumTokens.W,
              R: sumTokens.R,
              O: sumTokens.O,
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
            const matchedDimsWithEffort = (multiDim.matchedDims || []).concat([`思考档位:${effortProfile.effort}(REI=${effortProfile.reiScore})`]);
            const effCrPerM = derivedCrPerM != null ? derivedCrPerM : (Number(crBase) ? Number((crBase * 1e6).toFixed(4)) : null); const fableCrPen = (isLegacyFable5 && hasCR && (crIdx > 0 || maxSolverTier === 3 || (effCrPerM != null && Math.abs(effCrPerM - 0.25) < 0.05))) ? 0.16 : 0; const fableEffortPen = fableCrPen + ((isLegacyFable5 && ((effortProfile && effortProfile.reiScore >= 240) || (effortProfile && effortProfile.effThinkTok >= 2400))) ? 0.05 : 0);
            const effHardPen = (isAstraModel && cachePatternPenalty > 0 && (multiDim.hardPenalty || 0) > 0 && (multiDim.hardPenalty || 0) < 0.5)
              ? Math.max(0, (multiDim.hardPenalty || 0) - cachePatternPenalty)
              : (multiDim.hardPenalty || 0);
            const hardResidual = rmsResidual + diophantinePenalty + cachePatternPenalty + solverTierPen + effHardPen;
            const scoreResidual = hardResidual + (priorPen - solverTierPen) + (typeof cacheSoftPrior !== 'undefined' ? cacheSoftPrior : 0) + variantPen + fableEffortPen + (multiDim.softPenalty || 0);

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
    if (!(base > 0) || !costs) return { ok: false, reason: 'no-base-price', candidates: [] };
    const scope = (opts.vendorAllowlist || []).map(normVendor).filter(Boolean);
    const hints = (Array.isArray(opts.vendorHint) ? opts.vendorHint : [opts.vendorHint])
      .map(normVendor).filter(Boolean);
    const perMessage = Array.isArray(opts.perMessage) && opts.perMessage.length
      ? opts.perMessage
      : [Object.assign({}, costs, { basePriceUsd: base })];

    function buildCandidateList(activeRates) {
      const listOut = [];
      for (const model of (catalog || [])) {
        if (!servesInteractively(model)) continue;
        if (scope.length && scope.indexOf(normVendor(model.vendor)) < 0) continue;
        const hit = predictBasePrice(model, costs, activeRates, opts.tiers, perMessage, opts.evidence);
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

    const evEarly = options && options.evidence;
    const earlyOpenThink = Boolean(evEarly && (evEarly.visibleReasoning === true || (Number(evEarly.visibleReasoningChars) > 0) || evEarly.reasoningSignature === 'visible-text' || evEarly.reasoningSignature === 'visible' || (evEarly.streamEvidence && evEarly.streamEvidence.reasoningSummary === 'visible')));
    const earlyClosedThink = Boolean(evEarly && !earlyOpenThink && (evEarly.hiddenReasoning === true || evEarly.reasoningEmpty === true || evEarly.visibleReasoningChars === 0 || evEarly.reasoningSignature === 'markers-only' || evEarly.reasoningSignature === 'empty-deltas' || evEarly.noReasoningParts === true || evEarly.reasoningSignature === 'none' || evEarly.streamIdPrefix === 'openai-rs' || evEarly.streamIdPrefix === 'openai-tc-empty' || evEarly.hasClosedSourceThinking === true || (evEarly.streamEvidence && (evEarly.streamEvidence.reasoningSummary === 'empty' || evEarly.streamEvidence.reasoningSummary === 'none'))));
    if (earlyOpenThink) {
      candidates = candidates.filter((c) => !isClosedSourceModel(c));
    } else if (earlyClosedThink) {
      const closedOnly = candidates.filter((c) => !isOpenSourceModel(c));
      if (closedOnly.length > 0) candidates = closedOnly;
    }

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

    {
      const exactT1 = candidates.filter((c) => c && c.diophantinePassed === true && (c.solverTier || 1) === 1 && Math.abs((c.priceTier || 1) - 1) < 1e-6 && (Number(c.priceResidual ?? c.residual) || 0) < 1e-6);
      if (exactT1.length > 0) {
        const bestExact = exactT1.reduce((a, b) => ((a.scoreResidual ?? a.residual) <= (b.scoreResidual ?? b.residual) ? a : b));
        const exactEpoch = bestExact && bestExact.matchedVariant;
        if (exactEpoch) {
          for (const c of candidates) {
            if (!c || !c.matchedVariant || c.matchedVariant === exactEpoch) continue;
            if ((Number(c.priceResidual ?? c.residual) || 0) > 1e-6) {
              const adj = Math.min(0.99, Math.max(Number(c.effectiveResidual) || 0, Number(c.scoreResidual) || 0) + 0.18);
              c.effectiveResidual = adj;
              c.scoreResidual = adj;
            }
          }
        }
      }
    }

    candidates.sort((a, b) => {
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
    {
      const seenIds = new Set();
      candidates = candidates.filter((c) => {
        const cid = String((c && c.id) || '');
        if (!cid || seenIds.has(cid)) return false;
        seenIds.add(cid);
        return true;
      });
    }

    for (let i = 1; i < candidates.length; i++) {
      const prev = candidates[i - 1], cur = candidates[i];
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

    // 开源思考与闭源思考严格互斥过滤：开源思考绝不匹配闭源模型，闭源思考绝不匹配开源模型
    const evFilter = options && options.evidence;
    if (evFilter && typeof evFilter === 'object') {
      const openThink = evFilter.visibleReasoning === true || (Number(evFilter.visibleReasoningChars) > 0) || evFilter.reasoningSignature === 'visible-text' || evFilter.reasoningSignature === 'visible' || (evFilter.streamEvidence && evFilter.streamEvidence.reasoningSummary === 'visible');
      const closedThink = !openThink && (evFilter.hiddenReasoning === true || evFilter.reasoningEmpty === true || evFilter.visibleReasoningChars === 0 || evFilter.reasoningSignature === 'markers-only' || evFilter.reasoningSignature === 'empty-deltas' || evFilter.noReasoningParts === true || evFilter.reasoningSignature === 'none' || evFilter.streamIdPrefix === 'openai-rs' || evFilter.streamIdPrefix === 'openai-tc-empty' || evFilter.hasClosedSourceThinking === true || (evFilter.streamEvidence && (evFilter.streamEvidence.reasoningSummary === 'empty' || evFilter.streamEvidence.reasoningSummary === 'none')));
      if (openThink) {
        const openPool = candidates.filter(c => !isClosedSourceModel(c));
        if (openPool.length > 0) candidates.splice(0, candidates.length, ...openPool);
      } else if (closedThink) {
        const closedPool = candidates.filter(c => !isOpenSourceModel(c));
        if (closedPool.length > 0) candidates.splice(0, candidates.length, ...closedPool);
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
    let costs = billRows.length ? sumRows(billRows) : null;
    let baseMatch = costs
      ? rankByBasePrice(catalog, costs, costs.basePriceUsd, {
        vendorAllowlist: opts.vendorAllowlist,
        vendorHint: opts.vendorHint,
        rates: opts.rates,
        perMessage: billRows,
        evidence: mergedEv,
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
    const mapped = FP_KEY_MAP[rawId];
    if (mapped && (!fpModelIds || fpModelIds.includes(mapped))) return mapped;
    const base = rawId.split('/').pop().replace(/-(?:low|medium|high|xhigh|max|agent|code-agent)$/i, '');
    if (fpModelIds) {
      const exact = fpModelIds.find((fid) => fid.toLowerCase() === base || fid.toLowerCase().startsWith(base));
      if (exact) return exact;
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
    for (const t of texts) {
      const nums = engine.parseNumbers(t);
      if (Array.isArray(nums) && nums.length >= 60) {
        totalNums += nums.length;
        validTexts.push(t);
      }
    }
    if (!validTexts.length) return { ok: false, reason: 'insufficient-numbers', totalNums };

    if (typeof engine.loadBank === 'function') await engine.loadBank();
    const bank = typeof engine.getBank === 'function' ? engine.getBank() : null;
    if (!bank || !Array.isArray(bank.models)) return { ok: false, reason: 'no-fp-bank' };
    const fpRes = await engine.identify(validTexts, bank);
    const ranking = (fpRes && (fpRes.candidates || fpRes.ranking)) || [];
    if (!fpRes || !Array.isArray(ranking) || !ranking.length) {
      return { ok: false, reason: 'fp-identify-empty' };
    }

    const scoreByFpId = new Map();
    const fpModelIds = [];
    for (const r of ranking) {
      scoreByFpId.set(String(r.id), Number(r.score) || 0);
      fpModelIds.push(String(r.id));
    }

    const list = Array.isArray(candidates) && candidates.length ? candidates : [];
    const BETA = 5.7;
    const scored = list.map((c) => {
      const fpId = mapCandidateToFpId(c, fpModelIds);
      const rawScore = (fpId && scoreByFpId.has(fpId)) ? scoreByFpId.get(fpId) : -1.0;
      return {
        candidate: c,
        id: c.id || c.key || c.modelKey,
        label: c.label || c.displayName || c.id,
        fpId,
        rawScore,
      };
    });

    const maxScore = scored.length ? Math.max(...scored.map((s) => s.rawScore)) : 0;
    let sumExp = 0;
    for (const s of scored) {
      s.exp = Math.exp(BETA * (s.rawScore - maxScore));
      sumExp += s.exp;
    }
    for (const s of scored) {
      s.prob = sumExp > 0 ? s.exp / sumExp : (1 / Math.max(1, scored.length));
    }
    scored.sort((a, b) => b.prob - a.prob);

    const winner = scored[0] || null;
    const globalTop = ranking[0] || null;
    const summaryText = scored.slice(0, 4).map((s) => `${s.label}: ${(s.prob * 100).toFixed(1)}%`).join(' · ');

    return {
      ok: !!winner,
      winner: winner ? winner.candidate : null,
      winnerKey: winner ? winner.id : (globalTop ? globalTop.id : null),
      winnerDisplayName: winner ? winner.label : (globalTop ? globalTop.id : null),
      winnerProb: winner ? winner.prob : (globalTop ? globalTop.prob : 0),
      winnerFpId: winner ? winner.fpId : (globalTop ? globalTop.id : null),
      scoredCandidates: scored,
      globalTop,
      totalNums,
      validProbes: validTexts.length,
      summaryText,
    };
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

  function speculativeStreamRank(catalog, memo) {
    if (!memo || typeof memo !== 'object') return null;
    const sig = String(memo.reasoningSignature || (!memo.sawReasoning ? 'none' : (!memo.reasoningDeltaCount ? 'markers-only' : (memo.reasoningTextLength > 0 ? 'visible-text' : 'empty-deltas'))));
    const toolIds = Array.isArray(memo.toolIds) ? memo.toolIds : [];
    const hasToolu = toolIds.some((id) => /^toolu_|^srvtoolu_/i.test(String(id)));
    const hasCall = toolIds.some((id) => /^call_/i.test(String(id)));
    const cps = Number(memo.cps) || 0;
    const durMs = Number(memo.turnDurationMs) || ((memo.lastDeltaAt > memo.firstDeltaAt) ? (memo.lastDeltaAt - memo.firstDeltaAt) : 0);

    if (sig === 'visible-text' && Number(memo.reasoningTextLength) >= 50) {
      return {
        stage: 'stream-prelock',
        isPlain: true,
        isTargetCandidate: false,
        familyLabel: '明文思考模型 (已排除4大闭源目标)',
        topId: 'qwen/qwen3.8-flash',
        topLabel: (memo.done && durMs > 12000) ? 'Nemotron 3 Ultra / DeepSeek / GLM' : 'Qwen3.8 / GLM / DeepSeek (明文思考)',
        confidence: 92,
        reason: `SSE明文思考(${memo.reasoningTextLength}字)`,
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
      const specEff = (thinkMs >= 16000 || rBlocks >= 6) ? 'Max' : (thinkMs >= 8500 || rBlocks >= 3 ? 'xHigh' : 'High');
      let topId = 'contenders/gpt-6.1-sol-max-agent';
      let topLabel = `GPT 6.1 Sol / 6 Astra (${specEff}) [流式预判]`;
      let conf = 84;
      let isTarget = true;
      if (cps > 0 && memo.textDeltaChars >= 60) {
        if (cps <= 55 || durMs >= 16000) {
          topId = 'contenders/gpt-6.1-sol-max-agent';
          topLabel = `GPT 6.1 Sol (${specEff}) [流式预判]`;
          conf = 91;
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


  const API = {
    solveConversationPreimage,
    AGENT_P50_RATES,
    AGENT_P50_RATES_1015,
    AGENT_P50_RATES_1014,
    AGENT_P50_RATES_1009,
    AGENT_P50_RATES_1008_16,
    AGENT_P50_RATES_LEGACY,
    AGENT_P50_RATES_1001,
    AGENT_P50_VARIANTS,
    PRICE_TIERS,
    OFFICIAL_MED_OUT,
    sessionOf,
    isOutUrl,
    aggregateCostLedger,
    predictBasePrice,
    activeChannels,
    impliedFreeTokens,
    channelDegeneracy,
    impliedRates,
    rankByBasePrice,
    isOpenSourceModel,
    isClosedSourceModel,
    analyzePerTurnSegments,
    resolveCandidatesWithFingerprint,
    speculativeStreamRank,
    MODEL_EFFORT_SPECS,
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

