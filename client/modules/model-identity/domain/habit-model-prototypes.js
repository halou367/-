// Client UI adapter: Session telemetry & billing cost analytics view controller.
const ChatHabitFingerprint = (() => {
  const BANK_KEY = 'habitLearnBank:v1';
  const MAX_BANK_SAMPLES = 1600;
  let sharedBankLoaded = false;

  // 五级真值权重金字塔（5-Tier Truth Hierarchy）：
  // 5 = T0 Battle 双子星同题揭晓 (9.5)
  // 4 = T1 Battle 单边揭晓 / 诊断 JSON 真值 (8.0~8.5)
  // 3 = T2 Direct 直连模式锁定真值 (6.5)
  // 2 = T3 /cost 丢番图唯一解教师 (3.2) 或 T4 用户手动纠偏趋势参考 (1.8)
  function getSampleTruthRank(s) {
    if (!s || typeof s !== 'object') return 0;
    if (s.truthTier === 'battle_paired' || (s.battleRevealed && s.battlePair?.partnerModel)) return 5;
    if (s.battleRevealed || s.truthTier === 'battle_single' || /#[ab]$/i.test(String(s.sid || ''))) return 4;
    if (s.importedFromDiag || s.truthTier === 'diag_verified') return 4;
    if (s.directMode || s.truthTier === 'direct_locked') return 3;
    if (s.userConfirmed && !s.autoTeacher) return 2;
    if (s.userConfirmed || s.autoTeacher) return 1;
    return 0;
  }

  const isOpenName = s => {
    const id = String(s || '').toLowerCase();
    if (/muse/i.test(id)) return false;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return true;
    return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(id);
  };

  // Pre-trained empirical prototypes derived from 226 real identified sessions & 31 IndexedDB conversation blobs on the user's PC
  const PROTOTYPES = [
    // ── Anthropic Claude (Closed-Source: hidR > 0, visR === 0, silent tool calls, write/edit/read/present + pyHeredoc + cnColon/emDash) ──
    {
      id: 'anthropic/claude-opus-5.6',
      label: 'Claude Opus 5.6 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 91.5,
      // [hasHidR, noR, preNarrate, editReadRatio, writeRatio, parallelRate, pyHeroRate, catHeroRate, chainAndRate, rgSedRate, cssRoot, raf, svgRich, boxComment, emDashRate, cnColonRate, h3Pref, charScale, stepScale, durScale]
      vec: [1.0, 0.0, 0.04, 0.36, 0.14, 0.22, 0.42, 0.14, 0.28, 0.22, 0.90, 0.85, 0.88, 0.92, 0.65, 0.82, 0.45, 0.82, 0.88, 0.85],
      tags: ['闭源多步深层隐藏思考', '静默连续工具调用', 'Bash+Read/Edit/Write协同', 'CSS :root与模块化注释习惯'],
    },
    {
      id: 'anthropic/claude-opus-5.6-high',
      label: 'Claude Opus 5.6 (High)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 82.0,
      vec: [1.0, 0.0, 0.08, 0.34, 0.15, 0.18, 0.38, 0.12, 0.25, 0.20, 0.86, 0.80, 0.84, 0.86, 0.58, 0.78, 0.46, 0.76, 0.78, 0.74],
      tags: ['闭源深层隐藏思考', 'Bash+Read/Edit/Write协同', 'Anthropic工程结构习惯'],
    },
    {
      id: 'anthropic/claude-opus-5.5',
      label: 'Claude Opus 5.5 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 88.5,
      vec: [1.0, 0.0, 0.65, 0.28, 0.18, 0.12, 0.40, 0.12, 0.24, 0.18, 0.88, 0.82, 0.86, 0.84, 0.52, 0.76, 0.46, 0.78, 0.72, 0.74],
      tags: ['闭源深层思考(1段/轮)', '工具前完整长段报备(preToolText)', 'Bash+Write工程闭环'],
    },

    {
      id: 'anthropic/claude-opus-5.5-high',
      label: 'Claude Opus 5.5 (High)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 78.0,
      vec: [1.0, 0.0, 0.58, 0.26, 0.16, 0.10, 0.36, 0.10, 0.20, 0.15, 0.82, 0.76, 0.80, 0.78, 0.46, 0.72, 0.48, 0.70, 0.64, 0.65],
      tags: ['闭源思考与工具前报备', '稳健工程构建习惯'],
    },
    {
      id: 'anthropic/claude-opus-5.5-medium',
      label: 'Claude Opus 5.5 (Medium)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 68.0,
      vec: [1.0, 0.0, 0.04, 0.04, 0.20, 0.0, 0.30, 0.08, 0.14, 0.10, 0.76, 0.70, 0.74, 0.68, 0.38, 0.72, 0.50, 0.64, 0.56, 0.56],
      tags: ['闭源思考(1.5~2段/轮)', '静默双Write+Bash稳健构建(12k~16k字)'],
    },
    {
      id: 'anthropic/claude-opus-5-max',
      label: 'Claude Opus 5 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 85.0,
      vec: [1.0, 0.0, 0.55, 0.26, 0.16, 0.10, 0.34, 0.10, 0.20, 0.16, 0.84, 0.78, 0.82, 0.80, 0.50, 0.74, 0.46, 0.74, 0.68, 0.70],
      tags: ['Anthropic Opus 5深层思考', '结构化长文与工具前报备'],
    },
    {
      id: 'anthropic/claude-sonnet-5.5',
      label: 'Claude Sonnet 5.5 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 84.5,
      vec: [1.0, 0.0, 0.45, 0.34, 0.22, 0.18, 0.38, 0.12, 0.24, 0.18, 0.88, 0.82, 0.86, 0.85, 0.58, 0.78, 0.48, 0.76, 0.68, 0.66],
      tags: ['闭源隐藏思考', '高密度Write/Edit代码构建', '暖色衬线美学与CSS变量习惯', '结构化中文冒号排版'],
    },
    {
      id: 'anthropic/claude-sonnet-5.5-high',
      label: 'Claude Sonnet 5.5 (High)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 73.5,
      vec: [1.0, 0.0, 0.40, 0.30, 0.20, 0.14, 0.34, 0.10, 0.20, 0.15, 0.82, 0.76, 0.80, 0.78, 0.50, 0.74, 0.50, 0.68, 0.58, 0.56],
      tags: ['闭源隐藏思考', '高效率Write/Edit代码构建'],
    },
    {
      id: 'anthropic/claude-sonnet-5',
      label: 'Claude Sonnet 5 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 80.0,
      vec: [1.0, 0.0, 0.42, 0.30, 0.20, 0.14, 0.34, 0.10, 0.20, 0.15, 0.84, 0.78, 0.82, 0.78, 0.52, 0.74, 0.48, 0.70, 0.62, 0.60],
      tags: ['Anthropic Sonnet 5均衡编码与排版'],
    },
    {
      id: 'anthropic/claude-fable-5.1',
      label: 'Claude Fable 5.1 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 86.0,
      vec: [1.0, 0.0, 0.32, 0.32, 0.16, 0.20, 0.40, 0.12, 0.25, 0.20, 0.86, 0.80, 0.84, 0.82, 0.62, 0.80, 0.46, 0.78, 0.78, 0.75],
      tags: ['闭源隐藏思考', 'Anthropic工具间旁白衔接(interToolText)', '长破折号与加粗冒号习惯'],
    },
    {
      id: 'anthropic/claude-fable-5.1-high',
      label: 'Claude Fable 5.1 (High)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 75.5,
      vec: [1.0, 0.0, 0.30, 0.28, 0.15, 0.16, 0.36, 0.10, 0.22, 0.18, 0.80, 0.74, 0.78, 0.76, 0.56, 0.76, 0.48, 0.70, 0.68, 0.65],
      tags: ['闭源隐藏思考', 'Anthropic Fable 5.1稳健工具链'],
    },
    {
      id: 'anthropic/claude-fable-5',
      label: 'Claude Fable 5 (Max)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 82.5,
      vec: [1.0, 0.0, 0.30, 0.28, 0.15, 0.16, 0.36, 0.10, 0.22, 0.18, 0.82, 0.76, 0.80, 0.78, 0.58, 0.76, 0.46, 0.74, 0.70, 0.68],
      tags: ['Anthropic Fable 5叙事与工具协同'],
    },
    {
      id: 'anthropic/claude-haiku-5.5',
      label: 'Claude Haiku 5.5 (High)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 63.0,
      vec: [1.0, 0.0, 0.08, 0.22, 0.14, 0.08, 0.35, 0.10, 0.18, 0.12, 0.65, 0.55, 0.62, 0.50, 0.18, 0.76, 0.50, 0.38, 0.52, 0.48],
      tags: ['闭源紧凑隐藏思考', '精炼回复(600~900字)', '加粗中文冒号排版', '中高速工具节奏'],
    },
    {
      id: 'anthropic/claude-haiku-5.5-medium',
      label: 'Claude Haiku 5.5 (Medium)',
      vendor: 'Anthropic',
      isOpen: false,
      baseScore: 44.5,
      vec: [1.0, 0.0, 0.10, 0.18, 0.12, 0.04, 0.30, 0.08, 0.14, 0.08, 0.50, 0.40, 0.48, 0.35, 0.12, 0.70, 0.50, 0.28, 0.35, 0.32],
      tags: ['闭源轻量隐藏思考', '短平快回复节奏', 'Anthropic行文特征'],
    },
    // ── Google Gemini (Closed-Source: coding turns have rCount === 0 in snapshot, distinct Bash Python/Cat Heredoc & large uppercase <!DOCTYPE html> patterns) ──
    {
      id: 'google/gemini-3.8-flash',
      label: 'Gemini 3.8 Flash (High)',
      vendor: 'Google',
      isOpen: false,
      baseScore: 81.0,
      vec: [0.0, 1.0, 0.03, 0.03, 0.22, 0.38, 0.68, 0.45, 0.08, 0.04, 0.88, 0.85, 0.88, 0.30, 0.10, 0.55, 0.88, 0.92, 0.76, 0.65],
      tags: ['编码轮零思考块(Gemini快照特征)', '零Edit纯Bash Python/Cat Heredoc流', '超长单文件HTML/SVG产出(50k~90k字)', '写文件+正文双发HTML习惯'],
    },
    {
      id: 'google/gemini-3.8-flash-medium',
      label: 'Gemini 3.8 Flash (Medium)',
      vendor: 'Google',
      isOpen: false,
      baseScore: 54.0,
      vec: [0.0, 1.0, 0.05, 0.03, 0.20, 0.24, 0.52, 0.35, 0.06, 0.04, 0.72, 0.68, 0.70, 0.25, 0.08, 0.48, 0.82, 0.68, 0.52, 0.46],
      tags: ['编码轮零思考块(Gemini快照特征)', 'Bash Heredoc脚本流', '中高速工具执行节奏'],
    },
    {
      id: 'google/gemini-3.8-flash-low',
      label: 'Gemini 3.8 Flash (Low)',
      vendor: 'Google',
      isOpen: false,
      baseScore: 42.0,
      vec: [0.0, 1.0, 0.05, 0.02, 0.14, 0.10, 0.35, 0.20, 0.04, 0.02, 0.58, 0.52, 0.56, 0.18, 0.06, 0.42, 0.72, 0.38, 0.30, 0.22],
      tags: ['Gemini轻量低推理档', '单轮快速直答'],
    },
    {
      id: 'google/gemini-3.7-flash',
      label: 'Gemini 3.7 Flash (High)',
      vendor: 'Google',
      isOpen: false,
      baseScore: 72.0,
      vec: [0.0, 1.0, 0.04, 0.05, 0.24, 0.28, 0.55, 0.38, 0.08, 0.05, 0.78, 0.74, 0.76, 0.28, 0.10, 0.50, 0.80, 0.78, 0.64, 0.55],
      tags: ['编码轮零思考块(Gemini快照特征)', 'Bash脚本与单文件HTML直出'],
    },
    {
      id: 'google/gemini-3.7-flash-medium',
      label: 'Gemini 3.7 Flash (Medium)',
      vendor: 'Google',
      isOpen: false,
      baseScore: 52.0,
      vec: [0.0, 1.0, 0.05, 0.03, 0.18, 0.12, 0.42, 0.25, 0.05, 0.03, 0.64, 0.60, 0.62, 0.20, 0.08, 0.46, 0.75, 0.45, 0.35, 0.25],
      tags: ['无显式思考块(Gemini快照特征)', '短耗时精炼回复(10~15s)'],
    },
    {
      id: 'google/gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro Preview',
      vendor: 'Google',
      isOpen: false,
      baseScore: 79.0,
      vec: [0.0, 1.0, 0.04, 0.36, 0.18, 0.32, 0.35, 0.22, 0.28, 0.24, 0.82, 0.78, 0.80, 0.34, 0.12, 0.54, 0.85, 0.82, 0.74, 0.68],
      tags: ['编码轮零思考块(Gemini快照特征)', 'Read+Edit与Bash组合工具流', '长上下文结构化工程输出'],
    },
    {
      id: 'contenders/barium-bb-v2-4xts-agent-max',
      label: 'Gemini 4 Argon (Max)',
      vendor: 'Google',
      isOpen: false,
      argonOnly: true,
      baseScore: 88.5,
      vec: [0.0, 1.0, 0.02, 0.56, 0.08, 0.48, 0.22, 0.06, 0.46, 0.42, 0.88, 0.84, 0.88, 0.44, 0.18, 0.60, 0.94, 0.92, 0.88, 0.84],
      tags: ['无显式思考块(Gemini快照特征)', '深度Read+Edit+Bash工程闭环(Max)', '高并发并行工具步与长耗时推理'],
    },
    {
      id: 'contenders/barium-bb-v2-4xts-agent',
      label: 'Gemini 4 Argon (High)',
      vendor: 'Google',
      isOpen: false,
      argonOnly: true,
      baseScore: 82.0,
      vec: [0.0, 1.0, 0.02, 0.52, 0.06, 0.45, 0.18, 0.05, 0.42, 0.38, 0.85, 0.80, 0.85, 0.40, 0.15, 0.58, 0.92, 0.88, 0.85, 0.78],
      tags: ['无显式思考块(Gemini快照特征)', '高频Read+Edit或长耗时深度Bash闭环', '高并发并行工具步(Parallel Steps)'],
    },
    {
      id: 'contenders/barium-bb-v2-4xts-agent-medium',
      label: 'Gemini 4 Argon (Medium)',
      vendor: 'Google',
      isOpen: false,
      argonOnly: true,
      baseScore: 64.0,
      vec: [0.0, 1.0, 0.02, 0.12, 0.04, 0.15, 0.55, 0.05, 0.30, 0.25, 0.72, 0.68, 0.72, 0.28, 0.12, 0.52, 0.84, 0.62, 0.68, 0.65],
      tags: ['无显式思考块(Gemini快照特征)', '中等耗时纯Bash探测流'],
    },
    {
      id: 'contenders/barium-bb-v2-4xts-agent-low',
      label: 'Gemini 4 Argon (Low)',
      vendor: 'Google',
      isOpen: false,
      argonOnly: true,
      baseScore: 52.0,
      vec: [0.0, 1.0, 0.01, 0.04, 0.02, 0.04, 0.85, 0.02, 0.20, 0.15, 0.55, 0.65, 0.65, 0.25, 0.05, 0.45, 0.90, 0.85, 0.85, 0.80],
      tags: ['无显式思考块(Gemini快照特征)', '高频Search+Bash长链路扫描'],
    },
    // ── OpenAI GPT-6 / 6.1 / 5.6 (Closed-Source: hidR >= 1, silent tool calls preNarrate === 0, sandbox:/ links, lowercase <!doctype html>) ──
    {
      id: 'openai/gpt-6.1-sol',
      label: 'GPT 6.1 Sol (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 86.0,
      vec: [1.0, 0.0, 0.04, 0.24, 0.24, 0.26, 0.42, 0.12, 0.24, 0.16, 0.86, 0.76, 0.84, 0.42, 0.32, 0.42, 0.58, 0.78, 0.80, 0.76],
      tags: ['OpenAI多步深层隐藏思考(3+段/轮)', '并行工具步与Write/Edit/Bash闭环', '小写<!doctype>与color-scheme习惯'],
    },
    {
      id: 'openai/gpt-6.1-sol-xhigh',
      label: 'GPT 6.1 Sol (xHigh)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 79.5,
      vec: [1.0, 0.0, 0.04, 0.20, 0.25, 0.20, 0.38, 0.10, 0.20, 0.14, 0.82, 0.70, 0.80, 0.38, 0.30, 0.41, 0.56, 0.72, 0.72, 0.70],
      tags: ['OpenAI高深层隐藏思考(xHigh)', 'sandbox:/链接与高完整度单页构建'],
    },
    {
      id: 'openai/gpt-6.1-sol-high',
      label: 'GPT 6.1 Sol (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 71.0,
      vec: [1.0, 0.0, 0.05, 0.18, 0.26, 0.18, 0.36, 0.10, 0.18, 0.12, 0.78, 0.64, 0.76, 0.34, 0.28, 0.40, 0.55, 0.64, 0.64, 0.60],
      tags: ['OpenAI多步工具链与隐藏思考', 'sandbox:/工作区链接或ask_user意图确认', '小写<!doctype>与SMIL动画习惯'],
    },
    {
      id: 'openai/gpt-6.1-sol-medium',
      label: 'GPT 6.1 Sol (Medium)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 60.0,
      vec: [1.0, 0.0, 0.04, 0.12, 0.24, 0.10, 0.28, 0.08, 0.12, 0.08, 0.72, 0.58, 0.70, 0.30, 0.24, 0.38, 0.52, 0.54, 0.52, 0.48],
      tags: ['OpenAI 6.1 Sol中档推理', '双Write+Bash均衡构建与SMIL动画习惯'],
    },
    {
      id: 'openai/gpt-6.1-sol-low',
      label: 'GPT 6.1 Sol (Low)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 48.0,
      vec: [1.0, 0.0, 0.03, 0.08, 0.22, 0.06, 0.22, 0.06, 0.08, 0.04, 0.66, 0.52, 0.64, 0.26, 0.20, 0.34, 0.50, 0.46, 0.44, 0.40],
      tags: ['OpenAI 6.1 Sol轻量低档构建', 'sandbox:/链接与小写<!doctype>快速输出'],
    },
    {
      id: 'openai/gpt-6-sol',
      label: 'GPT 6 Sol (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 83.0,
      vec: [1.0, 0.0, 0.05, 0.12, 0.20, 0.04, 0.30, 0.08, 0.12, 0.08, 0.76, 0.66, 0.74, 0.34, 0.30, 0.44, 0.56, 0.72, 0.58, 0.74],
      tags: ['OpenAI长单轮深层推理(少并发工具)', '长耗时深度思考与详尽分节阐述'],
    },
    {
      id: 'openai/gpt-6-sol-xhigh',
      label: 'GPT 6 Sol (xHigh)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 76.5,
      vec: [1.0, 0.0, 0.05, 0.11, 0.20, 0.03, 0.28, 0.07, 0.11, 0.07, 0.72, 0.62, 0.70, 0.31, 0.28, 0.43, 0.55, 0.66, 0.54, 0.68],
      tags: ['OpenAI 6 Sol高深层推理(xHigh)', '多步隐藏思考与结构化工程构建'],
    },
    {
      id: 'openai/gpt-6-sol-high',
      label: 'GPT 6 Sol (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 69.0,
      vec: [1.0, 0.0, 0.06, 0.10, 0.20, 0.02, 0.26, 0.06, 0.10, 0.06, 0.68, 0.58, 0.66, 0.28, 0.26, 0.42, 0.54, 0.60, 0.48, 0.62],
      tags: ['OpenAI稳健深层思考', '串行单步工具与结构化长文'],
    },
    {
      id: 'openai/gpt-6-sol-medium',
      label: 'GPT 6 Sol (Medium)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 61.0,
      vec: [1.0, 0.0, 0.05, 0.08, 0.20, 0.0, 0.24, 0.06, 0.08, 0.04, 0.64, 0.54, 0.62, 0.24, 0.22, 0.40, 0.52, 0.52, 0.44, 0.48],
      tags: ['OpenAI中等深层推理', '中速分块流式输出与紧凑构建'],
    },
    {
      id: 'openai/gpt-6-sol-low',
      label: 'GPT 6 Sol (Low)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 49.0,
      vec: [1.0, 0.0, 0.04, 0.06, 0.18, 0.0, 0.18, 0.04, 0.06, 0.03, 0.58, 0.48, 0.56, 0.20, 0.18, 0.36, 0.48, 0.42, 0.36, 0.36],
      tags: ['OpenAI 6 Sol低档轻量推理', '短耗时单步构建与直接回复'],
    },
    {
      id: 'openai/gpt-6-astra',
      label: 'GPT 6 Astra (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 81.5,
      vec: [1.0, 0.0, 0.06, 0.22, 0.32, 0.12, 0.28, 0.08, 0.14, 0.10, 0.80, 0.74, 0.78, 0.36, 0.36, 0.48, 0.66, 0.68, 0.60, 0.52],
      tags: ['OpenAI中高速均衡流(80~120字/秒)', 'Write/Read主导的高完成度单页构建', '三级标题与表格化条理排版'],
    },
    {
      id: 'openai/gpt-6-astra-xhigh',
      label: 'GPT 6 Astra (xHigh)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 74.5,
      vec: [1.0, 0.0, 0.06, 0.20, 0.31, 0.10, 0.26, 0.07, 0.13, 0.09, 0.76, 0.69, 0.74, 0.33, 0.34, 0.47, 0.65, 0.62, 0.55, 0.48],
      tags: ['OpenAI Astra高深层均衡构建(xHigh)', '中高速流与高完整度HTML/SVG'],
    },
    {
      id: 'openai/gpt-6-astra-high',
      label: 'GPT 6 Astra (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 67.5,
      vec: [1.0, 0.0, 0.06, 0.18, 0.30, 0.08, 0.24, 0.06, 0.12, 0.08, 0.72, 0.64, 0.70, 0.30, 0.32, 0.46, 0.64, 0.56, 0.50, 0.44],
      tags: ['OpenAI中高速均衡交付', '精炼Write构建与清晰列表分节'],
    },
    {
      id: 'openai/gpt-6-astra-medium',
      label: 'GPT 6 Astra (Medium)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 55.0,
      vec: [1.0, 0.0, 0.12, 0.12, 0.24, 0.04, 0.18, 0.04, 0.08, 0.06, 0.64, 0.56, 0.62, 0.24, 0.26, 0.42, 0.58, 0.44, 0.38, 0.34],
      tags: ['OpenAI Astra轻量交付', '工具前简短说明(I’ll create a self-contained HTML)'],
    },
    {
      id: 'openai/gpt-6-astra-low',
      label: 'GPT 6 Astra (Low)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 46.5,
      vec: [1.0, 0.0, 0.10, 0.08, 0.20, 0.02, 0.14, 0.03, 0.06, 0.04, 0.56, 0.48, 0.54, 0.20, 0.20, 0.38, 0.54, 0.36, 0.30, 0.26],
      tags: ['OpenAI Astra极速轻量交付(Low)', '简短直答与轻量SVG/HTML单页生成'],
    },
    {
      id: 'openai/gpt-6.1-luna',
      label: 'GPT 6.1 Luna (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 76.5,
      vec: [1.0, 0.0, 0.04, 0.08, 0.22, 0.04, 0.50, 0.04, 0.08, 0.04, 0.72, 0.62, 0.70, 0.26, 0.24, 0.38, 0.54, 0.52, 0.68, 0.38],
      tags: ['OpenAI 6.1 Luna高速连发推理块', '高密度思考段与快速响应'],
    },
    {
      id: 'openai/gpt-6.1-luna-high',
      label: 'GPT 6.1 Luna (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 64.5,
      vec: [1.0, 0.0, 0.04, 0.06, 0.20, 0.02, 0.46, 0.04, 0.06, 0.03, 0.64, 0.54, 0.62, 0.22, 0.20, 0.36, 0.52, 0.44, 0.46, 0.30],
      tags: ['OpenAI 6.1 Luna高速推理', '紧凑多段思考与轻量工具流'],
    },
    {
      id: 'openai/gpt-6-luna',
      label: 'GPT 6 Luna (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 75.0,
      vec: [1.0, 0.0, 0.04, 0.06, 0.20, 0.02, 0.52, 0.04, 0.06, 0.04, 0.70, 0.60, 0.68, 0.24, 0.22, 0.38, 0.52, 0.48, 0.78, 0.42],
      tags: ['OpenAI高速闭源响应(单轮8~110段密集思考爆发)', '多段连续隐藏思考块与快速工具交付'],
    },
    {
      id: 'openai/gpt-6-luna-high',
      label: 'GPT 6 Luna (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 63.0,
      vec: [1.0, 0.0, 0.04, 0.04, 0.18, 0.0, 0.46, 0.04, 0.04, 0.02, 0.62, 0.52, 0.60, 0.20, 0.18, 0.36, 0.50, 0.40, 0.36, 0.26],
      tags: ['OpenAI高速轻量推理', '短耗时紧凑分点直答'],
    },
    {
      id: 'openai/gpt-6-luna-medium',
      label: 'GPT 6 Luna (Medium)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 52.0,
      vec: [1.0, 0.0, 0.04, 0.04, 0.16, 0.0, 0.40, 0.04, 0.04, 0.02, 0.54, 0.44, 0.52, 0.18, 0.16, 0.34, 0.48, 0.34, 0.30, 0.22],
      tags: ['OpenAI快速闭源响应', '轻量工具与直答习惯'],
    },
    {
      id: 'openai/gpt-6-luna-low',
      label: 'GPT 6 Luna (Low)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 44.0,
      vec: [1.0, 0.0, 0.02, 0.04, 0.16, 0.0, 0.36, 0.02, 0.04, 0.02, 0.50, 0.40, 0.48, 0.16, 0.14, 0.30, 0.44, 0.28, 0.24, 0.18],
      tags: ['OpenAI极速轻量响应', '超短耗时紧凑构建'],
    },
    {
      id: 'openai/gpt-5.6-sol-max',
      label: 'GPT 5.6 Sol (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 72.0,
      vec: [1.0, 0.0, 0.06, 0.14, 0.22, 0.0, 0.30, 0.08, 0.12, 0.08, 0.66, 0.56, 0.64, 0.26, 0.24, 0.44, 0.52, 0.56, 0.54, 0.52],
      tags: ['OpenAI 5.6深层串行推理', '高密度思考Token与稳健输出'],
    },
    {
      id: 'openai/gpt-5.6-sol',
      label: 'GPT 5.6 Sol (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 66.0,
      vec: [1.0, 0.0, 0.08, 0.14, 0.22, 0.0, 0.32, 0.08, 0.14, 0.08, 0.66, 0.56, 0.64, 0.26, 0.24, 0.44, 0.50, 0.52, 0.46, 0.46],
      tags: ['OpenAI 5.6稳健串行工具流(零并发步)', '中等思考块(1~2段/轮)与中速流式输出'],
    },
    {
      id: 'openai/gpt-5.6-sol-medium',
      label: 'GPT 5.6 Sol (Medium)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 54.0,
      vec: [1.0, 0.0, 0.04, 0.04, 0.08, 0.0, 0.16, 0.04, 0.06, 0.04, 0.48, 0.42, 0.46, 0.22, 0.12, 0.34, 0.48, 0.32, 0.28, 0.24],
      tags: ['OpenAI 5.6轻量中档推理', '多轮轻量澄清与快速响应'],
    },
    {
      id: 'openai/gpt-5.6-sol-low',
      label: 'GPT 5.6 Sol (Low)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 42.0,
      vec: [1.0, 0.0, 0.04, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.38, 0.36, 0.38, 0.20, 0.08, 0.28, 0.44, 0.22, 0.18, 0.16],
      tags: ['OpenAI 5.6极速低档直答', '单轮短耗时精简回复'],
    },
    {
      id: 'openai/gpt-5.6-terra-max',
      label: 'GPT 5.6 Terra (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 64.0,
      vec: [1.0, 0.0, 0.06, 0.04, 0.08, 0.0, 0.16, 0.04, 0.06, 0.04, 0.48, 0.42, 0.46, 0.22, 0.20, 0.36, 0.50, 0.34, 0.32, 0.28],
      tags: ['OpenAI 5.6 Terra多轮深层推理', '多段隐藏思考与精炼表达'],
    },
    {
      id: 'openai/gpt-5.6-terra',
      label: 'GPT 5.6 Terra (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 58.0,
      vec: [1.0, 0.0, 0.08, 0.08, 0.16, 0.0, 0.24, 0.04, 0.08, 0.04, 0.56, 0.46, 0.54, 0.20, 0.18, 0.40, 0.48, 0.38, 0.34, 0.32],
      tags: ['OpenAI 5.6轻量快速直答', '单步思考块与简明回复'],
    },
    {
      id: 'openai/gpt-5.6-terra-medium',
      label: 'GPT 5.6 Terra (Medium)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 52.0,
      vec: [1.0, 0.0, 0.06, 0.04, 0.08, 0.0, 0.60, 0.04, 0.06, 0.04, 0.44, 0.40, 0.44, 0.22, 0.16, 0.34, 0.48, 0.26, 0.48, 0.36],
      tags: ['OpenAI 5.6 Terra中档推理', 'Python Heredoc探测与紧凑表达'],
    },
    {
      id: 'x-ai/grok-4.7',
      label: 'Grok 4.7 (Max)',
      vendor: 'xAI',
      isOpen: false,
      baseScore: 76.0,
      vec: [0.85, 0.15, 0.35, 0.15, 0.15, 0.10, 0.40, 0.15, 0.22, 0.15, 0.72, 0.68, 0.70, 0.32, 0.42, 0.50, 0.50, 0.64, 0.60, 0.56],
      tags: ['xAI闭源推理节奏', '直白紧凑技术行文'],
    },
    {
      id: 'meta/muse-spark-1.3-max',
      label: 'Muse Spark 1.3 (Max)',
      vendor: 'Meta',
      isOpen: false,
      baseScore: 81.4,
      vec: [1.0, 0.0, 0.83, 0.0, 0.50, 0.12, 0.0, 0.0, 0.0, 0.0, 0.47, 0.70, 0.75, 0.58, 0.60, 0.0, 0.50, 0.996, 0.30, 0.39],
      tags: ['Meta Muse闭源隐藏思考(2~3段/轮)', '工具前完整报备与高速流块(21~28字)'],
    },
    {
      id: 'meta/muse-spark-1.2-xhigh',
      label: 'Muse Spark 1.2 (xHigh)',
      vendor: 'Meta',
      isOpen: false,
      baseScore: 76.0,
      vec: [1.0, 0.0, 0.75, 0.0, 0.45, 0.10, 0.0, 0.0, 0.0, 0.0, 0.45, 0.68, 0.72, 0.52, 0.55, 0.0, 0.50, 0.92, 0.28, 0.36],
      tags: ['Meta Muse 1.2闭源高强推理', '工具前报备与中大流块输出'],
    },
    {
      id: 'meta/muse-wonder',
      label: 'Muse Wonder',
      vendor: 'Meta',
      isOpen: false,
      baseScore: 82.0,
      vec: [1.0, 0.0, 0.78, 0.04, 0.48, 0.14, 0.06, 0.02, 0.04, 0.02, 0.52, 0.72, 0.76, 0.56, 0.58, 0.05, 0.54, 0.96, 0.34, 0.42],
      tags: ['Meta Muse Wonder闭源推理', '工具前报备与高密度流块输出'],
    },
    // ── Open-Source Models (isOpen: true, visR > 0 or open-source Apache/MIT contenders, NEVER calls /cost) ──
    {
      id: 'moonshot/kimi-k3',
      label: 'Kimi K3',
      vendor: 'Moonshot',
      isOpen: true,
      baseScore: 62.0,
      vec: [0.0, 0.0, 0.28, 0.18, 0.20, 0.06, 0.35, 0.15, 0.18, 0.12, 0.68, 0.60, 0.64, 0.30, 0.35, 0.72, 0.55, 0.55, 0.52, 0.50],
      tags: ['开源可见思考过程', 'Kimi中文结构化分点与工具习惯'],
    },
    {
      id: 'deepseek/deepseek-v4.1-flash',
      label: 'DeepSeek V4.1 Flash',
      vendor: 'DeepSeek',
      isOpen: true,
      baseScore: 89.0,
      vec: [0.0, 0.0, 0.18, 0.16, 0.22, 0.08, 0.48, 0.18, 0.22, 0.16, 0.80, 0.76, 0.78, 0.45, 0.48, 0.78, 0.52, 0.74, 0.78, 0.72],
      tags: ['开源深度可见思考链', 'DeepSeek密集推导与破折号/加粗冒号习惯'],
    },
    {
      id: 'deepseek/deepseek-v4.1-flash-20260910',
      label: 'DeepSeek V4.1 Flash 20260910',
      vendor: 'DeepSeek',
      isOpen: true,
      baseScore: 88.0,
      vec: [0.0, 0.0, 0.16, 0.14, 0.20, 0.06, 0.44, 0.16, 0.20, 0.14, 0.76, 0.72, 0.74, 0.42, 0.44, 0.76, 0.52, 0.70, 0.74, 0.70],
      tags: ['开源深度可见思考链', 'DeepSeek V4.1 Flash 0910推理'],
    },
    {
      id: 'zhipu/glm-5.2-max',
      label: 'GLM 5.2 Max',
      vendor: 'Zhipu',
      isOpen: true,
      baseScore: 88.0,
      vec: [0.0, 0.0, 0.22, 0.20, 0.22, 0.08, 0.42, 0.16, 0.20, 0.14, 0.78, 0.74, 0.76, 0.38, 0.30, 0.80, 0.58, 0.72, 0.75, 0.68],
      tags: ['开源可见思考过程', 'GLM工整中文总分结构与长思考链'],
    },
    {
      id: 'zhipu/glm-5.3-max',
      label: 'GLM 5.3 Max',
      vendor: 'Zhipu',
      isOpen: true,
      baseScore: 89.0,
      vec: [0.0, 0.0, 0.24, 0.20, 0.22, 0.08, 0.44, 0.16, 0.20, 0.14, 0.80, 0.76, 0.78, 0.38, 0.32, 0.82, 0.58, 0.74, 0.76, 0.70],
      tags: ['开源可见思考过程', 'GLM 5.3 Max工整中文结构与深度推导'],
    },
    {
      id: 'alibaba/qwen-3.7-max',
      label: 'Qwen 3.7 Max',
      vendor: 'Alibaba',
      isOpen: true,
      baseScore: 76.0,
      vec: [0.0, 0.0, 0.25, 0.18, 0.20, 0.06, 0.38, 0.14, 0.18, 0.12, 0.72, 0.66, 0.70, 0.32, 0.25, 0.74, 0.55, 0.64, 0.62, 0.58],
      tags: ['开源可见思考过程', 'Qwen条理化列表与稳健工具调用'],
    },
    {
      id: 'alibaba/qwen3.8-max',
      label: 'Qwen 3.8 Max',
      vendor: 'Alibaba',
      isOpen: true,
      baseScore: 78.0,
      vec: [0.0, 0.0, 0.20, 0.12, 0.16, 0.04, 0.28, 0.10, 0.12, 0.08, 0.64, 0.58, 0.62, 0.28, 0.20, 0.68, 0.52, 0.50, 0.46, 0.42],
      tags: ['开源可见思考过程', 'Qwen 3.8 Max结构化思考'],
    },
    {
      id: 'alibaba/qwen3.8-flash-next',
      label: 'Qwen 3.8 Flash Next',
      vendor: 'Alibaba',
      isOpen: true,
      baseScore: 48.0,
      vec: [0.0, 0.0, 0.18, 0.10, 0.14, 0.02, 0.24, 0.08, 0.10, 0.06, 0.58, 0.52, 0.56, 0.24, 0.18, 0.64, 0.50, 0.42, 0.38, 0.34],
      tags: ['开源可见思考过程', 'Qwen 3.8 Flash Next极速轻量响应'],
    },
    {
      id: 'xiaomi/mimo-v2.6-flash',
      label: 'MiMo V2.6 Flash',
      vendor: 'Xiaomi',
      isOpen: true,
      baseScore: 54.0,
      vec: [0.0, 0.0, 0.20, 0.12, 0.16, 0.04, 0.26, 0.10, 0.12, 0.08, 0.60, 0.54, 0.58, 0.26, 0.20, 0.66, 0.52, 0.46, 0.42, 0.38],
      tags: ['开源可见思考过程', 'MiMo V2.6轻量推理'],
    },
    {
      id: 'deepseek/deepseek-v4.1-flash-1017',
      label: 'DeepSeek V4.1 Flash 1017',
      vendor: 'DeepSeek',
      isOpen: true,
      baseScore: 88.5,
      vec: [0.0, 0.0, 0.17, 0.15, 0.21, 0.07, 0.46, 0.17, 0.21, 0.15, 0.78, 0.74, 0.76, 0.44, 0.46, 0.77, 0.52, 0.72, 0.76, 0.71],
      tags: ['开源深度可见思考链(7字流块)', 'DeepSeek V4.1 Flash 1017推理'],
    },
    {
      id: 'meta/muse-spark-open',
      label: 'Muse Spark Open',
      vendor: 'Meta',
      isOpen: false,
      baseScore: 79.0,
      vec: [0.0, 0.0, 0.72, 0.04, 0.44, 0.10, 0.08, 0.04, 0.04, 0.02, 0.54, 0.68, 0.72, 0.50, 0.52, 0.15, 0.52, 0.88, 0.32, 0.40],
      tags: ['开源可见思考过程', 'Meta Muse Spark Open开源推理'],
    },
    {
      id: 'contenders/caveman-agent',
      label: 'Beam 1.0 501B A23B',
      vendor: 'Reflection AI',
      isOpen: true,
      baseScore: 74.0,
      vec: [0.0, 1.0, 0.20, 0.0, 0.04, 0.0, 0.60, 0.38, 0.0, 0.02, 0.72, 0.68, 0.70, 0.22, 0.05, 0.45, 0.25, 0.45, 0.65, 0.95],
      tags: ['纯Bash Python+Cat Heredoc混合流(零Read/Edit)', '超长单轮耗时(400s+)与极简英文/中文回复'],
    },
    {
      id: 'anthropic/claude-sonnet-5.5-xhigh',
      label: 'Claude Sonnet 5.5 (xHigh)',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,0.69,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0,0.5,0.1,0.07,0.7],
    },
    {
      id: 'anthropic/claude-opus-5-low',
      label: 'Claude Opus 5 (Low)',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.7,0.7,0.25,0.2,0,0.5,1,0.07,1],
    },
    {
      id: 'google/gemini-4-argon',
      label: 'Gemini 4 Argon',
      vendor: 'Google',
      isOpen: false,
      vec: [0,1,0.37,0,0,0,0,0,0,0,0.35,0.47,0.47,0.25,0,0.33,0.83,0.44,0.05,0.44],
    },
    {
      id: 'upstage/solar-pro4',
      label: 'Solar Pro 4',
      vendor: 'Upstage',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.52,0.7,0.25,0.1,0,0.5,1,0.07,1],
    },
    {
      id: 'stealth/kibitz',
      label: 'Kibitz',
      vendor: 'Stealth',
      isOpen: false,
      vec: [1,0,0.53,0.34,0,0,0,0,0,0,0.35,0.44,0.35,0.25,0.25,0.13,0.5,0.63,0.46,0.55],
    },
    {
      id: 'minimax/minimax-m2.7',
      label: 'MiniMax M2.7',
      vendor: 'MiniMax',
      isOpen: true,
      vec: [0,0,0.06,0,0,0,0,0,0,0,0.35,0.7,0.35,0.25,0,0.5,0.5,1,0.17,1],
    },
    {
      id: 'zai/glm-5.3-flash',
      label: 'GLM 5.3 Flash',
      vendor: 'Z.ai',
      isOpen: true,
      vec: [0,0,0.53,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0.1,0.5,0.5,0.66,0.42,1],
    },
    {
      id: 'openai/gpt-5.6-sol-xhigh',
      label: 'GPT 5.6 Sol (xHigh)',
      vendor: 'OpenAI',
      isOpen: false,
      vec: [1,0,0.03,0.08,0,0,0,0,0,0,0.52,0.35,0.35,0.25,0,0,0.5,0.66,0.5,1],
    },
    {
      id: 'anthropic/claude-opus-5-high',
      label: 'Claude Opus 5 (High)',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.7,0.7,0.7,0.75,0,0,0,1,0,1],
    },
    {
      id: 'anthropic/claude-fable-5.1-low',
      label: 'Claude Fable 5.1 (Low)',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,0.03,0,0,0,0,0,0.25,0.25,0.52,0.35,0.35,0.25,0,0.58,0.5,0.55,0.48,1],
    },
    {
      id: 'stealth/inkling-small',
      label: 'Inkling Small',
      vendor: 'Stealth',
      isOpen: true,
      vec: [0,0,0.06,0,0,0,0,0,0,0,0.35,0.7,0.35,0.25,0,0.5,0.5,1,0.17,1],
    },
    {
      id: 'xai/grok-4.6-xhigh',
      label: 'Grok 4.6 (xHigh)',
      vendor: 'xAI',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.7,0.52,0.25,0,0,0.5,0.9,0,0.55],
    },
    {
      id: 'minimax/minimax-m3',
      label: 'MiniMax M3',
      vendor: 'MiniMax',
      isOpen: true,
      vec: [0,0.33,0.69,0.44,0,0,0,0,0,0,0.35,0.35,0.52,0.25,0.07,0.28,0.5,0.47,0.5,0.7],
    },
    {
      id: 'stealth/horizon-6.2',
      label: 'Horizon 6.2',
      vendor: 'Stealth',
      isOpen: false,
      vec: [1,0,0.62,0.17,0,0,0,0,0,0,0.42,0.42,0.42,0.25,0.44,0.3,0.5,0.55,0.41,0.58],
    },
    {
      id: 'stealth/kalmia',
      label: 'Kalmia',
      vendor: 'Stealth',
      isOpen: false,
      vec: [1,0,0.69,0.17,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0.4,0.33,0.5,0.47,0.58,1],
    },
    {
      id: 'alibaba/qwen3.8-max-0902',
      label: 'Qwen 3.8 Max 0902',
      vendor: 'Alibaba',
      isOpen: true,
      vec: [0,0,1,0.63,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0.2,0.5,0.5,0.36,0.92,1],
    },
    {
      id: 'anthropic/claude-opus-5',
      label: 'Claude Opus 5',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,1,0.5,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0.5,0.5,0.32,0.5,1],
    },
    {
      id: 'anthropic/claude-opus-5-medium',
      label: 'claude-opus-5-medium',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,1,0.5,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0.2,0,0.5,0.1,0.14,0.33],
    },
    {
      id: 'alibaba/qwen3.8-27b',
      label: 'Qwen 3.8 27B',
      vendor: 'Alibaba',
      isOpen: true,
      vec: [0,1,0.06,0,0,0,0,0,0,0,0.35,0.52,0.35,0.25,0.2,0,0.5,0.89,0,0.28],
    },
    {
      id: 'xai/grok-4.6-high',
      label: 'Grok 4.6 (High)',
      vendor: 'xAI',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.35,0.47,0.25,0,0,0.5,0.64,0,0.4],
    },
    {
      id: 'stepfun/step-5-preview',
      label: 'Step 5 Preview',
      vendor: 'StepFun',
      isOpen: true,
      vec: [0,0.5,0.53,0.17,0,0,0,0,0,0,0.35,0.35,0.52,0.5,0,0,0.5,0.55,0.21,0.28],
    },
    {
      id: 'stealth/cynosure',
      label: 'Cynosure',
      vendor: 'Stealth',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.35,0.7,0.75,1,0,0.5,1,0,0.1],
    },
    {
      id: 'zai/glm-5.1',
      label: 'GLM 5.1',
      vendor: 'Z.ai',
      isOpen: true,
      vec: [0,1,0.06,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0.4,0,0.5,1,0,0.46],
    },
    {
      id: 'tencent/hy4-preview',
      label: 'HY4 Preview',
      vendor: 'Tencent',
      isOpen: true,
      vec: [0,1,0.06,0,0,0,0,0,0,0,0.35,0.35,0.7,0.25,0,0,0.5,1,0,0.46],
    },
    {
      id: 'anthropic/claude-opus-5.5-low',
      label: 'Claude Opus 5.5 (Low)',
      vendor: 'Anthropic',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0.33,0.5,0.1,0,0.1],
    },
    {
      id: 'alibaba/qwen3.5-397b-a17b',
      label: 'Qwen 3.5 397B A17B',
      vendor: 'Alibaba',
      isOpen: true,
      vec: [0,1,0.06,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0,0.5,0.51,0,0.1],
    },
    {
      id: 'openai/gpt-5.6-terra-xhigh',
      label: 'GPT 5.6 Terra (xHigh)',
      vendor: 'OpenAI',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0,0.5,0.32,0,0.46],
    },
    {
      id: 'xai/grok-4.6-medium',
      label: 'Grok 4.6 (Medium)',
      vendor: 'xAI',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0,0.5,0.59,0,0.1],
    },
    {
      id: 'meta/muse-spark-1.2-max',
      label: 'Muse Spark 1.2 (Max)',
      vendor: 'Meta',
      isOpen: false,
      vec: [1,0,1,0,1,0,0,0,0,0,0.35,0.7,0.7,0.25,1,0,0.5,1,0.21,0.43],
    },
    {
      id: 'meta/muse-spark-1.3-low',
      label: 'Muse Spark 1.3 (Low)',
      vendor: 'Meta',
      isOpen: false,
      vec: [1,0,0.06,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0,0,0.5,0.1,0.07,0.02],
    },
    {
      id: 'meta/muse-spark-1.3-high',
      label: 'Muse Spark 1.3 (High)',
      vendor: 'Meta',
      isOpen: false,
      vec: [1,0,1,0,0.5,0,0,0,0,0,0.35,0.35,0.35,0.75,0.3,0,0.5,0.92,0.25,0.23],
    },
    {
      id: 'meta/muse-spark-1.3-xhigh',
      label: 'Muse Spark 1.3 (xHigh)',
      vendor: 'Meta',
      isOpen: false,
      vec: [1,0,1,0,0,0,0,0,0,0,0.35,0.35,0.35,0.25,0.1,0,0.5,0.1,0.07,0.64],
    },
    {
      id: 'minimax/minimax-m3.1-flash',
      label: 'MiniMax M3.1 Flash',
      vendor: 'MiniMax',
      isOpen: true,
      vec: [0,0.5,0.88,0.8,0,0.125,0,0,0,0,0.35,0.35,0.35,0.25,0.2,0.33,0.5,0.18,0.71,0.52],
    },
  ];

  const KNOWN_ARGON_SIDS = new Set([
    '01a148c8-6f04-710a-88aa-9560c56c0bd4',
    '01a14957-ba36-7f15-9640-56b3d0ec48ee',
    '01a148ca-80b6-70c9-b6f9-a109b4cd987d',
    '01a148c6-ca67-7ceb-aa92-5c339219c511',
    '01a14952-484c-71a8-9c4a-a8375fab0e96',
    '01a14945-7342-7b05-9a63-eba75b98edc1',
    '01a152bd-4889-74e0-9582-c4406da4280e',
    '01a14d22-3773-75f1-86c2-5b4b320e8ed6',
    '01a14d86-d856-764e-bf1e-f0f9813086f8',
    '01a14d86-2966-78fe-847a-361dacd27bc4',
    '01a14cec-224c-71e5-a6c0-9ee87a3b3ba1',
  ]);
  const CONFIRMED_GEMINI_FLASH_SIDS = new Set([
    '01a148b9-30df-7fb9-87be-135772d6a4b0',
    '01a14a34-814a-792f-b7c1-ad747c5797ff',
    '01a151de-5840-75e5-b5e0-9bf662f543dd',
    '01a13ac5-6024-763a-9a83-c43b1bd86840',
  ]);
  const HAIKU_55_MEDIUM_SIDS = new Set([
    '01a13ee4-54ab-710c-ae56-163689598d73',
    '01a13ee4-294d-7e67-8554-fad3b69284f6',
  ]);
  const CONFIRMED_SOL_61_SIDS = new Set([
    '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54',
    '01a13f78-0d74-716a-97e7-cdeb3c7a5a3c',
    '01a1440a-e8c4-7939-8910-ffe946582807',
    '01a151e0-c58e-7766-9c65-f7287592c61b',
  ]);

  const KNOWN_DIAG_SIDS = new Set([
    '01a13ee4-294d-7e67-8554-fad3b69284f6',
    '01a13ef8-3b56-7b99-a43b-d991064c46d8',
    '01a13f78-2a78-73af-b245-221a0949c7ca',
    '01a13f8c-44aa-78eb-9d88-3f464586a2f1',
    '01a14141-6b87-7580-a7d5-bf37d09986d6',
    '01a14142-227a-7150-87f5-a06b13bc5613',
    '01a141e3-3f0c-75ef-b700-bf9ab9312277',
    '01a141e4-60ae-73ae-ba17-cd4ff105b084',
    '01a1440a-e8c4-7939-8910-ffe946582807',
    '01a148b9-8f93-741c-9115-05ff889e3fd6',
    '01a14a34-2246-79fd-90e3-c73b07db1e52',
    '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54',
    '01a151de-5840-75e5-b5e0-9bf662f543dd',
    '01a151e0-c58e-7766-9c65-f7287592c61b',
  ]);

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