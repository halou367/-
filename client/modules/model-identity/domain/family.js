/*
 * family.js — 传输层的厂商家族判定
 *
 * 判据有两层，强弱分明：
 *
 *   ① 工具调用 ID（强）
 *      toolCallId 由上游 API 生成、格式随厂商而定，第三方难以伪造。
 *      缺点：纯文本轮取不到。
 *
 *   ② 流事件 ID 前缀（弱，目前只有 OpenAI Responses API 的 msg_/rs_ 登记在册）
 *      `txt-0` / `reasoning-0` 这类前缀是**适配器层**的产物，多家共用，
 *      拿它当厂商证据会直接误判 —— 见下面 DeepSeek 条目里的撤销记录。
 *
 *   ③ 伴随特征（traits，只佐证不判定）
 *      流事件 id 形态 + reasoning 签名。它们**区分不了**同一适配器下的不同
 *      厂商（GLM 与 DeepSeek 的这两项完全一致），但能回答另一个问题：
 *      「这次观测到的整体形态，和该家族登记的画像一致吗？」
 *      一致 ⇒ 佐证；不一致 ⇒ 存疑，值得人工复核。
 *
 * 证据还分两种强度：
 *   `vendor-prefix` —— 带厂商专属前缀（如 toolu_vrtx_），几乎不会撞车；
 *   `shape`         —— 只是字符形态独特（如 call_ + 纯十六进制），
 *                      同样格式的其它实现也会命中，强度较低。
 *
 * 判不出来就是**未分类家族** —— 这不等于「不是某家」，只是「这条路没给出证据」。
 * 把「不是 A」写成「那就是 B」是推断上的越界，盲测场景下会直接变成错误结论。
 *
 * ⚠ 家族 ≠ 型号。ID 形态只能定到厂商/渠道，定不到具体型号。
 *
 * 依赖 pricing.js（SSE 解析与 URL 小工具）：Node 里 require 时自动加载，
 * 扩展里靠 manifest / importScripts 保证 pricing.js 先于本文件执行。
 */
