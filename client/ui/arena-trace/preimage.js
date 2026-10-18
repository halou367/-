/*
 * preimage.js — token 整数原像（精确十进制，零浮点）
 *
 * 为什么需要这个模块：
 *   GET /api/chat/{id}/cost 只给每个通道的**美元金额**（inputTokensCostUsd /
 *   outputTokensCostUsd / cacheReadTokensCostUsd / cacheWriteTokensCostUsd），
 *   从头到尾**没有任何 token 计数字段**。想拿到 token 数，只能从金额反解。
 *
 * 和 pricing.js 里 decomposeTokens() 的区别：
 *   decomposeTokens 走的是浮点 Math.round(cost / price)，它**永远给得出一个数**——
 *   分不清「唯一解」「无解」「两个整数都成立」。本模块用整数区间法，三种情况分开报，
 *   拿不准就明说拿不准。两者并存、互不纠正（和平台 Token / 反推 Token 并排同一个原则）。
 *
 * 数学：平台按 round(price × n / 1e6, 10位) 计费，于是
 *     round(P·n·1e4 / 10^k) == C     （都以 1e-10 USD 为单位，price = P/10^k）
 *   等价于整数区间
 *     (2C−1)·10^k ≤ 2·P·n·10^4 < (2C+1)·10^k
 *   区间宽度约 1e-4/price 个 token，所以落在里面的整数通常只有 0 或 1 个。
 *
 * 参考费率方程（与模型无关，这是缺单价时唯一的额外约束）：
 *     base × 1e10 == in·n_in + cw·n_cw + cr·n_cr + out·n_out
 *   系数单位是 1e-10 USD/token，和模型自己的价无关 —— 所以即使目录里查不到单价，
 *   这条方程照样能把 token 组合钉死。
 */
