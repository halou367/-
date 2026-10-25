  const MODEL_NAME_MAX_RE = /^(?:qwen[\d.]*|qwen-\d[\d.]*|glm-[\d.]+|minimax[\w.-]*|step-[\d.]+|yi-[\w.-]+|gpt-[\d.]+-codex)-max(?:-0\d{3}|-\d{4,8})?$/i;
  const OPEN_NO_TIER_BASE_RE = /^(?:(?:qwen[\d.]*|qwen-\d[\d.]*|glm-[\d.]+)-max(?:-0\d{3}|-\d{4,8})?|kimi-k\d[\d.]*|deepseek-v[\d.]+-flash(?:-\d+)?|mimo-v[\d.]+-(?:flash|pro)|qwen[\d.]*-flash(?:-next)?|glm-[\d.]+-flash|minimax-m\d[\w.-]*|muse-wonder|muse-spark-open|beam-[\d.]+-\d+b-a\d+b|horizon-[\d.]+|step-\d[\w.-]*|hy\d[\w.-]*|kibitz|kalmia|solar-pro4|cynosure|inkling-small|qwen[\d.]*-\d+b(?:-a\d+b)?|glm-[\d.]+)$/i;

  const _sanitizeSlugMemo = new Map();
  const _canonHabitMemo = new Map();
  const _decompMemo = new Map();
  const _parseFamTierMemo = new Map();
  const _dispLabelMemo = new Map();
  let _protoByCanonMap = null;
  function getProtoByCanon(cKey) {
    if (!_protoByCanonMap) {
      _protoByCanonMap = new Map();
      for (const p of PROTOTYPES) {
        const pk = String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase();
        if (pk && !_protoByCanonMap.has(pk)) _protoByCanonMap.set(pk, p);
        const pc = String(canonHabitModelName(p.label || p.id) || '').toLowerCase();
        if (pc && !_protoByCanonMap.has(pc)) _protoByCanonMap.set(pc, p);
      }
    }
    return _protoByCanonMap.get(cKey) || null;
  }

  function sanitizeCorruptedTierSlug(str, rawHint = '') {
    if (!str) return '';
    const mKey = rawHint ? (String(str) + '\u0001' + String(rawHint)) : String(str);
    const hit = _sanitizeSlugMemo.get(mKey);
    if (hit !== undefined) return hit;
    let out = String(str).trim().replace(/\s*\((?:标准|standard)\)\s*$/i, '');
    if (/qwen3\.8-max-0902/i.test(String(rawHint || '')) && /^qwen3\.8-max(?:-(?:none|minimal|low|medium|high|xhigh|max))?$/i.test(out)) {
      return 'qwen3.8-max-0902';
    }
    if (/^kimi-k3-max$/i.test(out)) return 'kimi-k3';
    if (/^muse-wonder-(?:none|minimal|low|medium|high|xhigh|max)$/i.test(out)) return 'muse-wonder';
    if (/^muse-spark-open-(?:none|minimal|low|medium|high|xhigh|max)$/i.test(out)) return 'muse-spark-open';
    // 清理无档位型号被误挂上的档位后缀（如 qwen3.8-max-low -> qwen3.8-max, deepseek-v4.1-flash-20260910-max -> deepseek-v4.1-flash-20260910）
    const mOpen = /^(.+?)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(out);
    if (mOpen && !MODEL_NAME_MAX_RE.test(out) && (OPEN_NO_TIER_BASE_RE.test(mOpen[1]) || MODEL_NAME_MAX_RE.test(mOpen[1]))) {
      out = mOpen[1];
    }
    // 清理双重档位后缀（如 claude-opus-5.5-high-low -> claude-opus-5.5-high）
    const mDouble = /^(.+?)-(none|minimal|low|medium|high|xhigh|max)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(out);
    if (mDouble) {
      out = `${mDouble[1]}-${mDouble[2]}`;
    }
    if (/^kimi-k3-max$/i.test(out)) out = 'kimi-k3';
    out = out
      .replace(/^qwen-3\.(8|5)-/i, 'qwen3.$1-')
      .replace(/^qwen3\.7-max\b/i, 'qwen-3.7-max')
      .replace(/^solar-pro-4\b/i, 'solar-pro4')
      .replace(/^hy-4-preview\b/i, 'hy4-preview');
    if (_sanitizeSlugMemo.size > 2400) _sanitizeSlugMemo.clear();
    _sanitizeSlugMemo.set(mKey, out);
    return out;
  }

  function canonHabitModelName(raw) {
    if (!raw) return '';
    const rawKey = String(raw);
    const memoHit = _canonHabitMemo.get(rawKey);
    if (memoHit !== undefined) return memoHit;
    const res = _canonHabitModelName0(rawKey);
    if (_canonHabitMemo.size > 2400) _canonHabitMemo.clear();
    _canonHabitMemo.set(rawKey, res);
    return res;
  }

  function _canonHabitModelName0(raw) {
    let s = String(raw).replace(/[?？]+$/, '').replace(/\s*\((?:标准|standard)\)\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!s || s === '开源模型') return s;
    if (/^(?:meta\/)?muse(?:\s*\((low|medium|high|xhigh|max)\)|-(low|medium|high|xhigh|max))?$/i.test(s)) {
      const m = /^(?:meta\/)?muse(?:\s*\((low|medium|high|xhigh|max)\)|-(low|medium|high|xhigh|max))?$/i.exec(s);
      return 'muse-spark-1.3-' + String(m?.[1] || m?.[2] || 'max').toLowerCase();
    }
    if (/gpt-5\.6-luna/i.test(s)) s = s.replace(/gpt-5\.6-luna/ig, 'gpt-6-luna');
    if (/barium-bb-v2-4xts/i.test(s)) s = s.replace(/(?:contenders\/)?barium-bb-v2-4xts(?:-(?:agent|public|vertex))?(?:-(low|medium|high|max))?/ig, (_, t) => 'gemini-4-argon-' + String(t || 'high').toLowerCase());
    if (typeof Strength !== 'undefined' && typeof Strength.canon === 'function') {
      try {
        const c = Strength.canon(s);
        if (c) {
          const normC = String(c).replace(/^muse(?:-(low|medium|high|xhigh|max))?$/i, (_, t) => 'muse-spark-1.3-' + String(t || 'max').toLowerCase()).replace(/gpt-5\.6-luna/ig, 'gpt-6-luna').replace(/\bbarium-bb-v2-4xts(?:-(?:agent|public|vertex))?(?:-(low|medium|high|max))?\b/ig, (_, t) => 'gemini-4-argon-' + String(t || 'high').toLowerCase());
          return sanitizeCorruptedTierSlug(normC, s);
        }
      } catch {}
    }
    const bare = s.replace(/^[a-z0-9_.-]+\//i, '').replace(/\[[^\]]*\]\s*/g, '').trim();
    const em = bare.match(/\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i);
    const eff = em ? em[1].toLowerCase() : '';
    const base = (em ? bare.slice(0, em.index) : bare).trim();
    const slug = base.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return s;
    if (/^muse(?:-(low|medium|high|xhigh|max))?$/i.test(slug)) {
      const tm = /^muse(?:-(low|medium|high|xhigh|max))?$/i.exec(slug);
      return 'muse-spark-1.3-' + String(eff || tm?.[1] || 'max').toLowerCase();
    }
    if (eff && !slug.endsWith('-' + eff) && !OPEN_NO_TIER_BASE_RE.test(slug) && !MODEL_NAME_MAX_RE.test(slug)) {
      return sanitizeCorruptedTierSlug(`${slug}-${eff}`, s);
    }
    return sanitizeCorruptedTierSlug(slug, s);
  }

  // 严格三元组解构器（厂商 vendor / 型号 family / 强度 effort）：
  // 铁律：有明确强度信息即提取对应档位（low/medium/high/xhigh/max），无强度信息或无档位型号一律归为「标准」（standard），绝不混入型号名或捏造伪档位
  function decomposeModelIdentity(raw, hints = {}) {
    const rawStr = String(raw || hints.rawLabel || hints.family || '').replace(/[?？]+$/, '').trim();
    const rawLabelHint = String(hints.rawLabel || '').replace(/[?？]+$/, '').trim();
    const simpleMemoKey = rawStr + '\u0001' + rawLabelHint + '\u0001' + String(hints.vendor || '') + '\u0001' + String(hints.family || '') + '\u0001' + String(hints.effort ?? '');
    if (simpleMemoKey) {
      const dHit = _decompMemo.get(simpleMemoKey);
      if (dHit !== undefined) return dHit;
    }
    if (!rawStr || rawStr === '开源模型') {
      return {
        vendor: 'compat',
        vendorLabel: '开源',
        family: '开源模型',
        familyLabel: '开源模型',
        effort: 'standard',
        effortLabel: '标准',
        hasExplicitTier: false,
        canon: '开源模型',
        displayLabel: '开源模型',
      };
    }
    const VENDOR_LABELS = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      xai: 'xAI',
      deepseek: 'DeepSeek',
      qwen: 'Qwen',
      zhipu: 'GLM',
      moonshot: 'Kimi',
      xiaomi: 'MiMo',
      meta: 'Meta',
      minimax: 'MiniMax',
      mistral: 'Mistral',
      bytedance: 'Doubao',
      compat: '开源',
    };
    const FAMILY_DISPLAY_MAP = {
      'gpt-6.1-sol': 'GPT 6.1 Sol',
      'gpt-6.1-luna': 'GPT 6.1 Luna',
      'gpt-6-astra': 'GPT 6 Astra',
      'gpt-6-sol': 'GPT 6 Sol',
      'gpt-6-luna': 'GPT 6 Luna',
      'gpt-5.6-sol': 'GPT 5.6 Sol',
      'gpt-5.6-terra': 'GPT 5.6 Terra',
      'gpt-5.6-luna': 'GPT 6 Luna',
      'claude-opus-5.6': 'Claude Opus 5.6',
      'claude-opus-5.5': 'Claude Opus 5.5',
      'claude-opus-5': 'Claude Opus 5',
      'claude-sonnet-5.5': 'Claude Sonnet 5.5',
      'claude-sonnet-5': 'Claude Sonnet 5',
      'claude-fable-5.1': 'Claude Fable 5.1',
      'claude-fable-5': 'Claude Fable 5',
      'claude-haiku-5.5': 'Claude Haiku 5.5',
      'gemini-4-argon': 'Gemini 4 Argon',
      'gemini-3.8-flash': 'Gemini 3.8 Flash',
      'gemini-3.7-flash': 'Gemini 3.7 Flash',
      'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
      'grok-4.7': 'Grok 4.7',
      'grok-4.6': 'Grok 4.6',
      'grok-4.5': 'Grok 4.5',
      'grok-4.20': 'Grok 4.20',
      'muse-spark-1.3': 'Muse Spark 1.3',
      'muse-spark-1.2': 'Muse Spark 1.2',
      'muse-wonder': 'Muse Wonder',
      'muse-spark-open': 'Muse Spark Open',
      'kimi-k3': 'Kimi K3',
      'deepseek-v4.1-flash': 'DeepSeek V4.1 Flash',
      'deepseek-v4.1-flash-1017': 'DeepSeek V4.1 Flash 1017',
      'deepseek-v4.1-flash-20260910': 'DeepSeek V4.1 Flash 20260910',
      'glm-5.3-max': 'GLM 5.3 Max',
      'glm-5.3': 'GLM 5.3',
      'glm-5.3-flash': 'GLM 5.3 Flash',
      'glm-5.2-max': 'GLM 5.2 Max',
      'glm-5.2': 'GLM 5.2',
      'qwen3.8-max': 'Qwen 3.8 Max',
      'qwen3.8-max-0902': 'Qwen 3.8 Max 0902',
      'qwen-3.7-max': 'Qwen 3.7 Max',
      'qwen3.8-flash-next': 'Qwen 3.8 Flash Next',
      'mimo-v2.6-pro': 'MiMo V2.6 Pro',
      'mimo-v2.6-flash': 'MiMo V2.6 Flash',
      'beam-1.0-501b-a23b': 'Beam 1.0 501B A23B',
    };
    const EFFORT_LABELS = {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      xhigh: 'xHigh',
      max: 'Max',
      standard: '标准',
    };

    const slugifyBase = s => {
      let b = String(s || '').trim()
        .replace(/^[a-z0-9_.-]+\//i, '')
        .replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max|标准|standard)\)\s*$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, '');
      b = b.replace(/^qwen-3\.(8|5)-/i, 'qwen3.$1-')
           .replace(/^qwen3\.7-max\b/i, 'qwen-3.7-max')
           .replace(/^solar-pro-4\b/i, 'solar-pro4')
           .replace(/^hy-4-preview\b/i, 'hy4-preview')
           .replace(/^gpt-5\.6-luna/i, 'gpt-6-luna')
           .replace(/^(?:opus|sonnet|haiku|fable)-[\d.]+$/i, m => 'claude-' + m)
           .replace(/^(?:4-argon|3\.[178]-(?:flash|pro(?:-preview)?))$/i, m => 'gemini-' + m);
      return sanitizeCorruptedTierSlug(b, rawLabelHint || rawStr);
    };

    const rawCanonOut = sanitizeCorruptedTierSlug(canonHabitModelName(rawStr), rawLabelHint || rawStr);
    const parenInCanon = /\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(rawCanonOut);
    let cleanSlug = parenInCanon
      ? (slugifyBase(rawCanonOut.slice(0, parenInCanon.index)) + '-' + parenInCanon[1].toLowerCase())
      : slugifyBase(rawCanonOut);

    let family = '';
    let effort = 'standard';

    // 优先检查是否为无档位型号或自带 -max 型号
    if (OPEN_NO_TIER_BASE_RE.test(cleanSlug) || MODEL_NAME_MAX_RE.test(cleanSlug)) {
      family = cleanSlug;
      effort = 'standard';
    } else {
      const mDash = /^(.+?)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(cleanSlug);
      if (mDash && !OPEN_NO_TIER_BASE_RE.test(mDash[1]) && !MODEL_NAME_MAX_RE.test(mDash[1])) {
        family = slugifyBase(mDash[1]);
        const rawT = mDash[2].toLowerCase();
        effort = (rawT === 'none' || rawT === 'minimal') ? 'low' : rawT;
      } else {
        family = cleanSlug;
        const mParen = /\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(rawStr) || /\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(rawLabelHint);
        if (mParen && !OPEN_NO_TIER_BASE_RE.test(family) && !MODEL_NAME_MAX_RE.test(family)) {
          const rawT = mParen[1].toLowerCase();
          effort = (rawT === 'none' || rawT === 'minimal') ? 'low' : rawT;
        }
      }
    }

    if (hints.family) {
      const hFam = slugifyBase(hints.family);
      if (hFam) family = hFam;
    }

    // 显式 effort 提示覆盖（如手动纠偏选「标准」或显式档位）
    if (hints.effort !== undefined && hints.effort !== null && String(hints.effort).trim() !== '') {
      const he = String(hints.effort).trim().toLowerCase();
      if (he === 'standard' || he === '标准' || he === 'none_tier' || OPEN_NO_TIER_BASE_RE.test(family) || MODEL_NAME_MAX_RE.test(family)) {
        effort = 'standard';
      } else if (/^(none|minimal|low|medium|high|xhigh|max)$/i.test(he)) {
        effort = (he === 'none' || he === 'minimal') ? 'low' : he;
      }
    }
    if (OPEN_NO_TIER_BASE_RE.test(family) || MODEL_NAME_MAX_RE.test(family)) {
      effort = 'standard';
    }

    const detectVendor = s => {
      const vHint = String(hints.vendor || '').trim().toLowerCase();
      if (vHint && VENDOR_LABELS[vHint]) return vHint;
      if (/gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|\bo[134]\b/i.test(s)) return 'openai';
      if (/claude|anthropic|opus|sonnet|haiku|fable/i.test(s)) return 'anthropic';
      if (/gemini|google|argon|barium/i.test(s)) return 'google';
      if (/grok|xai/i.test(s)) return 'xai';
      if (/deepseek|beam/i.test(s)) return 'deepseek';
      if (/qwen|qwq|alibaba/i.test(s)) return 'qwen';
      if (/glm|zhipu/i.test(s)) return 'zhipu';
      if (/kimi|moonshot/i.test(s)) return 'moonshot';
      if (/mimo|xiaomi/i.test(s)) return 'xiaomi';
      if (/muse|llama|meta/i.test(s)) return 'meta';
      if (/minimax/i.test(s)) return 'minimax';
      if (/mistral|devstral/i.test(s)) return 'mistral';
      return 'compat';
    };
    const vendor = detectVendor(family || rawStr);
    const vendorLabel = VENDOR_LABELS[vendor] || vendor;
    const familyLabel = FAMILY_DISPLAY_MAP[family] ||
      family.split('-').map(w => /^(gpt|glm|mimo|hy\d*|ai)$/i.test(w) ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
    const hasExplicitTier = effort !== 'standard';
    const effortLabel = EFFORT_LABELS[effort] || '标准';
    const displayLabel = hasExplicitTier ? `${familyLabel} (${effortLabel})` : familyLabel;
    const slugCanon = hasExplicitTier ? `${family}-${effort}` : family;
    const canon = canonHabitModelName(slugCanon) || slugCanon;
    const outObj = {
      vendor,
      vendorLabel,
      family,
      familyLabel,
      effort,
      effortLabel,
      hasExplicitTier,
      slugCanon,
      canon,
      displayLabel,
    };
    if (simpleMemoKey) {
      if (_decompMemo.size > 2400) _decompMemo.clear();
      _decompMemo.set(simpleMemoKey, outObj);
    }
    return outObj;
  }

  const SECONDARY_CORRECTION_SIDS = {
    '01a155eb-ebaa-77ae-9173-fac511bb3c81': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false },
    '01a155eb-ebaa-730a-922c-085044a25044': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false },
    '01a14e79-62e7-7137-b869-c97ecd890fd0': { model: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', isOpen: false, autoTeacher: false },
    '01a152c4-2ba1-70ee-9dd1-6a29ae84d75c': { model: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', isOpen: false, autoTeacher: false },
    '01a152c2-c708-7859-9dac-3e2d6a45454f': { model: 'muse-spark-1.3-max', rawLabel: 'Muse Spark 1.3 (Max)', isOpen: false, autoTeacher: false },
    '01a152c6-d4c7-7faa-a81d-64d4b1953661': { model: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', isOpen: false, autoTeacher: false },
    '01a152c4-dc79-71d2-acb9-3b47fecc25f6': { model: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', isOpen: false, autoTeacher: true },
    '01a14cea-e2bb-72ac-810d-ef8f38883bea': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false, autoTeacher: false },
    '01a1580c-3b5a-7ac0-abe4-7afef0cc1035': { model: 'gpt-6-sol-max', rawLabel: 'GPT 6 Sol (Max)', isOpen: false, autoTeacher: false },
    '01a1577d-ff3d-70b4-9e51-fef4931aebae': { model: 'gpt-6.1-sol-max', rawLabel: 'GPT 6.1 Sol (Max)', isOpen: false, autoTeacher: false },
    '01a15779-4c90-77f8-b822-9e72acf9c3ca': { model: 'gpt-6.1-sol-high', rawLabel: 'GPT 6.1 Sol (High)', isOpen: false, autoTeacher: false },
    '01a14a0d-bce9-7011-a76d-b1deea75c1d9': { model: 'gpt-6-luna-max', rawLabel: 'GPT 6 Luna (Max)', isOpen: false, autoTeacher: false },
    '01a1577e-b0dd-714a-bfb4-1b0f1b7b1da1': { model: 'gemini-4-argon-high', rawLabel: 'Gemini 4 Argon (High)', isOpen: false, autoTeacher: false },
  };

  let bankRev = 1;
  let lastSharedSyncAt = 0;

  const PURGED_STUB_SIDS = new Set([
    '01a14d10-88e5-7e0d-a2dc-59b80e865028', '01a14d11-a5dc-773c-8c0c-88f6a16d6655', '01a148c7-9e1b-7544-884d-4e7cc1476a64',
    '01a148c9-6c3a-7a2a-8827-1533a93e94fc', '01a148cb-d02d-7157-a3b8-6c2ba515919c', '01a148c8-3bb2-7e8b-8f07-96ab90bcb3c7',
    '01a148b0-3e40-735d-b935-b35e51269c9f', '01a148b0-d9c4-733b-9bac-3812590714d8', '01a148c8-9b24-7f05-b708-d8bbf9dccd4a',
    '01a14a32-3c2e-763f-96d6-e45e52177a3f', '01a152c4-b0d4-74c2-aa6a-8a9cbc1fdd3b', '01a152c6-7acb-70e6-ac17-41f3eb622d4b',
    '01a152c1-d872-7793-bbad-11d49b1745f7', '01a152bd-e314-7d89-9f0a-5a5df088ecbc', '01a14a40-9a96-7b65-a13e-94b9e628abf2',
    '01a14a40-c888-7f49-8a1a-9fd57fd0dbc9', '01a14a3e-f971-7d7d-a95e-35f5d62bf1ae', '01a14a31-8bb0-79c3-9fc2-bc22d58b036a',
    '01a143cf-e9b8-7f73-a2b9-a4a0db718c19', '01a14d10-3266-7ef6-a4a3-b34b6dabc6a4', '01a14d10-0340-7ef5-aae6-faf9e510734a',
    '01a148c7-756a-7c81-a63f-22d50224f13c', '01a148cc-9e87-75b8-8393-236014b1fdce', '01a148cb-63ae-73d2-83d7-00d699d5c1f3',
    '01a148b8-5c68-738e-be33-3eda236291bf', '01a148b6-d121-76ee-88ca-bf631655c8fc', '01a148b5-0375-7a1b-86d4-97de60dee2c2',
    '01a148b6-356c-79d6-b36a-6a65d4f3b61c', '01a148b3-4d8b-70b3-af44-bc93d21a6044', '01a148b2-e9df-7bc2-bcdc-44e32a4d5c63',
    '01a148b0-990d-7c20-90c4-516e61a6d1a5', '01a148b0-1482-754b-8b8e-174d59e341d4', '01a148af-c6c0-7105-9d3a-46b1543d05f2',
    '01a13890-9c70-7677-9b34-83ec17d57d29',
  ]);
  function sanitizeBankSample(s) {
    if (!s || !s.model || !Array.isArray(s.vec)) return null;
    if (PURGED_STUB_SIDS.has(String(s.sid || ''))) return null;
    let out = { ...s };
    let mStr = String(out.model || '').trim();
    const sidStr = String(out.sid || '');
    out.battleRevealed = Boolean(s.battleRevealed || /#[ab]$/i.test(sidStr));
    if (s.battleSide || /#[ab]$/i.test(sidStr)) {
      out.battleSide = s.battleSide || (/#b$/i.test(sidStr) ? 'b' : 'a');
    }
    if (s.directMode || s.truthTier === 'direct_locked') out.directMode = true;
    if (s.evalModality) out.evalModality = String(s.evalModality);
    if (Array.isArray(s.tierVec) && s.tierVec.length === 12) {
      out.tierVec = s.tierVec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
    } else if (Array.isArray(s.meta?.tierVec) && s.meta.tierVec.length === 12) {
      out.tierVec = s.meta.tierVec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
    }
    if (out.battleRevealed && !out.truthTier) {
      out.truthTier = out.battlePair?.partnerModel ? 'battle_paired' : 'battle_single';
    } else if (out.directMode && !out.truthTier) {
      out.truthTier = 'direct_locked';
    }
    // 自动纠偏测试 3 步菜单时误选的不存在组合 gpt-5.6-luna -> gpt-6-luna
    if (/gpt-5\.6-luna/i.test(mStr)) {
      mStr = mStr.replace(/gpt-5\.6-luna/ig, 'gpt-6-luna');
    }
    // 修复历史 Battle/Direct 入库样本：若原始揭晓名称 rawLabel 无强度档位（如 claude-opus-5、gemini-4-argon、kimi-k3、qwen3.8-max-0902），还原为纯型号 + 标准强度
    const rawLblClean = String(out.rawLabel || '').trim();
    if ((out.battleRevealed || out.directMode) && rawLblClean && !/\((?:none|minimal|low|medium|high|xhigh|max)\)/i.test(rawLblClean)) {
      const rlSlug = rawLblClean.toLowerCase().replace(/\s+/g, '-');
      const rlHasTier = /-(?:none|minimal|low|medium|high|xhigh|max)$/i.test(rlSlug) && !MODEL_NAME_MAX_RE.test(rlSlug) && !OPEN_NO_TIER_BASE_RE.test(rlSlug);
      if (!rlHasTier) {
        mStr = rawLblClean;
        out.effort = 'standard';
      }
    }
    if (sidStr === '01a155ea-d645-7385-9d00-0a95851f21d9' && /gemini-4-argon/i.test(mStr) && /high/i.test(rawLblClean)) {
      mStr = 'gemini-4-argon-high';
      out.effort = 'high';
    }
    const canonM = sanitizeCorruptedTierSlug(canonHabitModelName(mStr) || mStr, rawLblClean);
    if (!out.rawLabel && mStr !== canonM) out.rawLabel = mStr;
    out.model = canonM;
    mStr = canonM;
    if (SECONDARY_CORRECTION_SIDS[sidStr]) {
      const scPatch = SECONDARY_CORRECTION_SIDS[sidStr];
      out = { ...out, ...scPatch };
      mStr = out.model;
    }
    if (/muse/i.test(mStr)) {
      out.isOpen = false;
    }
    // 修复早期误把 reiScore（如 4552 / 1583 / 9）当成 0-100 推理分写入样本的异常分值
    const curScore = Number(out.score);
    if (!Number.isFinite(curScore) || curScore < 10 || curScore > 100) {
      const fallbackSc = Number.isFinite(+out.rawHabitScore) && +out.rawHabitScore >= 10 && +out.rawHabitScore <= 100 ? +out.rawHabitScore : 75;
      out.score = fallbackSc;
    }
    // 修复此前导入 billing-01a1440a...json 时因未读取 sessionId 而生成 diag-* 临时 ID 的记录
    if (sidStr.startsWith('diag-') && /6\.1[-\s]*sol/i.test(mStr) && Math.abs((Number(out.score) || 0) - 46.6) < 1.0) {
      out.sid = '01a1440a-e8c4-7939-8910-ffe946582807';
    }
    if (KNOWN_DIAG_SIDS.has(String(out.sid || ''))) {
      out.importedFromDiag = true;
    }
    // 清理已知误标为 Gemini 4 Argon 的 3 个 Flash 诊断样本（01a148b9 / 01a14a34 / 01a151de），自动迁移为 Gemini 3.8 Flash (High)
    if (/gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(mStr) && CONFIRMED_GEMINI_FLASH_SIDS.has(String(out.sid || ''))) {
      return {
        ...out,
        vendor: 'google',
        family: 'gemini-3.8-flash',
        effort: 'high',
        model: canonHabitModelName('Gemini 3.8 Flash (High)'),
        userConfirmed: false,
        weight: 1.0,
      };
    }
    if (String(out.sid || '') === '01a14d81-b1a7-7134-8e9d-7d41e9dcae00') return null;
    if (String(out.sid || '') === '01a151de-5840-75e5-b5e0-9bf662f543dd' && /6\.1-sol|gpt/i.test(mStr)) {
      return {
        ...out,
        vendor: 'google',
        family: 'gemini-3.8-flash',
        effort: 'high',
        model: canonHabitModelName('Gemini 3.8 Flash (High)'),
        userConfirmed: false,
        weight: 1.0,
      };
    }
    if (KNOWN_ARGON_SIDS.has(String(out.sid || '')) && out.autoTeacher && /6\.1-sol|gpt|claude|sonnet/i.test(mStr)) {
      const fixedArgon = canonHabitModelName('Gemini 4 Argon (High)');
      out = { ...out, model: fixedArgon, rawLabel: 'Gemini 4 Argon (High)' };
      mStr = fixedArgon;
    }
    if (String(out.sid || '').startsWith('01a14d81-dc48') && out.autoTeacher && /gemini-3\.1-pro/i.test(mStr)) {
      const fixedSol = canonHabitModelName('GPT 5.6 Sol (Medium)');
      out = { ...out, model: fixedSol, rawLabel: 'GPT 5.6 Sol (Medium)' };
      mStr = fixedSol;
    }
    if (String(out.sid || '') === '01a152a2-7fc5-7699-b7a4-23dd3fdd17ab' && /3\.8-flash/i.test(mStr)) {
      const fixedArgonLow = canonHabitModelName('Gemini 4 Argon (Low)');
      out = { ...out, model: fixedArgonLow, rawLabel: 'Gemini 4 Argon (Low)', autoTeacher: false, weight: 3.5 };
      mStr = fixedArgonLow;
    }
    if ((String(out.sid || '') === '01a155eb-26a5-7f8a-a1bd-757d04d14134' && /terra-medium/i.test(mStr)) ||
        (String(out.sid || '') === '01a155eb-a9d2-71b2-b7eb-2c18b6e3ad78' && /5\.6-sol/i.test(mStr))) {
      const fixedTerra = canonHabitModelName('GPT 5.6 Terra (High)');
      out = { ...out, model: fixedTerra, rawLabel: 'GPT 5.6 Terra (High)' };
      mStr = fixedTerra;
    }
    if (String(out.sid || '') === '01a155ea-7be8-75fe-8b49-773f6159cb3a' && /6-sol/i.test(mStr)) {
      const fixedOpus = canonHabitModelName('Claude Opus 5.5 (Medium)');
      out = { ...out, previousLabel: out.previousLabel || out.rawLabel || out.model, relabelRevision: 2026102302, model: fixedOpus, rawLabel: 'Claude Opus 5.5 (Medium)' };
      mStr = fixedOpus;
    }
    if (String(out.sid || '') === '01a155eb-ebaa-730a-922c-085044a25044' && /argon/i.test(mStr)) {
      const fixedFlash = canonHabitModelName('Gemini 3.8 Flash (High)');
      out = { ...out, previousLabel: out.previousLabel || out.rawLabel || out.model, relabelRevision: 2026102302, model: fixedFlash, rawLabel: 'Gemini 3.8 Flash (High)' };
      mStr = fixedFlash;
    }
    if ((sidStr === '01a15b82-a43c-71cf-bb6d-d139f15f5c61' || sidStr === '01a1590b-e6a6-743b-82e6-ed3a359d598b' || sidStr === '01a15905-e846-714a-9bc3-1f852ecd0c21' || sidStr === '01a15b48-5319-7a59-97e8-5b7c86a0b4c8') && !/fable/i.test(mStr)) {
      const fixedFable = canonHabitModelName('Claude Fable 5.1 (Max)');
      out = { ...out, previousLabel: out.previousLabel || out.rawLabel || out.model, relabelRevision: 2026102302, model: fixedFable, rawLabel: 'Claude Fable 5.1 (Max)' };
      mStr = fixedFable;
    }
    if (sidStr === '01a15906-9162-7845-89e4-d3b6468d546c' && !/muse-spark-1\.3/i.test(mStr)) {
      const fixedMuse = canonHabitModelName('Muse Spark 1.3 (Max)');
      out = { ...out, previousLabel: out.previousLabel || out.rawLabel || out.model, relabelRevision: 2026102302, model: fixedMuse, rawLabel: 'Muse Spark 1.3 (Max)' };
      mStr = fixedMuse;
    }
    const isCorrupt4000Meta = m => Boolean(m && Number(m.meanChars) === 4000 && (Number(m.writtenChars) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.cps) === 1 || Number(m.cps) === 2 || (Number(m.totalTools) === 0 && (Number(m.write) > 0 || Number(m.askUser) > 0))));
    const isSyntheticStubVec = v => Array.isArray(v) && v.length === 20 && v[12] === 0.8 && v[15] === 0.52 && v[2] === 0.05 && v[3] === 0;
    if (isCorrupt4000Meta(out.meta)) {
      out.meta = null;
    }
    if (!out.userConfirmed && !out.importedFromDiag && isSyntheticStubVec(out.vec)) {
      return null;
    }
    // 若本机已对该会话跑出高置信度 /cost 反推结果，自动纠偏早期误写入习惯库的旧样本（决不把已确认 userConfirmed 降级为 false）
    if (sidStr === '01a13ef8-3b56-7b99-a43b-d991064c46d8' && /luna.*max/i.test(mStr)) {
      const fixedCanon = canonHabitModelName('GPT-6 Luna (Medium)');
      out = { ...out, model: fixedCanon, rawLabel: 'GPT-6 Luna (Medium)', score: 74, userConfirmed: true, autoTeacher: true, teacherConf: 98.2, weight: 3.2 };
    } else if (sidStr && !out.userConfirmed && !out.importedFromDiag && typeof Models !== 'undefined' && typeof Models.get === 'function') {
      const mLocal = Models.get(sidStr);
      if (mLocal && !mLocal.userCorrected && Array.isArray(mLocal.reverseCandidates)) {
        const topRc = mLocal.reverseCandidates.find(rc => rc && !rc.structuralRev && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 85) && Number(rc.revPct ?? rc.match ?? 0) >= 75);
        if (topRc) {
          const rcRaw = String(topRc.label || topRc.dynamicLabel || topRc.id || '').replace(/[?？]+$/, '').trim();
          const rcCanon = canonHabitModelName(rcRaw);
          const localRevSc = Number(mLocal.reverseScore);
          const rcScore = (Number.isFinite(localRevSc) && localRevSc >= 10 && localRevSc <= 100 && !mLocal.habitInferred) ? localRevSc : out.score;
          if (rcCanon && (String(out.model || '').toLowerCase() !== String(rcCanon).toLowerCase() || (Number.isFinite(+rcScore) && Math.abs((Number(out.score) || 0) - (+rcScore)) >= 1))) {
            out = {
              ...out,
              model: rcCanon,
              rawLabel: rcRaw,
              score: Number.isFinite(+rcScore) ? +rcScore : out.score,
              userConfirmed: false,
              autoTeacher: true,
              teacherConf: Number(topRc.revPct ?? topRc.match ?? 95),
              weight: topRc.diophantinePassed ? 3.2 : 2.2,
            };
          }
        }
      }
    }
    // 过滤因中途路由切换（如首轮 Gemini Argon -> 后续切换为 GPT-6.1 Sol / Claude 产生大量隐藏思考块与小写 doctype）而误记为 Gemini 的自动纠偏样本
    if (/gemini|google|argon/i.test(mStr) && !out.importedFromDiag && !out.battleRevealed && (out.autoTeacher || !out.userConfirmed) && out.meta) {
      const mHidG = Number(out.meta.hidR) || 0;
      const mLowerDoc = Number(out.meta.lowerDoctype) || 0;
      const mChkG = Number(out.meta.memoAvgChunk) || 0;
      const mCpsG = Number(out.meta.cps) || 0;
      if (mHidG >= 6 && (mLowerDoc >= 1 || (mChkG > 0 && mChkG < 4.5) || (mCpsG > 0 && mCpsG < 18))) {
        return null;
      }
    }
    // 修复早期把 Gemini 大段 HTML 中冒号误判为 hidR: 4 的样本（如 01a15747-805a / 01a15747-4ffc）及 isGeminiCoding 误标
    if (/gemini|google|argon/i.test(mStr)) {
      if (out.meta && (out.meta.hidR === 4 || out.meta.hidR === 0 || out.meta.isGeminiCoding === false) && ((out.meta.memoAvgChunk || 0) >= 25 || (out.meta.writtenChars || 0) >= 25000 || (out.meta.hidR || 0) === 0)) {
        out.meta = { ...out.meta, hidR: 0, maxRInTurn: 0, isGeminiCoding: true };
      } else if (out.meta) {
        out.meta = { ...out.meta, isGeminiCoding: true };
      }
      if (out.vec.length === 20 && out.vec[0] === 1 && out.vec[1] === 0) {
        const fixedVec = [...out.vec];
        fixedVec[0] = 0;
        fixedVec[1] = 1;
        out.vec = fixedVec;
      }
      if (Array.isArray(out.tags)) {
        out.tags = out.tags.filter(t => !/^闭源隐藏思考/.test(String(t || '')));
      }
    } else if (!isOpenName(mStr)) {
      if (!out.importedFromDiag && !out.battleRevealed && !out.directMode && !/#[ab]$/i.test(sidStr) && /gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mStr) && (out.autoTeacher || !out.userConfirmed) && out.meta) {
        const mChk = Number(out.meta.memoAvgChunk) || 0;
        const mCnt = Number(out.meta.memoDeltaCount) || 0;
        const mHid = Number(out.meta.hidR) || 0;
        const mTls = Number(out.meta.totalTools) || 0;
        if (mHid === 0 && mTls > 0 && mChk >= 28) return null;
        if (mCnt >= 15 && mChk >= 1.0 && mChk < 4.2 && mHid > 0 && !/gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra/i.test(mStr)) return null;
        if (mCnt >= 6 && mChk >= 4.5 && mChk <= 19.5 && mHid > 0 && (out.meta.lowerDoctype || 0) === 0 && (out.meta.colorSchemeCss || 0) === 0 && (out.meta.sandboxLink || 0) === 0 && (out.meta.askSolSig || 0) === 0 && (out.meta.askIdHasUnderscore || 0) === 0 && !/claude|anthropic|opus|sonnet|haiku|fable/i.test(mStr)) return null;
      }
      // 快照加载的 OpenAI/Anthropic 闭源会话可能因服务端未返回空 reasoning 块导致 vec[0]=0, vec[1]=1 或 isGeminiCoding=true，自动校准
      if (out.vec.length === 20 && out.vec[0] === 0 && out.vec[1] === 1) {
        const fixedVec = [...out.vec];
        fixedVec[0] = 1;
        fixedVec[1] = 0;
        out.vec = fixedVec;
      }
      if (out.meta && out.meta.isGeminiCoding === true) {
        out.meta = { ...out.meta, isGeminiCoding: false };
      }
    }
    if (out.meta && out.vec.length === 20 && out.vec[4] === 0 && (Number(out.meta.writtenChars) || 0) === 0 && Number(out.meta.write) === 1 && (Number(out.meta.totalTools) || 0) <= 1) {
      out.meta = {
        ...out.meta,
        write: 0,
        totalTools: Math.max(Number(out.meta.totalTools) || 0, Number(out.meta.askUser) || 0),
      };
    } else if (out.meta && (out.meta.write || 0) > 0 && Array.isArray(out.vec) && out.vec[4] === 0) {
      const fixedVec = [...out.vec];
      const tls = Math.max(1, out.meta.totalTools || 1);
      fixedVec[2] = (out.meta.preToolTextChars || 0) > 0 ? 1 : 0;
      fixedVec[3] = Math.min(1, ((out.meta.edit || 0) + (out.meta.read || 0)) / tls);
      fixedVec[4] = Math.min(1, ((out.meta.write || 0) + (out.meta.present || 0) * 0.5) / tls);
      fixedVec[17] = Math.min(1, Math.max(0.1, ((out.meta.meanChars || 0) + (out.meta.htmlMaxLen || 0) * 0.45) / 14000));
      fixedVec[18] = Math.min(1, (((out.meta.hidR || 0) + tls) / Math.max(1, out.meta.turns || 1)) / 14);
      if ((out.meta.avgTurnDurMs || 0) > 0) fixedVec[19] = Math.min(1, ((out.meta.avgTurnDurMs || 0) / 1000) / 120);
      out.vec = fixedVec;
    } else if (out.meta && (out.meta.totalTools || 0) === 0 && Array.isArray(out.vec) && out.vec[2] > 0.5 && (out.meta.meanChars || 0) > 3000 && out.vec[17] <= 0.12) {
      const fixedVec = [...out.vec];
      fixedVec[2] = 0.06;
      fixedVec[3] = 0;
      fixedVec[17] = Math.min(1, Math.max(0.1, ((out.meta.meanChars || 0) + (out.meta.htmlMaxLen || 0) * 0.45) / 14000));
      out.vec = fixedVec;
    }
    if (out.meta && Array.isArray(out.tags) && out.tags.length) {
      const tJoin = out.tags.join(' | ');
      const durM = /单轮耗时[:(]\s*([\d.]+)\s*s/.exec(tJoin);
      const chkM = /流块[:(]\s*([\d.]+)\s*字/.exec(tJoin);
      const cpsM = /流式速度[:(]\s*([\d.]+)\s*字\/秒/.exec(tJoin);
      const curM = /弯撇号(\d+)\/紧凑破折号(\d+)/.exec(tJoin);
      let metaPatch = null;
      if (durM && !(Number(out.meta.avgTurnDurMs) > 0)) {
        metaPatch = { ...(metaPatch || {}), avgTurnDurMs: Math.round(parseFloat(durM[1]) * 1000) };
      }
      if (chkM && !(Number(out.meta.memoAvgChunk) > 0)) {
        metaPatch = { ...(metaPatch || {}), memoAvgChunk: parseFloat(chkM[1]), memoDeltaCount: Math.max(Number(out.meta.memoDeltaCount) || 0, 24) };
      }
      if (cpsM && !(Number(out.meta.cps) > 0)) {
        metaPatch = { ...(metaPatch || {}), cps: parseFloat(cpsM[1]) };
      }
      if (curM && !(Number(out.meta.curlyApostrophe) > 0) && !(Number(out.meta.unspacedEmDash) > 0)) {
        metaPatch = { ...(metaPatch || {}), curlyApostrophe: parseInt(curM[1], 10) || 0, unspacedEmDash: parseInt(curM[2], 10) || 0 };
      }
      if (metaPatch) out.meta = { ...out.meta, ...metaPatch };
    }
    if (out.sid === '01a151dd-f7d2-772a-8284-8f3ab40e5999' && out.meta && Number(out.meta.cps) === 120) {
      out.meta = { ...out.meta, cps: 98 };
    }
    const decomp = decomposeModelIdentity(out.model, {
      effort: out.effort,
      rawLabel: out.rawLabel,
    });
    out.vendor = decomp.vendor;
    out.vendorLabel = decomp.vendorLabel;
    out.family = decomp.family;
    out.familyLabel = decomp.familyLabel;
    out.effort = decomp.effort;
    out.effortLabel = decomp.effortLabel;
    out.rawLabel = decomp.displayLabel;
    return out;
  }

  const isCorrupt4000MetaSample = m => Boolean(m && Number(m.meanChars) === 4000 && (Number(m.writtenChars) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.cps) === 1 || Number(m.cps) === 2 || (Number(m.totalTools) === 0 && (Number(m.write) > 0 || Number(m.askUser) > 0))));
  const isUnloaded4500StubMetaSample = m => Boolean(m && Number(m.meanChars) === 4500 && (Number(m.writtenChars) || 0) === 0 && (Number(m.avgTurnDurMs) || 0) === 0 && (Number(m.cps) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.bash) || 0) === 0 && (Number(m.askUser) || 0) === 0 && (Number(m.lowerDoctype) || 0) === 0 && (Number(m.colorSchemeCss) || 0) === 0 && (Number(m.prefersReducedMotion) || 0) === 0 && (Number(m.sandboxLink) || 0) === 0 && (Number(m.svgSmilNoScript) || 0) === 0);
  const isSyntheticStubVecSample = v => Array.isArray(v) && v.length === 20 && v[12] === 0.8 && v[15] === 0.52 && v[2] === 0.05 && v[3] === 0;
  function pickRichBankVecMeta(win, lose) {
    const winVecStub = isSyntheticStubVecSample(win?.vec);
    const loseVecRich = Array.isArray(lose?.vec) && lose.vec.length === 20 && !isSyntheticStubVecSample(lose.vec);
    const vec = (winVecStub && loseVecRich) ? lose.vec : win?.vec;
    const wMeta = (win?.meta && !isCorrupt4000MetaSample(win.meta) && !isUnloaded4500StubMetaSample(win.meta)) ? win.meta : null;
    const lMeta = (lose?.meta && !isCorrupt4000MetaSample(lose.meta) && !isUnloaded4500StubMetaSample(lose.meta)) ? lose.meta : null;
    const fallbackMeta = (win?.meta && !isCorrupt4000MetaSample(win.meta)) ? win.meta : ((lose?.meta && !isCorrupt4000MetaSample(lose.meta)) ? lose.meta : null);
    const meta = (lMeta || wMeta) ? { ...(lMeta || {}), ...(wMeta || {}) } : fallbackMeta;
    return { vec, meta };
  }

  const _harvestedSigBySid = new Map();
  function harvestLocalAccountModelsIntoBank() {
    let harvested = 0;
    try {
      if (typeof Models === 'undefined' || !Models || typeof Models.all !== 'object' || !Models.all) return 0;
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(BANK_KEY, null) : null;
      const samples = Array.isArray(raw?.samples) ? [...raw.samples] : [];
      const bySid = new Map();
      for (const s of samples) {
        if (s && s.sid) bySid.set(String(s.sid), s);
      }
      for (const [sid, m] of Object.entries(Models.all || {})) {
        if (!sid || !m || typeof m !== 'object' || m.routed) continue;
        const isUserConf = Boolean(m.userCorrected || m.userConfirmed);
        const isRevConf = Boolean(!isUserConf && m.reverseName && Number(m.reverseConfidence) >= 0.88 && !m.habitInferred);
        if (!isUserConf && !isRevConf) continue;
        const hSig = `${m.name || ''}|${m.reverseName || ''}|${m.userCorrected ? 1 : 0}|${m.at || m.updatedAt || 0}`;
        if (_harvestedSigBySid.get(sid) === hSig && bySid.has(String(sid))) continue;
        const chat = (typeof Chats !== 'undefined' && Chats && typeof Chats.get === 'function') ? Chats.get(sid) : null;
        const hasLoadedAsst = Array.isArray(chat?.messages) && chat.messages.some(x => x && x.role === 'assistant');
        const hasSavedVec = Array.isArray(m.habitFeatures?.vec) && m.habitFeatures.vec.length === 20 && !isSyntheticStubVecSample(m.habitFeatures.vec);
        const hasSavedMeta = Boolean(m.habitFeatures?.meta && !isCorrupt4000MetaSample(m.habitFeatures.meta) && !isUnloaded4500StubMetaSample(m.habitFeatures.meta));
        if (!hasLoadedAsst && !hasSavedVec && !hasSavedMeta) continue;
        const rawLabel = String(isUserConf ? (m.name || m.reverseName || '') : (m.reverseName || m.name || '')).replace(/[?？]+$/, '').trim();
        const canonM = canonHabitModelName(rawLabel);
        if (!canonM || canonM === '开源模型') continue;
        const existing = bySid.get(String(sid));
        if (existing && ((existing.userConfirmed && !existing.autoTeacher) || (!isUserConf && existing.userConfirmed)) && String(existing.model || '').toLowerCase() === String(canonM).toLowerCase()) {
          _harvestedSigBySid.set(sid, hSig);
          continue;
        }
        if (!Array.isArray(chat?.messages) || chat.messages.length === 0) continue;
        const feat = extractFeatures(chat, m);
        if (!feat || !Array.isArray(feat.vec) || feat.vec.length !== 20 || isSyntheticStubVecSample(feat.vec)) continue;
        const cleanSample = sanitizeBankSample({
          sid: String(sid),
          model: canonM,
          rawLabel,
          vec: feat.vec,
          score: Number(m.habitFeatures?.score || feat.habitReasoningScore || 75) || 75,
          tags: Array.isArray(feat.habitTags) ? feat.habitTags.slice(0, 6) : [],
          meta: extractCompactMeta(feat),
          userConfirmed: true,
          autoTeacher: !isUserConf,
          teacherConf: isRevConf ? Math.round((Number(m.reverseConfidence) || 0.9) * 1000) / 10 : undefined,
          weight: isUserConf ? 3.5 : 2.8,
          at: Number(m.updatedAt || m.at || Date.now()) || Date.now(),
        });
        if (cleanSample) {
          if (isSampleTombstoned(sid, cleanSample.at || 0)) continue;
          samples.push(cleanSample);
          bySid.set(String(sid), cleanSample);
          _harvestedSigBySid.set(sid, hSig);
          harvested++;
        }
      }
      if (harvested > 0 && typeof Store !== 'undefined' && Store.set) {
        try { Store.set(BANK_KEY, { v: 3, updatedAt: Date.now(), samples, tombstones: Object.fromEntries(_bankTombstones), calibration: loadCalibration() }); } catch {}
      }
    } catch {}
    return harvested;
  }

  function applyRemoteBankSync(sh, { persistToHost = false, onDone = null } = {}) {
    if (!sh || !Array.isArray(sh.samples)) {
      if (typeof onDone === 'function') onDone();
      return null;
    }
    const res = mergeSharedBank(sh.samples, sh.calibration || null, sh.usageStats || null, { persistToHost, tombstones: sh.tombstones || null });
    if (typeof onDone === 'function') onDone(res);
    return res;
  }

  function syncFromSharedHost({ force = false, onDone = null } = {}) {
    if (typeof Host === 'undefined' || typeof Host.shared !== 'function') {
      if (typeof onDone === 'function') onDone(null);
      return Promise.resolve(null);
    }
    const now = Date.now();
    if (!force && sharedBankLoaded && now - lastSharedSyncAt < 1500) {
      if (typeof onDone === 'function') onDone(null);
      return Promise.resolve(null);
    }
    sharedBankLoaded = true;
    lastSharedSyncAt = now;
    const harvestedCount = harvestLocalAccountModelsIntoBank();
    return Promise.resolve(Host.shared('habitLearnBank')).then(sh => {
      if (sh && Array.isArray(sh.samples)) {
        const localSamples = loadBank();
        const remoteByKey = new Map();
        for (const rs of sh.samples) {
          if (!rs) continue;
          const rk = rs.sid || `${rs.model}:${rs.at || 0}`;
          remoteByKey.set(rk, rs);
        }
        let hasLocalNewOrUpgraded = harvestedCount > 0;
        if (!hasLocalNewOrUpgraded) {
          for (const ls of localSamples) {
            const cleanL = sanitizeBankSample(ls);
            if (!cleanL) continue;
            const lk = cleanL.sid || `${cleanL.model}:${cleanL.at || 0}`;
            const rs = remoteByKey.get(lk);
            if (!rs) { hasLocalNewOrUpgraded = true; break; }
            const lRank = (cleanL.userConfirmed && !cleanL.autoTeacher) || cleanL.importedFromDiag ? 2 : (cleanL.userConfirmed ? 1 : 0);
            const rRank = (rs.userConfirmed && !rs.autoTeacher) || rs.importedFromDiag ? 2 : (rs.userConfirmed ? 1 : 0);
            if (lRank > rRank || ((cleanL.at || 0) > (rs.at || 0) && lRank >= rRank) || (!rs.meta && cleanL.meta)) {
              hasLocalNewOrUpgraded = true;
              break;
            }
          }
        }
        const res = applyRemoteBankSync(sh, { persistToHost: hasLocalNewOrUpgraded, onDone });
        return res;
      }
      if (typeof onDone === 'function') onDone(null);
      return null;
    }).catch(() => {
      if (typeof onDone === 'function') onDone(null);
      return null;
    });
  }

  let _cachedBankSamples = null;
  let _cachedBankBySid = null;
  let _cachedBankRev = -1;
  let _cachedCalibration = null;
  let calibRev = 1;
  let _cachedUsageStats = null;
  const _featCache = new Map();
  const _analyzeCache = new Map();

  const _bankTombstones = new Map();

  function isSampleTombstoned(sid, at = 0) {
    if (!sid) return false;
    const t = _bankTombstones.get(String(sid));
    if (!t) return false;
    return !(Number(at) > 0 && Number(t.deletedAt) > 0 && Number(at) > Number(t.deletedAt));
  }

  function recordBankTombstone(sid, reason = 'retracted', deletedAt = Date.now()) {
    if (!sid) return;
    const k = String(sid);
    const prev = _bankTombstones.get(k);
    const ts = Math.max(Number(deletedAt) || Date.now(), Number(prev?.deletedAt) || 0);
    _bankTombstones.set(k, { sid: k, deletedAt: ts, rev: ++bankRev, reason: String(reason || 'retracted') });
  }

  const _partDigestMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  const _msgBaseDigestMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function computeMessagesDigest(msgs) {
    if (!Array.isArray(msgs) || !msgs.length) return '0';
    let h = 2166136261 >>> 0;
    let totalLen = 0;
    const feed = s => {
      const str = String(s ?? '');
      totalLen += str.length;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      h ^= 0xff;
      h = Math.imul(h, 16777619) >>> 0;
    };
    const hashChunk = list => {
      let ch = 2166136261 >>> 0, clen = 0;
      for (let k = 0; k < list.length; k++) {
        const str = String(list[k] ?? '');
        clen += str.length;
        for (let i = 0; i < str.length; i++) {
          ch ^= str.charCodeAt(i);
          ch = Math.imul(ch, 16777619) >>> 0;
        }
        ch ^= 0xff;
        ch = Math.imul(ch, 16777619) >>> 0;
      }
      return { len: clen, hash: ch };
    };
    for (const m of msgs) {
      if (!m) continue;
      if (_msgBaseDigestMemo && typeof m === 'object' && !Array.isArray(m.content)) {
        let mb = _msgBaseDigestMemo.get(m);
        if (
          !mb ||
          mb.id !== (m.id || '') ||
          mb.role !== (m.role || '') ||
          mb.status !== (m.status || '') ||
          mb.pos !== (m.participantPosition || '') ||
          mb.modelId !== (m.modelId || '') ||
          mb.v !== (m.v || 0) ||
          mb.retry !== (m.retryRegenerationCount || 0) ||
          mb.text !== m.text ||
          mb.content !== m.content ||
          mb.reasoning !== m.reasoning
        ) {
          const items = [
            m.id || '', m.role || '', m.status || '', m.participantPosition || '',
            m.modelId || '', m.v || 0, m.retryRegenerationCount || 0
          ];
          if (typeof m.text === 'string' && m.text) items.push(m.text);
          if (typeof m.content === 'string' && m.content) items.push(m.content);
          if (typeof m.reasoning === 'string' && m.reasoning) items.push(m.reasoning);
          const res = hashChunk(items);
          mb = {
            id: m.id || '', role: m.role || '', status: m.status || '', pos: m.participantPosition || '',
            modelId: m.modelId || '', v: m.v || 0, retry: m.retryRegenerationCount || 0,
            text: m.text, content: m.content, reasoning: m.reasoning,
            len: res.len, hash: res.hash
          };
          _msgBaseDigestMemo.set(m, mb);
        }
        totalLen += mb.len;
        h ^= mb.hash;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= (mb.len & 0xffff);
        h = Math.imul(h, 16777619) >>> 0;
      } else {
        feed(m.id || '');
        feed(m.role || '');
        feed(m.status || '');
        feed(m.participantPosition || '');
        feed(m.modelId || '');
        feed(m.v || 0);
        feed(m.retryRegenerationCount || 0);
        if (typeof m.text === 'string' && m.text) feed(m.text);
        if (typeof m.content === 'string' && m.content) feed(m.content);
        else if (Array.isArray(m.content)) {
          for (const c of m.content) feed(typeof c === 'string' ? c : JSON.stringify(c));
        }
        if (typeof m.reasoning === 'string' && m.reasoning) feed(m.reasoning);
      }
      if (Array.isArray(m.parts)) {
        for (const p of m.parts) {
          if (!p) continue;
          if (_partDigestMemo && typeof p === 'object') {
            let pm = _partDigestMemo.get(p);
            if (
              !pm ||
              pm.type !== (p.type || '') ||
              pm.toolName !== (p.toolName || '') ||
              pm.toolCallId !== (p.toolCallId || '') ||
              pm.state !== (p.state || '') ||
              pm.text !== p.text ||
              pm.inputText !== p.inputText ||
              pm.content !== p.content ||
              pm.input !== p.input ||
              pm.output !== p.output ||
              pm.result !== p.result
            ) {
              const items = [p.type || '', p.toolName || '', p.toolCallId || '', p.state || ''];
              if (typeof p.text === 'string' && p.text) items.push(p.text);
              if (typeof p.inputText === 'string' && p.inputText) items.push(p.inputText);
              if (typeof p.content === 'string' && p.content) items.push(p.content);
              if (p.input !== undefined && p.input !== null) items.push(typeof p.input === 'string' ? p.input : JSON.stringify(p.input));
              if (p.output !== undefined && p.output !== null) items.push(typeof p.output === 'string' ? p.output : JSON.stringify(p.output));
              if (p.result !== undefined && p.result !== null) items.push(typeof p.result === 'string' ? p.result : JSON.stringify(p.result));
              const res = hashChunk(items);
              pm = {
                type: p.type || '', toolName: p.toolName || '', toolCallId: p.toolCallId || '', state: p.state || '',
                text: p.text, inputText: p.inputText, content: p.content,
                input: p.input, output: p.output, result: p.result,
                len: res.len, hash: res.hash
              };
              _partDigestMemo.set(p, pm);
            }
            totalLen += pm.len;
            h ^= pm.hash;
            h = Math.imul(h, 16777619) >>> 0;
            h ^= (pm.len & 0xffff);
            h = Math.imul(h, 16777619) >>> 0;
          } else {
            feed(p.type || '');
            feed(p.toolName || '');
            feed(p.toolCallId || '');
            feed(p.state || '');
            if (typeof p.text === 'string' && p.text) feed(p.text);
            if (typeof p.inputText === 'string' && p.inputText) feed(p.inputText);
            if (typeof p.content === 'string' && p.content) feed(p.content);
            if (p.input !== undefined && p.input !== null) {
              feed(typeof p.input === 'string' ? p.input : JSON.stringify(p.input));
            }
            if (p.output !== undefined && p.output !== null) {
              feed(typeof p.output === 'string' ? p.output : JSON.stringify(p.output));
            }
            if (p.result !== undefined && p.result !== null) {
              feed(typeof p.result === 'string' ? p.result : JSON.stringify(p.result));
            }
          }
        }
      }
      if (Array.isArray(m.webdev?.files)) {
        for (const f of m.webdev.files) {
          if (!f) continue;
          feed(f.path || '');
          feed(f.content || '');
        }
      } else if (m.webdev?.files && typeof m.webdev.files === 'object') {
        for (const [fp, fc] of Object.entries(m.webdev.files)) {
          feed(fp || '');
          feed(typeof fc === 'string' ? fc : JSON.stringify(fc ?? ''));
        }
      }
    }
    return msgs.length + ':' + totalLen + ':' + h.toString(36);
  }

  function getBankSampleBySid(sid) {
    if (!sid) return null;
    loadBank();
    if (isSampleTombstoned(sid)) return null;
    return _cachedBankBySid ? (_cachedBankBySid.get(String(sid)) || null) : null;
  }

  let _initialBuiltinArchetypes = null;
  function getInitialBuiltinArchetypes() {
    if (_initialBuiltinArchetypes) return _initialBuiltinArchetypes;
    const builtin = (typeof BUILTIN_HABIT_BANK !== "undefined" ? BUILTIN_HABIT_BANK : ((typeof globalThis !== "undefined" && globalThis.BUILTIN_HABIT_BANK) ? globalThis.BUILTIN_HABIT_BANK : null));
    const rawList = [...(Array.isArray(builtin?.samples) ? builtin.samples : []), ...(Array.isArray(builtin?.extendedSamples) ? builtin.extendedSamples : [])];
    _initialBuiltinArchetypes = rawList.map(s => sanitizeBankSample(s)).filter(Boolean);
    try { builtin?.__releaseSamples?.(); } catch {}
    return _initialBuiltinArchetypes;
  }

  function loadBank() {
    if (!_initialBuiltinArchetypes) getInitialBuiltinArchetypes();
    if (_cachedBankSamples && _cachedBankRev === bankRev) return _cachedBankSamples;
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(BANK_KEY, null) : null;
      if (raw?.tombstones && typeof raw.tombstones === 'object') {
        for (const [tk, tv] of Object.entries(raw.tombstones)) {
          if (!tk || !tv) continue;
          const prevT = _bankTombstones.get(tk);
          if (!prevT || (Number(tv.deletedAt) || 0) >= (Number(prevT.deletedAt) || 0)) {
            _bankTombstones.set(tk, { sid: tk, deletedAt: Number(tv.deletedAt) || Date.now(), rev: Number(tv.rev) || 1, reason: String(tv.reason || 'retracted') });
          }
        }
      }
      const builtin = (typeof BUILTIN_HABIT_BANK !== "undefined" ? BUILTIN_HABIT_BANK : ((typeof globalThis !== "undefined" && globalThis.BUILTIN_HABIT_BANK) ? globalThis.BUILTIN_HABIT_BANK : null));
      const nowCap = Date.now() - 60000;
      const isExplicitEmptyReset = Boolean(raw?.replace && Array.isArray(raw?.samples) && raw.samples.length === 0);
      const baseBuiltins = (_initialBuiltinArchetypes && _initialBuiltinArchetypes.length) ? _initialBuiltinArchetypes : [...(Array.isArray(builtin?.samples) ? builtin.samples : []), ...(Array.isArray(builtin?.extendedSamples) ? builtin.extendedSamples : [])];
      const builtinSamples = isExplicitEmptyReset ? [] : baseBuiltins.map(s => (s && s.at > nowCap) ? { ...s, at: nowCap } : s);
      const rawSamples = Array.isArray(raw) ? raw : (Array.isArray(raw?.samples) ? raw.samples : []);
      let changed = Boolean(builtin?.builtinRev && raw?.builtinRev !== builtin.builtinRev);
      const bySid = new Map();
      for (const s of [...builtinSamples, ...rawSamples]) {
        const clean = sanitizeBankSample(s);
        if (!clean) { changed = true; continue; }
        const k = clean.sid || `${clean.model}:${clean.at || 0}`;
        if (isSampleTombstoned(k, clean.at || 0)) { changed = true; continue; }
        const prev = bySid.get(k);
        if (!prev) {
          bySid.set(k, clean);
        } else {
          const sRank = (clean.userConfirmed && !clean.autoTeacher) || clean.importedFromDiag ? 2 : (clean.userConfirmed ? 1 : 0);
          const pRank = (prev.userConfirmed && !prev.autoTeacher) || prev.importedFromDiag ? 2 : (prev.userConfirmed ? 1 : 0);
          const win = (sRank > pRank) || (sRank === pRank && (clean.at || 0) >= (prev.at || 0)) ? clean : prev;
          const lose = win === clean ? prev : clean;
          const rich = pickRichBankVecMeta(win, lose);
          bySid.set(k, {
            ...prev,
            ...win,
            vec: rich.vec,
            meta: rich.meta,
            userConfirmed: Boolean(prev.userConfirmed || clean.userConfirmed),
            autoTeacher: sRank > pRank ? Boolean(clean.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
            importedFromDiag: Boolean(prev.importedFromDiag || clean.importedFromDiag),
          });
        }
      }
      const samples = [...bySid.values()].sort((a, b) =>
        (Number(Boolean(b.userConfirmed && !b.autoTeacher)) - Number(Boolean(a.userConfirmed && !a.autoTeacher))) ||
        (Number(Boolean(b.userConfirmed || b.importedFromDiag)) - Number(Boolean(a.userConfirmed || a.importedFromDiag))) ||
        ((b.at || 0) - (a.at || 0))
      );
      if (samples.length !== rawSamples.length) changed = true;
      _cachedBankSamples = samples;
      _cachedBankBySid = bySid;
      _cachedBankRev = bankRev;
      if (changed && rawSamples.length > 0 && typeof Store !== 'undefined' && Store.set) {
        try { Store.set(BANK_KEY, { v: 3, builtinRev: builtin?.builtinRev || 0, updatedAt: Date.now(), samples, tombstones: Object.fromEntries(_bankTombstones), calibration: loadCalibration() }); } catch {}
      }
      if (!sharedBankLoaded && typeof Host !== 'undefined' && typeof Host.shared === 'function') {
        void syncFromSharedHost();
      }
      return samples;
    } catch {
      return [];
    }
  }

  const CALIB_KEY = 'habit:calibration:v1';
  const calibratedSessionKeys = new Set();
  function loadCalibration() {
    if (_cachedCalibration) return _cachedCalibration;
    const builtinCal = (typeof globalThis !== 'undefined' && globalThis.BUILTIN_HABIT_BANK?.calibration) ? globalThis.BUILTIN_HABIT_BANK.calibration : null;
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(CALIB_KEY, null) : null;
      if (raw && typeof raw === 'object' && raw.protoCentroids && raw.scoreOffsets) {
        let healed = false;
        if (builtinCal?.protoCentroids) {
          for (const [mk, bv] of Object.entries(builtinCal.protoCentroids)) {
            if (!raw.protoCentroids[mk]) { raw.protoCentroids[mk] = { ...bv }; healed = true; }
          }
        }
        if (builtinCal?.scoreOffsets) {
          for (const [mk, bs] of Object.entries(builtinCal.scoreOffsets)) {
            if (!raw.scoreOffsets[mk]) { raw.scoreOffsets[mk] = { ...bs }; healed = true; }
          }
        }
        if (raw.protoCentroids?.muse) { delete raw.protoCentroids.muse; healed = true; }
        if (raw.scoreOffsets?.muse) { delete raw.scoreOffsets.muse; healed = true; }
        for (const v of Object.values(raw.protoCentroids)) {
          if (v && (Number(v.count) || 0) > 50) { v.count = 12; healed = true; }
        }
        for (const v of Object.values(raw.scoreOffsets)) {
          if (v && (Number(v.count) || 0) > 50) { v.count = 12; healed = true; }
        }
        if (!raw.tierCentroids) raw.tierCentroids = {};
        if (!raw.intraFamilyHyperplanes) raw.intraFamilyHyperplanes = {};
        if (!raw.vendorTierDeltas) raw.vendorTierDeltas = {};
        if (!raw.modalityProfiles) raw.modalityProfiles = {};
        // 自动清理因历史双档位拼接（如 claude-opus-5.5-high-low）或合成伪质心（syntheticMargin）残留的污染键
        for (const mapObj of [raw.protoCentroids, raw.scoreOffsets, raw.tierCentroids, raw.dimWeights, raw.repelledModels]) {
          if (!mapObj || typeof mapObj !== 'object') continue;
          for (const k of Object.keys(mapObj)) {
            const v = mapObj[k];
            const cleanK = sanitizeCorruptedTierSlug(k);
            if (v?.syntheticMargin || cleanK !== k || /-(none|minimal|low|medium|high|xhigh|max)-(none|minimal|low|medium|high|xhigh|max)$/i.test(k)) {
              delete mapObj[k];
              healed = true;
            }
          }
        }
        if (healed && typeof Store !== 'undefined' && Store.set) {
          try { Store.set(CALIB_KEY, raw); } catch {}
        }
        _cachedCalibration = raw;
        return raw;
      }
    } catch {}
    if (builtinCal && builtinCal.protoCentroids && builtinCal.scoreOffsets) {
      const seeded = {
        v: 3,
        protoCentroids: { ...builtinCal.protoCentroids },
        scoreOffsets: { ...builtinCal.scoreOffsets },
        dimWeights: { ...(builtinCal.dimWeights || {}) },
        repelledModels: { ...(builtinCal.repelledModels || {}) },
        tierCentroids: { ...(builtinCal.tierCentroids || {}) },
        intraFamilyHyperplanes: { ...(builtinCal.intraFamilyHyperplanes || {}) },
        vendorTierDeltas: { ...(builtinCal.vendorTierDeltas || {}) },
        modalityProfiles: { ...(builtinCal.modalityProfiles || {}) },
        reverseCalib: builtinCal.reverseCalib || { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 },
        updatedAt: builtinCal.updatedAt || Date.now(),
      };
      try { if (typeof Store !== 'undefined' && Store.set) Store.set(CALIB_KEY, seeded); } catch {}
      _cachedCalibration = seeded;
      try {
        if (typeof ArenaPricing !== 'undefined' && typeof ArenaPricing.setReverseCalibration === 'function' && seeded.reverseCalib) {
          ArenaPricing.setReverseCalibration(seeded.reverseCalib);
        }
      } catch {}
      return seeded;
    }
    _cachedCalibration = {
      v: 3,
      protoCentroids: {},
      scoreOffsets: {},
      dimWeights: {},
      repelledModels: {},
      tierCentroids: {},
      intraFamilyHyperplanes: {},
      vendorTierDeltas: {},
      modalityProfiles: {},
      reverseCalib: { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 },
      updatedAt: 0,
    };
    return _cachedCalibration;
  }

  function syncPricingReverseCalib(cal) {
    try {
      if (cal && cal.reverseCalib && typeof ArenaPricing !== 'undefined' && typeof ArenaPricing.setReverseCalibration === 'function') {
        ArenaPricing.setReverseCalibration(cal.reverseCalib);
      }
    } catch {}
  }

  function saveCalibration(cal) {
    if (cal && typeof cal === 'object') {
      if (!cal.dimWeights) cal.dimWeights = {};
      if (!cal.repelledModels) cal.repelledModels = {};
      if (!cal.tierCentroids) cal.tierCentroids = {};
      if (!cal.intraFamilyHyperplanes) cal.intraFamilyHyperplanes = {};
      if (!cal.vendorTierDeltas) cal.vendorTierDeltas = {};
      if (!cal.modalityProfiles) cal.modalityProfiles = {};
      if (!cal.reverseCalib) cal.reverseCalib = { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
    }
    _cachedCalibration = cal;
    calibRev++;
    _analyzeCache.clear();
    _featCache.clear();
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    syncPricingReverseCalib(cal);
    try {
      if (typeof Store !== 'undefined' && Store.set) Store.set(CALIB_KEY, cal);
    } catch {}
    return cal;
  }

  const EFFORT_TIER_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];

  function parseModelFamilyAndTier(rawModel) {
    const mKey = String(rawModel || '');
    const hit = _parseFamTierMemo.get(mKey);
    if (hit !== undefined) return hit;
    const res = _parseModelFamilyAndTier0(mKey);
    if (_parseFamTierMemo.size > 2400) _parseFamTierMemo.clear();
    _parseFamTierMemo.set(mKey, res);
    return res;
  }
  function _parseModelFamilyAndTier0(rawModel) {
    const rawClean = sanitizeCorruptedTierSlug(String(rawModel || '').replace(/[?？]+$/, '').trim(), rawModel);
    const canonRaw = rawClean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawClean) : rawClean);
    const clean = sanitizeCorruptedTierSlug(String(canonRaw || '').replace(/[?？]+$/, '').trim(), rawModel);
    const decomp = decomposeModelIdentity(clean, { rawLabel: rawClean });
    // 开源型号自带 -max 后缀（如 qwen3.8-max、glm-5.3-max）或无档位型号属于型号名本身，绝非思考强度档位
    if (MODEL_NAME_MAX_RE.test(clean) || OPEN_NO_TIER_BASE_RE.test(clean) || !decomp.hasExplicitTier) {
      const fk = decomp.family || clean.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
      return {
        canon: clean,
        baseLabel: decomp.familyLabel || rawClean,
        famKey: fk,
        vendor: decomp.vendor,
        tier: '',
        effort: 'standard',
        hasExplicitTier: false,
      };
    }
    const mParen = /^(.*?)\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(rawClean) ||
                   /^(.*?)\s*\((none|minimal|low|medium|high|xhigh|max)\)\s*$/i.exec(clean);
    if (mParen) {
      const baseLabel = mParen[1].trim().replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, '');
      const rawTier = mParen[2].toLowerCase();
      const tier = (rawTier === 'none' || rawTier === 'minimal') ? 'low' : rawTier;
      return {
        canon: clean,
        baseLabel,
        famKey: decomp.family || baseLabel.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''),
        vendor: decomp.vendor,
        tier,
        effort: tier,
        hasExplicitTier: true,
      };
    }
    const mDash = /^(.*?)-(none|minimal|low|medium|high|xhigh|max)$/i.exec(clean);
    if (mDash && !OPEN_NO_TIER_BASE_RE.test(mDash[1]) && !MODEL_NAME_MAX_RE.test(mDash[1])) {
      const baseLabel = mDash[1].trim().replace(/-(none|minimal|low|medium|high|xhigh|max)$/i, '');
      const rawTier = mDash[2].toLowerCase();
      const tier = (rawTier === 'none' || rawTier === 'minimal') ? 'low' : rawTier;
      return {
        canon: clean,
        baseLabel,
        famKey: decomp.family || baseLabel.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''),
        vendor: decomp.vendor,
        tier,
        effort: tier,
        hasExplicitTier: true,
      };
    }
    return {
      canon: clean,
      baseLabel: clean,
      famKey: decomp.family || clean.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, ''),
      vendor: decomp.vendor,
      tier: '',
      effort: 'standard',
      hasExplicitTier: false,
    };
  }

  function formatFamilyTierCanon(baseLabel, tier) {
    if (!baseLabel || !tier || tier === 'standard' || tier === '标准') return baseLabel || '';
    const rawNoParen = String(baseLabel)
      .replace(/[?？]+$/, '')
      .replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max|标准|standard)\)\s*$/i, '')
      .trim();
    if (!rawNoParen || MODEL_NAME_MAX_RE.test(rawNoParen) || OPEN_NO_TIER_BASE_RE.test(rawNoParen)) {
      return (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(rawNoParen) : rawNoParen;
    }
    const cleanBase = rawNoParen.replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').trim();
    if (!cleanBase || MODEL_NAME_MAX_RE.test(cleanBase) || OPEN_NO_TIER_BASE_RE.test(cleanBase)) {
      return (typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(cleanBase) : cleanBase;
    }
    const tDisp = tier === 'xhigh' ? 'xHigh' : (tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase());
    const candidate = cleanBase.includes(' ') ? (cleanBase + ' (' + tDisp + ')') : (cleanBase + '-' + tier.toLowerCase());
    return sanitizeCorruptedTierSlug((typeof Strength !== 'undefined' && Strength.canon) ? Strength.canon(candidate) : candidate, baseLabel);
  }

  // 将内部规范化型号名（如 claude-opus-5.5-high）转换为人类可读展示名（如 Claude Opus 5.5 (High)），杜绝出现 claude-opus-5.5-high-low 等原始 slug
  function formatDisplayModelLabel(rawOrCanon, fallbackLabel = '') {
    const mKey = String(rawOrCanon || '') + '\u0001' + String(fallbackLabel || '');
    const mHit = _dispLabelMemo.get(mKey);
    if (mHit !== undefined) return mHit;
    const cleanRaw = sanitizeCorruptedTierSlug(String(rawOrCanon || fallbackLabel || '').replace(/[?？]+$/, '').trim(), fallbackLabel || rawOrCanon);
    if (!cleanRaw || cleanRaw === '开源模型') return cleanRaw;
    const cKey = String((typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(cleanRaw) : cleanRaw) || cleanRaw).toLowerCase();
    const exactProto = getProtoByCanon(cKey);
    const out = exactProto ? exactProto.label : (decomposeModelIdentity(cleanRaw, { rawLabel: fallbackLabel })?.displayLabel || cleanRaw);
    if (_dispLabelMemo.size > 2400) _dispLabelMemo.clear();
    _dispLabelMemo.set(mKey, out);
    return out;
  }

  // 独立强度识别器（Standalone Effort / Intensity Classifier）：
  // 将思考强度（Low / Medium / High / xHigh / Max）从型号本体习惯中彻底解耦出来单独识别，避免与型号家族习惯互相冲突
  function identifyEffortTier(feat, famKey = '', calib = null) {
    if (famKey && (OPEN_NO_TIER_BASE_RE.test(famKey) || MODEL_NAME_MAX_RE.test(famKey))) {
      return { tier: 'standard', scores: {} };
    }
    if (!feat || !Array.isArray(feat.tierVec) || feat.tierVec.length !== 12) return null;
    const cal = calib || loadCalibration();
    const tv = feat.tierVec;
    const mod = String(feat.evalModality || (feat.totalTools > 0 ? 'agent' : 'chat')).toLowerCase();
    const TIER_IDEAL_EFFORT = { low: 0.25, medium: 0.48, high: 0.68, xhigh: 0.81, max: 0.92 };
    const scores = {};
    for (const t of EFFORT_TIER_ORDER) {
      const ideal = TIER_IDEAL_EFFORT[t] ?? 0.68;
      const actual = (Number(tv[11]) || 0.65) * 0.50 + (Number(tv[0]) || 0.50) * 0.25 + (Number(tv[4]) || 0.50) * 0.15 + (Number(tv[10]) || 0.60) * 0.10;
      scores[t] = (0.22 - Math.abs(actual - ideal)) * 1.15;
    }
    if (famKey && cal?.tierCentroids) {
      for (const [ck, cent] of Object.entries(cal.tierCentroids)) {
        if (!cent || cent.syntheticMargin || !Array.isArray(cent.tierVec) || cent.tierVec.length !== 12) continue;
        const p = parseModelFamilyAndTier(ck);
        if (p.famKey === famKey && p.tier && scores[p.tier] !== undefined) {
          const sim = tierVecSimilarity(tv, cent.tierVec, mod, cent.stdVec);
          if (sim != null) scores[p.tier] += (sim - 0.75) * 2.4;
        }
      }
    }
    if (famKey && cal?.intraFamilyHyperplanes?.[famKey]) {
      for (const [pk, hObj] of Object.entries(cal.intraFamilyHyperplanes[famKey])) {
        if (!hObj || !Array.isArray(hObj.wVec) || hObj.wVec.length !== 12) continue;
        const [hiT, loT] = pk.split('>');
        const proj = tv.reduce((acc, val, idx) => acc + (Number(hObj.wVec[idx]) || 0) * (Number(val) || 0), 0);
        const margin = proj - (Number(hObj.threshold) || 0);
        const step = Math.max(-0.18, Math.min(0.18, margin * 1.35));
        if (scores[hiT] !== undefined) scores[hiT] += step;
        if (scores[loT] !== undefined) scores[loT] -= step;
      }
    }
    let bestTier = 'high', bestScore = -999;
    for (const t of EFFORT_TIER_ORDER) {
      if (scores[t] > bestScore) {
        bestScore = scores[t];
        bestTier = t;
      }
    }
    return { tier: bestTier, scores };
  }

  // Battle 揭晓型号规范化：严格保持揭晓型号原始归属，清理任何双重档位后缀，绝不给无档位型号强行捏造冲突档位后缀
  function resolveBattleModelWithTier(rawName) {
    return sanitizeCorruptedTierSlug(canonHabitModelName(rawName), rawName);
  }

  // 弹性方向纠偏（Elastic Directional Pull）：将用户的单点纠偏转化为「主目标 + 邻近思考档位 + 同价位折射 + 旧模型排斥」的软标签场，同时拟合双引擎；
  // 当 weight >= 8.0（Battle 100% 盲测真值校准）时，切换为高比重精准单档锚定 + 强排他对比排斥模式，绝不模糊相邻强度档位
  function recordElasticCorrection(chat, feat, oldModelRaw, targetModelRaw, targetScore, weight = 3.5) {
    try {
      const cal = loadCalibration();
      if (!cal.dimWeights) cal.dimWeights = {};
      if (!cal.repelledModels) cal.repelledModels = {};
      if (!cal.reverseCalib) cal.reverseCalib = { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
      const rc = cal.reverseCalib;
      if (!rc.effortScales) rc.effortScales = {};
      if (!rc.tierLogPriors) rc.tierLogPriors = {};
      if (!rc.modelResidualBias) rc.modelResidualBias = {};

      const isBattleTruth = (Number(weight) || 0) >= 8.0;
      const tgt = parseModelFamilyAndTier(targetModelRaw);
      const old = oldModelRaw ? parseModelFamilyAndTier(oldModelRaw) : null;
      const tgtKey = String(tgt.canon || '').toLowerCase();
      const oldKey = old ? String(old.canon || '').toLowerCase() : '';
      const isDiffModel = Boolean(oldKey && oldKey !== tgtKey && oldKey !== '开源模型');

      // 1. 构建软邻域分布 Q(m)：Battle 真值采用 1.0 独享锚定以拉开档位差距；普通手动纠偏采用软邻域过渡
      const softTargets = {};
      if (tgt.canon && tgt.canon !== '开源模型') {
        if (isBattleTruth) {
          softTargets[tgt.canon] = 1.0;
        } else {
          softTargets[tgt.canon] = 0.58;
          const tIdx = EFFORT_TIER_ORDER.indexOf(tgt.tier);
          if (tIdx >= 0) {
            // 如果是从更高档位往低档位拉（如 6.1sol-medium -> astra-low），中间过渡档位（如 astra-medium）获得更强软牵引 (0.28)
            const oldTIdx = old ? EFFORT_TIER_ORDER.indexOf(old.tier) : -1;
            const pullDir = (oldTIdx >= 0 && oldTIdx !== tIdx) ? Math.sign(oldTIdx - tIdx) : 0;
            for (const delta of [-1, 1]) {
              const adjIdx = tIdx + delta;
              if (adjIdx >= 0 && adjIdx < EFFORT_TIER_ORDER.length) {
                const adjTier = EFFORT_TIER_ORDER[adjIdx];
                const adjCanon = formatFamilyTierCanon(tgt.baseLabel, adjTier);
                const protoExists = PROTOTYPES.some(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === adjCanon.toLowerCase());
                if (protoExists && adjCanon.toLowerCase() !== tgtKey) {
                  const isBridgeTier = (pullDir !== 0 && delta === pullDir) || (tIdx === 0 && delta === 1) || (tIdx === EFFORT_TIER_ORDER.length - 1 && delta === -1);
                  softTargets[adjCanon] = isBridgeTier ? 0.28 : 0.16;
                }
              }
            }
          }
          // 同家族/跨家族档位折射：若原识别家族与目标家族不同且档位不同，对原识别家族在目标档位上施加 0.18 的软折射
          if (old && old.baseLabel && old.famKey !== tgt.famKey && old.tier !== tgt.tier) {
            const refractedOld = formatFamilyTierCanon(old.baseLabel, tgt.tier);
            const protoExists = PROTOTYPES.some(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === refractedOld.toLowerCase());
            if (protoExists && refractedOld.toLowerCase() !== oldKey) {
              softTargets[refractedOld] = 0.18;
            }
          }
        }
      }

      // 2. 仅对主目标型号执行加权原型质心牵引（不把当前样本混入相邻强度档位质心，防止 Low/Medium/High/Max 质心坍塌）
      const sid = String(chat?.sid || '');
      const hasTools = Boolean(feat && (feat.totalTools || 0) > 0);
      for (const [mCanon, qWeight] of Object.entries(softTargets)) {
        if (qWeight < 0.55) continue;
        const effW = Math.max(0.35, weight * qWeight);
        const adjScore = Number.isFinite(+targetScore) ? Math.max(18, Math.min(98, +targetScore)) : null;
        recordTeacherCalibration(mCanon, feat, adjScore, effW, sid);
      }

      // 3. 对被排除的旧模型/对手模型施加对比排斥（Contrastive Repulsion）与特征维度自适应加权（Metric Diagonal Adaptation）
      if (isDiffModel && feat && Array.isArray(feat.vec) && feat.vec.length === 20) {
        const oldProto = cal.protoCentroids[oldKey] || PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === oldKey);
        if (oldProto && Array.isArray(oldProto.vec) && oldProto.vec.length === 20) {
          const repelAlpha = isBattleTruth ? 0.14 : 0.09;
          const repelledVec = oldProto.vec.map((v, i) => {
            const fv = Number(feat.vec[i]) || 0;
            const pv = Number(v) || 0;
            if (i <= 1 || (!hasTools && i >= 2 && i <= 9)) return pv;
            const nextV = Math.max(0, Math.min(1, pv - repelAlpha * (fv - pv)));
            return Math.round(nextV * 1000) / 1000;
          });
          cal.protoCentroids[oldKey] = {
            vec: repelledVec,
            meta: cal.protoCentroids[oldKey]?.meta || null,
            count: Math.max(1, (cal.protoCentroids[oldKey]?.count || 1)),
            updatedAt: Date.now(),
          };
          // 自适应调整目标模型在 20 维特征上的敏感度权重（无工具的纯对话不调整工具维 2..9）
          const tgtProto = cal.protoCentroids[tgtKey] || PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === tgtKey);
          if (tgtProto && Array.isArray(tgtProto.vec) && tgtProto.vec.length === 20) {
            const curWeights = Array.isArray(cal.dimWeights[tgtKey]) && cal.dimWeights[tgtKey].length === 20
              ? [...cal.dimWeights[tgtKey]]
              : new Array(20).fill(1.0);
            const gainMult = isBattleTruth ? 0.32 : 0.22;
            const maxDimW = isBattleTruth ? 1.65 : 1.50;
            for (let i = 2; i < 20; i++) {
              if (!hasTools && i >= 2 && i <= 9) continue;
              const dOld = Math.abs((Number(feat.vec[i]) || 0) - (Number(oldProto.vec[i]) || 0));
              const dTgt = Math.abs((Number(feat.vec[i]) || 0) - (Number(tgtProto.vec[i]) || 0));
              const gain = (dOld - dTgt) * gainMult;
              curWeights[i] = Math.round(Math.max(0.65, Math.min(maxDimW, curWeights[i] + gain)) * 1000) / 1000;
            }
            cal.dimWeights[tgtKey] = curWeights;
          }
        }
        const repelKeys = new Set([oldKey]);
        if (chat && Array.isArray(chat._lastHabitTopKeys)) {
          for (const hk of chat._lastHabitTopKeys) {
            if (hk && hk !== tgtKey && !Object.keys(softTargets).some(sk => sk.toLowerCase() === hk)) {
              repelKeys.add(hk);
            }
          }
        }
        for (const rk of repelKeys) {
          const prevRepel = Array.isArray(cal.repelledModels[rk]) ? cal.repelledModels[rk] : [];
          const filteredRepel = prevRepel.filter(r => r && r.sid !== sid).slice(0, 15);
          filteredRepel.unshift({
            sid,
            vec: feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
            meta: extractCompactMeta(feat),
            target: tgt.canon,
            battleRepel: isBattleTruth,
            weight: Math.round((Number(weight) || 3.5) * 10) / 10,
            at: Date.now(),
          });
          cal.repelledModels[rk] = filteredRepel;
        }
      }

      // 4. 同步拟合计费反推引擎参数（Reverse Engine Co-Fitting: tierLogPriors + effortScales + modelResidualBias）
      const registerFamPriors = (famKey, tier, deltaMain, deltaAdj = 0) => {
        if (!famKey) return;
        if (!rc.tierLogPriors[famKey]) rc.tierLogPriors[famKey] = {};
        const cur = Number(rc.tierLogPriors[famKey][tier]) || 0;
        rc.tierLogPriors[famKey][tier] = Math.round(Math.max(-0.65, Math.min(0.65, cur + deltaMain)) * 1000) / 1000;
        if (deltaAdj !== 0) {
          const tIdx = EFFORT_TIER_ORDER.indexOf(tier);
          for (const d of [-1, 1]) {
            const adjT = EFFORT_TIER_ORDER[tIdx + d];
            if (adjT) {
              const cAdj = Number(rc.tierLogPriors[famKey][adjT]) || 0;
              rc.tierLogPriors[famKey][adjT] = Math.round(Math.max(-0.65, Math.min(0.65, cAdj + deltaAdj)) * 1000) / 1000;
            }
          }
        }
      };

      if (!isBattleTruth) {
        registerFamPriors(tgt.famKey, tgt.tier, 0.14, 0.05);
      }
      const prevBiasTgt = Number(rc.modelResidualBias[tgt.famKey]) || 0;
      rc.modelResidualBias[tgt.famKey] = Math.round(Math.max(-0.012, Math.min(0.012, prevBiasTgt - 0.0024)) * 10000) / 10000;

      if (old && old.famKey) {
        if (old.famKey !== tgt.famKey || old.tier !== tgt.tier) {
          registerFamPriors(old.famKey, old.tier, -0.22, 0);
          registerFamPriors(old.famKey, tgt.tier, 0.16, 0.08);
        }
        if (old.famKey !== tgt.famKey) {
          const prevBiasOld = Number(rc.modelResidualBias[old.famKey]) || 0;
          rc.modelResidualBias[old.famKey] = Math.round(Math.max(-0.012, Math.min(0.012, prevBiasOld + 0.0016)) * 10000) / 10000;
        }
        const oldIdx = EFFORT_TIER_ORDER.indexOf(old.tier);
        const tgtIdx = EFFORT_TIER_ORDER.indexOf(tgt.tier);
        if (oldIdx >= 0 && tgtIdx >= 0 && oldIdx !== tgtIdx) {
          // 若用户将高档位纠偏为低档位（oldIdx > tgtIdx），说明反推思考档位偏高，微调 effortScales 放大思考锚点阈值
          const scaleMult = oldIdx > tgtIdx ? 1.07 : 0.93;
          for (const fk of new Set([tgt.famKey, old.famKey])) {
            const curScale = Number(rc.effortScales[fk]) || 1.0;
            rc.effortScales[fk] = Math.round(Math.max(0.65, Math.min(1.55, curScale * scaleMult)) * 1000) / 1000;
          }
        }
      }

      rc.updatedAt = Date.now();
      cal.updatedAt = Date.now();
      saveCalibration(cal);
      return { softTargets, rejectedModel: isDiffModel ? old.canon : null };
    } catch (e) {
      return { softTargets: targetModelRaw ? { [targetModelRaw]: 1.0 } : null, rejectedModel: null };
    }
  }

  function detectModelVendorId(canonOrLabel) {
    const s = String(canonOrLabel || '').toLowerCase();
    if (/gpt|openai|\bsol(?=$|[-\s_.\d])|astra|luna|terra/.test(s)) return 'openai';
    if (/claude|anthropic|opus|sonnet|haiku|fable/.test(s)) return 'anthropic';
    if (/gemini|google|argon|barium/.test(s)) return 'google';
    if (/grok|x-ai/.test(s)) return 'xai';
    return 'open';
  }

  function recordTeacherCalibration(canonModel, feat, teacherScore, weight = 1.0, sid = '') {
    try {
      if (!canonModel || !feat) return;
      const canon = canonModel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(canonModel) : canonModel);
      const k = String(canon || '').replace(/[?？]+$/, '').trim().toLowerCase();
      if (!k || k === '开源模型') return;
      if (sid) {
        const dedupKey = `${sid}:${k}`;
        if (calibratedSessionKeys.has(dedupKey)) return;
        calibratedSessionKeys.add(dedupKey);
      }
      const cal = loadCalibration();
      if (!cal.tierCentroids) cal.tierCentroids = {};
      if (!cal.intraFamilyHyperplanes) cal.intraFamilyHyperplanes = {};
      if (!cal.vendorTierDeltas) cal.vendorTierDeltas = {};
      if (!cal.modalityProfiles) cal.modalityProfiles = {};
      const effW = Math.max(0.25, Number(weight) || 1.0);
      const isHeavyBattleTruth = effW >= 8.0;
      const hasTools = Boolean((feat.totalTools || 0) > 0);
      if (Array.isArray(feat.vec) && feat.vec.length === 20) {
        const prev = cal.protoCentroids[k];
        const protoDef = PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === k);
        const n = Math.min(48, (prev?.count || 0) + 1);
        const maxAlpha = isHeavyBattleTruth ? 0.42 : 0.36;
        const alpha = Math.max(0.06, Math.min(maxAlpha, (isHeavyBattleTruth ? effW * 0.95 : effW) / (n * 1.4 + 3.5)));
        const baseVec = (prev && Array.isArray(prev.vec) && prev.vec.length === 20)
          ? prev.vec
          : (protoDef && Array.isArray(protoDef.vec) && protoDef.vec.length === 20 ? protoDef.vec : null);
        const nextVec = baseVec
          ? baseVec.map((v, i) => {
              if (!hasTools && i >= 2 && i <= 9) return Math.round((Number(v) || 0) * 1000) / 1000;
              return Math.round(((1 - alpha) * (Number(v) || 0) + alpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000;
            })
          : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
        const curMeta = extractCompactMeta(feat);
        const nextMeta = { ...(prev?.meta || {}) };
        if (curMeta && (hasTools || !prev?.meta || (prev.meta.totalTools || 0) === 0)) {
          for (const [mk, mv] of Object.entries(curMeta)) {
            if (!hasTools && prev?.meta && (prev.meta.totalTools || 0) > 0 && /^(totalTools|bash|write|edit|read|askUser|preToolTextChars|interToolTextChars|parallelSteps|writtenChars)$/.test(mk)) {
              continue;
            }
            if (typeof mv === 'boolean' || Array.isArray(mv) || typeof mv === 'string') nextMeta[mk] = mv;
            else {
              const pv = Number(prev?.meta?.[mk] ?? mv) || 0;
              nextMeta[mk] = Math.round(((1 - alpha) * pv + alpha * (Number(mv) || 0)) * 100) / 100;
            }
          }
        }
        cal.protoCentroids[k] = { vec: nextVec, meta: Object.keys(nextMeta).length ? nextMeta : (curMeta || prev?.meta || null), count: n, updatedAt: Date.now() };
      }
      // 同步更新 12 维同家族档位微差质心 tierCentroids 与多模态专有原型 modalityProfiles
      const tv = Array.isArray(feat.tierVec) && feat.tierVec.length === 12
        ? feat.tierVec
        : (Array.isArray(feat.meta?.tierVec) && feat.meta.tierVec.length === 12 ? feat.meta.tierVec : null);
      const parsed = parseModelFamilyAndTier(canon);
      if (parsed.famKey && Array.isArray(feat.vec) && feat.vec.length === 20) {
        const famProtos = PROTOTYPES.filter(p => parseModelFamilyAndTier(p.label).famKey === parsed.famKey);
        if (famProtos.length === 1 || (!parsed.hasExplicitTier && famProtos.length > 0)) {
          for (const fp of famProtos) {
            const mainCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(fp.label) : fp.label;
            const mainKey = String(mainCanon || '').toLowerCase();
            if (mainKey && mainKey !== k) {
              const prevMain = cal.protoCentroids[mainKey];
              const mCount = Math.min(48, (prevMain?.count || 0) + 1);
              const mAlpha = Math.max(0.04, Math.min(0.28, (effW * 0.55) / (mCount * 1.5 + 4.0)));
              const mVec = prevMain && Array.isArray(prevMain.vec) && prevMain.vec.length === 20
                ? prevMain.vec.map((v, i) => Math.round(((1 - mAlpha) * (Number(v) || 0) + mAlpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000)
                : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
              cal.protoCentroids[mainKey] = {
                vec: mVec,
                meta: prevMain?.meta || extractCompactMeta(feat) || null,
                count: mCount,
                updatedAt: Date.now(),
              };
            }
          }
        }
      }
      if (tv && !feat.anomalous && parsed.hasExplicitTier) {
        const prevT = cal.tierCentroids[k];
        const prevW = Number(prevT?.truthWeightSum) || 0;
        // 若已有高权重 Battle 真值质心，低权重手动猜测纠偏 (effW < 2.5) 仅施加微弱软牵引，绝不覆盖真值边界
        const effectivePullW = (prevW >= 8.0 && effW < 2.5) ? (effW * 0.28) : (isHeavyBattleTruth ? effW * 1.45 : effW);
        const nextW = Math.min(240, prevW + effectivePullW);
        const maxTAlpha = isHeavyBattleTruth ? 0.68 : 0.55;
        const tAlpha = Math.max(0.05, Math.min(maxTAlpha, effectivePullW / Math.max(2.0, nextW)));
        const nextTierVec = (prevT && Array.isArray(prevT.tierVec) && prevT.tierVec.length === 12)
          ? prevT.tierVec.map((v, i) => Math.round(((1 - tAlpha) * (Number(v) || 0) + tAlpha * (Number(tv[i]) || 0)) * 1000) / 1000)
          : tv.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
        const nextStdVec = (prevT && Array.isArray(prevT.stdVec) && prevT.stdVec.length === 12)
          ? prevT.stdVec.map((sv, i) => {
              const diff = Math.abs((Number(tv[i]) || 0) - (Number(nextTierVec[i]) || 0));
              return Math.round(Math.max(0.04, Math.min(0.38, (1 - tAlpha * 0.5) * (Number(sv) || 0.12) + tAlpha * 0.5 * diff)) * 1000) / 1000;
            })
          : new Array(12).fill(0.12);
        cal.tierCentroids[k] = {
          tierVec: nextTierVec,
          stdVec: nextStdVec,
          count: Math.min(80, (prevT?.count || 0) + 1),
          truthWeightSum: Math.round(nextW * 100) / 100,
          updatedAt: Date.now(),
        };
        // 同家族不同强度档位排他与误差梯度拉开（Intra-Family Effort Margin Enforcement）：
        // 在高比重校准时，强制拉开同家族 Low / Medium / High / xHigh / Max 在强度敏感轴 [0, 1, 4, 10, 11] 上的间隔
        const curTierIdx = EFFORT_TIER_ORDER.indexOf(parsed.tier);
        if (isHeavyBattleTruth && parsed.famKey && curTierIdx >= 0) {
          const effortAxes = [0, 1, 4, 10, 11];
          for (let oi = 0; oi < EFFORT_TIER_ORDER.length; oi++) {
            if (oi === curTierIdx) continue;
            const otherTier = EFFORT_TIER_ORDER[oi];
            const otherCanon = formatFamilyTierCanon(parsed.baseLabel, otherTier);
            const otherKey = String(otherCanon || '').toLowerCase();
            if (!otherKey || otherKey === k) continue;
            const stepDiff = oi - curTierIdx;
            const minMargin = 0.14 * Math.abs(stepDiff);
            const existingOther = cal.tierCentroids[otherKey];
            if (existingOther && !existingOther.syntheticMargin && Array.isArray(existingOther.tierVec) && existingOther.tierVec.length === 12) {
              const pushedVec = [...existingOther.tierVec];
              for (const ax of effortAxes) {
                const curVal = Number(nextTierVec[ax]) || 0.5;
                const othVal = Number(pushedVec[ax]) || 0.5;
                const signedGap = (othVal - curVal) * Math.sign(stepDiff);
                if (signedGap < minMargin) {
                  const targetVal = Math.max(0.04, Math.min(0.98, curVal + Math.sign(stepDiff) * minMargin));
                  pushedVec[ax] = Math.round(((othVal * 0.45) + (targetVal * 0.55)) * 1000) / 1000;
                }
              }
              existingOther.tierVec = pushedVec;
            }
          }
        }
        // 厂商级跨家族相对档位迁移向量（Factorized Vendor Tier Prior）
        const vid = detectModelVendorId(canon);
        if (parsed.tier && vid) {
          cal.vendorTierDeltas[vid] = cal.vendorTierDeltas[vid] || {};
          const pvT = cal.vendorTierDeltas[vid][parsed.tier];
          const vn = Math.min(100, (pvT?.count || 0) + 1);
          const vAlpha = Math.max(0.04, Math.min(0.42, effectivePullW / (vn * 2.0 + 3.5)));
          cal.vendorTierDeltas[vid][parsed.tier] = {
            tierVec: (pvT && Array.isArray(pvT.tierVec) && pvT.tierVec.length === 12)
              ? pvT.tierVec.map((v, i) => Math.round(((1 - vAlpha) * (Number(v) || 0) + vAlpha * (Number(tv[i]) || 0)) * 1000) / 1000)
              : [...nextTierVec],
            count: vn,
            updatedAt: Date.now(),
          };
        }
        // 多模态专有习惯画像（文字 chat / 代码网页 webdev / 搜索 search / 图片 image / 视频 video / Agent 工具流）
        const mod = String(feat.evalModality || (feat.totalTools > 0 ? 'agent' : 'chat')).toLowerCase();
        if (mod) {
          cal.modalityProfiles[mod] = cal.modalityProfiles[mod] || {};
          const pm = cal.modalityProfiles[mod][k];
          const mn = Math.min(50, (pm?.count || 0) + 1);
          const maxMAlpha = isHeavyBattleTruth ? 0.58 : 0.45;
          const mAlpha = Math.max(0.08, Math.min(maxMAlpha, effectivePullW / (mn * 1.4 + 2.8)));
          cal.modalityProfiles[mod][k] = {
            tierVec: (pm && Array.isArray(pm.tierVec) && pm.tierVec.length === 12)
              ? pm.tierVec.map((v, i) => Math.round(((1 - mAlpha) * (Number(v) || 0) + mAlpha * (Number(tv[i]) || 0)) * 1000) / 1000)
              : [...nextTierVec],
            vec: (Array.isArray(feat.vec) && feat.vec.length === 20)
              ? ((pm && Array.isArray(pm.vec) && pm.vec.length === 20)
                  ? pm.vec.map((v, i) => Math.round(((1 - mAlpha) * (Number(v) || 0) + mAlpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000)
                  : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000))
              : (pm?.vec || null),
            count: mn,
            updatedAt: Date.now(),
          };
        }
      }
      if (Number.isFinite(+teacherScore) && +teacherScore >= 10 && +teacherScore <= 100 && Number.isFinite(+feat.habitReasoningScore)) {
        const rawDelta = Math.max(-24, Math.min(24, (+teacherScore) - (+feat.habitReasoningScore)));
        const prevS = cal.scoreOffsets[k];
        const sn = Math.min(40, (prevS?.count || 0) + 1);
        const beta = Math.max(0.10, Math.min(isHeavyBattleTruth ? 0.62 : 0.48, effW / (sn * 1.4 + 2.6)));
        const nextOff = prevS ? ((1 - beta) * (Number(prevS.offset) || 0) + beta * rawDelta) : rawDelta;
        const nextMean = prevS ? ((1 - beta) * (Number(prevS.meanScore) || +teacherScore) + beta * (+teacherScore)) : (+teacherScore);
        cal.scoreOffsets[k] = {
          offset: Math.round(nextOff * 100) / 100,
          meanScore: Math.round(nextMean * 10) / 10,
          count: sn,
          updatedAt: Date.now(),
        };
      }
      cal.updatedAt = Date.now();
      saveCalibration(cal);
    } catch {}
  }

  // Battle 双子星同题差分对比学习引擎（Pairwise Gemini Contrastive Engine）：
  // 利用同一 Prompt、同一模态下 A/B 双模型的响应微差，直接训练同家族相邻档位分界超平面、跨模型双向排他与跨家族去偏置锚点
  function recordBattlePairwiseContrast(chat, canonA, featA, canonB, featB, voteValue = 'tie', evalModality = 'chat') {
    try {
      if (!canonA || !canonB || !featA || !featB) return null;
      const tvA = Array.isArray(featA.tierVec) && featA.tierVec.length === 12 ? featA.tierVec : null;
      const tvB = Array.isArray(featB.tierVec) && featB.tierVec.length === 12 ? featB.tierVec : null;
      if (!tvA || !tvB) return null;

      // 0. 同题对偶双向排他（Mutual Exclusive Repulsion）：
      // A 侧响应特征绝不属于 B 模型，B 侧响应特征绝不属于 A 模型；直接施加高权重排他排斥与区分度维度放大
      if (String(canonA).toLowerCase() !== String(canonB).toLowerCase()) {
        try {
          const sidBase = String(chat?.sid || 'battle');
          recordElasticCorrection({ sid: sidBase + '#pair-a' }, featA, canonB, canonA, featA.habitReasoningScore, 9.5);
          recordElasticCorrection({ sid: sidBase + '#pair-b' }, featB, canonA, canonB, featB.habitReasoningScore, 9.5);
        } catch {}
      }

      const cal = loadCalibration();
      if (!cal.intraFamilyHyperplanes) cal.intraFamilyHyperplanes = {};
      if (!cal.reverseCalib) cal.reverseCalib = { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
      const rc = cal.reverseCalib;
      if (!rc.tierLogPriors) rc.tierLogPriors = {};
      if (!rc.effortScales) rc.effortScales = {};

      const pA = parseModelFamilyAndTier(canonA);
      const pB = parseModelFamilyAndTier(canonB);
      const idxA = EFFORT_TIER_ORDER.indexOf(pA.tier);
      const idxB = EFFORT_TIER_ORDER.indexOf(pB.tier);

      // 1. 同家族不同档位同题直接交锋（如 opus-5.5-high vs opus-5.5-medium）：直接更新线性判别超平面 w_{high>low} 并拉开强度梯度
      if (pA.famKey && pA.famKey === pB.famKey && idxA >= 0 && idxB >= 0 && idxA !== idxB) {
        const hiIsA = idxA > idxB;
        const hiTier = hiIsA ? pA.tier : pB.tier;
        const loTier = hiIsA ? pB.tier : pA.tier;
        const tvHi = hiIsA ? tvA : tvB;
        const tvLo = hiIsA ? tvB : tvA;
        const pairKey = `${hiTier}>${loTier}`;
        cal.intraFamilyHyperplanes[pA.famKey] = cal.intraFamilyHyperplanes[pA.famKey] || {};
        const prevH = cal.intraFamilyHyperplanes[pA.famKey][pairKey];
        const hn = Math.min(50, (prevH?.count || 0) + 1);
        const hAlpha = Math.max(0.22, Math.min(0.68, 2.8 / (hn + 1.8)));
        const rawDelta = tvHi.map((v, i) => {
          const d = (Number(v) || 0) - (Number(tvLo[i]) || 0);
          return ([0, 1, 4, 10, 11].includes(i) && d < 0.08) ? Math.max(d, 0.12) : d;
        });
        const nextW = (prevH && Array.isArray(prevH.wVec) && prevH.wVec.length === 12)
          ? prevH.wVec.map((w, i) => Math.round(((1 - hAlpha) * (Number(w) || 0) + hAlpha * rawDelta[i]) * 1000) / 1000)
          : rawDelta.map(d => Math.round(d * 1000) / 1000);
        const midProj = tvHi.reduce((acc, v, i) => acc + nextW[i] * (((Number(v) || 0) + (Number(tvLo[i]) || 0)) * 0.5), 0);
        cal.intraFamilyHyperplanes[pA.famKey][pairKey] = {
          wVec: nextW,
          threshold: Math.round(midProj * 10000) / 10000,
          count: hn,
          modality: evalModality,
          updatedAt: Date.now(),
        };
      }

      // 2. 利用任意同家族已积累的不同档位 tierCentroids 自动合成/刷新相邻档位超平面（即使 A 和 B 来自不同对局）
      for (const pCur of [pA, pB]) {
        if (!pCur.famKey) continue;
        cal.intraFamilyHyperplanes[pCur.famKey] = cal.intraFamilyHyperplanes[pCur.famKey] || {};
        for (let ti = 1; ti < EFFORT_TIER_ORDER.length; ti++) {
          for (let tj = 0; tj < ti; tj++) {
            const tHi = EFFORT_TIER_ORDER[ti];
            const tLo = EFFORT_TIER_ORDER[tj];
            const cHiKey = String(formatFamilyTierCanon(pCur.baseLabel, tHi) || '').toLowerCase();
            const cLoKey = String(formatFamilyTierCanon(pCur.baseLabel, tLo) || '').toLowerCase();
            const centHi = cal.tierCentroids?.[cHiKey];
            const centLo = cal.tierCentroids?.[cLoKey];
            if (centHi?.tierVec?.length === 12 && centLo?.tierVec?.length === 12) {
              const pk = `${tHi}>${tLo}`;
              const existingH = cal.intraFamilyHyperplanes[pCur.famKey][pk];
              const diffVec = centHi.tierVec.map((v, i) => {
                const std = Math.max(0.06, ((Number(centHi.stdVec?.[i]) || 0.12) + (Number(centLo.stdVec?.[i]) || 0.12)) * 0.5);
                return Math.round((((Number(v) || 0) - (Number(centLo.tierVec[i]) || 0)) / (std * 6)) * 1000) / 1000;
              });
              const blendedW = (existingH && Array.isArray(existingH.wVec) && existingH.wVec.length === 12)
                ? existingH.wVec.map((w, i) => Math.round((w * 0.65 + diffVec[i] * 0.35) * 1000) / 1000)
                : diffVec;
              const midP = centHi.tierVec.reduce((acc, v, i) => acc + blendedW[i] * (((Number(v) || 0) + (Number(centLo.tierVec[i]) || 0)) * 0.5), 0);
              cal.intraFamilyHyperplanes[pCur.famKey][pk] = {
                wVec: blendedW,
                threshold: Math.round(midP * 10000) / 10000,
                count: Math.max(existingH?.count || 1, Math.min(centHi.count || 1, centLo.count || 1)),
                updatedAt: Date.now(),
              };
            }
          }
        }
        // 3. Battle 100% 真值反哺校准 /cost 账单反推的档位先验 tierLogPriors（温和限幅防溢出）
        if (pCur.famKey && pCur.tier) {
          rc.tierLogPriors[pCur.famKey] = rc.tierLogPriors[pCur.famKey] || {};
          const curP = Number(rc.tierLogPriors[pCur.famKey][pCur.tier]) || 0;
          rc.tierLogPriors[pCur.famKey][pCur.tier] = Math.round(Math.max(-0.65, Math.min(0.65, curP + 0.08)) * 1000) / 1000;
        }
      }
      rc.updatedAt = Date.now();
      cal.updatedAt = Date.now();
      saveCalibration(cal);
      return true;
    } catch {
      return null;
    }
  }

  function saveBank(samples, { replace = false, persistToHost = true, tombstones = null } = {}) {
    bankRev++;
    _featCache.clear();
    _analyzeCache.clear();
    if (tombstones && typeof tombstones === 'object') {
      for (const [tk, tv] of Object.entries(tombstones)) {
        if (tk && tv) recordBankTombstone(tk, tv.reason || 'retracted', tv.deletedAt || Date.now());
      }
    }
    const bySid = new Map();
    for (const rawS of (Array.isArray(samples) ? samples : [])) {
      const s = sanitizeBankSample(rawS);
      if (!s || !s.model || !Array.isArray(s.vec)) continue;
      const k = s.sid || `${s.model}:${s.at || 0}`;
      if (isSampleTombstoned(k, s.at || 0)) continue;
      const prev = bySid.get(k);
      if (!prev) {
        bySid.set(k, s);
      } else {
        const sRank = getSampleTruthRank(s);
        const pRank = getSampleTruthRank(prev);
        const digestChanged = Boolean(s.contentDigest && prev.contentDigest && s.contentDigest !== prev.contentDigest && sRank >= pRank);
        const win = digestChanged || (sRank > pRank) || (sRank === pRank && (s.at || 0) >= (prev.at || 0)) ? s : prev;
        const lose = win === s ? prev : s;
        const rich = digestChanged ? { vec: s.vec, meta: s.meta } : pickRichBankVecMeta(win, lose);
        bySid.set(k, {
          ...prev,
          ...win,
          vec: rich.vec,
          meta: rich.meta,
          tierVec: Array.isArray(win.tierVec) && win.tierVec.length === 12 ? win.tierVec : (Array.isArray(lose.tierVec) && lose.tierVec.length === 12 ? lose.tierVec : rich.meta?.tierVec),
          userConfirmed: Boolean(prev.userConfirmed || s.userConfirmed),
          autoTeacher: sRank > pRank ? Boolean(s.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
          importedFromDiag: Boolean(prev.importedFromDiag || s.importedFromDiag),
          battleRevealed: Boolean(prev.battleRevealed || s.battleRevealed),
          directMode: Boolean(prev.directMode || s.directMode),
          weight: Math.max(Number(win.weight) || 1, Number(lose.weight) || 1),
        });
      }
    }
    // 分层保量扩容策略（Stratified High-Capacity Retention）：
    // 金库层（Battle 真值 + 诊断真值 + Direct 锁定真值）受独立保护，绝不被 autoTeacher 或普通纠偏挤出
    const allDeduplicated = [...bySid.values()].sort((a, b) =>
      (getSampleTruthRank(b) - getSampleTruthRank(a)) ||
      ((Number(b.weight) || 1) - (Number(a.weight) || 1)) ||
      ((b.at || 0) - (a.at || 0))
    );
    const goldPool = [];
    const silverPool = [];
    const bronzePool = [];
    for (const s of allDeduplicated) {
      const tr = getSampleTruthRank(s);
      if (tr >= 3) goldPool.push(s);
      else if (tr === 2) silverPool.push(s);
      else bronzePool.push(s);
    }
    const keptGold = goldPool.slice(0, 1050);
    const remAfterGold = Math.max(0, MAX_BANK_SAMPLES - keptGold.length);
    const keptSilver = silverPool.slice(0, Math.min(silverPool.length, Math.max(320, Math.floor(remAfterGold * 0.65))));
    const remAfterSilver = Math.max(0, MAX_BANK_SAMPLES - keptGold.length - keptSilver.length);
    const keptBronze = bronzePool.slice(0, remAfterSilver);
    const clean = [...keptGold, ...keptSilver, ...keptBronze];
    const cleanBySid = new Map();
    for (const s of clean) cleanBySid.set(s.sid || `${s.model}:${s.at || 0}`, s);
    _cachedBankSamples = clean;
    _cachedBankBySid = cleanBySid;
    _cachedBankRev = bankRev;
    const cal = loadCalibration();
    const builtin = (typeof BUILTIN_HABIT_BANK !== "undefined" ? BUILTIN_HABIT_BANK : ((typeof globalThis !== "undefined" && globalThis.BUILTIN_HABIT_BANK) ? globalThis.BUILTIN_HABIT_BANK : null));
    const prevRaw = (typeof Store !== 'undefined' && Store.get) ? Store.get(BANK_KEY, null) : null;
    const isEmptyReset = Boolean((replace || prevRaw?.replace) && clean.length === 0);
    const payload = { v: 3, builtinRev: builtin?.builtinRev || 0, updatedAt: Date.now(), replace: Boolean(replace || isEmptyReset), samples: clean, tombstones: Object.fromEntries(_bankTombstones), calibration: cal };
    try { if (typeof Store !== 'undefined' && Store.set) Store.set(BANK_KEY, payload); } catch {}
    if (persistToHost) {
      try {
        if (typeof Host !== 'undefined' && Host && typeof Host.shared === 'function') {
          Promise.resolve(Host.shared('habitLearnBank', payload)).then(sh => {
            if (sh && Array.isArray(sh.samples) && sh.samples.length > clean.length) {
              applyRemoteBankSync(sh, { persistToHost: false });
            }
          }).catch(() => {});
        } else if (typeof Host !== 'undefined' && typeof Host.setShared === 'function') {
          void Host.setShared('habitLearnBank', payload);
        }
      } catch {}
    }
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    return clean;
  }

  function mergeSharedBank(remoteSamples, remoteCalib = null, remoteStats = null, { persistToHost = true, tombstones = null } = {}) {
    let added = 0, updated = 0, skipped = 0;
    try {
      const incomingTombs = tombstones || remoteCalib?.tombstones || null;
      if (incomingTombs && typeof incomingTombs === 'object') {
        for (const [tk, tv] of Object.entries(incomingTombs)) {
          if (tk && tv) recordBankTombstone(tk, tv.reason || 'remote-tombstone', tv.deletedAt || Date.now());
        }
      }
      const local = loadBank();
      const bySid = new Map();
      for (const rawL of local) {
        const s = sanitizeBankSample(rawL);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const k = s.sid || `${s.model}:${s.at || 0}`;
        if (isSampleTombstoned(k, s.at || 0)) continue;
        bySid.set(k, s);
      }
      for (const rawS of (Array.isArray(remoteSamples) ? remoteSamples : [])) {
        const s = sanitizeBankSample(rawS);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const k = s.sid || `${s.model}:${s.at || 0}`;
        if (isSampleTombstoned(k, s.at || 0)) { skipped++; continue; }
        const prev = bySid.get(k);
        if (!prev) {
          bySid.set(k, s);
          added++;
          continue;
        }
        const sRank = getSampleTruthRank(s);
        const pRank = getSampleTruthRank(prev);
        if (pRank > sRank) {
          const rich = pickRichBankVecMeta(prev, s);
          if ((!prev.meta && rich.meta) || (isSyntheticStubVecSample(prev.vec) && !isSyntheticStubVecSample(rich.vec))) {
            bySid.set(k, { ...prev, vec: rich.vec, meta: rich.meta });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        const shouldUpdate = (sRank > pRank) ||
          ((s.at || 0) > (prev.at || 0)) ||
          (sRank >= 1 && String(s.model || '').toLowerCase() !== String(prev.model || '').toLowerCase()) ||
          (!prev.meta && Boolean(s.meta)) ||
          (!prev.tierVec && Boolean(s.tierVec)) ||
          (isSyntheticStubVecSample(prev.vec) && !isSyntheticStubVecSample(s.vec)) ||
          (Boolean(s.importedFromDiag) && !prev.importedFromDiag) ||
          (Boolean(s.battleRevealed) && !prev.battleRevealed);
        if (shouldUpdate) {
          const win = ((sRank > pRank) || (sRank === pRank && (s.at || 0) >= (prev.at || 0))) ? s : prev;
          const lose = win === s ? prev : s;
          const rich = pickRichBankVecMeta(win, lose);
          bySid.set(k, {
            ...prev,
            ...win,
            vec: rich.vec,
            meta: rich.meta,
            tierVec: Array.isArray(win.tierVec) && win.tierVec.length === 12 ? win.tierVec : (Array.isArray(lose.tierVec) && lose.tierVec.length === 12 ? lose.tierVec : rich.meta?.tierVec),
            userConfirmed: Boolean(prev.userConfirmed || s.userConfirmed),
            autoTeacher: sRank > pRank ? Boolean(s.autoTeacher) : (pRank > sRank ? Boolean(prev.autoTeacher) : Boolean(win.autoTeacher)),
            importedFromDiag: Boolean(prev.importedFromDiag || s.importedFromDiag),
            battleRevealed: Boolean(prev.battleRevealed || s.battleRevealed),
            directMode: Boolean(prev.directMode || s.directMode),
            weight: Math.max(Number(win.weight) || 1, Number(lose.weight) || 1),
            score: win.score != null && Number.isFinite(+win.score) ? +win.score : prev.score,
          });
          updated++;
        } else {
          skipped++;
        }
      }
      if (remoteCalib && typeof remoteCalib === 'object') {
        const cal = loadCalibration();
        for (const [k, rc] of Object.entries(remoteCalib.protoCentroids || {})) {
          if (!rc || typeof rc !== 'object') continue;
          const lc = cal.protoCentroids[k];
          if (!lc) {
            cal.protoCentroids[k] = rc;
          } else if (Array.isArray(lc.vec) && lc.vec.length === 20 && Array.isArray(rc.vec) && rc.vec.length === 20 && (rc.updatedAt || 0) !== (lc.updatedAt || 0)) {
            const cL = Math.max(1, Number(lc.count) || 1);
            const cR = Math.max(1, Number(rc.count) || 1);
            const tot = cL + cR;
            const blendedVec = lc.vec.map((v, i) => Math.round((((Number(v) || 0) * cL + (Number(rc.vec[i]) || 0) * cR) / tot) * 1000) / 1000);
            cal.protoCentroids[k] = {
              vec: blendedVec,
              meta: (rc.updatedAt || 0) >= (lc.updatedAt || 0) ? (rc.meta || lc.meta || null) : (lc.meta || rc.meta || null),
              count: Math.max(cL, cR) + 1,
              updatedAt: Math.max(lc.updatedAt || 0, rc.updatedAt || 0, Date.now()),
            };
          }
        }
        for (const [k, rt] of Object.entries(remoteCalib.tierCentroids || {})) {
          if (!rt || typeof rt !== 'object' || !Array.isArray(rt.tierVec) || rt.tierVec.length !== 12) continue;
          const lt = cal.tierCentroids?.[k];
          if (!lt || !Array.isArray(lt.tierVec) || lt.tierVec.length !== 12) {
            cal.tierCentroids[k] = rt;
          } else if ((rt.updatedAt || 0) !== (lt.updatedAt || 0)) {
            const wL = Math.max(1, Number(lt.truthWeightSum || lt.count) || 1);
            const wR = Math.max(1, Number(rt.truthWeightSum || rt.count) || 1);
            const totW = wL + wR;
            cal.tierCentroids[k] = {
              tierVec: lt.tierVec.map((v, i) => Math.round((((Number(v) || 0) * wL + (Number(rt.tierVec[i]) || 0) * wR) / totW) * 1000) / 1000),
              stdVec: Array.isArray(lt.stdVec) && lt.stdVec.length === 12 && Array.isArray(rt.stdVec) && rt.stdVec.length === 12
                ? lt.stdVec.map((sv, i) => Math.round((((Number(sv) || 0.12) * wL + (Number(rt.stdVec[i]) || 0.12) * wR) / totW) * 1000) / 1000)
                : (rt.stdVec || lt.stdVec || new Array(12).fill(0.12)),
              count: Math.max(Number(lt.count) || 1, Number(rt.count) || 1) + 1,
              truthWeightSum: Math.round(Math.max(wL, wR, (wL + wR) * 0.65) * 100) / 100,
              updatedAt: Math.max(lt.updatedAt || 0, rt.updatedAt || 0, Date.now()),
            };
          }
        }
        if (remoteCalib.intraFamilyHyperplanes && typeof remoteCalib.intraFamilyHyperplanes === 'object') {
          cal.intraFamilyHyperplanes = cal.intraFamilyHyperplanes || {};
          for (const [fk, fMap] of Object.entries(remoteCalib.intraFamilyHyperplanes)) {
            if (!fMap || typeof fMap !== 'object') continue;
            cal.intraFamilyHyperplanes[fk] = { ...(cal.intraFamilyHyperplanes[fk] || {}), ...fMap };
          }
        }
        if (remoteCalib.vendorTierDeltas && typeof remoteCalib.vendorTierDeltas === 'object') {
          cal.vendorTierDeltas = cal.vendorTierDeltas || {};
          for (const [vk, vMap] of Object.entries(remoteCalib.vendorTierDeltas)) {
            if (!vMap || typeof vMap !== 'object') continue;
            cal.vendorTierDeltas[vk] = { ...(cal.vendorTierDeltas[vk] || {}), ...vMap };
          }
        }
        if (remoteCalib.modalityProfiles && typeof remoteCalib.modalityProfiles === 'object') {
          cal.modalityProfiles = cal.modalityProfiles || {};
          for (const [mk, mMap] of Object.entries(remoteCalib.modalityProfiles)) {
            if (!mMap || typeof mMap !== 'object') continue;
            cal.modalityProfiles[mk] = { ...(cal.modalityProfiles[mk] || {}), ...mMap };
          }
        }
        for (const [k, rs] of Object.entries(remoteCalib.scoreOffsets || {})) {
          if (!rs || typeof rs !== 'object') continue;
          const ls = cal.scoreOffsets[k];
          if (!ls) {
            cal.scoreOffsets[k] = rs;
          } else if ((rs.updatedAt || 0) !== (ls.updatedAt || 0)) {
            const cL = Math.max(1, Number(ls.count) || 1);
            const cR = Math.max(1, Number(rs.count) || 1);
            const tot = cL + cR;
            cal.scoreOffsets[k] = {
              offset: Math.round((((Number(ls.offset) || 0) * cL + (Number(rs.offset) || 0) * cR) / tot) * 100) / 100,
              meanScore: Math.round((((Number(ls.meanScore) || 75) * cL + (Number(rs.meanScore) || 75) * cR) / tot) * 10) / 10,
              count: Math.max(cL, cR) + 1,
              updatedAt: Math.max(ls.updatedAt || 0, rs.updatedAt || 0, Date.now()),
            };
          }
        }
        if (remoteCalib.dimWeights && typeof remoteCalib.dimWeights === 'object') {
          cal.dimWeights = { ...(cal.dimWeights || {}), ...remoteCalib.dimWeights };
        }
        if (remoteCalib.repelledModels && typeof remoteCalib.repelledModels === 'object') {
          cal.repelledModels = { ...(cal.repelledModels || {}), ...remoteCalib.repelledModels };
        }
        if (remoteCalib.reverseCalib && typeof remoteCalib.reverseCalib === 'object') {
          const curRc = cal.reverseCalib || { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 };
          cal.reverseCalib = {
            effortScales: { ...(curRc.effortScales || {}), ...(remoteCalib.reverseCalib.effortScales || {}) },
            tierLogPriors: { ...(curRc.tierLogPriors || {}), ...(remoteCalib.reverseCalib.tierLogPriors || {}) },
            modelResidualBias: { ...(curRc.modelResidualBias || {}), ...(remoteCalib.reverseCalib.modelResidualBias || {}) },
            updatedAt: Math.max(curRc.updatedAt || 0, remoteCalib.reverseCalib.updatedAt || 0, Date.now()),
          };
        }
        cal.updatedAt = Date.now();
        saveCalibration(cal);
      }
      if (remoteStats && typeof remoteStats === 'object') {
        try {
          const st = getUsageStats();
          for (const bucket of ['vendors', 'families', 'models', 'efforts']) {
            if (remoteStats[bucket] && typeof remoteStats[bucket] === 'object') {
              st[bucket] = st[bucket] || {};
              for (const [bk, bv] of Object.entries(remoteStats[bucket])) {
                if (Number.isFinite(+bv) && +bv > 0) {
                  st[bucket][bk] = Math.max(Number(st[bucket][bk]) || 0, +bv);
                }
              }
            }
          }
          st.updatedAt = Date.now();
          _cachedUsageStats = st;
          if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, st);
        } catch {}
      }
      const saved = (added > 0 || updated > 0 || persistToHost)
        ? saveBank([...bySid.values()], { persistToHost })
        : [...bySid.values()];
      if (added > 0 || updated > 0) {
        try {
          UI?.renderListSoon?.();
          Dock?.soon?.();
        } catch {}
      }
      const modelSet = new Set(saved.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
      return { added, updated, skipped, total: saved.length, modelCount: modelSet.size };
    } catch {
      const cur = loadBank();
      const modelSet = new Set(cur.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
      return { added, updated, skipped, total: cur.length, modelCount: modelSet.size };
    }
  }


  // ── 50 维 HTML/SVG 静态代码结构、运动学与特征词指纹子引擎（融合自千面 v9.2 281 原型库 v5.2 + 17 维结构签名 + 5 维 SVG32 裁判 + 四大数学皇冠非饱和谱图算子）──