(function (root) {
  'use strict';

  /*
   * 家族登记表。
   *
   * `vendor` 用于和定价反推的比价范围对齐 —— 判出的家族若不在比价范围内，
   * 调用方必须据此**抑制**型号候选，否则会在错误的厂商里硬凑出高置信度
   * （实测踩过：DeepSeek 的会话被报成 openai/gpt-5.6-luna-pro 99.9%）。
   */
  const FAMILIES = [
    {
      id: 'anthropic',
      label: 'Anthropic 家族',
      vendors: ['anthropic'],
      toolCall: [
        { channel: 'vertex', label: 'Google Vertex 转售', evidence: 'vendor-prefix',
          re: /\b(?:msg|toolu|compl)_vrtx_[A-Za-z0-9]{8,}/ },
        { channel: 'bedrock', label: 'AWS Bedrock 转售', evidence: 'vendor-prefix',
          re: /\b(?:msg|toolu|compl)_bdrk_[A-Za-z0-9]{8,}/ },
        // 必须同时满足 01 版本段和其后的 Base58 字符集（排除 0 O I l），且负向前瞻排除纯十六进制（如 OpenAI msg_01a1...）。
        // 只检查 01 或未排除纯 hex 会把别家的 msg_01a1… 长十六进制 ID 误判进来 —— 踩过这个坑。
        { channel: 'direct', label: 'Anthropic 直连', evidence: 'vendor-prefix',
          re: /\b(?:msg|toolu)_01(?![0-9a-fA-F]{18,}\b)[1-9A-HJ-NP-Za-km-z]{18,}\b/ },
      ],
      streamId: [],
      traits: { streamId: /^\d+$/, reasoning: 'empty-deltas' },
    },
    {
      id: 'openai',
      label: 'OpenAI 家族',
      vendors: ['openai'],
      toolCall: [
        // call_UgistC4N9E1Vytla3cQqsvYk —— call_ + 24 位混合大小写。
        // 负向前瞻排除纯十六进制，避免和下面的 hex-call 家族撞车。
        { channel: 'chat-completions', label: 'Chat Completions', evidence: 'shape',
          re: /\bcall_(?![0-9a-f]{24}\b)[A-Za-z0-9]{24}\b/ },
      ],
      // Responses API 把上游的 msg_/rs_ 原样透传，这是带厂商前缀的强证据
      streamId: [
        { channel: 'responses', label: 'Responses API', evidence: 'vendor-prefix',
          re: /^(?:msg|rs|fc|fo)_[0-9a-f]{16,}/i },
      ],
      traits: { streamId: /^(?:msg|rs|fc|fo)_[0-9a-f]{16,}/i, reasoning: 'markers-only' },
    },
    {
      id: 'deepseek',
      label: 'DeepSeek 家族',
      vendors: ['deepseek'],
      toolCall: [
        // call_00_WeOEoA5EAINT3wvspCUu6195 —— 关键是**两位序号中缀**，
        // OpenAI 的 call_ 后面直接跟随机串，没有这一段。
        { channel: 'api', label: 'DeepSeek API', evidence: 'shape',
          re: /\bcall_\d+_(?:[A-Za-z0-9]{16,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{8,})\b/i },
      ],
      /*
       * ⚠ 这里曾登记过 /^(?:txt|reasoning)-\d+$/（流事件 id 前缀），**已撤销**：
       * GLM / 混元 / Kimi 的样本流事件 id 完全一样。那是 arena 的 OpenAI 兼容
       * 适配器统一改写的结果，多家共用，不是厂商特征。别再加回来。
       */
      streamId: [],
      traits: { streamId: /^(?:txt|reasoning)-\d+$/, reasoning: 'visible-text' },
    },
    {
      id: 'hunyuan',
      label: '混元家族',
      vendors: ['tencent', 'stepfun', 'qwen'],
      toolCall: [
        { channel: 'vllm-compatible', label: 'vLLM 兼容接口', evidence: 'shape',
          re: /\bchatcmpl-tool-[0-9a-f]{12,}\b/i },
        { channel: 'uuid-call', label: 'UUID 工具调用接口', evidence: 'shape',
          re: /\bcall_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
      ],
      streamId: [],
      traits: { streamId: /^(?:txt|reasoning)-\d+$/, reasoning: 'visible-text' },
    },
    {
      /*
       * 一个形态、多个厂商 —— 这是真实情况，不是偷懒。
       *
       * 实测 GLM 与 MiMo 的 toolCallId **逐位同构**：
       *     glm-5.3       call_f2e89a581fc149f4b757bd16
       *     mimo-v2.6-pro call_ce3d2228c5e7440680f460fb
       * 都是 call_ + 24 位纯小写十六进制，没有任何可区分的位。
       * Qwen 按用户确认也走同一套（暂无本地样本，见 vendors 注释）。
       *
       * 所以这个家族**同时代表这几家**：界面上并列显示，型号候选也放开到
       * 这几家。硬选一家既无依据，也会把正确答案挡在外面。
       */
      id: 'hex-call',
      label: 'GLM / MiMo / Qwen 家族',
      // z-ai = GLM，xiaomi = MiMo，qwen 由用户确认（尚无本地样本佐证）
      vendors: ['z-ai', 'xiaomi', 'qwen', 'minimax'],
      toolCall: [
        { channel: 'openai-compatible', label: 'OpenAI 兼容接口（十六进制 ID）',
          evidence: 'shape', re: /\bcall_[0-9a-f]{24}\b/ },
      ],
      streamId: [],
      traits: { streamId: /^(?:txt|reasoning)-\d+$/, reasoning: 'visible-text' },
    },
    {
      id: 'gemini',
      label: 'Gemini 家族',
      vendors: ['google'],
      toolCall: [
        // ZxOvd2KRse0qDXbP / NUeFztO4rXi5knHX / m8uVtKT0sawyfsEC
        // 16 位、**完全没有前缀**、大小写混排。Google 的 function call 规范
        // 本来就不产生前缀 ID，三份样本一致。
        // 要求同时含大小写，避免把纯十六进制或纯数字串吃进来。
        { channel: 'function-call', label: 'Google function call', evidence: 'shape',
          re: /^(?=[A-Za-z0-9]{16}$)(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{16}$/ },
      ],
      streamId: [],
      // 实测：纯序号 id，且完全没有 reasoning 事件（thought signature 不下发）
      traits: { streamId: /^\d+$/, reasoning: 'none' },
    },
    {
      id: 'kimi',
      label: 'Kimi 家族',
      vendors: ['moonshotai'],
      toolCall: [
        // bash_0_721b0c3f —— <工具名>_<序号>_<短十六进制>。
        // 把工具名嵌进 ID 是很少见的做法，区分度高。
        { channel: 'api', label: 'Moonshot API', evidence: 'shape',
          re: /^(?!call_)[A-Za-z][A-Za-z0-9_-]*_\d+_[0-9a-f]{6,24}$/ },
        { channel: 'functions', label: 'Moonshot Functions API', evidence: 'shape',
          re: /^functions\.[\w-]+:\d+$/ },
      ],
      streamId: [],
      traits: { streamId: /^(?:txt|reasoning)-\d+$/, reasoning: 'visible-text' },
    },

    /*
     * 2026-10-13 起观测到的新形态：`tc_` + 22 位。实测三个样本：
     *   tc_WuPm9ayqRrYXb022YC8TRc
     *   tc_iP9dsSMFaUF1TmSyBT1SlG
     *   tc_KarVFrOxLBSMJFreAJeCY-   ← 注意结尾的 `-`
     *
     * 第三个样本把字符集问题暴露了出来：**不是 base62，是 base64url**（含 `-` 和 `_`）。
     * 原规则写的是 [A-Za-z0-9]{20,28}，它之所以还能命中，纯属因为那个 `-` 正好落在
     * 最后一位、前面剩下 21 位仍然够数。只要 `-` 或 `_` 出现在中间，整条规则就漏判，
     * 然后退回「未分类家族」—— 恰恰是本条目想消灭的那句误导人的话。
     * 所以字符集必须按 base64url 写，并且用否定前瞻代替 \b（`-` 后面没有词边界）。
     *
     * 它**不来自任何上游厂商**：各家的工具调用 ID 前缀都已登记在上面，没有一家用 `tc_`。
     * 合理解释是 arena 这一层把上游 ID 统一重写了。
     *
     * 登记它**不是为了判厂商** —— vendors 刻意留空，就是要让它走「不收窄」那条路：
     *   vendors: [] ⇒ background.js 里 famVendors 为空 ⇒ unknownFamily ⇒ vendorHint 为 null
     * 行为与「未分类」完全一致，一个候选都不会被它筛掉。
     *
     * 那为什么还要登记？因为「未分类家族 —— ID 形态不符合任何已登记家族」这句话会把人
     * 引向「再跑几轮/补个规则就好了」。事实不是这样：上游 ID 被统一重写之后，
     * 指纹通道是**永久关闭**的，补规则也救不回来。这一条就是为了把话说准。
     *
     * ⚠ 永远不要给它填 vendors。一旦填了，就是在没有证据的情况下断言厂商。
     */
    {
      id: 'arena-normalized',
      label: 'Arena 统一工具调用 ID（不含厂商信息）',
      vendors: [],
      toolCall: [
        { channel: 'arena-rewrite', label: 'Arena 重写层', evidence: 'shape',
          re: /\btc_[A-Za-z0-9_-]{20,28}(?![A-Za-z0-9_-])/ },
      ],
      streamId: [],
      traits: {},
    },
  ];

  const FAMILY_UNCLASSIFIED = 'unclassified';

  // 比价范围 = 全部已登记家族的厂商并集。background.js 的厂商目录兜底与测试都
  // 从这里取，不再各抄一份名单。
  const VENDOR_SCOPE = [...new Set(FAMILIES.flatMap((f) => f.vendors))];

  // pricing.js 提供 SSE 解析与 URL 小工具；浏览器里它先于本文件加载，
  // Node 里按需 require（tools/ 与测试走这条路）。
  const pricing = () => root.ArenaPricing
    || (typeof require === 'function' ? require('./pricing.js') : null);

  /**
   * 单遍扫描全部 /out 流，一次拿齐三类观测：
   *   calls      工具调用（tool-input-start）
   *   streamIds  流事件 id（text-start / reasoning-start）
   *   reasoning  reasoning 签名（与 pricing.js 的四种取值一致：
   *              none / markers-only / empty-deltas / visible-text）
   * extractToolCalls / extractStreamIds / observeTraits / classifyFamily 都是
   * 它的投影，别再各自解析一遍 SSE。
   */
  function scan(captures, sseRecords) {
    const P = pricing();
    const parse = sseRecords || (P && P.sseRecords) || null;
    const calls = [];
    const streamIds = [];
    let sawReasoning = false;
    let deltaCount = 0;
    let textLength = 0;
    if (P && parse) {
      for (const capture of (captures || [])) {
        const url = (capture && capture.url) || '';
        if (!P.isOutUrl(url)) continue;
        const sid = P.sessionOf(url);
        let messageId = null;
        const records = Array.isArray(capture && capture._parsedEvents) ? capture._parsedEvents : parse(capture.responseBody);
        for (const record of records) {
          const d = (record && record.data) || {};
          if (d.type === 'start' && d.messageId) messageId = String(d.messageId);
          if (d.type === 'tool-input-start' && d.toolCallId) {
            calls.push({ sessionId: sid, messageId,
              toolCallId: String(d.toolCallId), toolName: String(d.toolName || ''),
              ts: Number(capture.ts) || 0 });
          }
          if ((d.type === 'text-start' || d.type === 'reasoning-start') && d.id !== undefined) {
            streamIds.push({ type: d.type, id: String(d.id) });
          }
          if (d.type === 'reasoning-start') sawReasoning = true;
          if (d.type === 'reasoning-delta') {
            deltaCount += 1;
            textLength += String(d.delta || d.text || '').length;
          }
        }
      }
    }
    const reasoning = !sawReasoning ? 'none'
      : (!deltaCount ? 'markers-only'
        : (textLength > 0 ? 'visible-text' : 'empty-deltas'));
    return { calls, streamIds, traits: { streamIds: streamIds.map((s) => s.id), reasoning } };
  }

  /** 单个工具调用 ID 的判定。返回 null 表示没有任何家族命中。 */
  function matchToolCall(id) {
    const s = String(id || '');
    if (!s) return null;
    for (const fam of FAMILIES) {
      for (const p of fam.toolCall) {
        if (p.re.test(s)) {
          return { family: fam.id, label: fam.label,
            vendors: fam.vendors.slice(), vendor: fam.vendors[0],
            channel: p.channel, channelLabel: p.label,
            evidence: p.evidence || 'shape', sample: s };
        }
      }
    }
    return null;
  }

  /** 单个流事件 id 的判定（弱证据；目前没有任何家族登记规则）。 */
  function matchStreamId(id) {
    const s = String(id == null ? '' : id);
    if (!s) return null;
    for (const fam of FAMILIES) {
      for (const p of (fam.streamId || [])) {
        if (p.re.test(s)) {
          return { family: fam.id, label: fam.label,
            vendors: fam.vendors.slice(), vendor: fam.vendors[0],
            channel: p.channel, channelLabel: p.label,
            evidence: p.evidence || 'stream-shape', sample: s };
        }
      }
    }
    return null;
  }

  /** 抽出全部工具调用。 */
  const extractToolCalls = (captures, sseRecords) => scan(captures, sseRecords).calls;

  /** 抽出流事件 id（text-start / reasoning-start）。 */
  const extractStreamIds = (captures, sseRecords) => scan(captures, sseRecords).streamIds;

  /** 观测本次会话的伴随特征：流事件 id 形态 + reasoning 签名。 */
  const observeTraits = (captures, sseRecords) => scan(captures, sseRecords).traits;

  /** 把观测到的特征和家族登记的画像比对。 */
  function corroborate(fam, observed) {
    const expect = (fam && fam.traits) || null;
    if (!expect) return { checked: false, matched: [], conflicted: [] };
    const matched = [];
    const conflicted = [];
    if (expect.streamId && observed.streamIds.length) {
      const all = observed.streamIds.every((id) => expect.streamId.test(id));
      (all ? matched : conflicted).push('流事件 id 形态');
    }
    if (expect.reasoning && observed.reasoning !== 'none') {
      (expect.reasoning === observed.reasoning ? matched : conflicted).push('reasoning 签名');
    }
    return { checked: matched.length + conflicted.length > 0, matched, conflicted };
  }

  /**
   * 家族判定。
   *
   * 先看工具调用（强证据），没有再看流事件 id（弱证据）。
   * 两者都没命中就是未分类。
   */
  function classifyFamily(captures, sseRecords) {
    const { calls, streamIds, traits } = scan(captures, sseRecords);

    const strong = [];
    for (const call of calls) {
      const hit = matchToolCall(call.toolCallId);
      if (hit) strong.push(hit);
    }
    const vendorStrong = strong.filter((h) => h.vendors && h.vendors.length > 0);
    if (vendorStrong.length) {
      const fam = FAMILIES.find((f) => f.id === vendorStrong[0].family);
      return Object.assign(summarize(vendorStrong, 'tool-call', calls.length, corroborate(fam, traits), traits), { toolCalls: calls });
    }

    const weak = [];
    for (const s of streamIds) {
      const hit = matchStreamId(s.id);
      if (hit) weak.push(hit);
    }
    if (weak.length) {
      const fam = FAMILIES.find((f) => f.id === weak[0].family);
      return Object.assign(summarize(weak, 'stream-id', calls.length, corroborate(fam, traits), traits), { toolCalls: calls });
    }

    if (strong.length) {
      const fam = FAMILIES.find((f) => f.id === strong[0].family);
      return Object.assign(summarize(strong, 'tool-call', calls.length, corroborate(fam, traits), traits), { toolCalls: calls });
    }

    const observed = calls.length > 0 || streamIds.length > 0;
    return {
      family: FAMILY_UNCLASSIFIED,
      label: '未分类家族',
      vendors: [],
      vendor: null,
      observed,
      evidenceKind: null,
      toolCallCount: calls.length,
      toolCalls: calls,
      evidenceCount: 0,
      channels: [],
      channelLabels: [],
      sample: calls.length ? calls[0].toolCallId : (streamIds[0] ? streamIds[0].id : null),
      traits,
      corroboration: { checked: false, matched: [], conflicted: [] },
      detail: observed
        ? '观测到流事件，但 ID 形态不符合任何已登记家族。这只说明「没有匹配到证据」，不能据此认定是哪一家。'
        : '本会话还没有可用的流事件。开始监听后完整跑一轮对话 —— '
          + '纯文本轮能拿到流事件 ID（弱证据），让它执行一次工具调用则能拿到更硬的证据。',
    };
  }

  function summarize(hits, kind, toolCallCount, corroboration, traits) {
    // 多家族同时命中几乎不可能；真出现就取出现最多的那个，并在 detail 里点出来。
    const tally = new Map();
    for (const h of hits) tally.set(h.family, (tally.get(h.family) || 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const mine = hits.filter((h) => h.family === top);
    const conflict = tally.size > 1;
    const weak = kind === 'stream-id';
    return {
      family: top,
      label: mine[0].label,
      vendors: mine[0].vendors.slice(),
      // 单厂商家族时 vendor 即该厂商；多厂商家族取首项仅作兼容，判定一律用 vendors
      vendor: mine[0].vendor,
      observed: true, // 有命中必然有观测
      evidenceKind: kind,
      toolCallCount,
      evidenceCount: mine.length,
      channels: [...new Set(mine.map((h) => h.channel))],
      channelLabels: [...new Set(mine.map((h) => h.channelLabel))],
      evidenceStrength: mine[0].evidence || 'shape',
      sample: mine[0].sample,
      traits: traits || null,
      corroboration: corroboration || { checked: false, matched: [], conflicted: [] },
      detail: ((mine[0].vendors && mine[0].vendors.length === 0)
        ? '该 ID 由 arena 这一层**统一重写**，不携带任何上游厂商信息 —— 厂商指纹通道已失效，'
          + '候选不会被收窄（再多跑几轮也不会好转，这不是采样不足）。'
          + '型号定位改为完全依赖 basePrice 残差法：价格与缓存价都相同的型号将无法区分，'
          + '但**反解出的 token 数不受影响**（单价相同 ⇒ 解相同）。'
        : mine[0].evidence === 'shape'
        ? '依据工具调用 ID 的**字符形态**判定。这是形态级证据 —— 采用同样 ID 格式的'
          + '其它实现也会命中，强度低于带厂商专属前缀的 ID。'
        : weak
        ? '依据流事件 ID 前缀判定。这是**较弱**的证据 —— 它比工具调用 ID 更容易被中间层改写。让模型执行一次工具调用可拿到更硬的证据。'
          : '依据工具调用 ID 判定。该 ID 由上游 API 生成，格式随厂商而定，第三方难以伪造。')
        + (conflict ? ' ⚠ 同时命中了多个家族，证据互相矛盾，请人工复核。' : '')
        + ((corroboration && corroboration.conflicted.length)
          ? ` ⚠ 伴随特征与该家族画像不符（${corroboration.conflicted.join('、')}），存疑。`
          : ((corroboration && corroboration.matched.length)
            ? ` 伴随特征（${corroboration.matched.join('、')}）与画像一致，可佐证。`
            : '')),
    };
  }

  const API = {
    FAMILIES,
    FAMILY_UNCLASSIFIED,
    VENDOR_SCOPE,
    matchToolCall,
    matchStreamId,
    observeTraits,
    corroborate,
    extractToolCalls,
    extractStreamIds,
    classifyFamily,
  };

  root.ArenaFamily = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);