(function (root) {
  'use strict';

  const COMPONENTS = ['input', 'output', 'cacheRead', 'cacheWrite'];
  const CACHE_COMPONENTS = ['cacheRead', 'cacheWrite'];

  /** 分项 → /cost 响应里的字段名（实测 schema）。 */
  const COST_FIELD = {
    input: 'inputTokensCostUsd',
    output: 'outputTokensCostUsd',
    cacheRead: 'cacheReadTokensCostUsd',
    cacheWrite: 'cacheWriteTokensCostUsd',
  };

  const TEN = 10n;
  const QUANTUM_DIGITS = 10;          // 平台的量化单位是 1e-10 USD
  const MAX_CANDIDATES = 8;           // 单通道候选上限
  const MAX_ASSIGN_NODES = 4096;      // 参考方程 DFS 节点上限

  /**
   * 参考费率版本表：base × 1e10 = Σ coef·n，系数单位 1e-10 USD/token。
   * 换算成常见口径：2156 ⇒ $0.2156/M tokens。
   * 平台换费率时这张表要加新版本，不要改旧版本 —— 历史消息还得用旧的对账。
   */
  const REF_VERSIONS = [
    { id: 'ref-10-14', input: 3200n, cacheWrite: 2695n, cacheRead: 160n, output: 8700n },
    { id: 'ref-10-09', input: 4350n, cacheWrite: 5438n, cacheWriteHalf: 10875n, cacheRead: 150n, output: 12000n },
    { id: 'ref-10-08-16h', input: 4000n, cacheWrite: 5000n, cacheRead: 150n, output: 12000n },
    { id: 'ref-10-05/08', input: 2156n, cacheWrite: 2695n, cacheRead: 100n, output: 6468n },
    { id: 'ref-10-01', input: 2156n, cacheWrite: 2695n, cacheRead: 200n, output: 12000n },
  ];

  // ───────────────────────────────────────────── 1. 精确十进制（BigInt）

  /** 十进制字面量 → { neg, P, k }，值 = ±P/10^k。支持 1e-7 这种写法。非法返回 null。 */
  function parseDec(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s);
    if (!m || (!m[2] && !m[3])) return null;
    const neg = m[1] === '-';
    let P = BigInt((m[2] || '0') + (m[3] || ''));
    let k = (m[3] || '').length;
    const exp = m[4] ? Number(m[4]) : 0;
    if (exp > 0) {
      if (k >= exp) { k -= exp; } else { P *= TEN ** BigInt(exp - k); k = 0; }
    } else if (exp < 0) {
      k += -exp;
    }
    return { neg, P, k };
  }

  /** 金额字符串 → 有符号 BigInt，单位 1e-10（round half away from zero）。 */
  function quanta10(value) {
    const d = parseDec(value);
    if (!d) return null;
    const { neg, P, k } = d;
    let q;
    if (k <= QUANTUM_DIGITS) {
      q = P * TEN ** BigInt(QUANTUM_DIGITS - k);
    } else {
      const div = TEN ** BigInt(k - QUANTUM_DIGITS);
      q = (2n * P + div) / (2n * div);
    }
    return neg ? -q : q;
  }

  /** 非负 quanta(1e-10) → 去掉尾随零的十进制字符串。 */
  function formatQuanta(q) {
    const s = q.toString().padStart(QUANTUM_DIGITS + 1, '0');
    const intPart = s.slice(0, s.length - QUANTUM_DIGITS);
    const frac = s.slice(s.length - QUANTUM_DIGITS).replace(/0+$/, '');
    return frac ? intPart + '.' + frac : intPart;
  }

  /** 非负 BigInt 的 gcd。 */
  function gcdBig(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y) { const t = x % y; x = y; y = t; }
    return x;
  }

  /** 单价标量化：单元素数组视作该值；多元素数组返回 null（必须由调用方选分支）。 */
  function scalarPrice(p) {
    if (p === null || p === undefined) return null;
    if (Array.isArray(p)) {
      const vals = p.filter((x) => x !== null && x !== undefined);
      return vals.length === 1 ? String(vals[0]) : null;
    }
    return String(p);
  }

  // ───────────────────────────────────────────── 2. 整数原像

  /**
   * 所有满足 round(price·n/1e6, 1e-10) === cost 的非负整数 n。
   *   · cost 恰为 0 且 price > 0  ⇒ [0n]（唯一走法）
   *   · price ≤ 0 / cost < 0      ⇒ []（无解，注意：这不等于「免费」）
   */
  function tokensForCostAll(costStr, priceStr, maxResults = MAX_CANDIDATES) {
    const C = quanta10(costStr);
    const p = parseDec(priceStr);
    if (C === null || !p) return [];
    if (p.neg || p.P === 0n) return [];
    if (C < 0n) return [];
    if (C === 0n) return [0n];

    const pow = TEN ** BigInt(p.k);
    const numLo = (2n * C - 1n) * pow;
    const numHi = (2n * C + 1n) * pow;
    const den = 2n * p.P * TEN ** 4n;
    const nMin = numLo <= 0n ? 0n : (numLo + den - 1n) / den;
    const nMax = numHi / den;
    if (nMax < nMin) return [];

    const out = [];
    for (let n = nMin; n <= nMax && out.length < maxResults; n++) {
      const a = p.P * n * TEN ** 4n;
      const q = (2n * a + pow) / (2n * pow);
      if (q === C) out.push(n);
    }
    return out;
  }

  /** 唯一整数解；无解或多解都返回 null —— 不猜。 */
  function tokensForCost(costStr, priceStr) {
    const ns = tokensForCostAll(costStr, priceStr, 2);
    return ns.length === 1 ? ns[0] : null;
  }

  // ───────────────────────────────────────────── 3. 参考方程

  /** 在各通道候选表里找一组满足 base 参考方程的组合。找不到返回 null。 */
  function searchAssignment(lists, refV, baseStr) {
    const baseQ = quanta10(baseStr);
    if (baseQ === null) return null;
    const combo = COMPONENTS.map(() => 0n);
    let nodes = 0;
    const dfs = (i) => {
      if (nodes++ > MAX_ASSIGN_NODES) return null;
      if (i === COMPONENTS.length) {
        let sum2 = 0n;
        for (let j = 0; j < COMPONENTS.length; j++) {
          const comp = COMPONENTS[j];
          const c2 = (comp === 'cacheWrite' && refV.cacheWriteHalf) ? refV.cacheWriteHalf : (2n * refV[comp]);
          sum2 += c2 * combo[j];
        }
        const sum = (sum2 + 1n) / 2n;
        if (sum !== baseQ && (sum2 / 2n) !== baseQ) return null;
        const tokens = {};
        for (let j = 0; j < COMPONENTS.length; j++) tokens[COMPONENTS[j]] = combo[j];
        return tokens;
      }
      for (const n of lists[i]) {
        combo[i] = n;
        const hit = dfs(i + 1);
        if (hit) return hit;
      }
      return null;
    };
    return dfs(0);
  }

  /** charged == base × costMultiplier × marginMultiplier（精确判定）。数据不全 ⇒ null。 */
  function chargedIdentity(baseStr, chargedStr, cm, mm) {
    if (baseStr == null || chargedStr == null || cm == null || mm == null) return null;
    const b = quanta10(baseStr);
    const ch = quanta10(chargedStr);
    const a = parseDec(String(cm));
    const c = parseDec(String(mm));
    if (b === null || ch === null || !a || !c) return null;
    const den = TEN ** BigInt(a.k + c.k);
    const lhs = ch * den * (a.neg ? -1n : 1n) * (c.neg ? -1n : 1n);
    const rhs = b * a.P * c.P;
    return lhs === rhs;
  }

  // ───────────────────────────────────────────── 4. 单条消息求解

  /**
   * 一条消息 × 一个价格向量 ⇒ token 数。
   *
   * status:
   *   'exact'        四个通道都定死了（参考方程也对上 ⇒ refVersion 非空）
   *   'ambiguous'    有通道落下多个整数候选，没有参考方程能收敛
   *   'no-solution'  某通道在给定单价下无整数解 ⇒ 这个价向量被证伪
   *   'missing-price' 缺单价且该通道费用 > 0
   *   'unobserved'   该通道费用字段压根没返回
   */
  function solveMessage(msg, prices, refVersions) {
    const versions = refVersions || REF_VERSIONS;
    const res = {
      status: null, tokens: null, refVersion: null,
      candidates: {}, missingPrices: [], unobserved: [],
      chargedIdentity: chargedIdentity(msg.base, msg.charged, msg.cm, msg.mm),
      total: null,
    };
    const lists = {};

    for (const comp of COMPONENTS) {
      const cost = msg.costs ? msg.costs[comp] : null;
      if (cost === null || cost === undefined) { res.unobserved.push(comp); lists[comp] = null; continue; }
      const price = scalarPrice(prices ? prices[comp] : null);
      if (price === null) {
        // 费用为 0 时不需要单价也能断定 n=0（前提：单价 > 0）
        if (quanta10(cost) === 0n) { lists[comp] = [0n]; res.candidates[comp] = ['0']; continue; }
        res.missingPrices.push(comp);
        lists[comp] = null;
        continue;
      }
      const ns = tokensForCostAll(String(cost), price);
      if (!ns.length) { res.status = 'no-solution'; res.failedComponent = comp; return res; }
      lists[comp] = ns;
      res.candidates[comp] = ns.map(String);
    }

    if (res.unobserved.length) { res.status = 'unobserved'; return res; }
    if (res.missingPrices.length) { res.status = 'missing-price'; return res; }

    // 参考方程优先：能对上就是唯一确定解。
    const ordered = COMPONENTS.map((c) => lists[c]);
    if (msg.base != null) {
      for (const v of versions) {
        const tokens = searchAssignment(ordered, v, String(msg.base));
        if (tokens) {
          res.status = 'exact';
          res.refVersion = v.id;
          res.tokens = {};
          let t = 0n;
          for (const c of COMPONENTS) { res.tokens[c] = tokens[c].toString(); t += tokens[c]; }
          res.total = t.toString();
          return res;
        }
      }
    }

    // 参考方程对不上（或没有 base）：各通道各自唯一就仍算定死。
    if (COMPONENTS.every((c) => lists[c].length === 1)) {
      res.status = 'exact';
      res.tokens = {};
      let t = 0n;
      for (const c of COMPONENTS) { res.tokens[c] = lists[c][0].toString(); t += lists[c][0]; }
      res.total = t.toString();
      return res;
    }

    res.status = 'ambiguous';
    return res;
  }

  // ───────────────────────────────────────────── 5. 缺单价时反解单价

  /**
   * 只缺一个缓存通道的单价时，用 base 参考方程把它的 token 数定出来，
   * 再由 n 和费用反推单价（要求整条会话同一个价）。
   * 返回 { ok, component, tokens:Map(msgId→n), priceLo, priceHi } 或 { ok:false, why }。
   */
  function derivePriceForMissing(messages, prices, refV) {
    const missing = CACHE_COMPONENTS.filter((c) => scalarPrice(prices ? prices[c] : null) === null);
    if (missing.length !== 1) return { ok: false, why: missing.length ? '两个缓存价都未知' : '没有缺失的缓存价' };
    const U = missing[0];
    const coefU = refV[U];
    if (!coefU || coefU <= 0n) return { ok: false, why: '参考系数 ≤0，无法由 base 约束' };

    const tokens = {};
    for (const m of messages) {
      const baseQ = m.base == null ? null : quanta10(String(m.base));
      if (baseQ === null) return { ok: false, why: '消息 ' + m.id + ' 没有 basePriceUsd' };
      // 已定价通道各自的唯一候选（多解就放弃，不枚举组合）
      let rest = baseQ;
      for (const c of COMPONENTS) {
        if (c === U) continue;
        const cost = m.costs ? m.costs[c] : null;
        if (cost === null || cost === undefined) return { ok: false, why: '消息 ' + m.id + ' 的 ' + c + ' 未观测' };
        const price = scalarPrice(prices ? prices[c] : null);
        if (price === null) return { ok: false, why: '消息 ' + m.id + ' 的 ' + c + ' 也缺价' };
        const n = tokensForCost(String(cost), price);
        if (n === null) return { ok: false, why: '消息 ' + m.id + ' 的 ' + c + ' 无唯一整数解' };
        rest -= refV[c] * n;
      }
      if (rest < 0n || rest % coefU !== 0n) return { ok: false, why: '消息 ' + m.id + ' 的 base 残差不是 ' + U + ' 系数的整数倍' };
      const nU = rest / coefU;
      const cu = m.costs ? m.costs[U] : null;
      const Cu = cu == null ? null : quanta10(String(cu));
      if (Cu === null) return { ok: false, why: '消息 ' + m.id + ' 的 ' + U + ' 未观测' };
      if (Cu === 0n ? nU !== 0n : nU <= 0n) return { ok: false, why: '消息 ' + m.id + ' 的零费用与 token 数矛盾' };
      tokens[m.id] = nU.toString();
    }

    // 由 (n, cost) 反推单价区间：price ∈ [ (2C−1)·1e6 / (2n) , (2C+1)·1e6 / (2n) )，单位 1e-10
    let lo = null;
    let hi = null;
    for (const m of messages) {
      const nU = BigInt(tokens[m.id]);
      if (nU === 0n) continue;
      const C = quanta10(String(m.costs[U]));
      const a = (2n * C - 1n) * TEN ** 6n;
      const b = (2n * C + 1n) * TEN ** 6n;
      const l = (a + 2n * nU - 1n) / (2n * nU);
      const h = b / (2n * nU);
      lo = lo === null || l > lo ? l : lo;
      hi = hi === null || h < hi ? h : hi;
    }
    if (lo !== null && hi !== null && lo > hi) return { ok: false, why: '各消息反推出的单价区间不相交（价向量被证伪）' };
    return {
      ok: true, component: U, tokens,
      priceLo: lo === null ? null : formatQuanta(lo),
      priceHi: hi === null ? null : formatQuanta(hi),
    };
  }

  // ───────────────────────────────────────────── 6. /cost 响应 → 规范化消息

  /** /cost JSON ⇒ 消息数组（messages 既支持 {id: obj} 也支持 [obj, ...]）。 */
  function extractMessages(costJson) {
    const out = [];
    const raw = costJson ? costJson.messages : null;
    const push = (id, m) => {
      const actual = (m && (m.actual || m.costDetail || m.cost)) || {};
      const costs = {};
      for (const comp of COMPONENTS) {
        const v = actual[COST_FIELD[comp]];
        costs[comp] = v === undefined || v === null ? null : String(v);
      }
      out.push({
        id: String(id),
        costs,
        base: m && m.basePriceUsd != null ? String(m.basePriceUsd) : null,
        charged: m && m.totalChargedUsd != null ? String(m.totalChargedUsd) : null,
        cm: m && m.costMultiplier != null ? m.costMultiplier : null,
        mm: m && m.marginMultiplier != null ? m.marginMultiplier : null,
        credits: m && m.totalChargedCredits != null ? m.totalChargedCredits : null,
        isLongContext: actual.isLongContext === true,
        pricingStrategy: m && m.pricingStrategy != null ? String(m.pricingStrategy) : null,
      });
    };
    if (Array.isArray(raw)) raw.forEach((m, i) => push((m && (m.id != null ? m.id : m.messageId)) || ('#' + i), m));
    else if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) push(k, raw[k]);
    return out;
  }

  /**
   * 整个会话求解。prices 缺缓存价时会先尝试反解出来再求。
   * 返回 { messages:[{id,...solveMessage}], derivedPrice, totals, summary }。
   */
  // 会话级求解的内核，吃**已经抽好**的消息数组。拆出来是为了两种喂法共用：
  //   1. /cost 原始 JSON  → extractMessages → 这里（即下面的 solveSession）
  //   2. 后台累积的扣费账本 → 这里
  // 账本跨轮累积，比任何单次 /cost 响应都全，是面板会话级反解的实际来源。
  function solveMessages(msgs, prices, refVersions) {
    const versions = refVersions || REF_VERSIONS;
    let used = prices || {};
    let derivedPrice = null;

    const needDerive = CACHE_COMPONENTS.filter((c) => scalarPrice(used[c]) === null).length === 1;
    if (needDerive && msgs.length) {
      for (const v of versions) {
        const d = derivePriceForMissing(msgs, used, v);
        if (d.ok) {
          derivedPrice = Object.assign({ refVersion: v.id }, d);
          // 用区间下端当代表值（区间通常极窄）
          used = Object.assign({}, used);
          used[d.component] = d.priceLo;
          break;
        }
      }
    }

    const solved = msgs.map((m) => Object.assign({ id: m.id }, solveMessage(m, used, versions)));
    const totals = { input: 0n, output: 0n, cacheRead: 0n, cacheWrite: 0n };
    let exact = 0;
    for (const s of solved) {
      if (s.status !== 'exact' || !s.tokens) continue;
      exact++;
      for (const c of COMPONENTS) totals[c] += BigInt(s.tokens[c]);
    }
    const totalsOut = {};
    let grand = 0n;
    for (const c of COMPONENTS) { totalsOut[c] = totals[c].toString(); grand += totals[c]; }
    totalsOut.total = grand.toString();

    return {
      messages: solved,
      derivedPrice,
      totals: exact ? totalsOut : null,
      summary: { count: solved.length, exact, ambiguous: solved.filter((s) => s.status === 'ambiguous').length,
        missingPrice: solved.filter((s) => s.status === 'missing-price').length,
        noSolution: solved.filter((s) => s.status === 'no-solution').length,
        unobserved: solved.filter((s) => s.status === 'unobserved').length },
    };
  }

  // 原始 /cost JSON 的便捷入口。行为与拆分前完全一致。
  function solveSession(costJson, prices, refVersions) {
    return solveMessages(extractMessages(costJson), prices, refVersions);
  }

  /**
   * 恒等式对不上时，把 costMultiplier 反解出来：`cm = charged / (base × mm)`。
   *
   * 「⚠ 对不上」这件事本身不提供信息，**cm 的数值才提供**：
   *   · 干净数字（1.25 / 1.5 / 2）  → 等式是对的，平台只是没回传这个字段
   *   · 1.0000003 这类            → 平台对 charged 做了量化，恒等式该加容差
   *   · 毫无规律                  → 等式结构本身不对，要重写
   *
   * 全程 BigInt 有理数，不经浮点。返回：
   *   { value, exact, num, den } —— exact=false 表示约分后分母含 2/5 以外的素因子
   *   （即不是有限小数），此时 value 是截断到 12 位小数的近似值。
   *   num/den 是约分后的分子分母，便于一眼看出是不是干净比值（如 5/4）。
   */
  function deriveCostMultiplier(baseStr, chargedStr, mm) {
    if (baseStr == null || chargedStr == null || mm == null) return null;
    const b = parseDec(String(baseStr));
    const c = parseDec(String(chargedStr));
    const m = parseDec(String(mm));
    if (!b || !c || !m) return null;
    if (b.P === 0n || m.P === 0n) return null;            // 除零
    // charged/(base×mm) = (C/10^kc) ÷ ((B/10^kb)·(M/10^km)) = C·10^(kb+km) / (B·M·10^kc)
    let num = c.P * (TEN ** BigInt(b.k + m.k));
    let den = b.P * m.P * (TEN ** BigInt(c.k));
    const neg = (!!c.neg) !== ((!!b.neg) !== (!!m.neg));
    const g = gcdBig(num, den);
    if (g > 1n) { num /= g; den /= g; }
    // 约分后分母只剩 2 和 5 ⇒ 是有限小数，截断不损失信息
    let d = den;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    const exact = d === 1n;
    const DIG = 12;
    const scaled = (num * (TEN ** BigInt(DIG))) / den;    // 向零截断
    const s = scaled.toString().padStart(DIG + 1, '0');
    let out = `${s.slice(0, s.length - DIG)}.${s.slice(s.length - DIG)}`;
    out = out.replace(/0+$/, '').replace(/\.$/, '');
    return { value: (neg ? '-' : '') + out, exact, num: num.toString(), den: den.toString() };
  }

  /**
   * 恒等式「口径」体检 —— 在谈系数之前先确认两个字段是不是同一个口径。
   *
   * 2026-10-13 实测（GPT 6 Luna，mm=2）：
   *   单条 base    = 0.0021460756   单条 charged = 0.0023938512  ⇒ 判不成立
   *   会话累计 charged = 0.0042921512 == 单条 base × 2            ⇒ 精确成立（10 位全中）
   * 也就是说平台的 basePriceUsd 是**本轮累计**、totalChargedUsd 是**单条切片**，
   * 两者根本不在一个口径上。这种情况下 deriveCostMultiplier 反解出来的所谓
   * 「成本系数」0.557727602885 其实是「最新一条 base 占累计 base 的比例」，
   * 和成本毫无关系 —— 照着它去改价格表只会越改越偏。
   *
   * 所以顺序必须是：先判口径，三个口径都不成立才轮得到谈系数。
   *   message  charged   == base       × cm × mm   ← 本该成立的那个
   *   session  Σcharged  == Σbase      × cm × mm
   *   cross    Σcharged  == base(单条)  × cm × mm   ← 累计 base 配单条 charged
   */
  function identityScopes(msg, session) {
    const m = msg || {};
    const s = session || {};
    const cm = m.cm != null ? m.cm : 1;
    const out = {
      message: chargedIdentity(m.base, m.charged, cm, m.mm),
      session: chargedIdentity(s.base, s.charged, cm, m.mm),
      cross: chargedIdentity(m.base, s.charged, cm, m.mm),
      // 单条口径下、要让等式成立所需要的 mm。缺字段和口径错配在这个数上
      // 长得完全不一样：前者给干净分数，后者给一串非有限小数。
      impliedMm: deriveCostMultiplier(m.base, m.charged, cm),
      verdict: 'unknown',
    };
    if (out.message === true) out.verdict = 'ok';
    else if (out.message === false && out.cross === true) out.verdict = 'scope-mismatch';
    else if (out.message === false && out.session === true) out.verdict = 'session-only';
    else if (out.message === false) out.verdict = 'broken';
    return out;
  }

  const API = {
    COMPONENTS, CACHE_COMPONENTS, COST_FIELD, REF_VERSIONS, QUANTUM_DIGITS,
    parseDec, quanta10, formatQuanta, gcdBig, scalarPrice,
    tokensForCostAll, tokensForCost, searchAssignment, chargedIdentity,
    solveMessage, derivePriceForMissing, extractMessages, solveMessages, solveSession,
    deriveCostMultiplier, identityScopes,
  };
  root.ArenaPreimage = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);