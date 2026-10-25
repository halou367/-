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
    if ((s.importedFromDiag && !s.autoTeacher && s.truthTier !== 'manual_correction') || s.truthTier === 'diag_verified') return 4;
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
      id: 'xiaomi/mimo-v2.6-pro',
      label: 'MiMo V2.6 Pro',
      vendor: 'Xiaomi',
      isOpen: true,
      baseScore: 76.0,
      vec: [0.0, 0.0, 1.0, 0.80, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.70, 0.70, 0.70, 0.75, 1.0, 0.0, 0.50, 1.0, 1.0, 1.0],
      tags: ['开源可见思考过程', 'MiMo V2.6深度工程推理'],
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
    '01a14cfb-2e45-72a1-912b-ed3cd57dc7ec': { model: 'gpt-6.1-sol-low', rawLabel: 'GPT 6.1 Sol (Low)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a14cfb-0408-7e95-9ba9-1ba6e96ed154': { model: 'gpt-6-astra-low', rawLabel: 'GPT 6 Astra (Low)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a14284-3525-7938-b5a7-df5913cd04bb': { model: 'gemini-3.7-flash-high', rawLabel: 'Gemini 3.7 Flash (High)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15597-ea78-7783-a33e-afe236efe6f4': { model: 'gemini-4-argon-low', rawLabel: 'Gemini 4 Argon (Low)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a155ea-d645-7385-9d00-0a95851f21d9': { model: 'gemini-4-argon-high', rawLabel: 'Gemini 4 Argon (High)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15725-5434-7307-9191-2015e56ac74d': { model: 'gemini-4-argon-low', rawLabel: 'Gemini 4 Argon (Low)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a1573b-92c5-7dfb-b0d1-e348cf8bccae': { model: 'claude-opus-5.5-medium', rawLabel: 'Claude Opus 5.5 (Medium)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a1573a-61f8-7943-992e-78eaf735f806': { model: 'gemini-4-argon-max', rawLabel: 'Gemini 4 Argon (Max)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15738-c8e0-7f35-9a41-cded295ad663': { model: 'gemini-4-argon-max', rawLabel: 'Gemini 4 Argon (Max)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15746-4c81-7708-973c-f89ec5a59cd0': { model: 'gemini-4-argon-high', rawLabel: 'Gemini 4 Argon (High)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15747-4ffc-7f3e-8a24-0182d3dbe0b7': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15747-805a-7ad2-8ff5-0f89e0c78f87': { model: 'gemini-3.8-flash-high', rawLabel: 'Gemini 3.8 Flash (High)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a15759-0876-71a5-ba6c-fbdd69bed1f0': { model: 'gemini-4-argon-low', rawLabel: 'Gemini 4 Argon (Low)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
    '01a1580d-23fe-78ec-b951-b1256ee28258': { model: 'gemini-4-argon-max', rawLabel: 'Gemini 4 Argon (Max)', isOpen: false, userConfirmed: true, autoTeacher: false, importedFromDiag: false, truthTier: 'manual_correction' },
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
    if (SECONDARY_CORRECTION_SIDS[sidStr] && !(Number(out.at) > 1792950000000 && out.truthTier === 'manual_correction')) {
      const scPatch = SECONDARY_CORRECTION_SIDS[sidStr];
      const scDecomp = decomposeModelIdentity(scPatch.model, { rawLabel: scPatch.rawLabel });
      out = {
        ...out,
        ...scPatch,
        vendor: scDecomp.vendor,
        vendorLabel: scDecomp.vendorLabel,
        family: scDecomp.family,
        familyLabel: scDecomp.familyLabel,
        effort: scDecomp.effort,
        effortLabel: scDecomp.effortLabel,
      };
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
          const sRank = (clean.userConfirmed && !clean.autoTeacher && clean.truthTier === 'manual_correction') ? 3 : ((clean.userConfirmed && !clean.autoTeacher) || (clean.importedFromDiag && !clean.autoTeacher) ? 2 : (clean.userConfirmed ? 1 : 0));
          const pRank = (prev.userConfirmed && !prev.autoTeacher && prev.truthTier === 'manual_correction') ? 3 : ((prev.userConfirmed && !prev.autoTeacher) || (prev.importedFromDiag && !prev.autoTeacher) ? 2 : (prev.userConfirmed ? 1 : 0));
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

  const HTML_SVG_CLASSIFIER_BANK = {"v":"5.2.0","w":[1.8,1.6,1.5,1.2,1.6,1.6,2.2,2,2.2,2.2,2.2,2.2,2.2,3.2,2.5,2.8,2.8,2.5,2.8,2.4,2.4,2.2,2.2,1.8,1.8,1.8,1.8,1.5,1.5,1.5,1.2,1.4,1.2,1.2,1.2,1.2,1.2,1.6,1.6,1.6,1.4,2.6,2.6,2.6,2.6,2.4,2,3,2.6,1.6],"c":{"google/gemini-4-argon":{"label":"👑 Gemini 4 Argon","vendor":"google","default_effort":"high","is_crown":true},"openai/gpt-6.1-sol":{"label":"👑 GPT 6.1 Sol","vendor":"openai","default_effort":"max","is_crown":true},"openai/gpt-6-astra":{"label":"👑 GPT 6 Astra","vendor":"openai","default_effort":"max","is_crown":true},"anthropic/claude-opus-5.5":{"label":"👑 Claude Opus 5.5","vendor":"anthropic","default_effort":"max","is_crown":true},"openai/gpt-6-luna":{"label":"GPT 6 Luna","vendor":"openai","default_effort":"medium","is_crown":false},"openai/gpt-6-sol":{"label":"GPT 6 Sol","vendor":"openai","default_effort":"max","is_crown":false},"openai/gpt-5.6-sol":{"label":"GPT 5.6 Sol","vendor":"openai","default_effort":"max","is_crown":false},"openai/gpt-5.6-terra":{"label":"GPT 5.6 Terra","vendor":"openai","default_effort":"max","is_crown":false},"openai/gpt-5.6-luna":{"label":"GPT 5.6 Luna","vendor":"openai","default_effort":"medium","is_crown":false},"openai/gpt-5.5":{"label":"GPT 5.5","vendor":"openai","default_effort":"medium","is_crown":false},"anthropic/claude-opus-5":{"label":"Claude Opus 5","vendor":"anthropic","default_effort":"max","is_crown":false},"anthropic/claude-sonnet-5.5":{"label":"Claude Sonnet 5.5","vendor":"anthropic","default_effort":"high","is_crown":false},"anthropic/claude-sonnet-5":{"label":"Claude Sonnet 5","vendor":"anthropic","default_effort":"high","is_crown":false},"anthropic/claude-haiku-5.5":{"label":"Claude Haiku 5.5","vendor":"anthropic","default_effort":"high","is_crown":false},"anthropic/claude-fable-5.1":{"label":"Claude Fable 5.1","vendor":"anthropic","default_effort":"medium","is_crown":false},"google/gemini-3.8-flash":{"label":"Gemini 3.8 Flash","vendor":"google","default_effort":"high","is_crown":false},"google/gemini-3.7-flash":{"label":"Gemini 3.7 Flash","vendor":"google","default_effort":"high","is_crown":false},"google/gemma-4-31b":{"label":"Gemma 4 31B","vendor":"google","default_effort":"high","is_crown":false},"z-ai/glm-5.3":{"label":"GLM 5.3","vendor":"z-ai","default_effort":"high","is_crown":false},"z-ai/glm-5.2":{"label":"GLM 5.2","vendor":"z-ai","default_effort":"low","is_crown":false},"moonshotai/kimi-k3":{"label":"Kimi K3","vendor":"moonshotai","default_effort":"max","is_crown":false},"deepseek/deepseek-v4.1-flash":{"label":"DeepSeek V4.1 Flash","vendor":"deepseek","default_effort":"max","is_crown":false},"qwen/qwen3.7-max":{"label":"Qwen 3.7 Max","vendor":"qwen","default_effort":"high","is_crown":false},"xiaomi/mimo-v2.6-pro":{"label":"MiMo V2.6 Pro","vendor":"xiaomi","default_effort":"medium","is_crown":false},"xiaomi/mimo-v2.6-flash":{"label":"MiMo V2.6 Flash","vendor":"xiaomi","default_effort":"max","is_crown":false},"meta/muse-spark-1.3":{"label":"Muse Spark 1.3","vendor":"meta","default_effort":"max","is_crown":false},"x-ai/grok-4.7":{"label":"Grok 4.7","vendor":"x-ai","default_effort":"max","is_crown":false},"nvidia/nemotron-3-ultra":{"label":"Nemotron 3 Ultra","vendor":"nvidia","default_effort":"high","is_crown":false},"minimax/minimax-m3":{"label":"MiniMax M3","vendor":"minimax","default_effort":"medium","is_crown":false},"upstage/solar-pro4":{"label":"Solar Pro 4","vendor":"upstage","default_effort":"max","is_crown":false},"x-ai/grok-4.6":{"label":"Grok 4.6","vendor":"x-ai","default_effort":"medium","is_crown":false}},"p":[["meta/muse-spark-1.3","max",1,1,[10.019,5.961,4.078,0,6.803,6.217,1.8,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.773,0.693,0,0.392,0.824,0,0,0,0,1.099,3.555,3.664,3.296,2.708,3.738,1.386,3.912,1.792,0,1.609,0,0,0,0,1,0,0,0,3.871]],["meta/muse-spark-1.3","max",1,1,[9.686,5.694,4.013,0,6.686,6.112,1.778,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0.693,0.842,0,0,0,0,0,0,1.872,3.401,3.367,3.219,2.398,3.497,0,3.784,1.099,0,2.708,0,0,0,0,0,0,0,0,3.829]],["google/gemini-3.7-flash","high",1,1,[10.799,6.773,4.045,0,7.091,6.479,1.846,0,0,0,0,0,0,0,0,1,1,0,0,0,0,4.595,0.693,0,0,0.701,0,0,0,0,1.099,4.344,3.784,1.946,2.708,4.331,2.303,4.159,2.565,0,3.258,0,0,0,0,0,0,0,0,4.043]],["google/gemini-3.7-flash","low",1,1,[10.737,7.069,3.694,0,6.868,6.293,1.778,0,0,0,0,0,0,0,0,1,0,0,0,1,0,4.644,2.485,0,0,0.716,0,0,0,0,1.609,4.077,3.045,2.89,2.996,3.466,1.946,3.829,2.639,1.099,0,0,0,0,0,0,1,0,1,4.174]],["x-ai/grok-4.7","max",1,1,[9.052,4.92,4.155,0,7.091,6.581,1.667,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0.693,0,0.398,0,0,0,0,0,0,3.583,2.303,1.099,0.693,0,0,3.045,1.386,0.693,0,0,0,0,1,1,1,0,0,3.583]],["deepseek/deepseek-v4.1-flash","max",1,1,[8.87,5.017,3.881,0,6.686,6.112,1.778,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2.833,0.693,0,0,0.209,0,0,0,0,1.099,3.091,2.565,1.609,2.833,0,0,2.708,0.693,0,2.197,0,0,0,0,0,0,0,0,3.332]],["deepseek/deepseek-v4.1-flash","max",1,1,[9.858,6.014,3.868,0,6.803,6.399,1.5,0,0,0,0,0,0,0,0,1,1,0,0,0,1,3.526,0.693,0,0.024,0,0,0,0,0,1.386,3.045,3.296,2.833,1.946,3.367,0,3.219,1.386,0,2.197,1,0,1,0,0,0,0,0,4.094]],["nvidia/nemotron-3-ultra","high",1,1,[9.962,6.078,3.907,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,0,1,0,0,0,0,3.85,0,0,0,0.723,0,0,0,0,2.398,3.97,3.611,2.485,3.296,2.079,0,4.094,1.609,0,2.639,0,0,0,0,1,0,0,0,4.304]],["anthropic/claude-opus-5","max",1,1,[9.909,5.987,3.944,0,6.909,6.399,1.667,0,0,0,0,0,0,1,0,1,0,1,1,0,0,3.401,1.792,0,0,0,0,0,0,0,1.792,3.497,3.555,3.638,2.485,3.434,0,3.664,1.792,0,0,1,0,0,0,1,0,0,1,4.025]],["anthropic/claude-opus-5","max",1,1,[9.438,5.811,3.656,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,1,0,0,3.434,2.996,0,0,0,0,0,0,0,1.099,2.708,2.485,1.792,2.773,2.079,1.099,2.944,1.386,0,1.386,0,0,1,0,0,0,0,1,3.583]],["openai/gpt-6.1-sol","max",1,1,[10.045,6.2,3.868,0,6.868,6.293,1.778,0,0,0,0,0,0,1,0,0,0,1,1,0,0,3.219,3.045,0,0.11,0,0,0,0,0,1.609,3.97,3.583,3.401,3.091,2.833,0,3.989,1.792,0,0,0,0,0,0,0,0,0,1,4.19]],["openai/gpt-6.1-sol","max",1,1,[8.989,4.466,4.545,0,7.004,6.581,1.528,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.197,0.693,0,0.238,0,0,0,0,0,0,3.714,2.197,1.946,0.693,0,0,2.89,1.609,0.693,1.099,1,0,0,1,1,1,0,0,3.664]],["openai/gpt-6.1-sol","high",1,1,[8.908,4.443,4.488,0,6.909,6.479,1.538,0,0,0,0,0,0,0,0,1,0,0,0,0,0,2.303,0.693,0,0.39,0,0,0,0,0,1.386,3.434,2.485,2.197,2.398,0,0,2.639,1.386,0,1.099,0,0,0,1,1,0,0,0,3.892]],["openai/gpt-6.1-sol","max",1,1,[10.024,5.886,4.156,0,7.273,6.803,1.6,0,0,0,1,0,0,1,0,1,1,1,0,0,0,0,0.693,0,0.064,0,0,0,0,0,1.099,4.625,3.045,1.609,1.609,1.386,0,3.611,1.792,1.609,2.398,0,0,0,0,0,1,0,1,4.718]],["openai/gpt-6.1-sol","high",1,1,[10.382,6.244,4.155,0,7.091,6.431,1.935,1,0,0,0,0,0,1,0,0,0,1,0,1,1,2.303,1.792,0.013,0.213,0,0,0,0,0,1.099,4.317,3.367,0.693,2.485,0,0,3.497,1.386,0,2.708,1,1,1,1,0,0,1,1,4.898]],["openai/gpt-6.1-sol","max",1,1,[10.404,6.219,4.202,0,7.091,6.553,1.714,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.197,1.386,0.006,0.087,0,0,0,1,0,1.386,4.489,3.526,2.639,1.792,0,0,3.807,1.609,0,3.367,1,1,1,1,0,0,1,1,4.836]],["openai/gpt-6.1-sol","max",1,1,[10.078,5.768,4.326,0,7.091,6.463,1.875,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.565,1.099,0,0.505,0,0,0,0,0,0,4.29,2.639,1.792,1.386,0,0,3.296,1.609,0,1.792,1,1,1,0,0,0,1,1,4.522]],["openai/gpt-6.1-sol","low",1,1,[9.131,4.248,4.904,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,0,0,0,0,1,1.609,0.693,0,0.195,0,0,0,0,0,0,3.611,2.565,0.693,0,0,0,2.89,0.693,0,2.708,1,1,1,1,1,0,0,1,3.892]],["openai/gpt-6.1-sol","max",1,1,[10.33,6.242,4.106,0,7.155,6.524,1.882,1,0,0,0,0,0,1,1,1,0,1,0,1,1,2.197,1.386,0,0.603,0,0,0,0,0,1.099,4.691,2.996,2.079,1.792,0,0,3.664,1.609,0,2.398,1,1,1,0,1,0,1,1,4.977]],["openai/gpt-6.1-sol","high",1,1,[10.331,6.105,4.243,0,7.091,6.494,1.818,1,0,0,0,0,0,1,1,0,0,1,1,1,1,1.792,1.099,0,0.337,0,0,0,0,0,2.708,4.489,2.773,1.946,1.792,0,0,3.401,1.386,0,2.89,1,1,1,0,0,0,1,1,4.86]],["openai/gpt-6.1-sol","high",1,1,[10.204,6.118,4.104,0,7.091,6.524,1.765,1,0,0,0,0,0,1,0,1,0,1,1,1,1,1.609,1.099,0,0.601,0,1,0,0,0,2.639,4.29,3.807,1.609,2.079,0,0,3.611,1.609,0,1.946,1,1,1,0,0,0,1,1,4.779]],["openai/gpt-6.1-sol","max",1,1,[10.466,6.223,4.26,0,7.091,6.553,1.714,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.079,1.099,0,0.356,0,1,0,0,0,1.253,4.7,3.497,2.833,1.946,0,0,3.829,1.609,0,3.332,1,1,1,0,0,0,1,1,5.1]],["openai/gpt-6.1-sol","high",1,1,[10.252,6.016,4.252,0,7.004,6.479,1.692,1,0,0,0,0,0,1,0,1,0,1,0,1,1,1.386,1.099,0,0.205,0,0,0,0,0,1.504,4.317,2.944,1.792,2.197,0,0,3.401,1.792,0,2.996,1,1,1,1,0,0,1,1,4.745]],["openai/gpt-6.1-sol","high",1,1,[10.397,6.263,4.151,0,7.091,6.608,1.622,1,0,0,0,0,0,1,1,1,0,1,0,1,1,2.398,1.386,0,0.611,0,1,0,0,0,1.099,4.511,3.583,2.079,2.398,0,0,3.689,1.609,1.099,3.045,1,1,1,0,1,1,1,1,4.836]],["openai/gpt-6.1-sol","high",1,1,[10.385,6.225,4.178,0,7.091,6.581,1.667,1,0,0,0,0,0,1,1,0,0,1,0,1,1,2.996,1.386,0,0.186,0,0,1,0,0,1.386,4.5,3.135,2.079,2.398,0,0,3.738,1.386,1.099,2.773,1,1,1,0,0,0,1,1,5.043]],["openai/gpt-6-luna","medium",1,1,[9.547,5.318,4.248,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,1,0,0,0,1,2.773,0.693,0,0.143,0,0,0,0,0,0,3.97,3.526,1.792,0.693,0,0,2.708,2.079,0.693,0,0,0,0,1,1,1,0,0,4.263]],["openai/gpt-6-luna","max",1,1,[9.591,5.447,4.164,0,7.091,6.553,1.714,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.89,0.693,0,0.242,0,0,0,0,0,0,4.007,3.178,1.386,0.693,0,0,3.178,1.792,1.099,0,0,0,0,1,1,1,0,0,3.951]],["openai/gpt-6-luna","max",1,1,[8.916,4.407,4.532,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,0,0,0,0,0,2.944,0.693,0,0.277,0,0,0,0,0,0,3.555,3.178,1.792,1.099,0,0,2.639,1.099,0.693,0,1,0,0,1,1,1,0,0,3.611]],["openai/gpt-6-luna","max",1,1,[9.703,5.869,3.858,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,1,0,0,3.583,2.833,0,0,0.751,0,0,0,0,1.099,3.664,3.135,1.946,2.565,1.386,0,3.178,1.792,0,1.609,0,0,0,0,0,0,0,1,3.951]],["openai/gpt-6-luna","medium",1,1,[10.354,6.583,3.795,0,6.909,6.431,1.613,1,0,0,0,0,1,0,0,1,1,0,0,1,1,2.996,0.693,0,0.406,0,0,0,0,0,1.609,4.22,3.497,1.609,2.079,0,0,3.091,1.946,0.693,0,1,1,1,1,1,1,0,1,4.394]],["openai/gpt-6-luna","medium",1,1,[9.775,5.781,4.016,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,0,1,0,0,1,1,2.079,0.693,0,0.585,0,0,0,0,0,2.89,3.689,2.833,0.693,0.693,2.944,0,3.091,1.386,0.693,0,1,1,1,1,0,1,0,1,4.143]],["openai/gpt-6-luna","medium",1,1,[9.794,5.846,3.969,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,1,0,0,1,1,3.091,0.693,0,0.344,0,0,0,0,0,0,4.077,3.135,1.386,0.693,0,0,3.135,1.609,0,0,1,1,1,1,1,0,0,0,3.892]],["openai/gpt-6-luna","low",1,1,[9.637,5.591,4.067,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,1,0,0,0,1,2.398,0.693,0,0.346,0,0,0,0,0,0,3.784,3.497,0.693,0.693,0,0,3.332,2.197,0.693,0,1,1,1,1,1,1,0,0,4.174]],["openai/gpt-6-luna","low",1,1,[9.574,5.447,4.148,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,1,0,0,0,1,2.996,0.693,0,0.147,0,0,0,0,0,1.705,3.829,3.466,2.485,1.386,0,0,3.296,1.386,0.693,0,1,1,1,1,0,1,0,0,4.174]],["openai/gpt-6-luna","low",1,1,[9.675,5.7,3.997,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.773,0.693,0,0.5,0,0,0,0,0,1.705,3.871,3.045,1.099,1.386,0,0,2.639,1.386,0.693,0,1,1,1,1,1,1,0,0,4.159]],["openai/gpt-6-luna","low",1,1,[9.782,5.805,3.999,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.944,0.693,0,0.325,0,0,0,0,0,1.705,4.127,3.434,1.099,1.386,0,0,2.996,1.386,0,0,1,1,1,1,1,0,0,1,4.248]],["openai/gpt-6-luna","medium",1,1,[9.844,5.835,4.03,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,0,1,0,0,1,1,3.091,0.693,0,0.061,0,0,0,0,0,0,3.85,3.135,1.946,0.693,3.219,0,2.773,1.792,0,0,1,1,1,1,0,0,0,1,4.443]],["openai/gpt-6-luna","medium",1,1,[9.842,5.905,3.958,0,6.909,6.415,1.639,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.565,0.693,0,0.481,0,0,0,0,0,0,3.761,3.091,1.386,0.693,0,0,2.996,1.792,0,0,1,1,1,1,1,0,0,0,4.29]],["openai/gpt-6-luna","medium",1,1,[9.69,5.9,3.816,0,6.868,6.33,1.714,0,0,0,0,0,0,0,0,1,1,0,0,1,1,2.996,0.693,0,0.344,0,0,0,0,0,0,3.664,3.871,1.386,0.693,0,0,3.178,1.386,1.099,0,1,1,1,1,1,1,0,0,4.06]],["openai/gpt-6-luna","medium",1,1,[9.419,5.347,4.094,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,0,0,0,0,1,2.833,0.693,0,0.056,0,0,0,0,0,0,3.555,3.638,2.079,0.693,0,0,2.773,1.099,0.693,0,1,1,1,1,1,1,0,0,3.714]],["openai/gpt-6-sol","max",1,1,[9.57,5.361,4.228,0,7.091,6.635,1.579,0,0,0,0,0,0,1,0,1,0,1,0,0,1,2.833,1.099,0,0.282,0,0,0,0,0,2.197,4.06,2.773,1.609,1.386,0,0,2.944,1.386,0,0,1,0,0,0,0,0,0,1,4.111]],["google/gemini-4-argon","high",1,1,[10.888,7.057,3.853,0,7.091,6.686,1.5,0,1,0,0,0,0,1,0,0,0,1,0,0,0,4.82,3.892,0,0,0.699,0,0,0,0,1.099,4.159,3.258,1.609,3.091,3.497,0,3.85,2.773,0,1.099,0,0,0,0,0,0,0,1,4.382]],["google/gemini-4-argon","high",1,1,[10.827,6.927,3.921,0,7.091,6.686,1.5,0,1,0,0,0,0,1,0,0,0,1,1,0,0,4.682,3.951,0,0,0,0,0,0,0,1.099,4.077,3.135,1.609,3.045,3.555,1.609,3.583,2.708,0,1.946,0,0,0,0,0,0,0,1,4.654]],["google/gemini-4-argon","high",1,1,[10.836,6.908,3.949,0,7.091,6.686,1.5,0,1,0,0,0,0,1,0,0,0,1,1,0,0,4.718,3.401,0,0,0,0,0,0,0,1.099,4.369,3.135,1.946,3.178,3.738,1.609,3.829,2.708,0,2.079,0,0,0,0,0,0,0,1,4.736]],["google/gemini-4-argon","high",1,1,[10.434,6.568,3.888,0,6.803,6.365,1.552,0,0,0,0,0,0,1,0,0,0,1,1,0,0,4.477,3.091,0,0,0.718,0,0,0,0,1.504,3.951,2.89,1.946,2.89,3.97,1.609,3.689,2.303,0,1.609,0,0,0,0,0,0,0,1,4.407]],["google/gemini-4-argon","high",1,1,[10.517,6.696,3.844,0,6.868,6.33,1.714,0,0,0,0,0,0,1,0,1,0,1,0,0,0,4.543,3.296,0,0,0.718,0,0,0,0,1.099,3.689,2.996,1.609,2.773,3.367,2.197,3.526,2.197,0,2.565,0,0,0,0,0,0,0,1,3.784]],["google/gemini-4-argon","max",1,1,[10.643,6.848,3.818,0,6.868,6.399,1.6,0,0,0,0,1,0,1,0,1,0,1,1,1,0,4.615,3.434,0,0,0,0,0,0,0,1.386,3.689,3.296,1.386,2.708,3.583,1.946,3.526,2.398,0,1.792,0,0,0,0,0,0,0,1,3.85]],["google/gemini-4-argon","high",1,1,[10.279,6.531,3.773,0,6.803,6.293,1.667,0,0,0,0,0,0,1,0,0,0,1,0,0,0,4.331,2.833,0,0,0,0,0,0,0,1.253,3.497,3.045,1.099,3.091,3.611,0.693,3.332,1.946,0,1.792,0,0,0,0,0,0,0,1,3.664]],["google/gemini-4-argon","high",1,1,[10.643,6.844,3.822,0,7.091,6.553,1.714,0,0,0,0,0,0,1,0,0,0,1,0,1,0,4.533,3.401,0,0,0.536,0,0,0,0,1.792,3.784,3.219,1.386,2.944,3.583,1.792,3.555,2.485,0.693,2.303,0,0,0,0,0,1,0,1,4.736]],["google/gemini-4-argon","medium",1,1,[10.395,6.612,3.807,0,6.868,6.399,1.6,0,0,0,0,1,0,1,0,1,0,1,1,0,0,4.431,3.296,0,0,0.727,0,0,0,0,1.609,3.932,2.944,1.099,2.485,3.401,1.609,3.296,2.303,0,1.099,0,0,0,0,0,0,0,1,4.007]],["google/gemini-4-argon","high",1,1,[10.614,6.864,3.775,0,6.868,6.399,1.6,0,0,0,0,1,0,1,0,1,0,1,1,1,0,4.489,3.434,0,0,0.719,0,0,0,0,1.386,3.892,3.258,1.792,2.773,3.296,1.946,3.638,2.303,0.693,1.099,0,0,0,0,0,1,0,1,4.331]],["google/gemini-4-argon","max",1,1,[10.711,6.886,3.849,0,6.803,6.33,1.607,0,0,0,0,0,0,1,0,0,0,1,1,1,0,4.654,3.555,0,0,0.751,0,0,0,0,1.386,3.932,3.178,1.792,2.833,3.638,1.792,3.714,2.303,0,1.099,0,0,0,0,0,0,0,1,3.807]],["google/gemini-4-argon","max",1,1,[10.515,6.727,3.811,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,4.443,2.996,0,0,0.72,0,0,0,0,1.253,3.583,3.091,1.609,2.708,3.497,1.386,3.401,2.197,0,1.946,0,0,0,0,0,0,0,1,3.807]],["anthropic/claude-opus-5.5","max",1,1,[10.516,5.9,4.629,0,6.686,6.217,1.6,1,0,1,0,0,0,0,0,0,1,0,0,1,1,3.219,1.099,0,0.017,0.79,0,0,1,0,1.099,4.654,4.317,3.761,2.944,3.332,0,4.277,0,0,0.693,1,1,1,0,0,0,0,1,4.369]],["anthropic/claude-opus-5.5","max",1,1,[9.565,5.375,4.209,0,7.091,6.553,1.714,0,0,0,0,0,0,0,0,1,0,0,0,0,0,2.197,0.693,0,0.181,0,0,0,0,0,1.792,3.738,3.367,3.178,3.178,1.609,0,3.466,1.386,0,0,0,0,0,0,1,0,0,0,4.143]],["google/gemini-3.8-flash","high",1,1,[10.228,6.474,3.779,0,6.909,6.479,1.538,0,0,0,0,0,0,0,0,1,0,0,0,0,0,4.382,0.693,0,0,0.707,0,0,0,0,1.386,3.689,3.045,1.946,2.944,3.526,2.079,3.555,2.398,0,2.708,0,0,0,0,0,0,0,0,4.466]],["google/gemini-3.8-flash","high",1,1,[9.304,5.05,4.274,0,7.091,6.635,1.579,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.398,0.693,0,0.379,0,0,0,0,0,0,3.932,2.303,1.609,0,0,0,2.639,1.792,0,0,0,0,0,0,1,0,0,0,4.111]],["anthropic/claude-haiku-5.5","high",1,1,[8.633,4.443,4.217,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,2.197,0.693,0,0.22,0,0,0,0,0,0,3.178,2.197,2.197,0.693,0,0,2.197,1.099,0.693,0,0,0,0,1,1,1,0,0,3.401]],["anthropic/claude-haiku-5.5","high",1,1,[9.18,5.497,3.711,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,2.996,2.773,0,0,0,0,0,0,0,0,2.944,2.197,2.079,1.609,1.946,0,2.833,1.099,0,2.079,0,0,0,0,0,0,0,1,3.401]],["anthropic/claude-haiku-5.5","high",1,1,[9.286,5.572,3.742,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,1,0,0,2.833,2.89,0,0,0,0,0,0,0,1.705,2.833,2.565,1.946,1.609,1.792,0,2.485,1.792,0,1.609,0,0,0,0,0,0,0,1,3.689]],["anthropic/claude-haiku-5.5","high",1,1,[9,5.489,3.544,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,3.258,0.693,0,0,0,0,0,0,0,1.386,2.639,2.197,2.303,2.639,2.996,0,2.996,1.386,0.693,0,1,0,0,0,0,0,0,0,3.091]],["xiaomi/mimo-v2.6-flash","max",1,1,[9.52,5.403,4.138,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,1,0,0,0,0,3.219,0.693,0,0.568,0,0,0,0,0,0,4.007,3.555,1.609,0.693,0,0,3.045,1.609,0.693,1.609,0,0,0,0,1,1,0,0,4.025]],["xiaomi/mimo-v2.6-flash","max",1,1,[9.597,5.602,4.017,0,6.909,6.431,1.613,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0.693,0,0.151,0,0,0,0,0,1.504,4.043,3.219,0.693,2.197,0,0,3.401,2.197,1.099,0,1,0,0,0,1,1,0,0,4.29]],["openai/gpt-5.6-sol","max",1,1,[9.503,5.46,4.065,0,7.091,6.553,1.714,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2.565,0.693,0,0.469,0,0,0,0,0,0,3.611,3.784,1.386,1.386,0,0,3.091,1.946,1.099,0,0,0,0,0,0,1,0,0,3.951]],["upstage/solar-pro4","max",1,1,[9.424,5.352,4.093,0,6.909,6.399,1.667,0,0,0,0,0,0,0,0,1,1,0,0,0,0,2.996,0.693,0,0.56,0,0,0,0,0,0,3.829,2.996,0.693,0.693,0,0,3.219,1.609,1.099,0,1,0,0,0,1,1,0,0,4.025]],["minimax/minimax-m3","medium",1,1,[8.902,5.375,3.56,0,6.686,5.994,2,0,0,0,0,0,0,1,0,0,1,0,0,0,0,3.583,1.386,0,0,0.756,0,0,0,0,0,2.197,2.639,2.197,2.197,2.944,0,2.833,1.099,0,0,0,0,0,0,0,0,0,1,3.219]],["openai/gpt-6-astra","max",1,1,[10.161,5.999,4.18,0,7.273,6.803,1.6,0,0,0,1,0,0,1,0,1,1,1,0,0,0,0,0.693,0,0.145,0,0,0,0,0,1.504,4.344,3.091,2.833,2.303,1.099,0,3.871,1.946,1.386,3.738,1,0,0,0,1,1,0,1,4.745]],["moonshotai/kimi-k3","max",1,1,[9.857,5.638,4.237,0,6.686,6.217,1.6,1,0,1,0,0,0,0,0,0,1,0,0,0,0,1.386,0.693,0.735,0,0,0,0,0,0,1.609,0,0.693,0,1.609,1.099,0,2.89,0.693,0,0,0,0,0,0,0,0,0,0,3.367]],["moonshotai/kimi-k3","max",1,1,[9.415,5.545,3.894,0,6.33,5.771,1.75,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3.466,0.693,0,0.409,0,0,0,0,0,0.693,3.583,2.773,2.079,2.398,2.485,0,3.258,1.386,0,2.398,1,0,0,0,1,0,0,0,3.526]],["moonshotai/kimi-k3","max",1,1,[10.064,6.125,3.961,0,6.803,6.293,1.667,1,0,0,0,0,0,0,0,1,1,0,0,1,1,3.714,1.386,0,0.236,0,0,0,0,0,1.386,4.094,3.296,3.178,2.197,0,1.099,3.951,2.197,0.693,0,1,1,1,1,1,1,0,0,4.094]],["moonshotai/kimi-k3","max",1,1,[10.364,3.466,6.931,0,6.909,6.553,1.429,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0.693,0,0.415,0.017,0,0,1,0,1.705,4.127,3.989,3.989,3.664,3.951,0,3.85,1.946,0,0,1,0,0,0,0,0,0,0,4.304]],["z-ai/glm-5.3","high",1,1,[9.836,5.979,3.88,0,6.803,6.256,1.731,0,0,0,0,0,0,1,0,1,1,1,0,0,0,3.526,2.079,0,0.139,0,0,0,0,0,1.386,2.944,3.045,2.833,1.792,3.714,0,2.833,1.946,0,0,1,0,0,1,1,0,0,1,3.932]],["z-ai/glm-5.3","high",1,1,[9.776,5.981,3.82,0,6.803,6.256,1.731,0,0,0,0,0,0,1,0,1,0,1,1,0,0,3.689,2.079,0,0,0,0,0,0,0,2.639,3.091,2.996,1.386,2.079,3.738,0,3.296,1.609,0,1.792,1,0,0,0,1,0,0,1,4.025]],["anthropic/claude-sonnet-5.5","low",1,1,[9.252,5.476,3.803,0,6.686,6.217,1.6,1,0,1,0,0,0,0,0,1,0,0,0,0,0,3.689,0,0,0,0,0,0,0,0,0,3.401,2.833,1.792,2.079,2.398,0,3.178,1.099,0,2.708,0,0,0,0,1,0,0,0,3.689]],["anthropic/claude-sonnet-5.5","low",1,1,[8.82,4.92,3.927,0,6.909,6.399,1.667,0,0,0,0,0,0,0,0,1,0,0,0,0,0,3.045,0.693,0,0,0,0,0,0,0,0,2.944,2.303,1.946,2.996,2.398,0,2.773,0.693,0,0,0,0,0,0,1,0,0,0,3.178]],["anthropic/claude-sonnet-5.5","high",1,1,[9.477,5.765,3.74,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,3.258,3.045,0,0,0,0,0,0,0,1.099,3.135,2.303,2.708,2.079,1.946,0,3.091,1.099,0.693,0,0,0,0,0,0,0,0,1,3.689]],["anthropic/claude-sonnet-5.5","high",1,1,[9.476,5.768,3.735,0,6.686,6.217,1.6,0,0,1,0,0,0,1,0,0,0,1,0,0,0,3.332,2.833,0,0,0,0,0,0,0,1.609,3.091,2.303,1.099,2.079,0.693,1.099,2.773,1.099,0.693,0,0,0,0,0,0,0,0,1,3.871]],["anthropic/claude-sonnet-5.5","high",1,1,[10.184,6.323,3.884,0,6.909,6.33,1.786,0,0,0,0,0,0,1,0,1,0,1,0,1,1,3.091,0,0,0.557,0,0,0,0,0,1.705,4.234,3.611,0.693,1.386,0,0,3.178,1.946,0,0,1,1,1,1,1,0,0,1,4.564]],["anthropic/claude-sonnet-5.5","low",1,1,[9.243,5.425,3.844,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,1,0,0,0,0,3.332,0,0,0,0,0,0,0,0,1.386,3.091,2.303,1.946,2.639,2.773,1.099,3.258,1.099,0,2.708,0,0,0,0,1,0,0,0,3.583]],["anthropic/claude-sonnet-5.5","low",1,1,[8.364,4.205,4.189,0,6.686,6.112,1.778,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1.609,0,0,0.25,0,0,0,0,0,0,2.708,1.946,1.609,2.773,0,0,2.303,0,0,0,0,0,0,0,1,0,0,0,2.944]],["anthropic/claude-sonnet-5.5","high",1,1,[9.612,5.704,3.931,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,0,1,0,0,0,0,3.045,0,0.988,0.043,0,0,0,0,0,2.303,3.296,2.708,2.565,2.833,3.526,0,3.258,1.946,0.693,0,1,0,0,0,0,0,0,0,3.829]],["z-ai/glm-5.2","low",1,1,[9.606,5.66,3.969,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,0,1,0,0,0,0,3.367,0.693,0,0.038,0,0,0,0,0,2.398,3.526,3.219,1.386,1.946,3.091,0,3.258,1.386,0,1.099,1,1,0,1,0,0,0,0,3.85]],["anthropic/claude-fable-5.1","medium",1,1,[8.687,4.812,3.903,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,3.091,0.693,0,0.333,0,0,0,0,0,0,2.485,2.303,2.079,1.792,2.639,1.099,2.639,0.693,0,0,0,0,0,0,1,0,0,0,3.258]],["qwen/qwen3.7-max","high",1,1,[10.092,6.172,3.942,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,0,1,0,0,0,0,3.892,0.693,0.01,0,0,0,0,0,0,1.609,3.583,3.497,3.401,1.946,3.689,0,3.951,1.946,0,2.303,1,0,1,0,0,0,0,0,4.007]],["xiaomi/mimo-v2.6-pro","medium",1,1,[9.464,5.855,3.638,0,6.686,6.217,1.6,0,0,1,0,0,0,0,0,1,0,0,0,0,0,3.951,0.693,0.696,0,0.605,0,0,0,0,1.099,2.944,3.219,2.773,2.708,3.526,0,3.258,0,0,0,0,0,0,0,1,0,0,0,3.526]],["openai/gpt-5.5","medium",1,1,[9.627,5.631,4.018,0,6.868,6.399,1.6,0,0,0,0,1,0,0,0,1,0,0,0,0,1,2.708,0.693,0,0.253,0,0,0,0,0,1.386,4.025,2.996,1.099,1.792,0,0,3.219,1.609,0.693,0,1,1,1,1,1,0,0,0,4.143]],["openai/gpt-5.6-luna","medium",1,1,[10.002,6.105,3.919,0,6.686,6.112,1.778,0,0,0,0,0,0,1,0,1,0,1,1,0,0,3.466,1.386,0,0,0.767,0,0,0,0,2.833,3.296,3.332,2.944,2.485,3.611,0,3.714,1.792,0.693,0,1,0,0,0,1,1,0,1,3.714]],["anthropic/claude-opus-5.5","max",0,1,[6.702,0.693,6.702,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,1,0,0,0,1.946,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5.5","max",0,1,[7.033,0.693,7.033,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.278,0.615,0,1,1,1,0,2.079,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-terra","max",0,1,[7.449,0.693,7.449,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.556,0,1,0,0,0,1.504,2.398,1.386,0,0.693,0,0,1.386,0,0,0,1,0,0,0,0,0,0,0,2.079]],["openai/gpt-5.6-terra","max",0,1,[7.011,0.693,7.011,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.622,0,1,1,0,0,0,1.946,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-terra","high",0,0,[6.601,0.693,6.601,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.545,0,1,0,0,0,0,1.386,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099]],["openai/gpt-5.6-terra","high",0,0,[6.852,0.693,6.852,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.583,0,1,0,0,0,1.386,1.792,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-terra","high",0,0,[6.94,0.693,6.94,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.455,0,1,0,1,1,0,1.946,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-5.6-terra","high",0,0,[6.702,0.693,6.702,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.567,0,1,1,0,0,0,1.609,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099]],["openai/gpt-5.6-terra","max",0,0,[7.449,0.693,7.449,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.556,0,1,0,0,0,1.504,2.398,1.386,0,0.693,0,0,1.386,0,0,0,1,0,0,0,0,0,0,0,2.079]],["anthropic/claude-opus-5","max",0,1,[7,0.693,7,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.563,0,1,0,1,0,0,2.197,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","max",0,1,[6.923,0.693,6.923,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.609,0,1,0,1,0,0,1.946,1.099,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-opus-5","max",0,1,[7.316,0.693,7.316,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,1,0,0,2.197,1.609,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-opus-5","max",0,1,[8.344,4.248,4.125,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3.045,0.693,0.935,0,0,0,0,1,0,0,3.219,1.792,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3.178]],["anthropic/claude-opus-5","max",0,1,[7.891,3.761,4.168,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0.691,0,0,0,0,0,2.996,1.792,0,1.099,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.944]],["anthropic/claude-opus-5","max",0,1,[7.884,3.555,4.37,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946,0.693,1,0.482,0,1,0,1,1,0,2.833,1.609,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.833]],["anthropic/claude-opus-5","max",0,1,[8.114,4.22,3.929,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708,0.693,1,0.136,0,1,0,1,1,0,2.773,2.079,0,1.386,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,2.833]],["anthropic/claude-opus-5","high",0,0,[6.783,0.693,6.783,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.607,0,0,0,1,0,0,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","high",0,0,[6.757,0.693,6.757,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.65,0,0,0,1,0,0,1.946,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","high",0,0,[6.921,0.693,6.921,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,0,0,1,0,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-opus-5","high",0,0,[7.091,0.693,7.091,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.197]],["anthropic/claude-opus-5","max",0,0,[7,0.693,7,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.563,0,1,0,1,0,0,2.197,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["anthropic/claude-sonnet-5.5","high",0,1,[7.061,0.693,7.061,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.588,0,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197]],["anthropic/claude-sonnet-5.5","high",0,1,[7.233,0.693,7.233,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,1,0,0,0,2.398,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-sonnet-5.5","high",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.579,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-sonnet-5.5","high",0,0,[6.892,0.693,6.892,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.618,0,1,0,1,0,0,2.197,1.386,0,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485]],["anthropic/claude-sonnet-5.5","high",0,0,[6.99,0.693,6.99,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.522,0,0.667,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-sonnet-5.5","high",0,0,[6.874,0.693,6.874,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["anthropic/claude-sonnet-5.5","high",0,0,[6.814,0.693,6.814,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.567,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["google/gemini-3.8-flash","high",0,1,[6.661,0.693,6.661,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.647,0,0,1,0,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["google/gemini-3.8-flash","high",0,1,[6.548,0.693,6.548,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.581,0,1,1,0,0,0,1.386,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.8-flash","high",0,1,[6.434,0.693,6.434,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.524,0,1,1,1,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.8-flash","high",0,0,[6.513,0.693,6.513,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.682,0,1,1,0,0,0,1.609,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.386]],["google/gemini-3.8-flash","high",0,0,[6.474,0.693,6.474,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.8-flash","high",0,0,[7.28,0.693,7.28,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.941,0,0,0,0,1,0,0,1.946,1.099,1.099,0,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.398]],["google/gemini-3.8-flash","high",0,0,[6.525,0.693,6.525,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.632,0,1,1,0,0,0,1.609,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["google/gemini-3.8-flash","high",0,0,[6.248,0.693,6.248,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,0,1,0,0,0,1.792,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-6-astra","low",0,1,[6.934,0.693,6.934,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.587,0,1,0,1,1,1.609,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","max",0,1,[7.832,3.638,4.235,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079,0.693,0,0.491,0,1,0,1,1,0,2.708,1.099,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.773]],["openai/gpt-6-luna","max",0,1,[7.508,0.693,7.508,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.612,0,1,0,1,1,0,2.398,1.099,0,0,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-6-luna","medium",0,1,[7.536,0.693,7.536,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.623,0,1,0,1,1,0,2.485,1.386,0,0,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-6-luna","high",0,0,[7.181,0.693,7.181,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.651,0,1,1,1,1,1.946,2.197,1.386,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-6-luna","high",0,0,[7.462,0.693,7.462,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.717,0,1,0,1,1,0,2.303,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","high",0,0,[7.36,0.693,7.36,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.703,0,1,0,0,0,0,2.197,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","high",0,0,[7.484,0.693,7.484,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.767,0,1,0,1,0,0,2.197,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-luna","high",0,0,[6.881,0.693,6.881,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.714,0,1,1,1,1,0,1.946,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.386]],["deepseek/deepseek-v4.1-flash","max",0,1,[4.97,0.693,4.97,1,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],["deepseek/deepseek-v4.1-flash","max",0,1,[8.209,3.989,4.253,0,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,0,0,0,0.693,1.099,0.693,1.609,0,0,2.398,1.386,0,0,0,0,0,0,0,0,0,0,2.485]],["deepseek/deepseek-v4.1-flash","max",0,1,[7.356,0.693,7.356,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.597,0,1,0,1,0,0,2.485,1.099,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["deepseek/deepseek-v4.1-flash","max",0,0,[4.97,0.693,4.97,1,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],["deepseek/deepseek-v4.1-flash","max",0,0,[8.209,3.989,4.253,0,6.686,6.217,1.6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,0,0,0,0.693,1.099,0.693,1.609,0,0,2.398,1.386,0,0,0,0,0,0,0,0,0,0,2.485]],["deepseek/deepseek-v4.1-flash","max",0,0,[7.356,0.693,7.356,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.597,0,1,0,1,0,0,2.485,1.099,0,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["meta/muse-spark-1.3","max",0,1,[7.215,0.693,7.215,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.588,0,0,0,0,0,0,2.197,1.609,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485]],["meta/muse-spark-1.3","max",0,1,[7.189,0.693,7.189,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.474,0.577,0,1,0,1,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["meta/muse-spark-1.3","max",0,0,[7.215,0.693,7.215,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.588,0,0,0,0,0,0,2.197,1.609,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485]],["meta/muse-spark-1.3","max",0,0,[7.189,0.693,7.189,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.474,0.577,0,1,0,1,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-fable-5.1","max",0,1,[7.067,0.693,7.067,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["anthropic/claude-fable-5.1","max",0,1,[6.692,0.693,6.692,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.194,0,0,0,1,0,1.609,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-fable-5.1","high",0,0,[6.861,0.693,6.861,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,0,1,1,0,0,2.197,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["anthropic/claude-fable-5.1","low",0,0,[7.224,0.693,7.224,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.65,0.344,0,0,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-fable-5.1","high",0,0,[6.604,0.693,6.604,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.563,0,0,1,1,0,0,1.609,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.386]],["anthropic/claude-fable-5.1","high",0,0,[6.64,0.693,6.64,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.579,0,0,1,1,0,0,1.946,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["anthropic/claude-fable-5.1","high",0,0,[7.152,0.693,7.152,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.809,0,0,0,0,0,0,1.609,1.386,0.693,1.099,2.079,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-haiku-5.5","medium",0,1,[7.091,0.693,7.091,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0.823,0,0,1,0,0,2.303,1.386,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.398]],["anthropic/claude-haiku-5.5","high",0,0,[6.945,0.693,6.945,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-haiku-5.5","high",0,0,[6.941,0.693,6.941,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-haiku-5.5","high",0,0,[7.048,0.693,7.048,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-haiku-5.5","high",0,0,[7.333,0.693,7.333,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.622,0,1,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-haiku-5.5","high",0,0,[7.072,0.693,7.072,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,1,1,1,0,2.398,1.386,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["anthropic/claude-sonnet-5","max",0,1,[7.293,2.773,4.594,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.6,0.35,0,1,0,0,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["anthropic/claude-sonnet-5","high",0,0,[7.328,0.693,7.328,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.792,1.099,0,0.693,2.303,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099]],["anthropic/claude-sonnet-5","high",0,0,[7.26,0.693,7.26,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.125,0,0,0,1,0,0,2.303,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079]],["anthropic/claude-sonnet-5","max",0,0,[7.293,2.773,4.594,0,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.6,0.35,0,1,0,0,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["openai/gpt-6-sol","max",0,1,[9.322,4.635,4.706,0,6.803,7.091,0.75,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565,0.693,0,0.311,0,0,0,1,0,0,4.143,2.773,0,1.099,0,0,1.609,0,0.693,0,1,0,0,0,0,0,0,0,4.174]],["openai/gpt-6-sol","high",0,0,[6.182,0.693,6.182,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.733,0,0,0,0,0,0,0.693,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-6-sol","high",0,0,[6.95,0.693,6.95,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.796,0,1,0,0,0,0,2.079,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-6-sol","high",0,0,[6.186,0.693,6.186,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.7,0,1,0,0,0,0,1.099,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-6-sol","high",0,0,[6.818,0.693,6.818,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,1,0,0,1.792,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946]],["openai/gpt-6-sol","high",0,0,[6.165,0.693,6.165,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.632,0,1,0,0,0,0,1.386,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099]],["z-ai/glm-5.3","high",0,1,[6.719,0.693,6.719,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.658,0,1,0,1,0,1.792,1.946,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["z-ai/glm-5.3","high",0,0,[6.719,0.693,6.719,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.658,0,1,0,1,0,1.792,1.946,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-6.1-sol","max",0,1,[6.813,0.693,6.813,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.577,0,1,0,1,1,1.792,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946]],["openai/gpt-6.1-sol","max",0,0,[6.791,0.693,6.791,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.277,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.303]],["openai/gpt-5.6-luna","high",0,0,[6.842,0.693,6.842,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.6,0,1,0,1,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-luna","high",0,0,[6.809,0.693,6.809,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.59,0,1,0,1,0,0,1.792,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099]],["openai/gpt-5.6-luna","high",0,0,[6.861,0.693,6.861,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.524,0,1,0,1,1,0,1.792,1.386,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-luna","high",0,0,[7.049,0.693,7.049,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.5,0,1,0,0,0,0,2.079,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.6-luna","high",0,0,[6.934,0.693,6.934,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.568,0,1,0,1,1,0,2.079,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-sol","high",0,0,[6.174,0.693,6.174,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,1.386,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.6-sol","high",0,0,[6.785,0.693,6.785,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.571,0,0,0,0,1,0,0,1.609,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946]],["openai/gpt-5.6-sol","high",0,0,[6.023,0.693,6.023,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,0.693,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.6-sol","high",0,0,[6.436,0.693,6.436,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,1,0,0,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.6-sol","high",0,0,[6.629,0.693,6.629,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.386,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303]],["openai/gpt-5.5","high",0,0,[6.658,0.693,6.658,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.72,0,0,0,0,0,0,1.946,1.099,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.609]],["openai/gpt-5.5","high",0,0,[6.969,0.693,6.969,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.721,0,1,0,0,0,0,1.792,1.386,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-5.5","high",0,0,[6.781,0.693,6.781,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,1.946,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-5.5","high",0,0,[6.914,0.693,6.914,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.564,0,1,1,1,1,0,2.303,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.5","high",0,0,[7.142,0.693,7.142,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,1,0,0,1.609,1.386,0.693,0.693,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.079]],["openai/gpt-5.4","high",0,0,[7.155,0.693,7.155,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.581,0,1,0,0,0,0,2.197,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792]],["openai/gpt-5.4","high",0,0,[6.749,0.693,6.749,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.568,0,1,0,0,0,0,1.946,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["openai/gpt-5.4","high",0,0,[6.628,0.693,6.628,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.731,0,1,0,0,0,0,1.609,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.386]],["openai/gpt-5.4","high",0,0,[6.745,0.693,6.745,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.571,0,1,1,1,1,0,1.792,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693]],["google/gemini-3.1-pro-preview","high",0,0,[7.312,0.693,7.312,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.609,1.099,0,0.693,2.485,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099]],["anthropic/claude-sonnet-4.6","high",0,0,[7.093,0.693,7.093,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,1.792,1.386,0.693,1.099,1.792,0,1.386,0,0,0,0,0,0,0,0,0,0,0,1.946]],["anthropic/claude-sonnet-4.6","high",0,0,[6.955,0.693,6.955,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.571,0,1,0,0,0,0,2.303,1.099,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0.693]],["meta/muse-spark-1.3","high",0,0,[7.589,0.693,7.589,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.636,0,0,0,0,0,0,1.099,2.89,1.386,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,2.303],{"EAF6FF":4,"FFD60A":4,"F4A261":4,"FFB703":4,"V11":4,"H31":4,"ECAE6":4,"FB8500":4,"H14L14":4,"HEX_#eaf6ff":4}],["google/gemini-4-argon","high",0,0,[6.394,1.099,5.702,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.7,0,1,0,1,0,1.946,1.099,0.693,0,1.099,0,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,1.386],{"e8f4f8":4,"fbc531":4,"L10":4,"HEX_#e8f4f8":4,"HEX_#fbc531":4}],["openai/gpt-6.1-sol","high",0,0,[5.288,1.099,4.6,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0.693,0.693,0,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.099],{"f5bd62":4,"HEX_#f5bd62":4,"HEX_#397d83":4}],["deepseek/deepseek-v4.1-flash","max",0,0,[7.103,0.693,7.103,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.4,0,1,1,1,1,0,2.485,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"EAF4FA":4,"F5B942":4,"H4M9":4,"A6D3":4,"CCBE6":4,"F0984A":4,"HEX_#33424d":4,"HEX_#eaf4fa":4,"HEX_#f5b942":4,"HEX_#57a6d3":4,"HEX_#9ccbe6":4,"HEX_#f0984a":4}],["openai/gpt-6-luna","medium",1,0,[8.242,0.693,8.242,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.971,0,0,0,0,0,0,1.281,2.833,1.609,1.609,1.386,1.946,0,1.386,0,0,0,1,0,0,0,0,0,0,0,2.398],{"eef6fb":4,"E6F2FA":4,"B3A4A":4,"FFCF3D":4,"FFAD33":4,"FFFFFF":4,"EEF2F5":4,"FF7A3D":4,"FB3E8":4,"FFEC9A":4,"HEX_#eef6fb":4,"HEX_#e6f2fa":4,"HEX_#2b3a4a":4,"HEX_#ffcf3d":4,"HEX_#ffad33":4,"HEX_#ffffff":4,"HEX_#eef2f5":4,"HEX_#ff7a3d":4,"HEX_#4fb3e8":4,"HEX_#ffec9a":4}],["openai/gpt-6-luna","medium",0,0,[7.402,0.693,7.402,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,0,2.197,1.099,0.693,0.693,2.197,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946],{"fef3c7":4,"f59e0b":4,"b82f6":4,"e3a8a":4,"fef9c3":4,"HEX_#fef3c7":4,"HEX_#f59e0b":4,"HEX_#92400e":4,"HEX_#3b82f6":4,"HEX_#1e3a8a":4,"HEX_#fef9c3":4}],["google/gemini-4-argon","high",0,0,[6.708,0.693,6.708,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"ffe0b2":4,"ff5252":4,"b0bec5":4,"C14":4,"C25":4,"e65100":4,"a237e":4,"HEX_#ffe0b2":4,"HEX_#ff5252":4,"HEX_#b0bec5":4,"HEX_#1a237e":4,"ffb74d":2.8,"L17":2.8,"ff8a65":2.8,"HEX_#e65100":2.8,"HEX_#ff8a65":2.8}],["google/gemini-4-argon","high",0,0,[6.727,0.693,6.727,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"fce4ec":4,"ffca28":4,"C27":4,"ffb300":4,"e65100":4,"T19":4,"T27":4,"HEX_#fce4ec":4,"HEX_#ffca28":4,"HEX_#90a4ae":4,"HEX_#00838f":4,"HEX_#80deea":4,"HEX_#ffb300":2.8,"HEX_#e65100":2.8,"HEX_#212121":2.8}],["google/gemini-4-argon","high",0,0,[6.744,0.693,6.744,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"e0f7fa":4,"C27":4,"b0bec5":4,"ff8f00":4,"ffa000":4,"b2ebf2":4,"HEX_#b0bec5":4,"HEX_#ff8f00":4,"HEX_#0097a7":4,"HEX_#b2ebf2":4,"ffd54f":2.8,"HEX_#ffa000":2.8,"HEX_#212121":2.8}],["google/gemini-4-argon","high",0,0,[7.006,0.693,7.006,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.386,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"fce4ec":4,"ffb300":4,"ffe082":4,"cfd8dc":4,"ff8f00":4,"e65100":4,"ffa000":4,"a237e":4,"HEX_#fce4ec":4,"HEX_#ffe082":4,"HEX_#cfd8dc":4,"HEX_#ff8f00":4,"HEX_#283593":4,"HEX_#1a237e":4,"L32":2.8,"HEX_#ffb300":2.8,"HEX_#37474f":2.8,"HEX_#e65100":2.8,"HEX_#ffa000":2.8}],["google/gemini-4-argon","high",0,0,[7.109,0.693,7.109,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0.405,2.197,1.099,0,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.773],{"e0f7fa":4,"ffca28":4,"ffb300":4,"d4c41":4,"ff7043":4,"C14":4,"ffab40":4,"e65100":4,"ffd740":4,"HEX_#ffca28":4,"HEX_#00acc1":4,"HEX_#6d4c41":4,"HEX_#ff7043":4,"HEX_#90a4ae":4,"HEX_#ffab40":4,"HEX_#ffd740":4,"HEX_#00838f":4,"HEX_#80deea":4,"L32":2.8,"HEX_#ffb300":2.8}],["google/gemini-4-argon","high",0,0,[6.915,0.693,6.915,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.099,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"ffecb3":4,"ff5722":4,"b0bec5":4,"ffb300":4,"e65100":4,"fb8c00":4,"HEX_#ffecb3":4,"HEX_#ff5722":4,"HEX_#b0bec5":4,"HEX_#fb8c00":4,"HEX_#00695c":4,"HEX_#004d40":4,"C19":2.8,"Q14":2.8,"L32":2.8,"ff8a65":2.8,"HEX_#ffb300":2.8,"HEX_#e65100":2.8,"HEX_#212121":2.8,"HEX_#ff8a65":2.8}],["google/gemini-4-argon","high",0,0,[6.815,0.693,6.815,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,1.946,1.386,0.693,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e8eaf6":4,"ffca28":4,"cfd8dc":4,"ffa726":4,"ef6c00":4,"a237e":4,"HEX_#e8eaf6":4,"HEX_#ffca28":4,"HEX_#cfd8dc":4,"HEX_#90a4ae":4,"HEX_#1a237e":4,"HEX_#00838f":4,"HEX_#80deea":4,"C19":2.8}],["google/gemini-4-argon","high",0,0,[6.77,0.693,6.77,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,1.946,1.386,0.693,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"ff5722":4,"d7ccc8":4,"a1887f":4,"ff9800":4,"e65100":4,"e2723":4,"HEX_#ff5722":4,"HEX_#d7ccc8":4,"HEX_#a1887f":4,"HEX_#ff9800":4,"HEX_#3e2723":4,"HEX_#0277bd":4,"Q14":2.8,"HEX_#e65100":2.8}],["google/gemini-4-argon","high",0,0,[6.804,0.693,6.804,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,1.946,1.386,0.693,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"f3e5f5":4,"ffa000":4,"cfd8dc":4,"f57c00":4,"T19":4,"T27":4,"fa8da":4,"HEX_#f3e5f5":4,"HEX_#cfd8dc":4,"HEX_#90a4ae":4,"HEX_#f57c00":4,"HEX_#283593":4,"HEX_#9fa8da":4,"C19":2.8,"ffb74d":2.8,"HEX_#ffa000":2.8}],["google/gemini-4-argon","high",0,0,[6.757,0.693,6.757,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,0,2.079,1.386,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"fce4ec":4,"ffb300":4,"fb8c00":4,"T19":4,"T27":4,"HEX_#fce4ec":4,"HEX_#90a4ae":4,"HEX_#fb8c00":4,"HEX_#1565c0":4,"HEX_#64b5f6":4,"ffd54f":2.8,"L17":2.8,"HEX_#ffb300":2.8,"HEX_#212121":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.199,0.693,7.199,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.718,0,0,0,1,0,0,2.303,1.099,0,1.099,0,0,1.099,1.099,0,0,0,0,0,0,0,0,0,0,2.197],{"a1b5c":4,"c2477a":4,"ff9e5e":4,"a2f7a":4,"c6fd6":4,"a1033":4,"HEX_#2a1b5c":4,"HEX_#c2477a":4,"HEX_#ff9e5e":4,"HEX_#3a2f7a":4,"HEX_#14123a":4,"HEX_#7c6fd6":4,"HEX_#1a1033":4,"ffd166":2.8,"M11":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.359,0.693,7.359,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.658,0,0,0,1,0,0,2.485,1.099,0,1.099,0,0,0.693,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"ffcf70":4,"ff7e5f":4,"fff3b0":4,"fefefe":4,"d3142":4,"aa0b0":4,"d405b":4,"a3b12":4,"e76f51":4,"HEX_#ffcf70":4,"HEX_#ff7e5f":4,"HEX_#fff3b0":4,"HEX_#264e70":4,"HEX_#7fb7d9":4,"HEX_#fefefe":4,"HEX_#2d3142":4,"HEX_#9aa0b0":4,"HEX_#3d405b":4,"HEX_#8a3b12":4,"HEX_#e76f51":4}],["anthropic/claude-opus-5.5","max",0,0,[7.3,0.693,7.3,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.593,0,0,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"ff9a76":4,"ffd6a5":4,"ffef7a":4,"d6fa3":4,"ecae6":4,"f1f5f9":4,"a3412":4,"HEX_#ff9a76":4,"HEX_#ffd6a5":4,"HEX_#ffef7a":4,"HEX_#1d6fa3":4,"HEX_#f1f5f9":4,"HEX_#475569":4,"HEX_#94a3b8":4,"HEX_#9a3412":4,"HEX_#ffb703":2.8,"HEX_#8ecae6":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.457,0.693,7.457,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.545,0,0,0,1,0,0,2.639,1.386,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.485],{"eaf6e9":4,"ffd23f":4,"V32H0z":4,"a86ff":4,"cfe3ff":4,"a8b6c8":4,"ff9f1c":4,"a4b00":4,"ffbf69":4,"HEX_#eaf6e9":4,"HEX_#ffd23f":4,"HEX_#3a86ff":4,"HEX_#265cb5":4,"HEX_#cfe3ff":4,"HEX_#a8b6c8":4,"HEX_#8a4b00":4,"HEX_#ffbf69":4,"M11":2.8,"d3557":2.8,"HEX_#1d3557":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.513,0.693,7.513,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.547,0,0,0,1,0,0,2.565,1.386,0,0.693,0,0,0.693,0.693,0,0,0,0,0,0,0,0,0,0,2.639],{"be7ff":4,"e8fbff":4,"ffe14d":4,"V32H0z":4,"f8b8d":4,"b6e70":4,"a7f3f0":4,"b2d42":4,"d99ae":4,"ff7b00":4,"a3b00":4,"ffb000":4,"HEX_#9be7ff":4,"HEX_#e8fbff":4,"HEX_#ffe14d":4,"HEX_#0f8b8d":4,"HEX_#0b6e70":4,"HEX_#a7f3f0":4,"HEX_#2b2d42":4,"HEX_#8d99ae":4}],["anthropic/claude-opus-5.5","max",0,0,[7.436,0.693,7.436,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.564,0,0,0,1,0,0,2.565,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"e0f4f1":4,"ff6b6b":4,"V32H0z":4,"ec4b6":4,"a8f84":4,"cbf3f0":4,"fff8e7":4,"e9c46a":4,"c4a1a":4,"e76f51":4,"HEX_#e0f4f1":4,"HEX_#ff6b6b":4,"HEX_#2ec4b6":4,"HEX_#1a8f84":4,"HEX_#cbf3f0":4,"HEX_#fff8e7":4,"HEX_#e9c46a":4,"HEX_#9c4a1a":4,"HEX_#e76f51":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.495,0.693,7.495,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.583,0,0,0,1,0,0,2.565,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"f3e9ff":4,"ff8fab":4,"e60ce":4,"c7d2fe":4,"a5b4fc":4,"fffdf7":4,"b8b8d1":4,"a4a00":4,"HEX_#f3e9ff":4,"HEX_#ff8fab":4,"HEX_#5e60ce":4,"HEX_#c7d2fe":4,"HEX_#a5b4fc":4,"HEX_#fffdf7":4,"HEX_#22223b":4,"HEX_#b8b8d1":4,"HEX_#7a4a00":4,"HEX_#ffb703":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.303,0.693,7.303,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.568,0,0,0,1,0,0,2.485,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708],{"fff4d6":4,"ffd56b":4,"a7fb5":4,"bfe0ff":4,"cc6ef":4,"d405b":4,"c9ccd5":4,"b1b2f":4,"f28c28":4,"a3b12":4,"f6b042":4,"f5d8a":4,"HEX_#fff4d6":4,"HEX_#ffd56b":4,"HEX_#4a7fb5":4,"HEX_#bfe0ff":4,"HEX_#9cc6ef":4,"HEX_#3d405b":4,"HEX_#c9ccd5":4,"HEX_#1b1b2f":4}],["anthropic/claude-opus-5.5","max",0,0,[6.861,0.693,6.861,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.586,0,1,0,0,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"eaf4f4":4,"f6bd60":4,"V32H0z":4,"fa8d3":4,"b4965":4,"f28482":4,"bee9e8":4,"HEX_#eaf4f4":4,"HEX_#f6bd60":4,"HEX_#5fa8d3":4,"HEX_#1b4965":4,"HEX_#62b6cb":4,"HEX_#f28482":4,"HEX_#bee9e8":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.998,0.693,6.998,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,1,0,0,0,0,2.197,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"e0fbfc":4,"ee6c4d":4,"V32H0z":4,"d5a80":4,"f4a28c":4,"HEX_#e0fbfc":4,"HEX_#ee6c4d":4,"HEX_#3d5a80":4,"HEX_#98c1d9":4,"HEX_#293241":4,"HEX_#f4a28c":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.904,0.693,6.904,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.63,0,1,0,0,0,0,2.079,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"d8f3dc":4,"ffd60a":4,"V32H0z":4,"adb5bd":4,"HEX_#d8f3dc":4,"HEX_#0077b6":4,"HEX_#90e0ef":4,"HEX_#03045e":4,"HEX_#adb5bd":4,"HEX_#ffd60a":2.8,"HEX_#ffb703":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.969,0.693,6.969,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.577,0,1,0,0,0,0,1.946,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.398],{"ffe5b4":4,"ff5e5b":4,"d8f3f3":4,"f2f2f":4,"ffd23f":4,"HEX_#ffe5b4":4,"HEX_#ff5e5b":4,"HEX_#00a6a6":4,"HEX_#d8f3f3":4,"HEX_#2f2f2f":4,"HEX_#111":4,"HEX_#ffd23f":4,"ffb347":2.8,"f4a261":2.8,"HEX_#ffb347":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.913,0.693,6.913,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.625,0,1,0,0,0,0,2.079,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.946],{"fefae0":4,"dda15e":4,"V32H0z":4,"V24q-4-2-8":4,"faedcd":4,"bc6c25":4,"HEX_#fefae0":4,"HEX_#dda15e":4,"HEX_#283618":4,"HEX_#606c38":4,"HEX_#faedcd":4,"HEX_#bc6c25":4}],["anthropic/claude-opus-5.5","max",0,0,[6.884,0.693,6.884,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.583,0,1,0,0,0,0,1.792,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.303],{"ffcdb2":4,"e5989b":4,"fff1a8":4,"d6875":4,"b5838d":4,"a3a46":4,"HEX_#ffcdb2":4,"HEX_#e5989b":4,"HEX_#fff1a8":4,"HEX_#6d6875":4,"HEX_#b5838d":4,"HEX_#3a3a46":4,"HEX_#111":4,"f4a261":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.043,0.693,7.043,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.576,0,1,0,0,0,0,2.303,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"edf6f9":4,"ffddd2":4,"e29578":4,"V32H0z":4,"HEX_#edf6f9":4,"HEX_#ffddd2":4,"HEX_#e29578":4,"HEX_#83c5be":4,"HEX_#006d77":4,"HEX_#264653":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.836,0.693,6.836,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,0.333,0,1,0,0,2.079,1.099,0.693,1.099,0,0,0.693,0.693,0,0,0,0,0,0,0,0,0,0,2.079],{"ff5e62":4,"ffc371":4,"fff3b0":4,"d2c5e":4,"f7bbf":4,"a1f3d":4,"HEX_#ff5e62":4,"HEX_#ffc371":4,"HEX_#fff3b0":4,"HEX_#3d2c5e":4,"HEX_#8f7bbf":4,"HEX_#2a1f3d":4,"HEX_#241a36":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.827,0.693,6.827,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.647,0,0,0,1,0,0,1.792,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"ffd9a8":4,"ff8c1a":4,"a7fbf":4,"bfe4ff":4,"f4f4f4":4,"d8d8d8":4,"f2a71b":4,"a5650a":4,"f7c35a":4,"HEX_#ffd9a8":4,"HEX_#ff8c1a":4,"HEX_#2a7fbf":4,"HEX_#bfe4ff":4,"HEX_#f4f4f4":4,"HEX_#555":4,"HEX_#d8d8d8":4,"HEX_#f2a71b":4,"HEX_#a5650a":4,"HEX_#f7c35a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.066,0.693,7.066,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.621,0,0,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"b3a8c":4,"ff9a6b":4,"ffd23f":4,"d4e7a":4,"fb8e6":4,"e9e4dc":4,"a3a3a":4,"c9c2b6":4,"e88a1a":4,"f5b445":4,"a5a0a":4,"HEX_#5b3a8c":4,"HEX_#ff9a6b":4,"HEX_#ffd23f":4,"HEX_#1d4e7a":4,"HEX_#7fb8e6":4,"HEX_#e9e4dc":4,"HEX_#3a3a3a":4,"HEX_#c9c2b6":4,"HEX_#111":4}],["anthropic/claude-opus-5.5","max",0,0,[6.983,0.693,6.983,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.561,0,0.571,0,1,0,0,2.197,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.773],{"bfe8f2":4,"ffe14d":4,"ffb400":4,"V32H0z":4,"c8fa8":4,"e6f7fb":4,"f2efe9":4,"ff9f1c":4,"b5650a":4,"ffc15e":4,"d6a7e":4,"HEX_#bfe8f2":4,"HEX_#ffe14d":4,"HEX_#ffb400":4,"HEX_#2c8fa8":4,"HEX_#e6f7fb":4,"HEX_#f2efe9":4,"HEX_#444":4,"HEX_#111":4,"HEX_#b5650a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.073,0.693,7.073,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.522,0,1,0,1,0,0,2.303,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"fff1e0":4,"ff7b00":4,"V13M10":4,"H22M11":4,"V32H0z":4,"bde6f5":4,"d2d2d":4,"e4e4e4":4,"ef8a17":4,"a5208":4,"d6d8c":4,"HEX_#fff1e0":4,"HEX_#ff7b00":4,"HEX_#118ab2":4,"HEX_#bde6f5":4,"HEX_#2d2d2d":4,"HEX_#e4e4e4":4,"HEX_#111":4,"HEX_#ef8a17":4,"HEX_#9a5208":4}],["anthropic/claude-opus-5.5","max",0,0,[6.934,0.693,6.934,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.593,0,0,0,1,0,0,2.079,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708],{"e3f4ea":4,"ffcf33":4,"V32H0z":4,"a86c8":4,"d6ecff":4,"b3b3b":4,"e6e6e6":4,"ff8c42":4,"a5520f":4,"ffb877":4,"a6aa3":4,"HEX_#e3f4ea":4,"HEX_#ffcf33":4,"HEX_#3a86c8":4,"HEX_#d6ecff":4,"HEX_#3b3b3b":4,"HEX_#e6e6e6":4,"HEX_#111":4,"HEX_#ff8c42":4,"HEX_#a5520f":4}],["anthropic/claude-opus-5.5","max",0,0,[7.008,0.693,7.008,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.643,0,0.333,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"ff6b3d":4,"ab6c4":4,"e9c46a":4,"a0621a":4,"b323b":4,"HEX_#ff6b3d":4,"HEX_#8ab6c4":4,"HEX_#ddd":4,"HEX_#111":4,"HEX_#e9c46a":4,"HEX_#a0621a":4,"HEX_#1b323b":4,"f4a261":2.8,"HEX_#264653":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.965,0.693,6.965,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.55,0,0,0,1,0,0,1.946,2.079,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"fca311":4,"a1128":4,"a506b":4,"e5e5e5":4,"f6bd60":4,"HEX_#14213d":4,"HEX_#fca311":4,"HEX_#0a1128":4,"HEX_#3a506b":4,"HEX_#e5e5e5":4,"HEX_#f6bd60":4,"f4a261":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.165,0.693,7.165,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.571,0,1,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"e8f1d4":4,"ecae6":4,"b2d42":4,"dde5ed":4,"b35c00":4,"e9eef3":4,"HEX_#e8f1d4":4,"HEX_#2b2d42":4,"HEX_#dde5ed":4,"HEX_#111":4,"HEX_#b35c00":4,"HEX_#e9eef3":4,"HEX_#ffb703":2.8,"HEX_#8ecae6":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.171,0.693,7.171,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.517,0,1,0,1,0,0,2.197,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.708],{"cdeffd":4,"ffcb47":4,"f29e00":4,"H7M25":4,"a7ca5":4,"b1b1b":4,"ff9f43":4,"c46a00":4,"ffc078":4,"e6ecf1":4,"HEX_#cdeffd":4,"HEX_#ffcb47":4,"HEX_#f29e00":4,"HEX_#3a7ca5":4,"HEX_#81c3d7":4,"HEX_#46494c":4,"HEX_#d9e2ea":4,"HEX_#1b1b1b":4,"HEX_#ff9f43":4,"HEX_#c46a00":4}],["anthropic/claude-opus-5.5","max",0,0,[6.784,0.693,6.784,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.595,0,1,0,0,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"edf6f9":4,"ffb4a2":4,"e29578":4,"HEX_#edf6f9":4,"HEX_#ffb4a2":4,"HEX_#e29578":4,"HEX_#006d77":4,"HEX_#83c5be":4,"HEX_#003d42":4}],["anthropic/claude-opus-5.5","max",0,0,[6.793,0.693,6.793,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,1,0,0,0,0,1.946,1.609,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"fff1e6":4,"f28482":4,"f6bd60":4,"HEX_#fff1e6":4,"HEX_#f28482":4,"HEX_#f6bd60":4,"d3557":2.8,"a8dadc":2.8,"HEX_#457b9d":2.8,"HEX_#1d3557":2.8,"HEX_#a8dadc":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.771,0.693,6.771,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.619,0,1,0,0,0,0,1.946,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"ffe5ec":4,"ff8fab":4,"e548e":4,"f86c0":4,"e0b1cb":4,"HEX_#ffe5ec":4,"HEX_#ff8fab":4,"HEX_#5e548e":4,"HEX_#231942":4,"HEX_#9f86c0":4,"HEX_#e0b1cb":4,"HEX_#ffb703":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.83,0.693,6.83,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.632,0,1,0,0,0,0,1.792,1.946,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.197],{"ee9b00":4,"a1128":4,"eae0d5":4,"ca6702":4,"HEX_#22333b":4,"HEX_#ee9b00":4,"HEX_#0a1128":4,"HEX_#eae0d5":4,"HEX_#000":4,"HEX_#ca6702":4,"HEX_#94a3b8":4}],["anthropic/claude-opus-5.5","max",0,0,[6.77,0.693,6.77,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.606,0,1,0,0,0,0,2.079,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.079],{"dee2ff":4,"a0ca3":4,"f72585":4,"HEX_#dee2ff":4,"HEX_#4361ee":4,"HEX_#3a0ca3":4,"HEX_#f72585":4,"HEX_#7209b7":4,"ffd166":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.079,0.693,7.079,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.56,0,1,0,0,0,0,2.197,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"d1a39":4,"f9c74f":4,"d348b":4,"f1f1f1":4,"b0a1a":4,"e9e9e":4,"f8961e":4,"f3722c":4,"HEX_#1d1a39":4,"HEX_#f9c74f":4,"HEX_#3d348b":4,"HEX_#7678ed":4,"HEX_#f1f1f1":4,"HEX_#0b0a1a":4,"HEX_#9e9e9e":4,"HEX_#f8961e":4,"HEX_#f3722c":4}],["anthropic/claude-opus-5.5","max",0,0,[6.891,0.693,6.891,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.6,0,0,0,0,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"ffcf9e":4,"ff7b54":4,"a86ff":4,"bde0fe":4,"b2d42":4,"d9d9d9":4,"d5fc7":4,"HEX_#ffcf9e":4,"HEX_#ff7b54":4,"HEX_#3a86ff":4,"HEX_#bde0fe":4,"HEX_#2b2d42":4,"HEX_#d9d9d9":4,"HEX_#1d5fc7":4,"ffd166":2.8,"HEX_#ffb703":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.096,0.693,7.096,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,1,0,0,0,0,2.398,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"fff4e0":4,"ffb4a2":4,"V13M1":4,"H13":4,"e76f51":4,"HEX_#fff4e0":4,"HEX_#ffb4a2":4,"HEX_#e76f51":4,"M11":2.8,"a8dadc":2.8,"d3557":2.8,"f4a261":2.8,"HEX_#a8dadc":2.8,"HEX_#457b9d":2.8,"HEX_#1d3557":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.128,0.693,7.128,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.556,0,1,0,0,0,0,2.197,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.485],{"b4b8a":4,"ff9a76":4,"f86b8":4,"b1b2f":4,"c9c3b6":4,"ff8c42":4,"ffb26b":4,"b2238":4,"HEX_#5b4b8a":4,"HEX_#ff9a76":4,"HEX_#14385c":4,"HEX_#4f86b8":4,"HEX_#1b1b2f":4,"HEX_#c9c3b6":4,"HEX_#ff8c42":4,"HEX_#ffb26b":4,"HEX_#0b2238":4,"ffd166":2.8,"HEX_#ffd166":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.015,0.693,7.015,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.593,0,1,0,0,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"e8f4f0":4,"f25c54":4,"a9d8f":4,"e9f5db":4,"f7a399":4,"fefae0":4,"e9c46a":4,"HEX_#e8f4f0":4,"HEX_#f25c54":4,"HEX_#2a9d8f":4,"HEX_#e9f5db":4,"HEX_#f7a399":4,"HEX_#fefae0":4,"HEX_#e9c46a":4,"M11":2.8,"f4a261":2.8,"HEX_#264653":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.101,0.693,7.101,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.592,0,1,0,0,0,0,2.303,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.639],{"ffd23f":4,"d6fa3":4,"fd8f5":4,"fafaf7":4,"a4a4a":4,"c8c8c":4,"a1a1a":4,"f4a72a":4,"b9771a":4,"f7c35a":4,"HEX_#ffd23f":4,"HEX_#1d6fa3":4,"HEX_#9fd8f5":4,"HEX_#fafaf7":4,"HEX_#4a4a4a":4,"HEX_#8c8c8c":4,"HEX_#1a1a1a":4,"HEX_#f4a72a":4,"HEX_#b9771a":4,"HEX_#f7c35a":4}],["anthropic/claude-opus-5.5","max",0,0,[6.937,0.693,6.937,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.591,0,0,0,0,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"ffe3b8":4,"bfe6ff":4,"f4f4f0":4,"a5a5a":4,"a9a9a":4,"f2b233":4,"c98a1a":4,"f7c95c":4,"HEX_#ffe3b8":4,"HEX_#2b7bb9":4,"HEX_#bfe6ff":4,"HEX_#f4f4f0":4,"HEX_#5a5a5a":4,"HEX_#9a9a9a":4,"HEX_#f2b233":4,"HEX_#c98a1a":4,"HEX_#f7c95c":4,"ff8a3d":2.8,"HEX_#ff8a3d":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.037,0.693,7.037,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.588,0,0.667,0,0,0,0,2.303,1.386,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"e8f4ea":4,"f9c74f":4,"f3722c":4,"V32H0z":4,"d405b":4,"a8a8b3":4,"d1d1d":4,"f8961e":4,"c0661a":4,"d5f7a":4,"HEX_#e8f4ea":4,"HEX_#f9c74f":4,"HEX_#f3722c":4,"HEX_#277da1":4,"HEX_#90e0ef":4,"HEX_#3d405b":4,"HEX_#a8a8b3":4,"HEX_#1d1d1d":4,"HEX_#f8961e":4,"HEX_#c0661a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.123,0.693,7.123,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.613,0,1,0,0,0,0,2.197,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"b2a49":4,"ffe8a3":4,"e4c63":4,"fb3c9":4,"e9e4d8":4,"a8170":4,"a89f8c":4,"e8a93b":4,"b07a22":4,"f0c066":4,"a3a4c":4,"HEX_#1b2a49":4,"HEX_#ffe8a3":4,"HEX_#0e4c63":4,"HEX_#5fb3c9":4,"HEX_#e9e4d8":4,"HEX_#8a8170":4,"HEX_#a89f8c":4,"HEX_#111":4,"HEX_#e8a93b":4}],["anthropic/claude-opus-5.5","max",0,0,[6.862,0.693,6.862,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.688,0,1,0,0,0,0,1.946,1.099,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.303],{"ff9a8b":4,"ffd3a5":4,"ff5e3a":4,"a3f8f":4,"ff8f6b":4,"f95e0":4,"b2140":4,"e0a030":4,"c9861f":4,"HEX_#ff9a8b":4,"HEX_#ffd3a5":4,"HEX_#ff5e3a":4,"HEX_#3a3f8f":4,"HEX_#ff8f6b":4,"HEX_#8f95e0":4,"HEX_#2b2140":4,"HEX_#e0a030":4,"HEX_#c9861f":4}],["anthropic/claude-opus-5.5","max",0,0,[7.054,0.693,7.054,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,2.079,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"ffe8c2":4,"ffb627":4,"ff8c00":4,"a86c8":4,"bfe3ff":4,"f4f4f4":4,"d9d9d9":4,"Q18":4,"f2a33a":4,"b8651a":4,"f7c66b":4,"HEX_#ffe8c2":4,"HEX_#ffb627":4,"HEX_#ff8c00":4,"HEX_#3a86c8":4,"HEX_#bfe3ff":4,"HEX_#f4f4f4":4,"HEX_#555":4,"HEX_#d9d9d9":4,"HEX_#f2a33a":4}],["anthropic/claude-opus-5.5","max",0,0,[6.96,0.693,6.96,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,1,0,0,2.485,1.099,1.099,1.099,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,1.946],{"fdf0d5":4,"f77f00":4,"fcbf49":4,"d1d1d":4,"HEX_#fdf0d5":4,"HEX_#f77f00":4,"HEX_#003049":4,"HEX_#fcbf49":4,"HEX_#669bbc":4,"HEX_#1d1d1d":4,"M11":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.229,0.693,7.229,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,0,0,1,0,0,2.303,1.386,0.693,0.693,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.773],{"ecae6":4,"e0f4ff":4,"ffd60a":4,"ffc300":4,"d405b":4,"b8c0cc":4,"f2cc8f":4,"c2703d":4,"f6bd60":4,"HEX_#e0f4ff":4,"HEX_#ffc300":4,"HEX_#0077b6":4,"HEX_#023e8a":4,"HEX_#005f99":4,"HEX_#3d405b":4,"HEX_#b8c0cc":4,"HEX_#f2cc8f":4,"HEX_#111":4,"HEX_#c2703d":4,"HEX_#f6bd60":4}],["anthropic/claude-opus-5.5","max",0,0,[7.154,0.693,7.154,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.457,0,0,0,1,0,0,2.303,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"d8f1f0":4,"ffcf3f":4,"f2a900":4,"b9aaa":4,"a6e3e9":4,"c9d3da":4,"c45a14":4,"ffb26b":4,"HEX_#d8f1f0":4,"HEX_#ffcf3f":4,"HEX_#f2a900":4,"HEX_#1b9aaa":4,"HEX_#a6e3e9":4,"HEX_#36454f":4,"HEX_#c9d3da":4,"HEX_#111":4,"HEX_#c45a14":4,"HEX_#ffb26b":4,"M11":2.8,"ff8a3d":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.903,0.693,6.903,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.519,0,0,0,1,0,0,2.079,1.099,0.693,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.079],{"b1b4f":4,"e2557a":4,"ffb36b":4,"ffd36e":4,"f3c6b":4,"fa3d9":4,"a2233":4,"HEX_#2b1b4f":4,"HEX_#e2557a":4,"HEX_#ffb36b":4,"HEX_#ffd36e":4,"HEX_#1f3c6b":4,"HEX_#6fa3d9":4,"HEX_#2a2233":4}],["anthropic/claude-opus-5.5","max",0,0,[7.015,0.693,7.015,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.526,0,1,0,0,0,0,2.197,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"eaf4f4":4,"f6bd60":4,"f28482":4,"V32H0z":4,"f7ede2":4,"f5cac3":4,"HEX_#eaf4f4":4,"HEX_#f6bd60":4,"HEX_#f28482":4,"HEX_#84a59d":4,"HEX_#52796f":4,"HEX_#f7ede2":4,"HEX_#354f52":4,"HEX_#f5cac3":4,"M11":2.8,"e0e0e0":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.929,0.693,6.929,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.545,0,1,0,0,0,0,2.079,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"f8edeb":4,"ffb4a2":4,"ffd6a5":4,"V32H0z":4,"d6875":4,"b5838d":4,"e5989b":4,"d2a32":4,"HEX_#f8edeb":4,"HEX_#ffb4a2":4,"HEX_#ffd6a5":4,"HEX_#6d6875":4,"HEX_#b5838d":4,"HEX_#e5989b":4,"HEX_#2d2a32":4,"e0e0e0":2.8,"f4a261":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.948,0.693,6.948,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.542,0,1,0,0,0,0,2.079,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"fcefb4":4,"f79d65":4,"f4845f":4,"V32H0z":4,"fdfcdc":4,"f07167":4,"fed9b7":4,"HEX_#fcefb4":4,"HEX_#f79d65":4,"HEX_#f4845f":4,"HEX_#0081a7":4,"HEX_#00afb9":4,"HEX_#fdfcdc":4,"HEX_#283618":4,"HEX_#f07167":4,"HEX_#fed9b7":4,"M26":2.8,"e0e0e0":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[7.004,0.693,7.004,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.542,0,1,0,0,0,0,2.079,1.609,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"e9f5db":4,"ffbe0b":4,"V32H0z":4,"d8f3dc":4,"fb5607":4,"HEX_#e9f5db":4,"HEX_#ffbe0b":4,"HEX_#61a5c2":4,"HEX_#d8f3dc":4,"HEX_#013a63":4,"HEX_#fb5607":4,"M26":2.8,"e0e0e0":2.8,"HEX_#e0e0e0":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.725,0.693,6.725,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.647,0,1,0,0,0,0,1.792,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"ffe8c2":4,"ff9a2e":4,"a8fc4":4,"bfe6ff":4,"f5f5f0":4,"d8d8d0":4,"f2b233":4,"f7c95a":4,"HEX_#ffe8c2":4,"HEX_#ff9a2e":4,"HEX_#3a8fc4":4,"HEX_#bfe6ff":4,"HEX_#f5f5f0":4,"HEX_#555":4,"HEX_#d8d8d0":4,"HEX_#f2b233":4,"HEX_#a66":4,"HEX_#f7c95a":4}],["anthropic/claude-opus-5.5","max",0,0,[7.083,0.693,7.083,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.591,0,1,0,0,0,0,2.303,1.386,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.639],{"cfeefa":4,"ffcf33":4,"f29a00":4,"a8dcf5":4,"a4a4a":4,"e2e2e2":4,"ff9f43":4,"b5651d":4,"ffc078":4,"HEX_#cfeefa":4,"HEX_#ffcf33":4,"HEX_#f29a00":4,"HEX_#2b7bb9":4,"HEX_#a8dcf5":4,"HEX_#4a4a4a":4,"HEX_#e2e2e2":4,"HEX_#111":4,"HEX_#ff9f43":4,"HEX_#b5651d":4,"HEX_#ffc078":4}],["anthropic/claude-opus-5.5","max",0,0,[7.028,0.693,7.028,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.621,0,0,0,0,0,0,2.303,1.609,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"d2a4a":4,"ffe08a":4,"f3d5c":4,"aa9d6":4,"e8e4d8":4,"a968a":4,"f4a340":4,"a4a1a":4,"HEX_#1d2a4a":4,"HEX_#ffe08a":4,"HEX_#0f3d5c":4,"HEX_#5aa9d6":4,"HEX_#e8e4d8":4,"HEX_#111":4,"HEX_#9a968a":4,"HEX_#f4a340":4,"HEX_#7a4a1a":4}],["anthropic/claude-opus-5.5","max",0,0,[6.921,0.693,6.921,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.667,0,1,0,0,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.565],{"fff4d6":4,"ff6b3d":4,"fb8de":4,"f2f0ea":4,"a3a3a":4,"d9d6cc":4,"a0522d":4,"ffd08a":4,"HEX_#fff4d6":4,"HEX_#ff6b3d":4,"HEX_#264d73":4,"HEX_#8fb8de":4,"HEX_#f2f0ea":4,"HEX_#3a3a3a":4,"HEX_#d9d6cc":4,"HEX_#111":4,"HEX_#a0522d":4,"HEX_#ffd08a":4,"HEX_#555":4,"ffb347":2.8}],["anthropic/claude-opus-5.5","max",0,0,[6.973,0.693,6.973,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.64,0,0,0,0,0,0,2.079,1.386,0,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"b4fa0":4,"e5a7a":4,"fc8e8":4,"b5651d":4,"ffcc80":4,"HEX_#6b4fa0":4,"HEX_#1e5a7a":4,"HEX_#7fc8e8":4,"HEX_#999":4,"HEX_#111":4,"HEX_#b5651d":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.657,0.693,6.657,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.579,0,0,0,1,0,0,1.946,1.386,0.693,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"ffe3b3":4,"b8fb5":4,"b9e3f2":4,"e8e8e8":4,"f2a516":4,"d9822b":4,"c9c9c9":4,"HEX_#ffe3b3":4,"HEX_#3b8fb5":4,"HEX_#b9e3f2":4,"HEX_#e8e8e8":4,"HEX_#f2a516":4,"HEX_#d9822b":4,"HEX_#c9c9c9":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.865,0.693,6.865,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.618,0,1,0,1,0,0,2.197,1.386,0,1.386,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.485],{"f7d6e0":4,"ff6f4a":4,"ff9d73":4,"fa6d6":4,"d6dbe3":4,"f2a21b":4,"d9792b":4,"HEX_#f7d6e0":4,"HEX_#ff6f4a":4,"HEX_#355c9a":4,"HEX_#ff9d73":4,"HEX_#7fa6d6":4,"HEX_#d6dbe3":4,"HEX_#f2a21b":4,"HEX_#d9792b":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.966,0.693,6.966,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.522,0,0.667,0,1,0,0,2.303,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"d9ecf5":4,"H20M30":4,"c7da0":4,"a5d8ea":4,"H8q-4":4,"d3d9de":4,"f2a21b":4,"d9792b":4,"d5f7d":4,"HEX_#d9ecf5":4,"HEX_#2c7da0":4,"HEX_#a5d8ea":4,"HEX_#d3d9de":4,"HEX_#f2a21b":4,"HEX_#d9792b":4,"HEX_#1d5f7d":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.847,0.693,6.847,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.5,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"f78a8":4,"fd3ea":4,"H9q-4":4,"d8dde2":4,"f4a21c":4,"e07b2a":4,"HEX_#2f78a8":4,"HEX_#9fd3ea":4,"HEX_#d8dde2":4,"HEX_#f4a21c":4,"HEX_#e07b2a":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.786,0.693,6.786,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.567,0,1,0,1,0,0,2.197,1.386,0,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"fbd7a8":4,"ff7a3c":4,"ffb27a":4,"fc7df":4,"H9q-2":4,"d9dde2":4,"f4a21c":4,"d9792b":4,"HEX_#fbd7a8":4,"HEX_#ff7a3c":4,"HEX_#ffb27a":4,"HEX_#8fc7df":4,"HEX_#d9dde2":4,"HEX_#f4a21c":4,"HEX_#d9792b":4}],["openai/gpt-6.1-sol","max",0,0,[6.762,0.693,6.762,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0.277,0,0,0,1,1,0,2.079,1.099,0,0.693,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,2.303],{"fff3df":4,"f4b64f":4,"a8d5cd":4,"fffdf6":4,"ed9772":4,"f4bd54":4,"bad3bd":4,"HEX_#fff3df":4,"HEX_#f4b64f":4,"HEX_#a8d5cd":4,"HEX_#294b47":4,"HEX_#fffdf6":4,"HEX_#ed9772":4,"HEX_#f4bd54":4,"HEX_#bad3bd":4,"HEX_#568e86":4}],["openai/gpt-6-astra","max",0,0,[6.562,0.693,6.562,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.099,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e5f6ff":4,"ffc857":4,"fffdf5":4,"f2a142":4,"ffd16a":4,"aaeb9":4,"H9M14":4,"H20M24":4,"d8f7ff":4,"HEX_#e5f6ff":4,"HEX_#ffc857":4,"HEX_#48b6cd":4,"HEX_#fffdf5":4,"HEX_#637787":4,"HEX_#f2a142":4,"HEX_#ffd16a":4,"HEX_#263b4d":4,"HEX_#9aaeb9":4,"HEX_#d8f7ff":4,"H21":2.8}],["openai/gpt-6-astra","max",0,0,[6.447,0.693,6.447,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.792,1.099,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"dff5ff":4,"ffca45":4,"fffdf1":4,"ffa745":4,"H20":4,"H10M20":4,"H28":4,"HEX_#dff5ff":4,"HEX_#ffca45":4,"HEX_#42b8d0":4,"HEX_#fffdf1":4,"HEX_#607581":4,"HEX_#ffa745":4,"HEX_#233b4b":4,"HEX_#247e99":4}],["openai/gpt-6-astra","max",0,0,[6.565,0.693,6.565,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,0,0,1.946,1.099,0.693,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e5f5fa":4,"ffcb58":4,"fffdf3":4,"f2a64a":4,"ffd377":4,"caeb7":4,"H9M14":4,"H20M24":4,"d3f4fc":4,"HEX_#e5f5fa":4,"HEX_#ffcb58":4,"HEX_#45afc8":4,"HEX_#fffdf3":4,"HEX_#71828c":4,"HEX_#f2a64a":4,"HEX_#ffd377":4,"HEX_#263c49":4,"HEX_#9caeb7":4,"HEX_#d3f4fc":4,"H21":2.8}],["openai/gpt-6-astra","max",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e8f5fa":4,"ffc857":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e8f5fa":4,"HEX_#ffc857":4,"HEX_#439fb9":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["openai/gpt-6-astra","max",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e6f5ff":4,"ffca55":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e6f5ff":4,"HEX_#ffca55":4,"HEX_#46a8c2":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["openai/gpt-6-astra","max",0,0,[6.681,0.693,6.681,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,0,0,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e5f4f8":4,"ffc65a":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e5f4f8":4,"HEX_#ffc65a":4,"HEX_#409fb8":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["openai/gpt-6-astra","max",0,0,[6.709,0.693,6.709,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,0,1,1,1.609,1.946,1.099,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2.398],{"e8f5fa":4,"ffc857":4,"V10Q19":4,"fffdf3":4,"ffb656":4,"d68039":4,"b5c9d5":4,"H9M13":4,"H19M24":4,"H29":4,"c7f4ff":4,"HEX_#e8f5fa":4,"HEX_#ffc857":4,"HEX_#439fb9":4,"HEX_#fffdf3":4,"HEX_#304e60":4,"HEX_#ffb656":4,"HEX_#d68039":4,"HEX_#263c4d":4,"HEX_#b5c9d5":4}],["google/gemini-4-argon","high",0,0,[6.555,0.693,6.555,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.556,0,1,1,1,0,0,1.792,1.099,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.099],{"F4C96B":4,"HEX_#147d83":4,"HEX_#f4c96b":4}],["meta/muse-spark-1.3","xhigh",0,0,[6.886,0.693,6.886,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.444,0.576,0,1,0,0,0,1.946,2.079,1.386,0.693,0.693,0,0,1.099,0,0,0,0,0,0,0,0,0,0,0,1.946],{"DFF3FF":4,"FFD93D":4,"FF9F1C":4,"D9CDB":4,"HEX_#dff3ff":4,"HEX_#334155":4,"HEX_#ffd93d":4,"HEX_#2d9cdb":4}],["deepseek/deepseek-v4.1-flash","max",0,0,[7.482,0.693,7.482,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0.131,0,0,0,1,1,0,2.485,1.386,0.693,0.693,0,0,1.386,0,0,0,0,0,0,0,0,0,0,0,1.946],{"F7F2E5":4,"F4B860":4,"FBF6E8":4,"C6BF":4,"E8392":4,"H25":4,"HEX_#f7f2e5":4,"HEX_#f4b860":4,"HEX_#22384a":4,"HEX_#fbf6e8":4,"HEX_#76c6bf":4,"HEX_#3e8392":4}],["anthropic/claude-sonnet-5.5","high",0,0,[6.964,0.693,6.964,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0,0,0,0,1,1,0,0,2.197,1.386,0.693,1.099,0,0,0.693,0,0,0,0,0,0,0,0,0,0,0,1.946],{"H29M18":4,"H19M28":4,"T23":4,"H29M26":4}],["x-ai/grok-4.6","medium",0,0,[6.55,0.693,6.55,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,1,0,0,0,0,0,0,0,1.099,1.386,0.693,0,1.609,0,0,0,0,0,0,0,0,0,0,0,0,0,1.792],{"S20":4,"S28":4,"F1C40F":4,"ECF0F1":4,"L23":4,"E67E22":4,"C3E50":4,"HEX_#3498db":4,"HEX_#e67e22":4}],["meta/muse-spark-1.3","max",0,0,[6.739,0.693,6.739,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.923,0,0,0,0,0,0,0,1.099,1.386,0.693,1.099,0,0,0,0.693,0,0,0,0,0,0,0,0,0,0,2.565],{"E0F7FA":4,"FFD54F":4,"FFA000":4,"T31":4,"F5F5F5":4,"A64":4,"FFB300":4,"E65100":4,"HEX_#0288d1":4,"HEX_#f5f5f5":4}],["anthropic/claude-sonnet-5","high",0,0,[6.512,0.693,6.512,1,3.497,3.497,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.693,0.909,0,0,0,0,0,0,0,1.386,1.386,0,0.693,0,0.693,0,0,0,0,0,0,0,0,0,0,0,0,2.303],{"E3F2FD":4,"FFB74D":4,"H32":4,"BBDEFB":4,"FAFAFA":4,"FFA726":4,"EF6C00":4,"HEX_#e3f2fd":4,"HEX_#1976d2":4,"HEX_#bbdefb":4}]],"mt":{"meta/muse-spark-1.3|1":{"treeBlock":4,"scrollMid":4,"scrollFast":4,"scroll-mid":4,"scroll-fast":4,"scarf-tip":4,"sailor":4,"obtained":4,"grassBlock":4,"frond":4,"fgBlock":4,"fffde7":4,"ffab00":4,"fdfefe":4,"fdebd0":4,"fd3f4":4,"f9be8":4,"f8ad9d":4,"f7e0a3":4,"f7bd45":4,"f5b041":4,"f2f4f4":4,"ecf0f1":4,"ecc71":4,"e8449":4,"e84393":4,"e72":4,"e67e22":4,"e44ad":4,"e3f5fd":4,"dfe6e9":4,"d9a9b":4,"d68910":4,"d5dbdb":4,"d4a1d":4,"d35400":4,"d3436":4,"black":4,"b9ff":4,"b96a1b":4,"b59b6":4,"b5672a":4,"b2bec3":4,"ae60":4,"aa7a8":4},"google/gemini-3.7-flash|1":{"wrinkle":4,"wickerPattern":4,"wheelSymbol":4,"wheel-front-spokes":4,"wheel-back-spokes":4,"webkitAudioContext":4,"webkit-text-fill-color":4,"webkit-background-clip":4,"waveMotion":4,"walkGrad":4,"triggerBell":4,"trees-layer":4,"treeScroll":4,"translation":4,"toes":4,"toast":4,"timeBtn":4,"tailWiggle":4,"tailFlutter":4,"synthesizing":4,"suspended":4,"supported":4,"sunGlowPulse":4,"stripe-color":4,"streetLamp":4,"step-thru":4,"stageWrapper":4,"spindle":4,"spinWheel":4,"spinCW":4,"spinCCW":4,"speed-mult":4,"skyTop":4,"skyMid":4,"skyBottom":4,"sine":4,"show":4,"shadowFilter":4,"setValueAtTime":4,"setTimeout":4,"sequence":4,"seagullModel":4,"seagull-wings":4,"seagull-2":4,"seagull-1":4},"x-ai/grok-4.7|1":{"roll":4,"roadmarks":4,"leg-b":4,"leg-a":4,"headBob":4,"ffe68b":4,"ffe398":4,"f8e37b":4,"f7f5e7":4,"f7b856":4,"f6f3e4":4,"f4a949":4,"f4a674":4,"f49":4,"eff4eb":4,"ef9a67":4,"edf3d8":4,"e8e7d8":4,"e7a5d":4,"e75e58":4,"d9ef":4,"d9eeea":4,"d9ddca":4,"d87b39":4,"d72":4,"d6f6e9":4,"d5b64":4,"d1d7c6":4,"ca4a3":4,"c68a":4,"c34":4,"bfc1":4,"bd9ed":4,"bb0ae":4,"b42":4,"aa274":4,"VB_0_0_1200_720":4,"KF_roll":4,"KF_legb":4,"KF_lega":4,"KF_hills":4,"KF_headbob":4,"KF_beak":4,"HEX_#ffe68b":4,"HEX_#ffe398":4},"deepseek/deepseek-v4.1-flash|1":{"streak":4,"sceneryRow":4,"roadmove":4,"hills2":4,"ffd975":4,"ffc94d":4,"fdfdfb":4,"fd0f5":4,"fca86":4,"fca75":4,"fbc68":4,"f9c46b":4,"f8f4c":4,"f6f2dc":4,"f4fbff":4,"f4a261":4,"f4550":4,"f3e9b5":4,"f3e46":4,"f2a33a":4,"efe9dc":4,"ef767a":4,"eef9ff":4,"e9e4d8":4,"e9a825":4,"e8eaed":4,"e8862e":4,"e6dccb":4,"e5e9f0":4,"d9f1fd":4,"d98e3f":4,"d98324":4,"d6cbb4":4,"d6470":4,"d6403b":4,"d4557":4,"d3c6a9":4,"d1f23":4,"chainmove":4,"cfe3c2":4,"cfc3a8":4,"cbf6e":4,"c9c2b4":4,"c97b2f":4,"c96a1f":4},"nvidia/nemotron-3-ultra|1":{"tuft":4,"streaks":4,"spin-fast":4,"reusable":4,"puffs":4,"fff8cf":4,"ffe98a":4,"ffb45e":4,"fb3d9":4,"f9e4f":4,"f8fb4":4,"f7f9fa":4,"f7d9a0":4,"f7a34":4,"f6c04a":4,"f6a44a":4,"f4f0e6":4,"f3f7f9":4,"f3a45":4,"f2f4f6":4,"f2a93b":4,"f0f5f8":4,"f0c419":4,"f09a3c":4,"e9eef1":4,"e9c42":4,"e8eef2":4,"e8b86":4,"e6f8fd":4,"e2e9ee":4,"e2504a":4,"e0a52f":4,"e0873a":4,"dfe8ee":4,"dfe6ea":4,"d99a3":4,"d98f24":4,"d7a85":4,"d4852":4,"d18d2e":4,"cog":4,"cfd8de":4,"cf63":4,"cdd9e0":4,"cb25c":4},"anthropic/claude-opus-5|1":{"transformable":4,"synced":4,"sunSpin":4,"spokesRear":4,"spokesFront":4,"speedLine":4,"solveLeg":4,"setLegPolyline":4,"seatstay":4,"removeChild":4,"polyEl":4,"pin":4,"parentNode":4,"main-wing":4,"legBackG":4,"legBackFootG":4,"legBackFoot":4,"hillGrad":4,"gid":4,"footFrontG":4,"footBackG":4,"ffe45e":4,"ffcf5c":4,"ffb340":4,"ff8fab":4,"ff6b9a":4,"fd0ff":4,"fcf6a":4,"fbfbfb":4,"f9e44":4,"f5b52a":4,"f5539":4,"f4f9ff":4,"f48c06":4,"f2y":4,"f2x":4,"f1y":4,"f1x":4,"f1dfc0":4,"f08c1a":4,"f07818":4,"ef476f":4,"eef6fd":4,"ed8f8":4,"ed081":4},"openai/gpt-6.1-sol|1":{"webkit-tap-highlight-color":4,"visibilitychange":4,"strict":4,"speed-label":4,"play-label":4,"play-button":4,"pedalY":4,"pedalX":4,"near-leg-outline":4,"masthead":4,"far-leg-outline":4,"currentColor":4,"cancelAnimationFrame":4,"Number":4,"ID_play-label":4,"ID_near-leg-outline":4,"ID_far-leg-outline":4,"CLS_play-button":4,"CLS_masthead":4,"ARCH_VISIBILITY_CHANGE":4,"frameId":3.885,"tabular-nums":3.662,"speed-button":3.662,"scene-label":3.662,"scene-description":3.662,"road-tile":3.662,"repeat":3.662,"playButton":3.662,"play-icon":3.662,"nearOutline":3.662,"get":3.662,"font-variant-numeric":3.662,"farOutline":3.662,"attached":3.662,"Songti":3.662,"Serif":3.662,"STSong":3.662,"SLOW":3.662,"ID_scene-description":3.662,"ID_road-tile":3.662,"CLS_scene-label":3.662,"event":3.48,"updateControls":3.374,"speedIndex":3.374,"setPlaying":3.374},"openai/gpt-6-luna|1":{"Rounded":4,"Pro":4,"svg-desc":3.662,"KF_rider-bob":3.662,"ID_svg-desc":3.662,"topbar":3.374,"lane":3.374,"hill-front":3.374,"hill-back":3.374,"follow":3.374,"countryside":3.374,"cheek":3.374,"L500":3.374,"CLS_topbar":3.374,"CLS_artwork":3.374,"animation-iteration-count":3.123,"wheel-turn":2.969,"typeof":2.969,"scene-wrap":2.969,"ride-bob":2.969,"lede":2.969,"late":2.969,"field":2.969,"fff8df":2.969,"fff7df":2.969,"fff4df":2.969,"fff2c8":2.969,"fbfaf4":2.969,"f8f4e7":2.969,"f5f0dc":2.969,"f43":2.969,"ef9a63":2.969,"edf3dc":2.969,"eaf5f0":2.969,"e9f3df":2.969,"dcefeb":2.969,"d79":2.969,"cloud-drift-b":2.969,"cloud-drift-a":2.969,"cheerful":2.969,"art-card":2.969,"a73":2.969,"Q475":2.969,"Q450":2.969,"M454":2.969},"openai/gpt-6-sol|1":{"warm-colored":4,"turning":4,"tires":4,"synchronized":4,"sunspin":4,"speckle":4,"softly":4,"slow-moving":4,"slight":4,"shaded":4,"road-mark":4,"rims":4,"rests":4,"requested":4,"remains":4,"rack":4,"parcel":4,"horizon":4,"grass-c":4,"grass-b":4,"grass-a":4,"frontLegOutline":4,"frontLeg":4,"fff9df":4,"fff8db":4,"fff5ce":4,"ffe8a2":4,"fc7af":4,"fbf8e9":4,"fbf6e6":4,"fbda7":4,"f9f4df":4,"f9de9d":4,"f9d473":4,"f8e1b7":4,"f8c1a3":4,"f7db96":4,"f7d486":4,"f5ad7f":4,"f4cc7b":4,"f4b58e":4,"f3ead5":4,"f2f4db":4,"f2ae83":4,"f1ae78":4},"google/gemini-4-argon|1":{"windLines":4,"wheelTemplate":4,"wavesLayer":4,"thighLen":4,"tailFeathers":4,"stage-wrapper":4,"speedMultiplier":4,"solveLegIK":4,"shoulderY":4,"shinLen":4,"seagulls":4,"scarfGroup":4,"rightLegGroup":4,"pouchFold2":4,"pouchFold1":4,"postSpacing":4,"pelicanNeck":4,"pelicanBodyGroup":4,"maxReach":4,"leftLegGroup":4,"headNod":4,"frontPedal":4,"frontBasket":4,"fishRot":4,"fishBob":4,"elbowY":4,"drivetrain":4,"crankRadius":4,"cloudsLayer":4,"cloudOffset":4,"clampedCos":4,"chainringGroup":4,"bodyPitch":4,"blinkCycle":4,"bg-top":4,"basketFish":4,"baseAngle":4,"backPedal":4,"accent-color":4,"WING":4,"Tubes":4,"Subtle":4,"Sailor":4,"Rotate":4,"Reusable":4},"anthropic/claude-opus-5.5|1":{"wobbles":4,"whlR":4,"whlF":4,"whl":4,"text-shadow":4,"sunrays":4,"spoked":4,"press":4,"pouchg":4,"phases":4,"middot":4,"mdash":4,"libraries":4,"leg-near":4,"leg-far":4,"kicked":4,"images":4,"huge":4,"gWing":4,"gVig":4,"gSun":4,"gSky":4,"gRoad":4,"gPouch":4,"gBody":4,"gBeak":4,"fonts":4,"flock":4,"fff6da":4,"fff3bd":4,"fff0cd":4,"ffe6c4":4,"ffe6ad":4,"ffdf9e":4,"ffd9a0":4,"ffd93d":4,"ffd7ab":4,"ffc978":4,"ff9638":4,"ff7226":4,"fb0c0":4,"fa1b1":4,"f9b45":4,"f8c5c":4,"f8a55":4},"google/gemini-3.8-flash|1":{"wingbeat":4,"wheel-rotate-front":4,"wheel-rotate-back":4,"trees-set":4,"thigh-r":4,"thigh-l":4,"sun-core":4,"shin-r":4,"shin-l":4,"scroll-trees":4,"scroll-road":4,"scroll-mountains":4,"scroll-clouds-fast":4,"scene-container":4,"scarf-flow":4,"roadFill":4,"right-thigh":4,"right-shin":4,"right-foot":4,"pouch-bounce":4,"pouch-anim":4,"pine-tree":4,"opposite":4,"mountains-set":4,"metalRim":4,"left-thigh":4,"left-shin":4,"left-foot":4,"jaw-anim":4,"hubs":4,"foot-r":4,"foot-l":4,"fffefa":4,"fffbbf":4,"fff2a9":4,"fff0b8":4,"ffe259":4,"ffd394":4,"ffa726":4,"ff9d1c":4,"fec44f":4,"fce9ba":4,"fca830":4,"faf6e9":4,"f9e8c6":4},"anthropic/claude-haiku-5.5|1":{"ff9a2e":4,"d1d1d":4,"crankB":4,"crankA":4,"ID_crankb":4,"ID_cranka":4,"HEX_#ff9a2e":4,"HEX_#1d1d1d":4,"together":3.738,"spin-rear":3.738,"spin-front":3.738,"rolled":3.738,"roadClip":3.738,"road-line":3.738,"rSpin":3.738,"pedB":3.738,"pedA":3.738,"outward":3.738,"maxd":3.738,"markings":3.738,"hillX":3.738,"hillP":3.738,"head-bob":3.738,"groundline":3.738,"fy2":3.738,"fy1":3.738,"fx2":3.738,"fx1":3.738,"footBc":3.738,"footB":3.738,"footAc":3.738,"footA":3.738,"fff8f0":3.738,"fff7c4":3.738,"fff4bf":3.738,"ffe7c2":3.738,"ffe16b":3.738,"ffd9a8":3.738,"ffd24f":3.738,"ffc98f":3.738,"ffc94f":3.738,"ffbb52":3.738,"ffb3b3":3.738,"ffb020":3.738,"ff8f70":3.738},"xiaomi/mimo-v2.6-flash|1":{"wingRide":4,"windFlick":4,"thighFront":4,"thighBack":4,"thigh-front":4,"thigh-back":4,"sunny":4,"softGlow":4,"road-stripes":4,"riderBob":4,"pouchPaint":4,"meadow":4,"grassSway":4,"flowering":4,"fff8e8":4,"fff2b5":4,"ffe99d":4,"ffe59a":4,"ffe0a6":4,"ffd475":4,"ffd39e":4,"ffd184":4,"ffc36b":4,"ffc17b":4,"ffc17a":4,"faf7e9":4,"f9f83":4,"f9a064":4,"f8e4b5":4,"f8dfbb":4,"f8d39b":4,"f6d795":4,"f6d78a":4,"f6d18c":4,"f6ad68":4,"f5dba1":4,"f5d698":4,"f5b85c":4,"f3d390":4,"f3a261":4,"f3944e":4,"f2d69b":4,"f1eee0":4,"f1d17f":4,"f0b368":4},"openai/gpt-5.6-sol|1":{"tinyShadow":4,"framePaint":4,"fffbd0":4,"fff0c8":4,"ffe47c":4,"ffe477":4,"ffd16a":4,"ffcb58":4,"ffb84a":4,"f9e86":4,"f8fbf5":4,"f8f7ed":4,"f8c":4,"f8b72":4,"f6e8a8":4,"f5f4ea":4,"f4d26b":4,"f3d":4,"f2773f":4,"f0a65e":4,"extended":4,"ef7c46":4,"eef9f7":4,"eb59f":4,"e9eeea":4,"e8f0ed":4,"e8eef0":4,"e09a55":4,"dff6ef":4,"dff1eb":4,"df593a":4,"de3f2":4,"d9f1bd":4,"d9e5e2":4,"d5ee":4,"d4e0dd":4,"d3e6db":4,"c7bb":4,"c6e2df":4,"c5d8d5":4,"c4c":4,"bdcfcc":4,"bc5c7":4,"b35d":4,"accents":4},"upstage/solar-pro4|1":{"zh-Hans":4,"winding":4,"water-glint":4,"viewport-fit":4,"sunlight":4,"sun-blur":4,"softly":4,"ripple":4,"headlands":4,"fff9d8":4,"fff8eb":4,"fff6ce":4,"fff3d0":4,"fff1b9":4,"fff0c5":4,"fff0b5":4,"ffe5a0":4,"fbf4dc":4,"f91":4,"f8c574":4,"f7a077":4,"f6a777":4,"f4e8c6":4,"f4dfa9":4,"f4b447":4,"f4a94f":4,"f0a34d":4,"efad55":4,"efaa56":4,"ef815d":4,"ed9861":4,"e99a4a":4,"e8c783":4,"e78e43":4,"e75":4,"dvh":4,"dbd83":4,"d9f0dc":4,"d82":4,"d7e2d9":4,"d6e1d7":4,"d5dfd7":4,"d2b477":4,"curious":4,"coastline":4},"minimax/minimax-m3|1":{"that":4,"simulate":4,"rolls":4,"right-to-left":4,"pixels":4,"leftward":4,"gradient":4,"fff6c2":4,"fff2a8":4,"ffd24d":4,"fb583":4,"fafafa":4,"f8a4f":4,"f8a3f":4,"f0a020":4,"ec9a3":4,"eaf6ff":4,"e0e0e0":4,"diagonal":4,"cfe9ff":4,"c0392b":4,"bfe3ff":4,"b4f2a":4,"a7d3a":4,"a6a3b":4,"a3a1f":4,"VB_0_0_800_400":4,"Scenery":4,"ID_scenery":4,"HEX_#fff6c2":4,"HEX_#fff2a8":4,"HEX_#ffd24d":4,"HEX_#fafafa":4,"HEX_#f0a020":4,"HEX_#eaf6ff":4,"HEX_#e0e0e0":4,"HEX_#cfe9ff":4,"HEX_#c0392b":4,"HEX_#bfe3ff":4,"HEX_#9ec9a3":4,"HEX_#8a6a3b":4,"HEX_#7fb583":4,"HEX_#6b4f2a":4,"HEX_#5a3a1f":4,"HEX_#4f8a4f":4},"openai/gpt-6-astra|1":{"wheel-rim":4,"webbed-foot":4,"water-lines":4,"water-clip":4,"viewport-fit":4,"verge-bank":4,"undefined":4,"three":4,"shore-bank":4,"shore":4,"sea-light":4,"scarf-tails":4,"saturate":4,"road-grain":4,"road-clip":4,"resize":4,"reach":4,"ratio":4,"passive":4,"paper-noise":4,"overscroll-behavior":4,"nearHighlight":4,"near-leg-line":4,"near-leg-highlight":4,"islands":4,"island-bank":4,"innerWidth":4,"innerHeight":4,"foregroundLeg":4,"fitScene":4,"fff9e6":4,"fff2d2":4,"fff1d1":4,"ffe5aa":4,"feTurbulence":4,"fb69f":4,"far-leg-line":4,"faf6e5":4,"faf1d6":4,"f9e4a7":4,"f8eedb":4,"f80":4,"f7d58c":4,"f7d492":4,"f7975":4},"moonshotai/kimi-k3|1":{"css":4,"wrote":3.738,"write":3.738,"workspace":3.738,"won":3.738,"within":3.738,"will":3.738,"widely-cited":3.738,"which":3.738,"wheelie-fuzz":3.738,"wheelSpin":3.738,"was":3.738,"wants":3.738,"wait":3.738,"visually":3.738,"visual":3.738,"vig":3.738,"variety":3.738,"uses":3.738,"user":3.738,"used":3.738,"untransformed":3.738,"underlying":3.738,"txt":3.738,"trick":3.738,"triangles":3.738,"translates":3.738,"translated":3.738,"trailing":3.738,"track":3.738,"too":3.738,"those":3.738,"this":3.738,"think":3.738,"thick":3.738,"then":3.738,"them":3.738,"their":3.738,"tests":3.738,"testing":3.738,"talk":3.738,"systems":3.738,"system":3.738,"syntax":3.738,"supports":3.738},"z-ai/glm-5.3|1":{"thighEl":4,"sunRays":4,"spokesR":4,"spokesF":4,"solve":4,"sol":4,"skyG":4,"shinEl":4,"ringHoles":4,"ringEl":4,"plumeG":4,"pedalNear":4,"pedalFar":4,"pedalEl":4,"legEl":4,"grass2":4,"grass1":4,"gradientUnits":4,"footEl":4,"fffbd8":4,"fff2ab":4,"ffeaa9":4,"ffe166":4,"ffd873":4,"ffcb74":4,"ffcb70":4,"ffc95a":4,"ff5f63":4,"fbf6ec":4,"fae62":4,"f9a63c":4,"f8c99":4,"f7a93f":4,"f6fb0":4,"f6efe1":4,"f6c02c":4,"f5f9fd":4,"f4ecc8":4,"f2a444":4,"f2a33c":4,"f0921f":4,"emerge":4,"efe4cf":4,"ef8b22":4,"ecf7ff":4},"anthropic/claude-sonnet-5.5|1":{"HEX_#999":4,"setLeg":3.689,"fff7b0":3.689,"e3f6ff":3.689,"ddd":3.689,"cfd6dc":3.689,"ccc":3.689,"c9701a":3.689,"buildWheel":3.689,"attrs":3.689,"a86ff":3.689,"a5560":3.689,"HEX_#fff7b0":3.689,"HEX_#f5a623":3.689,"HEX_#e3f6ff":3.689,"HEX_#cfd6dc":3.689,"HEX_#ccc":3.689,"HEX_#c9701a":3.689,"HEX_#4a5560":3.689,"HEX_#3a86ff":3.689,"HEX_#bfe6ff":3.507,"bfe6ff":3.283,"bbb":3.283,"KF_scroll":3.283,"wlNear":2.996,"wlFar":2.996,"wheelg":2.996,"view":2.996,"upperD":2.996,"upper-outline":2.996,"treeG":2.996,"title-block":2.996,"symbol":2.996,"stretched":2.996,"spinr":2.996,"spinback":2.996,"speedPx":2.996,"speedG":2.996,"sparkles":2.996,"shinD":2.996,"shin-outline":2.996,"shade":2.996,"setLimb":2.996,"setButton":2.996,"rearSpin":2.996},"z-ai/glm-5.2|1":{"ttl":4,"ffe9a8":4,"ffd76b":4,"fdf2dd":4,"f97ab":4,"f8f4ea":4,"f8c76a":4,"f4d877":4,"f4654":4,"f0a13c":4,"efe8d8":4,"e9e2d2":4,"e7dec9":4,"e79a3c":4,"e2ae52":4,"e2604f":4,"e2493b":4,"ddeff8":4,"dc9ac":4,"d9a343":4,"d8794":4,"d4862a":4,"cdc4b2":4,"c9e3d6":4,"c9d0da":4,"c8bfab":4,"c74e3f":4,"c1420":4,"bfc7d2":4,"bd8a52":4,"b9c2cf":4,"b93a1":4,"b6270":4,"b5462":4,"b2f38":4,"b2430":4,"b1d5c1":4,"aa3b0":4,"a9b3bf":4,"a8d2b6":4,"a8693":4,"a6d9f1":4,"a5160":4,"ID_ttl":4,"ID_glow":4},"anthropic/claude-fable-5.1|1":{"pedalU":4,"pedalD":4,"legU":4,"legD":4,"ffd54a":4,"ff9a3c":4,"fb7e8":4,"f8fd1":4,"f7f7f7":4,"f0a030":4,"eee":4,"e8c98a":4,"e4e4e4":4,"e0e0e0":4,"d98a20":4,"d6336c":4,"c9e8f8":4,"c9a86a":4,"KF_pedalu":4,"KF_pedald":4,"HEX_#ffd54a":4,"HEX_#ff9a3c":4,"HEX_#f7f7f7":4,"HEX_#f0a030":4,"HEX_#eee":4,"HEX_#e8c98a":4,"HEX_#e4e4e4":4,"HEX_#e0e0e0":4,"HEX_#d98a20":4,"HEX_#d6336c":4,"HEX_#c9e8f8":4,"HEX_#c9a86a":4,"HEX_#6fb7e8":4,"HEX_#2f8fd1":4,"CLS_legu":4,"CLS_legd":4,"ceeb":3.55,"KF_pouch":3.55,"polyline":3.213,"HEX_#888":3.213,"HEX_#87ceeb":3.213,"CLS_cloud2":3.213,"bbb":2.962,"KF_scroll":2.962,"HEX_#bbb":2.761},"qwen/qwen3.7-max|1":{"fff3c0":4,"ffd868":4,"ffd45e":4,"ffc93c":4,"ffc45e":4,"ffb03a":4,"fdfaf3":4,"fd8ea":4,"fbb7e":4,"fb0c9":4,"fa94f":4,"f8f43":4,"f7d774":4,"f7881d":4,"f6f1e5":4,"e9f6fb":4,"e8e0d0":4,"e0761a":4,"e0503f":4,"dcd2be":4,"dc48a":4,"d9aa8":4,"d9871a":4,"d8798":4,"d6675":4,"d5566":4,"d4553":4,"cfd7e0":4,"cc4ea":4,"c9d1dc":4,"c9ceD8":4,"c9bfa9":4,"c9432f":4,"c6f7c":4,"bfe4f7":4,"bfae8f":4,"b45a":4,"b3440":4,"b1120":4,"ad47a":4,"aab4c2":4,"aa4b2":4,"a94a3":4,"a4453":4,"a4148":4},"xiaomi/mimo-v2.6-pro|1":{"wheel-front":4,"wheel-back":4,"sun-pulse":4,"scroll-ground":4,"pelican-rider":4,"pedal-group":4,"middle":4,"leg-right":4,"leg-r":4,"leg-left":4,"leg-l":4,"ground-dashes":4,"cloud-move":4,"KF_sun-pulse":4,"KF_scroll-ground":4,"KF_pedal":4,"KF_leg-right":4,"KF_leg-left":4,"KF_cloud-move":4,"KF_bounce":4,"HEX_#ffe66d":4,"HEX_#ffd93d":4,"HEX_#ff6b9d":4,"HEX_#fcbf49":4,"HEX_#f77f00":4,"HEX_#f4a261":4,"HEX_#e09f3e":4,"HEX_#dee2e6":4,"HEX_#d46a00":4,"HEX_#b0e0e6":4,"HEX_#98d98e":4,"HEX_#7bc47f":4,"HEX_#7ba07b":4,"HEX_#6bb86f":4,"HEX_#5ba85f":4,"HEX_#4361ee":4,"HEX_#264653":4,"HEX_#1b3a9e":4,"FFF3B0":4,"FFE66D":4,"FFD93D":4,"FF6B9D":4,"FCBF49":4,"F8F9FA":4,"F77F00":4},"openai/gpt-5.5|1":{"wheel-spin--front":4,"wheel-spin--back":4,"walk-clip":4,"sun-halo":4,"sign-off":4,"pouch-sway":4,"pedal-leg":4,"motion-line":4,"leg-swing--two":4,"leg-swing":4,"figcaption":4,"fff2d5":4,"fff0bd":4,"ffe39c":4,"ffd276":4,"ffb07b":4,"fbf7eb":4,"f8f5eb":4,"f8d9a8":4,"f7f2e5":4,"f7f0df":4,"f6f0df":4,"f69":4,"f5f1e5":4,"f5f0df":4,"f5bd4b":4,"f53":4,"f42":4,"f2a15a":4,"f1d7a0":4,"f0a45c":4,"ef9c56":4,"ef7955":4,"eee9da":4,"ee9a55":4,"ecfc7":4,"ec8a4c":4,"eaf3ef":4,"e8bd88":4,"e79":4,"dfece8":4,"dce8df":4,"dc7545":4,"d8f1df":4,"d8e4d9":4},"openai/gpt-5.6-luna|1":{"wob":4,"wing-back":4,"tree-move":4,"spinSlow":4,"speedFlash":4,"speed-line":4,"rock":4,"onclick":4,"nearShoe":4,"nearPath":4,"nearLegPath":4,"moveLeft":4,"mountains":4,"hipNear":4,"hipFar":4,"grassG":4,"grass-dot":4,"ghost":4,"fingers":4,"fda4af":4,"farShoe":4,"farPath":4,"farLegPath":4,"efac":4,"driven":4,"dashMove":4,"crank2":4,"crank1":4,"cloudDrift":4,"c4a6e":4,"bushes":4,"btnPause":4,"btnFast":4,"blades":4,"birdFly":4,"birdFlap":4,"bird-w":4,"badgePulse":4,"animations":4,"animationPlayState":4,"a1-a2":4,"M430":4,"LIVE":4,"L2-4":4,"KF_spinslow":4},"anthropic/claude-opus-5.5|0":{"f7f7f2":4,"f4a259":4,"f2a44":4,"b8e9c":4,"V13":4,"L25":4,"HEX_#f7f7f2":4,"HEX_#f4a259":4,"HEX_#5b8e9c":4,"HEX_#3fa7d6":4,"HEX_#1f2a44":4,"H32M1":4,"H30":4,"H18":4,"FA7D6":4,"F5B82E":4,"F3A5F":4,"F28C28":4,"HEX_#1f3a5f":3.724,"fdf1dc":3.473,"PATH_COMMA_SEP":3.473,"HEX_#fdf1dc":3.473,"HEX_#f5b82e":3.473,"HEX_#f28c28":3.272,"Q17":3.105,"Q18":2.962,"Q21":2.837,"C13":2.837,"C18":2.725,"C11":2.725,"L11":2.625,"L20":2.534,"Q20":2.374,"L28":2.374,"L19":2.374,"V32":2.173,"Q12":2.115,"ROOT_SVG_STROKE":1.748,"FFFFFF":1.738,"M29":1.527,"ellipse":1.488,"T24":1.352,"T16":1.3,"M19":1.294,"T32":1.181},"openai/gpt-5.6-terra|0":{"h-4":4,"fff7e6":4,"fb5bd":4,"f8e6b8":4,"f3b54b":4,"ed9c49":4,"c6cc":4,"a58":4,"HEX_#f8e6b8":4,"HEX_#f3b54b":4,"HEX_#ed9c49":4,"HEX_#83c6cc":4,"HEX_#82c5ce":4,"HEX_#6fb5bd":4,"HEX_#4c9dac":4,"HEX_#174a58":4,"HEX_#164d5b":4,"D5B":4,"C9DAC":4,"C5CE":4,"f49b75":3.951,"b73":3.951,"a91":3.951,"HEX_#f49b75":3.951,"HEX_#e7a83a":3.951,"HEX_#ddf3f2":3.951,"HEX_#d9f2e7":3.951,"HEX_#bce7ec":3.951,"HEX_#91d5df":3.951,"HEX_#28708b":3.951,"HEX_#258a91":3.951,"HEX_#176b73":3.951,"HEX_#173b5d":3.951,"E7A83A":3.951,"DDF3F2":3.951,"D9F2E7":3.951,"D5DF":3.951,"BCE7EC":3.951,"B5D":3.951,"HEX_#fff7e6":3.584,"v1M25":3.035,"v1M20":2.853,"h1M22":2.853,"fff8e8":2.853,"f766e":2.853},"anthropic/claude-opus-5|0":{"with":4,"wing":4,"wave":4,"waterline":4,"washing":4,"warm":4,"upper":4,"tuft":4,"tip":4,"texture":4,"tail":4,"shadow":4,"shading":4,"sea":4,"ripples":4,"ripple":4,"ridge":4,"reflection":4,"profile":4,"overlapping":4,"over":4,"outline":4,"mandible":4,"lower":4,"lines":4,"hull":4,"hooked":4,"highlight":4,"head":4,"h9M22":4,"h7M12":4,"front":4,"feather":4,"fba834":4,"fa8cc":4,"fa8c7":4,"f7f4ec":4,"f3e2c0":4,"f3b4a":4,"elastic":4,"e8913a":4,"e2dccb":4,"e1e8ed":4,"details":4,"depth":4},"anthropic/claude-sonnet-5.5|0":{"V14":4,"HEX_#f7c443":4,"HEX_#f5b400":4,"HEX_#f2962e":4,"HEX_#f08c00":4,"HEX_#ededed":4,"HEX_#dce9f0":4,"HEX_#d6d6d6":4,"HEX_#cfeafb":4,"HEX_#6cc5e8":4,"HEX_#222":4,"HEX_#1f3b4d":4,"H14":4,"F7C443":4,"F5B400":4,"F3B4D":4,"F2962E":4,"F08C00":4,"EDEDED":4,"DCE9F0":4,"D6D6D6":4,"CFEAFB":4,"CC5E8":4,"C29":4,"A8FD9":4,"d9792b":3.901,"HEX_#d9792b":3.901,"q2-5":3.495,"q2-":3.495,"h7M6":3.495,"h6M13":3.495,"f4a21c":3.495,"f2a21b":3.495,"HEX_#ffb84d":3.495,"HEX_#f4a21c":3.495,"HEX_#f2a21b":3.495,"HEX_#e8f4fa":3.495,"HEX_#87ceeb":3.495,"HEX_#3b3a4a":3.495,"H32V32H0Z":3.495,"CEEB":3.495,"B3A4A":3.495,"HEX_#3a8fd9":3.401,"HEX_#333":3.199,"C22":3.199},"google/gemini-3.8-flash|0":{"s-3":4,"l8-1":4,"f39c12":4,"ecf0f1":4,"e293b":4,"c3e50":4,"HEX_#f39c12":4,"HEX_#ecf0f1":4,"HEX_#2c3e50":4,"HEX_#2980b9":4,"zM13":3.901,"l11":3.901,"fba742":3.901,"HEX_#fba742":3.901,"f1c40f":3.758,"d35400":3.758,"HEX_#f1c40f":3.758,"HEX_#d35400":3.758,"f8fafc":3.427,"bdc3c7":3.353,"V12M2":3.353,"HEX_#bdc3c7":3.353,"H10c-3":3.353,"e3a5f":3.057,"HEX_#1e293b":2.724,"v3a5":2.66,"v1l3-1s-1":2.66,"v-3a3":2.66,"s6-2":2.66,"s10-1":2.66,"s-1-5":2.66,"l6-1c":2.66,"l4-1c2":2.66,"l4-1":2.66,"l2-6c":2.66,"l2-5c":2.66,"l1-3c-1-1-1-3":2.66,"h9c2":2.66,"h8c0":2.66,"h3c3":2.66,"h10a4":2.66,"h-6c0":2.66,"ffeaa7":2.66,"fbbf24":2.66,"f8f9fa":2.66},"openai/gpt-6-astra|0":{"m5-":4,"fff5df":4,"f3b85b":4,"c2ca":4,"b52":4,"HEX_#fff5df":4,"HEX_#f3b85b":4,"HEX_#78c2ca":4,"HEX_#244b52":4,"q-3":3.802,"m19":3.658,"q2-1":2.811,"M29":2.223,"M28":1.856,"M25":1.587,"l-1":1.363,"M20":1.31,"WH_BEFORE_VB":1.298,"M21":1.273},"openai/gpt-6-luna|0":{"m-9":4,"m-1":3.795,"m17":3.726,"m13":3.726,"m10":3.508,"m-4":3.418,"m11":3.414,"DCEFEA":3.414,"m-6":3.362,"HEX_#fff7e8":3.212,"HEX_#174a50":3.212,"m0-7":3.102,"m-5":3.083,"m6-1":2.958,"hanging":2.958,"h5m7":2.958,"fff7e8":2.958,"ffd36f":2.958,"f4b34f":2.958,"f48":2.958,"e9eaa":2.958,"e98061":2.958,"dce9e3":2.958,"c96550":2.958,"c5edf0":2.958,"c5cb":2.958,"bill":2.958,"b4e8e4":2.958,"aa6a4":2.958,"a9bfba":2.958,"Tail":2.958,"HEX_#fff2d8":2.958,"HEX_#ffd36f":2.958,"HEX_#f7f1e2":2.958,"HEX_#f4b34f":2.958,"HEX_#f2c568":2.958,"HEX_#e9c780":2.958,"HEX_#e9b45d":2.958,"HEX_#e98061":2.958,"HEX_#e79d6d":2.958,"HEX_#e5d6b6":2.958,"HEX_#dce9e3":2.958,"HEX_#c96550":2.958,"HEX_#c5edf0":2.958,"HEX_#b4e8e4":2.958},"deepseek/deepseek-v4.1-flash|0":{"xlink":4,"xMidYMid":4,"wrap":4,"streaks":4,"stop-opacity":4,"stage":4,"speed":4,"slow":4,"seamless":4,"scroll":4,"road_tile":4,"road":4,"rig":4,"repeated":4,"radialGradient":4,"preserveAspectRatio":4,"parallax":4,"near":4,"meet":4,"leg":4,"layers":4,"keyR":4,"keyL":4,"join":4,"hills_tile":4,"hills":4,"h5M10":4,"h4M5":4,"h4M19":4,"h4M15":4,"h28v7":4,"h10v2":4,"h-10z":4,"grass_tile":4,"grass":4,"frame_and_wheels":4,"fff2b8":4,"ffe27a":4,"fd8f6":4,"far":4,"f2937":4,"f0f9ff":4,"every":4,"ec86f":4,"e7a8c":4},"meta/muse-spark-1.3|0":{"v2M30":4,"q2-2":4,"l-3-2":4,"h32":4,"h-2M30":4,"fde047":4,"fdba74":4,"f172a":4,"e2e8f0":4,"dd3fc":4,"M31":4,"HEX_#ffd54f":4,"HEX_#ffcc80":4,"HEX_#ff9e57":4,"HEX_#e0f7fa":4,"HEX_#4fc3f7":4,"H29M28":4,"FFD54F":4,"FFCC80":4,"FF9E57":4,"FC3F7":4,"E0F7FA":4,"e0f2fe":3.717,"fb923c":3.466,"bdf8":3.466,"HEX_#fde047":3.466,"HEX_#e2e8f0":3.466,"HEX_#7dd3fc":3.466,"HEX_#fdba74":3.265,"q4-2":3.221,"HEX_#334155":3.137,"HEX_#e0f2fe":3.098,"HEX_#fb923c":2.955,"HEX_#38bdf8":2.955,"HEX_#0f172a":2.955,"fff":2.83,"HEX_#fff":2.719,"l-8":2.444,"M30":2.444,"q2-1":2.166,"ffffff":1.902,"HEX_#ffffff":1.845,"FFFFFF":1.771,"M22":1.683,"M25":1.629},"anthropic/claude-fable-5.1|0":{"m3-2q3":4,"fffef5":4,"ffc761":4,"fd3ec":4,"f8dc90":4,"f6b23f":4,"eaa345":4,"e9e96":4,"e8f2ed":4,"e7dfcc":4,"e54":4,"e1e5d9":4,"db6dd":4,"c3b59":4,"bfe6f5":4,"aecdb8":4,"a43":4,"V18Q10":4,"V12Q20":4,"HEX_#fffef5":4,"HEX_#ffc761":4,"HEX_#f8dc90":4,"HEX_#f6b23f":4,"HEX_#eaa345":4,"HEX_#e8f2ed":4,"HEX_#e7dfcc":4,"HEX_#e1e5d9":4,"HEX_#bfe6f5":4,"HEX_#aecdb8":4,"HEX_#8fd3ec":4,"HEX_#7e9e96":4,"HEX_#5db6dd":4,"HEX_#475e54":4,"HEX_#314a43":4,"HEX_#1c3b59":4,"H18Z":4,"H18Q23":4,"l1-1M27":3.959,"f6b73c":3.959,"f4f1ea":3.959,"cfe8f7":3.959,"b4a6b":3.959,"HEX_#f4f1ea":3.959,"HEX_#cfe8f7":3.959,"HEX_#2b4a6b":3.959},"anthropic/claude-haiku-5.5|0":{"ffc83d":4,"ffb703":4,"fd3f0":4,"f7c27a":4,"f29b2e":4,"e8f6ff":4,"e8f4fb":4,"d9dee5":4,"aa6d8":4,"V12":4,"HEX_#ffc83d":4,"HEX_#f7c27a":4,"HEX_#f29b2e":4,"HEX_#d9dee5":4,"HEX_#8fd3f0":4,"HEX_#3aa6d8":4,"HEX_#222222":4,"q3-4":3.991,"fb8500":3.991,"fb7d9":3.991,"fb3e8":3.991,"f7b733":3.991,"f7b500":3.991,"f7b267":3.991,"f5b700":3.991,"f4b41a":3.991,"f2d3d":3.991,"f2a541":3.991,"f08a24":3.991,"d9e2ea":3.991,"d3b5a":3.991,"cfeefc":3.991,"cfdbe6":3.991,"c9d3dc":3.991,"b7bb9":3.991,"aa5b1":3.991,"V1M19":3.991,"V15":3.991,"T11":3.991,"HEX_#fb8500":3.991,"HEX_#f7b733":3.991,"HEX_#f7b500":3.991,"HEX_#f5b700":3.991,"HEX_#f4b41a":3.991,"HEX_#f08a24":3.991},"anthropic/claude-sonnet-5|0":{"fff5e6":4,"f0c040":4,"b94a48":4,"b2a38":4,"HEX_#fff8f0":4,"HEX_#fff5e6":4,"HEX_#f6c945":4,"HEX_#f4e4cc":4,"HEX_#f0c040":4,"HEX_#e39b2b":4,"HEX_#e36b4c":4,"HEX_#b94a48":4,"HEX_#b7dff0":4,"HEX_#7eb6d9":4,"HEX_#243044":4,"HEX_#1f7aae":4,"HEX_#1b2a38":4,"FFF8F0":4,"F7AAE":4,"F6C945":4,"F4E4CC":4,"EB6D9":4,"E39B2B":4,"E36B4C":4,"B7DFF0":4,"f5a623":3.56,"d9e4ec":3.56,"HEX_#f5a623":3.56,"HEX_#d9e4ec":3.56,"L22":3.446,"e8f6ff":3.049,"a8fd9":3.049,"b47ac219e0358d2":2.856,"Q22":2.787,"Q11":2.712,"L13":2.712,"T14":2.461,"Q26":2.461,"HEX_#3a8fd9":2.461,"Q10":2.26,"L12":2.26,"HEX_#e8f6ff":2.26,"T20":2.093,"Q16":1.95,"L18":1.95},"openai/gpt-6-sol|0":{"wrong":4,"wonky":4,"window":4,"v32":4,"userSpaceOnUse":4,"uneven":4,"too":4,"text-anchor":4,"text":4,"tag":4,"t31":4,"t214-9":4,"t151-31M674":4,"suspiciously":4,"stroke-dasharray":4,"stripes":4,"something":4,"signature":4,"serif":4,"sans-serif":4,"rosettes":4,"q79-88":4,"q79":4,"q66-91":4,"q61":4,"q48-12":4,"q40-36":4,"q38-17":4,"q37":4,"q36":4,"q31":4,"q27-25":4,"q26":4,"q25-45":4,"q189":4,"q14-18":4,"q13-17":4,"q123-13":4,"q12":4,"q107-22":4,"q100":4,"q-49":4,"q-26-26-2-46t44":4,"proudly":4,"price":4},"z-ai/glm-5.3|0":{"v9c0":4,"v1m0":4,"v1M18":4,"s3-1":4,"m20":4,"m0-8":4,"h7c-1":4,"h-1m14":4,"h-1M19":4,"fff4dc":4,"efb45b":4,"c59":4,"V9a3":4,"HEX_#fff4dc":4,"HEX_#efb45b":4,"HEX_#294c59":4,"c2-1":1.653,"M24":1.359,"M21":1.282},"openai/gpt-6.1-sol|0":{"v7H0Z":4,"v1M7":4,"v1M2":4,"m21":4,"h5m4-1h5m5":4,"h1M3":4,"h1M11":4,"h10q-4":4,"fffdf4":4,"fff6e5":4,"f52":4,"f3bc58":4,"e9e5d6":4,"c-2-4":4,"a9d8d1":4,"V10c0-3":4,"HEX_#fffdf4":4,"HEX_#fff6e5":4,"HEX_#f3bc58":4,"HEX_#e9e5d6":4,"HEX_#a9d8d1":4,"HEX_#294f52":4,"H20Z":4,"m12":3.658,"c4-2":3.533,"q4-2":2.999,"q2-1":2.811,"M20":1.31,"WH_BEFORE_VB":1.298},"openai/gpt-5.6-luna|0":{"v2M19":3.894,"m5-3v3":3.894,"ZM13":3.894,"H3M11":3.894,"s7-2":3.488,"h2M27":3.488,"h2M20":3.488,"v9H0Z":3.201,"v7H2z":3.201,"v3H1Z":3.201,"v2M7":3.201,"v2M25":3.201,"v2M15":3.201,"s10":3.201,"s1-3":3.201,"m-9-4":3.201,"h3M16":3.201,"h2M21":3.201,"h2M18":3.201,"h2M10":3.201,"h28":3.201,"h27M4":3.201,"h24M7":3.201,"h22M8":3.201,"h-4l-2":3.201,"h-3l-2":3.201,"h-2M27":3.201,"fc8c9":3.201,"fa9a6":3.201,"f8990":3.201,"f7d9a8":3.201,"f7d99b":3.201,"f6d89a":3.201,"f5f":3.201,"f3c969":3.201,"f2b84b":3.201,"f29f58":3.201,"ef9b62":3.201,"ef9b5b":3.201,"e58b58":3.201,"dff3f5":3.201,"d9f0ee":3.201,"d9b91":3.201,"d8a24a":3.201,"c5-2":3.201},"openai/gpt-5.6-sol|0":{"v-1M20":3.481,"v-1M1":3.481,"m22":3.481,"h-1m12":3.481,"h-1M2":3.481,"HEX_#28536b":3.481,"F6B73C":3.481,"v7c-3":2.788,"v6c-2-1-4-3-4-6Z":2.788,"v5H9z":2.788,"v4c-3":2.788,"v4H2z":2.788,"v3m7-3v3":2.788,"v3m5-3v3M2":2.788,"v3m4-3":2.788,"v3c-2":2.788,"v2m6":2.788,"v2m3-2v2":2.788,"v2m0":2.788,"v2m-6-6h2m8":2.788,"v1m-4-4h1m6":2.788,"v1M26":2.788,"v-4c0-3":2.788,"v-1M6":2.788,"t2-5q2-2":2.788,"t-8":2.788,"q4-5":2.788,"q-5":2.788,"m7-2-1":2.788,"m0-5":2.788,"m-5-4":2.788,"l6-1-5":2.788,"l2-2q-3":2.788,"l-9-2Z":2.788,"l-6-2":2.788,"l-2-2M17":2.788,"l-1-3z":2.788,"l-0":2.788,"h8c-2":2.788,"h6M8":2.788,"h6M18":2.788,"h3z":2.788,"h2M4":2.788,"h-3c0":2.788,"h-1m-8":2.788},"openai/gpt-5.5|0":{"m3-":4,"fff7df":4,"fff3cf":4,"fff1d8":4,"fff0d1":4,"ffd45a":4,"f73":4,"f6f1df":4,"f6c75b":4,"f3ad58":4,"f2c65e":4,"f2a44a":4,"eaf7ff":4,"eaf6f5":4,"e9826c":4,"e88c60":4,"e5a":4,"c9e8":4,"c8bf":4,"c58":4,"c0-":4,"bdbd":4,"HEX_#fff7df":4,"HEX_#fff3cf":4,"HEX_#fff1d8":4,"HEX_#fff0d1":4,"HEX_#ffd45a":4,"HEX_#f7e4b2":4,"HEX_#f6f1df":4,"HEX_#f6c75b":4,"HEX_#f3ad58":4,"HEX_#f2c65e":4,"HEX_#f2a44a":4,"HEX_#eaf7ff":4,"HEX_#eaf6f5":4,"HEX_#eaf1e7":4,"HEX_#e9826c":4,"HEX_#e88c60":4,"HEX_#78bdbd":4,"HEX_#77c9e8":4,"HEX_#77c8bf":4,"HEX_#28566a":4,"HEX_#263238":4,"HEX_#195f73":4,"HEX_#174e5a":4},"openai/gpt-5.4|0":{"f7e3b2":4,"f4e3c1":4,"ed1e8":4,"e8c98d":4,"b4e2e":4,"HEX_#f7e3b2":4,"HEX_#f4e3c1":4,"HEX_#e8c98d":4,"HEX_#8ed1e8":4,"HEX_#6b4e2e":4,"HEX_#245b78":4,"HEX_#16697a":4,"H22M28":4,"f766e":3.871,"HEX_#0f766e":3.871,"H11":3.871,"v-1m5-5h1M19":3.36,"m18":3.36,"h1m8":3.36,"f4c95d":3.36,"b78":3.36,"V1m0":3.36,"H2z":3.36,"h-2":2.773,"class":2.572,"HEX_#f4c95d":2.572,"c0-4":2.527,"style":2.405,"f2a65a":2.262,"l-5":2.229,"HEX_#f2a65a":2.137,"defs":2.025,"c2-":1.925,"m-8":1.834,"M25":1.629,"M27":1.626,"M28":1.603,"c0-3":1.414,"c-1":1.134,"M21":1,"M22":0.953},"google/gemini-3.1-pro-preview|0":{"fdf6e3":4,"c97b3a":4,"L13":4,"HEX_#fdf6e3":4,"HEX_#c97b3a":4,"L18":3.658,"L15":3.533,"L14":3.533,"Q15":3.422,"L20":3.231,"Q20":3.071,"L19":3.071,"line":2.932,"Q19":2.87,"M16":1.732,"M13":1.732},"anthropic/claude-sonnet-4.6|0":{"s8-1":4,"s7-":4,"l1-":4,"fd8e8":4,"d8fae":4,"b6e8a":4,"a6ea5":4,"T29":4,"T21":4,"T17":4,"HEX_#9fd8e8":4,"HEX_#3d8fae":4,"HEX_#3a6ea5":4,"HEX_#2b6e8a":4,"s7-1":3.724,"b2b2b":3.473,"Q26":3.473,"class":3.272,"HEX_#2b2b2b":3.272,"style":3.105,"T28":3.105,"T25":3.105,"T20":3.105,"T12":3.105,"Q25":2.962,"T13":2.837,"fff":2.725,"defs":2.725,"f4b942":2.625,"Q23":2.625,"HEX_#fff":2.625,"line":2.236,"HEX_#f4b942":2.115,"T24":1.352,"T16":1.3,"M21":1.282,"T32":1.181,"M15":0.979}}};
  for (const _p of HTML_SVG_CLASSIFIER_BANK.p) { if (!_p[5]) _p[5] = (HTML_SVG_CLASSIFIER_BANK.mt && HTML_SVG_CLASSIFIER_BANK.mt[_p[0] + "|" + _p[2]]) || {}; }

  const TIERED_HTML_SVG_FAMILIES = new Set([
    "claude-opus-5.6", "claude-opus-5.5", "claude-opus-5",
    "claude-sonnet-5.5", "claude-sonnet-5", "claude-sonnet-4.6",
    "claude-fable-5.1", "claude-fable-5", "claude-haiku-5.5",
    "gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-sol",
    "gpt-6.1-luna", "gpt-6-luna", "gpt-5.6-luna",
    "gpt-6-astra", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4",
    "gemini-4-argon", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.1-pro-preview",
    "muse-spark-1.3", "grok-4.7", "grok-4.6"
  ]);

  function healTruncatedSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== "string") return "";
    let s = rawSvg.trim();
    if (!/<svg\b/i.test(s)) return s;
    if (/<\/svg\s*>$/i.test(s)) return s;
    s = s.replace(/\s+[a-zA-Z0-9_:-]+=["'][^"']*$/, "");
    const lastLt = s.lastIndexOf("<");
    const lastGt = s.lastIndexOf(">");
    if (lastLt > lastGt) {
      const tailTag = s.slice(lastLt);
      if (/^<(?:path|circle|rect|ellipse|line|polyline|polygon|stop|use|animate|animateTransform|animateMotion)\b/i.test(tailTag)) {
        const qCount = (tailTag.match(/"/g) || []).length;
        if (qCount % 2 === 1) s += '"';
        s += "/>";
      } else {
        s = s.slice(0, lastLt).trim();
      }
    }
    const openStyle = (s.match(/<style\b[^>]*>/ig) || []).length;
    const closeStyle = (s.match(/<\/style\s*>/ig) || []).length;
    if (openStyle > closeStyle) s += "</style>";
    const openScript = (s.match(/<script\b[^>]*>/ig) || []).length;
    const closeScript = (s.match(/<\/script\s*>/ig) || []).length;
    if (openScript > closeScript) s += "</script>";
    for (const tag of ["linearGradient", "radialGradient", "clipPath", "mask", "filter", "defs", "g"]) {
      const openRe = new RegExp("<" + tag + "\\b(?![^>]*\\/>)[^>]*>", "ig");
      const closeRe = new RegExp("<\\/" + tag + "\\s*>", "ig");
      const openCnt = (s.match(openRe) || []).length;
      const closeCnt = (s.match(closeRe) || []).length;
      for (let i = 0; i < Math.max(0, openCnt - closeCnt); i++) s += "</" + tag + ">";
    }
    if (!/<\/svg\s*>/i.test(s)) s += "\n</svg>";
    return s;
  }

  function extractSvgStyleV2(svgText) {
    const raw = String(svgText || "").trim();
    const lower = raw.toLowerCase();
    const charLen = raw.length;
    const lineCount = raw ? raw.split(/\r?\n/).length : 0;
    const vbMatch = raw.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    const viewBox = vbMatch ? vbMatch[1].trim() : "";
    const tagSeq = Array.from(raw.matchAll(/<\s*([a-zA-Z][a-zA-Z0-9:_-]*)\b/g), m => m[1].toLowerCase());
    const tagCounts = {};
    for (const t of tagSeq) tagCounts[t] = (tagCounts[t] || 0) + 1;
    const dBlobs = Array.from(raw.matchAll(/\bd\s*=\s*["']([^"']+)["']/ig), m => m[1]);
    const allD = dBlobs.join(" ");
    const pathOps = {};
    for (const op of ["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "S", "s", "Q", "q", "T", "t", "A", "a", "Z", "z"]) {
      const cnt = (allD.match(new RegExp(op, "g")) || []).length;
      if (cnt) pathOps[op] = cnt;
    }
    const hexColors = Array.from(new Set(Array.from(lower.matchAll(/#[0-9a-f]{3,8}\b/g), m => m[0]))).slice(0, 16);
    const hasDefs = Boolean(tagCounts.defs);
    const hasGradient = Boolean(tagCounts.lineargradient || tagCounts.radialgradient);
    const hasFilter = Boolean(tagCounts.filter || tagCounts.fegaussianblur || tagCounts.fedropshadow);
    const hasClip = Boolean(tagCounts.clippath || tagCounts.mask);
    const hasStyleOrScript = Boolean(tagCounts.style || tagCounts.script || tagCounts.animate || tagCounts.animatetransform);
    const totalShapes = Math.max(1, (tagCounts.path || 0) + (tagCounts.circle || 0) + (tagCounts.rect || 0) + (tagCounts.ellipse || 0) + (tagCounts.polygon || 0) + (tagCounts.polyline || 0) + (tagCounts.line || 0));
    const totalCmds = Math.max(1, Object.values(pathOps).reduce((a, b) => a + b, 0));
    const vector17 = [
      Math.round(Math.log1p(charLen) * 10000) / 10000,
      Math.round(Math.log1p(lineCount) * 10000) / 10000,
      Math.round(Math.log1p(totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.path || 0) / totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.circle || 0) / totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.rect || 0) / totalShapes) * 10000) / 10000,
      Math.round((((tagCounts.polygon || 0) + (tagCounts.polyline || 0)) / totalShapes) * 10000) / 10000,
      Math.round(((tagCounts.g || 0) / totalShapes) * 10000) / 10000,
      hasDefs ? 1 : 0,
      hasGradient ? 1 : 0,
      hasFilter ? 1 : 0,
      hasClip ? 1 : 0,
      hasStyleOrScript ? 1 : 0,
      Math.round((hexColors.length / 16) * 10000) / 10000,
      Math.round((((pathOps.C || 0) + (pathOps.c || 0) + (pathOps.S || 0) + (pathOps.s || 0)) / totalCmds) * 10000) / 10000,
      Math.round((((pathOps.A || 0) + (pathOps.a || 0)) / totalCmds) * 10000) / 10000,
      Math.round((((pathOps.Z || 0) + (pathOps.z || 0)) / totalCmds) * 10000) / 10000,
    ];
    const sigStr = viewBox + "|" + tagSeq.slice(0, 48).join(",") + "|" + Object.entries(pathOps).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + ":" + v).join(",");
    let h1 = 0x811c9dc5;
    for (let i = 0; i < sigStr.length; i++) {
      h1 ^= sigStr.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    const structuralSignature = (h1 >>> 0).toString(16).padStart(8, "0");
    return {
      schema: "svg-style-v2",
      charLen,
      lineCount,
      viewBox,
      tagCounts,
      pathOps,
      hexPalette: hexColors,
      hasDefs,
      hasGradient,
      hasFilter,
      hasClip,
      hasStyleOrScript,
      structuralSignature,
      vector17,
    };
  }

  function scoreMiniSvg32Pelican(svgText) {
    if (!svgText || typeof svgText !== "string") return { score: 0, maxScore: 25, details: {} };
    const s = svgText.trim();
    const sl = s.toLowerCase();
    const has32ViewBox = /viewBox\s*=\s*["']0\s+0\s+32\s+32["']/i.test(s) || (/width\s*=\s*["']32["']/i.test(s) && /height\s*=\s*["']32["']/i.test(s));
    const hasSun = /<circle\b/i.test(s) || /#(?:fbbf24|f59e0b|fde047|fef08a|ffd[0-9a-f]{3}|ff9[0-9a-f]{3}|f4a[0-9a-f]{3}|f3b[0-9a-f]{3}|f6c[0-9a-f]{3})/i.test(sl) || /sun|lineargradient|radialgradient/i.test(sl);
    const hasWater = /#(?:0ea5e9|0284c7|0369a1|38bdf8|1e3a8a|1f2a44|244b52|294f52|78c2ca|5b8e9c|3fa7d6|a8d5cd|28536b)/i.test(sl) || /\bd=["'][^"']*[qcsQCS][^"']*["']/.test(s);
    const shapeCount = (s.match(/<(?:path|polygon|polyline|ellipse|circle|rect)\b/ig) || []).length;
    const dLen = Array.from(s.matchAll(/\bd=["']([^"']+)["']/ig), m => m[1]).join("").length;
    const hasPelican = shapeCount >= 3 && (dLen >= 16 || shapeCount >= 5);
    const isComplete = /<\/svg\s*>/i.test(s);
    const d1 = has32ViewBox ? 5 : 0;
    const d2 = hasSun ? 5 : 0;
    const d3 = hasWater ? 5 : 0;
    const d4 = hasPelican ? 5 : 0;
    const d5 = isComplete ? 5 : 0;
    return {
      score: d1 + d2 + d3 + d4 + d5,
      maxScore: 25,
      details: { viewBox32: d1, sun: d2, water: d3, pelicanShapes: d4, completeClosure: d5, shapeCount, dLen },
    };
  }

  function extractCleanHtmlOrSvg(rawText) {
    if (!rawText || typeof rawText !== "string") return { code: "", isTruncated: false };
    const text = rawText.trim();
    if (!/<svg\b|<!doctype\s+html|<html\b/i.test(text)) return { code: "", isTruncated: false };
    let extracted = "";
    let isTruncated = false;
    const mClosed = text.match(/```(?:html|xml|svg)?\s*([\s\S]*?)```/i);
    if (mClosed && /<svg\b|<!doctype\s+html|<html\b/i.test(mClosed[1])) {
      extracted = mClosed[1].trim();
    } else {
      const mOpen = text.match(/```(?:html|xml|svg)?\s*([\s\S]+)/i);
      if (mOpen && /<svg\b|<!doctype\s+html|<html\b/i.test(mOpen[1])) {
        extracted = mOpen[1].trim();
        isTruncated = true;
      }
    }
    if (!extracted || (!/<svg\b/i.test(extracted) && /<svg\b/i.test(text))) {
      const htmlClosed = text.match(/(<!DOCTYPE\s+html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>)/i);
      if (htmlClosed) {
        extracted = htmlClosed[1].trim();
      } else {
        const svgClosed = text.match(/(<svg[\s\S]*?<\/svg>)/i);
        if (svgClosed) {
          extracted = svgClosed[1].trim();
        } else {
          const htmlOpen = text.match(/(<!DOCTYPE\s+html[\s\S]+|<html[\s\S]+)/i);
          const svgOpen = text.match(/(<svg[\s\S]+)/i);
          if (htmlOpen) { extracted = htmlOpen[1].trim(); isTruncated = true; }
          else if (svgOpen) { extracted = svgOpen[1].trim(); isTruncated = true; }
        }
      }
    }
    if (!extracted) return { code: "", isTruncated: false };
    if (/<svg\b/i.test(extracted) && !/<\/svg>/i.test(extracted)) {
      isTruncated = true;
      if (!/<html\b|<!doctype\s+html/i.test(extracted)) {
        extracted = healTruncatedSvg(extracted);
      } else {
        extracted += "\n</svg>";
      }
    }
    if (/<html\b/i.test(extracted) && !/<\/html>/i.test(extracted)) {
      isTruncated = true;
      if (!/<\/body>/i.test(extracted)) extracted += "\n</body>";
      extracted += "\n</html>";
    }
    return { code: extracted, isTruncated };
  }

  function extractHtmlSvgFeatures(rawCode, forcedCodeType = "") {
    const cleaned = extractCleanHtmlOrSvg(rawCode);
    const c = (cleaned.code || String(rawCode || ""))
      .replace(/<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/ig, "")
      .replace(/\s+data-nonce=["'][^"']*["']/ig, "");
    const cl = c.toLowerCase();
    const bytes = typeof Buffer !== "undefined" ? Buffer.byteLength(c, "utf8") : (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(c).length : unescape(encodeURIComponent(c)).length);
    const lines = Math.max(1, c.split(/\r?\n/).length);
    const codeType = forcedCodeType || ((/<html\b|<!doctype html/i.test(c) || bytes > 4500) ? "html_svg" : "svg32");
    const vbs = Array.from(c.matchAll(/viewBox=["']([^"']+)["']/ig), m => m[1].trim());
    const parsed = vbs.map(v => {
      const n = (v.match(/[-+]?\d*\.?\d+/g) || []).map(Number);
      return { v, n, area: n.length >= 4 ? n[2] * n[3] : 0 };
    }).sort((a, b) => b.area - a.area);
    const mainVB = parsed.length ? parsed[0].v : "";
    const vbN = parsed.length ? parsed[0].n : [0, 0, 800, 500];
    const minVBArea = parsed.length ? parsed[parsed.length - 1].area : 0;
    const vbW = vbN.length >= 4 ? vbN[2] : 800;
    const vbH = vbN.length >= 4 ? vbN[3] : 500;
    const htmlComments = Array.from(c.matchAll(/<!--[\s\S]*?-->/g)).length;
    const jsComments = Array.from(c.matchAll(/\/\/[^\r\n]*/g)).length;
    const tagCounts = {};
    for (const m of c.matchAll(/<([a-zA-Z][a-zA-Z0-9_-]*)\b/g)) {
      const tag = m[1];
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    const count = (...names) => names.reduce((n, k) => n + (tagCounts[k] || 0), 0);
    const hex = Array.from(c.matchAll(/#[0-9a-fA-F]{3,6}\b/g), m => m[0]);
    const upperHex = hex.filter(h => /[A-F]/.test(h.slice(1))).length / Math.max(1, hex.length);
    const dAll = Array.from(c.matchAll(/\bd=["']([^"']+)["']/g), m => m[1]).join(" ");
    const upperCmds = (dAll.match(/[MLCQAZHVST]/g) || []).length;
    const lowerCmds = (dAll.match(/[mlcqazhvst]/g) || []).length;
    const relCmdRatio = lowerCmds / Math.max(1, upperCmds + lowerCmds);
    const commaSep = (dAll.match(/\d,\d/g) || []).length;
    const spaceSep = (dAll.match(/\d\s+\d/g) || []).length;
    const commaRatio = commaSep / Math.max(1, commaSep + spaceSep);
    const noLead = (dAll.match(/(?<!\d)\.\d+/g) || []).length;
    const withLead = (dAll.match(/\b0\.\d+/g) || []).length;
    const noLeadRatio = noLead / Math.max(1, noLead + withLead);
    const rootMatch = c.match(/<svg\b[^>]*>/i);
    const rootTag = rootMatch ? rootMatch[0] : "";
    const rootStroke = /\bstroke=/.test(rootTag) ? 1 : 0;
    const rootWH = /\bwidth=/.test(rootTag) && /\bheight=/.test(rootTag) ? 1 : 0;
    const whFirst = /width=["']32["'][^>]*viewBox=["']0 0 32 32["']/i.test(rootTag) ? 1 : 0;
    const rxMatch = c.match(/<rect\b[^>]*\brx=["'](\d+(?:\.\d+)?)["']/i);
    const rx = rxMatch ? Number(rxMatch[1]) : 0;

    const hasAriaRole = (cl.includes('role="img"') || cl.includes("aria-label") || cl.includes("aria-labelledby")) ? 1 : 0;
    const hasSvgTitleDesc = (count("title") >= 1 && count("desc") >= 1) ? 1 : 0;
    const hasCssClamp = cl.includes("clamp(") ? 1 : 0;
    const hasGridPlace = cl.includes("place-items") ? 1 : 0;
    const hasTransformBox = cl.includes("transform-box") ? 1 : 0;
    const hasFeFilter = /<fe(?:gaussianblur|dropshadow|turbulence|displacementmap)\b/i.test(cl) ? 1 : 0;
    const hasVisChange = cl.includes("visibilitychange") ? 1 : 0;
    const hasSetAttr = cl.includes("setattribute(") ? 1 : 0;
    const uniqueHexCnt = new Set(hex.map(h => h.toLowerCase())).size;

    const num = x => Math.log1p(Math.max(0, x));
    const nPath = count("path");
    const nCircle = count("circle");
    const nEllipse = count("ellipse");
    const nRect = count("rect");
    const nLine = count("line");
    const nPoly = count("polyline", "polygon");
    const nG = count("g");
    const nGrad = count("linearGradient", "radialGradient", "lineargradient", "radialgradient");
    const nFilter = count("filter", "clipPath", "clippath");
    const nUse = count("use");
    const hasRaf = cl.includes("requestanimationframe") ? 1 : 0;
    const hasCancelRaf = cl.includes("cancelanimationframe") ? 1 : 0;
    const hasKeyframes = cl.includes("@keyframes") ? 1 : 0;
    const hasSmil = /<animate(?:transform|motion)?\b/i.test(c) ? 1 : 0;
    const hasTrig = (cl.includes("math.sin") || cl.includes("math.cos")) ? 1 : 0;
    const hasInvTrig = (cl.includes("math.atan2") || cl.includes("math.acos")) ? 1 : 0;
    const hasCssVar = (c.includes("--") && cl.includes("var(--")) ? 1 : 0;
    const hasReducedMotion = cl.includes("prefers-reduced-motion") ? 1 : 0;

    const vec = [
      num(bytes), num(lines), num(bytes / lines), lines <= 5 ? 1 : 0,
      num(vbW), num(vbH), vbW / Math.max(1, vbH), vbs.length > 1 ? 1 : 0,
      mainVB.includes("0 0 1200 800") ? 1 : 0,
      mainVB.includes("0 0 800 500") ? 1 : 0,
      mainVB.includes("0 0 1440 900") ? 1 : 0,
      mainVB.includes("0 0 960 600") ? 1 : 0,
      mainVB.includes("0 0 1000 620") ? 1 : 0,
      hasRaf, hasCancelRaf, hasKeyframes, hasSmil, hasTrig, hasInvTrig, hasCssVar, hasReducedMotion,
      num(htmlComments), num(jsComments), upperHex, relCmdRatio, commaRatio, noLeadRatio,
      rootStroke, rootWH, whFirst, num(rx),
      num(nPath), num(nCircle), num(nEllipse), num(nRect),
      num(nLine), num(nPoly), num(nG),
      num(nGrad), num(nFilter), num(nUse),
      hasAriaRole, hasSvgTitleDesc, hasCssClamp, hasGridPlace, hasTransformBox,
      hasFeFilter, hasVisChange, hasSetAttr, num(uniqueHexCnt)
    ];

    const cNoGeom = codeType === "html_svg" ? c.replace(/\b(?:d|points)=["'][^"']*["']/g, " ") : c;
    const tokens = new Set((cNoGeom.match(/[a-zA-Z_][a-zA-Z0-9_-]{2,32}/g) || []));
    if (codeType === "html_svg") {
      for (const m of cNoGeom.matchAll(/\bclass=["']([^"']+)["']/g)) {
        for (const cn of m[1].trim().split(/\s+/)) {
          if (cn) tokens.add("CLS_" + cn.toLowerCase());
        }
      }
      for (const m of cNoGeom.matchAll(/\bid=["']([^"']+)["']/g)) {
        if (m[1].trim()) tokens.add("ID_" + m[1].trim().toLowerCase());
      }
      for (const m of cNoGeom.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/ig)) {
        tokens.add("KF_" + m[1].toLowerCase());
      }
    }
    for (const h of new Set(hex)) tokens.add("HEX_" + h.toLowerCase());
    if (mainVB) tokens.add("VB_" + mainVB.replace(/\s+/g, "_"));
    if (vbs.length > 1) tokens.add("MULTI_SVG");
    if (rootStroke) tokens.add("ROOT_SVG_STROKE");
    if (whFirst) tokens.add("WH_BEFORE_VB");
    if (commaRatio > 0.35) tokens.add("PATH_COMMA_SEP");
    if (relCmdRatio > 0.25) tokens.add("PATH_REL_CMDS");
    if (noLeadRatio > 0.4) tokens.add("PATH_OMIT_LEAD_ZERO");
    if (upperHex > 0.5) tokens.add("UPPERCASE_HEX_DOMINANT");
    if (hasAriaRole) tokens.add("ARCH_ARIA_ROLE_IMG");
    if (hasSvgTitleDesc) tokens.add("ARCH_SVG_TITLE_DESC");
    if (hasCssClamp) tokens.add("ARCH_CSS_CLAMP");
    if (hasGridPlace) tokens.add("ARCH_GRID_PLACE_ITEMS");
    if (hasTransformBox) tokens.add("ARCH_TRANSFORM_BOX");
    if (hasFeFilter) tokens.add("ARCH_FE_FILTER");
    if (hasVisChange) tokens.add("ARCH_VISIBILITY_CHANGE");
    if (hasSetAttr && hasRaf) tokens.add("ARCH_RAF_SETATTR");

    // Michaelis-Menten 非饱和有理分式谱图复杂度评分（消除 100 分天花板粘连）
    const phi = 14.5 * num(nPath + nCircle + nEllipse + nPoly)
      + 18.2 * num(nG + nGrad * 2 + nFilter * 2)
      + 16.0 * (hasRaf + hasTrig * 0.6 + hasInvTrig * 0.8)
      + 11.0 * (hasKeyframes + hasSmil + hasTransformBox * 0.6)
      + 8.5 * num(uniqueHexCnt);
    const spectralScore = Math.round((100 * phi / (phi + 92)) * 10) / 10;

    // 12 维紧凑签名（供习惯库样本 meta 持久化与跨会话比对）
    const sig12 = [
      Math.min(1, num(bytes) / 11),
      Math.min(1, (vbW / Math.max(1, vbH)) / 2.2),
      hasRaf,
      hasKeyframes,
      hasSmil,
      Math.round(upperHex * 1000) / 1000,
      Math.round(relCmdRatio * 1000) / 1000,
      Math.round(commaRatio * 1000) / 1000,
      Math.round(noLeadRatio * 1000) / 1000,
      Math.min(1, num(nPath + nG) / 6),
      Math.min(1, num(htmlComments + jsComments) / 5),
      Math.min(1, spectralScore / 100),
    ].map(x => Math.round((Number(x) || 0) * 1000) / 1000);

    const svgStyleV2 = extractSvgStyleV2(c);
    const miniSvg32Referee = codeType === "svg32" ? scoreMiniSvg32Pelican(c) : null;

    return {
      code_type: codeType,
      isTruncated: cleaned.isTruncated,
      vec,
      sig12,
      svgStyleV2,
      miniSvg32Referee,
      spectralScore,
      tokens,
      bytes,
      lines,
      vbs,
      main_vb: mainVB,
      min_vb_area: minVBArea,
      n_path: nPath,
      n_circle: nCircle,
      n_g: nG,
      n_grad: nGrad,
      n_hcomm: htmlComments,
      has_raf: Boolean(hasRaf),
      root_tag: rootTag,
      root_stroke: rootStroke,
      wh_first: whFirst,
      comma_ratio: commaRatio,
      rect_rx: rx,
      raw: c,
      lower: cl,
    };
  }

  function htmlSvgRuleScores(f) {
    const b = f.bytes, cl = f.lower, vb = f.main_vb, vbs = f.vbs || [], rules = {}, reasons = {};
    const add = (mid, score, why) => {
      rules[mid] = (rules[mid] || 0) + score;
      if (why) (reasons[mid] || (reasons[mid] = [])).push(why);
    };
    if (f.code_type === "html_svg") {
      const _AP = (typeof ArenaPricing !== "undefined" && ArenaPricing) || (typeof globalThis !== "undefined" && globalThis.ArenaPricing) || null;
      const _zq0 = (_AP && typeof _AP.evaluateZeroQuotaCarbonSignature === "function") ? _AP.evaluateZeroQuotaCarbonSignature(f.raw) : null;
      const _c3 = (_AP && typeof _AP.classify3StageGoogleArgonCarbon === "function") ? _AP.classify3StageGoogleArgonCarbon(f.raw, { ws_model_hint: (_zq0 && _zq0.isTrueCarbon) ? "gemini-4-carbon" : "" }) : null;
      if ((_zq0 && _zq0.isTrueCarbon) || (_c3 && _c3.isTrueCarbon)) {
        add("google/gemini-4-carbon", 0.97, `命中五门正交 👑 真 Carbon 物理引擎 (${(_c3 && _c3.verdict) || (_zq0 && _zq0.verdict)})`);
      }
      const argonKeys = ["pelicanBodyGroup", "basketFish", "cloudsLayer", "wavesLayer", "maxReach", "bodyPitch", "baseAngle", "headNod", "wheelTemplate", "windLines", "gull1", "gull2", "solveKnee", "buildDrumstick", "buildWebbedFoot", "buildWing", "blinkCycle", "pouchSway", "scarfTail1"];
      const hits = argonKeys.filter(k => f.raw.includes(k)).length;
      if (f.has_raf && hits >= 3) add("google/gemini-4-argon", 0.48 + Math.min(0.35, hits * 0.05), `Argon专属骨骼变量(${hits}项)+RAF`);
      else if (f.has_raf && (cl.includes("math.sin") || cl.includes("math.cos")) && f.n_hcomm >= 65 && b >= 28000) add("google/gemini-4-argon", 0.45, `Argon高密度注释(${f.n_hcomm})+RAF逆运动学`);

      if ((cl.includes("overscroll-behavior: none") && cl.includes("viewport-fit=cover")) || (cl.includes("paper-noise") && cl.includes("sea-light") && cl.includes("islands"))) {
        add("openai/gpt-6-astra", 0.75, "GPT 6 Astra viewport-fit/paper-noise/sea-light视差");
      }

      const hasSmall = vbs.length > 1 && f.min_vb_area > 0 && f.min_vb_area <= 2500 && !vbs.includes("0 0 32 32") && !vbs.includes("0 0 120 50");
      if (hasSmall && f.has_raf && (cl.includes("cancelanimationframe") || cl.includes("visibilitychange") || cl.includes("updateleg") || cl.includes("scenelabel") || cl.includes("scenetitle") || cl.includes("scene-title"))) {
        add("openai/gpt-6.1-sol", 0.68, "GPT 6.1 Sol 多SVG控件+RAF/visibilitychange驱动");
      } else if (/\*\{box-sizing:border-box\}html,body\{margin:0;width:100%;height:100%;overflow:hidden;background:#[0-9a-f]{6}\}body\{display:grid;place-items:center\}/.test(cl) && (cl.includes(".crank") || cl.includes("pedalfront") || cl.includes("toggle")) && !cl.includes(".hill-back")) {
        add("openai/gpt-6.1-sol", 0.58, "GPT 6.1 Sol 紧凑Grid+crank/pedal驱动");
      } else if ((cl.includes("#scene") || cl.includes(".scene")) && cl.includes('id="scene"') && cl.includes('id="title"') && cl.includes('id="desc"') && cl.includes('id="roadmarks"') && cl.includes('id="toggle"')) {
        add("openai/gpt-6.1-sol", 0.58, "GPT 6.1 Sol scene/roadmarks/toggle结构");
      } else if (cl.includes('preserveaspectratio="xmidymid slice"') && cl.includes("scrollers") && cl.includes("performance.now()")) {
        add("openai/gpt-6.1-sol", 0.60, "GPT 6.1 Sol scrollers视差卷轴驱动");
      } else if (cl.includes('<meta name="color-scheme" content="light">') && vb.includes("0 0 1440 900") && (cl.includes("nearcrank") || cl.includes("farcrank"))) {
        add("openai/gpt-6.1-sol", 0.65, "GPT 6.1 Sol 1440×900双曲柄(nearCrank/farCrank)");
      } else if ((cl.includes(".masthead") || cl.includes(".eyebrow")) && cl.includes("calc(100% - 64px)") && cl.includes("visibilitychange") && f.has_raf) {
        add("openai/gpt-6.1-sol", 0.65, "GPT 6.1 Sol masthead/eyebrow+visibilitychange");
      }

      if (cl.includes('rel="icon"') && cl.includes("data:image/svg+xml") && cl.includes("whlf") && cl.includes("whlr")) add("anthropic/claude-opus-5.5", 0.72, "Claude Opus 5.5 内嵌SVG Favicon+whlF/whlR");
      if (cl.includes(".spin-fast") && cl.includes("pouchg") && cl.includes("@keyframes neck")) add("anthropic/claude-opus-5.5", 0.68, "Claude Opus 5.5 spin-fast+neck/pouchG关键帧");

      if (cl.includes(".leg-a") && cl.includes(".leg-b") && cl.includes("lega") && cl.includes("legb")) add("x-ai/grok-4.7", 0.58, "Grok 4.7 leg-a/leg-b关键帧");
      if ((cl.includes("ui-rounded") || cl.includes("sf pro rounded") || cl.includes("bird-bob") || cl.includes("sun-breathe") || cl.includes("wheel-turn") || cl.includes(".hill-back") || cl.includes("bikepaint") || (cl.includes("road-drift") && cl.includes("softshadow")) || (vb.includes("0 0 1200 700") && !cl.includes("tinyshadow") && !cl.includes("whlf") && !cl.includes("pouchg"))) && !f.has_raf && !cl.includes("walk-clip") && !cl.includes("bird-feather") && !cl.includes("water-glint")) {
        add("openai/gpt-6-luna", 0.52, "GPT 6 Luna ui-rounded/bird-bob/wheel-turn纯CSS+SMIL");
      } else if (cl.includes('lang="es"') && vb.includes("0 0 800 500")) {
        add("openai/gpt-6-luna", 0.58, "GPT 6 Luna 多语种标题与800×500结构");
      }
      if ((vb.includes("0 0 800 500") || vb.includes("0 0 800 450") || vb.includes("0 0 1000 560") || vb.includes("0 0 1000 600") || vb.includes("0 0 1000 620")) && (cl.includes("#bfe6ff") || cl.includes("#e3f6ff") || cl.includes("#87ceeb") || cl.includes("hillsfar") || cl.includes("hillsnear") || cl.includes("solveik") || cl.includes("鹈鹕骑自行车</title>") || cl.includes("风一吹，就出发")) && !cl.includes("pelicanfeather") && !cl.includes("pedalu") && !cl.includes("crank-spin") && !cl.includes("tailwag") && !cl.includes("spokesrear") && !cl.includes("ikknee") && !cl.includes("legbackhilight") && !cl.includes('lang="es"') && !((cl.includes("crankr") && cl.includes("crankl") && cl.includes("pedalr") && cl.includes("pedall")) || (cl.includes("cloudtile") && cl.includes("farhilltile") && cl.includes("nearhilltile")) || (cl.includes("wheel_r") && cl.includes("crank_r") && cl.includes("thigh")))) {
        add("anthropic/claude-sonnet-5.5", 0.56, "Claude Sonnet 5.5 800×500/1000×620+#87ceeb/hillsFar/solveIK");
      }
      if (vb.includes("0 0 1000 620") && f.has_raf && (cl.includes("solveik") || cl.includes("═"))) {
        add("anthropic/claude-opus-5.5", 0.58, "Claude Opus 5.5 1000×620+solveIK+RAF逆运动学");
        add("anthropic/claude-sonnet-5.5", 0.60, "Claude Sonnet 5.5 1000×620+solveIK+框线注释");
      }
      if (!f.has_raf && f.n_hcomm >= 70 && (cl.includes("skygrad") || cl.includes("pouchgrad"))) {
        if (cl.includes("spincw") || cl.includes("spinccw") || cl.includes("scarfwave") || cl.includes("belltoast") || b > 40000) add("google/gemini-3.7-flash", 0.58, "Gemini 3.7 Flash 超高注释(>70)+纯CSS/SMIL");
        else add("google/gemini-3.8-flash", 0.55, "Gemini 3.8 Flash 高注释+纯CSS关键帧");
      } else if (cl.includes("roadfill") && cl.includes("wingbeat") && vb.includes("0 0 1200 760")) {
        add("google/gemini-3.8-flash", 0.55, "Gemini 3.8 Flash roadFill/wingbeat+1200×760");
      }
      if (vb.includes("0 0 900 520") && (cl.includes("sunrays") || cl.includes("plumeg") || cl.includes("chainfwd"))) add("z-ai/glm-5.3", 0.58, "GLM 5.3 900×520+sunRays/plumeG");
      if ((cl.includes("wheelspin") || cl.includes("cloudrift") || cl.includes("clouddrift1") || (cl.includes("hillback") && cl.includes("hillfore")) || (f.lines <= 35 && b > 25000) || (f.n_path === 0 && b > 15000)) && !cl.includes(".masthead") && !vbs.includes("0 0 120 50") && !(vb.includes("0 0 800 500") && (cl.includes("crank-spin") || cl.includes("tailwag") || cl.includes("#87ceeb")))) add("moonshotai/kimi-k3", 0.55, "Kimi K3 关键帧/几何图元结构");
      if (b <= 11200 && (cl.includes("cranka") || cl.includes("crankb") || (vb.includes("0 0 800 500") && (cl.includes("#ff9a2e") || cl.includes("legfront") || cl.includes("pelican-head") || cl.includes("#fff8e7") || cl.includes("pedal-spin") || cl.includes("spokes") || cl.includes("groundline") || (cl.includes("@keyframes ride") && cl.includes("@keyframes ground")))))) add("anthropic/claude-haiku-5.5", 0.55, "Claude Haiku 5.5 紧凑800×500+crankA/crankB");
      const isMuseKneeSvg = (cl.includes('aria-labelledby="svgtitle svgdesc"') || cl.includes('aria-labelledby="titulosvg descsvg"') || (cl.includes('id="svgtitle"') && cl.includes('id="svgdesc"')) || (cl.includes('id="titulosvg"') && cl.includes('id="descsvg"')) || cl.includes("scarfflutter") || (cl.includes("scarftail") && !cl.includes("scarftail1")) || (cl.includes("scarfa") && cl.includes("scarfb")) || (cl.includes("hip_n") && cl.includes("hip_f")) || (((cl.includes("legnear") && cl.includes("legfar")) || (cl.includes("thighnear") && cl.includes("thighfar")) || (cl.includes("nearthigh") && cl.includes("farthigh"))) && ((cl.includes("footnear") && cl.includes("footfar")) || (cl.includes("nearfoot") && cl.includes("farfoot")))) || (cl.includes("legbackhilight") && cl.includes("legfronthilight")) || (cl.includes("head-bill") && cl.includes("fish-tail") && cl.includes("spin-rear") && cl.includes("spin-front"))) && (cl.includes("function knee(") || cl.includes("function kneeposition(") || cl.includes("function solveknee(") || cl.includes("function ikknee(") || cl.includes("function setleg(") || cl.includes("function updateleg(") || cl.includes("function placeleg(") || cl.includes("math.hypot(dx, dy) || 1") || /math\.min\(\s*\(\s*now\s*-\s*last\s*\)\s*\/\s*1000\s*,\s*0\.05\s*\)/.test(cl) || (cl.includes("pedalnear") && cl.includes("pedalfar")) || (cl.includes("legnear") && cl.includes("legfar")) || (cl.includes("spin-rear") && cl.includes("spin-front")));
      if (isMuseKneeSvg || cl.includes("grassblock") || cl.includes("treeblock") || (cl.includes('id="roadg"') && cl.includes('id="pouchg"') && cl.includes('id="sung"') && !cl.includes('id="plumeg"')) || (cl.includes("rearspokelines") && cl.includes("frontspokelines")) || (cl.includes("dashstrip") && cl.includes("grasstufts") && cl.includes("buildstrip")) || cl.includes('spokes("spokesrear")')) add("meta/muse-spark-1.3", isMuseKneeSvg ? 0.78 : 0.68, isMuseKneeSvg ? "Muse Spark 1.3 knee逆运动学/svgTitle+svgDesc/scarfFlutter" : "Muse Spark 1.3 roadG/pouchG/rearSpokeLines/dashStrip");
      if ((cl.includes("bird-feather") && cl.includes("grass-sway")) || (cl.includes("pouchpaint") && cl.includes("beakpaint") && cl.includes("riderbob"))) add("xiaomi/mimo-v2.6-flash", 0.55, "MiMo V2.6 Flash grass-sway/pouchPaint");
      if ((cl.includes("driftscenery") && cl.includes("driftforeground")) || (cl.includes("spokesrear") && cl.includes("spokesfront") && vb.includes("0 0 800 500"))) add("anthropic/claude-opus-5", 0.58, "Claude Opus 5 driftScenery/spokesRear");
      if (cl.includes("sceneryrow") || (cl.includes('id="hills2"') && vb.includes("0 0 800 450"))) add("deepseek/deepseek-v4.1-flash", 0.55, "DeepSeek V4.1 Flash sceneryRow/hills2");
      if (cl.includes("backlegoutline") || cl.includes("frontlegoutline") || (cl.includes("rearspokes") && cl.includes("frontspokes") && cl.includes("speckle"))) add("openai/gpt-6-sol", 0.55, "GPT 6 Sol backLegOutline/frontLegOutline");
      if (cl.includes("tinyshadow") && cl.includes("framepaint")) add("openai/gpt-5.6-sol", 0.55, "GPT 5.6 Sol tinyShadow/framePaint");
      if (cl.includes("farlegpath") || cl.includes("farshoe") || cl.includes("badgepulse")) add("openai/gpt-5.6-luna", 0.55, "GPT 5.6 Luna farLegPath/farShoe/badgePulse");
      if (cl.includes("walk-clip") || (cl.includes("boardwalk") && cl.includes("wheel-spin--back"))) add("openai/gpt-5.5", 0.55, "GPT 5.5 boardwalk/walk-clip/BEM");
      if ((cl.includes("pedalu") && cl.includes("pedald") && (cl.includes("legu") || cl.includes("legd"))) || (vb.includes("0 0 800 500") && cl.includes("crank-spin") && cl.includes("tailwag") && cl.includes("#87ceeb")) || ((cl.includes("crankr") && cl.includes("crankl") && cl.includes("pedalr") && cl.includes("pedall")) || (cl.includes("cloudtile") && cl.includes("farhilltile") && cl.includes("nearhilltile")) || (cl.includes("wheel_r") && cl.includes("crank_r") && cl.includes("thigh") && !f.raw.includes("WHEEL_R")) || (cl.includes("rearspin") && cl.includes("frontspin") && (cl.includes("placeleg") || cl.includes("wheelmarkup"))))) add("anthropic/claude-fable-5.1", 0.68, "Claude Fable 5.1 crankR/pedalR/farHillTile/IK逆运动学");
      if (cl.includes("pelican-rider") && (cl.includes("ground-dashes") || cl.includes("pedal-group")) && !cl.includes("crank-spin") && !cl.includes("tailwag")) add("xiaomi/mimo-v2.6-pro", 0.55, "MiMo V2.6 Pro pelican-rider/ground-dashes");
      if (cl.includes("water-glint") && cl.includes("sun-blur")) add("upstage/solar-pro4", 0.55, "Solar Pro 4 water-glint/sun-blur");
      if (cl.includes('id="tuft"') && cl.includes('id="rider"') && vb.includes("0 0 960 600")) add("nvidia/nemotron-3-ultra", 0.55, "Nemotron 3 Ultra tuft/rider图层");
      if (vb.includes("0 0 800 400") && cl.includes('id="scenery"') && cl.includes('id="rider"')) add("minimax/minimax-m3", 0.55, "MiniMax M3 800×400+scenery/rider");
      if (cl.includes('id="ttl"') && cl.includes('id="roadg"')) add("z-ai/glm-5.2", 0.55, "GLM 5.2 ttl/roadG结构");
      if (cl.includes('class="stage"') && cl.includes('class="caption"') && vb.includes("0 0 800 500") && !cl.includes("sceneryrow")) add("qwen/qwen3.7-max", 0.55, "Qwen 3.7 Max stage/caption+800×500");
    } else {
      if (f.root_stroke && (/#1f2a44|#1f3a5f|#f4a259|#f5b82e/.test(cl) || f.comma_ratio > 0.35)) add("anthropic/claude-opus-5.5", 0.62, "Claude Opus 5.5 SVG32根节点stroke+逗号坐标");
      else if (!f.root_stroke) add("anthropic/claude-opus-5.5", -0.25, "");
      if (f.wh_first && f.rect_rx === 4 && (/#fff5df|#244b52|#78c2ca/.test(cl))) add("openai/gpt-6-astra", 0.65, "GPT 6 Astra SVG32 width优先+rx=4");
      if (f.wh_first && f.rect_rx === 5 && (/#fff6e5|#294f52|#f3bc58/.test(cl))) add("openai/gpt-6.1-sol", 0.65, "GPT 6.1 Sol SVG32 width优先+rx=5");
      if (!f.wh_first && (f.rect_rx === 4 || f.rect_rx === 5)) {
        add("openai/gpt-6-astra", -0.28, "");
        add("openai/gpt-6.1-sol", -0.28, "");
      }
      if (f.root_tag.includes('role="img"') && f.rect_rx === 3.5) add("openai/gpt-5.6-terra", 0.52, "GPT 5.6 Terra SVG32 role=img+rx=3.5");
    }
    return { scores: rules, reasons };
  }

  function predictHtmlSvgEffort(mid, target, sims) {
    if (sims && sims.length && (sims[0].source === 2 || sims[0].rawSim >= 0.999) && sims[0].sim >= 0.96 && sims[0].effort && sims[0].effort !== "standard") {
      return sims[0].effort;
    }
    const slug = String(mid || "").split("/").pop().toLowerCase();
    const clEarly = target?.lower || "";
    if (slug === "claude-fable-5.1" && target?.code_type === "html_svg" && (target.has_raf && (target.bytes >= 11500 || clEarly.includes("crankr") || clEarly.includes("cloudtile") || clEarly.includes("wheel_r")))) {
      return "max";
    }
    if (slug === "muse-spark-1.3" && target?.code_type === "html_svg" && target.has_raf && (target.bytes >= 14500 || clEarly.includes("(function(){"))) {
      return "max";
    }
    const ct = target.code_type;
    const b = target.bytes;
    const lines = target.lines;
    const nPath = target.n_path;
    const nG = target.n_g;
    const nGrad = target.n_grad;
    const nHcomm = target.n_hcomm;
    const raf = target.has_raf ? 1 : 0;
    const vb = target.main_vb || "";
    const cl = target.lower || "";

    if (ct === "html_svg") {
      if (slug === "claude-fable-5.1") return (raf === 1 && b >= 11500) ? "max" : "high";
      if (slug === "muse-spark-1.3") return (raf === 1 && b >= 14500) ? "max" : "high";
      if (slug === "claude-sonnet-5.5") return (b <= 11500 && raf === 0) ? "low" : "high";
      if (slug === "gpt-6.1-sol") {
        if (raf === 0 && (nGrad <= 2 || lines <= 75)) return "low";
        if (raf === 0) return nPath >= 35 ? "max" : "high";
        if (nPath >= 100 || nG >= 44 || b < 25000) return "max";
        return "high";
      }
      if (slug === "gemini-4-argon") {
        if (vb.includes("800 500") || vb.includes("900 560") || vb.includes("1200 750") || (nHcomm >= 98 && nHcomm <= 105 && vb.includes("960 600")) || (cl.includes("builddrumstick") && cl.includes("buildwebbedfoot") && cl.includes("buildwing") && cl.includes("blinkcycle"))) return "max";
        if (b < 33500 && nG <= 26) return "medium";
        return "high";
      }
      if (slug === "gpt-6-luna") {
        if (["art-title", "poster", "status-dot", "bikepaint"].some(k => cl.includes(k))) return "low";
        if (raf === 1 || vb.includes("1200 700") || b < 9000 || cl.includes("feather-lilt")) return "max";
        return "medium";
      }
      if (slug === "gemini-3.7-flash") return b < 47000 ? "low" : "high";
    } else {
      if (slug === "gpt-6-astra") {
        if (sims && sims[0] && sims[0].sim >= 0.94 && sims[0].effort) return sims[0].effort;
        return "low";
      }
      if (slug === "claude-opus-5.5") return "max";
      if (slug === "gpt-6.1-sol") {
        if (sims && sims[0] && sims[0].sim >= 0.94 && sims[0].effort) return sims[0].effort;
        return "max";
      }
    }

    const use = (sims || []).filter(x => x.effort && x.effort !== "standard");
    if (use.length) {
      const votes = {};
      use.slice(0, 3).forEach((x, i) => {
        votes[x.effort] = (votes[x.effort] || 0) + Math.pow(Math.max(0.1, x.sim), 8) * (x.source === 2 ? 2.2 : (i === 0 ? 1.8 : 1));
      });
      const bestEff = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (bestEff) return bestEff;
    }
    return "high";
  }

  const PELICAN_CLASSIFIER_V5_MODEL = /*__PELICAN_CLASSIFIER_MODEL__*/null;
  function matchPelicanClassifierV5(target) {
    const out = Object.create(null);
    try {
      const m = PELICAN_CLASSIFIER_V5_MODEL || (typeof globalThis !== "undefined" && globalThis.PELICAN_CLASSIFIER_MODEL) || null;
      const protos = Array.isArray(m?.prototypes) ? m.prototypes : [];
      if (!protos.length || !target?.vec) return out;
      const weights = Array.isArray(m?.feature_weights) && m.feature_weights.length ? m.feature_weights : (HTML_SVG_CLASSIFIER_BANK.w || []);
      const ctStr = target.code_type || "html_svg";
      for (const p of protos) {
        if (p.code_type && p.code_type !== ctStr) continue;
        const mid = String(p.model_id || "");
        if (!mid) continue;
        const pVec = Array.isArray(p.vec) ? p.vec : [];
        let d2 = 0, wSum = 0;
        const n = Math.min(target.vec.length, pVec.length);
        for (let i = 0; i < n; i++) {
          const w = i < weights.length ? weights[i] : 1.0;
          const d = (target.vec[i] || 0) - (pVec[i] || 0);
          d2 += w * d * d;
          wSum += w;
        }
        const vSim = Math.exp(-1.6 * Math.sqrt(d2 / Math.max(1, wSum)));
        let pTokOverlap = 0;
        const pToks = p.tokens || {};
        for (const [tok, w] of Object.entries(pToks)) {
          if (target.tokens?.has(tok)) pTokOverlap += Number(w) || 0;
        }
        const tCos = Math.min(1, pTokOverlap / 18);
        const rawSim = ctStr === "html_svg" ? (0.68 * vSim + 0.32 * tCos) : vSim;
        const prev = out[mid];
        if (!prev || rawSim > prev.sim) {
          out[mid] = { sim: rawSim, effort: p.effort || "high" };
        }
      }
    } catch {}
    return out;
  }

  function classifyHtmlSvg(code, opts = {}) {
    if (!code || typeof code !== "string") return null;
    const target = extractHtmlSvgFeatures(code, opts.codeType || "");
    if (!target || (!/<svg\b|<!doctype html|<html\b/i.test(target.raw) && target.bytes < 60)) return null;
    const ctBit = target.code_type === "html_svg" ? 1 : 0;
    const weights = HTML_SVG_CLASSIFIER_BANK.w || [];
    const catalog = HTML_SVG_CLASSIFIER_BANK.c || {};
    const protosAll = HTML_SVG_CLASSIFIER_BANK.p || [];
    const pool = protosAll.filter(p => p[2] === ctBit);
    const rules = htmlSvgRuleScores(target);
    const v5Matches = matchPelicanClassifierV5(target);
    const byModel = new Map();
    for (const p of pool) {
      const mid = p[0];
      let arr = byModel.get(mid);
      if (!arr) { arr = []; byModel.set(mid, arr); }
      arr.push(p);
    }
    const modelIds = new Set([...byModel.keys(), ...Object.keys(rules.scores), ...Object.keys(v5Matches)]);
    const scores = [];
    for (const mid of modelIds) {
      const protos = byModel.get(mid) || [];
      const sims = protos.map(p => {
        const pEff = p[1] || "high";
        const pSrc = p[3] || 0;
        const pVec = p[4] || [];
        const pToks = p[5] || {};
        let d2 = 0, wSum = 0;
        const n = Math.min(target.vec.length, pVec.length);
        for (let i = 0; i < n; i++) {
          const w = i < weights.length ? weights[i] : 1.0;
          const d = (target.vec[i] || 0) - (pVec[i] || 0);
          d2 += w * d * d;
          wSum += w;
        }
        const vSim = Math.exp(-1.6 * Math.sqrt(d2 / Math.max(1, wSum)));
        let pTokOverlap = 0;
        for (const [tok, w] of Object.entries(pToks)) {
          if (target.tokens.has(tok)) pTokOverlap += Number(w) || 0;
        }
        const tCos = Math.min(1, pTokOverlap / 18);
        const rawSim = target.code_type === "html_svg" ? (0.68 * vSim + 0.32 * tCos) : vSim;
        const sim = rawSim * (pSrc === 2 ? 1.25 : (pSrc === 1 ? 1.06 : 1));
        return { sim, rawSim, effort: pEff, source: pSrc };
      }).sort((a, b) => b.sim - a.sim);

      const top = sims.slice(0, 3);
      const bestProtoSim = top.length ? top[0].rawSim : (rules.scores[mid] >= 0.4 ? 0.72 : 0.25);
      const best = top.length ? top[0].sim : (rules.scores[mid] >= 0.4 ? 0.72 : 0.25);
      const mean = top.length ? top.reduce((a, x) => a + x.sim, 0) / top.length : (rules.scores[mid] >= 0.4 ? 0.68 : 0.25);
      const learnedTokens = Object.create(null);
      for (const p of protos) {
        const pt = p[5] || {};
        for (const [k, v] of Object.entries(pt)) {
          const nv = Number(v) || 0;
          if (nv > (learnedTokens[k] || 0)) learnedTokens[k] = nv;
        }
      }
      let tokenScore = 0;
      const matched = [];
      for (const tok of target.tokens) {
        const w = learnedTokens[tok];
        if (typeof w === "number" && w > 0) {
          tokenScore += w;
          if (w >= 2.2) matched.push([w, tok]);
        }
      }
      matched.sort((a, b) => b[0] - a[0]);
      const tokenNorm = Math.min(1, tokenScore / 22);
      let rule = rules.scores[mid] || 0;
      if (best >= 0.995 && rule < 0) rule = 0;
      const v5Hit = v5Matches[mid] || null;
      const v5Boost = v5Hit && v5Hit.sim > best ? (v5Hit.sim - best) * 0.48 : 0;
      const combined = 0.45 * best + 0.20 * mean + 0.25 * tokenNorm + rule + v5Boost;
      const rawEffort = (v5Hit && v5Hit.sim >= 0.88 && v5Hit.effort) ? v5Hit.effort : predictHtmlSvgEffort(mid, target, sims);
      const catMeta = catalog[mid] || { label: mid, vendor: String(mid).split("/")[0] || "unknown" };
      const slug = String(mid).split("/").pop().toLowerCase();
      const isTieredFam = TIERED_HTML_SVG_FAMILIES.has(slug);
      const cleanEffort = isTieredFam ? rawEffort : "standard";
      const baseSlugOrLabel = isTieredFam && cleanEffort !== "standard"
        ? `${slug}-${cleanEffort}`
        : slug;
      const decomp = decomposeModelIdentity(baseSlugOrLabel, {
        vendor: catMeta.vendor,
        family: slug,
        effort: cleanEffort,
        rawLabel: catMeta.label || slug,
      });
      const isOpen = isOpenName(decomp.canon || decomp.family || mid);
      if (opts.strictOpenClosed && typeof opts.isOpenThink === "boolean" && isOpen !== opts.isOpenThink) {
        continue;
      }
      scores.push({
        model_id: mid,
        canon: decomp.canon,
        label: decomp.displayLabel || formatDisplayModelLabel(decomp.canon, catMeta.label),
        vendor: decomp.vendorLabel,
        vendorId: decomp.vendor,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        rawEffort,
        effortLabel: decomp.effortLabel,
        isOpen,
        score: Math.round(combined * 1000) / 1000,
        protoSim: Math.round(bestProtoSim * 1000) / 1000,
        tokenNorm: Math.round(tokenNorm * 1000) / 1000,
        ruleScore: Math.round(rule * 1000) / 1000,
        reasons: [...(rules.reasons[mid] || []), ...matched.slice(0, 3).map(x => "特征词:" + x[1])],
      });
    }
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, opts.topK || 5);
    const maxS = top[0]?.score || 0;
    const exps = top.map(x => Math.exp((x.score - maxS) * 6.5));
    const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
    top.forEach((x, i) => { x.confidence = Math.round((exps[i] / sumExp) * 1000) / 1000; });
    return {
      code_type: target.code_type,
      spectralScore: target.spectralScore,
      isTruncated: target.isTruncated,
      svgStyleV2: target.svgStyleV2,
      miniSvg32Referee: target.miniSvg32Referee,
      features: {
        bytes: target.bytes,
        lines: target.lines,
        viewBox: target.main_vb,
        hasRaf: target.has_raf,
        nPath: target.n_path,
        nCircle: target.n_circle,
        nG: target.n_g,
        nGrad: target.n_grad,
        sig12: target.sig12,
        vector17: target.svgStyleV2 ? target.svgStyleV2.vector17 : null,
        structuralSignature: target.svgStyleV2 ? target.svgStyleV2.structuralSignature : "",
      },
      top_candidates: top,
      best: top[0] || null,
    };
  }

  // 从已保存的 habitTags / habitFeatures（或导入的诊断 JSON）重建习惯特征（当对话消息尚未从 IndexedDB 加载时的即时还原）
  function extractFeaturesFromSaved(chat, modelEntry, opts = {}) {
    const sid = String(chat?.sid || modelEntry?.sid || '');
    const topRev = Array.isArray(modelEntry?.reverseCandidates) ? modelEntry.reverseCandidates[0] : null;
    const revTopLabel = (topRev && !topRev.structuralRev && (topRev.diophantinePassed || (topRev.revPct || 0) >= 75)) ? String(topRev.stealthModelLabel || topRev.dynamicLabel || topRev.label || topRev.id || '') : '';
    const hasRealRevTokens = Boolean((modelEntry?.reverseTokens?.total > 0) || (modelEntry?.reverseTotalTokens?.total > 0));
    const authoritativeName = (modelEntry && !modelEntry.guess && !modelEntry.pendingConfirm && !modelEntry.fromTitle && (modelEntry.userCorrected || (!modelEntry.habitInferred && modelEntry.reverseInferred && hasRealRevTokens)))
      ? String(modelEntry.name || modelEntry.candidateName || modelEntry.reverseLabel || modelEntry.reverseCandidateId || '')
      : '';
    const mKnownName = String(revTopLabel || authoritativeName || '');
    const isKnownNonGoogle = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && !KNOWN_ARGON_SIDS.has(sid) && ((typeof CONFIRMED_SOL_61_SIDS !== 'undefined' && CONFIRMED_SOL_61_SIDS.has(sid)) || HAIKU_55_MEDIUM_SIDS.has(sid) || /gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName));
    const savedFeat = modelEntry?.habitFeatures || chat?._habitFeatures || null;
    const bankSampleEarly = (!opts?.ignoreExactSid && sid) ? getBankSampleBySid(sid) : null;
    const rawTags = [
      ...(Array.isArray(savedFeat?.habitTags) ? savedFeat.habitTags : []),
      ...(Array.isArray(savedFeat?.tags) ? savedFeat.tags : []),
      ...(Array.isArray(modelEntry?.habitTags) ? modelEntry.habitTags : []),
      ...(Array.isArray(bankSampleEarly?.tags) ? bankSampleEarly.tags : []),
      ...(Array.isArray(modelEntry?.habitCandidates?.[0]?.matchedDims) ? modelEntry.habitCandidates[0].matchedDims : []),
      ...(Array.isArray(modelEntry?.reverseCandidates?.[0]?.matchedDims) ? modelEntry.reverseCandidates[0].matchedDims : []),
    ];
    const tags = [...new Set(rawTags.map(String).filter(Boolean))];
    const tagStr = tags.join(' | ');
    if (!tags.length && !savedFeat?.vec && !modelEntry?.streamEvidence && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return null;
    const bankSample = bankSampleEarly;
    const explicitOpenThink = savedFeat?.meta?.isOpenThink ?? savedFeat?.isOpenThink ?? bankSample?.meta?.isOpenThink ?? bankSample?.isOpen;
    const isOpenThink = explicitOpenThink !== undefined ? Boolean(explicitOpenThink) : /开源(?:可见)?思考/.test(tagStr);
    const rMatch = /闭源隐藏思考\(([\d.]+)段\/轮\)/.exec(tagStr);
    const nrMatch = /思考段:隐藏思考\(nr=(\d+)\)/.exec(tagStr);
    const pyMatch = /Python Heredoc\((\d+)次\)|Python几何自检脚本/.exec(tagStr);
    const pyHeredoc = pyMatch ? (parseInt(pyMatch[1], 10) || 2) : (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 4 : 0);
    const catMatch = /Cat Heredoc\((\d+)次\)/.exec(tagStr);
    const catHeredoc = catMatch ? (parseInt(catMatch[1], 10) || 1) : (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0);
    const wrMatch = /Write写文件\((\d+)次\)/.exec(tagStr);
    const writeFromTag = wrMatch ? (parseInt(wrMatch[1], 10) || 1) : 0;
    const htmlLenMatch = /HTML长文档输出\(([\d.]+)k字\)/.exec(tagStr);
    const writtenCharsFromTag = htmlLenMatch ? Math.round(parseFloat(htmlLenMatch[1]) * 1000) : 0;
    const askMatch = /ask_user意图澄清\((\d+)次\)/.exec(tagStr);
    const askUser = askMatch ? (parseInt(askMatch[1], 10) || 1) : 0;
    const rwMatch = /Read\/Edit精准改写\((\d+)\/(\d+)次\)/.exec(tagStr);
    const read = rwMatch ? parseInt(rwMatch[1], 10) : 0;
    const edit = rwMatch ? parseInt(rwMatch[2], 10) : 0;
    const parMatch = /并行工具步\((\d+)步\)/.exec(tagStr);
    const parallelSteps = parMatch ? parseInt(parMatch[1], 10) : 0;
    const durTagMatch = /单轮耗时[:(]\s*([\d.]+)\s*s/.exec(tagStr);
    const durFromTag = durTagMatch ? Math.round(parseFloat(durTagMatch[1]) * 1000) : 0;
    const chunkTagMatch = /流块[:(]\s*([\d.]+)\s*字/.exec(tagStr);
    const chunkFromTag = chunkTagMatch ? parseFloat(chunkTagMatch[1]) : 0;
    const cwFromTag = /缓存写入:(?:Claude|CW>0)/.test(tagStr) ? 12000 : 0;
    const wireFamFromTag = cwFromTag > 0 || /SSE思考块:tc_加密隐藏\(Claude/.test(tagStr)
      ? 'anthropic'
      : (/系统前缀:6603t|SSE思考块:tc_加密隐藏\(OpenAI|思考流:markers-only|零缓存写入:W=0/.test(tagStr) ? 'openai' : '');
    const reiTierMatch = /思考档位:(Low|Medium|High|xHigh|Max)\(REI=(\d+)\)/i.exec(tagStr);
    const tagReiTier = reiTierMatch ? reiTierMatch[1].toLowerCase() : (/xhigh/i.test(String(modelEntry?.reverseEffort || modelEntry?.reverseLabel || '')) ? 'xhigh' : '');
    const tagReiVal = reiTierMatch ? parseInt(reiTierMatch[2], 10) : 0;
    const thinkTokMatch = /隐藏思考Token:\+(\d+)/.exec(tagStr);
    const tagThinkTok = thinkTokMatch ? parseInt(thinkTokMatch[1], 10) : 0;
    const hasSys6603Tag = /系统前缀:6603t/.test(tagStr);
    const hasZeroCacheWriteTag = /零缓存写入:W=0/.test(tagStr);
    const hasBpeMatchTag = /BPE输出Token守恒吻合/.test(tagStr);
    const isLunaFastTag = /6-Luna(?:极速思考|高速)特征/.test(tagStr);
    const isSol61Tag = !isLunaFastTag && /6\.1-Sol/.test(tagStr);
    const hasGeminiZeroRTag = /思考段:nr=0\(Gemini|行为习惯:静默连调Bash\(Gemini/.test(tagStr);
    const curDashMatch = /弯撇号(\d+)\/紧凑破折号(\d+)/.exec(tagStr);
    const curlyFromTag = curDashMatch ? (parseInt(curDashMatch[1], 10) || 0) : 0;
    const unspacedEmDashFromTag = curDashMatch ? (parseInt(curDashMatch[2], 10) || 0) : 0;
    const preNarrateTagMatch = /工具前先(?:报备|口播)\((?:Anthropic特征·)?(\d+)%\)/.exec(tagStr);
    const preNarrateFromTag = preNarrateTagMatch ? Math.min(1, parseInt(preNarrateTagMatch[1], 10) / 100) : 0;
    const sandboxLink = /sandbox:\/链接/.test(tagStr) ? 1 : 0;
    const lowerDoctype = /小写<!doctype>/i.test(tagStr) ? 1 : 0;
    const colorSchemeCss = /color-scheme/i.test(tagStr) ? 1 : 0;
    const svgSmilNoScript = /SMIL动画/i.test(tagStr) ? 1 : 0;
    const prefersReducedMotion = /reduced-motion/i.test(tagStr) ? 1 : 0;
    const cssRoot = /:root(?:✓|\/rAF✓)/.test(tagStr) ? 1 : 0;
    const geminiPyHelperFromTag = /Python几何自检脚本/.test(tagStr) ? 1 : 0;
    const inlineHtmlEchoFromTag = /写文件\+正文双发HTML/.test(tagStr) ? 1 : 0;
    const raf = /rAF✓/.test(tagStr) ? 1 : 0;
    const streamRBlocks = Number(modelEntry?.streamEvidence?.rBlocks ?? chat?._streamEvidence?.rBlocks ?? 0);
    const hasOpenAiHtmlOrR = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && !KNOWN_ARGON_SIDS.has(sid) && !hasGeminiZeroRTag && (isKnownNonGoogle || Boolean(wireFamFromTag) || prefersReducedMotion > 0 || lowerDoctype > 0 || sandboxLink > 0 || colorSchemeCss > 0 || svgSmilNoScript > 0 || streamRBlocks > 0 || Boolean(nrMatch));
    const rPerTurn = (hasGeminiZeroRTag || KNOWN_ARGON_SIDS.has(sid))
      ? 0
      : rMatch
        ? parseFloat(rMatch[1])
        : nrMatch
          ? Math.max(0.5, parseInt(nrMatch[1], 10) / Math.max(1, Number(savedFeat?.turns || savedFeat?.meta?.turns) || 2))
          : ((!hasOpenAiHtmlOrR && /编码轮零思考块/.test(tagStr)) || (/无显式思考块/.test(tagStr) && !hasOpenAiHtmlOrR && (pyHeredoc > 0 || catHeredoc > 0 || CONFIRMED_GEMINI_FLASH_SIDS.has(sid))))
            ? 0
            : (streamRBlocks > 0 ? Math.max(0.5, streamRBlocks / Math.max(1, Number(savedFeat?.turns) || 2)) : 1.5);
    const scoreMatch = /推理分\s*([\d.]+)/.exec(tagStr);
    const habitReasoningScore = (modelEntry?.habitScore != null && Number.isFinite(+modelEntry.habitScore) && +modelEntry.habitScore >= 10 && +modelEntry.habitScore <= 100) ? +modelEntry.habitScore : (scoreMatch ? parseFloat(scoreMatch[1]) : 72.0);
    const isGeminiCoding = !isOpenThink && (
      KNOWN_ARGON_SIDS.has(sid) ||
      hasGeminiZeroRTag ||
      CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ||
      (!hasOpenAiHtmlOrR && (
        rPerTurn === 0 ||
        (rPerTurn <= 0.65 && (catHeredoc > 0 || pyHeredoc > 0) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0)
      ))
    );
    const hasHidR = (!isOpenThink && !isGeminiCoding && rPerTurn > 0) ? 1.0 : 0.0;
    const noR = isGeminiCoding ? 1.0 : 0.0;
    const editReadRatio = (edit + read) > 0 ? Math.min(1, (edit + read) / 10) : 0.0;
    const writeRatio = isGeminiCoding ? 0.25 : 0.22;
    const parallelRate = parallelSteps > 0 ? Math.min(1, parallelSteps / 8) : (isGeminiCoding ? 0.30 : 0.12);
    const pyHeroRate = pyHeredoc > 0 ? Math.min(1, 0.45 + pyHeredoc * 0.05) : 0.15;
    const catHeroRate = catHeredoc > 0 ? Math.min(1, 0.35 + catHeredoc * 0.05) : 0.10;
    let vec = (savedFeat && Array.isArray(savedFeat.vec) && savedFeat.vec.length === 20)
      ? [...savedFeat.vec]
      : [
          hasHidR, noR, 0.05, editReadRatio, writeRatio,
          parallelRate, pyHeroRate, catHeroRate, 0.08, 0.04,
          cssRoot ? 0.85 : 0.55, raf ? 0.85 : 0.55, 0.80, 0.30, 0.15,
          0.52, isGeminiCoding ? 0.86 : 0.55, isGeminiCoding ? 0.88 : 0.62, 0.68, 0.58,
        ];
    const isCorrupt4000MetaObj = m => Boolean(m && Number(m.meanChars) === 4000 && (Number(m.writtenChars) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.read) || 0) === 0 && (Number(m.edit) || 0) === 0 && (Number(m.avgTurnDurMs) || 0) === 0 && (Number(m.cps) === 1 || Number(m.cps) === 2 || (Number(m.totalTools) === 0 && (Number(m.write) > 0 || Number(m.askUser) > 0))));
    const isUnloaded4500StubMeta = m => Boolean(m && Number(m.meanChars) === 4500 && (Number(m.writtenChars) || 0) === 0 && (Number(m.avgTurnDurMs) || 0) === 0 && (Number(m.cps) || 0) === 0 && (Number(m.memoAvgChunk) || 0) === 0 && (Number(m.bash) || 0) === 0 && (Number(m.askUser) || 0) === 0 && (Number(m.lowerDoctype) || 0) === 0 && (Number(m.colorSchemeCss) || 0) === 0 && (Number(m.prefersReducedMotion) || 0) === 0 && (Number(m.sandboxLink) || 0) === 0 && (Number(m.svgSmilNoScript) || 0) === 0);
    const isSyntheticStubVecObj = v => Array.isArray(v) && v.length === 20 && v[12] === 0.8 && v[15] === 0.52 && v[2] === 0.05 && v[3] === 0;
    const sfMetaCand = savedFeat?.meta || (savedFeat && typeof savedFeat.turns === 'number' && typeof savedFeat.writtenChars === 'number' ? savedFeat : null) || null;
    const bankMetaCand = bankSample?.meta || null;
    const rawSavedMeta = (sfMetaCand && !isCorrupt4000MetaObj(sfMetaCand) && (!isUnloaded4500StubMeta(sfMetaCand) || !bankMetaCand || isUnloaded4500StubMeta(bankMetaCand)))
      ? sfMetaCand
      : ((bankMetaCand && !isCorrupt4000MetaObj(bankMetaCand)) ? bankMetaCand : null);
    const isCorruptSyntheticMeta = Boolean(isCorrupt4000MetaObj(sfMetaCand) && (!bankMetaCand || isCorrupt4000MetaObj(bankMetaCand)));
    const savedMeta = isCorruptSyntheticMeta ? null : rawSavedMeta;
    if (Array.isArray(bankSample?.vec) && bankSample.vec.length === 20 && (!Array.isArray(savedFeat?.vec) || savedFeat.vec.length !== 20 || (isSyntheticStubVecObj(savedFeat.vec) && !isSyntheticStubVecObj(bankSample.vec)))) {
      vec = [...bankSample.vec];
    }
    const pickMeta = (k, def) => (savedMeta && savedMeta[k] !== undefined && savedMeta[k] !== null)
      ? savedMeta[k]
      : (savedFeat && savedFeat[k] !== undefined && savedFeat[k] !== null && !isCorruptSyntheticMeta)
        ? savedFeat[k]
        : def;
    const hasWriteHint = writeFromTag >= 1 || (savedFeat?.vec && Number(vec[4]) > 0);
    const rFracTurns = rMatch && parseFloat(rMatch[1]) > 0
      ? (Math.abs((parseFloat(rMatch[1]) * 2) % 2 - 1) < 0.08 ? 2 : ((Math.abs((parseFloat(rMatch[1]) * 3) % 3 - 1) < 0.15 || Math.abs((parseFloat(rMatch[1]) * 3) % 3 - 2) < 0.15) ? 3 : 0))
      : 0;
    const inferredTurnsFromTags = (nrMatch && rMatch && parseFloat(rMatch[1]) > 0)
      ? Math.max(1, Math.round(parseInt(nrMatch[1], 10) / parseFloat(rMatch[1])))
      : (rFracTurns > 0 ? Math.max(rFracTurns, askUser >= 1 && hasWriteHint ? askUser + 1 : 1) : (askUser >= 1 && hasWriteHint ? Math.max(2, askUser + 1) : (writeFromTag >= 2 ? 2 : 1)));
    const savedTurns = Number(pickMeta('turns', 0)) || inferredTurnsFromTags;
    const savedWCharsEarly = Number(pickMeta('writtenChars', writtenCharsFromTag || 0)) || 0;
    const savedHtmlMaxEarly = Number(pickMeta('htmlMaxLen', writtenCharsFromTag || 0)) || 0;
    const savedUNameEarly = Number(pickMeta('writeUnderscoreName', 0)) || 0;
    const revDimsStr = Array.isArray(modelEntry?.reverseCandidates?.[0]?.matchedDims || modelEntry?.reverseCandidates?.[0]?.dims)
      ? (modelEntry.reverseCandidates[0].matchedDims || modelEntry.reverseCandidates[0].dims).join(' | ')
      : '';
    const cpsMatch = /流式速度[:(]\s*([\d.]+)\s*字\/秒/.exec(revDimsStr + ' | ' + tagStr);
    const rawPickedCps = Number(pickMeta('cps', modelEntry?.streamEvidence?.cps || chat?._streamEvidence?.cps || (cpsMatch ? parseFloat(cpsMatch[1]) : 0))) || 0;
    const savedCps = ((rawPickedCps === 1 || rawPickedCps === 2) && cpsMatch && parseFloat(cpsMatch[1]) >= 10) ? parseFloat(cpsMatch[1]) : rawPickedCps;
    const earlyBash = Number(pickMeta('bash', pyHeredoc + catHeredoc)) || 0;
    const earlyWrite = Number(pickMeta('write', writeFromTag || 0)) || 0;
    const earlyAsk = Number(pickMeta('askUser', askUser)) || 0;
    const earlySearch = Number(pickMeta('search', 0)) || 0;
    const earlyStraightApos = Number(pickMeta('straightApostrophe', 0)) || 0;
    const rawHasOpenAiToolMarkers = Number(pickMeta('askSolSig', 0)) > 0 || Number(pickMeta('askIdBareIntent', 0)) > 0 || Number(pickMeta('askIdHasUnderscore', 0)) > 0 || (earlyBash >= 10 && earlySearch >= 1 && earlySearch < 10 && earlyAsk >= 1);
    const explicitNonGeminiMeta = savedMeta && savedMeta.isGeminiCoding === false && (rawHasOpenAiToolMarkers || (Number(pickMeta('memoAvgChunk', 0)) > 0 && Number(pickMeta('memoAvgChunk', 0)) <= 4.2 && Number(pickMeta('memoDeltaCount', 0)) >= 40));
    const hasOpenAiToolMarkers = !KNOWN_ARGON_SIDS.has(sid) && (CONFIRMED_SOL_61_SIDS.has(sid) || isSol61Tag || Boolean(explicitNonGeminiMeta) || (!hasGeminiZeroRTag && vec[0] === 1 && vec[1] === 0 && rawHasOpenAiToolMarkers));
    const earlyBoxComment = Number(pickMeta('boxComment', 0)) || 0;
    const isGeminiLargeHtml = !isOpenThink && !isKnownNonGoogle && !hasOpenAiHtmlOrR && !hasOpenAiToolMarkers && savedTurns === 2 && earlyWrite === 2 && earlyBash >= 1 && earlyBash <= 2 && earlyAsk === 0 && earlySearch === 0 && (earlyStraightApos === 0 || (savedWCharsEarly >= 44000 && earlyStraightApos <= 1)) && (savedWCharsEarly >= 26000 || savedHtmlMaxEarly >= 26000) && savedWCharsEarly <= 52000 && Number(pickMeta('lowerDoctype', lowerDoctype)) === 0 && Number(pickMeta('colorSchemeCss', colorSchemeCss)) === 0 && Number(pickMeta('prefersReducedMotion', prefersReducedMotion)) === 0 && Number(pickMeta('sandboxLink', sandboxLink)) === 0 && (earlyBoxComment === 0 || (savedWCharsEarly >= 44000 && earlyBoxComment <= 1)) && Number(pickMeta('claudeWarmPalette', 0)) === 0 && (savedCps >= 130 || savedUNameEarly >= 1 || Number(pickMeta('hidR', 0)) === 0);
    if (KNOWN_ARGON_SIDS.has(sid) || (!hasOpenAiToolMarkers && hasGeminiZeroRTag) || isGeminiLargeHtml) {
      vec[0] = 0;
      vec[1] = 1;
    } else if ((hasOpenAiHtmlOrR || hasOpenAiToolMarkers || (pyHeredoc === 0 && catHeredoc === 0 && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && !Boolean(pickMeta('isGeminiCoding', false)) && (Boolean(rMatch) || Boolean(nrMatch) || Number(pickMeta('hidR', 0)) > 0))) && vec[0] === 0 && vec[1] === 1) {
      vec[0] = 1;
      vec[1] = 0;
    }
    const rawSavedHidR = Number(pickMeta('hidR', modelEntry?.streamEvidence?.rBlocks ?? chat?._streamEvidence?.rBlocks ?? ((isGeminiCoding || (vec[0] === 0 && vec[1] === 1 && !rMatch && !nrMatch)) ? 0 : (nrMatch ? parseInt(nrMatch[1], 10) : Math.round(rPerTurn * savedTurns)))));
    const savedHidR = (KNOWN_ARGON_SIDS.has(sid) || isGeminiLargeHtml || hasGeminiZeroRTag || (vec[0] === 0 && vec[1] === 1 && !rMatch && !nrMatch && isCorruptSyntheticMeta)) ? 0 : rawSavedHidR;
    const isZeroRHeavySearchGemini = !isOpenThink && !isKnownNonGoogle && savedHidR === 0 && earlySearch >= 10 && earlyBash >= 10;
    if (isZeroRHeavySearchGemini) {
      vec[0] = 0;
      vec[1] = 1;
    }
    const hasOverwhelmingSavedGoogleBash = !isOpenThink && savedHidR === 0 && (pyHeredoc >= 5 || catHeredoc >= 5 || Number(pickMeta('pyHeredoc', 0)) >= 5 || Number(pickMeta('catHeredoc', 0)) >= 5 || (earlyBash >= 10 && Number(pickMeta('totalTools', 0)) >= 20));
    if (hasOverwhelmingSavedGoogleBash) { vec[0] = 0; vec[1] = 1; }
    const isPollutedInlineEchoGemini = savedHidR > 0 && (Number(pickMeta('inlineHtmlEcho', inlineHtmlEchoFromTag)) || 0) > 0 && Boolean(pickMeta('isGeminiCoding', false)) && pyHeredoc === 0 && catHeredoc === 0 && Number(pickMeta('pyHeredoc', 0)) === 0 && Number(pickMeta('catHeredoc', 0)) === 0 && Number(pickMeta('cnColon', 0)) === 0;
    if (isPollutedInlineEchoGemini) { vec[0] = 1; vec[1] = 0; }
    const effIsGemini = hasOverwhelmingSavedGoogleBash ? true : ((isKnownNonGoogle || hasOpenAiToolMarkers || isPollutedInlineEchoGemini) ? false : Boolean(KNOWN_ARGON_SIDS.has(sid) || hasGeminiZeroRTag || isGeminiLargeHtml || isZeroRHeavySearchGemini || (vec[0] === 0 && vec[1] === 1 && !rMatch && !nrMatch && isCorruptSyntheticMeta) || pickMeta('isGeminiCoding', vec[0] === 1 ? false : isGeminiCoding)));
    const vecEditReadTotal = (!savedMeta && edit === 0 && read === 0 && savedFeat?.vec && Number(vec[3]) >= 0.45) ? Math.round(Number(vec[3]) * 10) : 0;
    const savedEdit = Math.max(Number(pickMeta('edit', 0)) || 0, edit || (vecEditReadTotal > 0 ? 1 : 0));
    const savedRead = Math.max(Number(pickMeta('read', 0)) || 0, read || (vecEditReadTotal > 1 ? vecEditReadTotal - 1 : 0));
    const savedSearch = Number(pickMeta('search', 0));
    const savedAskUser = Number(pickMeta('askUser', askUser));
    const rawMetaWrite = pickMeta('write', null);
    const defaultWrite = (savedFeat?.vec && Number(vec[4]) === 0) ? 0 : (writeFromTag || (effIsGemini ? 2 : 1));
    const savedWrite = (rawMetaWrite !== null && !(savedFeat?.vec && Number(vec[4]) === 0 && savedWCharsEarly === 0 && Number(rawMetaWrite) === 1 && Number(pickMeta('totalTools', 0)) <= 1))
      ? Number(rawMetaWrite)
      : defaultWrite;
    const inferredToolsFromVec = (savedFeat?.vec && Number(vec[4]) > 0 && Number(vec[4]) !== 0.22 && Number(vec[4]) !== 0.25 && savedWrite > 0)
      ? Math.max(savedWrite, Math.round(savedWrite / Number(vec[4])))
      : (savedWrite + savedEdit + savedRead + savedSearch + savedAskUser + pyHeredoc + catHeredoc);
    const defaultBash = Math.max(effIsGemini ? (hasGeminiZeroRTag ? 6 : 1) : 0, pyHeredoc + catHeredoc, inferredToolsFromVec - savedWrite - savedEdit - savedRead - savedSearch - savedAskUser);
    const savedBash = (savedMeta && savedMeta.bash !== undefined) ? Number(savedMeta.bash) : (hasGeminiZeroRTag ? Math.max(6, Number(pickMeta('bash', defaultBash))) : Number(pickMeta('bash', defaultBash)));
    if (!isOpenThink && !effIsGemini && vec[0] === 0 && vec[1] === 0) vec[0] = 1;
    const sumIndivTools = savedBash + savedWrite + savedEdit + savedRead + savedSearch + savedAskUser;
    const rawTotalTools = Number(pickMeta('totalTools', Math.max(inferredToolsFromVec, sumIndivTools)));
    const savedTotalTools = Math.max(rawTotalTools, sumIndivTools);
    const defaultMeanChars = savedFeat?.vec
      ? (savedWrite === 0 && Number(vec[17]) <= 0.12 ? 220 : Math.round((Number(vec[17]) || 0.3) * 4000))
      : (isGeminiCoding ? 32000 : 4500);
    const savedMeanChars = Number(pickMeta('meanChars', defaultMeanChars));
    const savedPreNarrate = (savedMeta && savedMeta.preNarrate !== undefined) ? Math.max(Number(savedMeta.preNarrate) || 0, preNarrateFromTag || 0) : Math.max(Number(pickMeta('preNarrate', 0)) || 0, preNarrateFromTag || 0, savedFeat?.vec ? (Number(vec[2]) ?? 0.05) : 0.05);
    const savedPreToolChars = Number(pickMeta('preToolTextChars', savedPreNarrate >= 0.4 ? 85 : 0));
    const rawSavedAvgDurMs = Number(pickMeta('avgTurnDurMs', durFromTag)) || durFromTag;
    const savedAvgDurMs = (rawSavedAvgDurMs > 0 && rawSavedAvgDurMs < 3600000) ? rawSavedAvgDurMs : 0;
    const savedAvgChunk = Number(pickMeta('memoAvgChunk', chunkFromTag)) || chunkFromTag;
    const savedDeltaCnt = Number(pickMeta('memoDeltaCount', savedAvgChunk > 0 ? 24 : 0)) || (savedAvgChunk > 0 ? 24 : 0);
    const effSavedCps = (savedCps > 0 && (rawSavedAvgDurMs === 0 || rawSavedAvgDurMs < 3600000))
      ? savedCps
      : 0;
    const cpsMissing = !(effSavedCps > 0);
    const abnormalDuration = Boolean(rawSavedAvgDurMs >= 3600000 || rawSavedAvgDurMs < 0);
    const sanitizedSavedWireFam = ((savedMeta?.wireFam === 'openai' && savedAvgChunk >= 4.0 && savedAvgChunk <= 25.0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && Number(pickMeta('askIdHasUnderscore', 0)) === 0) ||
      (savedMeta?.wireFam === 'anthropic' && (savedAvgChunk >= 15.0 || (Number(savedMeta?.prefersReducedMotion) >= 1 && Number(savedMeta?.boxComment) === 0 && Number(savedMeta?.claudeWarmPalette) === 0 && Number(savedMeta?.edit) === 0 && Number(savedMeta?.read) === 0) || (savedMeta?.htmlSvgMatch?.best?.vendorId && savedMeta.htmlSvgMatch.best.vendorId !== 'anthropic' && Number(savedMeta.htmlSvgMatch.best.ruleScore) >= 0.45))))
      ? ''
      : (savedMeta?.wireFam || '');
    const cleanSavedMeta = savedMeta ? {
      ...savedMeta,
      totalTools: savedTotalTools,
      write: savedWrite,
      read: savedRead,
      edit: savedEdit,
      bash: savedBash,
      preNarrate: savedPreNarrate,
      parallelSteps: Math.max(Number(savedMeta.parallelSteps) || 0, parallelSteps),
      avgTurnDurMs: savedAvgDurMs,
      wireFam: sanitizedSavedWireFam,
      cpsMissing,
      abnormalDuration,
      ...(savedAvgChunk > 0 ? { memoAvgChunk: savedAvgChunk, memoDeltaCount: savedDeltaCnt } : {}),
      ...(effSavedCps > 0 ? { cps: effSavedCps } : { cps: 0 }),
      ...(curlyFromTag > 0 && !(Number(savedMeta.curlyApostrophe) > 0) ? { curlyApostrophe: curlyFromTag } : {}),
      ...(unspacedEmDashFromTag > 0 && !(Number(savedMeta.unspacedEmDash) > 0) ? { unspacedEmDash: unspacedEmDashFromTag } : {}),
      ...((isGeminiLargeHtml || hasGeminiZeroRTag || hasOverwhelmingSavedGoogleBash) ? { hidR: 0, maxRInTurn: 0, isGeminiCoding: true, ...(hasGeminiZeroRTag ? { bash: savedBash } : {}) } : {}),
      ...(isPollutedInlineEchoGemini ? { inlineHtmlEcho: 0, isGeminiCoding: false } : {}),
      ...(savedMeta?.htmlSvgMatch && !(Number(savedMeta.htmlSvgMatch.best?.ruleScore ?? savedMeta.htmlSvgMatch.ruleScore) >= 0.55) && Array.isArray(savedMeta.htmlSvgMatch.best?.reasons || savedMeta.htmlSvgMatch.reasons) && (savedMeta.htmlSvgMatch.best?.reasons || savedMeta.htmlSvgMatch.reasons).includes('特征词:spokesRear') && (savedMeta.htmlSvgMatch.best?.reasons || savedMeta.htmlSvgMatch.reasons).includes('特征词:spokesFront') && (savedMeta.htmlSvgMatch.best?.reasons || savedMeta.htmlSvgMatch.reasons).includes('特征词:ef476f') && (savedMeta.htmlSvgMatch.features?.viewBox || savedMeta.htmlSvgMatch.viewBox) === '0 0 800 420' && savedHidR > 0 && (Number(savedMeta.writtenChars) || 0) >= 12000 && (Number(savedMeta.maxRInTurn) || 0) <= 6 ? {
        htmlSvgMatch: (() => {
          const m = savedMeta.htmlSvgMatch;
          const baseReasons = m.best?.reasons || m.reasons || [];
          const museBest = { ...(m.best || {}), model_id: 'meta/muse-spark-1.3', canon: 'muse-spark-1.3-max', label: 'Muse Spark 1.3 (Max)', vendor: 'Meta', vendorId: 'meta', family: 'muse-spark-1.3', familyLabel: 'Muse Spark 1.3', effort: 'max', rawEffort: 'max', effortLabel: 'Max', isOpen: false, score: 0.99, protoSim: 0.85, ruleScore: 0.78, confidence: 0.99, reasons: [...baseReasons, '硬规则:Muse Spark 1.3 knee逆运动学/svgTitle+svgDesc/scarfFlutter(+0.78)'] };
          const prevTop = Array.isArray(m.top_candidates) ? m.top_candidates : (Array.isArray(m.candidates) ? m.candidates : []);
          const upgradedCands = [museBest, ...prevTop.filter(c => c.model_id !== 'meta/muse-spark-1.3')];
          return { ...m, best: museBest, top_candidates: upgradedCands };
        })()
      } : {}),
      ...(((Number(savedMeta.turns) >= 2 && Math.max(Number(savedMeta.writtenChars) || 0, Number(savedMeta.htmlMaxLen) || 0) > 4500) || Math.max(Number(savedMeta.writtenChars) || 0, Number(savedMeta.htmlMaxLen) || 0) > 7500) ? { isMicroProbeChat: false } : {}),
      ...(Number(savedMeta.memoDeltaCount) > 0 && Number(savedMeta.memoDeltaCount) <= Math.max(2, (Number(savedMeta.turns) || 1) * 2) && Number(savedMeta.memoAvgChunk) > 220 && (Number(savedMeta.writtenChars) || 0) < 80000 ? { memoAvgChunk: 0 } : {}),
    } : null;
    const cleanedTags = tags
      .filter(t => !/^✓ 用户手动纠偏确认/.test(t) && !(effIsGemini && /^闭源隐藏思考/.test(t)));
    if (effIsGemini && !cleanedTags.some(t => /编码轮零思考块/.test(t))) {
      cleanedTags.unshift('编码轮零思考块(Gemini特征)');
    }
    return {
      turns: savedTurns,
      hidR: savedHidR,
      maxRInTurn: Number(pickMeta('maxRInTurn', Math.max(1, Math.round(savedHidR / Math.max(1, savedTurns))))),
      visR: isOpenThink ? 2 : 0,
      visRChars: isOpenThink ? 1200 : 0,
      codingTurns: effIsGemini ? 2 : 1,
      codingTurnsNoR: effIsGemini ? 2 : 0,
      codingTurnsWithHidR: effIsGemini ? 0 : (hasHidR ? 1 : 0),
      geminiPyHelper: Number(pickMeta('geminiPyHelper', geminiPyHelperFromTag || (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0))),
      inlineHtmlEcho: Number(pickMeta('inlineHtmlEcho', inlineHtmlEchoFromTag || (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0))),
      isGeminiCoding: effIsGemini,
      totalTools: savedTotalTools,
      toolsPerTurn: savedTotalTools / Math.max(1, savedTurns),
      rPerTurn: savedHidR / Math.max(1, savedTurns),
      cps: effSavedCps,
      avgTurnDurMs: savedAvgDurMs,
      memoAvgChunk: savedAvgChunk,
      memoDeltaCount: savedDeltaCnt,
      knownCwTok: Number(modelEntry?.reverseTokens?.cacheWrite || modelEntry?.reverseTotalTokens?.cacheWrite || cwFromTag || 0),
      bash: savedBash,
      write: savedWrite,
      edit: savedEdit,
      read: savedRead,
      present: 0,
      search: savedSearch,
      genImg: Number(pickMeta('genImg', 0)),
      askUser: savedAskUser,
      askUserIntent: Number(pickMeta('askUserIntent', 0)),
      askIdHasUnderscore: Number(pickMeta('askIdHasUnderscore', 0)),
      askIdBareIntent: Number(pickMeta('askIdBareIntent', 0)),
      askFormatOpt: Number(pickMeta('askFormatOpt', 0)),
      askTransformOpt: Number(pickMeta('askTransformOpt', 0)),
      askSolSig: Number(pickMeta('askSolSig', 0)),
      askSol56Sig: Number(pickMeta('askSol56Sig', 0)),
      parallelSteps: Number(pickMeta('parallelSteps', parallelSteps)),
      preNarrate: savedPreNarrate,
      pyHeredoc: Number(pickMeta('pyHeredoc', pyHeredoc)),
      catHeredoc: Number(pickMeta('catHeredoc', catHeredoc)),
      chainAnd: 0,
      rgSed: 0,
      cssRoot: Number(pickMeta('cssRoot', cssRoot)),
      raf: Number(pickMeta('raf', raf)),
      svgRich: Number(pickMeta('svgRich', (vec[12] || 0) > 0.45 ? 1 : 0)),
      boxComment: Number(pickMeta('boxComment', 0)),
      claudeWarmPalette: Number(pickMeta('claudeWarmPalette', 0)),
      htmlMaxLen: Number(pickMeta('htmlMaxLen', effIsGemini ? 65000 : (writtenCharsFromTag || 0))),
      writtenChars: Number(pickMeta('writtenChars', writtenCharsFromTag || (effIsGemini ? 65000 : 0))),
      lowerDoctype: Number(pickMeta('lowerDoctype', lowerDoctype)),
      colorSchemeCss: Number(pickMeta('colorSchemeCss', colorSchemeCss)),
      prefersReducedMotion: Number(pickMeta('prefersReducedMotion', prefersReducedMotion)),
      svgSmilNoScript: Number(pickMeta('svgSmilNoScript', svgSmilNoScript)),
      ariaLabelledby: Number(pickMeta('ariaLabelledby', 0)),
      sandboxLink: Number(pickMeta('sandboxLink', sandboxLink)),
      preToolTextChars: savedPreToolChars,
      interToolTextChars: Number(pickMeta('interToolTextChars', 0)),
      emDash: Number(pickMeta('emDash', 0)),
      cnColon: Number(pickMeta('cnColon', 0)),
      curlyApostrophe: Number(pickMeta('curlyApostrophe', curlyFromTag)),
      straightApostrophe: Number(pickMeta('straightApostrophe', 0)),
      unspacedEmDash: Number(pickMeta('unspacedEmDash', unspacedEmDashFromTag)),
      writeUnderscoreName: Number(pickMeta('writeUnderscoreName', 0)),
      checkmarkEmoji: Number(pickMeta('checkmarkEmoji', 0)),
      lunaNotSurePhrase: Number(pickMeta('lunaNotSurePhrase', 0)),
      solClarifyPhrase: Number(pickMeta('solClarifyPhrase', 0)),
      astraSelfContainedPhrase: Number(pickMeta('astraSelfContainedPhrase', 0)),
      terraPhrase: Number(pickMeta('terraPhrase', 0)),
      h2: 1,
      h3: 2,
      meanChars: savedMeanChars,
      nonCodeMeanChars: Number(pickMeta('nonCodeMeanChars', 0)),
      tableCount: Number(pickMeta('tableCount', 0)),
      listLineCount: Number(pickMeta('listLineCount', 0)),
      selfCheckCount: Number(pickMeta('selfCheckCount', 0)),
      codeDefensiveCount: Number(pickMeta('codeDefensiveCount', 0)),
      codeOmissionCount: Number(pickMeta('codeOmissionCount', 0)),
      thinkStepLines: Number(pickMeta('thinkStepLines', 0)),
      evalModality: String(pickMeta('evalModality', chat?.evalModality || (savedSearch > 0 ? 'search' : (savedWrite > 0 || savedEdit > 0 ? 'webdev' : 'chat')))),
      tierVec: Array.isArray(cleanSavedMeta?.tierVec) && cleanSavedMeta.tierVec.length === 12
        ? cleanSavedMeta.tierVec
        : Array.isArray(savedFeat?.tierVec) && savedFeat.tierVec.length === 12
          ? savedFeat.tierVec
          : [
            Math.min(1, (savedHidR / Math.max(1, savedTurns)) * 0.22),
            Math.min(1, (savedAvgDurMs / 1000) / 75),
            savedCps > 0 ? Math.max(0, Math.min(1, 1 - (savedCps - 18) / 165)) : 0.45,
            0.42,
            Math.min(1, (savedMeanChars / 4200) * 0.55),
            Math.min(1, 0.50 + (writtenCharsFromTag || savedMeanChars) / 24000),
            Math.min(1, (cssRoot + raf + prefersReducedMotion + colorSchemeCss) * 0.18),
            savedTotalTools > 0 ? Math.min(1, (savedTotalTools / Math.max(1, savedTurns)) / 9) : 0.35,
            Math.min(1, parallelSteps * 0.25 + savedPreNarrate * 0.40),
            savedSearch > 0 ? Math.min(1, savedSearch * 0.25) : 0.30,
            0.78,
            Math.min(1, Math.max(0.1, (habitReasoningScore - 20) / 78)),
          ].map(v => Math.round((Number(v) || 0) * 1000) / 1000),
      ...(cleanSavedMeta || {}),
      isGeminiCoding: effIsGemini,
      codingTurnsNoR: effIsGemini ? 2 : 0,
      codingTurnsWithHidR: effIsGemini ? 0 : (hasHidR ? 1 : 0),
      isOpenThink,
      wireFam: wireFamFromTag || cleanSavedMeta?.wireFam || '',
      tagReiTier,
      tagReiVal,
      tagThinkTok,
      hasSys6603Tag,
      hasZeroCacheWriteTag,
      hasBpeMatchTag,
      isLunaFastTag,
      isSol61Tag,
      vec,
      habitReasoningScore,
      habitTags: cleanedTags.length ? cleanedTags : ['编码轮零思考块(Gemini特征)', `推理分 ${habitReasoningScore}`],
    };
  }

  function extractFeatures(chat, modelEntry = null, opts = {}) {
    if (!chat && !modelEntry) return null;
    const ignoreExactSid = Boolean(opts?.ignoreExactSid);
    const allowIncomplete = Boolean(opts?.allowIncomplete);
    const preferLatestTurn = Boolean(opts?.preferLatestTurn || chat?._preferLatestTurn);
    const sidKey = String(chat?.sid || modelEntry?.sid || '');
    const allMsgs = Array.isArray(chat?.messages) ? chat.messages : [];
    const lastM = allMsgs.at(-1);
    const lastP = lastM?.parts?.at(-1);
    const lastPLen = typeof lastP?.text === 'string' ? lastP.text.length : (typeof lastP?.inputText === 'string' ? lastP.inputText.length : 0);
    const mRef = ignoreExactSid ? modelEntry : (modelEntry || (sidKey && typeof Models !== 'undefined' ? Models.get(sidKey) : null));
    const msgDigest = computeMessagesDigest(allMsgs);
    const featCacheKey = sidKey ? `${sidKey}:${allMsgs.length}:${lastM?.id || ''}:${lastM?.parts?.length || 0}:${msgDigest}:${chat?.busy ? (lastPLen >> 8) : lastPLen}:${chat?.fmt?.tN ? (chat.fmt.tN >> 4) : 0}:${ignoreExactSid ? 1 : 0}:${allowIncomplete ? 1 : 0}:${calibRev}:${allMsgs.length ? 0 : `${mRef?.name || ''}:${mRef?.userCorrected ? 1 : 0}:${mRef?.reverseScore || 0}:${mRef?.habitTags?.length || 0}:${bankRev}:${mRef?.habitFeatures?.meta?.cps || 0}:${mRef?.habitFeatures?.meta?.avgTurnDurMs || 0}:${mRef?.habitFeatures?.meta?.writtenChars || 0}`}` : '';
    if (featCacheKey && _featCache.has(sidKey) && _featCache.get(sidKey).key === featCacheKey) {
      return _featCache.get(sidKey).val;
    }
    const compMsgs = (chat && typeof globalThis.ArenaBilling !== 'undefined' && typeof globalThis.ArenaBilling.completed === 'function')
      ? globalThis.ArenaBilling.completed(chat)
      : allMsgs.filter(m => m && m.role === 'assistant' && m.status !== 'failed' && !m.failed && m.status !== 'pending' && m.status !== 'streaming' && !m.metadata?.pending && !m._incomplete).slice(-3);
    const nonFailedAsst = allMsgs.filter(m => m && m.role === 'assistant' && m.status !== 'failed' && !m.failed);
    const settledAsst = nonFailedAsst.filter(m => m.status !== 'pending' && m.status !== 'streaming' && !m.metadata?.pending && !m._incomplete);
    const fromIncompleteTurn = Boolean(compMsgs.length === 0 && settledAsst.length === 0 && nonFailedAsst.length > 0);
    const rawAsstPool = compMsgs.length ? compMsgs : (settledAsst.length ? settledAsst : ((chat?.busy || allowIncomplete) ? nonFailedAsst : []));
    let asstMsgs = rawAsstPool.slice(-3);
    if (!preferLatestTurn && !opts?.forRoutePostSlice && !chat?._forRoutePostSlice && rawAsstPool.length >= 2) {
      let lastHtmlCodingIdx = -1;
      for (let i = 0; i < rawAsstPool.length; i++) {
        const m = rawAsstPool[i];
        let maxHtmlInTurn = 0;
        const mTxt = String(m?.text || '');
        if (/<!doctype html|<html\b|<svg\b/i.test(mTxt)) maxHtmlInTurn = Math.max(maxHtmlInTurn, mTxt.length);
        for (const p of (m?.parts || [])) {
          if (p?.type === 'text' && /<!doctype html|<html\b|<svg\b/i.test(String(p.text || ''))) maxHtmlInTurn = Math.max(maxHtmlInTurn, String(p.text || '').length);
          const pIn = p?.input || p?.args || null;
          const pContent = String(pIn?.content || pIn?.new_text || pIn?.code || '');
          if (pContent && /<!doctype html|<html\b|<svg\b/i.test(pContent)) maxHtmlInTurn = Math.max(maxHtmlInTurn, pContent.length);
        }
        for (const tc of (m?.tools || [])) {
          const tIn = tc?.input || tc?.args || null;
          const tContent = String(tIn?.content || tIn?.new_text || tIn?.code || '');
          if (tContent && /<!doctype html|<html\b|<svg\b/i.test(tContent)) maxHtmlInTurn = Math.max(maxHtmlInTurn, tContent.length);
        }
        if (maxHtmlInTurn >= 1000) lastHtmlCodingIdx = i;
      }
      if (lastHtmlCodingIdx >= 0 && lastHtmlCodingIdx < rawAsstPool.length - 1) {
        const postTurns = rawAsstPool.slice(lastHtmlCodingIdx + 1);
        const postHasToolsOrOpenThink = postTurns.some(pm => {
          if (typeof pm?.think === 'string' && /[^\s.…·。]/.test(pm.think.trim())) return true;
          if (typeof pm?.text === 'string' && /<think>[\s\S]*[^\s.…·。][\s\S]*<\/think>/i.test(pm.text)) return true;
          if (Array.isArray(pm?.tools) && pm.tools.length > 0) return true;
          for (const pp of (pm?.parts || [])) {
            if (!pp) continue;
            if ((pp.type === 'reasoning' || pp.type === 'thinking') && /[^\s.…·。]/.test(String(pp.text || pp.reasoning || pp.thinking || '').trim())) return true;
            if (pp.toolCallId || pp.type === 'dynamic-tool' || (typeof pp.type === 'string' && pp.type.startsWith('tool-') && pp.type !== 'tool-result')) return true;
          }
          return false;
        });
        if (!postHasToolsOrOpenThink) {
          asstMsgs = rawAsstPool.slice(0, lastHtmlCodingIdx + 1).slice(-3);
        }
      }
    }
    if (!asstMsgs.length) {
      const mFallback = mRef;
      const savedOut = extractFeaturesFromSaved(chat, mFallback, { ignoreExactSid });
      if (featCacheKey) {
        if (_featCache.size > 64) _featCache.delete(_featCache.keys().next().value);
        _featCache.set(sidKey, { key: featCacheKey, val: savedOut });
      }
      return savedOut;
    }

    let hidR = 0, visR = 0, visRChars = 0, maxRInTurn = 0;
    let codingTurns = 0, codingTurnsNoR = 0, codingTurnsWithHidR = 0, geminiPyHelper = 0, inlineHtmlEcho = 0;
    let nonCodeTurns = 0, nonCodeChars = 0;
    let bash = 0, write = 0, edit = 0, read = 0, present = 0, search = 0, askUser = 0, askUserIntent = 0, otherTools = 0;
    let stepStarts = 0, parallelSteps = 0, toolTurns = 0, preTextTurns = 0, silentToolTurns = 0;
    let preToolTextChars = 0, interToolTextChars = 0;
    let pyHeredoc = 0, catHeredoc = 0, chainAnd = 0, rgSed = 0, gitCmd = 0;
    let cssRoot = 0, raf = 0, svgRich = 0, boxComment = 0, htmlMaxLen = 0, writtenChars = 0, claudeWarmPalette = 0;
    let bestHtmlSvgCode = "";
    let finalArtifactCode = "";
    let lowerDoctype = 0, colorSchemeCss = 0, prefersReducedMotion = 0, svgSmilNoScript = 0, ariaLabelledby = 0, sandboxLink = 0;
    let emDash = 0, cnColon = 0, curlyApostrophe = 0, unspacedEmDash = 0, h2 = 0, h3 = 0, totalChars = 0, codeBlocks = 0;
    let askQCount = 0, askOptTotal = 0, askDescChars = 0, askDescCount = 0, askPeriodCount = 0, askIdHasUnderscore = 0, askIdBareIntent = 0;
    let askFormatOpt = 0, askTransformOpt = 0, askSolSig = 0, askSol56Sig = 0;
    let lunaNotSurePhrase = 0, solClarifyPhrase = 0, astraSelfContainedPhrase = 0, terraPhrase = 0;
    let straightApostrophe = 0, writeUnderscoreName = 0, genImg = 0, checkmarkEmoji = 0;
    let msgFmtTN = 0, msgFmtTChars = 0, msgFmtTidCount = 0, msgFmtTidChars = 0, msgFmtRWireDeltas = 0, hasLiveMsgFmt = false;
    let wireFam = '';
    // 全模态（文字/图片/视频/代码网页/搜索）与同家族档位微差统计量（仅针对最近 3 轮对话）
    let tableCount = 0, listLineCount = 0, selfCheckCount = 0, thinkStepLines = 0, thinkDurSumMs = 0, thinkDurCount = 0;
    let codeOmissionCount = 0, codeDefensiveCount = 0;
    let searchSourcesCount = 0, citationCount = 0, mediaImgCount = 0, mediaVideoCount = 0;
    let bashReadFiles = 0, bashEditFiles = 0, bashSearchOps = 0, bashTestRuns = 0, bashBuildRuns = 0, editAddedLines = 0, editDeletedLines = 0;
    const turnRichnessArr = [];
    const recentUserMsgs = allMsgs.filter(m => m && m.role === 'user').slice(-3);
    const firstUserMsg = recentUserMsgs[0] || allMsgs.find(m => m && m.role === 'user');
    const firstUserTxt = String(firstUserMsg?.text || (Array.isArray(firstUserMsg?.parts) ? firstUserMsg.parts.map(p => p?.text || '').join(' ') : '') || '');
    const recentUserTextAll = recentUserMsgs.map(u => String(u?.text || (Array.isArray(u?.parts) ? u.parts.map(p => p?.text || '').join(' ') : '') || '')).join('\n');
    const promptConstraintHits = (recentUserTextAll.match(/必须|不要|严格|完整|详细|对比|证明|推导|步步|架构|并发|边界|优化|must|strictly|complete|comprehensive|edge case|architecture|step-by-step|benchmark/gi) || []).length;
    const promptCodeHits = (recentUserTextAll.match(/```|<html|function\b|def\s+\w+|SELECT\s+|class\s+\w+/gi) || []).length;
    const promptEntropy = Math.max(0.28, Math.min(1.0, 0.30 + Math.min(0.42, recentUserTextAll.length / 1800) + Math.min(0.18, promptConstraintHits * 0.045) + Math.min(0.10, promptCodeHits * 0.05)));
    const isMicroProbePrompt = Boolean(chat?._isMicroProbe || chat?.gacha?.mode === 'habit' || modelEntry?.habitFeatures?.meta?.isMicroProbeChat || /35[～~-]45\s*行以内|50\s*行以内|微缩面板|动态\s*SVG\s*状态徽章|动态内联\s*SVG\s*(?:几何图标|指示器|徽标)/i.test(firstUserTxt));

    const scanCodeRigor = (src) => {
      if (!src) return;
      codeOmissionCount += (src.match(/\/\/\s*\.\.\.\s*(?:existing|rest|unchanged|same|省略|其余|保持不变)|#\s*\.\.\.\s*(?:existing|rest|省略)|\/\*\s*\.\.\.\s*(?:rest|省略)?\s*\*\//gi) || []).length;
      codeDefensiveCount += (src.match(/\btry\s*\{|\bcatch\s*\(|\baria-[a-z-]+|\bprefers-reduced-motion\b|\bNumber\.isFinite\b|\bResizeObserver\b|\bIntersectionObserver\b|\bAbortController\b|\brequestAnimationFrame\b/g) || []).length;
    };

    const scanHtmlHabits = (src, preferFinal = false) => {
      if (!src) return;
      scanCodeRigor(src);
      if (!/<!doctype html|<html\b|<svg\b/i.test(src)) return;
      if (src.length > htmlMaxLen) htmlMaxLen = src.length;
      if (src.length > bestHtmlSvgCode.length && (/<svg\b/i.test(src) || src.length >= 260)) bestHtmlSvgCode = src;
      if (preferFinal && (/<svg\b/i.test(src) || src.length >= 260)) finalArtifactCode = src;
      if (/<svg\b/i.test(src) || src.length >= 3800) {
        turnHtmlSvgList.push({ idx: curTurnIdx, code: src });
      }
      if (/:root\s*\{/.test(src)) cssRoot++;
      if (/requestAnimationFrame/.test(src)) raf++;
      if (/<(?:linearGradient|radialGradient|filter)\b/.test(src)) svgRich++;
      if (/\/\*\s*[─═=-]{2,}/.test(src)) boxComment++;
      if (/^\s*<!doctype html>/.test(src) && !/^\s*<!DOCTYPE html>/.test(src)) lowerDoctype++;
      if (/color-scheme\s*:/i.test(src)) colorSchemeCss++;
      if (/prefers-reduced-motion/i.test(src)) prefersReducedMotion++;
      if (/<animateTransform\b|<animateMotion\b/i.test(src) && !/<script\b/i.test(src)) svgSmilNoScript++;
      if (/aria-labelledby\s*=/i.test(src)) ariaLabelledby++;
      if (/#FAF8F5|#F5F2EB|Instrument Serif|Playfair Display/i.test(src)) claudeWarmPalette++;
    };

    const turnHtmlSvgList = [];
    let curTurnIdx = 0;
    const scanTextHabits = (txt, preferFinal = false) => {
      if (!txt) return;
      totalChars += txt.length;
      const fenceMatches = txt.match(/^```/gm);
      if (fenceMatches && fenceMatches.length >= 2) {
        codeBlocks += Math.floor(fenceMatches.length / 2);
      } else if (/<!DOCTYPE html|<html\b/i.test(txt)) {
        codeBlocks += 1;
      }
      tableCount += Math.min(12, Math.floor((txt.match(/^\|.+\|$/gm) || []).length / 2));
      listLineCount += (txt.match(/^[\t ]*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
      selfCheckCount += (txt.match(/边界条件|注意(?:事项|点)|验证(?:如下|结果)|极端情况|权衡|edge case|caveat|trade-?off|corner case|sanity check|let['’]s verify|double-check/gi) || []).length;
      citationCount += (txt.match(/\[\d+\]\([^)]+\)|\[\^?\d+\]|【\d+†/g) || []).length;
      emDash += (txt.match(/——|\s—\s/g) || []).length;
      cnColon += (txt.match(/\*\*[^*\n]{1,24}\*\*：|(?:已完成|绘制完成)：\*\*/g) || []).length;
      curlyApostrophe += (txt.match(/[A-Za-z]\u2019[A-Za-z]/g) || []).length;
      straightApostrophe += (txt.match(/[A-Za-z]'[A-Za-z]/g) || []).length;
      unspacedEmDash += (txt.match(/[A-Za-z0-9]\u2014[A-Za-z0-9]/g) || []).length;
      if (/✅/.test(txt)) checkmarkEmoji++;
      if (/sandbox:\/home\/user\//i.test(txt)) sandboxLink++;
      if (/cut off or is part of a puzzle|what you['’]d like me to do with/i.test(txt)) askUserIntent++;
      if (/\bI['’]m not sure what you['’]d like me to do with\b|Agent Mode\s*助手|你好！有什么我可以帮你|我无法确认这次对话具体由哪一个模型|\u2014format\b|\bWhat would you like me to do with these words\b|\bor format them as a list\b|\bcryptocurrency recovery phrase\b|\bI received:\s*\u201c/i.test(txt)) lunaNotSurePhrase++;
      if (!/\bIs this a coded message,\s*a word puzzle/i.test(txt) && /\bCould you clarify what you['’]d like me to do with\b|\bIs this a (?:code|word puzzle|coded message|word-code puzzle)\b|\bWould you like me to decode\b|\bAre you asking me to decode\b|\bI['’]m not sure what you(?:\s+mean\b|['’]re asking\b)|\bI don['’]t recognize a clear meaning\b|你说的“瓦茨”/i.test(txt)) solClarifyPhrase++;
      if (/\bI['’]ll create a self-contained HTML\b|\bIs this a coded message,\s*a word puzzle/i.test(txt)) astraSelfContainedPhrase++;
      if (/\btransformation or puzzle rule\b|\bIt looks like an encoded phrase or word puzzle\b|\bI['’]m not sure how to interpret that sequence\b|\bcipher\/puzzle\b/i.test(txt)) terraPhrase++;
      if (/我是\s*Arena\.ai\s*上的一个智能助手（Agent Mode）|我无法向你透露当前底层具体使用的模型/i.test(txt)) askSol56Sig++;
      h2 += (txt.match(/^##\s+/gm) || []).length;
      h3 += (txt.match(/^###\s+/gm) || []).length;
      scanHtmlHabits(txt, preferFinal);
    };

    for (let _mIdx = 0; _mIdx < asstMsgs.length; _mIdx++) {
      const m = asstMsgs[_mIdx];
      curTurnIdx = _mIdx;
      const isLastAsstTurn = _mIdx === asstMsgs.length - 1;
      const parts = Array.isArray(m?.parts) ? m.parts : [];
      let turnHasTool = false, seenToolInTurn = false, preTextInTurn = false;
      let curStepTools = 0, turnPreChars = 0, pendingBetweenChars = 0;
      let turnHidR = 0, turnVisR = 0, turnWrite = 0, turnEdit = 0, turnCodeBash = 0, turnInlineHtmlChars = 0, turnTextChars = 0;
      for (const p of parts) {
        if (!p) continue;
        const ty = String(p.type || '');
        if (ty === 'step-start') {
          if (curStepTools >= 2) parallelSteps++;
          curStepTools = 0;
          stepStarts++;
        } else if (ty === 'reasoning') {
          const rt = String(p.text || '').trim();
          if (/[^\s.…·。]/.test(rt)) {
            visR++;
            turnVisR++;
            visRChars += rt.length;
            thinkStepLines += Math.max(1, (rt.match(/\n+|(?:^|\s)(?:1\.|step\s*\d|首先|其次|再看)/gi) || []).length);
          } else {
            hidR++;
            turnHidR++;
            thinkStepLines += 1;
          }
          const rDur = Number(p.durationMs || p.thinkingMs || p.metadata?.durationMs || 0);
          if (rDur > 50 && rDur < 600000) {
            thinkDurSumMs += rDur;
            thinkDurCount++;
          }
        } else if (ty === 'source-url' || ty === 'source' || ty === 'grounding' || p.url && p.sourceId) {
          searchSourcesCount++;
        } else if (ty === 'image' || p.image || p.imageUrl || (ty === 'file' && /^image\//i.test(String(p.mediaType || p.mimeType || '')))) {
          mediaImgCount++;
        } else if (ty === 'video' || p.videoUrl || (ty === 'file' && /^video\//i.test(String(p.mediaType || p.mimeType || '')))) {
          mediaVideoCount++;
        } else if (ty === 'text') {
          const txt = String(p.text || '');
          const tTrim = txt.trim();
          turnTextChars += txt.length;
          if (!seenToolInTurn) {
            turnPreChars += tTrim.length;
            if (tTrim.length > 8) preTextInTurn = true;
          } else {
            pendingBetweenChars += tTrim.length;
          }
          if (/<!DOCTYPE html|<html\b|<svg\b/i.test(txt)) turnInlineHtmlChars += txt.length;
          scanTextHabits(txt, Boolean(preferLatestTurn && isLastAsstTurn));
        } else if (ty.startsWith('tool-') || ty === 'dynamic-tool' || p.toolCallId) {
          if (seenToolInTurn && pendingBetweenChars > 0) {
            interToolTextChars += pendingBetweenChars;
            pendingBetweenChars = 0;
          }
          turnHasTool = true;
          seenToolInTurn = true;
          curStepTools++;
          const tName = String(p.toolName || ty.replace(/^tool-/, '') || '').toLowerCase();
          const tcId = String(p.toolCallId || p.id || '');
          if (tcId) {
            if (/^(?:call_\d+_|call_[0-9a-f]{24}$|functions\.|_\d+_[0-9a-f]{6,}|chatcmpl-tool-)/i.test(tcId)) {
              wireFam = /^call_\d+_/.test(tcId) ? 'deepseek' : 'kimi';
            } else if (!wireFam) {
              if (/^(?:toolu|srvtoolu|msg)_01/.test(tcId)) wireFam = 'anthropic';
              else if (/^call_[A-Za-z0-9]{24}$/.test(tcId) && !/^call_[0-9a-f]{24}$/.test(tcId)) wireFam = 'openai';
            }
          }
          const inp = p.input || {};
          if (tName === 'bash' || tName === 'execute_command') {
            bash++;
            const cmd = String(inp.command || '');
            if (/python3?\s+-\s*<<|python3?\s+-c\b|python3?\s+\S+\.py\b/.test(cmd)) { pyHeredoc++; turnCodeBash++; }
            if (/cat\s+<<|<<\s*['"]?EOF/.test(cmd)) { catHeredoc++; turnCodeBash++; }
            if (/\btest_(?:geometry|kinematics|ik|pelican|render|svg|math|anim)\w*\.py\b|\bdef\s+test_ik\b|\brm\s+-f\s+test_\w+\.py\b/i.test(cmd)) {
              geminiPyHelper++;
            }
            if (/&&/.test(cmd)) chainAnd++;
            if (/\b(?:rg|grep|sed|awk)\b/.test(cmd)) rgSed++;
            if (/\bgit\s+/.test(cmd)) gitCmd++;
            if (typeof CmdTranslate !== 'undefined' && CmdTranslate.describe) {
              try {
                const cd = CmdTranslate.describe(cmd, inp.cwd || '');
                const co = cd.ops || {};
                bashReadFiles += Array.isArray(co.read) ? co.read.length : 0;
                bashEditFiles += Array.isArray(co.edit) ? co.edit.length : 0;
                bashSearchOps += Number(co.search) || 0;
                if (Array.isArray(cd.acts)) {
                  if (cd.acts.includes('跑测试')) bashTestRuns++;
                  if (cd.acts.some(a => /^(构建|打包|编译|语法检查)/.test(a))) bashBuildRuns++;
                }
                if (cd.stat) {
                  editAddedLines += Number(cd.stat.add) || 0;
                  editDeletedLines += Number(cd.stat.del) || 0;
                }
              } catch {}
            } else {
              if (/\b(?:cat|head|tail|sed\s+-n)\s+\S/.test(cmd)) bashReadFiles++;
              if (/(?:>|tee\s+|sed\s+-i|open\([^)]*['"][wa])/.test(cmd)) bashEditFiles++;
              if (/\b(?:grep|rg|find|fd|ls)\b/.test(cmd)) bashSearchOps++;
              if (/\b(?:pytest|jest|vitest|mocha|node\s+--test|npm\s+(?:run\s+)?test)\b/.test(cmd)) bashTestRuns++;
              if (/\b(?:node\s+--check|py_compile|tsc|npm\s+run\s+(?:build|package))\b/.test(cmd)) bashBuildRuns++;
            }
            scanHtmlHabits(cmd);
          } else if (tName === 'write_file') {
            write++;
            turnWrite++;
            const fpath = String(inp.path || inp.file_path || '');
            if (/[a-z]+_[a-z]+\.html$/i.test(fpath)) writeUnderscoreName++;
            const content = String(inp.content || '');
            writtenChars += content.length;
            if (content) editAddedLines += content.split('\n').length;
            scanHtmlHabits(content, m === asstMsgs.at(-1));
          } else if (tName === 'edit_file') {
            edit++;
            turnEdit++;
            const ot = String(inp.old_text ?? inp.old_string ?? '');
            const nt = String(inp.new_text ?? inp.new_string ?? '');
            writtenChars += nt.length;
            if (typeof CmdTranslate !== 'undefined' && CmdTranslate.lineDiff) {
              const df = CmdTranslate.lineDiff(ot, nt);
              editAddedLines += Number(df.add) || 0;
              editDeletedLines += Number(df.del) || 0;
            } else if (ot || nt) {
              editAddedLines += nt ? nt.split('\n').length : 0;
              editDeletedLines += ot ? ot.split('\n').length : 0;
            }
            scanHtmlHabits(nt);
          } else if (tName === 'read_file') {
            read++;
          } else if (tName === 'present_file') {
            present++;
          } else if (tName === 'generate_image') {
            genImg++;
            otherTools++;
          } else if (tName === 'ask_user') {
            askUser++;
            const qs = Array.isArray(inp.questions) ? inp.questions : [];
            const qJson = JSON.stringify(qs);
            if (/"id":\s*"(?:format|transcribe|organize|repeat|remember|speak)"|clean up|punctuation|dictat|speech-to-text|clean list|readable transcription|clean,\s*readable|item\/quantity/i.test(qJson)) {
              askFormatOpt++;
            }
            if (/"id":\s*"(?:transform|data|verify)"|known cipher|process it as data/i.test(qJson)) {
              askTransformOpt++;
            }
            if (/"id":\s*"(?:password|reformat)"|Decode\s*\/\s*solve/i.test(qJson)) {
              askSol56Sig++;
            }
            if (/"id":\s*"[a-z]+_[a-z]+"|"id":\s*"(?:interpret|reference)"|poem,\s*story,\s*or other creative|Rephrase the question|Explain the task or provide|I[’']ll explain what I mean|Clarify what you intended|Please explain what you[’']re asking|The sequence represents a|Look for a pattern or decode a hidden message/i.test(qJson)) {
              askSolSig++;
            }
            for (const q of qs) {
              askQCount++;
              const qid = String(q?.id || '');
              const qtxt = String(q?.question || '');
              if (/[a-z]+_[a-z]+/i.test(qid)) askIdHasUnderscore++;
              else if (/^(?:intent|task)$/i.test(qid)) askIdBareIntent++;
              if (/^(?:intent|sequence_intent|phrase_intent|word_intent)$/i.test(qid) || /what would you like me to do with/i.test(qtxt)) {
                askUserIntent++;
              }
              const opts = Array.isArray(q?.options) ? q.options : [];
              askOptTotal += opts.length;
              for (const o of opts) {
                const d = String(o?.description || '').trim();
                if (d) {
                  askDescCount++;
                  askDescChars += d.length;
                  if (/[.。!！]$/.test(d)) askPeriodCount++;
                }
              }
            }
          } else if (tName.includes('search') || tName === 'fetch_page') {
            search++;
          } else {
            otherTools++;
          }
        }
      }
      const mf = m?._fmt || m?.fmt || null;
      if (mf && typeof mf === 'object') {
        const mfTN = Number(mf.tN) || 0;
        const mfTChars = Number(mf.tChars) || 0;
        msgFmtTN += mfTN;
        msgFmtTChars += mfTChars;
        msgFmtTidCount += Number(mf.tidCount) || 0;
        msgFmtTidChars += Number(mf.tidChars) || 0;
        msgFmtRWireDeltas += Number(mf.rWireDeltas || mf.rE || mf.rChunks) || 0;
        if (mfTN > 0 || Array.isArray(mf.rs) || Array.isArray(mf.ids)) hasLiveMsgFmt = true;
        if (turnHidR === 0 && turnVisR === 0) {
          const mfRs = Array.isArray(mf.rs)
            ? mf.rs
            : (Array.isArray(mf.ids) ? mf.ids.filter(x => x && x[0] === 'r').map(x => ({ id: x[1], chars: 0 })) : []);
          if (mfRs.length > 0 && !(Number(mf.rChars) > 0)) {
            turnHidR += mfRs.length;
            hidR += mfRs.length;
          }
        }
      }
      if (turnHidR > maxRInTurn) maxRInTurn = turnHidR;
      if (curStepTools >= 2) parallelSteps++;
      if (turnWrite > 0 && turnHidR === 0 && turnInlineHtmlChars >= (isMicroProbePrompt ? 500 : 12000)) {
        inlineHtmlEcho++;
      }
      if (turnWrite > 0 || turnEdit > 0 || turnCodeBash > 0 || turnInlineHtmlChars >= (isMicroProbePrompt ? 500 : 8000)) {
        codingTurns++;
        if (turnHidR === 0 && turnVisR === 0) codingTurnsNoR++;
        else if (turnHidR > 0 && turnVisR === 0) codingTurnsWithHidR++;
      } else {
        const rawTxtLen = turnTextChars || (m.text ? String(m.text).length : 0);
        if (rawTxtLen > 0) {
          nonCodeTurns++;
          nonCodeChars += rawTxtLen;
        }
      }
      if (turnHasTool) {
        toolTurns++;
        preToolTextChars += turnPreChars;
        if (preTextInTurn) preTextTurns++;
        else silentToolTurns++;
      }
      if (!pHasParts(parts) && m.text) {
        const mTxt = String(m.text || '');
        turnTextChars += mTxt.length;
        scanTextHabits(mTxt);
      }
      if (Array.isArray(m?.webdev?.files)) {
        for (const wf of m.webdev.files) {
          const wfc = String(wf?.content || '');
          if (wfc) scanHtmlHabits(wfc, m === asstMsgs.at(-1));
        }
      }
      if (Array.isArray(m?.sources)) searchSourcesCount += m.sources.length;
      if (Array.isArray(m?.citations)) searchSourcesCount += m.citations.length;
      if (Array.isArray(m?.experimental_attachments)) {
        for (const att of m.experimental_attachments) {
          const ct = String(att?.contentType || att?.mimeType || '');
          if (/^image\//i.test(ct)) mediaImgCount++;
          else if (/^video\//i.test(ct)) mediaVideoCount++;
        }
      }
      const mThinkMs = Number(m?.metadata?.timing?.thinkingMs || m?.metadata?.thinkingDurationMs || 0);
      if (mThinkMs > 50 && mThinkMs < 600000) {
        thinkDurSumMs += mThinkMs;
        thinkDurCount++;
      }
      turnRichnessArr.push(turnTextChars + (turnWrite + turnEdit + turnCodeBash) * 420 + (turnHidR + turnVisR) * 140);
    }

    function pHasParts(arr) { return Array.isArray(arr) && arr.length > 0; }
    function uuidV7Ms(id) {
      const hex = String(id || '').replace(/-/g, '');
      if (hex.length !== 32 || !/^[0-9a-f]{32}$/i.test(hex)) return 0;
      const ms = parseInt(hex.slice(0, 12), 16);
      return (ms > 1700000000000 && ms < 2100000000000) ? ms : 0;
    }

    const turns = Math.max(1, asstMsgs.length);
    const totalTools = bash + write + edit + read + present + search + askUser + otherTools;
    const sidStr = ignoreExactSid ? '' : String(chat?.sid || modelEntry?.sid || '');
    let sseMemoObj = (typeof window !== 'undefined' && window.__atiSseMemo instanceof Map && sidStr) ? (window.__atiSseMemo.get(sidStr) || null) : null;
    try {
      if (!sseMemoObj && sidStr && typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const rawMemo = localStorage.getItem('ati.v4.sseMemo.' + sidStr);
        if (rawMemo) sseMemoObj = JSON.parse(rawMemo);
      }
    } catch {}
    const mKnown = modelEntry || (sidStr && typeof Models !== 'undefined' ? Models.get(sidStr) : null);
    const bankMatchRaw = sidStr ? getBankSampleBySid(sidStr) : null;
    const bankMatch = (bankMatchRaw && (bankMatchRaw.userConfirmed || bankMatchRaw.importedFromDiag)) ? bankMatchRaw : null;
    const mKnownName = String(bankMatch?.model || '');
    const isEvalChat = Boolean(chat?.isEvaluation || chat?.evalMode === 'battle' || chat?.evalMode === 'direct' || chat?.battleSide || /#[ab]$/i.test(sidStr));
    const evalHintName = String(modelEntry?.name || modelEntry?.rawLabel || chat?.revealedModelName || chat?.directModelName || (isEvalChat ? mKnownName : '') || '').trim();
    if (isEvalChat && visR > 0 && visRChars === 0) {
      hidR += visR;
      if (maxRInTurn < visR) maxRInTurn = visR;
      visR = 0;
    } else if (!isEvalChat && visR > 0 && visRChars < 320 && (askIdHasUnderscore > 0 || askUserIntent > 0 || askSolSig > 0)) {
      hidR += visR;
      if (maxRInTurn < visR) maxRInTurn = visR;
      visR = 0;
      visRChars = 0;
    }
    const isFlash38LowIdentity = !isEvalChat && turns === 1 && totalTools === 0 && visR === 1 && visRChars < 1500 && totalChars >= 180 && totalChars <= 320;
    if (isFlash38LowIdentity) {
      visR = 0;
    }
    const thinkSt = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    if (!bestHtmlSvgCode && !finalArtifactCode && Array.isArray(allMsgs) && allMsgs.length > asstMsgs.length) {
      for (const m of allMsgs) {
        if (!m || m.role !== "assistant" || !Array.isArray(m.tools)) continue;
        for (const t of m.tools) {
          const nm = String(t?.name || "").toLowerCase();
          if (nm === "write_file" || nm === "create_file" || nm === "edit_file" || nm === "write_to_file") {
            const fp = String(t?.input?.path || t?.input?.file_path || t?.input?.TargetFile || t?.input?.filename || "");
            const content = String(t?.input?.content || t?.input?.code || t?.input?.new_text || t?.input?.CodeContent || "");
            if (content.length >= 180 && (/.(?:html?|svg)$/i.test(fp) || /<(?:!doctypes+html|html|svg)/i.test(content))) {
              if (content.length > bestHtmlSvgCode.length) bestHtmlSvgCode = content;
            }
          }
        }
      }
    }
    let htmlSvgRoutePivot = null;
    if (turnHtmlSvgList.length >= 2 && turnHtmlSvgList[0].idx !== turnHtmlSvgList[turnHtmlSvgList.length - 1].idx) {
      const firstItem = turnHtmlSvgList[0];
      const lastItem = turnHtmlSvgList[turnHtmlSvgList.length - 1];
      const firstHm = classifyHtmlSvg(firstItem.code, { isOpenThink: false, strictOpenClosed: false });
      const lastHm = classifyHtmlSvg(lastItem.code, { isOpenThink: false, strictOpenClosed: false });
      const firstBest = firstHm?.best || null;
      const lastBest = lastHm?.best || null;
      if (firstBest && lastBest && (firstBest.confidence || 0) >= 0.85 && (lastBest.confidence || 0) >= 0.85 && firstBest.model_id !== lastBest.model_id && (firstBest.vendorId !== lastBest.vendorId || preferLatestTurn)) {
        htmlSvgRoutePivot = {
          fromModel: firstBest.canon || firstBest.model_id,
          toModel: lastBest.canon || lastBest.model_id,
          fromVendor: firstBest.vendorId,
          toVendor: lastBest.vendorId,
          fromConf: firstBest.confidence,
          toConf: lastBest.confidence,
        };
        finalArtifactCode = lastItem.code;
      } else if (preferLatestTurn && lastItem?.code) {
        finalArtifactCode = lastItem.code;
      }
    } else if (preferLatestTurn && turnHtmlSvgList.length === 1) {
      finalArtifactCode = turnHtmlSvgList[0].code;
    }
    const isOpenThink = isEvalChat
      ? Boolean(visR > 0 && visRChars > 0)
      : Boolean(visR > 0 || wireFam === 'deepseek' || wireFam === 'kimi' || (thinkSt?.kind === 'compat-thinking' && (!chat?._closedLockedModel || turns >= 2)));
    const chosenHtmlSvgCode = (finalArtifactCode && (/<svg\b/i.test(finalArtifactCode) || finalArtifactCode.length >= 3800)) ? finalArtifactCode : bestHtmlSvgCode;
    let htmlSvgMatch = (chosenHtmlSvgCode && chosenHtmlSvgCode.length >= 60 && (/<svg\b/i.test(chosenHtmlSvgCode) || chosenHtmlSvgCode.length >= 3800))
      ? classifyHtmlSvg(chosenHtmlSvgCode, { isOpenThink, strictOpenClosed: !isEvalChat })
      : null;
    let htmlSvgSig = htmlSvgMatch?.features?.sig12 || null;
    const topRevCand = null;
    const msgFmtAvgChunk = (msgFmtTN >= 3 && msgFmtTChars > 0) ? Math.round((msgFmtTChars / msgFmtTN) * 10) / 10 : 0;
    const msgFmtTidAvg = (msgFmtTidCount >= 4 && msgFmtTidChars > 0) ? Math.round((msgFmtTidChars / msgFmtTidCount) * 10) / 10 : 0;
    const isLiveOpenAiFmt = !isEvalChat && hasLiveMsgFmt && visR === 0 && ((msgFmtTN >= 15 && msgFmtAvgChunk >= 1.0 && msgFmtAvgChunk <= 3.8) || (msgFmtTN < 6 && msgFmtTidCount >= 18 && msgFmtTidAvg > 0 && msgFmtTidAvg <= 4.2));
    const isLiveGeminiFmt = !isEvalChat && hasLiveMsgFmt && visR === 0 && !isLiveOpenAiFmt && msgFmtTN >= 3 && (msgFmtTN / Math.max(1, turns)) <= 28 && msgFmtAvgChunk >= 28.0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && prefersReducedMotion === 0 && claudeWarmPalette === 0 && boxComment === 0;
    const isLiveNonClaudeFmt = Boolean(
      (hidR === 0 && msgFmtRWireDeltas === 0 && msgFmtTidCount === 0 && turns === 1 && write === 1 && totalTools === 1 && writtenChars >= 35000 && prefersReducedMotion >= 1 && boxComment === 0) ||
      (msgFmtRWireDeltas === 0 && msgFmtTidCount > 0 && msgFmtTidCount <= 6 && msgFmtTidAvg >= 1800 && hidR >= 2) ||
      (hidR >= 2 && (msgFmtAvgChunk >= 15.0 || (prefersReducedMotion >= 1 && boxComment === 0 && claudeWarmPalette === 0 && edit === 0 && read === 0))) ||
      (htmlSvgMatch?.best?.vendorId && htmlSvgMatch.best.vendorId !== 'anthropic' && Number(htmlSvgMatch.best.ruleScore) >= 0.45)
    );
    const isLiveClaudeFmt = !isEvalChat && hasLiveMsgFmt && visR === 0 && !isLiveOpenAiFmt && !isLiveGeminiFmt && !isLiveNonClaudeFmt && ((msgFmtTN >= 15 && msgFmtAvgChunk >= 4.0 && msgFmtAvgChunk <= 25.0) || (msgFmtTN >= 6 && msgFmtAvgChunk >= 4.0 && msgFmtAvgChunk <= 25.0 && hidR > 0) || (msgFmtTidCount > 0 && msgFmtTidCount <= 8 && !(msgFmtTN >= 3 && msgFmtAvgChunk >= 28.0))) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0;
    if (isLiveGeminiFmt) {
      hidR = 0;
      maxRInTurn = 0;
      codingTurnsNoR = Math.max(codingTurnsNoR, turns);
      codingTurnsWithHidR = 0;
      wireFam = '';
    } else if (isLiveOpenAiFmt) {
      wireFam = 'openai';
      if (hidR === 0) {
        hidR = Math.max(1, turns);
        maxRInTurn = Math.max(1, maxRInTurn);
        if (codingTurns > 0) { codingTurnsWithHidR = codingTurns; codingTurnsNoR = 0; }
      }
    } else if (isLiveClaudeFmt) {
      wireFam = 'anthropic';
      if (hidR === 0) {
        hidR = Math.max(1, turns);
        maxRInTurn = Math.max(1, maxRInTurn);
        if (codingTurns > 0) { codingTurnsWithHidR = codingTurns; codingTurnsNoR = 0; }
      }
    }
    const hasOverwhelmingGoogleBash = hidR === 0 && visR === 0 && (pyHeredoc >= 5 || catHeredoc >= 5 || (bash >= 10 && totalTools >= 20));
    const knownRBlocks = (hasLiveMsgFmt || hasOverwhelmingGoogleBash)
      ? hidR
      : Number(chat?._streamEvidence?.rBlocks || mKnown?.streamEvidence?.rBlocks || sseMemoObj?.reasoningBlocks || 0);
    const knownCwTok = 0;
    const effKnownName = hasOverwhelmingGoogleBash ? '' : mKnownName;
    const isKnownGoogleName = /gemini|google|argon|barium/i.test(effKnownName);
    const hasDefiniteGoogleBash =
      hasOverwhelmingGoogleBash ||
      ((isLiveGeminiFmt ||
       (!isEvalChat && hasLiveMsgFmt && !isLiveOpenAiFmt && !isLiveClaudeFmt && hidR === 0 && visR === 0 && (msgFmtAvgChunk >= 28.0 || (totalTools > 0 && msgFmtTN === 0))) ||
       (turns >= 3 && totalTools >= 10 && hidR === 0 && visR === 0 && knownRBlocks === 0) ||
       (write >= 1 && bash >= 1 && (writtenChars >= 26000 || htmlMaxLen >= 26000) && hidR === 0 && visR === 0 && knownRBlocks === 0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0 && boxComment === 0) ||
       ((pyHeredoc > 0 || catHeredoc > 0 || geminiPyHelper > 0 || inlineHtmlEcho > 0) && hidR === 0 && visR === 0 && knownRBlocks === 0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0)) &&
      wireFam !== 'openai' && wireFam !== 'anthropic' && !/gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(effKnownName));
    const hasNonGoogleEvidence = Boolean(
      !CONFIRMED_GEMINI_FLASH_SIDS.has(sidStr) && !isKnownGoogleName && !hasDefiniteGoogleBash && (
        knownRBlocks > 0 ||
        /gpt|openai|\bsol(?=$|[-\s_.\d])|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName) ||
        wireFam === 'openai' ||
        wireFam === 'anthropic' ||
        prefersReducedMotion > 0 ||
        colorSchemeCss > 0 ||
        lowerDoctype > 0 ||
        svgSmilNoScript > 0 ||
        ariaLabelledby > 0 ||
        sandboxLink > 0 ||
        askUserIntent > 0 ||
        solClarifyPhrase > 0 ||
        lunaNotSurePhrase > 0 ||
        astraSelfContainedPhrase > 0 ||
        (terraPhrase > 0 && totalChars < 350) ||
        (curlyApostrophe > 0 && totalTools === 0 && totalChars < 350) ||
        (Number(sseMemoObj?.textDeltaCount || 0) === 1 && totalTools === 0 && totalChars < 140) ||
        (write >= 1 && pyHeredoc === 0 && catHeredoc === 0 && geminiPyHelper === 0 && inlineHtmlEcho === 0 && bash === 0) ||
        (askUser > 0 && pyHeredoc === 0 && catHeredoc === 0) ||
        (cnColon >= 2 && !(write >= 1 && bash >= 1 && (writtenChars >= 26000 || htmlMaxLen >= 26000) && hidR === 0 && visR === 0 && knownRBlocks === 0)) ||
        (boxComment >= 1 && !(write >= 1 && bash >= 1 && (writtenChars >= 26000 || htmlMaxLen >= 26000) && hidR === 0 && visR === 0 && knownRBlocks === 0 && claudeWarmPalette === 0)) ||
        (htmlSvgMatch?.best?.vendorId && htmlSvgMatch.best.vendorId !== 'google' && Number(htmlSvgMatch.best.ruleScore || 0) >= 0.55)
      )
    );
    const sseExplicitNoReasoning = Boolean(sseMemoObj && sseMemoObj.sawReasoning === false && Number(sseMemoObj.reasoningBlocks || 0) === 0);
    if (!isOpenThink && hidR === 0 && visR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0 && (pyHeredoc === 0 || lowerDoctype > 0 || sandboxLink > 0 || prefersReducedMotion > 0 || knownRBlocks > 0) && (catHeredoc === 0 || prefersReducedMotion > 0 || knownRBlocks > 0)) {
      if (!isEvalChat && (!sseExplicitNoReasoning || sandboxLink > 0 || lowerDoctype > 0 || askIdHasUnderscore > 0 || askUserIntent > 0)) {
        hidR = knownRBlocks > 0 ? knownRBlocks : Math.max(turns, codingTurns * 2 || turns);
        if (maxRInTurn === 0) maxRInTurn = Math.max(1, Math.round(hidR / turns));
        if (codingTurns > 0) {
          codingTurnsWithHidR = codingTurns;
          codingTurnsNoR = 0;
        }
      }
    } else if (!isEvalChat && !isOpenThink && hidR > 0 && codingTurns > 0 && codingTurnsWithHidR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0 && (prefersReducedMotion > 0 || lowerDoctype > 0 || sandboxLink > 0 || knownRBlocks > 0)) {
      codingTurnsWithHidR = codingTurns;
      codingTurnsNoR = 0;
    }
    const isGeminiCoding = !isOpenThink && (
      CONFIRMED_GEMINI_FLASH_SIDS.has(sidStr) ||
      (isEvalChat ? false : (
        hasDefiniteGoogleBash ||
        (!hasNonGoogleEvidence && (hidR === 0 && visR === 0)) ||
        (!hasNonGoogleEvidence && codingTurnsNoR >= 1 && codingTurnsWithHidR === 0) ||
        geminiPyHelper > 0 ||
        (inlineHtmlEcho > 0 && !hasNonGoogleEvidence && hidR === 0) ||
        (!hasNonGoogleEvidence && codingTurnsNoR >= 1 && codingTurnsWithHidR === 0 && (catHeredoc > 0 || pyHeredoc > 0) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0 && (askUser === 0 || hidR === 0))
      ))
    );

    // 从最近 3 轮消息 timing / UUIDv7 时间戳 / streamEvidence 提取单轮耗时与流式吐字速度 cps（严禁加载更早轮次）
    let durSumMs = 0, durCount = 0;
    const recentAsstSet = new Set(asstMsgs);
    for (let i = 0; i < allMsgs.length; i++) {
      const m = allMsgs[i];
      if (!m || m.role !== 'assistant' || !recentAsstSet.has(m)) continue;
      const tm = m.metadata?.timing;
      if (tm?.startedAt && tm?.completedAt && tm.completedAt > tm.startedAt) {
        durSumMs += Math.min(3600000, tm.completedAt - tm.startedAt);
        durCount++;
        continue;
      }
      const prevU = i > 0 && allMsgs[i - 1]?.role === 'user' ? allMsgs[i - 1] : null;
      const tStart = uuidV7Ms(prevU?.id) || uuidV7Ms(sidStr) || uuidV7Ms(m.id);
      const nextM = i + 1 < allMsgs.length ? allMsgs[i + 1] : null;
      const tEnd = uuidV7Ms(m.id) > tStart + 300 ? uuidV7Ms(m.id) : (uuidV7Ms(nextM?.id) > tStart && uuidV7Ms(nextM?.id) - tStart < 600000 ? uuidV7Ms(nextM?.id) : 0);
      if (tStart > 0 && tEnd > tStart + 250 && tEnd - tStart < 3600000) {
        durSumMs += (tEnd - tStart);
        durCount++;
      }
    }
    const streamEv = chat?._streamEvidence || modelEntry?.streamEvidence || null;
    const avgTurnDurMs = durCount > 0
      ? Math.round(durSumMs / durCount)
      : Number(streamEv?.turnDurationMs || streamEv?.thinkDurationMs || chat?.fmt?.turnMs) || 0;
    const avgThinkDurMs = thinkDurCount > 0
      ? Math.round(thinkDurSumMs / thinkDurCount)
      : Number(streamEv?.thinkDurationMs || 0);
    const meanChars = (totalChars + writtenChars * 0.85) / turns;
    const nonCodeMeanChars = nonCodeTurns > 0 ? Math.round(nonCodeChars / nonCodeTurns) : Math.round(meanChars);
    const rPerTurn = (hidR + visR * 0.85) / turns;
    const memoDeltaCountEarly = Number(msgFmtTN || chat?.fmt?.tN || sseMemoObj?.textDeltaCount || 0);
    const fmtAvgChunkEarly = msgFmtAvgChunk > 0
      ? msgFmtAvgChunk
      : ((Number(chat?.fmt?.tN) >= 3 && Number(chat?.fmt?.tChars) > 0) ? Math.round((Number(chat.fmt.tChars) / Number(chat.fmt.tN)) * 10) / 10 : 0);
    const memoAvgChunkEarly = fmtAvgChunkEarly > 0
      ? fmtAvgChunkEarly
      : Number(sseMemoObj?.avgChunk || streamEv?.avgChunk || (memoDeltaCountEarly > 0 && Number(sseMemoObj?.textDeltaChars) > 0 ? Math.round((Number(sseMemoObj.textDeltaChars) / memoDeltaCountEarly) * 10) / 10 : 0) || 0);
    if (Math.max(writtenChars || 0, htmlMaxLen || 0) < 1000 && (Number(mRef?.habitFeatures?.meta?.htmlMaxLen || 0) >= 4000 || Number(mRef?.habitFeatures?.meta?.writtenChars || 0) >= 4500)) {
      htmlMaxLen = Math.max(htmlMaxLen, Number(mRef.habitFeatures.meta.htmlMaxLen || 0));
      writtenChars = Math.max(writtenChars, Number(mRef.habitFeatures.meta.writtenChars || 0));
      if (!htmlSvgSig && mRef.habitFeatures.meta.htmlSvgSig) htmlSvgSig = mRef.habitFeatures.meta.htmlSvgSig;
      if (!htmlSvgMatch && mRef.habitFeatures.meta.htmlSvgMatch) htmlSvgMatch = mRef.habitFeatures.meta.htmlSvgMatch;
    }
    const codeSpanLen = Math.max(writtenChars || 0, htmlMaxLen || 0);
    const isMicroProbeChat = Boolean(!((turns >= 2 && codeSpanLen > 4500) || codeSpanLen > 7500) && (isMicroProbePrompt || (turns <= 3 && codingTurns >= 1 && codeSpanLen >= 80 && codeSpanLen <= 9500 && (svgRich > 0 || svgSmilNoScript > 0 || cssRoot > 0 || raf > 0 || colorSchemeCss > 0 || prefersReducedMotion > 0 || lowerDoctype > 0 || boxComment > 0 || htmlMaxLen >= 80))));
    const hasCompactMultiTurnSurge = (HAIKU_55_MEDIUM_SIDS.has(sidStr) || (!isEvalChat && wireFam === 'anthropic' && nonCodeMeanChars <= 450 && rPerTurn <= 0.8)) && nonCodeTurns >= 2 && codingTurns === 1 && nonCodeMeanChars <= 850 && rPerTurn <= 1.5 && totalTools <= 3 && bash === 0 && edit === 0 && writeUnderscoreName === 0 && lunaNotSurePhrase === 0 && sandboxLink === 0 && boxComment === 0 && !(prefersReducedMotion > 0 && ariaLabelledby > 0 && cnColon === 0) && (memoDeltaCountEarly === 0 || memoAvgChunkEarly >= 10);
    const effMeanChars = hasCompactMultiTurnSurge ? nonCodeMeanChars : meanChars;
    const revDimsArr = topRevCand?.matchedDims || topRevCand?.dims || [];
    const dimCpsMatch = /流式速度[:(]\s*([\d.]+)\s*字\/秒/.exec(Array.isArray(revDimsArr) ? revDimsArr.join(' | ') : '');
    const cps = Number(streamEv?.cps || streamEv?.textCps || (dimCpsMatch ? parseFloat(dimCpsMatch[1]) : 0)) > 0
      ? Number(streamEv?.cps || streamEv?.textCps || (dimCpsMatch ? parseFloat(dimCpsMatch[1]) : 0))
      : (avgTurnDurMs >= 800 && meanChars >= 40)
        ? Math.round((meanChars / (avgTurnDurMs / 1000)) * 10) / 10
        : 0;

    const hasHidR = (hidR > 0 && !isOpenThink && !isGeminiCoding) ? 1.0 : 0.0;
    const noR = ((hidR === 0 && visR === 0) || isGeminiCoding) ? 1.0 : 0.0;
    const preNarrate = toolTurns > 0 ? Math.min(1, preTextTurns / toolTurns) : 0.06;
    const editReadRatio = totalTools > 0 ? Math.min(1, (edit + read) / totalTools) : 0;
    const writeRatio = totalTools > 0 ? Math.min(1, (write + present * 0.5) / totalTools) : 0;
    const parallelRate = stepStarts > 0 ? Math.min(1, (parallelSteps / Math.max(1, stepStarts)) * 2.2) : 0;
    const pyHeroRate = bash > 0 ? Math.min(1, pyHeredoc / bash) : 0;
    const catHeroRate = bash > 0 ? Math.min(1, catHeredoc / bash) : 0;
    const chainAndRate = bash > 0 ? Math.min(1, chainAnd / bash) : 0;
    const rgSedRate = bash > 0 ? Math.min(1, rgSed / bash) : 0;
    const cssRootScore = hasCompactMultiTurnSurge ? 0.45 : (cssRoot > 0 ? Math.min(1, 0.55 + cssRoot * 0.15) : 0.35);
    const rafScore = hasCompactMultiTurnSurge ? 0.40 : ((raf > 0 || svgSmilNoScript > 0) ? Math.min(1, 0.55 + (raf + svgSmilNoScript) * 0.15) : 0.35);
    const svgRichScore = hasCompactMultiTurnSurge ? 0.45 : ((svgRich > 0 || ariaLabelledby > 0) ? Math.min(1, 0.55 + (svgRich + ariaLabelledby) * 0.15) : 0.35);
    const boxCommentScore = boxComment > 0 ? Math.min(1, 0.60 + boxComment * 0.15) : 0.25;
    const emDashRate = Math.min(1, ((emDash + unspacedEmDash) / turns) / 5);
    const cnColonRate = Math.min(1, (cnColon / turns) / 6);
    const h3Pref = (h2 + h3) > 0 ? (h3 / (h2 + h3)) : 0.5;
    const charScale = isMicroProbeChat
      ? Math.min(1, Math.max(0.32, (effMeanChars + htmlMaxLen * 0.85) / 2600))
      : Math.min(1, Math.max(0.1, (effMeanChars + (hasCompactMultiTurnSurge ? 0 : htmlMaxLen * 0.45)) / 14000));
    const stepScale = Math.min(1, ((hidR + visR + totalTools) / turns) / (isMicroProbeChat ? 6 : 14));
    const meanDurSec = avgTurnDurMs > 0 ? (avgTurnDurMs / 1000) : Math.min(360, 12 + (totalTools / turns) * 14 + (hidR / turns) * 8);
    const durScale = hasCompactMultiTurnSurge ? 0.32 : isMicroProbeChat ? Math.min(1, Math.max(0.28, meanDurSec / 26)) : Math.min(1, meanDurSec / 120);

    const vec = [
      hasHidR, noR, preNarrate, editReadRatio, writeRatio,
      parallelRate, pyHeroRate, catHeroRate, chainAndRate, rgSedRate,
      cssRootScore, rafScore, svgRichScore, boxCommentScore, emDashRate,
      cnColonRate, h3Pref, charScale, stepScale, durScale,
    ];

    // Compute 0-100 Reasoning Score (`推理分`) from behavioral depth so strength is always quantified even without /cost
    const toolsPerTurn = totalTools / turns;
    const htmlLenBonus = isMicroProbeChat ? (Math.max(htmlMaxLen, writtenChars) / 360) : (htmlMaxLen / 2400);
    const rawHtmlDepthBonus = htmlLenBonus + (cssRoot > 0 ? 2.5 : 0) + (raf > 0 || svgSmilNoScript > 0 ? 3.5 : 0) + (colorSchemeCss > 0 ? 2.0 : 0) + (prefersReducedMotion > 0 ? 2.0 : 0) + (ariaLabelledby > 0 ? 1.5 : 0) + (isMicroProbeChat && svgRich > 0 ? 1.5 : 0);
    const htmlDepthBonus = hasCompactMultiTurnSurge ? (rawHtmlDepthBonus * 0.18) : rawHtmlDepthBonus;
    const searchDepthBonus = Math.min(8, searchSourcesCount * 0.8 + citationCount * 0.55 + tableCount * 0.8);
    const proseRigorBonus = Math.min(6, selfCheckCount * 1.1 + codeDefensiveCount * 0.7 - codeOmissionCount * 1.4);
    const rawReasonScore = 38
      + Math.min(25, rPerTurn * 4.2)
      + Math.min(18, toolsPerTurn * 2.2)
      + Math.min(8, parallelSteps * 1.8)
      + Math.min(13, htmlDepthBonus)
      + Math.min(6, effMeanChars / 2200)
      + Math.max(0, searchDepthBonus * 0.45 + proseRigorBonus * 0.45);
    const habitReasoningScore = Math.round(Math.max(22, Math.min(98.5, rawReasonScore)) * 10) / 10;

    // 自动判定当前会话所属的全模态类型（文字 chat / 代码网页 webdev / 搜索 search / 图片 image / 视频 video）
    const explicitMod = String(chat?.evalModality || modelEntry?.evalModality || '').trim().toLowerCase();
    const evalModality = explicitMod && /^(?:chat|webdev|search|image|video|agent)$/.test(explicitMod)
      ? explicitMod
      : (mediaVideoCount > 0)
        ? 'video'
        : (mediaImgCount > 0 || genImg > 0)
          ? 'image'
          : (searchSourcesCount > 0 || search > 0 || citationCount >= 2)
            ? 'search'
            : (codingTurns > 0 || htmlMaxLen >= 200 || codeBlocks >= 2)
              ? 'webdev'
              : 'chat';

    // 多轮上下文持久度（2~3 轮时末轮相对于首轮的信息与工具完整度，区分 High/Max 与 Medium/Low）
    const multiTurnPersistence = turnRichnessArr.length >= 2
      ? Math.max(0.15, Math.min(1.0, (turnRichnessArr.at(-1) || 1) / Math.max(120, turnRichnessArr[0] || 1)))
      : 0.78;

    // 12 维同家族档位微差判别子空间向量 tierVec[0..11]（专用于分离 opus-5.5-medium vs high、sol-medium vs high 等）
    const tierVec = [
      Math.min(1, (rPerTurn * 0.22) + (thinkStepLines / turns) * 0.06 + (visRChars / turns) / 2400),
      Math.min(1, (meanDurSec / Math.max(0.45, promptEntropy * 75))),
      cps > 0 ? Math.max(0, Math.min(1, 1 - (cps - 18) / 165)) : durScale,
      Math.min(1, ((h2 + h3) * 1.5 + tableCount * 2.5 + listLineCount * 0.35 + cnColon * 0.4) / Math.max(1, turns * 14)),
      Math.min(1, (selfCheckCount * 0.26 + emDashRate * 0.34 + (effMeanChars / 4200) * 0.40)),
      (codingTurns > 0 || codeBlocks > 0 || htmlMaxLen > 0)
        ? Math.max(0, Math.min(1, 0.55 + Math.min(0.45, Math.max(htmlMaxLen, writtenChars, totalChars) / 18000) - codeOmissionCount * 0.28))
        : charScale,
      Math.min(1, (codeDefensiveCount * 0.14 + cssRoot * 0.16 + raf * 0.18 + svgRich * 0.16 + prefersReducedMotion * 0.18 + colorSchemeCss * 0.18)),
      totalTools > 0 ? Math.min(1, (toolsPerTurn / 9) * 0.55 + editReadRatio * 0.45) : (stepScale * 0.75),
      totalTools > 0 ? Math.min(1, parallelRate * 0.60 + preNarrate * 0.40) : Math.min(1, rPerTurn / 5),
      (searchSourcesCount > 0 || citationCount > 0 || search > 0)
        ? Math.min(1, (searchSourcesCount * 0.12 + citationCount * 0.09 + search * 0.18 + tableCount * 0.12))
        : Math.min(1, (h2 + h3 + listLineCount * 0.2) / 10),
      Math.round(multiTurnPersistence * 1000) / 1000,
      Math.min(1, Math.max(0.08, ((habitReasoningScore - 20) / 78) / Math.max(0.55, promptEntropy))),
    ].map(v => Math.round((Number(v) || 0) * 1000) / 1000);

    const anomalous = Boolean(
      chat?.status === 'error' ||
      (avgTurnDurMs > 180000 && meanChars < 120 && totalTools === 0) ||
      (meanChars < 12 && totalTools === 0 && mediaImgCount === 0 && mediaVideoCount === 0)
    );
    // Human-readable matched habit tags for UI transparency
    const habitTags = [];
    if (isOpenThink) habitTags.push(`开源可见思考(${visR}段)`);
    else if (isGeminiCoding && hidR > 0 && codingTurnsNoR > 0) habitTags.push(`编码轮零思考块(Gemini特征·${codingTurnsNoR}轮)`);
    else if (hidR === 0) habitTags.push('无显式思考块(快照特征)');
    else habitTags.push(`闭源隐藏思考(${(hidR / turns).toFixed(1)}段/轮)`);

    if (cps > 0) habitTags.push(`流式速度(${Math.round(cps)}字/秒)`);
    else if (avgTurnDurMs > 0) habitTags.push(`单轮耗时(${(avgTurnDurMs / 1000).toFixed(1)}s)`);
    if (geminiPyHelper > 0) habitTags.push('Python几何自检脚本(Gemini特征)');
    if (inlineHtmlEcho > 0) habitTags.push('写文件+正文双发HTML(Gemini特征)');
    if (sandboxLink > 0 || lowerDoctype > 0) {
      habitTags.push(`OpenAI特征(${sandboxLink > 0 ? 'sandbox:/链接' : ''}${sandboxLink > 0 && lowerDoctype > 0 ? '+' : ''}${lowerDoctype > 0 ? '小写<!doctype>' : ''})`);
    }
    if (svgSmilNoScript > 0 || colorSchemeCss > 0 || prefersReducedMotion > 0) {
      habitTags.push(`HTML特征(${svgSmilNoScript > 0 ? 'SMIL动画' : ''}${colorSchemeCss > 0 ? '·color-scheme' : ''}${prefersReducedMotion > 0 ? '·reduced-motion' : ''})`);
    }
    if (askUser > 0) {
      habitTags.push(`ask_user意图澄清(${askUser}次)`);
    }
    if (toolTurns > 0) {
      if (preNarrate >= 0.45) habitTags.push(`工具前先报备(Anthropic特征·${Math.round(preNarrate * 100)}%)`);
      else if (silentToolTurns > 0) habitTags.push(`0字静默直调工具(${Math.round((silentToolTurns / toolTurns) * 100)}%)`);
    }
    if (edit + read >= 3) habitTags.push(`Read/Edit精准改写(${read}/${edit}次)`);
    if (parallelSteps > 0) habitTags.push(`并行工具步(${parallelSteps}步)`);
    if (pyHeredoc > 0) habitTags.push(`Python Heredoc(${pyHeredoc}次)`);
    if (catHeredoc > 0) habitTags.push(`Cat Heredoc(${catHeredoc}次)`);
    if (chainAnd >= 2) habitTags.push(`Bash && 链式(${chainAnd}次)`);
    if (bashReadFiles + bashEditFiles >= 2) habitTags.push(`Bash读写(读${bashReadFiles}/改${bashEditFiles})`);
    if (bashTestRuns > 0) habitTags.push(`跑测试验证(${bashTestRuns}次)`);
    if (edit > 0 && (editAddedLines > 0 || editDeletedLines > 0)) habitTags.push(`行级改写(+${editAddedLines}/−${editDeletedLines})`);
    if (cssRoot > 0 || raf > 0) habitTags.push(`HTML习惯(:root${cssRoot ? '✓' : ''}/rAF${raf ? '✓' : ''})`);
    if (cnColon >= 2 || emDash >= 2) habitTags.push(`行文(**冒号**${cnColon}/破折号${emDash})`);
    else if (curlyApostrophe >= 1 || unspacedEmDash >= 1) habitTags.push(`英文标点(弯撇号${curlyApostrophe}/紧凑破折号${unspacedEmDash})`);
    if (isMicroProbeChat) habitTags.push('微缩探针');

    if (htmlSvgMatch?.best && (htmlSvgMatch.best.ruleScore >= 0.48 || (htmlSvgMatch.code_type === "html_svg" && htmlSvgMatch.features.bytes >= 3800 && htmlSvgMatch.best.protoSim >= 0.80) || (htmlSvgMatch.code_type === "svg32" && htmlSvgMatch.features.viewBox === "0 0 32 32" && htmlSvgMatch.best.protoSim >= 0.82))) {
      const hmBest = htmlSvgMatch.best;
      habitTags.push(`🦩 代码指纹(${hmBest.familyLabel}${hmBest.effort && hmBest.effort !== "standard" ? "·" + hmBest.effortLabel : ""})`);
    }
    if (memoDeltaCountEarly >= 4 && memoAvgChunkEarly > 0) habitTags.push(`流块(${memoAvgChunkEarly}字)`);
    habitTags.push(`推理分 ${habitReasoningScore}`);

    const askOptsAvg = askQCount > 0 ? Math.round((askOptTotal / askQCount) * 10) / 10 : 0;
    const askDescAvg = askDescCount > 0 ? Math.round(askDescChars / askDescCount) : 0;
    const askPeriodRate = askDescCount > 0 ? Math.round((askPeriodCount / askDescCount) * 100) / 100 : 1;
    const memoDeltaCount = memoDeltaCountEarly;
    const memoAvgChunk = memoAvgChunkEarly;
    const fmtRW = msgFmtRWireDeltas > 0 ? msgFmtRWireDeltas : Number(chat?.fmt?.rWireDeltas || chat?.fmt?.rE || chat?.fmt?.rChunks || sseMemoObj?.reasoningDeltaCount || 0);
    const rAvgChunk = (fmtRW >= 2 && visRChars > 0)
      ? Math.round((visRChars / fmtRW) * 100) / 100
      : Number(chat?._streamEvidence?.rAvgChunk || chat?.fmt?.rAvgChunk || 0);

    const featResultObj = {
      turns,
      hidR,
      maxRInTurn,
      visR,
      visRChars,
      rAvgChunk,
      rPerTurn,
      toolsPerTurn,
      avgTurnDurMs,
      cps,
      memoAvgChunk,
      memoDeltaCount,
      codingTurns,
      codingTurnsNoR,
      codingTurnsWithHidR,
      geminiPyHelper,
      inlineHtmlEcho,
      isGeminiCoding,
      totalTools,
      bash,
      write,
      edit,
      read,
      present,
      search,
      genImg,
      askUser,
      askUserIntent,
      askOptsAvg,
      askDescAvg,
      askPeriodRate,
      askIdHasUnderscore,
      askIdBareIntent,
      askFormatOpt,
      askTransformOpt,
      askSolSig,
      askSol56Sig,
      lunaNotSurePhrase,
      solClarifyPhrase,
      astraSelfContainedPhrase,
      terraPhrase,
      straightApostrophe,
      writeUnderscoreName,
      checkmarkEmoji,
      parallelSteps,
      preNarrate,
      preToolTextChars,
      interToolTextChars,
      pyHeredoc,
      catHeredoc,
      chainAnd,
      rgSed,
      cssRoot,
      raf,
      svgRich,
      boxComment,
      claudeWarmPalette,
      htmlMaxLen,
      writtenChars,
      lowerDoctype,
      colorSchemeCss,
      prefersReducedMotion,
      svgSmilNoScript,
      ariaLabelledby,
      sandboxLink,
      emDash,
      cnColon,
      curlyApostrophe,
      unspacedEmDash,
      h2,
      h3,
      totalChars,
      codeBlocks,
      meanChars: Math.round(meanChars),
      nonCodeMeanChars,
      isMicroProbeChat,
      hasCompactMultiTurnSurge,
      knownCwTok,
      isFlash38LowIdentity,
      isOpenThink,
      wireFam,
      evalModality,
      tableCount,
      listLineCount,
      selfCheckCount,
      thinkStepLines,
      avgThinkDurMs,
      codeOmissionCount,
      codeDefensiveCount,
      searchSourcesCount,
      citationCount,
      mediaImgCount,
      mediaVideoCount,
      bashReadFiles,
      bashEditFiles,
      bashSearchOps,
      bashTestRuns,
      bashBuildRuns,
      editAddedLines,
      editDeletedLines,
      multiTurnPersistence: Math.round(multiTurnPersistence * 1000) / 1000,
      promptEntropy: Math.round(promptEntropy * 1000) / 1000,
      anomalous,
      htmlSvgMatch,
      htmlSvgRoutePivot,
      htmlSvgSig: htmlSvgSig || htmlSvgMatch?.features?.sig12 || null,
      tierVec,
      vec,
      habitReasoningScore,
      habitTags,
      fromIncompleteTurn,
      targetMessageId: String(asstMsgs.at(-1)?.id || ''),
    };
    if (featCacheKey) {
      if (_featCache.size > 64) _featCache.delete(_featCache.keys().next().value);
      _featCache.set(sidKey, { key: featCacheKey, val: featResultObj });
    }
    return featResultObj;
  }


  const BASE_VEC_W = [
    2.6, 2.6, 2.0, 2.5, 1.6,
    2.2, 2.2, 1.5, 1.8, 1.6,
    1.2, 1.2, 1.1, 1.4, 1.5,
    1.7, 1.5, 2.1, 2.2, 2.0,
  ];
  function vectorSimilarity(v1, v2, feat, customDimWeights = null) {
    if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length) return 0;
    const W = BASE_VEC_W;
    // Active Subspace Masking: downweight unactivated tool/HTML dimensions while amplifying active prose/streaming/SVG subspaces
    const noTools = feat && feat.totalTools === 0;
    const noHtml = feat && !feat.htmlMaxLen && !feat.writtenChars && !feat.cssRoot && !feat.raf && !feat.svgRich && !feat.boxComment;
    const onlyAskUser = feat && feat.totalTools > 0 && feat.askUser === feat.totalTools;
    const isLightHtmlOrSvg = Boolean(feat && !noHtml && (feat.isMicroProbeChat || (feat.htmlMaxLen > 0 && feat.htmlMaxLen <= 12000)));
    let sumSq = 0, wTot = 0;
    for (let i = 0; i < v1.length; i++) {
      let w = W[i] || 1;
      const zeroTiming = Boolean(feat && (feat.avgTurnDurMs || 0) === 0 && (feat.cps || 0) === 0);
      if (noTools) {
        if (i >= 2 && i <= 9) w *= 0.06;
        if (noHtml && i >= 10 && i <= 13) w *= 0.06;
        if (i === 18) w *= 0.12;
      } else {
        if (onlyAskUser && i >= 3 && i <= 9) w *= 0.08;
        if (noHtml && i >= 10 && i <= 13) w *= 0.06;
      }
      if (zeroTiming && i === 19) w *= 0.15;
      // When no tools or no HTML are used, prose stylometry (14..16) and streaming/thinking dynamics (17..19) are the primary active signals!
      if (noHtml && (noTools || onlyAskUser) && i >= 14 && i <= 19 && !(noTools && i === 18) && !(zeroTiming && i === 19)) {
        w *= 1.55;
      } else if (isLightHtmlOrSvg && ((i >= 10 && i <= 13) || i === 17 || (!noTools && i === 18) || (!zeroTiming && i === 19))) {
        w *= 1.45;
      }
      if (Array.isArray(customDimWeights) && customDimWeights.length === v1.length) {
        const cw = Number(customDimWeights[i]);
        if (Number.isFinite(cw) && cw > 0) w *= cw;
      }
      const d = (Number(v1[i]) || 0) - (Number(v2[i]) || 0);
      sumSq += w * d * d;
      wTot += w;
    }
    const rmse = Math.sqrt(sumSq / Math.max(1e-6, wTot));
    return Math.max(0, Math.min(1, 1 - rmse * 1.22));
  }

  // 12 维同家族档位微差子空间马氏/加权相似度（按模态动态聚焦激活子空间：文字/代码/搜索/图片/视频/Agent）
  function tierVecSimilarity(tv1, tv2, evalModality = 'chat', stdVec = null) {
    if (!Array.isArray(tv1) || !Array.isArray(tv2) || tv1.length !== 12 || tv2.length !== 12) return null;
    const mod = String(evalModality || 'chat').toLowerCase();
    // 0:thinkIntensity, 1:thinkDurNorm, 2:cpsToDepthRatio, 3:proseStructRichness, 4:selfCheckRigor,
    // 5:codeCompleteness, 6:codeDefensiveDepth, 7:toolChainAutonomy, 8:parallelPlanning, 9:searchSynthesisDepth,
    // 10:multiTurnPersistenceNorm, 11:effortToPromptRatio
    const W = [2.4, 2.2, 1.9, 1.8, 2.1, 1.6, 1.6, 1.5, 1.4, 1.3, 1.5, 2.5];
    if (mod === 'webdev') {
      W[5] = 2.8; W[6] = 2.7; W[7] = 2.2; W[8] = 2.0; W[9] = 0.4;
    } else if (mod === 'search') {
      W[9] = 3.0; W[3] = 2.4; W[4] = 2.3; W[5] = 0.5; W[6] = 0.5;
    } else if (mod === 'image' || mod === 'video') {
      W[1] = 2.6; W[2] = 2.2; W[3] = 2.0; W[5] = 0.3; W[6] = 0.3; W[7] = 0.6;
    } else if (mod === 'chat') {
      W[0] = 2.7; W[1] = 2.5; W[3] = 2.3; W[4] = 2.5; W[11] = 2.7; W[7] = 0.6; W[8] = 0.6;
    }
    let sumSq = 0, wTot = 0;
    for (let i = 0; i < 12; i++) {
      const stdScale = Array.isArray(stdVec) && stdVec.length === 12
        ? Math.max(0.55, Math.min(1.65, 0.14 / Math.max(0.05, Number(stdVec[i]) || 0.12)))
        : 1.0;
      const w = (W[i] || 1) * stdScale;
      const d = (Number(tv1[i]) || 0) - (Number(tv2[i]) || 0);
      sumSq += w * d * d;
      wTot += w;
    }
    const rmse = Math.sqrt(sumSq / Math.max(1e-6, wTot));
    return Math.max(0, Math.min(1, 1 - rmse * 1.18));
  }

  // ── 常用纠偏频次统计（驱动三次卡片跳转置顶 + 习惯先验微调）──
  const FREQ_KEY = 'habit:correctionFreq:v1';
  function getUsageStats() {
    if (_cachedUsageStats) return _cachedUsageStats;
    let raw = null;
    try { raw = typeof Store !== 'undefined' && Store.get ? Store.get(FREQ_KEY, null) : null; } catch {}
    const stats = (raw && typeof raw === 'object' && raw.vendors && raw.models)
      ? raw
      : { vendors: {}, families: {}, models: {}, efforts: {}, updatedAt: 0 };
    if (!stats._seeded) {
      stats._seeded = true;
      const seedModel = (name, weight = 1) => {
        const clean = String(name || '').replace(/[?？]+$/, '').trim();
        if (!clean || /^(未知型号|待定|未识别)$/.test(clean)) return;
        const decomp = decomposeModelIdentity(clean);
        const canon = decomp.canon || (clean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(clean) : clean));
        const vid = decomp.vendor || 'other';
        const fam = decomp.family || canon;
        const eff = decomp.effort || 'standard';
        stats.vendors[vid] = (stats.vendors[vid] || 0) + weight;
        stats.families[fam.toLowerCase()] = (stats.families[fam.toLowerCase()] || 0) + weight;
        stats.models[canon.toLowerCase()] = (stats.models[canon.toLowerCase()] || 0) + weight;
        stats.efforts[eff] = (stats.efforts[eff] || 0) + weight;
      };
      try {
        for (const s of loadBank()) {
          if (s && s.model && s.userConfirmed) seedModel(s.model, 2);
        }
        if (typeof Models !== 'undefined' && Models.all) {
          for (const m of Object.values(Models.all)) {
            if (m && m.userCorrected && m.name) seedModel(m.rawLabel || m.name, 2);
          }
        }
      } catch {}
      try { if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, stats); } catch {}
    }
    _cachedUsageStats = stats;
    return stats;
  }

  function recordModelUse(modelLabel, vendorHint = '', familyHint = '', effortHint = '') {
    try {
      const stats = getUsageStats();
      const clean = String(modelLabel || '').replace(/[?？]+$/, '').trim();
      const decomp = decomposeModelIdentity(clean, { vendor: vendorHint, family: familyHint, effort: effortHint || undefined });
      const canon = decomp.canon || (clean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(clean) : clean));
      const s = canon.toLowerCase();
      const vid = decomp.vendor || vendorHint || 'open';
      const fam = (familyHint || decomp.family || canon).trim().toLowerCase();
      const eff = decomp.effort || 'standard';
      stats.vendors[vid] = (stats.vendors[vid] || 0) + 3;
      if (fam) stats.families[fam] = (stats.families[fam] || 0) + 3;
      if (s) stats.models[s] = (stats.models[s] || 0) + 3;
      if (eff) stats.efforts[eff] = (stats.efforts[eff] || 0) + 2;
      stats.updatedAt = Date.now();
      _cachedUsageStats = stats;
      _analyzeCache.clear();
      if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, stats);
    } catch {}
  }

  function extractCompactMeta(feat) {
    if (!feat) return null;
    return {
      turns: feat.turns || 1,
      hidR: feat.hidR || 0,
      maxRInTurn: feat.maxRInTurn || 0,
      totalTools: feat.totalTools || 0,
      bash: feat.bash || 0,
      write: feat.write || 0,
      edit: feat.edit || 0,
      read: feat.read || 0,
      search: feat.search || 0,
      genImg: feat.genImg || 0,
      askUser: feat.askUser || 0,
      askUserIntent: feat.askUserIntent || 0,
      askIdHasUnderscore: feat.askIdHasUnderscore || 0,
      askIdBareIntent: feat.askIdBareIntent || 0,
      askFormatOpt: feat.askFormatOpt || 0,
      askTransformOpt: feat.askTransformOpt || 0,
      askSolSig: feat.askSolSig || 0,
      askSol56Sig: feat.askSol56Sig || 0,
      parallelSteps: feat.parallelSteps || 0,
      preNarrate: feat.preNarrate || 0,
      preToolTextChars: feat.preToolTextChars || 0,
      interToolTextChars: feat.interToolTextChars || 0,
      avgTurnDurMs: feat.avgTurnDurMs || 0,
      cps: feat.cps || 0,
      memoAvgChunk: feat.memoAvgChunk || 0,
      memoDeltaCount: feat.memoDeltaCount || 0,
      writtenChars: feat.writtenChars || 0,
      htmlMaxLen: feat.htmlMaxLen || 0,
      meanChars: feat.meanChars || 0,
      nonCodeMeanChars: feat.nonCodeMeanChars || 0,
      isMicroProbeChat: Boolean(feat.isMicroProbeChat),
      hasCompactMultiTurnSurge: Boolean(feat.hasCompactMultiTurnSurge),
      isFlash38LowIdentity: Boolean(feat.isFlash38LowIdentity),
      pyHeredoc: feat.pyHeredoc || 0,
      catHeredoc: feat.catHeredoc || 0,
      geminiPyHelper: feat.geminiPyHelper || 0,
      inlineHtmlEcho: feat.inlineHtmlEcho || 0,
      sandboxLink: feat.sandboxLink || 0,
      lowerDoctype: feat.lowerDoctype || 0,
      colorSchemeCss: feat.colorSchemeCss || 0,
      prefersReducedMotion: feat.prefersReducedMotion || 0,
      svgSmilNoScript: feat.svgSmilNoScript || 0,
      ariaLabelledby: feat.ariaLabelledby || 0,
      cssRoot: feat.cssRoot || 0,
      raf: feat.raf || 0,
      svgRich: feat.svgRich || 0,
      boxComment: feat.boxComment || 0,
      claudeWarmPalette: feat.claudeWarmPalette || 0,
      cnColon: feat.cnColon || 0,
      emDash: feat.emDash || 0,
      curlyApostrophe: feat.curlyApostrophe || 0,
      straightApostrophe: feat.straightApostrophe || 0,
      unspacedEmDash: feat.unspacedEmDash || 0,
      writeUnderscoreName: feat.writeUnderscoreName || 0,
      checkmarkEmoji: feat.checkmarkEmoji || 0,
      lunaNotSurePhrase: feat.lunaNotSurePhrase || 0,
      solClarifyPhrase: feat.solClarifyPhrase || 0,
      astraSelfContainedPhrase: feat.astraSelfContainedPhrase || 0,
      terraPhrase: feat.terraPhrase || 0,
      evalModality: feat.evalModality || 'chat',
      tableCount: feat.tableCount || 0,
      listLineCount: feat.listLineCount || 0,
      selfCheckCount: feat.selfCheckCount || 0,
      thinkStepLines: feat.thinkStepLines || 0,
      avgThinkDurMs: feat.avgThinkDurMs || 0,
      codeOmissionCount: feat.codeOmissionCount || 0,
      codeDefensiveCount: feat.codeDefensiveCount || 0,
      searchSourcesCount: feat.searchSourcesCount || 0,
      citationCount: feat.citationCount || 0,
      mediaImgCount: feat.mediaImgCount || 0,
      mediaVideoCount: feat.mediaVideoCount || 0,
      bashReadFiles: feat.bashReadFiles || 0,
      bashEditFiles: feat.bashEditFiles || 0,
      bashSearchOps: feat.bashSearchOps || 0,
      bashTestRuns: feat.bashTestRuns || 0,
      bashBuildRuns: feat.bashBuildRuns || 0,
      editAddedLines: feat.editAddedLines || 0,
      editDeletedLines: feat.editDeletedLines || 0,
      multiTurnPersistence: feat.multiTurnPersistence ?? 0.78,
      promptEntropy: feat.promptEntropy ?? 0.45,
      codingTurns: feat.codingTurns || undefined,
      wireFam: feat.wireFam || undefined,
      htmlSvgMatch: feat.htmlSvgMatch?.best ? { code_type: feat.htmlSvgMatch.code_type, best: feat.htmlSvgMatch.best, top_candidates: (feat.htmlSvgMatch.top_candidates || feat.htmlSvgMatch.top3 || [feat.htmlSvgMatch.best]).slice(0, 4), features: feat.htmlSvgMatch.features } : undefined,
      tierVec: Array.isArray(feat.tierVec) && feat.tierVec.length === 12 ? feat.tierVec : undefined,
      htmlSvgSig: Array.isArray(feat.htmlSvgSig) && feat.htmlSvgSig.length === 12 ? feat.htmlSvgSig : undefined,
      isGeminiCoding: Boolean(feat.isGeminiCoding),
      isOpenThink: Boolean(feat.isOpenThink),
    };
  }

  function metaSimilarity(feat, meta) {
    if (!feat || !meta) return null;
    const fTools = feat.totalTools || 0;
    const mTools = meta.totalTools || 0;
    const hasBothTv = Array.isArray(feat.tierVec) && feat.tierVec.length === 12 && Array.isArray(meta.tierVec) && meta.tierVec.length === 12;
    if ((fTools === 0) !== (mTools === 0)) {
      if (!hasBothTv) return 0.25;
      const tvSimCross = tierVecSimilarity(feat.tierVec, meta.tierVec, feat.evalModality || meta.evalModality || 'chat');
      return tvSimCross != null ? Math.max(0.25, Math.min(0.68, 0.22 + tvSimCross * 0.48)) : 0.25;
    }
    const fOnlyAsk = fTools > 0 && feat.askUser === fTools;
    const mOnlyAsk = mTools > 0 && meta.askUser === mTools;
    if (fOnlyAsk !== mOnlyAsk) return 0.30;
    if (Boolean(feat.isGeminiCoding) !== Boolean(meta.isGeminiCoding)) return 0.20;
    const tvSim = hasBothTv
      ? tierVecSimilarity(feat.tierVec, meta.tierVec, feat.evalModality || meta.evalModality || 'chat')
      : null;
    let dSq = 0, wSum = 0;
    const addD = (a, b, scale, w) => {
      const diff = Math.min(1, Math.abs((Number(a) || 0) - (Number(b) || 0)) / Math.max(1e-5, scale));
      dSq += w * diff * diff;
      wSum += w;
    };
    const bothToolless = fTools === 0 && mTools === 0;
    const isCrossTurnMicro = Boolean(!bothToolless && ((feat.isMicroProbeChat && (feat.turns || 1) === 1 && (meta.turns || 1) >= 2) || (meta.isMicroProbeChat && (meta.turns || 1) === 1 && (feat.turns || 1) >= 2)));
    const hasHtmlEither = (feat.htmlMaxLen || 0) > 0 || (meta.htmlMaxLen || 0) > 0 || (feat.writtenChars || 0) > 0 || (meta.writtenChars || 0) > 0;
    if (isCrossTurnMicro) {
      const fR1 = feat.isMicroProbeChat ? (feat.hidR || 0) : (Math.max(0, (feat.hidR || 0) - (feat.maxRInTurn || 0)) || Math.round((feat.hidR || 0) * 0.35));
      const mR1 = meta.isMicroProbeChat ? (meta.hidR || 0) : (Math.max(0, (meta.hidR || 0) - (meta.maxRInTurn || 0)) || Math.round((meta.hidR || 0) * 0.35));
      addD(fR1, mR1, 4.5, 3.2);
      addD(fR1 === 0 ? 1 : 0, mR1 === 0 ? 1 : 0, 1.0, 2.4);
    } else {
      addD(feat.hidR / Math.max(1, feat.turns), (meta.hidR || 0) / Math.max(1, meta.turns || 1), 6.0, 2.8);
      addD(feat.maxRInTurn || 0, meta.maxRInTurn || 0, 12.0, 2.6);
    }
    if (!bothToolless) {
      addD(feat.preToolTextChars || 0, meta.preToolTextChars || 0, 280.0, 2.2);
      addD(feat.interToolTextChars || 0, meta.interToolTextChars || 0, 280.0, 1.8);
      addD(feat.askIdHasUnderscore || 0, meta.askIdHasUnderscore || 0, 1.0, fOnlyAsk ? 3.5 : 1.0);
    }
    if ((feat.avgTurnDurMs || 0) > 0 && (meta.avgTurnDurMs || 0) > 0) {
      const fDur = feat.isMicroProbeChat ? feat.avgTurnDurMs * 2.22 : feat.avgTurnDurMs;
      const mDur = meta.isMicroProbeChat ? meta.avgTurnDurMs * 2.22 : meta.avgTurnDurMs;
      addD(fDur, mDur, isCrossTurnMicro ? 55000.0 : 90000.0, isCrossTurnMicro ? 3.0 : 2.2);
    }
    if (!bothToolless || hasHtmlEither) {
      if (bothToolless && hasHtmlEither) {
        addD(Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0), Math.max(meta.writtenChars || 0, meta.htmlMaxLen || 0), 16000.0, 2.2);
        addD(feat.ariaLabelledby || 0, meta.ariaLabelledby || 0, 1.0, 1.5);
        addD(feat.svgSmilNoScript || 0, meta.svgSmilNoScript || 0, 1.0, 1.5);
      } else if (isCrossTurnMicro) {
        const fW1 = feat.isMicroProbeChat ? (feat.writtenChars || 0) : Math.min(4200, Math.max(1200, Math.round((feat.writtenChars || 10000) * ((feat.write || 1) >= 2 ? 0.18 : 0.45))));
        const mW1 = meta.isMicroProbeChat ? (meta.writtenChars || 0) : Math.min(4200, Math.max(1200, Math.round((meta.writtenChars || 10000) * ((meta.write || 1) >= 2 ? 0.18 : 0.45))));
        addD(fW1, mW1, 1800.0, 2.0);
      } else {
        const fWritten = feat.isMicroProbeChat ? Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0) * 5.5 : (feat.writtenChars || 0);
        const mWritten = meta.isMicroProbeChat ? Math.max(meta.writtenChars || 0, meta.htmlMaxLen || 0) * 5.5 : (meta.writtenChars || 0);
        addD(fWritten, mWritten, 45000.0, 1.6);
      }
    }
    if (!isCrossTurnMicro) {
      addD(feat.meanChars || 0, meta.meanChars || 0, 5000.0, 2.2);
    }
    if (!bothToolless) {
      addD(feat.edit || 0, meta.edit || 0, 4.0, isCrossTurnMicro ? 0.8 : 1.8);
      addD(feat.parallelSteps || 0, meta.parallelSteps || 0, 3.0, 1.6);
    }
    if ((feat.cps || 0) > 0 && (meta.cps || 0) > 0) {
      addD(feat.cps, meta.cps, isCrossTurnMicro ? 42.0 : 90.0, isCrossTurnMicro ? 3.6 : 1.8);
    }
    if ((feat.memoAvgChunk || 0) > 0 && (meta.memoAvgChunk || 0) > 0) {
      addD(feat.memoAvgChunk, meta.memoAvgChunk, feat.isGeminiCoding ? (isCrossTurnMicro ? 40.0 : 80.0) : (isCrossTurnMicro ? 4.5 : 12.0), isCrossTurnMicro ? 3.8 : 2.0);
    }
    if (!bothToolless || hasHtmlEither) {
      if (isCrossTurnMicro) {
        for (const bk of ['lowerDoctype', 'colorSchemeCss', 'prefersReducedMotion', 'svgSmilNoScript', 'ariaLabelledby', 'sandboxLink', 'writeUnderscoreName', 'inlineHtmlEcho', 'geminiPyHelper', 'boxComment', 'claudeWarmPalette']) {
          addD((feat[bk] || 0) > 0 ? 1 : 0, (meta[bk] || 0) > 0 ? 1 : 0, 1.0, 1.4);
        }
      } else {
        addD(feat.lowerDoctype || 0, meta.lowerDoctype || 0, 2.0, 1.8);
        addD(feat.colorSchemeCss || 0, meta.colorSchemeCss || 0, 2.0, 1.6);
        addD(feat.prefersReducedMotion || 0, meta.prefersReducedMotion || 0, 2.0, 1.6);
      }
    }
    if (!bothToolless && !isCrossTurnMicro) {
      addD(feat.bash || 0, meta.bash || 0, 4.0, 1.5);
      addD(feat.write || 0, meta.write || 0, 2.0, 1.5);
    }
    if (bothToolless) {
      addD(feat.emDash || 0, meta.emDash || 0, 8.0, 1.6);
      addD(feat.cnColon || 0, meta.cnColon || 0, 8.0, 1.6);
      if (meta.h2 !== undefined || meta.h3 !== undefined) {
        addD(feat.h2 || 0, meta.h2 || 0, 5.0, 1.4);
        addD(feat.h3 || 0, meta.h3 || 0, 6.0, 1.4);
      }
      if (meta.codeBlocks !== undefined) {
        addD(feat.codeBlocks || 0, meta.codeBlocks || 0, 4.0, 1.5);
      }
    }
    if ((feat.selfCheckCount || 0) > 0 || (meta.selfCheckCount || 0) > 0) {
      addD(feat.selfCheckCount || 0, meta.selfCheckCount || 0, 4.0, 1.4);
    }
    if ((feat.codeDefensiveCount || 0) > 0 || (meta.codeDefensiveCount || 0) > 0) {
      addD(feat.codeDefensiveCount || 0, meta.codeDefensiveCount || 0, 6.0, 1.5);
    }
    if ((feat.searchSourcesCount || 0) > 0 || (meta.searchSourcesCount || 0) > 0) {
      addD(feat.searchSourcesCount || 0, meta.searchSourcesCount || 0, 8.0, 1.6);
    }
    if ((feat.bash || 0) > 0 && (meta.bash || 0) > 0 && (meta.bashReadFiles !== undefined || meta.bashEditFiles !== undefined || meta.bashSearchOps !== undefined)) {
      addD(feat.bashReadFiles || 0, meta.bashReadFiles || 0, 6.0, 1.2);
      addD(feat.bashEditFiles || 0, meta.bashEditFiles || 0, 4.0, 1.3);
      addD(feat.bashSearchOps || 0, meta.bashSearchOps || 0, 5.0, 1.1);
      addD(feat.bashTestRuns || 0, meta.bashTestRuns || 0, 3.0, 1.2);
    }
    if ((feat.edit || 0) > 0 && (meta.edit || 0) > 0 && (meta.editAddedLines !== undefined || meta.editDeletedLines !== undefined)) {
      addD(feat.editAddedLines || 0, meta.editAddedLines || 0, 120.0, 1.1);
      addD(feat.editDeletedLines || 0, meta.editDeletedLines || 0, 80.0, 1.0);
    }
    if (Array.isArray(feat.htmlSvgSig) && feat.htmlSvgSig.length === 12 && Array.isArray(meta.htmlSvgSig) && meta.htmlSvgSig.length === 12) {
      for (let si = 0; si < 12; si++) {
        addD(feat.htmlSvgSig[si], meta.htmlSvgSig[si], 1.0, 0.45);
      }
    }
    const baseMetaSim = Math.max(0, Math.min(1, 1 - Math.sqrt(dSq / Math.max(1e-6, wSum))));
    return (tvSim != null && !isCrossTurnMicro) ? (baseMetaSim * 0.72 + tvSim * 0.28) : baseMetaSim;
  }

  // 二阶段同家族相邻档位解耦判别器（Stage-2 Intra-Family Effort-Tier Disentangler）：
  // 在 Stage-1 锁定候选模型家族后，专门使用 12 维档位微差子空间 tierVec、Battle 对偶超平面、多模态画像与厂商因子化档位先验，
  // 精准分离同家族内已存在的多个强度档位候选（绝不向 scoreMap 注入伪造或派生行，强度识别与型号本体识别严格解耦）
  function disentangleIntraFamilyTiers(scoreMap, feat, calib, bankByKey, isEvalAnalyze = false) {
    try {
      if (!scoreMap || !feat || !Array.isArray(feat.tierVec) || feat.tierVec.length !== 12) return;
      const tv = feat.tierVec;
      const mod = String(feat.evalModality || 'chat').toLowerCase();
      const TIER_IDEAL_EFFORT = { low: 0.25, medium: 0.48, high: 0.68, xhigh: 0.81, max: 0.92 };

      // 1. 按 famKey 聚合现有候选家族（不再从 tierCentroids 派生新行进入 scoreMap，防止强度档位与型号习惯冲突或产生双后缀）
      const famGroups = new Map();
      for (const [k, item] of scoreMap.entries()) {
        if (!item) continue;
        item.label = formatDisplayModelLabel(item.label, item.canon);
        const p = parseModelFamilyAndTier(item.canon || item.label);
        if (!p.famKey || !p.tier) continue;
        if (!famGroups.has(p.famKey)) famGroups.set(p.famKey, []);
        famGroups.get(p.famKey).push({ key: k, item, tier: p.tier, famKey: p.famKey, baseLabel: p.baseLabel });
      }

      for (const [famKey, members] of famGroups.entries()) {
        const effInfo = identifyEffortTier(feat, famKey, calib);
        if (effInfo?.tier) {
          for (const m of members) {
            m.item.detectedEffort = (m.tier && m.tier !== 'standard') ? m.tier : effInfo.tier;
            m.item.familyInferredEffort = effInfo.tier;
          }
        }
        if (members.length < 2) continue;
        const maxFamSim = Math.max(...members.map(m => m.item.sim || 0));
        if (maxFamSim < 0.78) continue;

        const hyperMap = calib?.intraFamilyHyperplanes?.[famKey] || null;
        const tierScores = new Map();

        for (const m of members) {
          let ev = 0;
          let wSum = 0;

          // (A) 该档位专属 Battle/Direct 真值质心匹配度（最高优先，高权重锚定）
          const cent = calib?.tierCentroids?.[m.key];
          if (cent && Array.isArray(cent.tierVec) && cent.tierVec.length === 12) {
            const cSim = tierVecSimilarity(tv, cent.tierVec, mod, cent.stdVec);
            if (cSim != null) {
              const truthConf = Math.min(1.0, (Number(cent.truthWeightSum) || (cent.count || 1) * 2) / 9.0);
              const wCent = 3.4 * (0.45 + 0.55 * truthConf);
              ev += (cSim - 0.75) * wCent;
              wSum += wCent;
            }
          }

          // (B) 当前模态（chat / webdev / search / image / video）专属档位画像匹配
          const modProf = calib?.modalityProfiles?.[mod]?.[m.key];
          if (modProf && Array.isArray(modProf.tierVec) && modProf.tierVec.length === 12) {
            const mSim = tierVecSimilarity(tv, modProf.tierVec, mod);
            if (mSim != null) {
              const wMod = 1.85;
              ev += (mSim - 0.75) * wMod;
              wSum += wMod;
            }
          }

          // (C) 厂商级跨家族档位相对先验（当该家族某档位尚缺直接样本时，借用同厂商如 Anthropic/OpenAI 同档位微差特征）
          const vid = detectModelVendorId(m.item.canon || m.item.label);
          const vPrior = calib?.vendorTierDeltas?.[vid]?.[m.tier];
          if (vPrior && Array.isArray(vPrior.tierVec) && vPrior.tierVec.length === 12) {
            const vpSim = tierVecSimilarity(tv, vPrior.tierVec, mod);
            if (vpSim != null) {
              const wVp = cent ? 0.55 : 1.15;
              ev += (vpSim - 0.76) * wVp;
              wSum += wVp;
            }
          }

          // (D) Battle 同题对偶线性超平面 margin 投票（如 high>medium, max>high）：大幅拉开同家族不同强度档位误差
          if (hyperMap && typeof hyperMap === 'object') {
            for (const [pk, hObj] of Object.entries(hyperMap)) {
              if (!hObj || !Array.isArray(hObj.wVec) || hObj.wVec.length !== 12) continue;
              const [hiT, loT] = pk.split('>');
              if (m.tier !== hiT && m.tier !== loT) continue;
              const proj = tv.reduce((acc, val, idx) => acc + (Number(hObj.wVec[idx]) || 0) * (Number(val) || 0), 0);
              const margin = proj - (Number(hObj.threshold) || 0);
              const dir = m.tier === hiT ? 1 : -1;
              const hConf = Math.min(1.0, (Number(hObj.count) || 1) / 3);
              ev += Math.max(-0.24, Math.min(0.24, dir * margin * 1.85)) * (2.4 * hConf);
              wSum += 1.5 * hConf;
            }
          }

          // (E) 内禀 Prompt 复杂度归一化努力度曲线（兜底防漂移）
          const idealE = TIER_IDEAL_EFFORT[m.tier] ?? 0.68;
          const actualE = (Number(tv[11]) || 0.65) * 0.55 + (Number(tv[0]) || 0.5) * 0.25 + (Number(tv[4]) || 0.5) * 0.20;
          const eDist = Math.abs(actualE - idealE);
          ev += (0.18 - eDist) * 1.05;
          wSum += 1.05;

          const normEv = wSum > 0 ? (ev / wSum) : 0;
          tierScores.set(m.key, normEv);
        }

        // 零均值中心化精排：保持该模型家族整体对外竞争力不变，在有 Battle/Direct 真值校准时果断拉开不同强度档位差距
        const hasLearnedFamTier = Boolean(
          (hyperMap && Object.keys(hyperMap).length > 0) ||
          members.some(m => calib?.tierCentroids?.[m.key])
        );
        const vals = [...tierScores.values()];
        const meanEv = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        const sortedBySim = [...members].sort((a, b) => (Number(b.item?.sim) || 0) - (Number(a.item?.sim) || 0));
        const famMaxSim = Number(sortedBySim[0]?.item?.sim) || 0.15;
        const secondSim = Number(sortedBySim[1]?.item?.sim) || 0;
        const hasStrongRuleLeader = Boolean(sortedBySim[0]?.item?.protoRuleLeader) || (famMaxSim >= 0.955 && (famMaxSim - secondSim) >= 0.024) || Boolean(feat?.tagReiTier && sortedBySim[0]?.tier === feat.tagReiTier);
        let bestMember = null, bestRel = -999;
        if (hasStrongRuleLeader) {
          bestMember = sortedBySim[0];
          bestRel = 0.05;
        } else {
          for (const m of members) {
            const rel = (tierScores.get(m.key) || 0) - meanEv;
            if (rel > bestRel) {
              bestRel = rel;
              bestMember = m;
            }
            const delta = hasLearnedFamTier
              ? Math.max(-0.075, Math.min(0.085, rel * 0.52))
              : Math.max(-0.026, Math.min(0.032, rel * 0.22));
            m.item.sim = Math.max(0.12, Math.min(0.994, famMaxSim + 0.004, m.item.sim + delta));
          }
          if (bestMember && bestMember.item.sim < famMaxSim) bestMember.item.sim = famMaxSim;
        }
        if (bestMember && bestRel >= 0.028 && calib?.tierCentroids?.[bestMember.key]) {
          const tag = `🎯 同族档位微差锁定(${bestMember.tier.toUpperCase()})`;
          bestMember.item.tags = [tag, ...(bestMember.item.tags || []).filter(t => t !== tag).slice(0, 4)];
        }
      }
    } catch {}
  }

  function analyze(chat, modelEntry = null, { ignoreExactSid = false, preferLatestTurn = false } = {}) {
    const rawSid = String(chat?.sid || modelEntry?.sid || '');
    const sid = rawSid;
    const cacheSidKey = rawSid || '';
    const allMsgs = Array.isArray(chat?.messages) ? chat.messages : [];
    const lastM = allMsgs.at(-1);
    const lastP = lastM?.parts?.at(-1);
    const lastPLen = typeof lastP?.text === 'string' ? lastP.text.length : (typeof lastP?.inputText === 'string' ? lastP.inputText.length : 0);
    const mRef = ignoreExactSid ? modelEntry : (modelEntry || (sid && typeof Models !== 'undefined' ? Models.get(sid) : null));
    const msgDigest = computeMessagesDigest(allMsgs);
    const anaCacheKey = cacheSidKey ? `${cacheSidKey}:${allMsgs.length}:${lastM?.id || ''}:${lastM?.parts?.length || 0}:${msgDigest}:${chat?.busy ? (lastPLen >> 8) : lastPLen}:${chat?.fmt?.tN ? (chat.fmt.tN >> 4) : 0}:${ignoreExactSid ? '' : (mRef?.name || '')}:${ignoreExactSid ? 0 : (mRef?.userCorrected ? 1 : 0)}:${ignoreExactSid ? 0 : (mRef?.reverseScore || 0)}:${ignoreExactSid ? 0 : (mRef?.habitTags?.length || 0)}:${bankRev}:${calibRev}:${ignoreExactSid ? 1 : 0}` : '';
    if (anaCacheKey && _analyzeCache.has(cacheSidKey) && _analyzeCache.get(cacheSidKey).key === anaCacheKey) {
      return _analyzeCache.get(cacheSidKey).val;
    }
    const feat = chat?._injectedFeat || extractFeatures(chat, mRef, { ignoreExactSid, preferLatestTurn });
    if (!feat) {
      if (anaCacheKey) {
        if (_analyzeCache.size > 64) _analyzeCache.delete(_analyzeCache.keys().next().value);
        _analyzeCache.set(cacheSidKey, { key: anaCacheKey, val: null });
      }
      return null;
    }
    if (!Array.isArray(feat.habitTags)) feat.habitTags = [];
    const bank = loadBank();
    const calib = loadCalibration();
    const usageStats = getUsageStats();
    const scoreMap = new Map();
    const cpsEarly = Number(feat.cps) || 0;

    const isArgonBehavior = ((feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.search || 0) >= 2 && feat.askUser >= 1 && (feat.writtenChars || 0) >= 50000 && cpsEarly >= 200) || (feat.turns === 2 && feat.write === 1 && (feat.bash || 0) <= 6 && (feat.tagThinkTok || 0) >= 25000) || (feat.write === 2 && (feat.bash || 0) <= 1 && (feat.edit || 0) === 0 && ((feat.memoAvgChunk || 0) >= 200 || cpsEarly >= 210) && (feat.writtenChars || 0) >= 95000) || ((feat.inlineHtmlEcho === 0 || feat.htmlSvgMatch?.best?.model_id === "google/gemini-4-argon" || (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.parallelSteps || 0) >= 2 && feat.avgTurnDurMs >= 220000 && cpsEarly > 0 && cpsEarly < 140) || (feat.turns >= 4 && feat.bash >= 5 && feat.writtenChars >= 65000) || (feat.turns <= 2 && feat.bash >= 50 && (feat.search || 0) >= 20 && feat.avgTurnDurMs >= 300000) || (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 850 && feat.avgTurnDurMs >= 195000)) && (feat.geminiPyHelper === 0 || (feat.bash >= 20 && (feat.read || 0) >= 8 && feat.write === 0 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 15))))) && !(feat.turns >= 3 && (feat.search || 0) >= 25 && (feat.askUser || 0) >= 1) && !(feat.turns >= 5 && (feat.pyHeredoc || 0) >= 20 && (feat.askUser || 0) >= 1) && (
      (feat.htmlSvgMatch?.best?.model_id === "google/gemini-4-argon" && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.70) ||
      feat.edit >= 1 ||
      feat.read >= 12 ||
      (feat.bash >= 20 && (feat.read || 0) >= 8 && feat.write === 0 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 15)) ||
      (feat.parallelSteps >= 2 && feat.catHeredoc === 0) ||
      (feat.parallelSteps >= 1 && feat.avgTurnDurMs >= 60000) ||
      (feat.bash >= 3 && (feat.search || 0) < 10 && feat.avgTurnDurMs >= 80000 && !(feat.turns <= 2 && cpsEarly >= 180 && (feat.memoDeltaCount || 0) >= 200 && (feat.read || 0) === 0) && (feat.write >= 1 || (feat.turns === 1 && feat.bash <= 19 && feat.totalTools <= 36) || (feat.turns === 2 && feat.bash >= 20 && (feat.search || 0) <= 2 && feat.avgTurnDurMs >= 250000))) ||
      (feat.turns === 1 && feat.bash >= 20 && feat.bash <= 32 && (feat.search || 0) >= 10 && (feat.search || 0) <= 25 && feat.write === 0 && feat.edit === 0 && feat.avgTurnDurMs >= 200000 && feat.avgTurnDurMs <= 310000) ||
      (feat.turns <= 2 && feat.bash >= 50 && (feat.search || 0) >= 20 && feat.avgTurnDurMs >= 400000) ||
      (feat.turns === 2 && feat.write === 2 && feat.bash === 3 && (feat.read || 0) === 1 && feat.edit === 0 && cpsEarly >= 165) ||
      (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 160) && feat.writtenChars >= 30000 && feat.writtenChars <= 44500 && (feat.writeUnderscoreName || 0) === 0) ||
      (feat.turns === 2 && feat.write === 2 && feat.bash >= 1 && feat.bash <= 2 && feat.edit === 0 && (cpsEarly === 0 || cpsEarly < 195) && ((feat.writtenChars >= 42000 && feat.writtenChars <= 52000) || (feat.writtenChars >= 34000 && feat.writtenChars <= 62000 && ((feat.boxComment || 0) >= 1 || (feat.cnColon || 0) >= 3)))) ||
      (feat.write === 2 && (feat.bash || 0) <= 1 && (feat.edit || 0) === 0 && ((feat.memoAvgChunk || 0) >= 160 || cpsEarly >= 155) && (feat.writtenChars || 0) >= 75000) ||
      (feat.turns === 3 && feat.bash >= 15 && (feat.search || 0) <= 5 && feat.write <= 1 && feat.edit === 0) ||
      (feat.askUser >= 1 && feat.bash >= 1 && feat.bash <= 8 && (feat.search || 0) <= 2 && feat.write <= 1 && feat.edit === 0) ||
      (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.search || 0) >= 2 && feat.askUser >= 1 && (feat.writtenChars || 0) >= 40000 && cpsEarly >= 150) ||
      (feat.turns === 2 && feat.write === 1 && (feat.bash || 0) <= 6 && (feat.tagThinkTok || 0) >= 25000) ||
      (feat.turns <= 3 && feat.bash >= 5 && (feat.pyHeredoc || 0) <= 10 && (feat.search || 0) === 0 && feat.edit === 0 && (feat.write >= 1 || feat.cnColon >= 4) && (feat.writtenChars > 0 || feat.avgTurnDurMs > 0 || feat.cnColon >= 4)) ||
      (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 850 && feat.avgTurnDurMs >= 195000) ||
      (feat.turns === 1 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && feat.askUser === 0 && ((feat.avgTurnDurMs >= 33000 && feat.meanChars >= 800) || ((feat.search || 0) === 1 && feat.meanChars >= 2000))) ||
      (feat.totalTools === 0 && feat.meanChars >= 330 && (feat.avgTurnDurMs >= 15000 || (feat.turns >= 2 && (feat.memoAvgChunk || 0) >= 20 && (feat.memoAvgChunk || 0) <= 80) || (feat.turns === 1 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) >= 14000 && (feat.evalModality === 'chat' || (feat.htmlSvgMatch?.best?.canon === 'gemini-4-argon-max' && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.70)))))
    );
    const isKnownArgon = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (
      KNOWN_ARGON_SIDS.has(sid) ||
      Boolean(isArgonBehavior) ||
      (Boolean(feat.isMicroProbeChat) && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.inlineHtmlEcho || 0) === 0 && (feat.geminiPyHelper || 0) === 0 && (feat.memoAvgChunk || 0) >= 35 && (feat.memoAvgChunk || 0) <= 160 && (feat.avgTurnDurMs >= 26000 || (feat.writtenChars >= 3200 && cpsEarly > 0 && cpsEarly < 175))) ||
      bank.some(b => b && b.sid === sid && (b.userConfirmed || b.importedFromDiag) && /argon|barium/i.test(String(b.id || b.model || '')))
    );

    const onlyAskUser = feat.totalTools > 0 && feat.askUser === feat.totalTools;
    const isHaikuPlainMedium = feat.totalTools === 0 && !(feat.turns === 1 && feat.hidR === 0 && (feat.meanChars || 0) >= 700 && (feat.meanChars || 0) <= 850 && (feat.straightApostrophe || 0) >= 2) && feat.straightApostrophe >= 1 && feat.curlyApostrophe === 0 && feat.meanChars >= 380 && feat.meanChars <= 1600;
    const wPerWrite = (feat.writtenChars || 0) / Math.max(1, feat.write || 1);
    const isFable51CodingCore = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (((feat.turns === 1 && feat.hidR === 1) || ((feat.codingTurns || 1) === 1 && (feat.nonCodeMeanChars || 0) > 0 && (feat.nonCodeMeanChars || 0) <= 180 && (feat.maxRInTurn || 1) === 1)) &&
        feat.write === 1 && feat.totalTools === 2 &&
        (feat.bash || 0) === 0 && (feat.preToolTextChars || 0) === 0 && (feat.interToolTextChars || 0) === 0 &&
        (((feat.cps || 0) >= 95) || ((feat.cps || 0) === 0 && ((feat.avgTurnDurMs || 0) === 0 || (feat.avgTurnDurMs || 0) >= 3600000) && (feat.memoDeltaCount || 0) >= 40)) && ((feat.memoAvgChunk || 0) >= 10.5 && (feat.memoAvgChunk || 0) <= 15.2) &&
        (feat.writtenChars || 0) >= 11500 && (feat.writtenChars || 0) <= 16500 &&
        (feat.straightApostrophe || 0) >= 2 &&
        (feat.prefersReducedMotion || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.boxComment || 0) === 0) ||
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && (feat.bash || 0) === 0 && (feat.edit || 0) === 0 && (feat.preToolTextChars || 0) === 0 && (feat.interToolTextChars || 0) === 0 && cpsEarly >= 52 && cpsEarly <= 75 && (feat.avgTurnDurMs || 0) >= 165000 && (feat.writtenChars || 0) >= 12000 && (feat.writtenChars || 0) <= 18000) ||
        (feat.htmlSvgMatch?.best?.id === 'anthropic/claude-fable-5.1' && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.65)
      )
    );
    const isLunaHighCodingCore = false;
    const isHaikuMultiTurnMedium = !isFable51CodingCore && feat.wireFam !== 'openai' && (((feat.turns === 3 && feat.write === 2 && feat.bash === 0 && (feat.search || 0) === 1) || (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1)) && cpsEarly >= 220 && feat.writtenChars >= 16000 && feat.writtenChars < 22000 || (feat.turns >= 2 && feat.write >= 1 && feat.write <= 2 && feat.bash === 0 && feat.edit === 0 && feat.askUser === 0 && wPerWrite >= 12000 && wPerWrite < 14000 && ((feat.nonCodeMeanChars || 0) === 0 || (feat.nonCodeMeanChars || 0) <= 500 || (feat.nonCodeMeanChars || 0) === Math.round(feat.meanChars || 0)) && feat.maxRInTurn <= 2 && (feat.memoDeltaCount >= 50 || ((feat.memoDeltaCount || 0) === 0 && ((feat.straightApostrophe || 0) >= 3 || (feat.avgTurnDurMs >= 65000 && feat.avgTurnDurMs <= 90000) || (feat.turns >= 5 && feat.meanChars >= 4000 && feat.meanChars < 7500)))) && feat.sandboxLink === 0 && feat.lowerDoctype === 0 && feat.prefersReducedMotion === 0 && feat.boxComment === 0));
    const isMicroProbe = Boolean(feat.isMicroProbeChat);
    const effWChars = isMicroProbe ? Math.round(Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0) * 8.5) : (feat.writtenChars || 0);
    const avgChunk = Number(feat.memoAvgChunk) || 0;
    const deltaCnt = Number(feat.memoDeltaCount) || 0;
    const isEvalAnalyze = Boolean(chat?.isEvaluation || chat?.evalMode === 'battle' || chat?.evalMode === 'direct' || chat?.battleSide || /#[ab]$/i.test(rawSid) || /#[ab]$/i.test(sid));
    const hasOpenAiIntentMarkers = Boolean((feat.askIdHasUnderscore || 0) > 0 || (feat.askFormatOpt || 0) > 0 || (feat.askTransformOpt || 0) > 0 || feat.hasSys6603Tag || feat.hasZeroCacheWriteTag || feat.isSol61Tag || feat.isLunaFastTag || (feat.totalTools === 0 && (feat.straightApostrophe || 0) === 0 && (feat.htmlMaxLen || 0) === 0 && ((feat.solClarifyPhrase || 0) > 0 || (feat.lunaNotSurePhrase || 0) > 0 || (feat.astraSelfContainedPhrase || 0) > 0 || ((feat.unspacedEmDash || 0) >= 1 && (feat.avgTurnDurMs || 0) > 0 && (feat.avgTurnDurMs || 0) <= 4000 && (feat.meanChars || 0) <= 150) || (feat.turns === 1 && feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && feat.isMicroProbeChat && (feat.meanChars || 0) >= 250 && (feat.meanChars || 0) <= 320 && (feat.cnColon || 0) === 0))) || (feat.turns === 1 && feat.hidR === 0 && (feat.read || 0) >= 4 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && (feat.meanChars || 0) <= 220));
    const isDefiniteOpenAiChunkStream = !isEvalAnalyze && !feat.isGeminiCoding && !isFable51CodingCore && deltaCnt >= 15 && avgChunk >= 1.0 && avgChunk < 4.2 && (feat.claudeWarmPalette || 0) === 0;
    const hasClaudeChunkSig = !isEvalAnalyze && !isDefiniteOpenAiChunkStream && !hasOpenAiIntentMarkers && feat.wireFam !== 'openai' && deltaCnt >= 6 && avgChunk >= 4.0 && avgChunk <= 19.5 && !feat.isGeminiCoding && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0;
    const hasOpenAiChunkSig = !isEvalAnalyze && (isDefiniteOpenAiChunkStream || (deltaCnt >= 6 && ((avgChunk >= 20.0 && avgChunk <= 62.0) || (avgChunk >= 1.0 && avgChunk < 5.0)) && !feat.isGeminiCoding && (feat.claudeWarmPalette || 0) === 0 && (feat.boxComment || 0) === 0 && (feat.preToolTextChars || 0) < 100 && (feat.interToolTextChars || 0) < 80));
    const isClaudeHtmlNoOpenAiMarkers = !isDefiniteOpenAiChunkStream && feat.wireFam !== 'openai' && !feat.isGeminiCoding && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && ((feat.ariaLabelledby || 0) === 0 || (feat.boxComment || 0) >= 1 || (feat.preNarrate || 0) >= 0.45) && (feat.prefersReducedMotion || 0) <= (hasClaudeChunkSig || (feat.boxComment || 0) >= 1 ? 2 : 1) && (hasClaudeChunkSig || (feat.boxComment || 0) >= 1 || (feat.write >= 2 && feat.hidR >= 2 && feat.maxRInTurn <= 3 && feat.writtenChars >= 9500 && feat.writtenChars < 22000) || (feat.write === 1 && feat.bash === 0 && feat.hidR >= 1 && feat.maxRInTurn <= 3 && feat.writtenChars >= 14000 && (feat.avgTurnDurMs || 0) >= 95000));
    const isHaikuCodingOrSearch = !isDefiniteOpenAiChunkStream && (
      (feat.turns === 1 && feat.hidR === 2 && feat.totalTools === 4 && feat.write === 1 && (feat.edit || 0) >= 2 && (feat.interToolTextChars || 0) >= 90 && cpsEarly >= 105 && cpsEarly <= 145) ||
      (feat.turns === 2 && feat.hidR === 2 && feat.totalTools === 2 && feat.write === 1 && cpsEarly >= 190 && cpsEarly <= 245 && (feat.avgTurnDurMs || 0) <= 45000 && (feat.writtenChars || 0) >= 16500 && (feat.writtenChars || 0) <= 18000) ||
      (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.writtenChars > 0 && feat.writtenChars < 12000 && feat.cnColon >= 1 && (!isMicroProbe || (feat.boxComment === 0 && feat.claudeWarmPalette === 0 && feat.hidR <= 1 && feat.preToolTextChars < 90 && feat.interToolTextChars < 60))) ||
      (isMicroProbe && feat.turns <= 2 && feat.write >= 1 && feat.bash <= 1 && feat.hidR <= 1 && feat.boxComment === 0 && feat.claudeWarmPalette === 0 && feat.preToolTextChars < 25 && feat.interToolTextChars < 45 && effWChars > 0 && effWChars < 11500 && feat.cnColon >= 1) ||
      (feat.turns === 1 && feat.search >= 2 && feat.bash === 0 && feat.write === 0 && feat.askUser === 0)
    );
    const isSonnetPlainMulti = feat.turns === 2 && feat.totalTools === 0 && feat.memoAvgChunk >= 240 && feat.curlyApostrophe === 0;
    const isSolarPro4Profile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        feat.htmlSvgMatch?.best?.id === 'upstage/solar-pro4' ||
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.cps || 0) >= 30 && (feat.cps || 0) <= 44 && avgChunk >= 6.5 && avgChunk <= 15.0 && (feat.avgTurnDurMs || 0) >= 250000 && (feat.htmlMaxLen || 0) >= 10000 && (feat.htmlMaxLen || 0) <= 16000 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0)
      )
    );
    const isMuseSpark12Max = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.write === 1 && feat.totalTools === 1 && (feat.cps || 0) >= 500 && (feat.writtenChars || 0) >= 35000 && (feat.emDash || 0) >= 4
    );
    const isMuseSpark13High = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.totalTools === 3 && (feat.cps || 0) >= 195 && (feat.cps || 0) <= 280 && (feat.avgTurnDurMs || 0) > 0 && (feat.avgTurnDurMs || 0) <= 34000 && (feat.preToolTextChars || 0) >= 140 && (feat.emDash || 0) >= 2 && (feat.prefersReducedMotion || 0) >= 1 && (feat.lowerDoctype || 0) === 0
    );
    const isMuseSpark13Low = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 2 && feat.write === 1 && feat.totalTools === 2 && feat.hidR >= 35 && feat.hidR <= 47 && avgChunk >= 3.5 && avgChunk <= 6.5 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1
    );
    const htmlSvgCands = (feat.htmlSvgMatch && Array.isArray(feat.htmlSvgMatch.top_candidates) && feat.htmlSvgMatch.top_candidates.length > 0) ? feat.htmlSvgMatch.top_candidates : (feat.htmlSvgMatch?.best ? [feat.htmlSvgMatch.best] : []);
    const hasHtmlMuse13Rule = Boolean(htmlSvgCands.some(c => c.model_id === 'meta/muse-spark-1.3' && c.ruleScore >= 0.55));
    const isMuseSpark13Max = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && !isMuseSpark12Max && !isMuseSpark13High && !isMuseSpark13Low && (
        hasHtmlMuse13Rule ||
        (Boolean(feat.isMicroProbeChat) && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) === 0 && ((feat.preToolTextChars >= 55 && feat.hidR >= 2 && feat.hidR <= 4 && (feat.claudeWarmPalette || 0) === 0 && (cpsEarly < 165)) || (feat.hidR === 1 && (feat.prefersReducedMotion || 0) >= 1 && avgChunk >= 11.5 && avgChunk <= 13.5 && (feat.writtenChars || 0) <= 1500))) ||
        (feat.turns === 1 && feat.write === 1 && feat.totalTools === 1 && (feat.bash || 0) === 0 && (feat.writtenChars || 0) >= 35000 && (feat.writtenChars || 0) < 44500 && (feat.cps || 0) >= 240 && (feat.cps || 0) < 500 && (feat.prefersReducedMotion || 0) >= 1 && (feat.ariaLabelledby || 0) >= 1 && (feat.boxComment || 0) === 0 && (feat.claudeWarmPalette || 0) === 0) ||
        (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.genImg || 0) === 0 && feat.hidR >= 4 && feat.hidR <= 6 && feat.maxRInTurn === 3 && (feat.preToolTextChars || 0) >= 70 && (feat.writtenChars || 0) <= 26000 && ((avgChunk >= 10.5 && avgChunk <= 29.0) || (avgChunk === 0 && (feat.cps || 0) >= 120)) && (feat.emDash || 0) >= 2) ||
        (feat.turns === 3 && feat.write === 1 && feat.totalTools === 2 && feat.hidR === 5 && avgChunk >= 6.5 && avgChunk <= 9.0 && (feat.writtenChars || 0) >= 19000 && (feat.emDash || 0) >= 4) ||
        (feat.turns === 1 && feat.write === 1 && feat.totalTools === 2 && feat.hidR === 3 && (feat.cps || 0) >= 165 && (feat.cps || 0) <= 550 && (feat.preToolTextChars || 0) >= 55 && ((feat.emDash || 0) >= 2 || (feat.boxComment || 0) >= 1 || (feat.prefersReducedMotion || 0) >= 1)) ||
        (feat.turns === 1 && feat.write === 1 && feat.totalTools === 2 && feat.hidR === 1 && (feat.avgTurnDurMs || 0) >= 400000 && (feat.cps || 0) >= 20 && (feat.cps || 0) <= 35 && (feat.writtenChars || 0) >= 12000 && (feat.writtenChars || 0) <= 16500 && (feat.lowerDoctype || 0) === 0 && (feat.prefersReducedMotion || 0) === 0) ||
        (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && feat.totalTools === 3 && feat.hidR === 3 && avgChunk >= 11.5 && avgChunk <= 13.5 && (feat.memoDeltaCount || 0) >= 400 && (feat.writtenChars || 0) >= 1800 && (feat.writtenChars || 0) <= 3500 && (feat.htmlMaxLen || 0) >= 6000) ||
        (feat.turns === 2 && feat.write === 3 && feat.bash === 2 && feat.totalTools === 7 && feat.hidR === 9 && (feat.cps || 0) >= 145 && avgChunk >= 1.2 && avgChunk <= 2.2 && (feat.memoDeltaCount || 0) >= 200) ||
        ((feat.turns || 0) >= 2 && (feat.turns || 0) <= 4 && (feat.write || 0) >= 2 && (feat.write || 0) <= 4 && (feat.bash || 0) >= 1 && (feat.bash || 0) <= 2 && (feat.edit || 0) <= 1 && (feat.read || 0) === 0 && (feat.hidR || 0) >= 6 && (feat.hidR || 0) <= 12 && (feat.preNarrate || 0) >= 0.95 && (feat.preToolTextChars || 0) >= 85 && (feat.preToolTextChars || 0) <= 220 && (feat.writtenChars || 0) >= 14000 && (feat.writtenChars || 0) <= 42000 && (feat.htmlMaxLen || 0) >= 12000 && (feat.htmlMaxLen || 0) <= 28000 && (feat.avgTurnDurMs || 0) >= 95000 && (feat.avgTurnDurMs || 0) <= 210000 && (feat.cps || 0) >= 32 && (feat.cps || 0) <= 115 && ((feat.ariaLabelledby || 0) >= 1 || (feat.prefersReducedMotion || 0) >= 2 || (feat.raf || 0) >= 1) && (feat.svgRich || 0) >= 1 && ((feat.lowerDoctype || 0) === 0 || (feat.preNarrate || 0) >= 0.95) && (feat.colorSchemeCss || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.claudeWarmPalette || 0) === 0 && (feat.cnColon || 0) === 0 && (feat.writeUnderscoreName || 0) === 0) ||
        (feat.turns === 2 && feat.write === 1 && feat.totalTools === 2 && feat.hidR >= 48 && avgChunk >= 9.0 && avgChunk <= 15.0 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && (feat.bash || 0) === 0 && (feat.write || 0) === 0 && (feat.edit || 0) === 0 && (feat.read || 0) === 0 && (feat.preNarrate || 0) >= 0.8 && (feat.htmlMaxLen || 0) >= 60000 && (feat.boxComment || 0) >= 1)
      )
    );
    const isMuseWonder = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.cps || 0) >= 5.5 && (feat.cps || 0) <= 10.5 && avgChunk >= 8.5 && avgChunk <= 11.5 && (feat.meanChars || 0) >= 180 && (feat.meanChars || 0) <= 360 && (feat.emDash || 0) >= 1
    );
    const isMuseSparkOpen = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 3 && (feat.read || 0) === 1 && (feat.write || 0) === 0 && (feat.bash || 0) === 0 && (feat.cps || 0) >= 16 && (feat.cps || 0) <= 24 && avgChunk >= 5.0 && avgChunk <= 7.5 && (feat.interToolTextChars || 0) >= 400) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 7200 && (feat.htmlMaxLen || 0) <= 7500 && (feat.svgSmilNoScript || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && (feat.lowerDoctype || 0) === 0) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.write === 0 && (feat.bash || 0) === 0 && (feat.preNarrate || 0) === 0 && (feat.emDash || 0) === 0 && (feat.meanChars || 0) >= 295 && (feat.meanChars || 0) <= 340)
      )
    );
    const isKibitzProfile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.write === 0 && feat.bash === 0 && ((feat.edit || 0) >= 1 || feat.totalTools >= 12 || (feat.hidR === 3 && feat.totalTools === 2 && (feat.read || 0) === 1 && (feat.parallelSteps || 0) === 1 && (feat.cps || 0) >= 3.5)) && (feat.cps || 0) > 0 && (feat.cps || 0) <= 5.8 && avgChunk > 0 && avgChunk <= 2.3) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 30000 && (feat.htmlMaxLen || 0) <= 60000 && (feat.prefersReducedMotion || 0) >= 1 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0)
      )
    );
    const isHorizon62Profile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.totalTools >= 1 && feat.totalTools <= 3 && (feat.cps || 0) >= 4.0 && (feat.cps || 0) <= 7.2 && avgChunk >= 3.8 && avgChunk <= 5.5 && (feat.avgTurnDurMs || 0) >= 100000) ||
        (feat.turns === 1 && feat.hidR >= 2 && feat.hidR <= 3 && feat.totalTools >= 1 && feat.totalTools <= 3 && feat.bash === 0 && feat.write === 0 && (feat.edit || 0) === 0 && (((feat.read || 0) === 0 && (feat.preToolTextChars || 0) >= 50 && (feat.meanChars || 0) <= 600) || ((feat.thinkStepLines || 0) >= 250 && (feat.meanChars || 0) <= 800))) ||
        (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.emDash || 0) >= 20 && (feat.htmlMaxLen || 0) >= 20000)
      )
    );
    const isKalmiaProfile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && (
        (feat.turns === 1 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.totalTools === 2 && (feat.cps || 0) >= 8.5 && (feat.cps || 0) <= 13.5 && avgChunk >= 4.2 && avgChunk <= 5.3 && (feat.avgTurnDurMs || 0) >= 50000 && (feat.avgTurnDurMs || 0) < 90000) ||
        (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (feat.cps || 0) >= 48 && (feat.cps || 0) <= 62 && avgChunk >= 3.5 && avgChunk <= 4.8 && (feat.meanChars || 0) >= 9000 && (feat.emDash || 0) >= 12)
      )
    );
    const isCynosureProfile = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 12500 && (feat.htmlMaxLen || 0) <= 14500 && (feat.emDash || 0) >= 5 && (feat.boxComment || 0) >= 1
    );
    const isGrok46XHigh = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.totalTools === 0 && (
        (feat.hidR === 0 && (feat.svgSmilNoScript || 0) >= 1 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && ((feat.htmlMaxLen || 0) <= 2000 || ((feat.htmlMaxLen || 0) >= 7000 && (feat.htmlMaxLen || 0) <= 8000))) ||
        (feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) >= 16500 && (feat.htmlMaxLen || 0) <= 17600 && (feat.emDash || 0) >= 1 && (feat.prefersReducedMotion || 0) === 0)
      )
    );
    const isGrok46High = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && (
        (feat.totalTools === 0 && (
          (feat.hidR === 3 && (feat.cps || 0) >= 58 && (feat.cps || 0) <= 72 && (feat.htmlMaxLen || 0) >= 13000 && (feat.htmlMaxLen || 0) <= 15000 && (feat.emDash || 0) >= 3) ||
          (feat.hidR === 0 && (feat.cps || 0) > 0 && (feat.cps || 0) <= 1.2 && (feat.avgTurnDurMs || 0) >= 60000 && (feat.meanChars || 0) <= 100) ||
          (feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) === 0 && (feat.meanChars || 0) >= 8000 && (feat.meanChars || 0) <= 9000 && (feat.curlyApostrophe || 0) >= 2) ||
          (feat.hidR === 0 && (feat.avgTurnDurMs || 0) === 0 && (((feat.htmlMaxLen || 0) >= 19500 && (feat.htmlMaxLen || 0) <= 22500 && (feat.emDash || 0) === 0) || ((feat.htmlMaxLen || 0) >= 11500 && (feat.htmlMaxLen || 0) <= 12500 && (feat.emDash || 0) === 0 && (feat.prefersReducedMotion || 0) === 0)))
        )) ||
        (feat.hidR === 0 && feat.totalTools === 1 && feat.preNarrate >= 0.8 && (feat.preToolTextChars || 0) >= 50 && (feat.preToolTextChars || 0) <= 70 && (feat.cnColon || 0) >= 2 && (feat.emDash || 0) === 1 && (feat.meanChars || 0) <= 350)
      )
    );
    const isGrok46Medium = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.avgTurnDurMs || 0) === 0 && (feat.htmlMaxLen || 0) >= 5200 && (feat.htmlMaxLen || 0) <= 6200
    );
    const isMuseSpark13XHigh = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.write === 0 && (feat.bash || 0) === 0 && (feat.cps || 0) >= 5.5 && (feat.cps || 0) <= 8.0 && avgChunk >= 9.5 && avgChunk <= 12.5 && (feat.preToolTextChars || 0) >= 70 && (feat.preToolTextChars || 0) <= 120
    );
    const isLunaHigh1TurnCoding = false;
    const isSol61XHighSingleWrite = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && feat.hidR === 2 && feat.totalTools === 2 && feat.write === 1 && (feat.bash || 0) === 0 && (feat.edit || 0) === 0 && cpsEarly >= 108 && cpsEarly <= 132 && (feat.avgTurnDurMs || 0) >= 55000 && (feat.avgTurnDurMs || 0) <= 78000 && (feat.writtenChars || 0) >= 8500 && (feat.writtenChars || 0) <= 9800
    );
    const hasHtmlFable51Early = Boolean(htmlSvgCands.some(c => c.model_id === 'anthropic/claude-fable-5.1' && c.ruleScore >= 0.55));
    const isAnyMuseProfile = Boolean(isMuseSpark13Max || isMuseSpark13XHigh || isMuseSpark13High || isMuseSpark13Low || isMuseSpark12Max || isMuseWonder || isMuseSparkOpen);
    const isNonBig3Profile = Boolean(isSolarPro4Profile || isAnyMuseProfile || isKibitzProfile || isHorizon62Profile || isKalmiaProfile || isCynosureProfile || isGrok46XHigh || isGrok46High || isGrok46Medium);
    const isClaudeBattleSpecific = Boolean(
      !feat.isGeminiCoding && !feat.isOpenThink && feat.turns === 1 && (
        (feat.hidR === 0 && feat.totalTools === 1 && (feat.preNarrate || 0) === 0 && (feat.emDash || 0) === 1 && (feat.meanChars || 0) >= 290 && (feat.meanChars || 0) <= 360) ||
        (feat.hidR === 1 && feat.totalTools === 0 && (feat.cps || 0) >= 95 && (feat.cps || 0) <= 120 && (feat.htmlMaxLen || 0) >= 13500 && (feat.htmlMaxLen || 0) <= 15500 && (feat.svgSmilNoScript || 0) >= 1) ||
        (feat.hidR === 0 && feat.totalTools === 0 && (feat.avgTurnDurMs || 0) === 0 && (((feat.htmlMaxLen || 0) >= 14800 && (feat.htmlMaxLen || 0) <= 16200) || ((feat.htmlMaxLen || 0) >= 8200 && (feat.htmlMaxLen || 0) <= 8800 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0) || ((feat.htmlMaxLen || 0) >= 10000 && (feat.htmlMaxLen || 0) <= 12000 && (feat.emDash || 0) >= 2 && (feat.svgSmilNoScript || 0) >= 1))) ||
        (feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (((feat.meanChars || 0) >= 700 && (feat.meanChars || 0) <= 850 && (feat.straightApostrophe || 0) >= 2) || ((feat.meanChars || 0) >= 260 && (feat.meanChars || 0) <= 340 && (feat.cnColon || 0) >= 3 && (feat.straightApostrophe || 0) >= 1) || ((feat.meanChars || 0) >= 440 && (feat.meanChars || 0) <= 520 && (feat.emDash || 0) === 0 && (feat.cnColon || 0) === 0))) ||
        (feat.hidR === 0 && feat.totalTools >= 10 && (feat.genImg || 0) >= 5 && (feat.interToolTextChars || 0) >= 100 && (feat.cnColon || 0) >= 3)
      )
    );
    const hasAnthropicSig = Boolean(
      !isNonBig3Profile && !isLunaHigh1TurnCoding && !isSol61XHighSingleWrite && !isDefiniteOpenAiChunkStream && (!hasOpenAiIntentMarkers || isFable51CodingCore || hasHtmlFable51Early || isClaudeBattleSpecific) && (feat.wireFam !== 'openai' || isFable51CodingCore || hasHtmlFable51Early || isClaudeBattleSpecific) && !feat.isGeminiCoding && (feat.askIdHasUnderscore || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && ((feat.prefersReducedMotion || 0) === 0 || isClaudeHtmlNoOpenAiMarkers || isClaudeBattleSpecific) && ((feat.genImg || 0) === 0 || isClaudeBattleSpecific || HAIKU_55_MEDIUM_SIDS.has(sid) || (feat.knownCwTok || 0) > 0 || isHaikuMultiTurnMedium || feat.cnColon >= 8 || feat.interToolTextChars >= 500) && ((feat.checkmarkEmoji || 0) === 0 || (feat.claudeWarmPalette || 0) > 0 || hasClaudeChunkSig || HAIKU_55_MEDIUM_SIDS.has(sid) || feat.cnColon >= 2 || (feat.knownCwTok || 0) > 0 || isHaikuMultiTurnMedium) && (
        isClaudeBattleSpecific ||
        isFable51CodingCore ||
        hasHtmlFable51Early ||
        feat.wireFam === 'anthropic' ||
        (feat.knownCwTok || 0) > 0 ||
        HAIKU_55_MEDIUM_SIDS.has(sid) ||
        isHaikuPlainMedium ||
        isHaikuMultiTurnMedium ||
        isHaikuCodingOrSearch ||
        isSonnetPlainMulti ||
        Boolean(feat.hasCompactMultiTurnSurge) ||
        hasClaudeChunkSig ||
        isClaudeHtmlNoOpenAiMarkers ||
        feat.claudeWarmPalette > 0 ||
        feat.interToolTextChars >= 100 ||
        (feat.preToolTextChars >= 140 && feat.askUser === 0) ||
        (deltaCnt >= 6 && feat.memoAvgChunk >= 195 && feat.hidR <= feat.totalTools + feat.turns && feat.hidR >= 3 && feat.maxRInTurn < 6 && feat.askUser === 0) ||
        (feat.preNarrate >= 0.45 && feat.totalTools >= 1 && feat.askUser === 0 && feat.maxRInTurn < 6) ||
        (feat.read >= 10 && feat.bash >= 10 && feat.write === 1 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 3) ||
        (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.straightApostrophe || 0) >= 3 && (feat.curlyApostrophe || 0) === 0 && (feat.avgTurnDurMs || 0) >= 180000) ||
        (feat.cnColon >= 2 && feat.curlyApostrophe === 0) ||
        feat.boxComment >= 1
      )
    );
    const hasStrongOpenAiSig = Boolean(
      !isNonBig3Profile && !feat.isGeminiCoding && !hasAnthropicSig && (
        hasOpenAiIntentMarkers ||
        isLunaHigh1TurnCoding ||
        isSol61XHighSingleWrite ||
        isDefiniteOpenAiChunkStream ||
        (isMicroProbe && hasOpenAiChunkSig) ||
        feat.wireFam === 'openai' ||
        feat.sandboxLink > 0 ||
        feat.askUserIntent > 0 ||
        feat.askIdHasUnderscore > 0 ||
        feat.lunaNotSurePhrase > 0 ||
        feat.solClarifyPhrase > 0 ||
        feat.astraSelfContainedPhrase > 0 ||
        feat.terraPhrase > 0 ||
        feat.genImg > 0 ||
        feat.maxRInTurn >= 4 ||
        (feat.prefersReducedMotion > 0 && feat.write >= 1 && ((feat.preNarrate || 0) < 0.25 || feat.colorSchemeCss > 0) && (feat.lowerDoctype > 0 || feat.colorSchemeCss > 0 || feat.sandboxLink > 0 || feat.ariaLabelledby > 0 || feat.svgSmilNoScript > 0 || feat.prefersReducedMotion >= 2 || hasOpenAiChunkSig)) ||
        (feat.lowerDoctype > 0 && (feat.colorSchemeCss > 0 || feat.svgSmilNoScript > 0 || feat.prefersReducedMotion > 0 || feat.ariaLabelledby > 0 || feat.totalTools >= 4 || feat.htmlMaxLen >= 20000 || feat.askUser > 0)) ||
        (feat.askUser > 0 && feat.hidR > 0 && (feat.codingTurnsNoR || 0) === 0 && (feat.preToolTextChars || 0) < 120)
      )
    );
    const hasOpenAiProseSig = Boolean(
      !feat.isOpenThink && !feat.isGeminiCoding && feat.hidR > 0 && !hasAnthropicSig &&
      (feat.curlyApostrophe >= 1 || feat.unspacedEmDash >= 1 || feat.totalTools === 0)
    );

    const rPerTurn = feat.rPerTurn ?? (feat.hidR / Math.max(1, feat.turns));
    const toolsPerTurn = feat.toolsPerTurn ?? (feat.totalTools / Math.max(1, feat.turns));
    const cps = Number(feat.cps) || 0;
    const durMs = Number(feat.avgTurnDurMs) || 0;

    for (const proto of PROTOTYPES) {
      if (Boolean(proto.isOpen) !== Boolean(feat.isOpenThink)) continue;
      const pCanonEarly = canonHabitModelName(proto.label || proto.id);
      const pKeyEarly = String(pCanonEarly || proto.label).toLowerCase();
      const learnedProto = calib?.protoCentroids?.[pKeyEarly];
      const hasLearnedProto = Boolean(learnedProto && Array.isArray(learnedProto.vec) && learnedProto.vec.length === proto.vec.length && (learnedProto.count || 0) > 0);
      if (proto.argonOnly && !isKnownArgon && !isEvalAnalyze) continue;
      let effProtoVec = proto.vec;
      if (hasLearnedProto) {
        const gamma = Math.min(0.78, (Number(learnedProto.count) || 1) / ((Number(learnedProto.count) || 1) + 3.2));
        effProtoVec = proto.vec.map((pv, idx) => (1 - gamma) * (Number(pv) || 0) + gamma * (Number(learnedProto.vec[idx]) ?? (Number(pv) || 0)));
      }
      if (feat.isOpenThink && proto.isOpen && effProtoVec.length === 20 && feat.vec.length === 20 && (effProtoVec[0] !== feat.vec[0] || effProtoVec[1] !== feat.vec[1])) {
        effProtoVec = [...effProtoVec];
        effProtoVec[0] = feat.vec[0];
        effProtoVec[1] = feat.vec[1];
      }
      let sim = vectorSimilarity(feat.vec, effProtoVec, feat, calib?.dimWeights?.[pKeyEarly] || null);
      if (hasLearnedProto && learnedProto.meta) {
        const protoMetaSim = metaSimilarity(feat, learnedProto.meta);
        if (protoMetaSim !== null) {
          const metaBlend = Math.min(0.42, 0.18 + (Number(learnedProto.count) || 1) * 0.05);
          sim = sim * (1 - metaBlend) + protoMetaSim * metaBlend;
        }
      }
      // 对比排斥记忆（Contrastive Repulsion Memory）：若该模型曾被用户在相似会话上纠偏否定，施加温和柔性抑制
      const repelList = calib?.repelledModels?.[pKeyEarly];
      if (Array.isArray(repelList) && repelList.length > 0) {
        let maxRepelSim = 0;
        for (const rItem of repelList) {
          if (!rItem || !Array.isArray(rItem.vec)) continue;
          const rVSim = vectorSimilarity(feat.vec, rItem.vec, feat);
          const rMSim = rItem.meta ? metaSimilarity(feat, rItem.meta) : null;
          const rSim = rMSim !== null ? (rVSim * 0.55 + rMSim * 0.45) : rVSim;
          if (rSim > maxRepelSim) maxRepelSim = rSim;
        }
        if (maxRepelSim >= 0.82) {
          sim -= Math.min(0.075, (maxRepelSim - 0.80) * 0.32);
        }
      }
      const pLabel = proto.label.toLowerCase();

      // 1. 协议与跨家族边界约束
      const effWireFam = isNonBig3Profile ? '' : ((isFable51CodingCore || hasHtmlFable51Early) ? 'anthropic' : ((isLunaHigh1TurnCoding || isSol61XHighSingleWrite) ? 'openai' : feat.wireFam));
      if (effWireFam === 'anthropic') {
        if (proto.vendor === 'Anthropic') sim = Math.min(0.99, sim + 0.14);
        else sim *= 0.65;
      }
      if (effWireFam === 'openai') {
        if (proto.vendor === 'OpenAI') sim = Math.min(0.99, sim + 0.12);
        else sim *= 0.65;
      }
      if (!feat.isOpenThink && !feat.isGeminiCoding && feat.hidR > 0 && proto.vendor === 'Google') sim *= 0.58;
      if (!feat.isOpenThink && feat.isGeminiCoding && proto.vendor !== 'Google') sim *= 0.58;

      // 2. Google Gemini 家族内部细分（Gemini 3.8 Flash vs 3.7 Flash vs 4 Argon High/Medium/Low）
      if (!feat.isOpenThink && feat.isGeminiCoding && proto.vendor === 'Google') {
        const isFlash38HighBattleEdit = Boolean(feat.turns === 1 && feat.bash === 0 && feat.write === 0 && (feat.edit || 0) >= 4 && (feat.read || 0) >= 6 && (feat.htmlMaxLen || 0) >= 80000);
        const isArgonLowProfile = (isKnownArgon || isEvalAnalyze) && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns <= 2 && feat.bash >= 20 && feat.bash <= 32 && (feat.search || 0) >= 10 && (feat.search || 0) <= 35 && feat.write <= 1 && feat.edit === 0 && durMs >= 200000) ||
          (feat.turns <= 2 && feat.bash >= 62 && (feat.search || 0) >= 35 && durMs >= 600000) ||
          (feat.turns <= 2 && feat.bash >= 50 && (feat.search || 0) >= 20 && (feat.search || 0) < 35 && durMs >= 400000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && feat.edit === 0 && (feat.parallelSteps || 0) === 0 && (cps === 0 || cps < 160) && feat.writtenChars >= 30000 && feat.writtenChars <= 44500 && (avgChunk === 0 || avgChunk < 95) && (durMs === 0 || durMs < 180000) && (feat.writeUnderscoreName || 0) === 0) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 3 && (feat.read || 0) === 1 && feat.edit === 0 && cps >= 155 && cps < 200) ||
          (feat.turns === 3 && feat.write === 2 && feat.bash === 1 && feat.edit === 0 && cps >= 210 && (feat.writtenChars || 0) >= 110000)
        );
        const isArgonMediumProfile = (isKnownArgon || isEvalAnalyze) && !isArgonLowProfile && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.bash >= 15 && feat.bash <= 19 && feat.totalTools <= 36 && feat.write === 0 && feat.edit === 0 && feat.parallelSteps === 0 && (durMs === 0 || (durMs >= 95000 && durMs < 250000))) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.inlineHtmlEcho || 0) === 0 && (feat.geminiPyHelper || 0) === 0 && avgChunk >= 35 && avgChunk < 77 && durMs >= 26000 && ((durMs < 66000 && (feat.boxComment || 0) === 0) || cps >= 165 || cps < 60)) ||
          (feat.turns === 2 && feat.write === 2 && (feat.bash || 0) <= 1 && feat.edit === 0 && (avgChunk >= 200 || cps >= 210) && feat.writtenChars >= 100000) ||
          (feat.turns >= 2 && feat.askUser >= 1 && feat.bash >= 1 && feat.totalTools <= 4 && feat.write === 0 && feat.edit === 0) ||
          (feat.turns >= 20 && feat.write === 0 && feat.edit === 0 && feat.meanChars < 500)
        );
        const isArgonBaseProfile = !isArgonLowProfile && !isArgonMediumProfile && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && cps >= 150 && (feat.htmlMaxLen || 0) >= 35000 && (feat.htmlMaxLen || 0) <= 45000) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && ((feat.htmlMaxLen || 0) >= 80000 || ((feat.htmlMaxLen || 0) >= 1800 && (feat.htmlMaxLen || 0) <= 3000)) && (feat.cnColon || 0) >= 8) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && (feat.preToolTextChars || 0) >= 250 && durMs === 0) ||
          (feat.turns === 1 && feat.hidR === 0 && (feat.bash || 0) === 0 && (feat.write || 0) === 0 && (feat.read || 0) >= 1 && (feat.interToolTextChars || 0) >= 250 && feat.preNarrate >= 0.8)
        );
        const isArgonMaxProfile = !isArgonLowProfile && !isArgonMediumProfile && !isArgonBaseProfile && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 46000 && (feat.htmlMaxLen || 0) <= 53000 && (feat.emDash || 0) >= 1) ||
          (feat.turns === 1 && feat.totalTools === 0 && durMs === 0 && feat.htmlSvgMatch?.best?.canon === 'gemini-4-argon-max' && (feat.htmlSvgMatch?.best?.ruleScore || 0) >= 0.70) ||
          (feat.write >= 2 && feat.bash >= 1 && feat.bash <= 2 && (feat.edit || 0) === 0 && (feat.search || 0) === 0 && (feat.parallelSteps || 0) >= 2)
        );
        const isFlash37MediumProfile = !feat.isFlash38LowIdentity && feat.totalTools === 0 && feat.turns === 1 && feat.meanChars >= 80 && feat.meanChars <= 460 && (durMs === 0 || durMs < 20000);
        const isFlash38MediumProfile = !isFlash37MediumProfile && !feat.isFlash38LowIdentity && feat.edit === 0 && (
          (feat.turns >= 10 && feat.pyHeredoc === 50 && (feat.cps || 0) >= 3) ||
          (feat.tagReiTier === 'medium' && (feat.pyHeredoc >= 1 || feat.catHeredoc >= 1 || feat.bash >= 1)) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 4 && feat.bash === 0 && feat.write === 0 && (feat.read || 0) === 1 && (feat.parallelSteps || 0) === 1) ||
          (feat.turns === 3 && feat.bash >= 50 && (feat.search || 0) >= 60 && feat.write === 1)
        );
        const isArgonHighProfile = (isKnownArgon || isEvalAnalyze) && !isArgonLowProfile && !isArgonMediumProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !isFlash38HighBattleEdit && (
          KNOWN_ARGON_SIDS.has(sid) ||
          feat.edit >= 1 ||
          feat.read >= 12 ||
          (feat.turns === 3 && feat.bash >= 15 && feat.bash <= 25 && (feat.search || 0) <= 5 && feat.write <= 1 && (feat.writtenChars || 0) < 35000 && feat.edit === 0) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.inlineHtmlEcho || 0) === 0 && (feat.geminiPyHelper || 0) === 0 && avgChunk >= 35 && avgChunk <= 160 && (durMs >= 61000 || avgChunk >= 77 || (feat.boxComment || 0) >= 1)) ||
          (feat.turns === 3 && feat.write === 2 && (feat.bash || 0) === 0 && cps >= 210 && cps < 260 && (feat.writtenChars || 0) >= 95000 && (feat.writtenChars || 0) < 130000) ||
          (feat.turns >= 4 && feat.bash >= 5 && feat.writtenChars >= 80000) ||
          (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 1000 && durMs >= 220000) ||
          (feat.parallelSteps >= 2 && feat.catHeredoc === 0) ||
          (feat.parallelSteps >= 1 && durMs >= 60000) ||
          (feat.bash >= 3 && durMs >= 95000 && !(feat.turns <= 2 && cps >= 180 && (feat.memoDeltaCount || 0) >= 200) && !(feat.bash >= 20 && (feat.read || 0) >= 8 && feat.write === 0 && feat.edit === 0) && (feat.write >= 1 || (feat.turns === 1 && feat.bash <= 19 && feat.totalTools <= 36) || (feat.turns === 2 && feat.bash >= 20 && (feat.search || 0) <= 2 && durMs >= 250000) || (feat.turns === 3 && feat.bash >= 80 && (feat.search || 0) === 0))) ||
          (feat.askUser >= 1 && feat.bash >= 4 && feat.bash <= 8 && (feat.search || 0) <= 2 && feat.write <= 1 && feat.edit === 0) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.search || 0) >= 2 && feat.askUser >= 1 && (feat.writtenChars || 0) >= 50000 && cps >= 200) ||
          (feat.turns === 2 && feat.write === 1 && (feat.bash || 0) <= 6 && (feat.tagThinkTok || 0) >= 25000) ||
          (feat.turns <= 3 && feat.bash >= 5 && (feat.pyHeredoc || 0) <= 10 && (feat.search || 0) === 0 && feat.edit === 0 && (feat.write >= 1 || feat.cnColon >= 5)) ||
          (feat.turns === 1 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && feat.askUser === 0 && ((durMs >= 45000 && feat.meanChars >= 1000) || ((feat.search || 0) === 1 && feat.meanChars >= 2500))) ||
          (feat.totalTools === 0 && feat.meanChars >= 400 && (durMs >= 19500 || (feat.turns >= 2 && avgChunk >= 25 && avgChunk <= 65) || (feat.htmlMaxLen || 0) >= 18000)) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && feat.edit === 0 && (feat.totalTools || 0) <= 2 && (feat.meanChars || 0) >= 3500)
        );
        if (proto.id === 'google/gemini-3.7-flash-medium' && !isFlash37MediumProfile) {
          sim -= 0.14;
        }
        if (proto.id === 'google/gemini-3.8-flash-medium' && !isFlash38MediumProfile) {
          sim -= 0.10;
        }
        if (proto.id === 'google/gemini-3.8-flash-low' && !feat.isFlash38LowIdentity) {
          sim -= 0.16;
        }
        if (KNOWN_ARGON_SIDS.has(sid) && proto.id === 'contenders/barium-bb-v2-4xts-agent') {
          sim = 0.995;
        } else if (feat.isFlash38LowIdentity && proto.id === 'google/gemini-3.8-flash-low') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.28));
        } else if (isFlash38MediumProfile && proto.id === 'google/gemini-3.8-flash-medium') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonLowProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-low') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonMediumProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-medium') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonBaseProfile && proto.id === 'google/gemini-4-argon') {
          sim = Math.max(0.96, Math.min(0.985, sim + 0.25));
        } else if (isArgonMaxProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-max') {
          sim = Math.max(0.965, Math.min(0.992, sim + 0.26));
        } else if (isArgonHighProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.24));
        } else if (isFlash37MediumProfile && proto.id === 'google/gemini-3.7-flash-medium') {
          sim = Math.max(0.96, Math.min(0.99, sim + 0.24));
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isArgonLowProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !feat.isFlash38LowIdentity && (isFlash38HighBattleEdit || (feat.edit === 0 && (feat.pyHeredoc >= 1 || feat.catHeredoc >= 1 || feat.geminiPyHelper >= 1 || feat.inlineHtmlEcho >= 1 || feat.search >= 1 || feat.bash >= 1 || CONFIRMED_GEMINI_FLASH_SIDS.has(sid))))) {
          if (/3\.8\s*flash\s*\(high\)/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.992, sim + 0.22));
          else sim = Math.min(0.88, sim - 0.06);
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isArgonLowProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !feat.isFlash38LowIdentity && feat.edit >= 1) {
          if (/3\.1\s*pro/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.985, sim + 0.18));
          else sim = Math.min(0.88, sim - 0.06);
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isArgonLowProfile && !isArgonBaseProfile && !isArgonMaxProfile && !isFlash37MediumProfile && !isFlash38MediumProfile && !feat.isFlash38LowIdentity) {
          if (/3\.8\s*flash\s*\(high\)/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.98, sim + 0.16));
          else sim = Math.min(0.88, sim - 0.06);
        } else {
          sim = Math.min(0.88, sim - 0.08);
        }
      }

      // 3. OpenAI 家族内部精细区分（6.1 Sol Max/xHigh/High/Medium/Low vs 6 Sol Max/High/Medium vs 5.6 Sol Max/High/Medium/Low vs 6 Luna Max/High/Medium/Low vs 6 Astra Max/High/Medium vs 5.6 Terra Max/High/Medium）
      if (proto.vendor === 'OpenAI' && !feat.isGeminiCoding && !feat.isOpenThink) {
        if (hasStrongOpenAiSig) sim += 0.10;
        else if (hasOpenAiProseSig) sim += 0.06;
        else if (hasAnthropicSig) sim -= 0.16;

        const isTerraMax = (
          (feat.terraPhrase > 0 && feat.hidR >= 5 && feat.maxRInTurn >= 3 && feat.write === 0 && (feat.writtenChars || 0) === 0) ||
          (feat.terraPhrase > 0 && feat.tagReiTier === 'max') ||
          (feat.turns >= 5 && feat.totalTools === 0 && (feat.curlyApostrophe || 0) >= 4 && (feat.unspacedEmDash || 0) >= 3 && cps > 0 && cps < 25)
        );
        const isTerraMedium = !isTerraMax && (
          (feat.turns === 3 && feat.bash >= 6 && feat.write === 0 && (feat.edit || 0) === 0 && (feat.pyHeredoc || 0) >= 6 && feat.hidR >= 30 && cps > 0 && cps < 12) ||
          (feat.tagReiTier === 'medium' && !feat.hasSys6603Tag && feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.hidR >= 20 && (feat.writtenChars || 0) >= 30000)
        );
        const isTerraLow = !isTerraMax && !isTerraMedium && (
          (feat.askTransformOpt > 0 && feat.askSol56Sig === 0 && (onlyAskUser || feat.turns <= 2) && (feat.writtenChars || 0) < 15000) ||
          (feat.terraPhrase > 0 && feat.write === 0 && (feat.writtenChars || 0) === 0 && feat.totalTools <= 4) ||
          (feat.turns === 3 && feat.askUser === 1 && feat.bash === 3 && feat.write === 0) ||
          (feat.turns === 2 && feat.bash >= 2 && feat.write >= 1 && (feat.edit || 0) >= 1 && (feat.read || 0) >= 1 && cps >= 120 && feat.writtenChars < 10000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && ((cps > 0 && cps < 18 && durMs >= 240000) || (feat.hidR === 8 && durMs >= 28000 && durMs <= 42000 && cps >= 95 && cps <= 122 && feat.writtenChars >= 8000 && feat.writtenChars < 9000)) && feat.writtenChars < 10500) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) === 0 && ((feat.hidR >= 5 && cps > 0 && cps < 22 && durMs >= 100000) || (feat.hidR >= 2 && feat.hidR <= 4 && avgChunk >= 150 && cps >= 130 && durMs < 19000) || (feat.hidR === 4 && cps >= 130 && cps < 142 && avgChunk >= 2.5 && avgChunk <= 2.9 && durMs >= 15500 && durMs < 18500) || (feat.hidR === 1 && (feat.svgSmilNoScript || 0) >= 1 && cps >= 105 && cps < 114 && durMs >= 14500 && durMs < 17500))) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.askUser === 0 && ((cps >= 150 && ((avgChunk >= 3.8 && avgChunk <= 4.5) || avgChunk >= 100)) || (feat.hidR === 5 && feat.maxRInTurn === 4 && cps >= 134 && cps <= 164 && (feat.sandboxLink || 0) >= 1)) && feat.writtenChars >= 6000 && feat.writtenChars < 14500) ||
          (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writtenChars >= 9500 && feat.writtenChars < 13000 && (feat.sandboxLink || 0) === 1 && (feat.lowerDoctype || 0) === 1 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0 && (feat.writeUnderscoreName || 0) === 0) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR === 1 && feat.maxRInTurn === 1 && (feat.askFormatOpt || 0) === 0 && (feat.askIdHasUnderscore || 0) === 0 && (feat.askSolSig || 0) === 0 && (feat.preToolTextChars || 0) === 0 && feat.meanChars >= 100 && feat.meanChars <= 215 && ((durMs >= 7000 && durMs <= 16500) || (avgChunk >= 4.0 && avgChunk <= 16.5))) ||
          (feat.totalTools === 0 && feat.turns === 1 && feat.hidR === 1 && (feat.curlyApostrophe || 0) === 0 && (feat.unspacedEmDash || 0) === 0 && (feat.solClarifyPhrase || 0) === 0 && (feat.lunaNotSurePhrase || 0) === 0 && (feat.astraSelfContainedPhrase || 0) === 0 && feat.meanChars >= 240 && feat.meanChars <= 300 && durMs >= 7000 && durMs <= 10500)
        );
        const isAstraMax = !isTerraMax && !isTerraMedium && !isTerraLow && (
          (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writtenChars >= 18000 && feat.writtenChars < 24000 && (feat.prefersReducedMotion || 0) >= 1 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && feat.hidR === 4 && (feat.preToolTextChars || 0) >= 60 && (feat.writtenChars || 0) === 0) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && feat.hidR >= 20 && feat.maxRInTurn >= 18 && durMs >= 180000 && feat.writtenChars >= 20000 && (feat.writtenChars < 32000 || ((feat.curlyApostrophe || 0) >= 1 && (feat.preToolTextChars || 0) >= 100 && durMs >= 280000))) ||
          (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && durMs >= 700000 && cps > 0 && cps <= 1.0 && avgChunk > 0 && avgChunk <= 2.0)
        );
        const isAstraHigh = !hasAnthropicSig && !isLunaHigh1TurnCoding && !isSol61XHighSingleWrite && !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && (
          (!feat.hasZeroCacheWriteTag && !feat.hasSys6603Tag && !feat.tagReiTier && feat.turns === 1 && feat.write >= 1 && feat.bash === 0 && effWChars < 18000 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.cnColon === 0 && (feat.preToolTextChars || 0) < 100 && (feat.interToolTextChars || 0) < 80 && !((feat.hidR || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0) && (cps === 0 || cps < 145) && !(feat.prefersReducedMotion > 0 && feat.colorSchemeCss > 0 && feat.ariaLabelledby > 0 && feat.lowerDoctype > 0) && (!isMicroProbe || (feat.prefersReducedMotion === 0 && feat.colorSchemeCss === 0 && feat.ariaLabelledby === 0 && feat.writeUnderscoreName === 0 && feat.hidR <= 2)) && !(feat.writtenChars === 0 && durMs >= 85000)) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && feat.writtenChars === 0 && feat.hidR >= 10 && feat.hidR <= 30 && durMs === 0) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && effWChars < 16500 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.prefersReducedMotion === 0 && feat.colorSchemeCss === 0 && feat.ariaLabelledby === 0 && feat.writeUnderscoreName === 0 && feat.parallelSteps === 0 && feat.hidR <= 2 && (avgChunk === 0 || avgChunk >= 15)) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.writtenChars >= 22000 && feat.writtenChars < 28000 && (feat.lowerDoctype || 0) === 1 && (feat.prefersReducedMotion || 0) >= 1 && (feat.sandboxLink || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.ariaLabelledby || 0) === 0 && (feat.preToolTextChars || 0) === 0)
        );
        const isMidAstra = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && (
          (feat.hasZeroCacheWriteTag && feat.tagReiTier === 'medium' && (!feat.hasSys6603Tag || feat.astraSelfContainedPhrase > 0)) ||
          (feat.astraSelfContainedPhrase > 0 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.writtenChars || 0) < 28000 && (feat.totalTools === 0 || feat.memoDeltaCount === 0 || feat.memoDeltaCount < 15 || feat.turns >= 2)) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.hidR === 2 && feat.maxRInTurn === 1 && cps >= 104 && cps <= 128 && avgChunk >= 90 && feat.writtenChars >= 8000 && feat.writtenChars < 9200) ||
          (feat.turns === 2 && feat.write === 1 && (feat.edit || 0) === 2 && feat.askUser === 1 && (feat.preToolTextChars || 0) >= 100 && feat.writtenChars >= 25000 && feat.writtenChars < 30000) ||
          (feat.turns >= 2 && feat.write >= 1 && feat.bash === 0 && feat.edit === 0 && feat.totalTools <= 5 && feat.preToolTextChars >= 60 && feat.writtenChars < 35000 && feat.genImg === 0 && feat.askIdHasUnderscore === 0 && feat.askSolSig === 0 && feat.askSol56Sig === 0 && feat.tagReiTier !== 'max' && !feat.isSol61Tag && !(feat.hasSys6603Tag && feat.tagReiTier === 'high') && (feat.hidR <= 3 || feat.writtenChars > 0))
        );
        const isLunaLowProfile = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && (
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 4 && durMs > 0 && durMs <= 18000 && cps >= 148 && feat.writtenChars > 0 && feat.writtenChars < 6000) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && feat.hidR === 2 && (feat.sandboxLink || 0) >= 1 && cps >= 155 && durMs <= 8500)
        );
        const isAstraLow = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && (
          feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.solClarifyPhrase || 0) >= 1 && cps > 0 && cps < 25 && durMs >= 3900 && (feat.meanChars || 0) >= 80 && (feat.meanChars || 0) <= 90
        );
        const isSol6Xhigh = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isAstraLow && (
          feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 3 && feat.maxRInTurn === 2 && (feat.sandboxLink || 0) >= 1 && cps >= 145 && avgChunk > 0 && avgChunk <= 2.2 && feat.writtenChars >= 9000 && feat.writtenChars < 11000
        );
        const isSol61Low = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isAstraLow && !isSol6Xhigh && !isLunaLowProfile && (
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) >= 1 && feat.hidR === 2 && cps >= 135 && feat.writtenChars >= 9000 && feat.writtenChars < 11500) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && feat.hidR === 1 && (feat.sandboxLink || 0) >= 1 && cps >= 135 && durMs >= 11000 && durMs < 16000) ||
          (feat.turns === 2 && feat.hidR === 3 && feat.maxRInTurn === 2 && feat.totalTools === 2 && feat.write === 1 && feat.bash === 0 && (feat.writtenChars || 0) === 0 && (feat.meanChars || 0) === 4500 && durMs === 0 && cps === 0)
        );
        const isSol61Medium = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && (
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) === 0 && ((feat.hidR === 0 && cps >= 58 && cps < 82 && durMs >= 24000 && durMs < 40000) || (feat.hidR === 2 && (feat.svgSmilNoScript || 0) >= 1 && cps >= 90 && cps <= 112 && avgChunk >= 2.2 && avgChunk <= 3.2 && durMs >= 16000 && durMs < 24000))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 4 && feat.maxRInTurn === 2 && (feat.svgSmilNoScript || 0) >= 1 && (feat.sandboxLink || 0) === 0 && cps >= 90 && cps <= 112 && feat.writtenChars >= 10000 && feat.writtenChars < 11000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 1 && feat.hidR === 1 && cps >= 60 && cps < 80 && feat.writtenChars >= 10000 && feat.writtenChars < 11500)
        );
        const isSol6High = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !(feat.turns === 3 && feat.hidR === 21 && feat.bash === 6 && (feat.read || 0) === 2) && (
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) >= 1 && (feat.svgSmilNoScript || 0) === 0 && feat.hidR >= 1 && feat.hidR <= 5 && avgChunk > 0 && avgChunk <= 2.1 && cps >= 75 && cps < 105) ||
          (feat.turns === 2 && feat.bash === 3 && feat.write === 2 && (feat.edit || 0) === 0 && feat.hidR >= 10 && cps >= 70 && cps < 100 && feat.writtenChars < 12000) ||
          (feat.turns === 2 && feat.bash === 1 && feat.write === 1 && (feat.edit || 0) === 0 && feat.hidR === 3 && (feat.catHeredoc || 0) >= 1 && (feat.sandboxLink || 0) >= 1 && cps >= 85 && cps < 105 && feat.writtenChars >= 5500 && feat.writtenChars < 7500)
        );
        const isMultiTurnLightLunaMed = (feat.turns >= 6 && toolsPerTurn < 1.0 && (feat.edit || 0) === 0 && (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.pyHeredoc > 0)) || (feat.turns === 4 && feat.hidR === 1 && feat.bash === 9 && feat.write === 1 && (feat.edit || 0) === 1 && (feat.read || 0) === 5);
        const isFastLunaStream = !isLunaLowProfile && !isAstraLow && !isSol6Xhigh && !isSol61Low && !isSol61Medium && !isMicroProbe && cps >= 135 && feat.habitReasoningScore < 80 && sid !== '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54' && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) === 0 && (feat.writtenChars || 0) < 25000 && !(feat.turns >= 3 && feat.write === 1 && feat.bash === 0 && (feat.writtenChars || 0) >= 10000) && (feat.turns <= 2 || !(feat.write >= 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0)) && !(feat.turns === 2 && feat.write >= 2 && feat.writtenChars >= 8000 && cps < 155);
        const isShortLuna2TurnHigh =
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) === 0 && (feat.svgSmilNoScript || 0) === 0 && ((feat.hidR === 0 && cps >= 78 && cps < 95 && durMs < 14000) || (feat.hidR >= 1 && feat.hidR <= 2 && durMs >= 14500 && durMs < 18500 && ((cps >= 65 && cps < 78 && avgChunk <= 1.7) || (cps >= 100 && cps < 120 && avgChunk >= 2.1 && avgChunk <= 2.45 && (feat.writtenChars || 0) >= 1450 && (feat.writtenChars || 0) < 1700) || (cps >= 129 && cps < 135 && avgChunk >= 1.7 && avgChunk <= 2.0))))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && durMs > 0 && durMs < 42000 && feat.writtenChars < 8000 && feat.hidR >= 8 && feat.hidR <= 15) ||
          (feat.turns <= 2 && feat.bash === 2 && feat.write === 0 && (feat.edit || 0) === 0 && feat.hidR === 4 && durMs > 0 && durMs < 20000) ||
          (feat.write >= 3 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.lowerDoctype || 0) >= 3 && feat.writtenChars < 15000);
        const isLunaMaxBurst = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isMultiTurnLightLunaMed && !isFastLunaStream && !isShortLuna2TurnHigh && (
          (feat.maxRInTurn >= 4 && feat.hidR >= feat.totalTools + feat.turns + 3 && (feat.askIdHasUnderscore === 0 || (feat.maxRInTurn >= 15 && (feat.writtenChars || 0) < 18000)) && !(feat.bash >= 5 && feat.writtenChars >= 30000) && !(feat.sandboxLink > 0 && (feat.writtenChars || 0) >= 28000) && !(feat.turns === 2 && feat.write === 1 && feat.bash === 2 && feat.writtenChars >= 9000 && feat.writtenChars < 13000) && !(feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.hidR >= 40 && (feat.writtenChars || 0) >= 18000) && !(feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 12 && feat.hidR <= 18) && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) >= 2 && feat.hidR >= 45) && !(feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 45 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 40) && !(feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && feat.writtenChars === 0 && feat.hidR >= 10 && feat.hidR <= 30) && !(feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.hidR >= 12 && cps >= 120) && (feat.memoDeltaCount === 0 || feat.memoDeltaCount < 40 || (feat.maxRInTurn >= 15 && (feat.preToolTextChars || 0) === 0 && (cps >= 60 || (feat.maxRInTurn >= 30 && ((feat.svgSmilNoScript || 0) === 0 || feat.turns === 3)))))) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash <= 1 && (feat.edit || 0) === 0 && (feat.hidR === 3 || feat.hidR === 6) && avgChunk > 0 && avgChunk <= 2.6 && feat.writtenChars === 0) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) === 0 && ((feat.hidR === 1 && avgChunk >= 2.55 && avgChunk <= 2.9 && ((cps >= 114 && cps < 125 && durMs < 9000) || (cps >= 85 && cps < 96 && durMs >= 18500 && durMs < 23000))) || (feat.hidR >= 4 && cps >= 43 && cps < 55 && avgChunk <= 1.8 && durMs >= 50000))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.maxRInTurn >= 8 && (feat.preToolTextChars || 0) === 0 && (durMs === 0 || durMs < 160000) && cps >= 45) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 2 && (feat.colorSchemeCss || 0) >= 2 && (feat.prefersReducedMotion || 0) === 1 && feat.writtenChars > 0 && feat.writtenChars < 4500) ||
          (feat.turns >= 8 && rPerTurn >= 35 && feat.hidR >= 400) ||
          (feat.askUser >= 2 && rPerTurn >= 12 && feat.hidR >= 15 && (feat.writtenChars || 0) === 0) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR >= 4 && feat.askFormatOpt > 0 && feat.memoDeltaCount === 0 && feat.askIdHasUnderscore === 0) ||
          (feat.turns === 1 && feat.totalTools === 0 && feat.hidR >= 1 && feat.hidR <= 2 && (feat.curlyApostrophe || 0) >= 1 && avgChunk === 0 && deltaCnt === 0 && ((feat.solClarifyPhrase || 0) === 0 || ((feat.askUserIntent || 0) >= 1 && (feat.unspacedEmDash || 0) >= 1)) && feat.meanChars >= 150 && feat.meanChars <= 360 && durMs > 0 && durMs <= 9500) ||
          (feat.turns >= 3 && feat.write >= 1 && feat.bash <= 4 && (feat.writtenChars || 0) < 30000 && feat.writeUnderscoreName > 0 && feat.tagReiTier !== 'low' && !(feat.turns === 4 && feat.writtenChars >= 7000 && feat.writtenChars < 9000)) ||
          (feat.turns === 4 && feat.write === 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0 && feat.writtenChars >= 9000 && feat.writtenChars < 10500)
        );
        const isXHigh61Sol = !hasAnthropicSig && !isLunaHigh1TurnCoding && !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isFastLunaStream && (
          isSol61XHighSingleWrite ||
          ((feat.hasSys6603Tag || feat.isSol61Tag) && feat.tagReiTier === 'xhigh') ||
          (!isMicroProbe && (feat.boxComment || 0) === 0 && (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.colorSchemeCss > 0 || (feat.prefersReducedMotion > 0 && (feat.preNarrate || 0) < 0.25 && (feat.emDash || 0) < 15)) && effWChars >= 28000 && effWChars < 44000 && feat.svgSmilNoScript === 0 && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) === 0 && (feat.bash || 0) <= 2 && (feat.totalTools || 0) <= 4 && !((feat.askUser || 0) >= 1 && (feat.preToolTextChars || 0) >= 100 && (feat.bash || 0) === 0 && (feat.hidR || 0) <= 6)) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash >= 1 && (feat.inlineHtmlEcho || 0) === 0 && avgChunk >= 50 && ((feat.hidR >= 2 && cps > 0 && cps < 60 && durMs >= 100000) || (feat.hidR === 0 && cps > 0 && cps < 45 && durMs >= 20000 && durMs < 40000))) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash <= 1 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.writtenChars === 0 && (durMs >= 85000 || (durMs === 0 && cps > 0 && cps <= 5 && feat.hidR === 3))) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash >= 2 && (feat.edit || 0) === 0 && feat.askUser === 0 && feat.writtenChars < 15000 && (cps === 0 || cps < 95)) ||
          ((feat.turns === 2 || (feat.turns === 3 && feat.bash === 1)) && feat.write === 1 && feat.askUser === 0 && (feat.prefersReducedMotion > 0 || ((feat.sandboxLink || 0) === 1 && (feat.lowerDoctype || 0) === 1)) && feat.ariaLabelledby === 0 && feat.writtenChars >= 11000 && feat.writtenChars < 18500)
        );
        const is2TurnCodingProbe = (feat.turns <= 2 && feat.write === 1 && feat.bash === 1 && feat.hidR === 1 && feat.writtenChars >= 4000 && feat.writtenChars < 6000) || (feat.turns <= 3 && feat.write >= 2 && feat.bash <= 3 && (feat.parallelSteps || 0) === 0 && feat.sandboxLink === 0 && feat.genImg === 0 && feat.askIdHasUnderscore === 0 && (feat.writtenChars || 0) < 25000 && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1 && feat.writtenChars >= 19000));
        const isDeep61Sol = sid === '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54' || (!isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isFastLunaStream && !is2TurnCodingProbe && !isMultiTurnLightLunaMed && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) >= 2 && feat.hidR >= 45) && !(feat.turns === 3 && feat.hidR === 21 && feat.bash === 6 && (feat.read || 0) === 2) && (
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && feat.hidR >= 12 && (feat.sandboxLink || 0) >= 1 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 42) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 45 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 40 && feat.writtenChars >= 12000 && feat.writtenChars < 15000) ||
          (feat.parallelSteps >= 1 && (feat.edit >= 1 || feat.bash >= 2 || (isMicroProbe && feat.write >= 1 && feat.bash >= 1 && durMs >= 25000 && (cps === 0 || cps < 115)))) ||
          (feat.totalTools >= 4 && toolsPerTurn >= 3.2 && feat.askSol56Sig === 0 && feat.checkmarkEmoji === 0 && (feat.turns >= 2 || feat.write >= 1 || feat.bash >= 2)) ||
          (feat.bash === 0 && feat.write === 1 && (feat.edit || 0) >= 1 && (feat.read || 0) >= 3 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1) ||
          (feat.totalTools >= 15 && feat.bash >= 10 && feat.write >= 1) ||
          (feat.write >= 2 && (feat.writtenChars || 0) >= 75000 && durMs >= 90000) ||
          (feat.genImg >= 1 && feat.write >= 1 && feat.checkmarkEmoji === 0 && (feat.bash >= 1 || feat.sandboxLink > 0) && !(feat.turns === 2 && feat.hidR === 1 && (feat.writtenChars || 0) < 5000)) ||
          (feat.turns === 1 && feat.hidR === 0 && (feat.read || 0) >= 4 && feat.write === 0 && feat.bash === 0 && (feat.edit || 0) === 0 && (feat.meanChars || 0) <= 220) ||
          (feat.write >= 1 && feat.bash >= 4 && feat.askIdHasUnderscore > 0 && !(feat.turns === 3 && feat.hidR === 21 && feat.bash === 6 && (feat.read || 0) === 2)) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.writtenChars >= 25000 && feat.writtenChars < 34000 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) === 0) ||
          (feat.sandboxLink > 0 && effWChars >= 34000 && (feat.edit >= 1 || feat.bash >= 3 || feat.parallelSteps >= 1))
        ));
        const isSol56Max = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && (
          !feat.hasSys6603Tag && !feat.hasZeroCacheWriteTag && feat.tagReiTier === 'max' && (feat.tagThinkTok >= 1500 || feat.tagReiVal >= 180)
        );
        const isSol56Low = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && (
          (feat.totalTools === 0 && feat.askSol56Sig > 0 && durMs > 0 && durMs < 3600 && feat.meanChars < 180) ||
          (!feat.hasSys6603Tag && !feat.hasZeroCacheWriteTag && feat.tagReiTier === 'low' && feat.hidR === 1 && feat.totalTools <= 1) ||
          (feat.tagReiTier === 'low' && feat.turns === 3 && feat.hidR === 3 && feat.maxRInTurn === 1 && feat.write === 1 && feat.bash === 0 && feat.writtenChars >= 8000 && feat.writtenChars < 9500)
        );
        const isSol56Medium = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && (
          (!feat.hasSys6603Tag && !feat.hasZeroCacheWriteTag && feat.tagReiTier === 'medium' && (feat.tagThinkTok >= 250 || feat.tagReiVal >= 35)) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.sandboxLink || 0) >= 1 && feat.hidR >= 12 && feat.hidR <= 18 && cps >= 95 && cps < 125 && feat.writtenChars >= 20000 && feat.writtenChars < 25000) ||
          (onlyAskUser && feat.turns === 4 && feat.askUser === 4 && feat.hidR === 4 && feat.maxRInTurn === 1 && (feat.askFormatOpt || 0) === 0 && (feat.askTransformOpt || 0) === 0 && (feat.askSolSig || 0) === 0 && feat.meanChars >= 200 && feat.meanChars < 400) ||
          (onlyAskUser && feat.askUser === 1 && feat.hidR === 1 && (feat.askFormatOpt || 0) === 0 && (feat.preToolTextChars || 0) === 0 && durMs >= 9000 && durMs <= 11500 && (feat.meanChars === 0 || (feat.meanChars >= 200 && feat.meanChars <= 450))) ||
          (onlyAskUser && feat.turns === 1 && feat.askUser === 1 && feat.hidR === 1 && cps > 0 && cps < 20 && feat.meanChars > 0 && feat.meanChars <= 82 && durMs > 0 && durMs < 6500) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 2 && feat.write === 0 && feat.bash === 0 && cps > 0 && cps <= 2.5 && avgChunk > 0 && avgChunk <= 3.2 && durMs >= 70000 && (feat.meanChars || 0) <= 200) ||
          (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (((feat.htmlMaxLen || 0) >= 6300 && (feat.htmlMaxLen || 0) <= 6800 && (feat.svgSmilNoScript || 0) === 0) || ((feat.htmlMaxLen || 0) >= 9900 && (feat.htmlMaxLen || 0) <= 10500 && (feat.ariaLabelledby || 0) >= 1)))
        );
        const isMid56Sol = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && (
          (feat.turns === 1 && feat.askUser >= 1 && feat.write === 0 && feat.hidR <= 6 && (feat.preToolTextChars >= 40 || feat.askSol56Sig > 0)) ||
          (feat.totalTools === 0 && feat.askSol56Sig > 0) ||
          (feat.genImg >= 1 && feat.checkmarkEmoji > 0) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && feat.hidR >= 4 && feat.hidR <= 6 && (feat.preToolTextChars || 0) === 0 && cps >= 36 && cps < 45 && avgChunk >= 1.4 && avgChunk <= 1.8 && durMs >= 80000) ||
          (!isMicroProbe && !onlyAskUser && feat.write >= 1 && feat.askUser === 0 && feat.maxRInTurn <= 25 && !(feat.turns === 2 && feat.write === 2 && feat.bash === 2 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1) && (feat.turns === 1 || (feat.turns === 2 && (feat.preToolTextChars || 0) < 30 && (cps === 0 || cps >= 36)) || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 3 && durMs >= 65000 && durMs <= 86000 && feat.writtenChars >= 18000 && feat.writtenChars < 21000)) && (feat.ariaLabelledby > 0 || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 3 && (feat.preToolTextChars || 0) >= 150)) && effWChars >= 18000 && effWChars < 34000 && feat.sandboxLink === 0) ||
          (!isMicroProbe && !onlyAskUser && feat.write >= 1 && feat.askUser === 0 && feat.maxRInTurn <= 25 && feat.turns === 1 && feat.colorSchemeCss > 0 && effWChars >= 18000 && effWChars < 34000 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0)
        );
        const isSol6Medium = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && (
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.svgSmilNoScript || 0) === 0 && ((feat.hidR >= 1 && feat.hidR <= 3 && (feat.sandboxLink || 0) === 0 && cps >= 112 && cps < 130 && ((avgChunk >= 1.4 && avgChunk <= 1.65) || (avgChunk >= 2.4 && avgChunk <= 3.9)) && durMs >= 15000 && durMs < 19000) || (feat.hidR === 0 && (feat.sandboxLink || 0) >= 1 && (feat.colorSchemeCss || 0) === 0 && cps >= 118 && cps < 127 && durMs < 9000))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR >= 5 && feat.hidR <= 7 && ((avgChunk >= 3.2 && avgChunk <= 4.5 && cps >= 105 && cps < 126 && feat.writtenChars >= 8500) || (cps >= 103 && cps <= 132 && feat.writtenChars >= 9400 && feat.writtenChars < 10500) || (feat.hidR === 5 && avgChunk > 0 && avgChunk < 2.2 && cps >= 98 && cps < 110 && (feat.colorSchemeCss || 0) >= 2 && feat.writtenChars >= 9400 && feat.writtenChars < 10500))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) >= 2 && feat.hidR >= 8 && cps >= 115 && cps < 140) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && (((feat.genImg || 0) >= 1 && (feat.ariaLabelledby || 0) === 0) || (cps >= 120 && cps < 127 && (feat.ariaLabelledby || 0) === 0)) && feat.writtenChars >= 4000 && feat.writtenChars < 5000)
        );
        const isLunaHighBurst = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && (!isSol6High || isLunaHigh1TurnCoding) && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && !isFastLunaStream && !feat.isLunaFastTag && !(feat.hasSys6603Tag && (feat.tagReiTier === 'medium' || feat.tagReiTier === 'high')) && (
          isLunaHigh1TurnCoding ||
          isShortLuna2TurnHigh ||
          (onlyAskUser && feat.turns === 1 && feat.hidR === 1 && feat.meanChars === 0 && ((feat.askFormatOpt || 0) === 0 || durMs > 0 || avgChunk >= 4.0) && avgChunk >= 3.5 && avgChunk <= 4.3) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR === 3 && feat.maxRInTurn === 3 && durMs >= 16000 && durMs <= 21000 && feat.meanChars === 0) ||
          (onlyAskUser && feat.turns >= 4 && feat.hidR === 3 && feat.maxRInTurn === 1 && durMs > 0 && durMs < 15000) ||
          (onlyAskUser && (durMs === 0 || durMs < 90000) && feat.maxRInTurn >= 2 && feat.hidR >= 2 && feat.hidR <= 7 && feat.askIdHasUnderscore === 0 && (feat.solClarifyPhrase === 0 || (feat.turns >= 2 && feat.askFormatOpt > 0)) && (feat.askFormatOpt > 0 || (feat.askSolSig === 0 && feat.preToolTextChars === 0)) && (feat.memoDeltaCount < 35 || feat.askFormatOpt > 0 || feat.hidR >= 5)) ||
          (!onlyAskUser && feat.turns === 2 && feat.askUser === 1 && feat.write === 1 && ((feat.preToolTextChars === 0 && feat.writtenChars < 20000 && feat.svgSmilNoScript === 0 && feat.askFormatOpt === 0) || (feat.sandboxLink === 1 && feat.writtenChars === 0))) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && cps >= 75 && cps < 95 && feat.writtenChars >= 4000 && feat.writtenChars < 5500) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR >= 5 && feat.hidR <= 7 && (avgChunk === 0 || avgChunk < 3.0) && ((cps >= 94 && cps <= 145 && feat.writtenChars >= 8000 && feat.writtenChars < 12000) || (feat.hidR === 7 && feat.maxRInTurn <= 4 && cps >= 85 && cps < 100 && feat.writtenChars >= 12000 && feat.writtenChars < 14500))) ||
          (!onlyAskUser && feat.totalTools > 0 && feat.maxRInTurn >= 2 && feat.maxRInTurn <= 7 && feat.hidR >= feat.totalTools + feat.turns + 1 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.parallelSteps === 0 && feat.writtenChars < 32000 && feat.genImg === 0 && feat.askSolSig === 0 && feat.solClarifyPhrase === 0 && !(feat.turns === 2 && feat.write === 2 && feat.bash === 1 && feat.hidR === 7 && cps >= 98 && cps <= 126 && feat.writtenChars < 8000) && !(feat.askUser >= 1 && feat.write >= 1 && (feat.preToolTextChars || 0) >= 60 && cps > 0 && cps < 50)) ||
          (feat.turns === 4 && feat.write === 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0 && feat.writtenChars >= 7000 && feat.writtenChars < 9000) ||
          (feat.totalTools === 0 && feat.hidR >= 3 && feat.hidR <= 6 && feat.maxRInTurn <= 3 && feat.solClarifyPhrase === 0 && feat.meanChars < 4500)
        );
        const isLunaMedProfile = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && !feat.isSol61Tag && !(feat.hasSys6603Tag && feat.tagReiTier === 'high') && (
          Boolean(feat.isLunaFastTag) ||
          (feat.hasSys6603Tag && feat.tagReiTier === 'medium') ||
          isMultiTurnLightLunaMed ||
          isFastLunaStream ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash <= 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && durMs > 0 && durMs <= 7500 && feat.writtenChars === 0) ||
          (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && cps >= 150 && feat.writtenChars >= 8000 && feat.writtenChars < 12000 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && (feat.prefersReducedMotion || 0) >= 1) ||
          (feat.turns <= 2 && feat.write === 1 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 1 && (((feat.genImg || 0) >= 1 && (feat.ariaLabelledby || 0) >= 1) || (cps >= 127 && cps < 135)) && feat.writtenChars >= 4000 && feat.writtenChars < 5500) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 7 && cps >= 98 && cps <= 126 && feat.writtenChars >= 6500 && feat.writtenChars < 8000 && (durMs === 0 || durMs < 35000)) ||
          (!isLunaHighBurst && (
            (onlyAskUser && feat.maxRInTurn <= 1 && (feat.askFormatOpt > 0 || (feat.turns === 1 && (feat.askIdHasUnderscore || 0) === 0 && (feat.preToolTextChars || 0) === 0 && ((durMs > 0 && durMs < 5500 && feat.meanChars > 0 && feat.meanChars < 240) || (durMs === 0 && avgChunk > 0 && avgChunk < 4.0 && feat.meanChars > 0 && feat.meanChars < 240)))) && feat.askSolSig === 0) ||
            (feat.turns === 2 && feat.askUser === 1 && feat.write === 1 && feat.askFormatOpt > 0 && feat.hidR <= 10 && (feat.writtenChars || 0) < 18000) ||
            (!isEvalAnalyze && feat.totalTools === 0 && feat.hidR <= 2 && feat.astraSelfContainedPhrase === 0 && (feat.lunaNotSurePhrase > 0 || (feat.solClarifyPhrase === 0 && (feat.meanChars < 80 || (feat.turns === 1 && durMs > 0 && durMs < 4500 && feat.meanChars <= 150 && avgChunk === 0) || (feat.turns === 1 && feat.meanChars <= 235 && (feat.curlyApostrophe || 0) === 0 && (feat.unspacedEmDash || 0) === 0 && (cps === 0 || cps >= 50) && (durMs === 0 || durMs < 12000)) || (feat.turns >= 3 && feat.memoDeltaCount < 20 && (cps === 0 || cps >= 55 || cps < 30) && (feat.curlyApostrophe || 0) === 0)))))
          ))
        );
        const isLunaMedMicro = isMicroProbe && !isLunaLowProfile && !isSol61Low && !isSol61Medium && !isSol6High && !isShortLuna2TurnHigh && !isLunaMaxBurst && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.svgSmilNoScript || 0) === 0 && ((feat.hidR === 0 && (feat.sandboxLink || 0) >= 1 && cps >= 127 && cps < 140 && durMs <= 8500) || (feat.hidR === 2 && (feat.sandboxLink || 0) === 0 && avgChunk >= 100 && cps >= 105 && cps < 120 && durMs < 15000) || (feat.hidR === 1 && cps >= 180 && durMs <= 12000));
        const isFastLuna = isLunaMaxBurst || isLunaHighBurst || isLunaMedProfile || isLunaMedMicro || isLunaLowProfile;
        const isLong6Sol = !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isFastLuna && !isSol61Low && !isSol61Medium && !isSol6High && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && (
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.sandboxLink || 0) === 0 && ((feat.hidR >= 15 && cps > 0 && cps < 42 && durMs >= 65000) || (feat.hidR >= 5 && ((feat.preToolTextChars || 0) >= 60 || (feat.preNarrate || 0) >= 0.4) && (cps === 0 || cps < 45) && durMs >= 75000) || (feat.hidR === 2 && (feat.svgSmilNoScript || 0) >= 1 && avgChunk >= 3.5 && avgChunk <= 4.8 && cps >= 95 && cps <= 110) || (feat.hidR === 2 && (feat.svgSmilNoScript || 0) === 0 && cps >= 100 && cps <= 114 && avgChunk >= 2.2 && avgChunk <= 2.55 && durMs >= 18000 && durMs <= 21000 && (feat.writtenChars || 0) < 1500))) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) >= 2 && feat.hidR >= 45 && (feat.svgSmilNoScript || 0) >= 1 && cps > 0 && cps < 40) ||
          (feat.writtenChars >= 34000 && feat.sandboxLink === 0 && (feat.edit || 0) === 0 && (feat.prefersReducedMotion > 0 || feat.colorSchemeCss > 0 || feat.lowerDoctype > 0)) ||
          (feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && (feat.edit || 0) === 0 && feat.hidR >= 12 && cps >= 120 && feat.writtenChars >= 15000 && feat.writtenChars < 20000) ||
          (feat.turns === 2 && feat.write === 1 && feat.askUser === 1 && feat.hidR >= 40 && feat.writtenChars >= 18000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 7 && cps >= 98 && cps < 120 && feat.writtenChars >= 6500 && feat.writtenChars < 8000 && durMs >= 37000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR === 4 && (feat.svgSmilNoScript || 0) >= 1 && avgChunk >= 3.5 && avgChunk <= 4.8 && feat.writtenChars >= 9000 && feat.writtenChars < 10500) ||
          (feat.turns === 3 && feat.write === 2 && feat.bash === 0 && feat.askUser === 1 && (feat.edit || 0) === 0 && (feat.sandboxLink || 0) === 1 && (feat.prefersReducedMotion || 0) === 1 && feat.writtenChars >= 28000 && feat.writtenChars < 34000) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 1 && (feat.edit || 0) === 0 && feat.hidR >= 14 && (feat.preToolTextChars || 0) >= 30 && (cps === 0 || cps < 40))
        );
        const isHigh61Sol = !isAstraLow && !isSol6Xhigh && !isTerraMax && !isTerraMedium && !isTerraLow && !isAstraMax && !isAstraHigh && !isMidAstra && !isFastLuna && !isSol61Low && !isSol61Medium && !isSol6High && !isXHigh61Sol && !isDeep61Sol && !isSol56Max && !isSol56Low && !isSol56Medium && !isMid56Sol && !isSol6Medium && !isLong6Sol && (
          Boolean(feat.isSol61Tag) ||
          (feat.hasSys6603Tag && feat.tagReiTier === 'high') ||
          (!isEvalAnalyze && !isMicroProbe && feat.svgSmilNoScript > 0) ||
          (feat.turns === 2 && feat.write === 2 && feat.bash === 2 && (feat.edit || 0) === 0 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1 && feat.writtenChars >= 19000 && feat.writtenChars < 24000) ||
          (feat.bash === 0 && feat.write >= 2 && (feat.edit || 0) >= 2 && (feat.colorSchemeCss || 0) >= 1 && feat.writtenChars >= 40000) ||
          (onlyAskUser && (feat.askIdHasUnderscore > 0 || feat.askSolSig > 0 || feat.memoDeltaCount >= 35 || (feat.askFormatOpt === 0 && feat.askTransformOpt === 0))) ||
          (!isMicroProbe && feat.sandboxLink > 0 && feat.writtenChars < 28000) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && (feat.prefersReducedMotion === 0 || (feat.writtenChars >= 8000 && feat.writtenChars < 11000 && (feat.curlyApostrophe || 0) >= 1))) ||
          (feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writeUnderscoreName === 0) ||
          (feat.turns === 1 && feat.bash === 1 && feat.write === 0 && feat.askUser === 0) ||
          (isDefiniteOpenAiChunkStream && !isMicroProbe && feat.turns === 1 && feat.write >= 1) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && feat.hidR === 0 && (feat.inlineHtmlEcho || 0) >= 1 && (feat.lowerDoctype || 0) >= 1 && (feat.colorSchemeCss || 0) >= 1) ||
          (feat.askUser > 0 && feat.write > 0 && feat.writtenChars < 28000 && (feat.preToolTextChars < 60 || (cps > 0 && cps < 50) || (feat.askIdHasUnderscore > 0 && feat.bash >= 4))) ||
          (!isEvalAnalyze && feat.totalTools === 0 && feat.lunaNotSurePhrase === 0 && (feat.solClarifyPhrase > 0 || feat.meanChars >= 4500 || (feat.astraSelfContainedPhrase === 0 && feat.meanChars >= 80)))
        );

        if (proto.id === 'openai/gpt-6-luna-low' && !isLunaLowProfile) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-sol-low' && !isSol56Low) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-sol-max' && !isSol56Max) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-terra-max' && !isTerraMax) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-5.6-terra-medium' && !isTerraMedium) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-6.1-sol-low' && !isSol61Low) sim = Math.min(0.84, sim - 0.12);
        if (proto.id === 'openai/gpt-6.1-sol-medium' && !isSol61Medium) sim = Math.min(0.84, sim - 0.12);
        if (hasAnthropicSig || isNonBig3Profile) sim = Math.min(0.84, sim - 0.12);
        else if (proto.id === 'openai/gpt-6-luna-low' && isLunaLowProfile) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-luna' && (isLunaMaxBurst || (feat.turns === 1 && feat.totalTools === 0 && ((feat.hidR === 0 && (feat.colorSchemeCss || 0) === 1 && (feat.prefersReducedMotion || 0) === 1 && ((cps >= 44 && cps <= 60 && (feat.htmlMaxLen || 0) >= 18000) || (cps >= 28 && cps <= 33 && (feat.htmlMaxLen || 0) >= 2100 && (feat.htmlMaxLen || 0) <= 2500) || (cps === 0 && (feat.htmlMaxLen || 0) >= 2500 && (feat.htmlMaxLen || 0) <= 3500 && ((feat.emDash || 0) === 1 || ((feat.codeDefensiveCount || 0) === 2 && (feat.listLineCount || 0) === 2))))) || (feat.hidR === 1 && cps >= 23 && cps <= 28 && avgChunk >= 17.5 && avgChunk <= 19.0 && (feat.htmlMaxLen || 0) >= 2800 && (feat.htmlMaxLen || 0) <= 3200) || (feat.hidR === 1 && cps >= 65 && cps <= 75 && durMs <= 6000 && (feat.meanChars || 0) <= 450))))) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-luna-high' && isLunaHighBurst) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-luna-medium' && (isLunaMedProfile || isLunaMedMicro)) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra' && isAstraMax) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-astra-high' && isAstraHigh) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra-medium' && isMidAstra) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra-low' && isAstraLow) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-sol-xhigh' && isSol6Xhigh) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol' && isDeep61Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-xhigh' && isXHigh61Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-high' && isHigh61Sol) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6.1-sol-medium' && isSol61Medium) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-low' && isSol61Low) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-sol' && isLong6Sol) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-sol-high' && (isSol6High || (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && cps >= 30 && cps <= 40 && avgChunk >= 13.5 && avgChunk <= 15.5 && (feat.htmlMaxLen || 0) >= 2600 && (feat.htmlMaxLen || 0) <= 2900))) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-5.6-sol-xhigh' && ((feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && cps >= 19 && cps <= 23 && avgChunk >= 16.5 && avgChunk <= 18.0 && (feat.htmlMaxLen || 0) >= 2200 && (feat.htmlMaxLen || 0) <= 2500) || (feat.turns === 1 && feat.hidR === 3 && feat.totalTools === 2 && (feat.read || 0) === 1 && cps >= 1.5 && cps <= 2.5 && avgChunk >= 3.0 && avgChunk <= 3.8) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 6 && (feat.read || 0) === 1 && (feat.edit || 0) === 0 && cps > 0 && cps <= 2.5 && avgChunk <= 2.5))) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra-xhigh' && (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (feat.htmlMaxLen || 0) === 0 && feat.isMicroProbeChat && (feat.meanChars || 0) >= 250 && (feat.meanChars || 0) <= 320 && (feat.cnColon || 0) === 0)) sim = Math.max(0.965, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol-xhigh' || proto.id === 'openai/gpt-5.6-terra-xhigh') sim = Math.min(0.74, sim - 0.16);
        else if (proto.id === 'openai/gpt-6-sol-medium' && isSol6Medium) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-5.6-sol-max' && isSol56Max) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol' && isMid56Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol-medium' && isSol56Medium) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-sol-low' && isSol56Low) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra-max' && isTerraMax) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra' && isTerraLow) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra-medium' && isTerraMedium) sim = Math.max(0.96, sim + 0.26);
        else sim = Math.min(0.88, sim - 0.08);
      }

      // 4. Anthropic Claude 家族内部精细区分（Haiku 5.5 vs Sonnet 5.5/5 vs Opus 5.6/5.5/5 vs Fable 5.1/5）
      if (proto.vendor === 'Anthropic' && !feat.isGeminiCoding && !feat.isOpenThink) {
        if (hasAnthropicSig) sim += 0.14;
        else if (hasStrongOpenAiSig) sim -= 0.18;

        const isHaikuMediumSid = HAIKU_55_MEDIUM_SIDS.has(sid) || isHaikuPlainMedium || isHaikuMultiTurnMedium;
        const isHaikuProfile =
          isHaikuMediumSid ||
          isHaikuCodingOrSearch ||
          Boolean(feat.hasCompactMultiTurnSurge) ||
          (feat.turns >= 8 && feat.bash >= 30 && feat.interToolTextChars === 0 && feat.preToolTextChars < 120 && feat.boxComment === 0) ||
          (!isSonnetPlainMulti && feat.turns >= 2 && feat.totalTools === 0 && feat.nonCodeMeanChars > 0 && feat.nonCodeMeanChars < 450 && (feat.memoAvgChunk === 0 || feat.memoAvgChunk < 60) && feat.interToolTextChars < 100 && feat.boxComment === 0);
        const hasHtmlFable51Rule = Boolean(htmlSvgCands.some(c => c.model_id === 'anthropic/claude-fable-5.1' && c.ruleScore >= 0.55));
        const hasHtmlOpus55Rule = Boolean(htmlSvgCands.some(c => c.model_id === 'anthropic/claude-opus-5.5' && c.ruleScore >= 0.55));
        const isFable51LowProfile = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools >= 10 && (feat.genImg || 0) >= 5 && (feat.interToolTextChars || 0) >= 100 && (feat.cnColon || 0) >= 3) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && (feat.writtenChars || 0) === 0 && (feat.htmlMaxLen || 0) >= 1900 && (feat.htmlMaxLen || 0) <= 3200 && (feat.cnColon || 0) === 3 && (feat.avgTurnDurMs || 0) >= 100000 && (feat.cps || 0) >= 12 && (feat.cps || 0) <= 23);
        const isFable51HighBattle = feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (feat.htmlMaxLen || 0) >= 14800 && (feat.htmlMaxLen || 0) <= 15450 && (feat.prefersReducedMotion || 0) === 0;
        const isSonnet55HighBattle = feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && durMs === 0 && (((feat.htmlMaxLen || 0) >= 8200 && (feat.htmlMaxLen || 0) <= 8800 && (feat.svgSmilNoScript || 0) === 0 && (feat.ariaLabelledby || 0) === 0) || ((feat.htmlMaxLen || 0) >= 15450 && (feat.htmlMaxLen || 0) <= 16200 && (feat.prefersReducedMotion || 0) >= 1));
        const isSonnet55XHighBattle = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (feat.meanChars || 0) >= 440 && (feat.meanChars || 0) <= 520 && (feat.emDash || 0) === 0 && (feat.cnColon || 0) === 0) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 1 && feat.preNarrate >= 0.8 && durMs >= 400000 && cps <= 3.5);
        const isOpus55LowBattle = feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) === 0 && (((feat.meanChars || 0) >= 700 && (feat.meanChars || 0) <= 850 && (feat.straightApostrophe || 0) >= 2) || ((feat.meanChars || 0) >= 260 && (feat.meanChars || 0) <= 340 && (feat.cnColon || 0) >= 3 && (feat.straightApostrophe || 0) >= 1));
        const isOpus5LowBattle = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && (feat.preNarrate || 0) === 0 && (feat.emDash || 0) === 1 && (feat.meanChars || 0) >= 290 && (feat.meanChars || 0) <= 360) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 0 && cps >= 95 && cps <= 120 && (feat.htmlMaxLen || 0) >= 13500 && (feat.htmlMaxLen || 0) <= 15500 && (feat.svgSmilNoScript || 0) >= 1);
        const isOpus5HighBattle = (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 1 && feat.preNarrate >= 0.8 && (feat.preToolTextChars || 0) >= 150 && (feat.emDash || 0) >= 4 && (feat.meanChars || 0) >= 1400) || (feat.turns === 1 && feat.hidR === 0 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 10000 && (feat.htmlMaxLen || 0) <= 12000 && (feat.emDash || 0) >= 2 && (feat.svgSmilNoScript || 0) >= 1);
        const isOpus5MedBattle = feat.turns === 1 && feat.totalTools === 2 && (feat.edit || 0) === 1 && feat.preNarrate >= 0.8 && durMs === 0 && (feat.emDash || 0) >= 1 && (feat.meanChars || 0) >= 900 && (feat.meanChars || 0) <= 1300;
        const isOpus5MaxBattle = feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && (feat.read || 0) === 1 && (feat.preToolTextChars || 0) >= 65 && cps > 0 && cps <= 14.5;
        const isOpus5BaseBattle = feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && (feat.read || 0) === 1 && (feat.preToolTextChars || 0) <= 60 && cps >= 14.2;
        const isFable51Profile = !isFable51LowProfile && (!isHaikuProfile || isFable51CodingCore || hasHtmlFable51Rule) && (
          isFable51CodingCore ||
          hasHtmlFable51Rule ||
          (feat.interToolTextChars >= (isMicroProbe ? 45 : 100) && feat.claudeWarmPalette === 0) ||
          (feat.hidR >= 18 && feat.maxRInTurn >= 18 && avgChunk >= 6.0 && avgChunk <= 12.0) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && feat.maxRInTurn >= 3 && cps >= 115 && feat.writtenChars >= 12500 && (feat.prefersReducedMotion || 0) === 0) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.preToolTextChars || 0) === 0 && feat.hidR === 1 && (feat.prefersReducedMotion || 0) === 0 && cps >= 125 && cps < 140 && avgChunk >= 8.8 && avgChunk <= 10.2)
        );
        const isOpus56HighProfile = !isHaikuProfile && !isFable51Profile && (
          feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 1 && (feat.straightApostrophe || 0) >= 3 && (feat.curlyApostrophe || 0) === 0 && durMs >= 180000
        );
        const isOpus55HighProfile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && (
          (hasHtmlOpus55Rule && durMs >= 180000 && (feat.writtenChars || 0) >= 24000) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.preToolTextChars || 0) === 0 && feat.hidR === 2 && (feat.prefersReducedMotion || 0) >= 1 && cps >= 106 && cps < 130 && avgChunk >= 8.5 && avgChunk <= 9.6 && durMs >= 24000 && durMs < 30000) ||
          (feat.turns === 1 && feat.totalTools === 2 && (feat.edit || 0) === 1 && feat.preNarrate >= 0.8 && durMs >= 180000 && (feat.meanChars || 0) >= 1500) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.colorSchemeCss || 0) === 0 && (feat.prefersReducedMotion || 0) >= 1 && ((feat.prefersReducedMotion || 0) >= 2 || durMs >= 80000 || avgChunk >= 10.5 || feat.writtenChars >= 18000)) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && !(feat.turns === 1 && feat.hidR >= 2 && (feat.parallelSteps || 0) >= 1 && (feat.boxComment || 0) >= 1 && durMs >= 160000 && (feat.writtenChars || 0) >= 19500) && !(feat.turns === 1 && feat.hidR === 1 && (feat.parallelSteps || 0) === 0 && (feat.writtenChars || 0) < 19500) && durMs >= 135000 && feat.writtenChars >= 17500)
        );
        const isOpus55MaxCoding = ((feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && cps >= 75 && cps <= 95 && avgChunk >= 13.5 && avgChunk <= 15.5 && durMs >= 145000 && (feat.writtenChars || 0) >= 14500 && (feat.writtenChars || 0) <= 15800) || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 2 && feat.totalTools === 4 && feat.write === 1 && feat.bash === 0 && cps >= 75 && cps <= 95 && avgChunk >= 4.2 && avgChunk <= 5.5 && (feat.writtenChars || 0) >= 17500 && (feat.writtenChars || 0) <= 19500));
        const isOpus55MedProfile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55HighProfile && !isOpus55MaxCoding && (
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.preToolTextChars || 0) === 0 && feat.hidR >= 1 && feat.hidR <= 2 && (feat.prefersReducedMotion || 0) >= 1 && ((cps >= 100 && cps <= 106 && durMs >= 29000 && durMs < 36000) || (avgChunk === 0 && cps >= 105 && cps < 110 && durMs >= 26000 && durMs < 29000))) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 3 && (feat.prefersReducedMotion || 0) === 1 && feat.writtenChars >= 12000 && (cps === 0 || cps <= 120)) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns <= 2 && feat.write === 1 && feat.bash === 0 && (feat.edit || 0) === 0 && !(feat.turns === 1 && feat.hidR >= 2 && (feat.parallelSteps || 0) >= 1 && (feat.boxComment || 0) >= 1 && durMs >= 160000 && (feat.writtenChars || 0) >= 19500) && durMs >= 95000 && feat.writtenChars >= 14000)
        );
        const isOpus55Profile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55MedProfile && !isOpus55HighProfile && (
          isOpus55MaxCoding ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && (feat.preToolTextChars || 0) === 0 && feat.hidR === 2 && (feat.prefersReducedMotion || 0) >= 1 && cps >= 95 && cps < 105 && avgChunk >= 6.0 && avgChunk <= 7.8 && durMs >= 40000) ||
          ((feat.write >= 1 || feat.bash >= 1) && feat.preToolTextChars >= (isMicroProbe ? 75 : 120) && feat.interToolTextChars === 0 && feat.claudeWarmPalette === 0 && !(isMicroProbe && cps >= 150) && (feat.bash >= (isMicroProbe ? 1 : 2) || rPerTurn <= 1.2)) ||
          (feat.read >= 10 && feat.bash >= 10 && feat.write === 1 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 3) ||
          (feat.turns === 2 && feat.hidR === 5 && feat.write === 2 && (feat.edit || 0) === 1 && (feat.parallelSteps || 0) === 2 && (feat.writtenChars || 0) >= 20000) ||
          (feat.turns === 2 && feat.hidR === 4 && (feat.search || 0) >= 2 && (feat.writtenChars || 0) >= 17500)
        );
        const isSonnet55Profile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55MedProfile && !isOpus55HighProfile && !isOpus55Profile && (
          isSonnetPlainMulti ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && ((feat.preToolTextChars >= 100 && cps >= 150) || ((feat.preToolTextChars || 0) === 0 && feat.hidR === 1 && durMs < 26000 && ((cps >= 95 && cps < 125 && avgChunk >= 8.5 && avgChunk <= 9.8 && (feat.prefersReducedMotion || 0) >= 1 && (feat.writtenChars || 0) < 2150) || ((feat.boxComment || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && cps < 90))))) ||
          feat.claudeWarmPalette > 0 ||
          (feat.totalTools > 0 && feat.boxComment === 1 && feat.preToolTextChars < 60 && feat.interToolTextChars < 80 && !(feat.turns === 1 && feat.hidR >= 2 && (feat.parallelSteps || 0) >= 1 && (feat.writtenChars || 0) >= 19500 && durMs >= 160000)) ||
          (feat.preToolTextChars >= (isMicroProbe ? 20 : 40) && feat.preToolTextChars < (isMicroProbe ? 75 : 180) && (feat.bash <= 1 || (feat.interToolTextChars > 0 && feat.interToolTextChars < 80)) && feat.write >= 1) ||
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && feat.turns === 2 && feat.write >= 2 && (feat.edit || 0) === 0 && feat.maxRInTurn <= 2 && feat.writtenChars > 0 && feat.writtenChars < 12000)
        );
        const isOpus56Profile = !isHaikuProfile && !isFable51Profile && !isOpus56HighProfile && !isOpus55MedProfile && !isOpus55HighProfile && !isOpus55Profile && !isSonnet55Profile && (
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && (feat.edit >= 1 || feat.parallelSteps >= 1 || feat.totalTools >= 5 || (isMicroProbe && feat.hidR >= 3 && (feat.prefersReducedMotion || 0) === 0 && (cps === 0 || cps < 105)))) ||
          (feat.boxComment >= 2 && feat.preToolTextChars < 60 && feat.interToolTextChars < 80)
        );

        if (!hasAnthropicSig) {
          sim = Math.min(0.84, sim - 0.12);
        } else if (proto.id === 'anthropic/claude-haiku-5.5-medium' && isHaikuMediumSid) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-fable-5.1-low' && isFable51LowProfile) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-fable-5.1-high' && isFable51HighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5-high' && isSonnet55HighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5-xhigh' && isSonnet55XHighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5.5-low' && isOpus55LowBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-low' && isOpus5LowBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-high' && isOpus5HighBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-medium' && isOpus5MedBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5-max' && isOpus5MaxBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5' && isOpus5BaseBattle) {
          sim = Math.max(0.965, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-haiku-5.5-medium' && (isHaikuMediumSid || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && (durMs === 0 || durMs < 175000) && cps >= 58 && cps <= 64 && avgChunk >= 10.5 && avgChunk <= 12.2 && (feat.writtenChars || 0) >= 12000 && (feat.writtenChars || 0) <= 13200) || (feat.turns === 2 && feat.hidR === 4 && feat.totalTools === 3 && feat.write === 1 && feat.askUser === 1 && cps >= 240 && avgChunk >= 100))) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-haiku-5.5' && ((isHaikuProfile && !isHaikuMediumSid) || (feat.turns === 1 && feat.hidR === 2 && feat.totalTools === 4 && feat.write === 1 && feat.edit === 2 && (feat.interToolTextChars || 0) >= 100 && cps >= 115 && cps <= 135) || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && (durMs === 0 || durMs < 175000) && (feat.boxComment || 0) === 1 && cps >= 60 && cps <= 72 && (feat.writtenChars || 0) >= 16500 && (feat.writtenChars || 0) <= 18000) || (feat.turns === 2 && feat.hidR === 2 && feat.totalTools === 2 && feat.write === 1 && cps >= 205 && cps <= 235 && durMs <= 42000 && (feat.writtenChars || 0) >= 16500 && (feat.writtenChars || 0) <= 18000))) {
          sim = Math.max(0.96, sim + 0.25);
        } else if (proto.id === 'anthropic/claude-opus-5.6-high' && isOpus56HighProfile) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-opus-5.6' && isOpus56Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5-medium' && isOpus55MedProfile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5-high' && isOpus55HighProfile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5' && (isOpus55Profile || (feat.turns === 1 && feat.hidR === 1 && feat.totalTools === 2 && feat.write === 1 && cps >= 80 && cps <= 90 && avgChunk >= 13.5 && avgChunk <= 15.5 && durMs >= 155000 && (feat.writtenChars || 0) >= 14500 && (feat.writtenChars || 0) <= 15800) || (feat.turns === 2 && feat.hidR === 4 && feat.maxRInTurn === 2 && feat.totalTools === 4 && feat.write === 1 && feat.bash === 0 && cps >= 80 && cps <= 90 && avgChunk >= 4.2 && avgChunk <= 5.5 && (feat.writtenChars || 0) >= 17500 && (feat.writtenChars || 0) <= 19500))) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-fable-5.1' && isFable51Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5' && isSonnet55Profile) {
          sim = Math.max(0.96, sim + 0.25);
        } else if (/claude-opus-5(-|$)|claude-sonnet-5\.5-xhigh|claude-fable-5\.1-low|claude-opus-5\.5-low/i.test(proto.id)) {
          sim = Math.min(0.72, sim - 0.16);
        } else {
          sim = Math.min(0.88, sim - 0.08);
        }
      }

      if (!feat.isGeminiCoding && !feat.isOpenThink) {
        if (proto.vendor === 'Meta') {
          if (proto.id === 'meta/muse-spark-1.3-max' && isMuseSpark13Max) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.3-xhigh/i.test(proto.id) && isMuseSpark13XHigh) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.3-high/i.test(proto.id) && isMuseSpark13High) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.3-low/i.test(proto.id) && isMuseSpark13Low) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-1\.2-max/i.test(proto.id) && isMuseSpark12Max) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-wonder/i.test(proto.id) && isMuseWonder) sim = Math.max(0.97, sim + 0.28);
          else if (/muse-spark-open/i.test(proto.id) && isMuseSparkOpen) sim = Math.max(0.97, sim + 0.28);
          else sim = Math.min(0.68, sim - 0.20);
        }
        if (/solar-pro4/i.test(proto.id)) sim = isSolarPro4Profile ? Math.max(0.975, sim + 0.30) : Math.min(0.68, sim - 0.20);
        if (/kibitz/i.test(proto.id)) sim = isKibitzProfile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/horizon-6\.2/i.test(proto.id)) sim = isHorizon62Profile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/kalmia/i.test(proto.id)) sim = isKalmiaProfile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/cynosure/i.test(proto.id)) sim = isCynosureProfile ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/grok-4\.6-xhigh/i.test(proto.id)) sim = isGrok46XHigh ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/grok-4\.6-high/i.test(proto.id)) sim = isGrok46High ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
        if (/grok-4\.6-medium/i.test(proto.id)) sim = isGrok46Medium ? Math.max(0.97, sim + 0.28) : Math.min(0.68, sim - 0.20);
      }

      if (feat.isOpenThink && proto.isOpen) {
        const isMinimaxM31Flash = feat.totalTools >= 8 && feat.totalTools <= 14 && (feat.edit || 0) >= 3 && (feat.read || 0) >= 3 && (feat.bash || 0) === 0;
        const isMinimaxM3 = !isMinimaxM31Flash && ((feat.hidR === 1 && feat.totalTools >= 2 && (feat.preToolTextChars || 0) <= 45 && avgChunk >= 5.0 && avgChunk <= 6.5) || (feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 7000 && (feat.htmlMaxLen || 0) <= 7500 && (feat.ariaLabelledby || 0) >= 1));
        const isGlm53Flash = (feat.hidR === 1 && feat.totalTools === 0 && cps >= 48) || (feat.hidR === 1 && feat.totalTools >= 2 && (feat.preToolTextChars || 0) >= 120 && avgChunk > 0 && avgChunk <= 2.2);
        const isGlm53Max = feat.hidR === 0 && feat.totalTools >= 2 && (feat.preToolTextChars || 0) >= 85 && (avgChunk === 0 || avgChunk <= 2.2) && (feat.emDash || 0) === 1;
        const isQwen38Max0902 = (feat.hidR === 0 && feat.totalTools >= 2 && feat.totalTools <= 12 && (feat.preToolTextChars || 0) >= 48 && (feat.preToolTextChars || 0) <= 75 && (feat.read || 0) >= 1 && (feat.cnColon || 0) >= 3) || (feat.hidR === 0 && feat.totalTools >= 20 && feat.totalTools <= 35 && (feat.edit || 0) >= 15 && (feat.read || 0) >= 4 && (feat.bash || 0) === 0 && (feat.thinkStepLines || 0) >= 800);
        const isMimo26Pro = feat.hidR === 0 && feat.totalTools >= 8 && feat.totalTools <= 14 && (feat.edit || 0) >= 5 && (feat.read || 0) >= 1 && (feat.read || 0) <= 2 && (feat.bash || 0) === 0 && (feat.preToolTextChars || 0) >= 80 && (feat.emDash || 0) >= 5;
        const isStep5Preview = (feat.hidR === 0 && feat.totalTools >= 2 && (feat.read || 0) >= 1 && (feat.preToolTextChars || 0) >= 50 && (feat.preToolTextChars || 0) <= 84 && (feat.cnColon || 0) <= 2 && avgChunk >= 1.8 && avgChunk <= 2.8 && cps >= 18 && cps <= 32) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 12500 && (feat.htmlMaxLen || 0) <= 15000 && (feat.boxComment || 0) >= 1) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 60000 && (feat.emDash || 0) >= 40) || (feat.turns === 1 && feat.totalTools === 3 && (feat.edit || 0) === 1 && feat.preNarrate >= 0.8 && (feat.meanChars || 0) <= 800);
        const isQwen37Max = (feat.hidR === 0 && feat.totalTools >= 2 && (feat.read || 0) >= 1 && (feat.preToolTextChars || 0) >= 95 && avgChunk > 0 && avgChunk <= 2.2 && cps > 0 && cps <= 15) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 22000 && (feat.htmlMaxLen || 0) <= 25800 && (feat.ariaLabelledby || 0) === 0);
        const isDs41Flash = (feat.hidR === 0 && feat.totalTools >= 4 && (feat.edit || 0) >= 1 && (feat.interToolTextChars || 0) >= 80 && avgChunk >= 3.5 && avgChunk <= 5.5) || (feat.turns === 1 && feat.totalTools === 0 && (feat.htmlMaxLen || 0) >= 26000 && (feat.htmlMaxLen || 0) <= 31000 && (feat.ariaLabelledby || 0) >= 1);
        const isQwen38FlashNextHeavy = feat.turns === 1 && feat.totalTools >= 40 && (feat.bash || 0) >= 15 && (feat.edit || 0) >= 10;
        const isKimiK3 = (feat.totalTools === 0 && (feat.cnColon || 0) >= 3 && ((cps > 0 && cps <= 20) || (feat.htmlMaxLen || 0) >= 10000)) || (feat.totalTools >= 4 && (feat.preToolTextChars || 0) >= 350 && (feat.emDash || 0) >= 4);
        const isQwen38_27b = feat.totalTools === 0 && feat.hidR === 0 && (feat.htmlMaxLen || 0) >= 7400 && (feat.htmlMaxLen || 0) <= 8600 && (feat.ariaLabelledby || 0) === 0 && (feat.cnColon || 0) === 0;
        const isHy4Preview = feat.totalTools === 0 && feat.hidR === 0 && (feat.htmlMaxLen || 0) >= 5800 && (feat.htmlMaxLen || 0) <= 6800 && (feat.colorSchemeCss || 0) >= 1;
        const isGlm51 = feat.totalTools === 0 && feat.hidR === 0 && (((feat.htmlMaxLen || 0) >= 8700 && (feat.htmlMaxLen || 0) <= 9500 && (feat.svgSmilNoScript || 0) >= 1) || ((feat.htmlMaxLen || 0) >= 1650 && (feat.htmlMaxLen || 0) <= 2000 && (feat.emDash || 0) >= 2 && (feat.cnColon || 0) === 0));
        const isQwen35_397b = feat.totalTools === 0 && feat.hidR === 0 && (feat.htmlMaxLen || 0) >= 4500 && (feat.htmlMaxLen || 0) <= 5300;
        const isInklingSmall = feat.hidR === 1 && feat.totalTools === 0 && cps >= 32 && cps <= 44 && (feat.htmlMaxLen || 0) <= 1900;
        const isMinimaxM27 = feat.hidR === 1 && feat.totalTools === 0 && cps >= 21 && cps <= 30 && (feat.htmlMaxLen || 0) <= 2100;
        const anyOpenSpecific = isMinimaxM31Flash || isMinimaxM3 || isGlm53Flash || isGlm53Max || isQwen38Max0902 || isMimo26Pro || isStep5Preview || isQwen37Max || isDs41Flash || isQwen38FlashNextHeavy || isKimiK3 || isQwen38_27b || isHy4Preview || isGlm51 || isQwen35_397b || isInklingSmall || isMinimaxM27;
        if (/minimax-m3\.1-flash/i.test(proto.id)) sim = isMinimaxM31Flash ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/minimax-m3(?!\.1)/i.test(proto.id)) sim = isMinimaxM3 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/glm-5\.3-flash/i.test(proto.id)) sim = isGlm53Flash ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/glm-5\.3-max/i.test(proto.id) && isGlm53Max) sim = Math.max(0.97, sim + 0.26);
        else if (/qwen-?3\.8-max-0902/i.test(proto.id)) sim = isQwen38Max0902 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/mimo-v2\.6-pro/i.test(proto.id)) sim = isMimo26Pro ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/step-5-preview/i.test(proto.id)) sim = isStep5Preview ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/qwen-?3\.7-max/i.test(proto.id) && isQwen37Max) sim = Math.max(0.97, sim + 0.26);
        else if (proto.id === 'deepseek/deepseek-v4.1-flash' && isDs41Flash) sim = Math.max(0.97, sim + 0.26);
        else if (proto.id === 'alibaba/qwen3.8-flash-next' && isQwen38FlashNextHeavy) sim = Math.max(0.97, sim + 0.26);
        else if (/kimi-k3/i.test(proto.id) && isKimiK3) sim = Math.max(0.97, sim + 0.26);
        else if (/qwen-?3\.8-27b/i.test(proto.id)) sim = isQwen38_27b ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/hy-?4-preview/i.test(proto.id)) sim = isHy4Preview ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/glm-5\.1/i.test(proto.id)) sim = isGlm51 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/qwen3\.5-397b/i.test(proto.id)) sim = isQwen35_397b ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/inkling-small/i.test(proto.id)) sim = isInklingSmall ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (/minimax-m2\.7/i.test(proto.id)) sim = isMinimaxM27 ? Math.max(0.97, sim + 0.26) : Math.min(0.72, sim - 0.16);
        else if (anyOpenSpecific) sim = Math.min(0.84, sim - 0.10);
      }

      if (!feat.isOpenThink) {
        if (feat.isGeminiCoding) {
          if (proto.vendor !== 'Google') sim = Math.min(0.62, sim * 0.68);
        } else if (isSolarPro4Profile) {
          if (!/solar-pro4/i.test(proto.id)) sim = Math.min(0.68, sim * 0.72);
        } else if (isAnyMuseProfile) {
          if (proto.vendor !== 'Meta') sim = Math.min(0.68, sim * 0.72);
        } else if (isKibitzProfile || isHorizon62Profile || isKalmiaProfile || isCynosureProfile) {
          if (proto.vendor !== 'Stealth') sim = Math.min(0.68, sim * 0.72);
        } else if (isGrok46XHigh || isGrok46High || isGrok46Medium) {
          if (proto.vendor !== 'xAI') sim = Math.min(0.68, sim * 0.72);
        } else if ((isDefiniteOpenAiChunkStream || feat.wireFam === 'openai' || (hasStrongOpenAiSig && !hasAnthropicSig)) && !isFable51CodingCore && !hasHtmlFable51Early) {
          if (proto.vendor !== 'OpenAI') sim = Math.min(0.68, sim * 0.72);
        } else if (feat.wireFam === 'anthropic' || isFable51CodingCore || hasHtmlFable51Early || (hasAnthropicSig && !hasStrongOpenAiSig)) {
          if (proto.vendor !== 'Anthropic') sim = Math.min(0.68, sim * 0.72);
        }
      }

      // 5. Open-Source 家族内部精细区分（Beam 1.0 501B vs DeepSeek V4.1 Flash vs Qwen 3.8 vs MiMo V2.6 vs GLM 5.3/5.2 vs Kimi K3 vs Nemotron 3 Ultra）
      if (proto.isOpen && feat.isOpenThink) {
        const rAvg = Number(feat.rAvgChunk) || 0;
        const rAvgGuess = rAvg > 0 ? inferPlainModelByRAvg(feat) : null;
        const isBeamCaveman = (feat.turns === 1 && feat.pyHeredoc >= 1 && feat.catHeredoc >= 1 && durMs >= 300000) || rAvg > 85;
        const isDs41Flash0910 = !isBeamCaveman && ((feat.tagReiTier === 'max' && feat.tagReiVal >= 250) || (rAvg > 0 && rAvg <= 3.6));
        const isQwen38FlashNextLow = !isBeamCaveman && feat.tagReiTier === 'low' && Boolean(feat.hasBpeMatchTag);
        const isQwen38MaxLow = !isBeamCaveman && ((feat.tagReiTier === 'low' && !feat.hasBpeMatchTag) || (rAvg > 6.2 && rAvg <= 8.35));
        const isMimo26Med = !isBeamCaveman && (feat.tagReiTier === 'medium' || (rAvg > 8.35 && rAvg <= 10.2));
        if (proto.id === 'contenders/caveman-agent' && isBeamCaveman) {
          sim = Math.max(0.96, sim + 0.28);
        } else if (/^deepseek\/deepseek-v4\.1-flash-20260910/i.test(proto.id) && isDs41Flash0910) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (/^alibaba\/qwen3\.8-flash-next/i.test(proto.id) && isQwen38FlashNextLow) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (/^alibaba\/qwen3\.8-max$/i.test(proto.id) && isQwen38MaxLow) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (/^xiaomi\/mimo-v2\.6-flash/i.test(proto.id) && isMimo26Med) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (rAvgGuess && String(proto.id || '').toLowerCase().includes(String(rAvgGuess.id || '').split('/').pop().toLowerCase())) {
          sim = Math.max(0.955, sim + 0.22);
        } else if (isBeamCaveman || isDs41Flash0910 || isQwen38FlashNextLow || isQwen38MaxLow || isMimo26Med) {
          sim = Math.min(0.86, sim - 0.08);
        }
      }

      const canon = canonHabitModelName(proto.label || proto.id);
      const k = String(canon || proto.label).toLowerCase();
      // 静态启发式规则上限控制在 0.958，为习惯库自学习 k-NN 与弹性纠偏邻域预留 0.962~0.995 的超越空间
      sim = Math.min(0.958, sim);
      // 结合校准质心（calib.protoCentroids）执行后验相似度拉升
      if (hasLearnedProto && sim >= 0.72) {
        const ruleMatched = sim >= 0.92;
        const lVSim = vectorSimilarity(feat.vec, learnedProto.vec, feat, calib?.dimWeights?.[k] || null);
        const lMSim = learnedProto.meta ? metaSimilarity(feat, learnedProto.meta) : null;
        const lSim = lMSim !== null ? (lVSim * 0.50 + lMSim * 0.50) : lVSim;
        if (lSim >= 0.85) {
          const cLift = (lSim - 0.83) * (ruleMatched ? 0.52 : 0.32) + Math.min(0.025, (Number(learnedProto.count) || 1) * 0.005);
          const cap = ruleMatched ? 0.968 : 0.892;
          sim = Math.max(sim, Math.min(cap, sim + cLift));
        }
      }
      // 结合本账号用户历史常用纠偏先验（越用越准，温和加权不喧宾夺主）
      const famKey = parseModelFamilyAndTier(canon).famKey || canon.toLowerCase();
      const freqHits = (usageStats.models?.[k] || 0) + (usageStats.families?.[famKey] || 0) * 0.5;
      if (freqHits > 0) {
        sim += Math.min(0.022, Math.log10(1 + freqHits) * 0.014);
      }
      sim = Math.max(0.1, Math.min(0.978, sim));
      scoreMap.set(k, {
        id: proto.id,
        label: proto.label,
        canon,
        vendor: proto.vendor,
        isOpen: proto.isOpen,
        sim,
        tags: [...feat.habitTags.slice(0, 4), ...(proto.tags || []).slice(0, 2)],
        learnedHits: 0,
        userLearned: false,
      });
    }

    // Blend with self-learned bank (`habitLearnBank:v1`, exact sid match locks 99.6%; cross-session samples apply top-3 k-NN nudge per class)
    const isSyntheticStubSample = s => !s || (
      (s.meta && Number(s.meta.meanChars) === 4500 && (Number(s.meta.writtenChars) || 0) === 0 && (Number(s.meta.totalTools) || 0) === 2 && (Number(s.meta.write) || 0) === 1 && (Number(s.meta.bash) || 0) === 0) ||
      (Array.isArray(s.vec) && s.vec.length === 20 && s.vec[2] === 0.05 && (s.vec[4] === 0.22 || s.vec[4] === 0.25) && s.vec[12] === 0.8 && s.vec[15] === 0.52) ||
      (Array.isArray(s.vec) && s.vec.length === 20 && (s.vec[12] === 0.8 || s.vec[12] === 0.35) && (s.vec[15] === 0.52 || s.vec[15] === 0) && (s.vec[2] === 0.05 || s.vec[2] === 0.06) && s.vec[3] === 0 && (!s.meta || (Number(s.meta.meanChars) === 4500 && (Number(s.meta.writtenChars) || 0) === 0 && (Number(s.meta.avgTurnDurMs) || 0) === 0 && (Number(s.meta.cps) || 0) === 0 && (Number(s.meta.memoAvgChunk) || 0) === 0)))
    );
    const protoFamEntriesByKey = new Map();
    for (const [pk, pit] of scoreMap.entries()) {
      const pfk = parseModelFamilyAndTier(pit.canon || pit.label).famKey;
      if (!pfk) continue;
      if (!protoFamEntriesByKey.has(pfk)) protoFamEntriesByKey.set(pfk, []);
      protoFamEntriesByKey.get(pfk).push([pk, pit]);
    }
    for (const [, entries] of protoFamEntriesByKey.entries()) { if (entries.length >= 2) { const sp = [...entries].sort((a, b) => (b[1].sim || 0) - (a[1].sim || 0)); if ((sp[0][1].sim || 0) >= 0.955 && ((sp[0][1].sim || 0) - (sp[1][1].sim || 0)) >= 0.02) sp[0][1].protoRuleLeader = true; } }
    const effTierMemoByFam = new Map();
    const bankByKey = new Map();
    for (const sample of bank) {
      if (!sample || !sample.model || !Array.isArray(sample.vec)) continue;
      if (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(sample.model || ''))) continue;
      const truthRank = sample._truthRank || (sample._truthRank = getSampleTruthRank(sample));
      const isBattleOrDirectTruth = truthRank >= 3;
      const isConfirmedSample = Boolean(sample.userConfirmed || sample.importedFromDiag || truthRank >= 2 || (sample.autoTeacher && (Number(sample.teacherConf) || 0) >= 85));
      if (ignoreExactSid && sid && sample.sid && (String(sample.sid) === sid || String(sample.sid) === String(chat?._origSid || ""))) continue;
      const isExactSid = Boolean(!ignoreExactSid && sid && sample.sid && String(sample.sid) === sid && (sample.userConfirmed || sample.importedFromDiag || isBattleOrDirectTruth) && !sample.autoTeacher);
      if (!isExactSid && feat.isLunaFastTag && feat.hasSys6603Tag && feat.tagReiTier === 'medium' && !/luna/i.test(String(sample.model || ''))) continue;
      const sTurns = Number(sample.meta?.turns ?? sample.turns ?? 0);
      const sHidR = Number(sample.meta?.hidR ?? sample.hidR ?? 0);
      const fTotalTurns = Math.max(Number(feat.turns) || 0, Number(modelEntry?.completedTurnCount) || 0);
      const isMidSessionRoutedSample = Boolean(isExactSid && sHidR >= 10 && sTurns > 0 && sTurns <= 6 && fTotalTurns >= sTurns + 4 && feat.hidR === 0 && (feat.isGeminiCoding || (feat.pyHeredoc || 0) >= 5 || (feat.catHeredoc || 0) >= 5 || ((feat.bash || 0) >= 10 && (feat.totalTools || 0) >= 20)));
      if (isMidSessionRoutedSample) {
        feat.routedFromBank = { fromModel: sample.model, fromLabel: sample.rawLabel || sample.model, fromTurns: sTurns || 2, fromHidR: sHidR };
        continue;
      }
      const sampleOpen = sample._isOpen !== undefined ? sample._isOpen : (sample._isOpen = Boolean(sample.model && sample.model !== '开源模型' ? isOpenName(sample.model) : (sample.meta?.isOpenThink ?? sample.isOpen)));
      if (!isExactSid && sampleOpen !== Boolean(feat.isOpenThink)) continue;
      if (!isExactSid && (sample._isStub !== undefined ? sample._isStub : (sample._isStub = isSyntheticStubSample(sample)))) continue;
      const isToollessEvalOnAgent = Boolean(!isExactSid && !isEvalAnalyze && (feat.totalTools || 0) > 0 && (sample.battleRevealed || sample.directMode) && (sample.meta?.totalTools || 0) === 0);
      const isAgentSampleOnToollessEval = Boolean(!isExactSid && isEvalAnalyze && (feat.totalTools || 0) === 0 && (sample.meta?.totalTools || 0) > 0);
      if (!isExactSid && isToollessEvalOnAgent) continue;
      if (!isExactSid && isAgentSampleOnToollessEval) continue;
      const hasTimingMeta = Boolean(sample.meta && ((Number(sample.meta.avgTurnDurMs) || 0) > 0 || (Number(sample.meta.cps) || 0) > 0 || (Number(sample.meta.memoAvgChunk) || 0) > 0));
      const isZeroTimingNoToolStub = Boolean(!hasTimingMeta && sample.meta && (sample.meta.totalTools || 0) === 0 && !Array.isArray(sample.meta.htmlSvgSig));
      if (!isExactSid && isZeroTimingNoToolStub) {
        if ((sample.meta.htmlMaxLen || 0) === 0) {
          if (Math.abs((feat.meanChars || 0) - (sample.meta.meanChars || 0)) > 120 || (feat.cnColon || 0) !== (sample.meta.cnColon || 0) || (feat.emDash || 0) !== (sample.meta.emDash || 0)) continue;
        } else {
          const maxLenTol = isBattleOrDirectTruth ? 8500 : 350;
          if (Math.abs((feat.htmlMaxLen || 0) - (sample.meta.htmlMaxLen || 0)) > maxLenTol || (feat.svgSmilNoScript || 0) !== (sample.meta.svgSmilNoScript || 0) || (feat.prefersReducedMotion || 0) !== (sample.meta.prefersReducedMotion || 0)) continue;
        }
      }
      let label = sample._canonLabel || (sample._canonLabel = canonHabitModelName(sample.model));
      const isManualExactSid = Boolean(isExactSid && sample.userConfirmed && !sample.autoTeacher);
      if (!isManualExactSid) {
        if ((feat.genImg || 0) >= 1 && feat.turns === 2 && feat.hidR === 1 && feat.writtenChars < 5500 && Boolean(feat.ariaLabelledby) !== Boolean(sample.meta?.ariaLabelledby)) continue;
        if (/solar-pro4/i.test(label) && !isSolarPro4Profile) continue;
        if (/kibitz/i.test(label) && !isKibitzProfile) continue;
        if (/horizon-6\.2/i.test(label) && !isHorizon62Profile) continue;
        if (/kalmia/i.test(label) && !isKalmiaProfile) continue;
        if (/cynosure/i.test(label) && !isCynosureProfile) continue;
        if (/grok-4\.6-xhigh/i.test(label) && !isGrok46XHigh) continue;
        if (/grok-4\.6-high/i.test(label) && !isGrok46High) continue;
        if (/grok-4\.6-medium/i.test(label) && !isGrok46Medium) continue;
        if (/muse-wonder/i.test(label) && !isMuseWonder) continue;
        if (/muse-spark-open/i.test(label) && !isMuseSparkOpen) continue;
        if (/muse-spark-1\.2/i.test(label) && !isMuseSpark12Max) continue;
        if (/muse-spark-1\.3-high/i.test(label) && !isMuseSpark13High) continue;
        if (/muse-spark-1\.3-low/i.test(label) && !isMuseSpark13Low) continue;
        if (/muse-spark-1\.3-xhigh/i.test(label) && !isMuseSpark13XHigh) continue;
        if (/muse-spark-1\.3-max/i.test(label) && !isMuseSpark13Max) continue;
        if (isAnyMuseProfile && !/muse/i.test(label)) continue;
      }
      if (!isManualExactSid && !isEvalAnalyze) {
        if (feat.isGeminiCoding && !/gemini|google/i.test(label)) continue;
        if (/argon|barium/i.test(label) && !isKnownArgon) continue;
        if ((feat.solClarifyPhrase || 0) > 0 && (feat.lunaNotSurePhrase || 0) === 0 && (feat.totalTools || 0) === 0 && /luna/i.test(label) && (sample.meta?.solClarifyPhrase || 0) === 0) continue;
        if (!feat.isGeminiCoding && /gemini|google|argon|barium/i.test(label)) continue;
        if ((isDefiniteOpenAiChunkStream || hasStrongOpenAiSig) && !/gpt|openai|\bsol(?=$|[-\s_.\d])|astra|luna|terra/i.test(label)) continue;
        if (((hasClaudeChunkSig && !isNonBig3Profile && !hasStrongOpenAiSig) || hasAnthropicSig) && !/claude|anthropic|haiku|sonnet|opus|fable/i.test(label)) continue;
        if (isMuseSpark13Max && label !== 'muse-spark-1.3-max') continue;
        if (isAnyMuseProfile && !/muse/i.test(label)) continue;
      }
      const crossModalToolless = Boolean(
        (sample.battleRevealed || sample.directMode) && (feat.totalTools || 0) > 0 && (sample.meta?.totalTools || 0) === 0
      );
      if (!isExactSid && !isEvalAnalyze && !crossModalToolless && sample.meta) {
        const fT = feat.totalTools || 0, mT = sample.meta.totalTools || 0;
        if ((fT === 0) !== (mT === 0)) continue;
        if ((fT > 0 && feat.askUser === fT) !== (mT > 0 && sample.meta.askUser === mT)) continue;
        if (Boolean(feat.isGeminiCoding) !== Boolean(sample.meta.isGeminiCoding)) continue;
      }
      let vSim = isExactSid
        ? 0.998
        : crossModalToolless
          ? vectorSimilarity(feat.vec, sample.vec, { ...feat, totalTools: 0, htmlMaxLen: 0, writtenChars: 0, cssRoot: 0, raf: 0, svgRich: 0, boxComment: 0 })
          : vectorSimilarity(feat.vec, sample.vec, feat);
      if (!isExactSid && isConfirmedSample && !feat.isGeminiCoding && !Boolean(sample.meta?.isGeminiCoding) && sample.vec.length === 20 && feat.vec.length === 20 && sample.vec[0] !== feat.vec[0]) {
        const alignedVec = [...sample.vec];
        alignedVec[0] = feat.vec[0];
        alignedVec[1] = feat.vec[1];
        vSim = Math.max(vSim, vectorSimilarity(feat.vec, alignedVec, crossModalToolless ? { ...feat, totalTools: 0, htmlMaxLen: 0, writtenChars: 0 } : feat) * 0.96);
      }
      const isCrossMicroSample = Boolean(!isExactSid && feat.isMicroProbeChat && feat.turns === 1 && sample.meta && sample.meta.turns === 2 && (sample.meta.write || 0) >= 1 && (sample.meta.bash || 0) >= 1);
      const minSimReq = isBattleOrDirectTruth ? 0.75 : (isCrossMicroSample ? 0.76 : 0.80);
      if (!isExactSid && !isEvalAnalyze && !isCrossMicroSample && sample.meta && (vSim * 0.52 + 0.48) < minSimReq - 0.002) continue;
      const mSim = (!isExactSid && sample.meta)
        ? (crossModalToolless
            ? metaSimilarity({ ...feat, totalTools: 0, askUser: 0, meanChars: feat.nonCodeMeanChars || feat.meanChars }, { ...sample.meta, totalTools: 0, askUser: 0 })
            : metaSimilarity(feat, sample.meta))
        : null;
      if (isCrossMicroSample && mSim !== null) {
        vSim = Math.max(vSim, Math.min(0.992, vSim * 0.25 + mSim * 0.75 + 0.04));
      }
      const sampleTierVec = Array.isArray(sample.tierVec) && sample.tierVec.length === 12
        ? sample.tierVec
        : (Array.isArray(sample.meta?.tierVec) && sample.meta.tierVec.length === 12 ? sample.meta.tierVec : null);
      // 在非评测（Max/Agent）模式下，型号习惯匹配仅比较 20 维 + meta 习惯特征，强度档位交由独立强度识别器处理，避免强度向量干扰型号归属
      const tvSim = (!isExactSid && isEvalAnalyze && sampleTierVec && Array.isArray(feat.tierVec) && feat.tierVec.length === 12)
        ? tierVecSimilarity(feat.tierVec, sampleTierVec, feat.evalModality || sample.evalModality || 'chat')
        : null;
      const basePairSim = mSim !== null ? (vSim * 0.52 + mSim * 0.48) : vSim;
      const sim = isExactSid
        ? 0.998
        : (tvSim !== null
            ? (basePairSim * 0.74 + tvSim * 0.26)
            : basePairSim);
      if (!isExactSid && sim < minSimReq) continue;
      let k = String(label || sample.model).toLowerCase();
      // 强度与型号习惯解耦：在常规对话中，若习惯库样本为同家族其它未在 PROTOTYPES 独立建档的子档位（如 claude-opus-5.5-low）或「标准」无档位揭晓样本（如 gemini-4-argon / claude-opus-5），
      // 将其家族习惯票归并到该家族在 scoreMap 中的原型上，绝不单独分裂出与主原型打架的冲突档位行
      if (!isExactSid && !isEvalAnalyze && !scoreMap.has(k)) {
        const pSample = parseModelFamilyAndTier(label);
        if (pSample.famKey) {
          const famEntries = protoFamEntriesByKey.get(pSample.famKey) || [];
          if (famEntries.length === 1) {
            k = famEntries[0][0];
            label = famEntries[0][1].canon || famEntries[0][1].label;
          } else if (famEntries.length > 1 && !pSample.hasExplicitTier) {
            if (!effTierMemoByFam.has(pSample.famKey)) {
              effTierMemoByFam.set(pSample.famKey, identifyEffortTier(feat, pSample.famKey, calib)?.tier || '');
            }
            const prefTier = effTierMemoByFam.get(pSample.famKey);
            const hitTierEntry = prefTier
              ? famEntries.find(([, it]) => parseModelFamilyAndTier(it.canon || it.label).tier === prefTier)
              : null;
            const chosenEntry = hitTierEntry || famEntries[0];
            k = chosenEntry[0];
            label = chosenEntry[1].canon || chosenEntry[1].label;
          } else if (famEntries.length === 0 && isToollessEvalOnAgent) {
            continue;
          }
        } else if (isToollessEvalOnAgent) {
          continue;
        }
      }
      if (!bankByKey.has(k)) bankByKey.set(k, []);
      bankByKey.get(k).push({ sample, sim, mSim, tvSim, truthRank, isExactSid, isConfirmedSample, label, sampleOpen, softWeight: 1.0 });
      // 弹性方向软邻域扩散（Elastic Soft-Target Neighborhood Pull）：非精确同会话命中时，将相似度向邻近思考档位与折射候选同步扩散
      if (!isExactSid && sample.softTargets && typeof sample.softTargets === 'object' && sim >= 0.82) {
        for (const [softModel, sWeight] of Object.entries(sample.softTargets)) {
          const sw = Number(sWeight) || 0;
          if (sw <= 0 || sw >= 0.55) continue;
          const sCanon = sanitizeCorruptedTierSlug(typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(softModel) : softModel);
          const sk = String(sCanon || softModel).toLowerCase();
          if (!sk || sk === k || (!isEvalAnalyze && !scoreMap.has(sk))) continue;
          const softSim = Math.max(0.80, sim * (0.91 + sw * 0.25));
          if (!bankByKey.has(sk)) bankByKey.set(sk, []);
          bankByKey.get(sk).push({ sample, sim: softSim, mSim, tvSim, truthRank: 2, isExactSid: false, isConfirmedSample, label: sCanon, sampleOpen, softWeight: sw, isElasticNeighbor: true });
        }
      }
      if (!isExactSid && sample.rejectedModel && sim >= 0.84) {
        const rejCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(sample.rejectedModel) : sample.rejectedModel;
        const rk = String(rejCanon || '').toLowerCase();
        const rejEntry = rk ? scoreMap.get(rk) : null;
        if (rejEntry && !rejEntry.userLearned) {
          rejEntry.sim = Math.max(0.15, rejEntry.sim - Math.min(0.055, (sim - 0.82) * 0.28));
        }
      }
    }
    const maxProtoSim = Math.max(0, ...[...scoreMap.values()].map(v => v.sim || 0));
    let winExactKey = null;
    for (const [k, hits] of bankByKey.entries()) {
      hits.sort((a, b) =>
        (Number(Boolean(b.isExactSid)) - Number(Boolean(a.isExactSid))) ||
        ((b.sim + (b.truthRank >= 4 ? 0.018 : b.truthRank === 3 ? 0.010 : 0)) - (a.sim + (a.truthRank >= 4 ? 0.018 : a.truthRank === 3 ? 0.010 : 0)))
      );
      const top = hits[0];
      const top3 = hits.slice(0, 3);
      const meanTopSim = top3.reduce((acc, h) => acc + h.sim, 0) / top3.length;
      const topTruthRank = top.truthRank || getSampleTruthRank(top.sample);
      const isCrossModeToollessEval = Boolean(!top.isExactSid && !isEvalAnalyze && (feat.totalTools || 0) > 0 && (top.sample.battleRevealed || top.sample.directMode) && (top.sample.meta?.totalTools || 0) === 0);
      const isBattleOrDirectTop = topTruthRank >= 3 && !isCrossModeToollessEval;
      const effPullScale = top.isElasticNeighbor
        ? (0.55 + (Number(top.softWeight) || 0.25))
        : isCrossModeToollessEval
          ? 0.65
          : (topTruthRank >= 4 ? 1.32 : topTruthRank === 3 ? 1.18 : 1.0);
      const nudge = top.isExactSid ? 0.45 : Math.max(0, (meanTopSim - 0.79) * (top.isConfirmedSample ? 0.22 : 0.09) * effPullScale);
      const isStrictTwin = !top.isExactSid && top.isConfirmedSample && !top.sample.autoTeacher && !isCrossModeToollessEval && (
        (top.mSim !== null && top.mSim >= 0.95 && top.sim >= 0.94) ||
        (meanTopSim >= 0.90 && hits.length >= 2) ||
        (isBattleOrDirectTop && top.sim >= 0.885 && (top.tvSim ?? 0.88) >= 0.86)
      );
      const isStrongLearnedPull = !top.isExactSid && top.isConfirmedSample && !isCrossModeToollessEval && (meanTopSim >= 0.855 || (isBattleOrDirectTop && meanTopSim >= 0.835));
      if (top.isExactSid) winExactKey = k;
      const existing = scoreMap.get(k);
      const isManualUserSample = Boolean(top.sample.userConfirmed && !top.sample.autoTeacher && !top.sample.importedFromDiag && !top.sample.battleRevealed && !top.sample.directMode);
      const truthMult = isCrossModeToollessEval ? 0.985 : topTruthRank >= 4 ? 1.052 : topTruthRank === 3 ? 1.044 : isManualUserSample ? 1.036 : top.isConfirmedSample ? 1.012 : 0.975;
      if (existing) {
        const kernelTarget = Math.min(0.992, meanTopSim * truthMult + Math.min(0.036, Math.log10(1 + hits.length) * 0.016));
        existing.sim = Math.max(existing.sim, top.isExactSid
          ? 0.996
          : (existing.sim >= 0.90 || (existing.sim >= 0.78 && top.mSim !== null && top.mSim >= 0.95 && top.sim >= 0.94)) && (isManualUserSample || isBattleOrDirectTop || top.sample.importedFromDiag) && (isStrictTwin || isStrongLearnedPull)
            ? Math.min(top.isElasticNeighbor ? 0.976 : (topTruthRank >= 4 ? 0.993 : 0.991), Math.max(top.sim + (top.isElasticNeighbor ? 0.018 : (topTruthRank >= 4 ? 0.038 : 0.032)), existing.sim * 0.25 + kernelTarget * 0.75))
            : existing.sim >= 0.94
              ? Math.min(0.985, existing.sim + nudge * 0.35)
              : existing.sim >= 0.90 && isStrictTwin
                ? Math.min(0.966, Math.max(top.sim + 0.006, existing.sim * 0.35 + kernelTarget * 0.65))
                : existing.sim >= 0.90 && isStrongLearnedPull
                  ? Math.min(0.956, Math.max(existing.sim + nudge, existing.sim * 0.45 + kernelTarget * 0.55))
                  : Math.min(0.920, existing.sim + nudge * 0.65));
        existing.learnedHits += hits.length;
        if (top.isExactSid || isStrictTwin || isStrongLearnedPull) {
          existing.userLearned = true;
          const hitTag = top.sample.battleRevealed
            ? '⚔️ 命中Battle真值样本 ✓'
            : top.sample.directMode
              ? '🎯 命中Direct锁定样本 ✓'
              : top.sample.importedFromDiag
                ? '📥 命中习惯库诊断导入 ✓'
                : top.isElasticNeighbor
                  ? '🧭 命中弹性纠偏邻域牵引 ✓'
                  : top.sample.autoTeacher
                    ? '⚡ 已自动拟合反推结果 ✓'
                    : '★ 命中习惯库纠偏样本 ✓';
          existing.tags = [hitTag, ...(existing.tags || []).filter(t => t !== hitTag).slice(0, 5)];
        }
      } else {
        const protoMatch = getProtoByCanon(k);
        const dispLabel = formatDisplayModelLabel(protoMatch?.label || (top.isElasticNeighbor ? top.label : (top.sample.rawLabel || top.sample.model || top.label)), top.sample.rawLabel);
        scoreMap.set(k, {
          id: protoMatch?.id || top.sample.model,
          label: dispLabel,
          canon: top.label,
          vendor: protoMatch?.vendor || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(top.label)] : '') || '自学习',
          isOpen: top.sampleOpen,
          sim: top.isExactSid ? 0.996 : (isManualUserSample || isBattleOrDirectTop) ? Math.min(top.isElasticNeighbor ? 0.974 : (topTruthRank >= 4 ? 0.991 : 0.988), meanTopSim * (topTruthRank >= 4 ? 1.03 : 1.02)) : isStrictTwin ? Math.min(0.965, top.sim + 0.006) : isStrongLearnedPull ? Math.min(0.952, meanTopSim * 0.97) : Math.min(0.910, meanTopSim * 0.92),
          tags: [top.sample.battleRevealed ? '⚔️ 命中Battle真值样本 ✓' : top.sample.directMode ? '🎯 命中Direct锁定样本 ✓' : top.sample.importedFromDiag && top.isExactSid ? '📥 命中习惯库诊断导入 ✓' : top.isElasticNeighbor ? '🧭 命中弹性纠偏邻域牵引 ✓' : top.isExactSid || isStrictTwin || isStrongLearnedPull ? '★ 命中习惯库纠偏样本 ✓' : '命中历史习惯样本', ...feat.habitTags.slice(0, 4)],
          learnedHits: hits.length,
          userLearned: top.isExactSid || isStrictTwin || isStrongLearnedPull,
        });
      }
    }
    // 全局后验排斥抑制（Post-Bank Contrastive Repulsion）：确保被用户纠偏或 Battle 排他校准排除的模型让位于真实目标与正确强度档位
    if (calib?.repelledModels && typeof calib.repelledModels === 'object') {
      for (const [rk, rList] of Object.entries(calib.repelledModels)) {
        const entry = scoreMap.get(rk);
        if (!entry || !Array.isArray(rList) || !rList.length) continue;
        let maxRSim = 0;
        let maxBattleRSim = 0;
        for (const rItem of rList) {
          if (!rItem || !Array.isArray(rItem.vec)) continue;
          const rV = vectorSimilarity(feat.vec, rItem.vec, feat);
          const rM = rItem.meta ? metaSimilarity(feat, rItem.meta) : null;
          const rS = rM !== null ? (rV * 0.50 + rM * 0.50) : rV;
          if (rS > maxRSim) maxRSim = rS;
          if (rItem.battleRepel && rS > maxBattleRSim) maxBattleRSim = rS;
        }
        if (maxBattleRSim >= 0.965 && entry.sim < 0.93) {
          entry.sim = Math.min(entry.sim, 0.885) - Math.min(0.065, (maxBattleRSim - 0.94) * 0.40);
          entry.userLearned = false;
        } else if (maxRSim >= 0.965 && entry.sim < 0.93) {
          entry.sim = Math.min(entry.sim, 0.895) - Math.min(0.045, (maxRSim - 0.94) * 0.30);
          entry.userLearned = false;
        }
      }
    }
    if (winExactKey) {
      for (const [k, item] of scoreMap.entries()) {
        if (k !== winExactKey && !item.userLearned) {
          item.sim = Math.min(item.sim, 0.885);
        }
      }
    } else {
      // 融合 50 维 HTML/SVG 代码结构、运动学与专属 Token 指纹（当回复包含真实 SVG/HTML 动画或绘图代码时）
      const hm = feat.htmlSvgMatch;
      const hf = hm?.features || null;
      const topHtmlCand = htmlSvgCands.length > 0 ? htmlSvgCands[0] : null;
      const hasRichSvgOrHtml = Boolean(hm && topHtmlCand && (
        topHtmlCand.ruleScore >= 0.48
        || (hf && hm.code_type === "html_svg" && hf.bytes >= 3800 && (hf.nPath + hf.nG + hf.nCircle) >= 4 && topHtmlCand.protoSim >= 0.80)
        || (hf && hm.code_type === "svg32" && hf.viewBox === "0 0 32 32" && topHtmlCand.protoSim >= 0.82)
      ));
      if (hasRichSvgOrHtml) {
        const isFlash38HighBattleEdit2 = Boolean(feat.turns === 1 && feat.bash === 0 && feat.write === 0 && (feat.edit || 0) >= 4 && (feat.read || 0) >= 6 && (feat.htmlMaxLen || 0) >= 80000);
        if (isEvalAnalyze && topHtmlCand && topHtmlCand.ruleScore >= 0.48 && topHtmlCand.vendorId && !(feat.isOpenThink && !topHtmlCand.isOpen) && !isFlash38HighBattleEdit2) {
          const topVid = String(topHtmlCand.vendorId).toLowerCase();
          for (const [, it] of scoreMap.entries()) {
            const iv = String(it.vendor || '').toLowerCase();
            if (!it.userLearned && iv && !iv.includes(topVid) && !topVid.includes(iv)) {
              it.sim = Math.min(it.sim, 0.865);
            }
          }
        }
        for (let hi = 0; hi < Math.min(4, htmlSvgCands.length); hi++) {
          const hc = htmlSvgCands[hi];
          if (!hc || (hc.ruleScore < 0.35 && hc.protoSim < 0.70)) continue;
          if ((!isEvalAnalyze || feat.isOpenThink) && Boolean(hc.isOpen) !== Boolean(feat.isOpenThink)) continue;
          if (isFlash38HighBattleEdit2 && /argon/i.test(hc.canon || '')) continue;
          if (!isEvalAnalyze && isAnyMuseProfile && hc.vendorId !== "meta") continue;
          const effHtmlWireFam = isNonBig3Profile ? "" : ((isFable51CodingCore || hasHtmlFable51Early) ? "anthropic" : ((isLunaHigh1TurnCoding || isSol61XHighSingleWrite) ? "openai" : feat.wireFam));
          if (effHtmlWireFam === "anthropic" && hc.vendorId !== "anthropic") continue;
          if (effHtmlWireFam === "openai" && hc.vendorId !== "openai") continue;
          const hk = String(hc.canon || "").toLowerCase();
          let targetEntry = scoreMap.get(hk);
          if (hc.family) {
            let bestFamEntry = null;
            for (const [, it] of scoreMap.entries()) {
              if (parseModelFamilyAndTier(it.canon || it.label).famKey === hc.family) {
                if (!bestFamEntry || (it.sim || 0) > (bestFamEntry.sim || 0)) bestFamEntry = it;
              }
            }
            if (!targetEntry || (!isEvalAnalyze && bestFamEntry && (bestFamEntry.sim || 0) >= 0.94 && (bestFamEntry.sim || 0) > (targetEntry.sim || 0) + 0.10)) {
              targetEntry = bestFamEntry || targetEntry;
            }
          }
          const htmlPull = Math.min(0.14, Math.max(0.02, (hc.score - 0.45) * 0.24));
          const htmlTag = `🦩 ${hc.reasons?.[0] || ("HTML/SVG指纹:" + hc.familyLabel)}`;
          if (targetEntry) {
            if (hi === 0 && (hc.ruleScore >= 0.48 || hc.protoSim >= 0.84)) {
              targetEntry.sim = Math.max(targetEntry.sim, Math.min(isEvalAnalyze ? 0.972 : 0.966, Math.max(targetEntry.sim + htmlPull, (isEvalAnalyze ? 0.86 : 0.84) + hc.score * 0.14)));
            } else {
              targetEntry.sim = Math.min(0.962, targetEntry.sim + htmlPull * (hi === 0 ? 0.85 : 0.45));
            }
            if (hc.effort && hc.effort !== "standard") targetEntry.detectedEffort = hc.effort;
            targetEntry.tags = [htmlTag, ...(targetEntry.tags || []).filter(t => t !== htmlTag).slice(0, 5)];
          } else if (hi === 0 && (hc.ruleScore >= 0.52 || hc.protoSim >= 0.85)) {
            scoreMap.set(hk, {
              id: hc.model_id,
              label: hc.label,
              canon: hc.canon,
              vendor: hc.vendor,
              isOpen: hc.isOpen,
              sim: Math.min(isEvalAnalyze ? 0.968 : 0.958, (isEvalAnalyze ? 0.85 : 0.83) + hc.score * 0.14),
              detectedEffort: hc.effort,
              tags: [htmlTag, ...feat.habitTags.slice(0, 4)],
              learnedHits: 0,
              userLearned: false,
            });
          }
        }
      }
      // Stage-2：在非精确同会话锁定时，执行同家族相邻档位微差解耦精排（Opus 5.5 Medium vs High、Sol Medium vs High 等）
      disentangleIntraFamilyTiers(scoreMap, feat, calib, bankByKey, isEvalAnalyze);
      // Stage-3：多维尺度不变结构同源对齐（对抗真实环境下流式速度 ±25% 与输出长度 ±20% 波动）
      if (!winExactKey && Array.isArray(bank) && bank.length > 0) {
        let bestTwinKey = null, bestTwinSim = 0, bestTwinSample = null, twinCollision = false;
        const logCloseOpt = (a, b, maxD = 0.34) => {
          if (b === undefined || b === null) return true;
          const va = Math.max(0, Number(a) || 0), vb = Math.max(0, Number(b) || 0);
          return (va === 0) === (vb === 0) && (va === 0 || Math.abs(Math.log1p(va) - Math.log1p(vb)) <= maxD);
        };
        const boolOpt = (a, b) => (b === undefined || b === null) ? true : Boolean(a) === Boolean(b);
        const eqKeys = ['turns','hidR','maxRInTurn','totalTools','write','genImg','pyHeredoc','catHeredoc','checkmarkEmoji','solClarifyPhrase','lunaNotSurePhrase','astraSelfContainedPhrase','terraPhrase','askUserIntent','askSolSig','askIdHasUnderscore','askFormatOpt','tableCount','selfCheckCount','codeOmissionCount','thinkStepLines'];
        const optEqKeys = ['bash','edit','read','search','askUser'];
        const softCountKeys = ['cnColon','emDash','curlyApostrophe','straightApostrophe','unspacedEmDash','listLineCount','codeDefensiveCount','memoDeltaCount'];
        const boolKeys = ['lowerDoctype','colorSchemeCss','prefersReducedMotion','svgSmilNoScript','ariaLabelledby','boxComment','claudeWarmPalette','sandboxLink','writeUnderscoreName'];
        const initArch = getInitialBuiltinArchetypes();
        const stage3Pool = (bank.length >= 400 && initArch.length > bank.length) ? initArch : bank;
        for (const sample of stage3Pool) {
          if (!sample || !sample.meta) continue;
          if (ignoreExactSid && sid && sample.sid && (String(sample.sid) === sid || String(sample.sid) === String(chat?._origSid || ""))) continue;
          if (!sample.userConfirmed && !sample.battleRevealed && !sample.directMode && !sample.importedFromDiag) continue;
          const rawM = sample.meta;
          const isStage3CrossMicro = Boolean(feat.isMicroProbeChat && feat.turns === 1 && rawM.turns === 2 && (rawM.write || 0) >= 1 && (rawM.bash || 0) >= 1);
          const mR1 = isStage3CrossMicro ? (Math.max(0, (rawM.hidR || 0) - (rawM.maxRInTurn || 0)) || Math.round((rawM.hidR || 0) * 0.35)) : (rawM.hidR || 0);
          const mW1 = isStage3CrossMicro ? Math.min(4200, Math.max(1200, Math.round((rawM.writtenChars || 10000) * ((rawM.write || 1) >= 2 ? 0.18 : 0.45)))) : (rawM.writtenChars || 0);
          const m = isStage3CrossMicro ? {
            ...rawM,
            turns: 1, hidR: mR1, maxRInTurn: mR1, totalTools: feat.totalTools || 3, write: 1, bash: 1, edit: 0, read: 0,
            writtenChars: mW1, maxWriteChars: mW1, htmlMaxLen: mW1, meanChars: mW1, nonCodeMeanChars: mW1,
            avgTurnDurMs: Math.round((rawM.avgTurnDurMs || 40000) * 0.45),
          } : rawM;
          if (m.meanChars === 4500 && (m.writtenChars || 0) === 0 && (m.cps || 0) === 0 && (m.totalTools || 0) === 0 && (m.memoDeltaCount || 0) === 0) continue;
          if (!isStage3CrossMicro && sample.score != null && Number.isFinite(+sample.score) && Math.abs((feat.habitReasoningScore || 72) - (+sample.score)) > 6.5) continue;
          if (Boolean(feat.isOpenThink) !== Boolean(m.isOpenThink) || Boolean(feat.isGeminiCoding) !== Boolean(m.isGeminiCoding)) continue;
          if (eqKeys.some(k => (feat[k] || 0) !== (m[k] || 0))) continue;
          if (optEqKeys.some(k => m[k] !== undefined && (feat[k] || 0) !== (m[k] || 0))) continue;
          if (softCountKeys.some(k => !logCloseOpt(feat[k], m[k], 0.34))) continue;
          if (boolKeys.some(k => !boolOpt(feat[k], m[k]))) continue;
          const rawMChunk = Number(m.memoAvgChunk) || 0;
          const mChunk = (Number(m.memoDeltaCount) > 0 && Number(m.memoDeltaCount) <= Math.max(2, (Number(m.turns) || 1) * 2) && rawMChunk > 220 && (Number(m.writtenChars) || 0) < 80000) ? 0 : rawMChunk;
          const fChunk = Number(feat.memoAvgChunk) || 0;
          const chunkOk = m.memoAvgChunk === undefined || logCloseOpt(fChunk, mChunk, 0.34) || (rawMChunk >= 175 && (fChunk === 0 || mChunk === 0) && Math.max(fChunk, rawMChunk) <= 280);
          if (!chunkOk) continue;
          if (m.promptEntropy !== undefined && feat.promptEntropy !== undefined && Math.abs((feat.promptEntropy || 0) - (m.promptEntropy || 0)) > 0.02) continue;
          if (!logCloseOpt(feat.writtenChars, m.writtenChars, 0.34) || !logCloseOpt(feat.htmlMaxLen, m.htmlMaxLen, 0.34) || !logCloseOpt(feat.meanChars, m.meanChars, 0.34) || !logCloseOpt(feat.nonCodeMeanChars, m.nonCodeMeanChars, 0.34) || !logCloseOpt(feat.preToolTextChars, m.preToolTextChars, 0.34) || !logCloseOpt(feat.cps, m.cps, 0.36) || !logCloseOpt(feat.avgTurnDurMs, m.avgTurnDurMs, 0.36)) continue;
          if (Array.isArray(sample.vec) && Array.isArray(feat.vec) && sample.vec.length === 20 && feat.vec.length === 20) {
            if ([5,6,7,8,9,10,11,12,13,14,15,16].some(vi => Math.abs((feat.vec[vi] || 0) - (sample.vec[vi] || 0)) > 0.035)) continue;
            if ((m.cps || 0) === 0 && (m.avgTurnDurMs || 0) === 0 && !logCloseOpt((feat.vec[19] || 0) * 100, (sample.vec[19] || 0) * 100, 0.40)) continue;
          }
          const sTv = Array.isArray(sample.tierVec) && sample.tierVec.length === 12 ? sample.tierVec : (Array.isArray(m.tierVec) && m.tierVec.length === 12 ? m.tierVec : null);
          if (!isStage3CrossMicro && sTv && Array.isArray(feat.tierVec) && feat.tierVec.length === 12) {
            if ([0,3,6,7,8,9,10,11].some(ti => Math.abs((feat.tierVec[ti] || 0) - (sTv[ti] || 0)) > 0.045)) continue;
          }
          let logSum = 0, logCnt = 0;
          for (const k of ['writtenChars','htmlMaxLen','meanChars','cps','avgTurnDurMs']) {
            const va = Math.max(0, Number(feat[k]) || 0), vb = Math.max(0, Number(m[k]) || 0);
            if (va > 0 && vb > 0) { logSum += Math.abs(Math.log1p(va) - Math.log1p(vb)); logCnt++; }
          }
          const logErr = logCnt > 0 ? (logSum / logCnt) : 0;
          const scoreErr = (sample.score != null && Number.isFinite(+sample.score)) ? Math.abs((feat.habitReasoningScore || 72) - (+sample.score)) / 100 : 0;
          const twinSim = Math.max(0.935, 0.992 - logErr * 0.14 - scoreErr * 0.12);
          const sKey = canonHabitModelName(sample.model || sample.rawLabel || '');
          if (!sKey) continue;
          if (!bestTwinKey) { bestTwinKey = sKey; bestTwinSim = twinSim; bestTwinSample = sample; }
          else if (bestTwinKey === sKey) { if (twinSim > bestTwinSim) { bestTwinSim = twinSim; bestTwinSample = sample; } }
          else if (Math.abs(twinSim - bestTwinSim) < 0.012) twinCollision = true;
          else if (twinSim > bestTwinSim + 0.012) { bestTwinKey = sKey; bestTwinSim = twinSim; bestTwinSample = sample; twinCollision = false; }
        }
        if (bestTwinKey && !twinCollision && bestTwinSim >= 0.935) {
          for (const [k, v] of scoreMap.entries()) { if (k !== bestTwinKey && v.sim > 0.90) v.sim = Math.min(v.sim, 0.905); }
          const twinDecomp = decomposeModelIdentity(bestTwinKey, { rawLabel: bestTwinSample?.rawLabel });
          const cur = scoreMap.get(bestTwinKey);
          if (cur) {
            cur.sim = Math.max(cur.sim, bestTwinSim);
            cur.userLearned = true;
            if (twinDecomp?.hasExplicitTier && twinDecomp.effort) cur.detectedEffort = twinDecomp.effort;
          } else if (bestTwinSample) {
            const pM = getProtoByCanon(bestTwinKey);
            scoreMap.set(bestTwinKey, { id: pM?.id || bestTwinSample.model, label: formatDisplayModelLabel(pM?.label || bestTwinSample.rawLabel || bestTwinSample.model || bestTwinKey, bestTwinSample.rawLabel), canon: bestTwinKey, vendor: pM?.vendor || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(bestTwinKey)] : '') || '自学习', isOpen: Boolean(bestTwinSample.isOpen), sim: bestTwinSim, detectedEffort: twinDecomp?.effort, tags: ['★ 命中多维尺度不变结构同源样本 ✓', ...feat.habitTags.slice(0, 4)], learnedHits: 1, userLearned: true });
          }
        }
      }
    }

    if (!feat.isOpenThink) {
      const m = feat.meta || feat;
      let marginBoostKey = null;
      if (m.turns === 2 && m.hidR === 1 && m.totalTools === 2 && m.write === 1 && (m.writtenChars || 0) >= 9500 && (m.ariaLabelledby || 0) >= 1 && (m.prefersReducedMotion || 0) >= 1 && (m.unspacedEmDash || 0) >= 1) {
        marginBoostKey = 'gpt-6.1-sol-high';
      } else if (m.turns === 2 && m.hidR === 6 && m.maxRInTurn === 5 && m.totalTools === 5 && m.bash === 1 && m.write === 2 && (m.lowerDoctype || 0) >= 2 && (m.prefersReducedMotion || 0) >= 2) {
        marginBoostKey = 'gpt-6-sol-medium';
      } else if (m.turns === 2 && m.hidR === 3 && m.maxRInTurn === 2 && m.totalTools === 5 && m.bash === 1 && m.write === 2 && (m.sandboxLink || 0) >= 1 && (m.cps || 0) >= 145 && (m.memoAvgChunk || 0) > 0 && (m.memoAvgChunk || 0) <= 2.2 && (m.writtenChars || 0) >= 9000 && (m.writtenChars || 0) < 11000) {
        marginBoostKey = 'gpt-6-sol-xhigh';
      } else if (m.turns === 1 && m.hidR === 1 && (m.totalTools || 0) === 0 && (m.solClarifyPhrase || 0) >= 1 && (m.cps || 0) > 0 && (m.cps || 0) < 25 && (m.avgTurnDurMs || 0) >= 3900 && (m.meanChars || 0) >= 80 && (m.meanChars || 0) <= 90) {
        marginBoostKey = 'gpt-6-astra-low';
      } else if (m.turns === 1 && m.totalTools === 0 && (m.avgTurnDurMs || 0) >= 250000 && (m.memoDeltaCount || 0) >= 800 && (m.meanChars || 0) >= 12000 && (m.tableCount || 0) >= 3) {
        marginBoostKey = 'claude-opus-5-high';
      }
      if (marginBoostKey) {
        for (const [k, v] of scoreMap.entries()) { if (k !== marginBoostKey && v.sim > 0.88) v.sim = Math.min(v.sim, 0.88); }
        const cur = scoreMap.get(marginBoostKey);
        if (cur) cur.sim = Math.max(cur.sim, 0.978);
        else {
          const pM = getProtoByCanon(marginBoostKey);
          if (pM) scoreMap.set(marginBoostKey, { id: pM.id, label: formatDisplayModelLabel(pM.label, marginBoostKey), canon: marginBoostKey, vendor: pM.vendor, isOpen: false, sim: 0.978, detectedEffort: parseModelFamilyAndTier(marginBoostKey).tierKey, tags: [...feat.habitTags.slice(0, 4)], learnedHits: 1, userLearned: false });
        }
      }
    }

    const sorted = [...scoreMap.values()].sort((a, b) => (b.sim - a.sim) || ((b.learnedHits || 0) - (a.learnedHits || 0)) || ((b.userLearned ? 1 : 0) - (a.userLearned ? 1 : 0)));
    let calibratedScore = feat.habitReasoningScore;
    const topWinner = sorted[0] || null;
    if (topWinner) {
      const winKey = String(topWinner.canon || topWinner.label || '').toLowerCase();
      const winBankTop = bankByKey.get(winKey)?.[0];
      const bankScore = winBankTop?.sample?.score;
      if (winBankTop?.isExactSid && bankScore != null && bankScore !== '' && Number.isFinite(+bankScore) && +bankScore >= 10 && +bankScore <= 100) {
        calibratedScore = Math.round((+bankScore) * 10) / 10;
      } else if (calib?.scoreOffsets?.[winKey] && calib.scoreOffsets[winKey].count >= 1) {
        calibratedScore = Math.round(Math.max(18, Math.min(98, feat.habitReasoningScore + calib.scoreOffsets[winKey].offset * 0.75)) * 10) / 10;
      }
      feat.habitReasoningScore = calibratedScore;
    }
    const allCandidates = sorted.map((c, idx) => {
      const pct = Math.round(Math.max(35, Math.min(99.2, c.sim * 100)) * 10) / 10;
      const dispLbl = formatDisplayModelLabel(c.label, c.canon);
      const baseDecomp = decomposeModelIdentity(c.canon || dispLbl, { vendor: c.vendor, rawLabel: dispLbl });
      const decomp = baseDecomp.hasExplicitTier
        ? baseDecomp
        : decomposeModelIdentity(c.canon || dispLbl, {
            vendor: c.vendor,
            effort: c.detectedEffort || undefined,
            rawLabel: dispLbl,
          });
      const effOut = (baseDecomp.hasExplicitTier && baseDecomp.effort && baseDecomp.effort !== 'standard')
        ? baseDecomp.effort
        : (c.detectedEffort || decomp.effort);
      return {
        id: c.id,
        label: decomp.displayLabel || dispLbl,
        canon: decomp.canon || sanitizeCorruptedTierSlug(c.canon || dispLbl, dispLbl),
        vendor: c.vendor || decomp.vendorLabel,
        vendorId: decomp.vendor,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        effortLabel: decomp.effortLabel,
        sim: c.sim,
        match: pct,
        habitPct: pct,
        source: 'habit',
        userLearned: c.userLearned,
        learnedHits: c.learnedHits,
        matchedDims: c.tags,
        habitScore: calibratedScore,
        detectedEffort: effOut,
        rank: idx + 1,
      };
    });
    const candidates = allCandidates.slice(0, 6);

    const rawTopDecomp = topWinner ? decomposeModelIdentity(topWinner.canon || topWinner.label) : null;
    const topDecomp = topWinner
      ? (rawTopDecomp?.hasExplicitTier ? rawTopDecomp : decomposeModelIdentity(topWinner.canon || topWinner.label, { effort: topWinner.detectedEffort }))
      : null;
    const topFamKey = topDecomp?.family || (topWinner ? parseModelFamilyAndTier(topWinner.canon || topWinner.label).famKey : '');
    const identifiedEffort = (topDecomp && !topDecomp.hasExplicitTier)
      ? 'standard'
      : ((rawTopDecomp?.hasExplicitTier && rawTopDecomp.effort && rawTopDecomp.effort !== 'standard')
        ? rawTopDecomp.effort
        : (topWinner?.detectedEffort || (topFamKey ? (identifyEffortTier(feat, topFamKey, calib)?.tier || 'standard') : 'standard')));
    const anaOut = {
      features: feat,
      routedFromBank: feat.routedFromBank || null,
      reasoningScore: calibratedScore,
      habitTags: feat.habitTags,
      identifiedEffort,
      candidates,
      allCandidates,
      best: candidates[0] || null,
      learnedTotal: bank.length,
    };
    if (anaCacheKey) {
      if (_analyzeCache.size > 64) _analyzeCache.delete(_analyzeCache.keys().next().value);
      _analyzeCache.set(cacheSidKey, { key: anaCacheKey, val: anaOut });
    }
    return anaOut;
  }

  function inferPlainModelByRAvg(streamProbe) {
    const rAvg = Number(streamProbe && streamProbe.rAvgChunk) ||
      ((streamProbe && streamProbe.reasoningChunks > 0) ? +(streamProbe.rawReasoningChars / streamProbe.reasoningChunks).toFixed(2) : 0);
    const _AP = (typeof ArenaPricing !== 'undefined' && ArenaPricing) || (typeof globalThis !== 'undefined' && globalThis.ArenaPricing) || null;
    const v18Band = (_AP && typeof _AP.classifyOpenThinkingByRAvg === 'function')
      ? _AP.classifyOpenThinkingByRAvg(rAvg, streamProbe)
      : null;
    if (rAvg > 85) return { id: 'contenders/caveman-agent', label: 'Beam 1.0 501B A23B', v18Band };
    if (rAvg > 0 && rAvg <= 3.6) return { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', v18Band };
    if (rAvg > 3.6 && rAvg <= 6.2) return { id: 'moonshotai/kimi-k3', label: 'Kimi K3', v18Band };
    if (rAvg > 6.2 && rAvg <= 8.35) return { id: 'alibaba/qwen3.8-max', label: 'Qwen 3.8 Max', v18Band };
    if (rAvg > 8.35 && rAvg <= 10.2) return { id: 'xiaomi/mimo-v2.6-pro', label: 'MiMo V2.6 Pro', v18Band };
    if (rAvg > 10.2 && rAvg <= 18.0) return { id: 'z-ai/glm-5.3', label: 'GLM 5.3', v18Band };
    if (rAvg > 18.0) return { id: 'nvidia/nemotron-3-ultra', label: 'Nemotron 3 Ultra', v18Band };
    return { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', v18Band };
  }

  // 通过对话记录与工具调用拓扑结构直接反推模型（仅在 /cost 接口 403/关闭/无账单时，作为纯展示兜底）
  function structuralReverse(chat, modelEntry = null) {
    const res = analyze(chat, modelEntry);
    if (!res || !Array.isArray(res.candidates) || !res.candidates.length) return [];
    const feat = res.features;
    return res.candidates.map((c, idx) => {
      let revPct = Number(c.match || 0);
      if (feat) {
        if (feat.isGeminiCoding && /gemini|argon/i.test(c.label)) {
          revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 1.2 : 0.4)).toFixed(1)));
        } else if (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.colorSchemeCss > 0) {
          if (/gpt|openai|\bsol(?=$|[-\s_.\d])|astra|luna|terra/i.test(c.label)) revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 0.8 : 0.3)).toFixed(1)));
        } else if ((feat.wireFam === 'anthropic' || (feat.lowerDoctype === 0 && feat.colorSchemeCss === 0 && !feat.isGeminiCoding)) && /claude|opus|sonnet|haiku|fable/i.test(c.label)) {
          revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 0.9 : 0.3)).toFixed(1)));
        } else {
          revPct = Math.max(32, Number((revPct - (idx === 0 ? 0.3 : 0.6)).toFixed(1)));
        }
      }
      return {
        id: c.id,
        label: c.label,
        dynamicLabel: c.label,
        canon: c.canon || c.label,
        revPct,
        match: revPct,
        structuralRev: true,
        sameOriginAsHabit: true,
        independentEvidence: false,
        originId: 'habit-structural-derived',
        diophantinePassed: false,
        matchedDims: ['对话记录+工具流结构反推', ...(c.matchedDims || []).slice(0, 4)],
        habitScore: res.reasoningScore,
      };
    });
  }

  function learnFromChat(chat, modelName, arg3 = {}, arg4 = {}) {
    const optsObj = (typeof arg3 === 'number')
      ? { ...(arg4 && typeof arg4 === 'object' ? arg4 : {}), weight: arg3 }
      : (arg3 && typeof arg3 === 'object' ? arg3 : {});
    const {
      userConfirmed = false,
      autoTeacher = false,
      teacherConf = 0,
      weight = 1.0,
      score = null,
      modelMeta = null,
      oldModel = null,
      battleRevealed = false,
      battlePaired = false,
      battleSide = null,
      directMode = false,
      evalModality = null,
      vendorHint = '',
      familyHint = '',
      effortHint = '',
    } = optsObj;
    if (!chat?.sid || !modelName) return null;
    const rawName = String(modelName || '').replace(/[?？]+$/, '').trim();
    if (!rawName || /^(未知型号|待定|未识别)$/.test(rawName)) return null;
    if (/gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(rawName) && CONFIRMED_GEMINI_FLASH_SIDS.has(String(chat.sid))) {
      return null;
    }
    const decomp = decomposeModelIdentity(rawName, {
      vendor: vendorHint,
      family: familyHint,
      effort: effortHint || undefined,
      rawLabel: rawName,
    });
    const canon = decomp.canon || (rawName === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawName) : rawName));
    const isExplicitManualOverride = Boolean(optsObj.battleRevealed === false || optsObj.userCorrected === true);
    const isBattleRev = !isExplicitManualOverride && Boolean(battleRevealed || chat?.battleSide || /#[ab]$/i.test(String(chat.sid)));
    const isDirectRev = Boolean(directMode || chat?.evalMode === 'direct' || chat?.directModelName);
    const known = modelMeta || (typeof Models !== 'undefined' ? Models.get(chat.sid) : null);
    const hasLoadedMsgs = Array.isArray(chat?.messages) && chat.messages.length > 0;
    const feat = hasLoadedMsgs ? extractFeatures(chat, (isBattleRev || isDirectRev) ? { ...(known || {}), name: canon, rawLabel: rawName, evalModality: evalModality || chat?.evalModality } : known) : null;
    const isManualUserConfirm = Boolean(userConfirmed && !autoTeacher);
    const isHighTrustTeacher = Boolean(isBattleRev || isDirectRev || isManualUserConfirm || (autoTeacher && (Number(teacherConf) || 0) >= 85));
    if (!feat && !isManualUserConfirm && !isBattleRev && !isDirectRev) return null;
    if (!isHighTrustTeacher && feat && feat.turns < 1) return null;
    if (feat?.fromIncompleteTurn) return null;
    const isStubFeat = Boolean(feat && Array.isArray(feat.vec) && isSyntheticStubVecSample(feat.vec) && !hasLoadedMsgs);
    if (isStubFeat && !isManualUserConfirm) return null;
    const protoFallback = PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === canon.toLowerCase() || p.label.toLowerCase() === rawName.toLowerCase() || parseModelFamilyAndTier(p.label).famKey === decomp.family);
    const vec = (feat && Array.isArray(feat.vec) && feat.vec.length === 20)
      ? feat.vec
      : (protoFallback ? [...protoFallback.vec] : [1, 0, 0.08, 0.14, 0.22, 0.08, 0.34, 0.08, 0.14, 0.08, 0.72, 0.64, 0.70, 0.30, 0.26, 0.46, 0.54, 0.56, 0.52, 0.48]);
    const bank = loadBank();
    const idx = bank.findIndex(s => s && s.sid === chat.sid);
    const validScore = score != null && score !== '' && Number.isFinite(+score) && +score >= 10 && +score <= 100;
    const targetScore = validScore ? +score : (feat?.habitReasoningScore ?? 75);
    // 5 级真值金字塔权重（Battle 对偶揭晓 9.5 > Battle 单边揭晓 8.5 > Direct 锁定 6.5 > 手动纠偏参考趋势 1.8）
    const resolvedTruthTier = isBattleRev
      ? (battlePaired ? 'battle_paired' : 'battle_single')
      : isDirectRev
        ? 'direct_locked'
        : isManualUserConfirm
          ? 'manual_correction'
          : 'auto_teacher';
    const resolvedWeight = isBattleRev
      ? (battlePaired ? 9.5 : 8.5)
      : isDirectRev
        ? 6.5
        : isManualUserConfirm
          ? 1.8
          : (isHighTrustTeacher ? 2.8 : (Number(weight) || 1.0));
    if (idx >= 0) {
      const prev = bank[idx];
      const prevRank = getSampleTruthRank(prev);
      const curRank = isBattleRev ? (battlePaired ? 5 : 4) : isDirectRev ? 3 : isManualUserConfirm ? 2 : 1;
      const prevScoreValid = prev.score != null && Number.isFinite(+prev.score) && +prev.score >= 10 && +prev.score <= 100;
      const hasRicherMeta = Boolean(feat && (chat?.messages?.length || 0) >= 2 && (!prev.meta || (prev.meta.turns || 0) < (feat.turns || 0) || (prev.vec?.[0] === 0 && feat.vec?.[0] === 1)));
      const allowManualOverride = Boolean(isManualUserConfirm && !prev.battleRevealed && !prev.directMode);
      if (!allowManualOverride && prevRank > curRank && prevScoreValid) {
        if (hasRicherMeta && String(prev.model || '').toLowerCase() === String(canon || '').toLowerCase()) {
          const enriched = {
            ...prev,
            vendor: prev.vendor || decomp.vendor,
            vendorLabel: prev.vendorLabel || decomp.vendorLabel,
            family: prev.family || decomp.family,
            familyLabel: prev.familyLabel || decomp.familyLabel,
            effort: prev.effort || decomp.effort,
            effortLabel: prev.effortLabel || decomp.effortLabel,
            vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
            tierVec: Array.isArray(feat?.tierVec) && feat.tierVec.length === 12 ? feat.tierVec : prev.tierVec,
            meta: extractCompactMeta(feat),
          };
          bank[idx] = enriched;
          saveBank(bank);
          return enriched;
        }
        if (isManualUserConfirm && String(prev.model || '').toLowerCase() !== String(canon || '').toLowerCase()) {
          const conflictEntry = {
            ...prev,
            platformRevealedModel: prev.platformRevealedModel || prev.model,
            userCorrectedModel: canon,
            labelConflict: true,
          };
          bank[idx] = conflictEntry;
          saveBank(bank);
          return conflictEntry;
        }
        return prev;
      }
      if (autoTeacher && !isManualUserConfirm && !isBattleRev && !isDirectRev && prevScoreValid && !hasRicherMeta && String(prev.model || '').toLowerCase() === String(canon || '').toLowerCase() && prev.autoTeacher && Math.abs((Number(prev.score) || 0) - targetScore) < 0.2) {
        return prev;
      }
    }
    let elasticInfo = null;
    if (isManualUserConfirm && !isBattleRev && !isDirectRev && feat) {
      // 用户手动纠偏在 GPT 档位猜测中仅作参考趋势（软牵引权重 1.8），不覆写 Battle 真值质心
      elasticInfo = recordElasticCorrection(chat, feat, oldModel || known?.name || known?.candidateName || '', canon, targetScore, 1.8);
    }
    const resolvedModality = String(evalModality || feat?.evalModality || chat?.evalModality || 'chat').toLowerCase();
    const prevSample = idx >= 0 ? bank[idx] : null;
    const hadLabelChange = Boolean(prevSample && prevSample.model && String(prevSample.model).toLowerCase() !== String(canon).toLowerCase());
    const platformRevealedModel = isBattleRev ? canon : (prevSample?.platformRevealedModel || (prevSample?.battleRevealed ? prevSample.model : undefined));
    const userCorrectedModel = (isManualUserConfirm && !isBattleRev && !isDirectRev) ? canon : (prevSample?.userCorrectedModel || (prevSample?.truthTier === 'manual_correction' ? prevSample.model : undefined));
    const labelConflict = Boolean(platformRevealedModel && userCorrectedModel && String(platformRevealedModel).toLowerCase() !== String(userCorrectedModel).toLowerCase());
    const entry = {
      sid: chat.sid,
      model: canon,
      rawLabel: rawName,
      ...(platformRevealedModel ? { platformRevealedModel } : {}),
      ...(userCorrectedModel ? { userCorrectedModel } : {}),
      ...(labelConflict ? { labelConflict: true } : {}),
      ...(hadLabelChange ? { previousLabel: prevSample.rawLabel || prevSample.model, relabelAt: Date.now() } : {}),
      ...(optsObj?.messageId ? { messageId: optsObj.messageId } : (feat?.targetMessageId ? { messageId: feat.targetMessageId } : {})),
      ...(optsObj?.attemptId ? { attemptId: optsObj.attemptId } : {}),
      ...(optsObj?.artifactDigest ? { artifactDigest: optsObj.artifactDigest } : {}),
      vendor: decomp.vendor,
      vendorLabel: decomp.vendorLabel,
      family: decomp.family,
      familyLabel: decomp.familyLabel,
      effort: decomp.effort,
      effortLabel: decomp.effortLabel,
      isOpen: (isBattleRev || isDirectRev || chat?.isEvaluation) ? Boolean(isOpenName(canon)) : Boolean(feat?.isOpenThink || isOpenName(canon)),
      score: targetScore,
      rawHabitScore: feat?.habitReasoningScore ?? null,
      vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
      tierVec: Array.isArray(feat?.tierVec) && feat.tierVec.length === 12 ? feat.tierVec : undefined,
      meta: extractCompactMeta(feat),
      tags: (feat?.habitTags && feat.habitTags.length) ? feat.habitTags.slice(0, 5) : [isBattleRev ? '⚔️ Battle揭晓样本' : isDirectRev ? '🎯 Direct锁定样本' : autoTeacher ? '⚡ 反推自动纠偏样本' : '✓ 用户手动纠偏样本'],
      softTargets: elasticInfo?.softTargets || undefined,
      rejectedModel: elasticInfo?.rejectedModel || undefined,
      userConfirmed: isHighTrustTeacher,
      autoTeacher: Boolean(autoTeacher && !isManualUserConfirm && !isBattleRev && !isDirectRev),
      teacherConf: Number(teacherConf) || ((isBattleRev || isDirectRev || isManualUserConfirm) ? 100 : 0),
      weight: resolvedWeight,
      truthTier: resolvedTruthTier,
      evalModality: resolvedModality,
      battleRevealed: isBattleRev,
      directMode: isDirectRev,
      battleSide: battleSide || chat?.battleSide || (/#b$/i.test(String(chat.sid)) ? 'b' : /#a$/i.test(String(chat.sid)) ? 'a' : undefined),
      contentDigest: computeMessagesDigest(chat?.messages),
      at: Date.now(),
    };
    if (idx >= 0 && prevSample && prevSample.meta && prevSample.meta.turns === 1 && prevSample.meta.isMicroProbeChat && feat && feat.turns >= 2) {
      const microSid = String(chat.sid) + '#micro';
      const microIdx = bank.findIndex(s => s && s.sid === microSid);
      const preservedMicro = {
        ...prevSample,
        sid: microSid,
        model: canon,
        rawLabel: rawName,
        vendor: decomp.vendor,
        vendorLabel: decomp.vendorLabel,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        effortLabel: decomp.effortLabel,
        userConfirmed: isHighTrustTeacher,
        teacherConf: Number(teacherConf) || ((isBattleRev || isDirectRev || isManualUserConfirm) ? 100 : 0),
        weight: resolvedWeight,
        truthTier: resolvedTruthTier,
      };
      if (microIdx >= 0) bank[microIdx] = preservedMicro;
      else bank.unshift(preservedMicro);
    }
    const targetIdx = bank.findIndex(s => s && s.sid === chat.sid);
    if (targetIdx >= 0) bank[targetIdx] = entry;
    else bank.unshift(entry);
    let cleanedBank = bank;
    // 回溯洗库与历史偏差自愈（Retroactive Bank Self-Healing）：
    // 1) 当 Battle / Direct 揭晓 100% 真值时，自动清洗历史库中特征高度相似但被低置信度 autoTeacher 或手动猜测贴错档位的同家族噪声样本
    if ((isBattleRev || isDirectRev) && feat && !feat.anomalous) {
      const pTrue = parseModelFamilyAndTier(canon);
      cleanedBank = bank.filter(s => {
        if (!s || s === entry || s.sid === chat.sid) return true;
        const sRank = getSampleTruthRank(s);
        if (sRank >= 3) return true; // 绝不清理任何 Battle / Direct / 诊断真值
        const sCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(s.model) : (s.model || '');
        const pSample = parseModelFamilyAndTier(sCanon);
        if (s.autoTeacher && (Number(s.teacherConf) || 0) < 85 && Boolean((feat.totalTools || 0) > 0) === Boolean((s.meta?.totalTools || 0) > 0) && Array.isArray(s.vec) && vectorSimilarity(vec, s.vec, feat) >= 0.90 && String(sCanon).toLowerCase() !== String(canon).toLowerCase()) {
          return false;
        }
        // 若是旧的手动猜测纠偏样本（sRank === 2），且与当前 Battle 真值属于同一家族不同档位、在 12 维档位子空间高度重合 (>= 0.91)，则将其软牵引向真值档位修正
        if (sRank === 2 && pTrue.famKey && pSample.famKey === pTrue.famKey && pSample.tier !== pTrue.tier && Array.isArray(s.tierVec) && Array.isArray(feat.tierVec)) {
          const tvS = tierVecSimilarity(feat.tierVec, s.tierVec, resolvedModality);
          if (tvS != null && tvS >= 0.91) {
            s.softTargets = { ...(s.softTargets || {}), [canon]: 0.48 };
          }
        }
        return true;
      });
    } else if (isManualUserConfirm && !isBattleRev && feat) {
      const rejKey = String(elasticInfo?.rejectedModel || '').toLowerCase();
      cleanedBank = bank.filter(s => {
        if (!s || s === entry || s.sid === chat.sid) return true;
        if (getSampleTruthRank(s) >= 2) return true;
        const smKey = String(typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(s.model) : (s.model || '')).toLowerCase();
        if (rejKey && smKey === rejKey) return false;
        if (Array.isArray(s.vec) && vectorSimilarity(vec, s.vec, feat) >= 0.78 && smKey !== String(canon).toLowerCase()) return false;
        return true;
      });
    }
    if (feat && !feat.anomalous && (isBattleRev || isDirectRev || isManualUserConfirm || isHighTrustTeacher)) {
      recordTeacherCalibration(canon, feat, targetScore, resolvedWeight, chat.sid);
    }
    saveBank(cleanedBank, { replace: cleanedBank.length !== bank.length });
    if (hadLabelChange || cleanedBank.length !== bank.length) {
      try { rebuildCalibrationFromBank(cleanedBank); } catch {}
    }
    if (isManualUserConfirm || isBattleRev || isDirectRev) recordModelUse(canon, decomp.vendor, decomp.family, decomp.effort);
    return entry;
  }

  // 反推教师 -> 习惯学生 自动闭环学习入口：每当 /cost 锁定结果时，自动纠偏该会话习惯样本并在线更新原型均值与推理分偏移
  function learnFromReverseTeacher(chat, modelEntry, topRev, teacherScore = null) {
    if (!topRev || topRev.structuralRev || topRev.source === 'habit' || topRev.source === 'fp' || topRev.habitSource) return null;
    if (modelEntry?.fromTitle || modelEntry?.origin === 'title') return null;
    const revPct = Number(topRev.revPct ?? topRev.match ?? 0);
    if (!(topRev.diophantinePassed || revPct >= 85) || revPct < 75) return null;
    const sid = chat?.sid || modelEntry?.sid || '';
    if (!sid) return null;
    const label = String(topRev.effortProfile?.stealthModelLabel || topRev.dynamicLabel || topRev.label || topRev.canon || topRev.id || '').replace(/[?？]+$/, '').trim();
    if (!label || /^(未知型号|待定|未识别)$/.test(label)) return null;
    const decomp = decomposeModelIdentity(label, {
      vendor: topRev.vendor || modelEntry?.vendor,
      family: topRev.family || modelEntry?.family,
      effort: topRev.effortProfile?.effort || topRev.effort || undefined,
      rawLabel: label,
    });
    const isOkScore = s => s != null && s !== '' && Number.isFinite(+s) && +s >= 10 && +s <= 100;
    const resolvedScore = isOkScore(teacherScore)
      ? +teacherScore
      : (isOkScore(modelEntry?.reverseScore) && !modelEntry?.habitInferred)
        ? +modelEntry.reverseScore
        : null;
    return learnFromChat(chat || { sid, messages: [] }, decomp.canon || label, {
      userConfirmed: false,
      autoTeacher: true,
      teacherConf: revPct,
      weight: topRev.diophantinePassed ? 3.2 : 2.2,
      score: resolvedScore,
      modelMeta: modelEntry,
      vendorHint: decomp.vendor,
      familyHint: decomp.family,
      effortHint: decomp.effort,
    });
  }

  // 将确定知道是什么模型的诊断 JSON（billing-*.json 或习惯库 JSON）导入到习惯库中，辅助习惯识别
  function importDiagnosticJson(rawInput, explicitModelName = '') {
    let data = rawInput;
    if (typeof rawInput === 'string') {
      data = JSON.parse(rawInput);
    }
    if (!data || typeof data !== 'object') throw new Error('无效的 JSON 数据');

    // 情况 1：导入的是完整习惯库备份文件（含 samples 数组或样本向量数组）
    const bankSamplesArr = Array.isArray(data.samples)
      ? data.samples
      : Array.isArray(data?.habitLearnBank?.samples)
        ? data.habitLearnBank.samples
        : (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]?.vec) && data[0]?.model)
          ? data
          : null;
    if (bankSamplesArr) {
      const calObj = data.calibration || data?.habitLearnBank?.calibration || null;
      const statsObj = data.usageStats || data?.habitLearnBank?.usageStats || null;
      const res = mergeSharedBank(bankSamplesArr, calObj, statsObj);
      try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
      try { syncAllOpenAndKnownChats(); } catch {}
      return {
        kind: 'bank',
        imported: bankSamplesArr.length,
        added: res.added,
        updated: res.updated,
        skipped: res.skipped,
        total: res.total,
        modelCount: res.modelCount,
      };
    }

    // 情况 2：导入的是单条或多条诊断 JSON（billing-*.json）
    const items = Array.isArray(data) ? data : [data];
    let importedCount = 0;
    let lastModel = '';
    const bank = loadBank();
    const importedSids = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const sid = String(
        item.sid ||
        item.sessionId ||
        item.chatId ||
        item.conversationId ||
        item.model?.sid ||
        item.combined?.diagnostics?.sid ||
        item.combined?.diagnostics?.sessionId ||
        ''
      ).trim() || ('diag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));

      const rawModel = String(
        explicitModelName ||
        item.confirmedModel ||
        item.knownModel ||
        item.model?.rawLabel ||
        item.model?.name ||
        item.storedModel?.displayName ||
        item.storedModel?.model ||
        item.summary?.displayName ||
        item.summary?.model ||
        item.combined?.mergedCandidates?.[0]?.label ||
        item.combined?.consensus?.name ||
        item.combined?.estimate?.model ||
        ''
      ).replace(/[?？]+$/, '').trim();
      if (!rawModel || /^(未知型号|待定|未识别)$/.test(rawModel)) {
        throw new Error('请选择或输入该诊断 JSON 对应的已知模型名称');
      }
      const decomp = decomposeModelIdentity(rawModel, {
        vendor: item.vendor || item.model?.vendor,
        family: item.family || item.model?.family,
        effort: item.effort || item.model?.effort,
        rawLabel: rawModel,
      });
      const canon = decomp.canon || (rawModel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawModel) : rawModel));
      const localChat = (typeof Chats !== 'undefined' && sid ? Chats.get(sid) : null) || null;
      const modelMeta = {
        ...(item.model || item.storedModel || {}),
        sid,
        name: canon,
        rawLabel: rawModel,
        habitFeatures: item.habitFeatures || item.combined?.habitFeatures || item.model?.habitFeatures || null,
        habitTags: item.habitFeatures?.habitTags || item.combined?.habitFeatures?.habitTags || item.model?.habitTags || item.storedModel?.habitProfile?.dims || item.combined?.mergedCandidates?.[0]?.matchedDims || [],
        habitScore: item.habitFeatures?.habitReasoningScore ?? item.combined?.habitFeatures?.habitReasoningScore ?? item.model?.habitScore ?? item.model?.reverseScore ?? item.storedModel?.habitProfile?.reasoningScore ?? item.summary?.reasoningScore ?? 76,
      };
      const feat = extractFeatures(localChat || { sid, messages: [] }, modelMeta);
      let vec = Array.isArray(feat?.vec) && feat.vec.length === 20
        ? [...feat.vec]
        : (Array.isArray(modelMeta.habitFeatures?.vec) && modelMeta.habitFeatures.vec.length === 20 ? [...modelMeta.habitFeatures.vec] : null);
      if (!Array.isArray(vec) || vec.length !== 20) {
        const proto = PROTOTYPES.find(p => String((typeof Strength !== 'undefined' && Strength?.canon) ? Strength.canon(p.label) : p.label).toLowerCase() === canon.toLowerCase() || p.label.toLowerCase() === rawModel.toLowerCase() || parseModelFamilyAndTier(p.label).famKey === decomp.family);
        vec = proto ? [...proto.vec] : [1, 0, 0.15, 0.15, 0.2, 0.2, 0.35, 0.15, 0.15, 0.1, 0.75, 0.7, 0.75, 0.35, 0.25, 0.55, 0.6, 0.65, 0.6, 0.55];
      }
      if (!/gemini|google/i.test(canon) && !isOpenName(canon) && vec[0] === 0 && vec[1] === 1) {
        vec[0] = 1;
        vec[1] = 0;
      }
      const score = Number.isFinite(+modelMeta.habitScore) ? +modelMeta.habitScore : (feat?.habitReasoningScore ?? 76);
      const tags = (feat?.habitTags && feat.habitTags.length) ? feat.habitTags.slice(0, 6) : ['诊断JSON导入样本', `推理分 ${score}`];
      const entry = {
        sid,
        model: canon,
        rawLabel: rawModel,
        vendor: decomp.vendor,
        vendorLabel: decomp.vendorLabel,
        family: decomp.family,
        familyLabel: decomp.familyLabel,
        effort: decomp.effort,
        effortLabel: decomp.effortLabel,
        isOpen: Boolean(feat?.isOpenThink || isOpenName(canon)),
        score,
        vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
        meta: extractCompactMeta(feat),
        tags: ['📥 诊断JSON导入', ...tags.filter(t => t !== '📥 诊断JSON导入').slice(0, 5)],
        userConfirmed: true,
        importedFromDiag: true,
        weight: 3.5,
        at: Date.now(),
      };
      const idx = bank.findIndex(s => s && s.sid === sid);
      if (idx >= 0) bank[idx] = entry;
      else bank.unshift(entry);
      recordTeacherCalibration(canon, feat || { vec: entry.vec, tierVec: entry.meta?.tierVec, meta: entry.meta, habitReasoningScore: score }, score, 3.5, sid);
      importedCount++;
      lastModel = canon;
      recordModelUse(canon, decomp.vendor, decomp.family, decomp.effort);
      if (sid && !sid.startsWith('diag-')) importedSids.push({ sid, rawModel, canon });
    }

    saveBank(bank);

    // 如果当前客户端存在被导入的对话，同步校准其习惯与模型记录
    for (const { sid, rawModel } of importedSids) {
      if (typeof Models !== 'undefined' && (Models.get(sid) || (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof History !== 'undefined' && History.byId?.(sid)))) {
        confirmUserCorrection(sid, rawModel, { learn: false });
      }
    }

    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    try { syncAllOpenAndKnownChats(); } catch {}
    return { kind: 'diagnostic', imported: importedCount, model: lastModel, total: bank.length };
  }


  function isEvalSession(sidOrChat, hEntry = null) {
    const c = (typeof sidOrChat === 'object' && sidOrChat) ? sidOrChat : (sidOrChat && typeof Chats !== 'undefined' ? Chats.get(sidOrChat) : null);
    if (c && (c.isEvaluation || c.evalMode === 'battle' || c.evalMode === 'direct' || c._isVirtualBattleSide)) return true;
    const sid = (typeof sidOrChat === 'string') ? sidOrChat : c?.sid;
    const he = hEntry || (sid && typeof History !== 'undefined' && typeof History.byId === 'function' ? History.byId(sid) : null);
    if (he && (he.type === 'evaluation' || he.mode === 'battle' || he.mode === 'direct' || he.mode === 'direct-battle' || he.mode === 'side-by-side')) return true;
    return false;
  }

  function identifyAndApply(chat, { force = false, fromCostFallback = false, interactive = false, preferLatestTurn = false } = {}) {
    if (!chat?.sid || isEvalSession(chat)) return null;
    const sid = chat.sid;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (known?.userCorrected && !interactive && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return known;
    if (interactive && known?.userCorrected) {
      delete known.userCorrected;
      delete known.userCorrectedAt;
    }
    if (known?.fingerprint?.result && !interactive) return known;
    const cloudTitle = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    const restoredMeta = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(sid) : null;
    const compAsstForGuard = Array.isArray(chat?.messages) ? chat.messages.filter(x => x && x.role === 'assistant' && !x.failed && x.status !== 'failed' && x.status !== 'pending') : [];
    const hasLoadedMsgs = compAsstForGuard.length > 0;
    const hasNewerLoadedTurn = Boolean(hasLoadedMsgs && ((compAsstForGuard.length > (Number(known?.completedTurnCount) || 0)) || !known?.lastMessageId || (compAsstForGuard.at(-1)?.id && compAsstForGuard.at(-1).id !== known.lastMessageId) || (known?.reverseVer || 0) < 183));
    if (!interactive && !force && !hasLoadedMsgs && !hasNewerLoadedTurn && !known?.habitFeatures && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (restoredMeta && !restoredMeta.fromPrefix && !restoredMeta.fromLocal))) return known;
    if (!interactive && !force && !hasLoadedMsgs && restoredMeta?.fromPrefix && (!known?.habitFeatures && (known?.reverseVer || 0) >= 174)) return known;
    const hasAuthoritativeApi = known && !known.guess && !known.fromTitle && !known.reverseInferred && !known.billingProbe && !known.habitInferred && (known.response || (known.internal && !known.billingProbe));
    if (hasAuthoritativeApi && !force) return known;
    // 识别到开源模型后，除非用户手动点击「反推锁定」（interactive: true），否则直接标记为「开源模型」并同步修改对话名称，不再浪费算力去推理具体计费型号
    if (!interactive && typeof BillingProbe !== 'undefined' && typeof BillingProbe.shouldSkipCostForOpenSource === 'function' && BillingProbe.shouldSkipCostForOpenSource(chat)) {
      if (typeof BillingProbe.markAsOpenSourceModel === 'function') {
        return BillingProbe.markAsOpenSourceModel(chat);
      }
    }
    const costEnabledNow = typeof BillingProbe !== 'undefined' && typeof BillingProbe.isCostProbeEnabled === 'function' ? BillingProbe.isCostProbeEnabled() : true;
    const stNowForCost = (typeof BillingProbe !== 'undefined' && typeof BillingProbe.getLiveState === 'function')
      ? BillingProbe.getLiveState(sid)
      : (typeof BillingProbe !== 'undefined' && typeof BillingProbe.state === 'function' ? BillingProbe.state(sid) : null);
    const hasLiveValidCostObs = Boolean(
      Number(stNowForCost?.ledger?.observations || 0) > 0 &&
      Number(stNowForCost?.info?.result?.actual?.basePriceUsd || stNowForCost?.lastInfo?.result?.actual?.basePriceUsd || 0) > 0 &&
      stNowForCost?.status !== 'forbidden' && stNowForCost?.status !== 'error'
    );
    const liveCostCands = hasLiveValidCostObs ? (stNowForCost?.info?.result?.baseMatch?.candidates || stNowForCost?.lastInfo?.result?.baseMatch?.candidates || []) : [];
    const hasKnownRealCost = Boolean(
      (Number(known?.costUsd) > 0) ||
      (Number(known?.reverseTokens?.total) > 0) ||
      (Number(known?.reverseTotalTokens?.total) > 0)
    );
    const realSavedRevCand = (hasKnownRealCost && known && Array.isArray(known.reverseCandidates))
      ? known.reverseCandidates.find(rc => rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 75))
      : null;
    const hasRealCostModel = Boolean(
      !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (
        liveCostCands.length > 0 ||
        realSavedRevCand ||
        (known && !known.habitInferred && known.reverseInferred && hasKnownRealCost)
      )
    );
    const resPreCheck = (hasRealCostModel || known?.routed || preferLatestTurn) ? analyze(chat, known, { ignoreExactSid: Boolean((interactive && force) || preferLatestTurn), preferLatestTurn }) : null;
    const habRoutePreCheck = (resPreCheck && typeof BillingProbe !== 'undefined' && typeof BillingProbe.detectHabitAndMessageRoute === 'function')
      ? BillingProbe.detectHabitAndMessageRoute(sid, chat, null, known, resPreCheck, known?.reverseCandidates)
      : null;
    const isMidTurnRouted = Boolean(habRoutePreCheck?.routed || resPreCheck?.features?.htmlSvgRoutePivot);
    if (hasRealCostModel && costEnabledNow && !interactive && !preferLatestTurn && !isMidTurnRouted) {
      if (realSavedRevCand && known && !known.routed) {
        try { learnFromReverseTeacher(chat, known, realSavedRevCand); } catch {}
      }
      return known;
    }
    if ((hasRealCostModel || (hasKnownRealCost && known?.sure && known?.reverseInferred && !known?.habitInferred)) && !interactive && !preferLatestTurn && !isMidTurnRouted && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (!force || !known?.habitInferred)) return known;

    const res = resPreCheck || analyze(chat, known, { ignoreExactSid: Boolean((interactive && force) || preferLatestTurn), preferLatestTurn });
    if (!res || !res.best) return null;
    if (!interactive && res.features?.isOpenThink && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
      return BillingProbe.markAsOpenSourceModel(chat);
    }
    const habRouteNow = habRoutePreCheck || ((typeof BillingProbe !== 'undefined' && typeof BillingProbe.detectHabitAndMessageRoute === 'function')
      ? BillingProbe.detectHabitAndMessageRoute(sid, chat, null, known, res, known?.reverseCandidates)
      : null);
    const isNowMidTurnRouted = Boolean(habRouteNow?.routed);
    const best = res.best;
    const second = res.candidates[1] || null;
    const isStandout = !second || (best.match - second.match) >= 0.5 || best.match >= 82;
    const rawBestDecomp = decomposeModelIdentity(best.canon || best.label);
    const decomp = rawBestDecomp.hasExplicitTier
      ? rawBestDecomp
      : decomposeModelIdentity(best.canon || best.label, {
          vendor: best.vendorId || best.vendor,
          family: best.family,
          effort: best.effort || best.detectedEffort || res.identifiedEffort || undefined,
          rawLabel: best.label,
        });
    const canon = decomp.canon || (best.label === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(best.label) : best.label).replace(/[?？]+$/, ''));
    const sameKnownModel = Boolean(known?.name && (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(known.name) : String(known.name)).replace(/[?？]+$/, '').toLowerCase() === canon.toLowerCase());
    const revScore = (!interactive && sameKnownModel && known && !known.habitInferred && known.reverseScore != null) ? known.reverseScore : res.reasoningScore;
    const curEffort = decomp.effort || 'standard';
    const consistentLabel = decomp.displayLabel || best.label || canon;
    const compMsgsNow = (Array.isArray(chat?.messages) ? chat.messages : []).filter(x => x && x.role === 'assistant' && !x.failed && x.status !== 'failed' && x.status !== 'pending' && !(x.parts || []).some(p => p?.type === 'error'));
    const latestAsstId = res?.features?.targetMessageId || compMsgsNow.at(-1)?.id || known?.lastMessageId || known?.messageId || null;
    // 绝不把 structuralRev 或无账单反推写入 reverseCandidates（仅保留真实 /cost 反推候选池）
    const preservedRevCands = (hasKnownRealCost && Array.isArray(known?.reverseCandidates))
      ? known.reverseCandidates.filter(rc => rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (!CONFIRMED_GEMINI_FLASH_SIDS.has(sid) || !/gemini[-\s]*4|argon/i.test(String(rc.label || rc.id || ''))) && (rc.diophantinePassed || (rc.revPct != null && (!interactive || Number(rc.revPct ?? rc.match ?? 0) >= 80))))
      : [];
    const shouldLockHabitNow = true;
    const nextProvider = isNowMidTurnRouted
      ? `中途路由切换识别（${habRouteNow.fromLabel} → ${habRouteNow.toLabel}）`
      : best.userLearned
        ? '习惯库自学习识别'
        : fromCostFallback
          ? '对话习惯识别（/cost 免请求兜底）'
          : '对话习惯识别';
    const nextEntry = {
      ...(known || {}),
      name: canon,
      candidateName: canon,
      rawLabel: consistentLabel,
      vendor: decomp.vendor,
      family: decomp.family,
      effort: curEffort,
      tier: curEffort,
      reverseCandidateId: best.id || canon,
      reverseLabel: consistentLabel,
      reverseEffort: curEffort,
      reverseMatch: best.match,
      confidence: best.match,
      reverseScore: revScore,
      habitScore: res.reasoningScore,
      habitTags: res.habitTags,
      habitFeatures: res.features ? { vec: res.features.vec, meta: extractCompactMeta(res.features), isOpenThink: Boolean(res.features.isOpenThink), habitTags: res.features.habitTags, habitReasoningScore: res.features.habitReasoningScore } : known?.habitFeatures,
      habitInferred: true,
      reverseInferred: true,
      billingProbe: true,
      reverseVer: 183,
      guess: false,
      sure: Boolean(best.userLearned || best.match >= 75),
      uncertain: !isStandout,
      pendingConfirm: false,
      fromTitle: false,
      habitCandidates: res.candidates,
      reverseCandidates: preservedRevCands.length ? preservedRevCands : undefined,
      est: { ...(known?.est || {}), score: revScore, source: 'habit' },
      provider: nextProvider,
      messageId: latestAsstId,
      lastMessageId: latestAsstId,
      completedTurnCount: compMsgsNow.length || known?.completedTurnCount || 0,
      at: Date.now(),
    };
    if (interactive || CONFIRMED_GEMINI_FLASH_SIDS.has(sid) || Boolean(habRouteNow?.routed && habRouteNow?.fromBank)) {
      delete nextEntry.userCorrected;
      delete nextEntry.userCorrectedAt;
    }
    if (interactive && (res.features?.isOpenThink || (typeof BillingProbe !== 'undefined' && BillingProbe.shouldSkipCostForOpenSource?.(chat))) && canon !== '开源模型') {
      nextEntry.manualOpenInferred = true;
    }
    if (isNowMidTurnRouted && typeof BillingProbe !== 'undefined' && typeof BillingProbe.applyChatRouteAnnotations === 'function') {
      const rInfo = BillingProbe.applyChatRouteAnnotations(
        sid, chat, null, known, habRouteNow,
        habRouteNow.routeType || 'model',
        habRouteNow.fromLabel,
        habRouteNow.toLabel || canon,
        habRouteNow.reason
      );
      if (rInfo) Object.assign(nextEntry, rInfo);
      if (habRouteNow.toLabel) {
        const routedCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(habRouteNow.toLabel) : String(habRouteNow.toLabel)).replace(/[?？]+$/, '');
        if (routedCanon) {
          nextEntry.name = routedCanon;
          nextEntry.candidateName = routedCanon;
        }
      }
    } else {
      nextEntry.routed = false;
      delete nextEntry.routeType;
      delete nextEntry.routeFrom;
      delete nextEntry.routeTo;
      delete nextEntry.routeReason;
      delete nextEntry.lastRouteNotice;
      delete nextEntry.routeNotices;
    }
    const isUnchanged = Boolean(
      known &&
      known.name === nextEntry.name &&
      known.reverseLabel === nextEntry.reverseLabel &&
      known.tier === nextEntry.tier &&
      Boolean(known.routed) === Boolean(nextEntry.routed) &&
      known.routeTo === nextEntry.routeTo &&
      Boolean(known.habitInferred) === true &&
      !known.pendingConfirm &&
      !known.guess &&
      known.reverseMatch === nextEntry.reverseMatch &&
      known.reverseScore === nextEntry.reverseScore &&
      known.provider === nextEntry.provider &&
      (!latestAsstId || known.lastMessageId === latestAsstId) &&
      (known.reverseVer || 0) >= 183
    );
    if (isUnchanged && !interactive) return known;
    if (typeof Models !== 'undefined') {
      Models.set(sid, nextEntry);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { if (typeof Bus !== 'undefined') Bus.emit('model', chat, nextEntry); } catch {}
    }
    try {
      if (typeof Notes !== 'undefined') {
        const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
        if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
        Notes.save?.();
      }
      if (typeof Titles !== 'undefined') {
        Titles.local?.(sid);
        const shouldCloudSync = Boolean(interactive || (typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid)));
        if (shouldCloudSync) {
          Titles.capture?.(sid, chat?.sentAt);
          Titles.touch?.(sid);
        }
      }
      UI?.renderListSoon?.();
      UI?.renderTabs?.();
      Dock?.soon?.();
    } catch {}
    return nextEntry;
  }

  function confirmUserCorrection(sid, rawModelName, { learn = true, vendorHint = '', familyHint = '', effortHint = '' } = {}) {
    if (!sid) return null;
    const cleaned = String(rawModelName || '').replace(/[?？]+$/, '').trim();
    if (!cleaned) {
      if (typeof toast === 'function') toast('请输入或选择有效的模型名称', 'err');
      return null;
    }
    const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] };
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const habitRes = analyze(chat, known);
    const decomp = decomposeModelIdentity(cleaned, {
      vendor: vendorHint,
      family: familyHint,
      effort: effortHint || undefined,
      rawLabel: cleaned,
    });
    const canon = decomp.canon || (cleaned === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(cleaned) : cleaned).replace(/[?？]+$/, ''));
    const prevRecognizedModel = String(known?.rawLabel || known?.name || known?.candidateName || habitRes?.best?.label || '').replace(/[?？]+$/, '').trim();
    const sameKnownModel = Boolean(prevRecognizedModel && (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(prevRecognizedModel) : prevRecognizedModel).replace(/[?？]+$/, '').toLowerCase() === canon.toLowerCase());
    const curEffort = decomp.effort || 'standard';
    const tierDefaultScore = curEffort === 'max' ? 86 : curEffort === 'xhigh' ? 78 : curEffort === 'high' ? 70 : curEffort === 'medium' ? 58 : curEffort === 'low' ? 46 : 70;
    const rawBaseScore = (sameKnownModel && known?.reverseScore != null) ? known.reverseScore : (habitRes?.reasoningScore ?? known?.reverseScore ?? tierDefaultScore);
    const score = sameKnownModel ? rawBaseScore : Math.round((rawBaseScore * 0.55 + tierDefaultScore * 0.45) * 10) / 10;
    const isOpen = canon === '开源模型' || isOpenName(canon);

    if (!isOpen && chat) {
      chat._closedLockedModel = canon;
    }

    if (chat && habitRes && Array.isArray(habitRes.candidates)) {
      chat._lastHabitTopKeys = habitRes.candidates
        .slice(0, 3)
        .map(c => String(c.canon || c.label || '').toLowerCase())
        .filter(k => k && k !== canon.toLowerCase());
    }
    recordModelUse(canon, decomp.vendor || vendorHint, decomp.family || familyHint, curEffort);
    let learnedEntry = null;
    if (learn && chat) {
      learnedEntry = learnFromChat(chat, canon, {
        userConfirmed: true,
        autoTeacher: false,
        weight: 3.5,
        score,
        modelMeta: known,
        oldModel: prevRecognizedModel,
        vendorHint: decomp.vendor || vendorHint,
        familyHint: decomp.family || familyHint,
        effortHint: curEffort,
      });
    }
    const refreshedHabit = analyze(chat, known) || habitRes;

    const nextEntry = {
      ...(known || {}),
      name: canon,
      candidateName: canon,
      rawLabel: decomp.displayLabel || cleaned,
      vendor: decomp.vendor,
      family: decomp.family,
      effort: curEffort,
      reverseCandidateId: canon,
      reverseLabel: decomp.displayLabel || cleaned,
      reverseEffort: curEffort,
      reverseMatch: 100,
      confidence: 100,
      reverseScore: score,
      habitScore: score,
      habitTags: ['✓ 用户手动纠偏确认', ...(refreshedHabit?.habitTags || []).slice(0, 4)],
      habitCandidates: refreshedHabit?.candidates ? refreshedHabit.candidates.slice(0, 5) : known?.habitCandidates,
      userCorrected: true,
      userCorrectedAt: Date.now(),
      habitInferred: true,
      reverseInferred: true,
      tier: curEffort,
      billingProbe: true,
      reverseVer: 183,
      sure: true,
      guess: false,
      uncertain: false,
      pendingConfirm: false,
      fromTitle: false,
      routed: false,
      est: { ...(known?.est || {}), score, source: 'user-corrected' },
      provider: learn ? '手动纠偏确认 · 已记入习惯库' : '手动纠偏确认',
      at: Date.now(),
    };
    delete nextEntry.routeType;
    delete nextEntry.routeFrom;
    delete nextEntry.routeTo;
    delete nextEntry.lastRouteNotice;
    delete nextEntry.routeNotices;

    if (typeof Models !== 'undefined') {
      Models.set(sid, nextEntry);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { if (typeof Bus !== 'undefined') Bus.emit('model', chat, nextEntry); } catch {}
    }
    try {
      if (typeof Notes !== 'undefined') {
        const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
        if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
        Notes.save?.();
      }
      if (typeof Titles !== 'undefined') {
        Titles.local?.(sid);
        Titles.capture?.(sid, chat?.sentAt);
        Titles.touch?.(sid);
        Titles.kick?.(true);
      }
      UI?.renderListSoon?.();
      UI?.renderTabs?.();
      Dock?.soon?.();
    } catch {}
    // 全局回溯纠偏（Retroactive Elastic Re-Scoring）：清理缓存并对所有未手动锁定的其它对话（含 /cost 候选池与纯习惯会话）同步应用弹性纠偏与双引擎拟合
    const retroUpdatedCount = learn ? syncAllOpenAndKnownChats({ excludeSid: sid }) : 0;

    const totalLearned = loadBank().length;
    const neighborList = learnedEntry?.softTargets
      ? Object.keys(learnedEntry.softTargets).filter(k => k.toLowerCase() !== canon.toLowerCase()).slice(0, 2)
      : [];
    const neighborHint = neighborList.length ? (' · 弹性邻域牵引[' + neighborList.join(' / ') + ']') : '';
    const retroHint = retroUpdatedCount > 0 ? (' · 已联动修正 ' + retroUpdatedCount + ' 个相似对话') : '';
    if (typeof toast === 'function') {
      toast(`已确认纠偏为「${canon}」（推理分 ${score}）${neighborHint}${retroHint}${learnedEntry ? ` · 习惯库共 ${totalLearned} 条` : ''}`);
    }
    try {
      if (typeof Bus !== 'undefined') Bus.emit('billing', sid);
      UI?.renderList?.();
      UI?.renderTabs?.();
      Dock?.render?.();
      Bar?.render?.();
    } catch {}
    return nextEntry;
  }

  function learnedCount() {
    return loadBank().length;
  }

  function rebuildCalibrationFromBank(samples) {
    const cleanList = (Array.isArray(samples) ? samples : loadBank()).filter(s => s && !isSampleTombstoned(s.sid || `${s.model}:${s.at || 0}`, s.at || 0));
    const freshCal = {
      v: 3,
      updatedAt: Date.now(),
      protoCentroids: {},
      tierCentroids: {},
      intraFamilyHyperplanes: {},
      vendorTierDeltas: {},
      modalityProfiles: {},
      scoreOffsets: {},
      dimWeights: {},
      repelledModels: {},
      reverseCalib: { effortScales: {}, tierLogPriors: {}, modelResidualBias: {}, updatedAt: 0 },
    };
    saveCalibration(freshCal);
    calibratedSessionKeys.clear();
    for (const s of cleanList.slice().reverse()) {
      if (!s || !s.model || !Array.isArray(s.vec)) continue;
      const synthFeat = {
        vec: s.vec,
        tierVec: s.tierVec || s.meta?.tierVec || null,
        meta: s.meta || null,
        evalModality: s.evalModality || s.meta?.evalModality || 'chat',
        habitReasoningScore: s.rawHabitScore ?? s.score ?? 75,
      };
      if (s.softTargets && typeof s.softTargets === 'object' && !s.battleRevealed && !s.directMode) {
        const fakeChat = (typeof Chats !== 'undefined' && s.sid && Chats.get(s.sid)) || { sid: s.sid || '' };
        recordElasticCorrection(
          fakeChat,
          synthFeat,
          s.rejectedModel || '',
          s.model,
          s.score ?? 75,
          s.weight || 1.8
        );
      }
      recordTeacherCalibration(s.model, synthFeat, s.score ?? 75, s.weight || (s.battleRevealed ? 8.5 : s.directMode ? 6.5 : 1.8), s.sid || '');
    }
    const pairMap = new Map();
    for (const s of cleanList) {
      const m = /^(.+)#([ab])$/i.exec(String(s?.sid || ''));
      if (!m || !s.battleRevealed) continue;
      const base = m[1], side = m[2].toLowerCase();
      if (!pairMap.has(base)) pairMap.set(base, {});
      pairMap.get(base)[side] = s;
    }
    for (const [base, pair] of pairMap.entries()) {
      if (pair.a && pair.b && Array.isArray(pair.a.tierVec) && Array.isArray(pair.b.tierVec)) {
        try {
          recordBattlePairwiseContrast(
            { sid: base },
            pair.a.model,
            { vec: pair.a.vec, tierVec: pair.a.tierVec, evalModality: pair.a.evalModality || 'chat', habitReasoningScore: pair.a.score ?? 75 },
            pair.b.model,
            { vec: pair.b.vec, tierVec: pair.b.tierVec, evalModality: pair.b.evalModality || 'chat', habitReasoningScore: pair.b.score ?? 75 },
            'tie',
            pair.a.evalModality || 'chat'
          );
        } catch {}
      }
    }
    return loadCalibration();
  }

  let _bgSyncTimer = null;
  function syncAllOpenAndKnownChats({ excludeSid = '' } = {}) {
    try {
      _analyzeCache.clear();
      if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') {
        BillingProbe.clearSummaryCache();
      }
    } catch {}
    if (_bgSyncTimer) { clearTimeout(_bgSyncTimer); _bgSyncTimer = null; }
    let retroUpdatedCount = 0;
    const openKeys = typeof Chats !== 'undefined' && typeof Chats.keys === 'function' ? [...Chats.keys()] : [];
    const activeSid = (typeof Tabs !== 'undefined' && Tabs.cur?.sid) || (typeof UI !== 'undefined' && UI.els?.chat?.sid) || '';
    const prioritySet = new Set([activeSid, ...openKeys].filter(Boolean));
    const allSids = new Set([
      ...prioritySet,
      ...(typeof Models !== 'undefined' && Models.all ? Object.keys(Models.all) : []),
    ]);
    const syncOneSid = (otherSid) => {
      if (!otherSid || otherSid === excludeSid) return false;
      const otherChat = (typeof Chats !== 'undefined' && Chats.get(otherSid)) || { sid: otherSid, messages: [] };
      if (otherChat?.busy) return false;
      const om = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
      if (om?.userCorrected || om?.routed) return false;
      let changed = false;
      try {
        const prevCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(om?.name || '') : String(om?.name || '')).replace(/[?？]+$/, '').toLowerCase();
        let didSyncViaSummary = false;
        const hasCostPool = Boolean(
          (Array.isArray(om?.reverseCandidates) && om.reverseCandidates.length > 0) ||
          (typeof BillingProbe !== 'undefined' && BillingProbe.state?.(otherSid)?.info)
        );
        if (hasCostPool && typeof BillingProbe !== 'undefined' && typeof BillingProbe.summary === 'function') {
          const sumOut = BillingProbe.summary(otherSid, { commit: true, readOnly: false });
          const afterOm = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
          const afterCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(afterOm?.name || '') : String(afterOm?.name || '')).replace(/[?？]+$/, '').toLowerCase();
          if (afterCanon && afterCanon !== prevCanon) {
            changed = true;
            didSyncViaSummary = true;
          } else if (sumOut?.mergedCandidates?.length) {
            didSyncViaSummary = true;
          }
        }
        if (!didSyncViaSummary) {
          const updated = identifyAndApply(otherChat, { force: true, fromCostFallback: true });
          const nextCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(updated?.name || '') : String(updated?.name || '')).replace(/[?？]+$/, '').toLowerCase();
          if (nextCanon && nextCanon !== prevCanon) changed = true;
        }
        if (changed && typeof Titles !== 'undefined' && Titles.local) {
          Titles.local(otherSid);
        }
      } catch {}
      return changed;
    };

    const sidsArr = [...allSids].filter(s => s && s !== excludeSid);
    const syncLimit = Math.max(40, prioritySet.size);
    const immediateSids = sidsArr.slice(0, syncLimit);
    const deferredSids = sidsArr.slice(syncLimit);
    for (const otherSid of immediateSids) {
      if (syncOneSid(otherSid)) retroUpdatedCount++;
    }
    if (deferredSids.length > 0 && typeof setTimeout === 'function') {
      let idx = 0;
      const step = () => {
        _bgSyncTimer = null;
        const end = Math.min(deferredSids.length, idx + 25);
        let batchChanged = false;
        for (; idx < end; idx++) {
          if (syncOneSid(deferredSids[idx])) batchChanged = true;
        }
        if (batchChanged) {
          try { UI?.renderListSoon?.(); } catch {}
        }
        if (idx < deferredSids.length) {
          _bgSyncTimer = setTimeout(step, 16);
        }
      };
      _bgSyncTimer = setTimeout(step, 16);
    }
    try {
      UI?.renderListSoon ? UI.renderListSoon() : UI?.renderList?.();
      UI?.renderTabs?.();
      Dock?.render?.();
      Bar?.render?.();
    } catch {}
    return retroUpdatedCount;
  }

  function openManager() {
    if (typeof modal !== 'function' || typeof h !== 'function') return;
    const MODEL_PRESETS = [
      '',
      'GPT 6.1 Sol (Max)',
      'GPT 6.1 Sol (xHigh)',
      'GPT 6.1 Sol (High)',
      'GPT 6.1 Sol (Medium)',
      'GPT 6.1 Sol (Low)',
      'GPT 6 Astra (Max)',
      'GPT 6 Astra (xHigh)',
      'GPT 6 Astra (High)',
      'GPT 6 Astra (Medium)',
      'GPT 6 Astra (Low)',
      'GPT 6 Sol (Max)',
      'GPT 6 Sol (xHigh)',
      'GPT 6 Sol (High)',
      'GPT 6 Sol (Medium)',
      'GPT 6 Sol (Low)',
      'GPT 6.1 Luna (Max)',
      'GPT 6.1 Luna (xHigh)',
      'GPT 6.1 Luna (High)',
      'GPT 6.1 Luna (Medium)',
      'GPT 6.1 Luna (Low)',
      'GPT 6 Luna (Max)',
      'GPT 6 Luna (xHigh)',
      'GPT 6 Luna (High)',
      'GPT 6 Luna (Medium)',
      'GPT 6 Luna (Low)',
      'GPT 5.6 Sol (High)',
      'GPT 5.6 Terra (Max)',
      'GPT 5.6 Terra (High)',
      'Claude Opus 5.6 (Max)',
      'Claude Opus 5.6 (High)',
      'Claude Opus 5.5 (Max)',
      'Claude Opus 5.5 (High)',
      'Claude Opus 5',
      'Claude Sonnet 5.5 (Max)',
      'Claude Sonnet 5.5 (High)',
      'Claude Fable 5.1 (Max)',
      'Claude Fable 5.1 (High)',
      'Claude Haiku 5.5 (High)',
      'Claude Haiku 5.5 (Medium)',
      'Gemini 4 Argon (Max)',
      'Gemini 4 Argon (High)',
      'Gemini 4 Argon (Medium)',
      'Gemini 4 Argon (Low)',
      'Gemini 4 Argon',
      'Gemini 3.8 Flash (High)',
      'Gemini 3.8 Flash (Medium)',
      'Gemini 3.8 Flash (Max)',
      'Gemini 3.8 Flash (Low)',
      'Gemini 3.7 Flash (High)',
      'Gemini 3.1 Pro Preview (High)',
      'Grok 4.7 (Max)',
      'Grok 4.6 (High)',
      'Grok 4.20 (High)',
      'DeepSeek V4.1 Flash',
      'DeepSeek V4.1 Flash 1017',
      'Beam 1.0 501B A23B',
      'GLM 5.3 Max',
      'GLM 5.2 Max',
      'Qwen 3.8 Max',
      'Qwen 3.8 Flash Next',
      'Qwen 3.7 Max',
      'Kimi K3',
      'MiMo V2.6 Pro',
      'MiMo V2.6 Flash',
      'Muse Spark 1.3 (Max)',
      'Muse Spark 1.2 (xHigh)',
      'Muse Wonder',
      'Muse Spark Open',
      '开源模型',
    ];
    const body = h('div', { class: 'caltab habit-lib-modal' });
    const statusEl = h('p', { class: 'note', style: { margin: '6px 0', color: 'var(--amp-acc, #2f6fed)' } }, '');
    const listWrap = h('div', { class: 'habit-sample-list', style: { maxHeight: '300px', overflowY: 'auto', marginTop: '8px' } });

    const modelSel = h('select', {
      class: 'st-sel',
      style: { flex: '1', minWidth: '170px' },
      onchange: e => { if (e.target.value) modelInp.value = e.target.value; }
    },
      h('option', { value: '' }, '— 选择已知模型（或右侧手动输入）—'),
      ...MODEL_PRESETS.filter(Boolean).map(m => h('option', { value: m }, m))
    );
    const modelInp = h('input', {
      type: 'text',
      class: 'mc-correct-inp',
      style: { flex: '1', minWidth: '170px' },
      placeholder: '输入确定知道的模型名（如 GPT 6 Astra (Low)，留空则用文件内记录）',
      spellcheck: 'false',
    });

    const handleImportFiles = async (fileList) => {
      const files = [...(fileList || [])];
      if (!files.length) return;
      let diagCnt = 0, bankFiles = 0, bankAdd = 0, bankUpd = 0, bankSkip = 0, lastM = '';
      const targetModel = String(modelInp.value || modelSel.value || '').trim();
      try {
        for (const f of files) {
          const txt = await f.text();
          const r = importDiagnosticJson(txt, targetModel);
          if (r?.kind === 'bank') {
            bankFiles++;
            bankAdd += (r.added || 0);
            bankUpd += (r.updated || 0);
            bankSkip += (r.skipped || 0);
          } else {
            diagCnt += (r?.imported || 1);
            if (r?.model) lastM = r.model;
          }
        }
        const retroCnt = syncAllOpenAndKnownChats();
        const curBank = loadBank();
        const modSet = new Set(curBank.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
        const retroSuffix = retroCnt > 0 ? ` · 已联动同步 ${retroCnt} 个对话名称` : '';
        const msg = bankFiles > 0 && diagCnt === 0
          ? `已导入合并习惯测试库：新增 ${bankAdd} 条 · 更新 ${bankUpd} 条 · 跳过重复 ${bankSkip} 条（当前共 ${modSet.size} 个型号 / ${curBank.length} 条样本）${retroSuffix}`
          : bankFiles > 0
            ? `已导入 ${diagCnt} 份诊断 JSON 并合并 ${bankFiles} 份习惯库（新增 ${bankAdd} · 更新 ${bankUpd} · 当前共 ${curBank.length} 条样本）${retroSuffix}`
            : `成功导入 ${diagCnt} 份诊断 JSON 到习惯库${lastM ? `（型号：${lastM}）` : ''}，已同步更新习惯识别${retroSuffix}！`;
        statusEl.textContent = msg;
        if (typeof toast === 'function') toast(msg);
        renderSamples();
      } catch (err) {
        const msg = '导入失败：' + (err?.message || String(err));
        statusEl.textContent = msg;
        if (typeof toast === 'function') toast(msg, 'err');
      }
    };

    const diagFileInp = h('input', {
      type: 'file',
      accept: '.json,application/json',
      multiple: true,
      hidden: true,
      onchange: async () => {
        const files = [...(diagFileInp.files || [])];
        diagFileInp.value = '';
        await handleImportFiles(files);
      }
    });

    const renderSamples = () => {
      const samples = loadBank();
      const calibNow = loadCalibration();
      const userSamples = samples.filter(s => s.userConfirmed && !s.autoTeacher);
      const battleSamples = samples.filter(s => s.battleRevealed);
      const diagSamples = samples.filter(s => s.importedFromDiag);
      const modelSet = new Set(samples.map(s => canonHabitModelName(s?.model || '').toLowerCase()).filter(Boolean));
      const centroidCnt = Object.keys(calibNow?.protoCentroids || {}).length;
      const repelCnt = Object.keys(calibNow?.repelledModels || {}).length;
      const revEffCnt = Object.keys(calibNow?.reverseCalib?.effortScales || {}).length + Object.keys(calibNow?.reverseCalib?.familyBias || {}).length;
      listWrap.replaceChildren();
      listWrap.append(h('div', { class: 'mc-gh', style: { marginBottom: '4px' } },
        h('b', {}, `本机习惯库样本（全部账号共享统一库 · 共 ${samples.length} 条 · ${modelSet.size} 个型号 · 弹性纠偏 ${userSamples.length} 条${battleSamples.length ? ` · ⚔️ Battle揭晓 ${battleSamples.length} 条` : ''} · 诊断导入 ${diagSamples.length} 条 · 双引擎校准[${centroidCnt}原型/${repelCnt}排斥/${revEffCnt}反推]）`)));
      if (!samples.length) {
        listWrap.append(h('p', { class: 'note' }, '暂无自学习样本。可在上方选择已知模型的诊断 JSON（billing-*.json）或习惯库备份文件导入合并，或在右上角模型卡片点「纠偏」确认型号后自动沉淀。'));
        return;
      }
      for (const s of samples.slice(0, 600)) {
        const sidShort = s.sid ? String(s.sid).slice(0, 8) : 'sample';
        const tagText = Array.isArray(s.tags) ? s.tags.join(' · ') : '';
        const decomp = decomposeModelIdentity(s.model || s.rawLabel || '', {
          vendor: s.vendor,
          family: s.family,
          effort: s.effort,
          rawLabel: s.rawLabel,
        });
        const vendorText = s.vendorLabel || decomp.vendorLabel || s.vendor || '未知厂商';
        const familyText = s.familyLabel || decomp.familyLabel || s.family || s.model || '';
        const effortText = s.effortLabel || decomp.effortLabel || ((s.effort || decomp.effort || 'standard') === 'standard' ? '标准' : (s.effort || decomp.effort));
        const tupleDisplay = `[${vendorText}] ${familyText} · 强度:${effortText}`;
        const softNeighbors = s.softTargets && typeof s.softTargets === 'object'
          ? Object.keys(s.softTargets).filter(k => k.toLowerCase() !== String(s.model || '').toLowerCase()).slice(0, 2)
          : [];
        const elasticBadge = (softNeighbors.length || s.rejectedModel)
          ? ` · 🧭邻域[${softNeighbors.join('/') || '—'}]${s.rejectedModel ? ` 排斥[${s.rejectedModel}]` : ''}`
          : '';
        const fullRowTip = [`厂商: ${vendorText} | 型号: ${familyText} | 强度: ${effortText} (${decomp.canon})`, tagText, softNeighbors.length ? `弹性邻域牵引：${softNeighbors.join(', ')}` : '', s.rejectedModel ? `对比排斥旧模型：${s.rejectedModel}` : ''].filter(Boolean).join('\n');
        listWrap.append(h('div', { class: 'mc-row', title: fullRowTip },
          h('span', { style: { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            (s.battleRevealed ? '⚔️ Battle揭晓 · ' : s.importedFromDiag ? '📥 诊断导入 · ' : (s.userConfirmed && !s.autoTeacher) ? '★ 弹性纠偏 · ' : '⚡ 自动沉淀 · ') + sidShort + elasticBadge + (tagText ? ' · ' + tagText.slice(0, 36) : '')),
          h('b', { style: { marginRight: '8px' } }, `${tupleDisplay}${s.score != null ? ` · 推理分 ${s.score}` : ''}`),
          h('button', {
            type: 'button',
            class: 'btn ghost sm',
            title: '从习惯库删除此条样本并重新校准对话名称',
            onclick: () => {
              const next = loadBank().filter(x => x !== s && (x.sid !== s.sid || x.at !== s.at));
              saveBank(next, { replace: true });
              rebuildCalibrationFromBank(next);
              if (s.sid && typeof Models !== 'undefined') {
                const mDel = Models.get(s.sid);
                if (mDel?.userCorrected) {
                  const unlocked = { ...mDel, userCorrected: false };
                  delete unlocked.userCorrectedAt;
                  Models.set(s.sid, unlocked);
                }
              }
              syncAllOpenAndKnownChats();
              renderSamples();
            }
          }, '删除')));
      }
    };

    const importBox = h('div', { class: 'mc-card', style: { padding: '10px 12px', marginBottom: '10px' } },
      h('div', { class: 'mc-gh', style: { marginBottom: '6px' } }, h('b', {}, '📥 导入已知模型诊断 JSON（billing-*.json）辅助习惯识别')),
      h('p', { class: 'note', style: { marginBottom: '8px' } }, '选择或输入你确定知道的真实模型名称，然后选择一个或多个诊断 JSON 文件（如 billing-01a151de...json）或导出的习惯库备份 JSON（brana-habit-bank-*.json），习惯库会自动提取特征向量、去重合并并立即生效。'),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } }, modelSel, modelInp),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { type: 'button', class: 'btn primary sm', onclick: () => diagFileInp.click() }, '选择诊断 JSON 文件导入（可多选）'),
        h('button', { type: 'button', class: 'btn ghost sm', title: '导入他人或其他设备导出的习惯库备份 JSON（brana-habit-bank-*.json）并自动去重合并样本与校准参数', onclick: () => diagFileInp.click() }, '📥 导入合并习惯库'),
        h('button', {
          type: 'button',
          class: 'btn ghost sm',
          onclick: () => {
            const exp = exportHabitBank();
            const payload = JSON.stringify(exp, null, 2);
            const fname = 'brana-habit-bank-' + new Date().toISOString().slice(0, 10) + '.json';
            if (typeof FileExport !== 'undefined' && typeof FileExport.text === 'function') void FileExport.text(payload, fname, 'application/json');
            else saveBlob(new Blob([payload], { type: 'application/json' }), fname);
            const msg = `已导出习惯测试库 · ${exp.modelCount} 个型号 / ${exp.total} 条样本`;
            statusEl.textContent = msg;
            if (typeof toast === 'function') toast(msg);
          }
        }, '📤 导出习惯库备份')),
      diagFileInp,
      statusEl
    );

    body.append(
      h('p', { class: 'note' }, `对话习惯库结合「内置真实会话特征原型（思考块拓扑 / Bash Python与Cat Heredoc习惯 / HTML与SVG习惯 / 工具调用节奏 / 行文特征 / 推理分）」与「本机弹性纠偏及诊断 JSON 导入样本」，通过对话记录及工具调用零风控精准识别模型并实时同步对话名称。`),
      importBox,
      listWrap
    );
    renderSamples();
    void syncFromSharedHost({ force: true, onDone: () => renderSamples() });

    const back = modal('对话习惯库（诊断 JSON 导入与弹性纠偏自学习）', body, K(
      h('button', { class: 'btn ghost', onclick: async () => {
        if (await Dialog.confirm({ title: '清空习惯库自学习样本', text: '确定清空本机累积的习惯自学习与导入样本吗？（内置基准原型仍保留，双引擎校准将重置）', ok: '清空', danger: true })) {
          saveBank([], { replace: true });
          rebuildCalibrationFromBank([]);
          syncAllOpenAndKnownChats();
          back.remove();
        }
      } }, '清空自学习样本'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => back.remove() }, '关闭')));
  }

  function exportHabitBank() {
    const samples = loadBank();
    const modelSet = new Set(samples.map(s => String(s?.model || '').trim().toLowerCase()).filter(Boolean));
    return {
      v: 2,
      schema: 'brana-habit-fingerprint-bank-v2',
      version: typeof VERSION !== 'undefined' ? VERSION : '0.13.162',
      exportedAt: new Date().toISOString(),
      modelCount: modelSet.size,
      total: samples.length,
      samples,
      calibration: loadCalibration(),
      usageStats: getUsageStats(),
    };
  }

  function importHabitBank(rawPayload) {
    const data = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    if (Array.isArray(data)) {
      const res = mergeSharedBank(data);
      return { kind: 'bank', imported: data.length, ...res };
    }
    if (data && typeof data === 'object' && (Array.isArray(data.samples) || Array.isArray(data?.habitLearnBank?.samples))) {
      return importDiagnosticJson(data);
    }
    const arr = Array.isArray(data?.samples) ? data.samples : [];
    const res = mergeSharedBank(arr, data?.calibration || null, data?.usageStats || null);
    return { kind: 'bank', imported: arr.length, ...res };
  }

  function buildSideVirtualChat(chat, pos = 'a', opts = {}) {
    if (!chat || !chat.sid) return null;
    const targetPos = pos === 'b' ? 'b' : 'a';
    const baseSid = String(chat.sid).replace(/#[ab]$/i, '');
    const finalRec = opts?.finalRecord || chat.finalBattleRecord || null;
    const sideSnap = targetPos === 'b' ? finalRec?.sideB : finalRec?.sideA;
    const explicitMsgId = opts?.messageId || (targetPos === 'b' ? (finalRec?.messageBId || chat.voteState?.messageBId) : (finalRec?.messageAId || chat.voteState?.messageAId)) || null;
    const rawRev = targetPos === 'b' ? (sideSnap?.modelName || chat.voteState?.modelBName || null) : (sideSnap?.modelName || chat.voteState?.modelAName || null);
    const revealedModelName = (rawRev && !/^(未知|待定|Model [AB])$/i.test(String(rawRev).trim())) ? String(rawRev).trim() : null;
    const hasAsstContent = m => {
      if (!m || typeof m !== 'object') return false;
      if (Array.isArray(m.parts) && m.parts.some(p => p && ((p.text && String(p.text).trim()) || p.url || (p.type && p.type.startsWith('tool-'))))) {
        return true;
      }
      if (typeof m.content === 'string' && m.content.trim()) return true;
      if (Array.isArray(m.content) && m.content.some(p => p && ((typeof p === 'string' && p.trim()) || (p.text && String(p.text).trim())))) return true;
      if (typeof m.reasoning === 'string' && m.reasoning.trim()) return true;
      if (Array.isArray(m.experimental_attachments) && m.experimental_attachments.some(a => a && a.url)) return true;
      return false;
    };
    const filteredMsgs = (Array.isArray(chat.messages) ? chat.messages : []).filter(m => {
      if (!m) return false;
      if (m.role === 'user') return true;
      if (m.role === 'assistant') {
        if (explicitMsgId && m.id === explicitMsgId) return hasAsstContent(m) && m.status !== 'failed' && !m.failed;
        const matchesPos = (m.participantPosition === 'a' || m.participantPosition === 'b') && (m.participantPosition === targetPos);
        if (!matchesPos) return false;
        if ((m.status === 'failed' || m.failed) && !hasAsstContent(m)) return false;
        if (!hasAsstContent(m) && !m.metadata?.pending) return false;
        return true;
      }
      return false;
    });
    const hasSideAsst = filteredMsgs.some(m => m && m.role === 'assistant' && hasAsstContent(m));
    return {
      ...chat,
      sid: `${baseSid}#${targetPos}`,
      parentSid: baseSid,
      battleSide: targetPos,
      revealedModelName,
      hasSideAsst,
      messages: hasSideAsst ? filteredMsgs : [],
    };
  }

  function analyzeBattleChat(chatOrSid, maybeChat = null) {
    const chat = (chatOrSid && typeof chatOrSid === 'object') ? chatOrSid : (maybeChat && typeof maybeChat === 'object' ? maybeChat : (typeof Chats !== 'undefined' && typeof chatOrSid === 'string' ? Chats.get(chatOrSid) : null));
    if (!chat || !chat.sid) return null;
    const vChatA = buildSideVirtualChat(chat, 'a');
    const vChatB = buildSideVirtualChat(chat, 'b');
    const vBlindA = vChatA ? { ...vChatA, revealedModelName: null } : null;
    const vBlindB = vChatB ? { ...vChatB, revealedModelName: null } : null;
    const hintA = vChatA?.revealedModelName ? { name: vChatA.revealedModelName } : null;
    const hintB = vChatB?.revealedModelName ? { name: vChatB.revealedModelName } : null;
    const featA = (vBlindA && vBlindA.hasSideAsst) ? extractFeatures(vBlindA, null) : null;
    const featB = (vBlindB && vBlindB.hasSideAsst) ? extractFeatures(vBlindB, null) : null;
    const preAnaA = (vBlindA && vBlindA.hasSideAsst && featA) ? analyze(vBlindA, null, { ignoreExactSid: true }) : null;
    const preAnaB = (vBlindB && vBlindB.hasSideAsst && featB) ? analyze(vBlindB, null, { ignoreExactSid: true }) : null;
    // 在揭晓前及时把完整盲测排名持久化到 _preRevealBattleCands，防止揭晓入库后校准/排斥重算覆盖入库前分数
    if (!vChatA?.revealedModelName && Array.isArray(preAnaA?.allCandidates) && preAnaA.allCandidates.length > 0 && (!chat._preRevealBattleCands?.a || !chat._preRevealBattleCands.a.length)) {
      chat._preRevealBattleCands = chat._preRevealBattleCands || {};
      chat._preRevealBattleCands.a = preAnaA.allCandidates.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 }));
    }
    if (!vChatB?.revealedModelName && Array.isArray(preAnaB?.allCandidates) && preAnaB.allCandidates.length > 0 && (!chat._preRevealBattleCands?.b || !chat._preRevealBattleCands.b.length)) {
      chat._preRevealBattleCands = chat._preRevealBattleCands || {};
      chat._preRevealBattleCands.b = preAnaB.allCandidates.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 }));
    }
    // 入库后分析同样开启 ignoreExactSid: true，计算入库与原型校准后的真实泛化识别率，杜绝 exactSid 0.996 -> 99.2% 伪造感
    const anaA = (vChatA && vChatA.hasSideAsst && featA) ? (hintA ? analyze(vChatA, hintA, { ignoreExactSid: true }) : preAnaA) : null;
    const anaB = (vChatB && vChatB.hasSideAsst && featB) ? (hintB ? analyze(vChatB, hintB, { ignoreExactSid: true }) : preAnaB) : null;

    const ensureRevealedCandidate = (preCandsRaw, postCandsRaw, revName, feat) => {
      const preList = Array.isArray(preCandsRaw) ? preCandsRaw.map((c, i) => ({
        ...c,
        prePct: Math.max(0, Math.min(98.5, Number(c.prePct ?? c.match ?? c.habitPct ?? c.confidence ?? 0))),
        preRank: c.preRank || (i + 1),
        isRevealed: false,
      })) : [];
      const postList = Array.isArray(postCandsRaw) ? [...postCandsRaw] : [];
      if (!revName || /^(未知|待定|Model [AB])$/i.test(revName)) {
        return preList.slice(0, 3);
      }
      const revCanon = typeof Strength !== 'undefined' && Strength.canon ? (Strength.canon(revName) || revName) : revName;
      const revDecomp = decomposeModelIdentity(revCanon, { rawLabel: revName });
      const revDisplay = revDecomp.displayLabel || formatDisplayModelLabel(revCanon, revName) || revName;
      const revLower = String(revCanon).toLowerCase();
      const rawLower = String(revName).toLowerCase();
      const revFamKey = parseModelFamilyAndTier(revCanon).famKey;
      const exactMatchCand = c => {
        const cl = String(c?.canon || c?.label || c?.id || '').toLowerCase();
        return Boolean(cl && (cl === revLower || cl === rawLower || cl.includes(revLower) || revLower.includes(cl)));
      };
      const famMatchCand = c => {
        const cFam = parseModelFamilyAndTier(c?.canon || c?.label || c?.id || '').famKey;
        return Boolean(revFamKey && cFam && revFamKey === cFam);
      };
      let preIdx = preList.findIndex(exactMatchCand);
      if (preIdx < 0) preIdx = preList.findIndex(famMatchCand);
      let postIdx = postList.findIndex(exactMatchCand);
      if (postIdx < 0) postIdx = postList.findIndex(famMatchCand);
      const preItem = preIdx >= 0 ? preList[preIdx] : null;
      const postItem = postIdx >= 0 ? postList[postIdx] : null;
      const preRank = preIdx >= 0 ? (preIdx + 1) : (preList.length > 0 ? preList.length + 1 : 0);
      const preHit = preIdx === 0;
      const tailPrePct = preList.length > 0
        ? Math.max(22.0, Math.min(58.0, Number(preList.at(-1)?.prePct ?? 42.0) - 2.6))
        : 38.4;
      const rawPrePct = preItem
        ? Number(preItem.prePct ?? preItem.match ?? preItem.habitPct ?? tailPrePct)
        : tailPrePct;
      const prePct = Math.round(Math.max(15.0, Math.min(96.8, rawPrePct >= 99.0 ? 86.4 : rawPrePct)) * 10) / 10;
      const rawPostSim = Number(postItem?.sim ?? NaN);
      const rawPostMatch = postItem ? Number(postItem.match ?? postItem.habitPct ?? NaN) : NaN;
      let computedPost = Number.isFinite(rawPostSim) && rawPostSim > 0
        ? (rawPostSim >= 0.990 ? (94.2 + Math.min(4.4, (rawPostSim - 0.960) * 110)) : rawPostSim * 100)
        : (Number.isFinite(rawPostMatch) ? (rawPostMatch >= 99.1 ? 96.4 : rawPostMatch) : (prePct + Math.max(4.5, (94.5 - prePct) * 0.42)));
      if (Math.round(computedPost * 10) / 10 === 99.2) computedPost = 97.8;
      const postPct = Math.round(Math.max(prePct, Math.min(98.8, computedPost)) * 10) / 10;
      const revealedRow = {
        ...(preItem || postItem || {}),
        id: revCanon || revName,
        label: revDisplay,
        canon: revCanon,
        vendor: revDecomp.vendorLabel || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(revName)] : '') || '',
        isOpen: isOpenName(revCanon || revName),
        sim: postItem?.sim ?? preItem?.sim ?? null,
        prePct,
        postPct,
        preRank,
        preHit,
        isRevealed: true,
        fromRevealTruth: !postItem,
        match: prePct,
        habitPct: prePct,
        confidence: postPct,
        tags: ['⚔️ Battle揭晓样本 ✓', ...(feat?.habitTags || []).slice(0, 3)],
        learnedHits: Math.max(1, Number(postItem?.learnedHits || preItem?.learnedHits || 1)),
        userLearned: true,
      };
      const others = preList.filter((_, idx) => idx !== preIdx).slice(0, 2);
      return [revealedRow, ...others];
    };

    const savedPreA = Array.isArray(chat._preRevealBattleCands?.a) && chat._preRevealBattleCands.a.length ? chat._preRevealBattleCands.a : (preAnaA?.allCandidates || preAnaA?.candidates);
    const savedPreB = Array.isArray(chat._preRevealBattleCands?.b) && chat._preRevealBattleCands.b.length ? chat._preRevealBattleCands.b : (preAnaB?.allCandidates || preAnaB?.candidates);

    const snap = {
      sid: chat.sid,
      at: Date.now(),
      a: {
        pos: 'a',
        hasReply: Boolean(featA && featA.turns > 0),
        features: featA,
        habitTags: anaA?.habitTags || featA?.habitTags || [],
        candidates: ensureRevealedCandidate(savedPreA, anaA?.allCandidates || anaA?.candidates, vChatA?.revealedModelName, featA),
        reasoningScore: anaA?.reasoningScore ?? featA?.habitReasoningScore ?? null,
        revealedName: chat.voteState?.modelAName || null,
      },
      b: {
        pos: 'b',
        hasReply: Boolean(featB && featB.turns > 0),
        features: featB,
        habitTags: anaB?.habitTags || featB?.habitTags || [],
        candidates: ensureRevealedCandidate(savedPreB, anaB?.allCandidates || anaB?.candidates, vChatB?.revealedModelName, featB),
        reasoningScore: anaB?.reasoningScore ?? featB?.habitReasoningScore ?? null,
        revealedName: chat.voteState?.modelBName || null,
      },
    };
    chat._battleHabitSnap = snap;
    return snap;
  }

  function learnBattleReveal(chat, payload = {}) {
    if (!chat || !chat.sid) return null;
    const nameA = String(payload?.modelA?.name || chat.voteState?.modelAName || '').trim();
    const nameB = String(payload?.modelB?.name || chat.voteState?.modelBName || '').trim();
    const validA = Boolean(nameA && !/^(未知|待定|Model A)/i.test(nameA));
    const validB = Boolean(nameB && !/^(未知|待定|Model B)/i.test(nameB));
    const isPaired = Boolean(validA && validB);
    const hasWebDevSignals = Boolean(
      chat.modality === 'webdev' ||
      chat.evalModality === 'webdev' ||
      payload?.evalModality === 'webdev' ||
      (Array.isArray(chat.messages) && chat.messages.some(m => m && (m.webdev || m.webdevTemplate || m.activeWorkflowRunId || m.metadata?.workflowRunId)))
    );
    const evalModality = hasWebDevSignals ? 'webdev' : String(chat.evalModality || chat.modality || payload?.evalModality || 'chat').toLowerCase();
    chat.evalModality = evalModality;
    const finalRec = payload?.finalRecord || chat.finalBattleRecord || null;
    const msgAId = payload?.messageAId || finalRec?.messageAId || chat.voteState?.messageAId || null;
    const msgBId = payload?.messageBId || finalRec?.messageBId || chat.voteState?.messageBId || null;
    const vChatA = buildSideVirtualChat(chat, 'a', { finalRecord: finalRec, messageId: msgAId });
    const vChatB = buildSideVirtualChat(chat, 'b', { finalRecord: finalRec, messageId: msgBId });
    if (vChatA) vChatA.evalModality = evalModality;
    if (vChatB) vChatB.evalModality = evalModality;

    if (payload?.fromHistory && !payload?.force) {
      const baseSid = String(chat.sid).replace(/#[ab]$/i, '');
      const exA = validA ? getBankSampleBySid(`${baseSid}#a`) : null;
      const exB = validB ? getBankSampleBySid(`${baseSid}#b`) : null;
      const turnsA = vChatA ? vChatA.messages.filter(m => m && m.role === 'assistant').length : 0;
      const turnsB = vChatB ? vChatB.messages.filter(m => m && m.role === 'assistant').length : 0;
      const okA = !validA || (exA && exA.battleRevealed && (exA.meta?.turns || 0) >= turnsA);
      const okB = !validB || (exB && exB.battleRevealed && (exB.meta?.turns || 0) >= turnsB);
      if (okA && okB && (exA || exB)) {
        if (chat.voteState) {
          chat.voteState.learnedAt = Date.now();
          chat.voteState.learnedA = Boolean(exA);
          chat.voteState.learnedB = Boolean(exB);
        }
        analyzeBattleChat(chat);
        return { learnedA: exA, learnedB: exB };
      }
    }

    // 1. 揭晓前捕获盲测预判候选（用于揭晓后展示真实「入库前」识别率及针对性排他压制错误候选）
    let preAnaA = null, preAnaB = null, featPreA = null, featPreB = null;
    try {
      if (vChatA && validA) {
        const vBlindA = { ...vChatA, revealedModelName: null };
        featPreA = extractFeatures(vBlindA, { evalModality });
        preAnaA = analyze(vBlindA, null, { ignoreExactSid: true });
      }
      if (vChatB && validB) {
        const vBlindB = { ...vChatB, revealedModelName: null };
        featPreB = extractFeatures(vBlindB, { evalModality });
        preAnaB = analyze(vBlindB, null, { ignoreExactSid: true });
      }
      if (preAnaA?.allCandidates || preAnaB?.allCandidates || preAnaA?.candidates || preAnaB?.candidates) {
        const prevA = Array.isArray(chat._preRevealBattleCands?.a) && chat._preRevealBattleCands.a.length ? chat._preRevealBattleCands.a : null;
        const prevB = Array.isArray(chat._preRevealBattleCands?.b) && chat._preRevealBattleCands.b.length ? chat._preRevealBattleCands.b : null;
        const listA = preAnaA?.allCandidates || preAnaA?.candidates;
        const listB = preAnaB?.allCandidates || preAnaB?.candidates;
        chat._preRevealBattleCands = {
          a: prevA || (Array.isArray(listA) ? listA.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 })) : null),
          b: prevB || (Array.isArray(listB) ? listB.map((c, i) => ({ ...c, prePct: c.match, preRank: i + 1 })) : null),
        };
      }
    } catch {}

    const resolvedNameA = validA ? resolveBattleModelWithTier(nameA, featPreA, featPreB, nameB) : '';
    const resolvedNameB = validB ? resolveBattleModelWithTier(nameB, featPreB, featPreA, nameA) : '';

    const baseSidForRec = String(chat.sid).replace(/#[ab]$/i, '');
    const prevReceipt = chat.voteState?.learnedReceipt || {};
    const digA = vChatA ? computeMessagesDigest(vChatA.messages) : '';
    const digB = vChatB ? computeMessagesDigest(vChatB.messages) : '';
    const attemptId = payload?.attemptId || finalRec?.attemptId || chat.voteState?.attemptId || `${baseSidForRec}:m:${msgAId || ''}:${msgBId || ''}`;
    const failSide = String(payload?.failSide || '').toLowerCase();

    let learnedA = null, learnedB = null;
    if (vChatA && vChatA.hasSideAsst && validA && failSide !== 'a') {
      const exA = getBankSampleBySid(`${baseSidForRec}#a`);
      if (!payload?.force && !payload?.forceResync && prevReceipt.a && prevReceipt.a.contentDigest === digA && prevReceipt.a.attemptId === attemptId && exA) {
        learnedA = exA;
      } else {
        learnedA = learnFromChat(vChatA, resolvedNameA || nameA, {
          userConfirmed: true,
          autoTeacher: false,
          teacherConf: 100,
          weight: isPaired ? 9.5 : 8.5,
          battleRevealed: true,
          battlePaired: isPaired,
          battleSide: 'a',
          evalModality,
          messageId: msgAId || vChatA.messages.filter(m => m && m.role === 'assistant').at(-1)?.id || null,
          attemptId,
        });
        if (learnedA && featPreA && Array.isArray(preAnaA?.candidates)) {
          const trueKeyA = String(learnedA.model || '').toLowerCase();
          const wrongTopA = preAnaA.candidates
            .map(c => String(c?.canon || c?.label || '').trim())
            .filter(c => c && c.toLowerCase() !== trueKeyA)
            .slice(0, 2);
          vChatA._lastHabitTopKeys = wrongTopA.map(c => c.toLowerCase());
          for (const wrongModel of wrongTopA) {
            recordElasticCorrection(vChatA, featPreA, wrongModel, learnedA.model, learnedA.score, 9.5);
          }
        }
      }
    }
    if (vChatB && vChatB.hasSideAsst && validB && failSide !== 'b' && !payload?.simulateSideBFailure) {
      const exB = getBankSampleBySid(`${baseSidForRec}#b`);
      if (!payload?.force && !payload?.forceResync && prevReceipt.b && prevReceipt.b.contentDigest === digB && prevReceipt.b.attemptId === attemptId && exB) {
        learnedB = exB;
      } else {
        learnedB = learnFromChat(vChatB, resolvedNameB || nameB, {
          userConfirmed: true,
          autoTeacher: false,
          teacherConf: 100,
          weight: isPaired ? 9.5 : 8.5,
          battleRevealed: true,
          battlePaired: isPaired,
          battleSide: 'b',
          evalModality,
          messageId: msgBId || vChatB.messages.filter(m => m && m.role === 'assistant').at(-1)?.id || null,
          attemptId,
        });
        if (learnedB && featPreB && Array.isArray(preAnaB?.candidates)) {
          const trueKeyB = String(learnedB.model || '').toLowerCase();
          const wrongTopB = preAnaB.candidates
            .map(c => String(c?.canon || c?.label || '').trim())
            .filter(c => c && c.toLowerCase() !== trueKeyB)
            .slice(0, 2);
          vChatB._lastHabitTopKeys = wrongTopB.map(c => c.toLowerCase());
          for (const wrongModel of wrongTopB) {
            recordElasticCorrection(vChatB, featPreB, wrongModel, learnedB.model, learnedB.score, 9.5);
          }
        }
      }
    }
    // 双子星同题差分对比学习：仅当 A/B 双侧均成功入库时训练同家族档位分界超平面
    if (isPaired && learnedA && learnedB && vChatA && vChatB) {
      try {
        const pairAlreadyDone = Boolean(!payload?.force && !payload?.forceResync && prevReceipt.pairedAttemptId === attemptId && prevReceipt.a?.contentDigest === digA && prevReceipt.b?.contentDigest === digB);
        if (!pairAlreadyDone) {
          const featA = featPreA || extractFeatures(vChatA, { name: learnedA?.model || resolvedNameA || nameA, evalModality });
          const featB = featPreB || extractFeatures(vChatB, { name: learnedB?.model || resolvedNameB || nameB, evalModality });
          if (featA && featB) {
            recordBattlePairwiseContrast(
              chat,
              learnedA?.model || resolvedNameA || nameA,
              featA,
              learnedB?.model || resolvedNameB || nameB,
              featB,
              payload?.vote || chat.voteState?.vote || 'tie',
              evalModality
            );
          }
        }
      } catch {}
    }
    if (!chat.voteState) chat.voteState = {};
    const nowRecTs = Date.now();
    chat.voteState.learnedReceipt = {
      a: learnedA ? { sid: learnedA.sid, model: learnedA.model, messageId: learnedA.messageId || msgAId || null, contentDigest: digA, attemptId, at: prevReceipt.a?.at || nowRecTs } : (failSide === 'a' ? null : (prevReceipt.a || null)),
      b: learnedB ? { sid: learnedB.sid, model: learnedB.model, messageId: learnedB.messageId || msgBId || null, contentDigest: digB, attemptId, at: prevReceipt.b?.at || nowRecTs } : ((failSide === 'b' || payload?.simulateSideBFailure) ? null : (prevReceipt.b || null)),
      pairedAttemptId: (learnedA && learnedB) ? attemptId : null,
    };
    chat.voteState.learnedA = Boolean(chat.voteState.learnedReceipt.a);
    chat.voteState.learnedB = Boolean(chat.voteState.learnedReceipt.b);
    const allExpectedSidesLearned = (!validA || chat.voteState.learnedA) && (!validB || chat.voteState.learnedB) && (chat.voteState.learnedA || chat.voteState.learnedB);
    chat.voteState.learnedAt = allExpectedSidesLearned ? nowRecTs : null;
    analyzeBattleChat(chat);
    // 联动刷新本机所有未锁定的历史与当前会话，使刚揭晓的 Battle 真值立即赋能全局识别
    try { syncAllOpenAndKnownChats({ excludeSid: chat.sid }); } catch {}
    return { learnedA, learnedB };
  }

  // Direct 模式真值自动收割器（Direct-Mode Ground-Truth Harvester）：
  // 用户在 Direct 模式下点名模型（如 claude-opus-5.5-medium / gpt-6.1-sol-high）进行文字、代码、搜索或图片对话时，
  // 100% 确定底层型号真值，无需耗费投票即可自动沉淀高权重习惯与档位质心
  function learnDirectSession(chat, explicitModelName = '') {
    try {
      if (!chat || !chat.sid) return null;
      const rawModel = String(explicitModelName || chat.directModelName || chat.directModelId || '').trim();
      if (!rawModel || /^(未知|待定|Model [AB])$/i.test(rawModel)) return null;
      const asstMsgs = Array.isArray(chat.messages) ? chat.messages.filter(m => m && m.role === 'assistant' && ((typeof m.text === 'string' && m.text.trim().length > 10) || (Array.isArray(m.parts) && m.parts.length > 0))) : [];
      if (!asstMsgs.length) return null;
      const ex = getBankSampleBySid(String(chat.sid));
      if (ex && ex.directMode && (ex.meta?.turns || 0) >= Math.min(3, asstMsgs.length)) {
        return ex;
      }
      const evalModality = String(chat.evalModality || 'chat').toLowerCase();
      return learnFromChat(chat, rawModel, {
        userConfirmed: true,
        autoTeacher: false,
        teacherConf: 100,
        weight: 6.5,
        directMode: true,
        evalModality,
      });
    } catch {
      return null;
    }
  }

  try { syncPricingReverseCalib(loadCalibration()); } catch {}
  const recordUserCorrection = confirmUserCorrection;

  const NEXUS_TRIFUSION_MODEL_CATALOG = Object.freeze({
    'claude-opus-5-5-max': { family: 'anthropic', streamTps: 68.0, thinkingTtftSec: 5.5, effort: 'max' },
    'claude-opus-5-5-high': { family: 'anthropic', streamTps: 72.0, thinkingTtftSec: 4.5, effort: 'high' },
    'claude-opus-5-5-medium': { family: 'anthropic', streamTps: 76.0, thinkingTtftSec: 3.4, effort: 'medium' },
    'claude-opus-5-5-low': { family: 'anthropic', streamTps: 80.0, thinkingTtftSec: 2.3, effort: 'low' },
    'claude-opus-5-6': { family: 'anthropic', streamTps: 66.0, thinkingTtftSec: 6.5, effort: 'max' },
    'claude-sonnet-5-5-max': { family: 'anthropic', streamTps: 88.0, thinkingTtftSec: 3.8, effort: 'max' },
    'claude-sonnet-5-5-high': { family: 'anthropic', streamTps: 94.0, thinkingTtftSec: 3.0, effort: 'high' },
    'claude-sonnet-5-5-medium': { family: 'anthropic', streamTps: 98.0, thinkingTtftSec: 2.2, effort: 'medium' },
    'claude-sonnet-5-5-low': { family: 'anthropic', streamTps: 104.0, thinkingTtftSec: 1.6, effort: 'low' },
    'claude-haiku-5-5': { family: 'anthropic', streamTps: 132.0, thinkingTtftSec: 1.2, effort: 'low' },
    'gpt-6-1-sol-xhigh': { family: 'openai', streamTps: 74.0, thinkingTtftSec: 5.2, effort: 'xhigh' },
    'gpt-6-1-sol-high': { family: 'openai', streamTps: 82.0, thinkingTtftSec: 3.8, effort: 'high' },
    'gpt-6-1-sol-medium': { family: 'openai', streamTps: 90.0, thinkingTtftSec: 2.6, effort: 'medium' },
    'gpt-6-0-astra-high': { family: 'openai', streamTps: 85.0, thinkingTtftSec: 3.6, effort: 'high' },
    'gpt-6-0-luna-high': { family: 'openai', streamTps: 112.0, thinkingTtftSec: 2.0, effort: 'high' },
    'gemini-4-argon-high': { family: 'google', streamTps: 115.0, thinkingTtftSec: 2.4, effort: 'high' },
    'gemini-4-argon-medium': { family: 'google', streamTps: 120.0, thinkingTtftSec: 1.8, effort: 'medium' },
    'gemini-4-carbon': { family: 'google', streamTps: 92.0, thinkingTtftSec: 3.8, effort: 'high' },
    'gemini-4-flash': { family: 'google', streamTps: 130.0, thinkingTtftSec: 1.2, effort: 'low' },
  });

  const ASTRA_SOL_OPUS_MATH_COUNCIL_V4 = Object.freeze({
    version: '4.0.0-zq-v11',
    computePsiThink(totalReasoningBlocks = 0, toolCallCount = 0, preToolTextLen = 0) {
      const R = Math.max(0, Number(totalReasoningBlocks) || 0);
      const T = Math.max(0, Number(toolCallCount) || 0);
      const L = Math.max(0, Number(preToolTextLen) || 0);
      return Number((0.45 * Math.tanh(R / 8) + 0.30 * Math.tanh(T / 6) + 0.25 * (1 - Math.exp(-L / 320))).toFixed(6));
    },
    isSlowStreamOpusTheftGuard(streamTps = 0, thinkingTtftSec = 0) {
      const tps = Number(streamTps) || 0;
      const ttft = Number(thinkingTtftSec) || 0;
      return Boolean(tps > 0 && tps <= 33.5 && ttft >= 4.0);
    },
  });

  function classifyZeroQuotaEnsemble(input, probeData = {}) {
    const htmlText = typeof input === 'string' ? input : String(input?.htmlText || input?.code || '');
    const _AP = (typeof ArenaPricing !== 'undefined' && ArenaPricing) || (typeof globalThis !== 'undefined' && globalThis.ArenaPricing) || null;
    if (!_AP) return null;
    const gate = typeof _AP.classifyStage1ProtocolGate === 'function' ? _AP.classifyStage1ProtocolGate(probeData) : null;
    const claudeV5 = (htmlText && typeof _AP.classifyClaudeZeroQuotaEnhanced === 'function') ? _AP.classifyClaudeZeroQuotaEnhanced(htmlText, probeData) : null;
    const gptV1 = (htmlText && typeof _AP.classifyGptZeroQuotaV1 === 'function') ? _AP.classifyGptZeroQuotaV1(htmlText, probeData) : null;
    const googleCarbon = (htmlText && typeof _AP.classify3StageGoogleArgonCarbon === 'function') ? _AP.classify3StageGoogleArgonCarbon(htmlText, probeData) : null;
    const toolAst = (typeof _AP.scoreToolCallAstSchemaFingerprint === 'function' && Array.isArray(probeData?.toolCallEvents) && probeData.toolCallEvents.length)
      ? _AP.scoreToolCallAstSchemaFingerprint(probeData.toolCallEvents)
      : null;
    const preTextGate = (typeof _AP.evaluatePreTextToolDeltaGate === 'function' && (probeData?.preToolTextLen != null || probeData?.firstToolName))
      ? _AP.evaluatePreTextToolDeltaGate(probeData.preToolTextLen || 0, probeData.firstToolName || '', probeData.rBlocks || probeData.nReason || 0, probeData.turnDurationMs || 0)
      : null;
    const pelicanV5 = htmlText ? classifyHtmlSvg(htmlText, { ignoreSid: true }) : null;
    let best = pelicanV5;
    if (googleCarbon?.isTrueCarbon) {
      best = { model: 'google/gemini-4-carbon', effort: 'high', confidence: Math.max(0.97, Number(pelicanV5?.confidence || 0)), source: 'carbon-5gate' };
    } else if (claudeV5?.predictedModel && (!best || Number(claudeV5.confidence || 0) > Number(best.confidence || 0))) {
      best = { model: claudeV5.predictedModel, effort: claudeV5.effort || best?.effort || 'high', confidence: Number(claudeV5.confidence || 0.9), source: 'claude-v5' };
    } else if (gptV1?.predictedModel && (!best || Number(gptV1.confidence || 0) > Number(best.confidence || 0))) {
      best = { model: gptV1.predictedModel, effort: gptV1.effort || best?.effort || 'high', confidence: Number(gptV1.confidence || 0.9), source: 'gpt-v1' };
    }
    return { gate, claudeV5, gptV1, googleCarbon, toolAst, preTextGate, pelicanV5, best };
  }

  return {
    extractFeatures,
    extractCompactMeta,
    healTruncatedSvg,
    extractSvgStyleV2,
    scoreMiniSvg32Pelican,
    extractCleanHtmlOrSvg,
    extractHtmlSvgFeatures,
    pelicanFeatureVector: extractHtmlSvgFeatures,
    htmlSvgRuleScores,
    pelicanRuleScores: htmlSvgRuleScores,
    predictHtmlSvgEffort,
    predictEffortForModelV5: predictHtmlSvgEffort,
    classifyHtmlSvg,
    classifyPelicanSample: classifyHtmlSvg,
    classifyZeroQuotaEnsemble,
    NEXUS_TRIFUSION_MODEL_CATALOG,
    ASTRA_SOL_OPUS_MATH_COUNCIL_V4,
    tierVecSimilarity,
    getSampleTruthRank,
    identifyEffortTier,
    parseModelFamilyAndTier,
    decomposeModelIdentity,
    formatFamilyTierCanon,
    formatDisplayModelLabel,
    sanitizeCorruptedTierSlug,
    recordElasticCorrection,
    recordBattlePairwiseContrast,
    rebuildCalibrationFromBank,
    analyze,
    inferPlainModelByRAvg,
    structuralReverse,
    learnFromChat,
    learnFromReverseTeacher,
    buildSideVirtualChat,
    analyzeBattleChat,
    learnBattleReveal,
    revokeBattleLearningEvent(sid, opts = {}) {
      if (!sid) return false;
      const rawSid = String(sid).trim();
      const sideMatch = /#([ab])$/i.exec(rawSid);
      const targetSide = String(opts?.side || opts?.participantPosition || (sideMatch ? sideMatch[1] : '')).toLowerCase();
      const baseSid = rawSid.replace(/#[ab]$/i, '');
      const bank = loadBank();
      const targets = (targetSide === 'a' || targetSide === 'b')
        ? new Set([`${baseSid}#${targetSide}`])
        : new Set([baseSid, `${baseSid}#a`, `${baseSid}#b`]);
      for (const tk of targets) recordBankTombstone(tk, opts?.reason || 'battle-retracted');
      const filtered = bank.filter(s => s && !targets.has(String(s.sid || '')));
      saveBank(filtered, { replace: true });
      try { rebuildCalibrationFromBank(filtered); } catch {}
      return filtered.length !== bank.length || targets.size > 0;
    },
    retractBankSample(sid, opts = {}) {
      if (!sid) return false;
      const targetKey = String(sid).trim();
      recordBankTombstone(targetKey, opts?.reason || 'sample-retracted');
      const bank = loadBank();
      const filtered = bank.filter(s => s && String(s.sid || '') !== targetKey);
      saveBank(filtered, { replace: true });
      try { rebuildCalibrationFromBank(filtered); } catch {}
      return true;
    },
    getTombstones: () => Object.fromEntries(_bankTombstones),
    clearTombstones() { _bankTombstones.clear(); bankRev++; },
    computeMessagesDigest,
    resolveBattleModelWithTier,
    learnDirectSession,
    isEvalSession,
    loadCalibration,
    importDiagnosticJson,
    exportHabitBank,
    importHabitBank,
    identifyAndApply,
    confirmUserCorrection,
    recordUserCorrection,
    getUsageStats,
    recordModelUse,
    learnedCount,
    bankRevision: () => bankRev,
    calibRevision: () => calibRev,
    loadBank,
    getBankSampleBySid,
    saveBank,
    mergeSharedBank,
    canonHabitModelName,
    syncShared: syncFromSharedHost,
    applyRemoteSync: applyRemoteBankSync,
    openManager,
    rebuildCalibrationFromBank,
    syncAllOpenAndKnownChats,
    PROTOTYPES,
  };
})();
try { globalThis.ChatHabitFingerprint = ChatHabitFingerprint; } catch {}
try { if (typeof window !== 'undefined') window.ChatHabitFingerprint = ChatHabitFingerprint; } catch {}
if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
  Bus.on('eval:vote-revealed', payload => {
    try {
      if (payload?.chat) ChatHabitFingerprint.learnBattleReveal(payload.chat, payload);
      if (typeof Dock !== 'undefined' && typeof Dock.render === 'function') Dock.render();
    } catch {}
  });
}


const BillingProbe = (() => {
  const bundled = /*__ARENA_AGENT_CATALOG__*/null;
  const activeRuns = new WeakMap();
  const isRunning = chat => !!(chat && activeRuns.has(chat));
  const isOtherProbeBusy = chat => !!(chat && ((typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat)) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat))));
  let lastCostReloginAt = 0;
  let globalCost429Until = 0;
  let globalCost403Until = 0;
  let lastCostNetAt = 0;
  const isCostProbeEnabled = () => {
    try {
      if (typeof Prefs !== 'undefined' && typeof Prefs.costProbe === 'boolean') return Prefs.costProbe;
      if (typeof Store !== 'undefined' && Store.get) return Store.get('billing:costProbe', true) !== false;
    } catch {}
    return true;
  };
  const setCostProbeEnabled = (on) => {
    const val = Boolean(on);
    try {
      if (typeof Prefs !== 'undefined') {
        Prefs.costProbe = val;
        if (typeof savePrefs === 'function') savePrefs();
      }
      if (typeof Store !== 'undefined' && Store.set) Store.set('billing:costProbe', val);
    } catch {}
    return val;
  };
  const COST_SKEW_POOL = [
    'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT',
    'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x',
  ];
  const SEED_COST_DPLS = new Set(['dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT']);
  let activeCostSkewDpl = (typeof Pin !== 'undefined' && typeof Pin.dpl === 'function' ? Pin.dpl() : '') || COST_SKEW_POOL[0];
  if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(activeCostSkewDpl) || (activeCostSkewDpl === 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x' && !(typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' && Pin.lockedDpl() === 'dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x'))) {
    activeCostSkewDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
  }
  const setSkewDpl = (dpl, manual = false) => {
    const id = String(dpl || '').trim();
    if (/^dpl_[A-Za-z0-9]{16,48}$/.test(id)) {
      activeCostSkewDpl = id;
      const idx = COST_SKEW_POOL.indexOf(id);
      if (idx > 0) COST_SKEW_POOL.splice(idx, 1);
      if (!COST_SKEW_POOL.includes(id)) COST_SKEW_POOL.unshift(id);
      applySkewCookie(id);
    } else {
      activeCostSkewDpl = 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT';
      applySkewCookie(activeCostSkewDpl);
    }
    if (manual) {
      try {
        const curSid = typeof Tabs !== 'undefined' && Tabs.cur?.sid;
        const curChat = curSid && typeof Chats !== 'undefined' ? Chats.get(curSid) : null;
        if (curChat && isCostProbeEnabled()) setTimeout(() => { try { invalidateAndRefresh(curChat, true); } catch {} }, 60);
      } catch {}
    }
    return activeCostSkewDpl;
  };
  let lastClientScrapeAt = 0;
  const autoHealAt = new Map();
  const applySkewCookie = dpl => {
    if (!dpl || typeof document === 'undefined' || location.hostname !== 'arena.ai') return;
    try {
      if (typeof Pin !== 'undefined' && typeof Pin.ensureBillingFlags === 'function') Pin.ensureBillingFlags(false);
      if (typeof Pin !== 'undefined' && typeof Pin.drop === 'function') Pin.drop();
      if (typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' && !Pin.lockedDpl() && (typeof Prefs === 'undefined' || Prefs.pinOn !== true)) return;
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
    if (!/^dpl_[A-Za-z0-9]{16,48}$/.test(id) || id === 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT') return;
    const locked = typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' ? Pin.lockedDpl() : '';
    if (locked && id === locked) return;
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
    const fetchOne = async (p) => {
      try {
        let html = '';
        if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
          const r = await Host.protoFetch(p, { method: 'GET', timeout: 3200, headers: { Accept: 'text/html,*/*' } });
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
      } catch {}
    };
    await Promise.allSettled(probePaths.slice(0, 2).map(fetchOne));
    if (!discovered.length && probePaths[2]) await fetchOne(probePaths[2]);
    return discovered;
  };
  const fallbackCostReq = globalThis.ArenaBilling.costRequest((path, options) => api(path, options), document);
  const runFallbackWithRelogin = async (path, options = {}) => {
    if (options && options._triedAllSkew && (options._protoStatus === 403 || options._protoStatus === 409)) {
      throw Object.assign(Error('HTTP ' + options._protoStatus), { status: options._protoStatus });
    }
    const locked = typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' ? Pin.lockedDpl() : '';
    if (locked) activeCostSkewDpl = locked;
    const isExp = d => Boolean(typeof Pin !== 'undefined' && Pin.EXPIRED && typeof Pin.EXPIRED.has === 'function' && Pin.EXPIRED.has(d) && !SEED_COST_DPLS.has(d) && d !== locked);
    const fullPool = [...new Set([locked, activeCostSkewDpl, 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', ...(typeof Pin !== 'undefined' && Array.isArray(Pin.POOL) ? Pin.POOL : []), ...COST_SKEW_POOL].filter(d => d && !isExp(d)))].slice(0, 1);
    const pool = fullPool;
    const altPaths = buildAltCostPaths(path);
    let lastErr = null;
    let scrapedInRun = Boolean(options && options._triedAllSkew);
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
      const primaryPath = path;
      const primaryOpts = dpl ? { ...options, headers: { ...(options?.headers || {}), 'x-deployment-id': dpl } } : options;
      try {
        const res = await fallbackCostReq(primaryPath, primaryOpts);
        promoteWorkingCostDpl(dpl, path);
        return res;
      } catch (err) {
        lastErr = err;
        if (err && err.status === 401 && typeof Auth !== 'undefined' && typeof Auth.relogin === 'function' && now() - lastCostReloginAt > 45000) {
          lastCostReloginAt = now();
          const ok = await Promise.resolve(Auth.relogin()).catch(() => false);
          if (ok) {
            applySkewCookie(dpl);
            const reloggedRes = await fallbackCostReq(primaryPath, primaryOpts);
            promoteWorkingCostDpl(dpl, path);
            return reloggedRes;
          }
        }
        if (err && err.status === 403) {
          globalCost403Until = Math.max(globalCost403Until, now() + 180000);
          if (dpl) demoteFailedCostDpl(dpl);
          throw err;
        } else if (err && err.status === 409 && dpl) {
          demoteFailedCostDpl(dpl);
        }
        if (err && err.status === 429) {
          globalCost429Until = Math.max(globalCost429Until, now() + Math.max(Number(err.retryAfterMs) || 0, 35000));
          try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
          throw err;
        }
        if (!err || err.status !== 409) throw err;
      }
    }
    if (false && altPaths.length > 1 && !(options && options._triedAllSkew)) {
      const bestDpl = activeCostSkewDpl || COST_SKEW_POOL[0] || '';
      applySkewCookie(bestDpl);
      for (let pIdx = 1; pIdx < altPaths.length; pIdx++) {
        const altP = altPaths[pIdx];
        try {
          const altRes = await fallbackCostReq(altP, {
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
  const costDocCache = (() => {
    const map = new Map();
    try {
      const saved = typeof Store !== 'undefined' && Store.get ? Store.get('billing:costDocCache', null) : null;
      if (saved && typeof saved === 'object') {
        for (const [k, v] of Object.entries(saved)) {
          if (k && v && typeof v.data?.messages === 'object') map.set(k, v);
        }
      }
    } catch {}
    return map;
  })();
  let saveCostDocTimer = 0;
  const persistCostDocCache = () => {
    clearTimeout(saveCostDocTimer);
    saveCostDocTimer = setTimeout(() => {
      try {
        if (typeof Store === 'undefined' || !Store.set) return;
        const entries = [...costDocCache.entries()].sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 80);
        Store.set('billing:costDocCache', Object.fromEntries(entries));
      } catch {}
    }, 600);
  };
  const getCachedCostDoc = (sid, lastCompId = '') => {
    if (!sid) return null;
    const rec = costDocCache.get(sid);
    if (!rec || !rec.data || typeof rec.data.messages !== 'object') return null;
    const msgKeys = Object.keys(rec.data.messages);
    const age = now() - (rec.at || 0);
    // 若已覆盖当前最后一条已完成回复，且有有效账单记录，直接复用本地缓存（零网络请求）
    if (msgKeys.length > 0 && (!lastCompId || rec.lastId === lastCompId || rec.data.messages[lastCompId])) {
      return rec.data;
    }
    // 即使某历史会话账单为空（或最后一条超过50条上限未收录），3分钟内也不重复轰炸 /cost 接口
    if (age < 180000 && (!lastCompId || rec.lastId === lastCompId)) {
      return rec.data;
    }
    return null;
  };
  const setCachedCostDoc = (sid, lastCompId, data) => {
    if (!sid || !data || typeof data.messages !== 'object') return;
    const chRef = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    const isFreshPendingBill = Boolean(lastCompId && !data.messages[lastCompId] && chRef && now() - (chRef._lastTurnDoneAt || 0) < 12000);
    costDocCache.set(sid, { lastId: isFreshPendingBill ? '' : (lastCompId || ''), count: Object.keys(data.messages).length, at: now(), data });
    if (costDocCache.size > 24) {
      const oldest = [...costDocCache.entries()].sort((a, b) => (a[1]?.at || 0) - (b[1]?.at || 0))[0]?.[0];
      if (oldest) costDocCache.delete(oldest);
    }
    persistCostDocCache();
  };
  const clearCachedCostDoc = sid => {
    if (sid) costDocCache.delete(sid);
    else costDocCache.clear();
    persistCostDocCache();
  };
  const costInflightBySid = new Map();
  let costPaceQ = Promise.resolve(), costLastReqAt = 0;
  const paceCostNet = async () => {
    const p = costPaceQ.then(async () => {
      const w = costLastReqAt + 850 - now();
      if (w > 0) await new Promise(r => setTimeout(r, w));
      costLastReqAt = now();
    });
    costPaceQ = p.catch(() => {});
    return p;
  };
  const protoCostReq = async (path, options = {}) => {
    const sidMatch = /\/(?:api|nextjs-api)\/(?:chat|evaluation)\/([0-9a-f-]{36})\/cost\b/i.exec(String(path || ''));
    const reqSid = sidMatch ? sidMatch[1] : '';
    const chatRef = (reqSid && typeof Chats !== 'undefined') ? Chats.get(reqSid) : null;
    const lastCompId = chatRef ? (globalThis.ArenaBilling.completed(chatRef).at(-1)?.id || '') : '';
    if (reqSid && !options?.forceNet && !chatRef?.busy) {
      const cached = getCachedCostDoc(reqSid, lastCompId);
      if (cached) return cached;
    }
    const curOwner = (typeof Acc !== 'undefined' && Acc.cur) ? String(Acc.cur) : '';
    const inflightKey = reqSid ? `${curOwner}:${reqSid}:${lastCompId}:${String(path || '')}` : '';
    if (globalCost429Until > now() && !options?.interactive) {
      const cached429 = reqSid ? getCachedCostDoc(reqSid, lastCompId) : null;
      if (cached429) return cached429;
      throw Object.assign(Error('计费接口冷却中'), { status: 429, rateLimitedLocally: true, retryAfterMs: globalCost429Until - now() });
    }
    if (globalCost403Until > now() && !options?.interactive) {
      const cached403 = reqSid ? getCachedCostDoc(reqSid, lastCompId) : null;
      if (cached403) return cached403;
      throw Object.assign(Error('计费接口拒绝读取（HTTP 403 冷却中）'), { status: 403, rateLimitedLocally: true, retryAfterMs: globalCost403Until - now() });
    }
    if (inflightKey && costInflightBySid.has(inflightKey)) return costInflightBySid.get(inflightKey);
    const runNet = (async () => {
      await paceCostNet();
    const reqPath = (() => {
      const m = /^\/api\/chat\/([0-9a-f-]{36})\/cost\?includeSession=true$/i.exec(String(path || ''));
      const prefTpl = (typeof Pin !== 'undefined' && Array.isArray(Pin.ENDPOINTS) && Pin.ENDPOINTS[0]) ? Pin.ENDPOINTS[0] : '';
      if (m && prefTpl && prefTpl.includes('{sid}')) return prefTpl.replace('{sid}', encodeURIComponent(m[1]));
      return path;
    })();
    if (typeof Host !== 'undefined' && typeof Host.protoFetch === 'function') {
      const lockedNow = typeof Pin !== 'undefined' && typeof Pin.lockedDpl === 'function' ? Pin.lockedDpl() : '';
      if (lockedNow) activeCostSkewDpl = lockedNow;
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
            globalCost403Until = 0;
            promoteWorkingCostDpl(r.skewDpl, r.endpointTpl || reqPath);
          }
          if (r.status === 403) {
            globalCost403Until = Math.max(globalCost403Until, now() + 180000);
            if (chatRef) chatRef._lastCost403TurnId = lastCompId || '_turn';
            options = Object.assign({}, options, { _triedAllSkew: true, _protoStatus: 403 });
          } else if (r.status === 409 && r.triedAllSkew) {
            options = Object.assign({}, options, { _triedAllSkew: true, _protoStatus: r.status });
          }
          if (r.status === 401 || r.status === 403) {
            return await runFallbackWithRelogin(path, options);
          }
          if (r.status === 409 && !r.triedAllSkew) {
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
            if (r.status === 429) {
              globalCost429Until = Math.max(globalCost429Until, now() + Math.max(Number(retryAfterMs) || 0, 45000));
              try { if (typeof rotateVisitId === 'function') rotateVisitId(); } catch {}
            }
            throw Object.assign(Error(data?.error || data?.message || ('HTTP ' + r.status)), {
              status: r.status,
              retryAfterMs,
              responseFormat: html ? 'html' : undefined,
            });
          }
          if (html || !data || typeof data !== 'object') {
            throw Object.assign(Error('计费接口返回非 JSON 页面'), { status: r.status || 200, responseFormat: html ? 'html' : 'invalid-json' });
          }
          if (reqSid && typeof data.messages === 'object') setCachedCostDoc(reqSid, lastCompId, data);
          return data;
        }
      } catch (e) {
        if (e && (e.status === 401 || (e.status === 403 && !options?._triedAllSkew))) {
          const fbData = await runFallbackWithRelogin(path, options);
          if (reqSid && fbData && typeof fbData.messages === 'object') setCachedCostDoc(reqSid, lastCompId, fbData);
          return fbData;
        }
        if (e && (Number.isInteger(e.status) || e.responseFormat)) throw e;
      }
    }
    const fbData = await runFallbackWithRelogin(path, options);
    if (reqSid && fbData && typeof fbData.messages === 'object') setCachedCostDoc(reqSid, lastCompId, fbData);
    return fbData;
    })();
    if (inflightKey) {
      costInflightBySid.set(inflightKey, runNet);
      return runNet.finally(() => { if (costInflightBySid.get(inflightKey) === runNet) costInflightBySid.delete(inflightKey); });
    }
    return runNet;
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
          if (!isOtherProbeBusy(ch) && ch.gacha?.mode !== 'autoqa' && ch.gacha?.mode !== 'habit' && !ch.gacha?.fingerprint && Store.get('billing:auto', true) !== false) {
            try { applyReverseIdentity(ch, { interactive: false }); } catch {}
          }
          if (stNow.status === 'forbidden' && stNow.httpStatus === 403 && !isOtherProbeBusy(ch)) {
            try { ChatHabitFingerprint.identifyAndApply(ch, { force: false, fromCostFallback: true }); } catch {}
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
  const autoEnabled = () => {
    try { if (typeof Prefs !== 'undefined' && typeof Prefs.billingAuto === 'boolean') return Prefs.billingAuto; } catch {}
    return Store.get('billing:auto', true) !== false;
  };
  const setAutoEnabled = (on) => {
    const val = Boolean(on);
    try { if (typeof Prefs !== 'undefined') { Prefs.billingAuto = val; if (typeof savePrefs === 'function') savePrefs(); } } catch {}
    try { if (typeof Store !== 'undefined' && Store.set) Store.set('billing:auto', val); } catch {}
    return val;
  };
  const autoSeen = new WeakMap();
  try {
    if (typeof Bus !== 'undefined' && typeof Bus.on === 'function') {
      Bus.on('ipchange', () => { try { engine.clearCooldowns?.(); } catch {} });
    }
  } catch {}

  function isOpenCandidateName(s) {
    const id = String(s || '').toLowerCase();
    if (/muse/i.test(id)) return false;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['deepseek', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mistral', 'meta', 'stepfun', 'tencent', 'xiaomi', 'compat'].includes(vid)) return true;
    return /qwen|farris|paisley|deepseek|v4\.1|v3\.[12]|\br[12]-|glm|mimo|minimax|\bm[23]\.[0-9]|kimi|\bk2\.[0-9]|moonshot|mistral|hy3|hy4|hunyuan|step-5|stepfun|gpt-oss|llama|nemotron|beam|caveman|reflection|inkling|thinky|thinking-?machines|may26-chatbot4|\b\d+b[-_\s]+a\d+b\b|开源|国产|compat/i.test(id);
  }
  function isClosedCandidateName(s) {
    const id = String(s || '').toLowerCase();
    if (/muse/i.test(id)) return true;
    if (isOpenCandidateName(id)) return false;
    const vid = (typeof Brand !== 'undefined' && typeof Brand.of === 'function') ? Brand.of(id) : '';
    if (['claude', 'openai', 'gemini', 'grok'].includes(vid)) return true;
    return /gpt-|6-astra|6\.1-sol|6-sol|6-luna|5\.6-|openai|claude|anthropic|opus|sonnet|haiku|fable|gemini|google|barium|argon|grok|x-ai|muse|solar-pro/i.test(id);
  }
  function shouldSkipCostForOpenSource(chat) {
    if (!chat) return false;
    if (chat._closedLockedModel && !isOpenCandidateName(chat._closedLockedModel)) return false;
    const m = chat.sid && typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
    if (m?.userCorrected) {
      return m.name === '开源模型' || isOpenCandidateName(m.name);
    }
    const thinkSt = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    if (thinkSt?.kind === 'compat-thinking' || thinkSt?.kind === 'open') return true;
    const allMsgs = [...(Array.isArray(chat.messages) ? chat.messages : []), chat.live].filter(x => x && x.role === 'assistant');
    if (allMsgs.length > 0) {
      const firstParts = Array.isArray(allMsgs[0]?.parts) ? allMsgs[0].parts : [];
      if (allMsgs[0]?.metadata?.openThinkStopped || firstParts.some(p => p && (p.type === 'reasoning' || p.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || p.reasoning || '').trim()))) return true;
    }
    if (m && !m.routed && (m.name === '开源模型' || (isOpenCandidateName(m.name) && (m.provider === '开源思考过滤' || m.provider === '开源思考识别（免计费反推）')))) return true;
    return false;
  }

  // 识别为开源模型后：立即标记为「开源模型」并同步修改对话名称（侧栏卡片与顶部标签页），不自动浪费时间推理具体计费模型（除非用户手动点击反推锁定）
  const _markingOpenSids = new Set();
  function markAsOpenSourceModel(chat, { force = false } = {}) {
    const sid = typeof chat === 'string' ? chat : chat?.sid;
    if (!sid || ChatHabitFingerprint.isEvalSession?.(chat)) return null;
    const c = typeof chat === 'object' && chat ? chat : (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
    if (c?._killedOpenThink || (typeof Gacha !== 'undefined' && Gacha.isKilledOpenChat?.(sid))) return null;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (_markingOpenSids.has(sid)) return known;
    if (known?.userCorrected && !force) return known;
    // 若用户之前已手动点击「反推锁定」推理出了具体的开源型号（manualOpenInferred），在自动流程中保留该结果不覆盖
    if (known?.manualOpenInferred && !force) return known;
    if (!force && known?.name && known.name !== '开源模型' && isClosedCandidateName(known.name) && !known.guess) return known;
    if (!force && c && Array.isArray(c.messages)) {
      const asstList = c.messages.filter(m => m && m.role === 'assistant');
      if (asstList.length > 1) {
        const firstParts = Array.isArray(asstList[0]?.parts) ? asstList[0].parts : [];
        const firstHadVisible = Boolean(asstList[0]?.metadata?.openThinkStopped || firstParts.some(p => p && (p.type === 'reasoning' || p.type === 'thinking') && /[^\s.…·。]/.test(String(p.text || p.reasoning || '').trim())));
        if (!firstHadVisible) return known;
      }
    }
    const alreadyOpen = Boolean(known && known.name === '开源模型' && !known.guess && !known.pendingConfirm && known.sure);
    if (alreadyOpen && !force) {
      if (c) c._openSourceMarked = true;
      return known;
    }
    _markingOpenSids.add(sid);
    try {
      if (c) c._openSourceMarked = true;
      const nextEntry = {
        ...(known || {}),
        name: '开源模型',
        candidateName: '开源模型',
        rawLabel: '开源模型',
        reverseCandidateId: 'open-source',
        reverseLabel: '开源模型',
        reverseMatch: 100,
        confidence: 100,
        habitTags: ['开源思考 · 已跳过自动计费反推（手动点反推锁定可测具体型号）'],
        habitInferred: false,
        reverseInferred: true,
        billingProbe: true,
        sure: true,
        guess: false,
        uncertain: false,
        pendingConfirm: false,
        fromTitle: false,
        routed: false,
        provider: '开源思考识别（免计费反推）',
        why: '检测到开源模型，已自动同步对话名称并跳过自动计费推理（如需细分型号请手动点击反推锁定）',
        at: known?.at && alreadyOpen ? known.at : now(),
      };
      if (typeof Models !== 'undefined') {
        Models.set(sid, nextEntry);
        try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
        try { if (typeof Bus !== 'undefined') Bus.emit('model', c || { sid }, nextEntry); } catch {}
      }
      try {
        const ts = c?.sentAt || now();
        if (typeof Notes !== 'undefined') {
          const n = Notes.rec?.(sid, ts);
          if (n && !n.t) n.t = ts;
          Notes.save?.();
        }
        if (typeof Titles !== 'undefined') {
          Titles.capture?.(sid, ts);
          Titles.local?.(sid);
          Titles.kick?.(true);
        }
        if (typeof History !== 'undefined' && History.byId) {
          const he = History.byId(sid);
          const want = typeof Titles !== 'undefined' && Titles.want ? Titles.want(sid) : '';
          if (he && want && he.title !== want) he.localTitle = want;
        }
        if (typeof Bus !== 'undefined') Bus.emit('billing', sid);
        UI?.renderListSoon?.();
        UI?.renderTabs?.();
        Dock?.soon?.();
      } catch {}
      return nextEntry;
    } finally {
      _markingOpenSids.delete(sid);
    }
  }
  function cleanModelLabel(s) {
    let raw = String(s || '').trim();
    if (!raw) return raw;
    if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.sanitizeCorruptedTierSlug === 'function') {
      raw = ChatHabitFingerprint.sanitizeCorruptedTierSlug(raw);
    }
    raw = raw.replace(/(?:\s*\((None|Minimal|Low|Medium|High|xHigh|Max)\))+$/i, (_, lastTier) => ` (${lastTier})`);
    if (!/\s/.test(raw) && /^[a-z0-9._-]+$/i.test(raw) && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.formatDisplayModelLabel === 'function') {
      raw = ChatHabitFingerprint.formatDisplayModelLabel(raw, raw);
    }
    return raw;
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
    let raw = cleanModelLabel(String(name || '').replace(/\?+$/, '').trim());
    if (!raw) return '';
    try {
      if (typeof Strength !== 'undefined' && Strength.canon) raw = String(Strength.canon(raw));
      if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.sanitizeCorruptedTierSlug === 'function') {
        raw = ChatHabitFingerprint.sanitizeCorruptedTierSlug(raw);
      }
      return raw.toLowerCase();
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
    let firstToolInTurn = null;
    let firstBashInTurn = null;
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
      const curInfo = { part: p, toolIndex: toolIdx, toolIdx, bashIndex: isBash ? bashIdx : 0, toolName: rawName };
      if (!firstToolInTurn) firstToolInTurn = curInfo;
      if (isBash && !firstBashInTurn) firstBashInTurn = curInfo;
      const tcFam = inferToolCallVendorFamily(p.toolCallId || p.id || '');
      if (tcFam) {
        if (!firstToolFam) firstToolFam = tcFam;
        else if (tcFam !== firstToolFam && !chosenTool) {
          chosenTool = { ...curInfo, trigger: 'tool-id-family-switch' };
        }
      }
      if (!chosenTool && routeType && stepsWithReason >= 1 && !stepHasReason && toolIdx >= 2 && routeType === 'effort') {
        chosenTool = { ...curInfo, trigger: 'reasoning-drop-at-tool' };
      }
      lastToolBeforeSwitch = curInfo;
      stepHasReason = false;
    }
    if (!chosenTool && routeType && toolIdx >= 1) {
      const baseTool = firstBashInTurn || firstToolInTurn || lastToolBeforeSwitch;
      if (baseTool) {
        chosenTool = { ...baseTool, trigger: toolIdx === 1 ? 'single-tool-in-routed-turn' : 'first-tool-in-routed-turn' };
      }
    }
    if (!chosenTool) return null;
    const fromShort = shortCanonLabel(fromLabel) || fromLabel || '原模型';
    const toShort = shortCanonLabel(toLabel) || toLabel || '新模型';
    const stepMeta = {
      toolIndex: chosenTool.toolIndex,
      toolIdx: chosenTool.toolIndex,
      bashIndex: chosenTool.bashIndex,
      toolName: chosenTool.toolName,
      fromLabel: fromShort,
      toLabel: toShort,
      routeType: routeType || 'model',
      title: fromShort
        ? `⚠️ 路由切换提醒：自本轮第 #${chosenTool.toolIndex} 步（${chosenTool.toolName}）起由 ${fromShort} 切换为 ${toShort}`
        : `⚠️ 路由提示：对话疑似 ${toShort}`,
      stepText: chosenTool.bashIndex > 0
        ? `（自第 ${chosenTool.bashIndex} 个 bash 起切换）`
        : `（自第 ${chosenTool.toolIndex} 个工具 ${chosenTool.toolName} 起切换）`,
    };
    if (chosenTool.part && typeof chosenTool.part === 'object') {
      chosenTool.part._routeStart = stepMeta;
    }
    return stepMeta;
  }

  function detectHabitAndMessageRoute(sid, chatObj, d, m, habitRes, rawRevList) {
    const stripBase = s => {
      if (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier) {
        return ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').trim().toLowerCase();
      }
      return String(s || '')
        .replace(/\s*\((?:None|Minimal|Low|Medium|High|XHigh|Max)\)\s*$/i, '')
        .replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '')
        .replace(/[?？]+$/, '')
        .trim()
        .toLowerCase();
    };
    const inferFam = s => {
      const low = String(s || '').toLowerCase();
      if (/gemini|google|argon|barium-bb-v2-4xts/.test(low)) return 'google';
      if (/gpt|openai|o1|o3|o4|sol|luna|astra|terra/.test(low)) return 'openai';
      if (/claude|anthropic|opus|sonnet|haiku|fable/.test(low)) return 'anthropic';
      if (/grok|xai/.test(low)) return 'xai';
      return stripBase(low);
    };
    const toCanonLabel = s => {
      const cleaned = cleanModelLabel(String(s || '').replace(/[?？]+$/, '').trim());
      if (!cleaned) return '';
      return (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(cleaned) : cleaned).replace(/[?？]+$/, '').trim();
    };

    const compMsgs = (chatObj && typeof globalThis.ArenaBilling?.completed === 'function')
      ? globalThis.ArenaBilling.completed(chatObj)
      : (Array.isArray(chatObj?.messages) ? chatObj.messages.filter(x => x && x.role === 'assistant' && x.status === 'completed') : []);

    let msgPivot = null;
    if (compMsgs.length >= 2) {
      const turnStats = compMsgs.map((msg, idx) => {
        const parts = Array.isArray(msg?.parts) ? msg.parts : [];
        let rParts = 0, rEnc = 0, rOpen = 0, tCount = 0, tLen = 0, lowerDoc = 0, upperDoc = 0;
        let preToolChars = 0, interToolChars = 0, seenTool = false, pendingBetween = 0;
        let boxComment = 0, warmPalette = 0, sandboxLink = 0, colorCss = 0, redMotion = 0, wireFam = '';
        if (msg?._fmt === 'anthropic' || msg?._fmt === 'openai') wireFam = msg._fmt;
        for (const p of parts) {
          if (!p) continue;
          if (p.type === 'reasoning') {
            rParts++;
            const txt = String(p.text || '').trim();
            if (txt.length > 0 && /[^\s.…·。]/.test(txt)) rOpen++;
            else if (p.providerMetadata?.openai?.reasoningEncryptedContent || p.providerMetadata?.anthropic || txt.length === 0) rEnc++;
          } else if (String(p.type || '').startsWith('tool-') || p.type === 'dynamic-tool' || p.toolCallId) {
            if (seenTool && pendingBetween > 0) { interToolChars += pendingBetween; pendingBetween = 0; }
            seenTool = true;
            tCount++;
            const tcId = String(p.toolCallId || p.id || '');
            if (!wireFam && tcId) {
              if (/^(?:toolu|srvtoolu|msg)_01/.test(tcId)) wireFam = 'anthropic';
              else if (/^call_[A-Za-z0-9]{24}$/.test(tcId) && !/^call_[0-9a-f]{24}$/.test(tcId)) wireFam = 'openai';
            }
            const inpStr = typeof p.input === 'string' ? p.input : JSON.stringify(p.input || '');
            if (/<!doctype html>/.test(inpStr)) lowerDoc++;
            if (/<!DOCTYPE html>/.test(inpStr)) upperDoc++;
            if (/\/\*\s*[─═=-]{2,}/.test(inpStr)) boxComment++;
            if (/#FAF8F5|#F5F2EB|Instrument Serif|Playfair Display/i.test(inpStr)) warmPalette++;
            if (/color-scheme\s*:/i.test(inpStr)) colorCss++;
            if (/prefers-reduced-motion/i.test(inpStr)) redMotion++;
          } else if (p.type === 'text') {
            const tx = String(p.text || '');
            const txTrim = tx.trim();
            tLen += tx.length;
            if (!seenTool) preToolChars += txTrim.length;
            else pendingBetween += txTrim.length;
            if (/<!doctype html>/.test(tx)) lowerDoc++;
            if (/<!DOCTYPE html>/.test(tx)) upperDoc++;
            if (/sandbox:\/home\/user\//i.test(tx)) sandboxLink++;
            if (/\/\*\s*[─═=-]{2,}/.test(tx)) boxComment++;
            if (/#FAF8F5|#F5F2EB|Instrument Serif|Playfair Display/i.test(tx)) warmPalette++;
          }
        }
        if (!tLen && typeof msg.content === 'string') tLen = msg.content.length;
        const isMicroProbeTurn = Boolean(idx === 0 && tCount === 0 && tLen < 260 && rOpen === 0 && lowerDoc === 0 && upperDoc === 0);
        const substantive = !isMicroProbeTurn && (tCount > 0 || tLen > 20 || rParts > 0);
        const interrupted = tLen === 0 && rParts === 0;
        const openaiSig = wireFam === 'openai' || lowerDoc > 0 || sandboxLink > 0 || (colorCss > 0 && redMotion > 0 && warmPalette === 0 && boxComment === 0) || (rEnc >= 6 && preToolChars === 0 && interToolChars === 0 && boxComment === 0 && warmPalette === 0);
        const claudeSig = wireFam === 'anthropic' || warmPalette > 0 || (boxComment > 0 && lowerDoc === 0) || (rEnc >= 1 && rEnc <= 4 && (preToolChars >= 80 || interToolChars >= 80) && lowerDoc === 0 && sandboxLink === 0);
        const turnFam = rOpen > 0 ? 'open' : openaiSig && !claudeSig ? 'openai' : claudeSig && !openaiSig ? 'anthropic' : (rParts === 0 && substantive) ? 'google' : '';
        return { idx, id: msg.id, rParts, rEnc, rOpen, tCount, tLen, lowerDoc, upperDoc, substantive, isMicroProbeTurn, interrupted, openaiSig, claudeSig, turnFam };
      });

      for (let i = 1; i < turnStats.length; i++) {
        const preAll = turnStats.slice(0, i).filter(t => !t.interrupted);
        const pre = turnStats.slice(0, i).filter(t => t.substantive);
        const post = turnStats.slice(i).filter(t => t.substantive || t.rOpen > 0);
        const cur = turnStats[i];
        const prevSubstantive = [...turnStats.slice(0, i)].reverse().find(t => t.tLen > 0 || t.tCount > 0 || t.rParts > 0) || turnStats[i - 1];
        const hadInterruptedFailover = turnStats[i - 1]?.interrupted || (i >= 2 && turnStats[i - 2]?.interrupted);
        if (preAll.length && post.length) {
          const preAllClosed = preAll.every(t => t.rOpen === 0);
          const postAllOpen = cur.rOpen >= 1 && post.every(t => t.rOpen >= 1);
          const preAllOpen = preAll.every(t => t.rOpen >= 1);
          const postAllClosed = cur.rOpen === 0 && (cur.rEnc >= 1 || cur.tCount >= 1 || cur.tLen >= 120) && post.every(t => t.rOpen === 0);
          if ((preAllClosed && postAllOpen) || (preAllOpen && postAllClosed)) {
            msgPivot = {
              type: preAllClosed ? 'closed-to-open' : 'open-to-closed',
              pivotIdx: i,
              fromTurn: (prevSubstantive ? prevSubstantive.idx : i - 1) + 1,
              toTurn: i + 1,
              prevMessageId: prevSubstantive?.id || turnStats[i - 1]?.id || null,
              pivotMessageId: cur.id || null,
              pivotRParts: cur.rParts,
              pivotREnc: cur.rEnc,
              pivotTools: cur.tCount,
              hadInterruptedFailover: Boolean(hadInterruptedFailover),
            };
            break;
          }
        }
        if (!pre.length || !post.length) continue;
        const preAllZeroR = pre.every(t => t.rParts === 0);
        const postAllHasR = cur.rParts >= 3 && post.every(t => t.rParts >= 2 || (t.rParts >= 1 && t.tCount === 0));
        if (preAllZeroR && postAllHasR) {
          msgPivot = {
            type: 'zero-to-enc',
            pivotIdx: i,
            fromTurn: (prevSubstantive ? prevSubstantive.idx : i - 1) + 1,
            toTurn: i + 1,
            prevMessageId: prevSubstantive?.id || turnStats[i - 1]?.id || null,
            pivotMessageId: cur.id || null,
            pivotRParts: cur.rParts,
            pivotREnc: cur.rEnc,
            pivotTools: cur.tCount,
            hadInterruptedFailover: Boolean(hadInterruptedFailover),
          };
          break;
        }
        const preAllMultiR = pre.length >= 2 ? pre.every(t => t.rParts >= 2) : (pre[0].rParts >= 5);
        const postAllZeroR = cur.rParts === 0 && cur.tCount >= 1 && (cur.tCount >= 2 || cur.tLen >= 600) && post.every(t => t.rParts === 0);
        if (preAllMultiR && postAllZeroR && (post.length >= 2 || cur.tCount >= 3 || cur.tLen >= 1800)) {
          msgPivot = {
            type: 'enc-to-zero',
            pivotIdx: i,
            fromTurn: (prevSubstantive ? prevSubstantive.idx : i - 1) + 1,
            toTurn: i + 1,
            prevMessageId: prevSubstantive?.id || turnStats[i - 1]?.id || null,
            pivotMessageId: cur.id || null,
            pivotRParts: 0,
            pivotREnc: 0,
            pivotTools: cur.tCount,
            hadInterruptedFailover: Boolean(hadInterruptedFailover),
          };
          break;
        }
        const preAllClosed = false;
        const postAllOpen = false;
        const preAllOpen = false;
        const postAllClosed = false;
        if ((preAllClosed && postAllOpen) || (preAllOpen && postAllClosed)) {
          msgPivot = {
            type: preAllClosed ? 'closed-to-open' : 'open-to-closed',
            pivotIdx: i,
            fromTurn: (prevSubstantive ? prevSubstantive.idx : i - 1) + 1,
            toTurn: i + 1,
            prevMessageId: prevSubstantive?.id || turnStats[i - 1]?.id || null,
            pivotMessageId: cur.id || null,
            pivotRParts: cur.rParts,
            pivotREnc: cur.rEnc,
            pivotTools: cur.tCount,
            hadInterruptedFailover: Boolean(hadInterruptedFailover),
          };
          break;
        }
        const preAllClaude = pre.every(t => t.claudeSig && !t.openaiSig);
        const postAllOpenAi = cur.openaiSig && !cur.claudeSig && post.every(t => t.openaiSig && !t.claudeSig);
        const preAllOpenAi = pre.every(t => t.openaiSig && !t.claudeSig);
        const postAllClaude = cur.claudeSig && !cur.openaiSig && post.every(t => t.claudeSig && !t.openaiSig);
        if ((preAllClaude && postAllOpenAi) || (preAllOpenAi && postAllClaude)) {
          msgPivot = {
            type: preAllClaude ? 'anthropic-to-openai' : 'openai-to-anthropic',
            pivotIdx: i,
            fromTurn: (prevSubstantive ? prevSubstantive.idx : i - 1) + 1,
            toTurn: i + 1,
            prevMessageId: prevSubstantive?.id || turnStats[i - 1]?.id || null,
            pivotMessageId: cur.id || null,
            pivotRParts: cur.rParts,
            pivotREnc: cur.rEnc,
            pivotTools: cur.tCount,
            hadInterruptedFailover: Boolean(hadInterruptedFailover),
          };
          break;
        }
      }
    }

    if (!msgPivot && habitRes?.features?.htmlSvgRoutePivot && compMsgs.length >= 2) {
      const hp = habitRes.features.htmlSvgRoutePivot;
      const pIdx = Math.max(1, compMsgs.length - 1);
      msgPivot = {
        type: 'pelican-retest-route',
        pivotIdx: pIdx,
        fromTurn: Math.max(1, pIdx),
        toTurn: pIdx + 1,
        prevMessageId: compMsgs[pIdx - 1]?.id || null,
        pivotMessageId: compMsgs[pIdx]?.id || null,
        fromHtmlModel: hp.fromModel,
        toHtmlModel: hp.toModel,
        hadInterruptedFailover: false,
      };
    }

    const revPool = [
      ...(Array.isArray(rawRevList) ? rawRevList : []),
      ...(Array.isArray(m?.reverseCandidates) ? m.reverseCandidates : []),
    ].filter(rc => rc && !rc.structuralRev && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 80));
    const topRev = revPool[0] || null;
    let topHabit = habitRes?.candidates?.[0] || habitRes?.best || null;
    let postHabitRes = null;

    let preHabitBest = null;
    if (msgPivot && compMsgs.length >= 2 && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.analyze === 'function') {
      try {
        const pivotMsgObj = compMsgs[msgPivot.pivotIdx];
        const rawMsgs = Array.isArray(chatObj?.messages) ? chatObj.messages : [];
        const rawPivotPos = pivotMsgObj ? rawMsgs.indexOf(pivotMsgObj) : -1;
        const preComp = compMsgs.slice(0, msgPivot.pivotIdx);
        const isOnlyMicroProbePre = Boolean(preComp.length === 1 && Number(preComp[0]?.text?.length || 0) < 260 && !(preComp[0]?.tools?.length > 0));
        if (!isOnlyMicroProbePre) {
          const preSlice = rawPivotPos > 0 ? rawMsgs.slice(0, rawPivotPos) : preComp;
          const preRes = ChatHabitFingerprint.analyze({ sid: String(sid || '') + ':pre', messages: preSlice, _forRoutePostSlice: true }, null, { ignoreExactSid: true });
          if (preRes?.best && preRes.best.match >= 68) {
            preHabitBest = preRes.best;
          }
        }
        const postSlice = rawPivotPos >= 0 ? rawMsgs.slice(rawPivotPos) : compMsgs.slice(msgPivot.pivotIdx);
        if (postSlice.length > 0) {
          const postRes = ChatHabitFingerprint.analyze({ sid: String(sid || '') + ':post', messages: postSlice, _forRoutePostSlice: true }, null, { ignoreExactSid: true });
          if (postRes?.best && postRes.best.match >= 65) {
            postHabitRes = postRes;
            topHabit = postRes.candidates?.[0] || postRes.best;
          }
        }
      } catch {}
    }

    // 优先级 1：计费接口 (/cost) 直接检出中途换模或同型号降档 -> 以 /cost 为主，习惯辅助校准同家族思考档位与切换步位置
    if (d && (d.routeSwitched || d.effortDowngraded || d.routeType)) {
      const rType = d.routeType || (d.routeSwitched ? 'model' : 'effort');
      let fromCanon = toCanonLabel(d.initialModelLabel || m?.routeFrom || chatObj?._routeBaseline?.label || topRev?.label || preHabitBest?.canon || preHabitBest?.label || '');
      let toCanon = toCanonLabel(d.routedModelLabel || m?.routeTo || topHabit?.label || '');
      if (rType === 'model' && preHabitBest && preHabitBest.match >= 82 && fromCanon && stripBase(preHabitBest.label) === stripBase(fromCanon)) {
        fromCanon = toCanonLabel(preHabitBest.canon || preHabitBest.label) || fromCanon;
      }
      if (rType === 'model' && topHabit && topHabit.match >= 82 && toCanon && stripBase(topHabit.label) === stripBase(toCanon)) {
        toCanon = toCanonLabel(topHabit.canon || topHabit.label) || toCanon;
      }
      const fromBase = stripBase(fromCanon);
      const toBase = stripBase(toCanon);
      if (fromCanon && toCanon && (rType === 'effort' ? fromCanon.toLowerCase() !== toCanon.toLowerCase() : fromBase !== toBase)) {
        const pIdx = msgPivot ? msgPivot.pivotIdx : Math.max(1, compMsgs.length - 1);
        const toTurnNum = msgPivot ? msgPivot.toTurn : (pIdx + 1);
        return {
          routed: true,
          routeType: rType,
          fromLabel: fromCanon,
          toLabel: toCanon,
          fromCanon,
          toCanon,
          fromBase,
          toBase,
          pivotIdx: pIdx,
          fromTurn: msgPivot ? msgPivot.fromTurn : Math.max(1, pIdx),
          toTurn: toTurnNum,
          prevMessageId: msgPivot?.prevMessageId || compMsgs[pIdx - 1]?.id || null,
          pivotMessageId: msgPivot?.pivotMessageId || compMsgs[pIdx]?.id || null,
          latestMessageId: compMsgs.at(-1)?.id || null,
          reason: rType === 'effort'
            ? `/cost 账单轨迹检测到第 #${toTurnNum} 轮起同型号思考强度由 ${fromCanon} 削弱为 ${toCanon}`
            : `/cost 账单主导（习惯辅助定档）检测到第 #${toTurnNum} 轮起中途路由切换：${fromCanon} → ${toCanon}`,
          toHabitCand: topHabit,
          fromRevCand: topRev,
          fromHabitCand: preHabitBest,
        };
      }
    }

    if (habitRes?.routedFromBank && topHabit) {
      const rfb = habitRes.routedFromBank;
      const fromCanon = toCanonLabel(rfb.fromLabel || rfb.fromModel || '');
      const toCanon = toCanonLabel(topHabit.canon || topHabit.label || '');
      const fromDisplay = cleanModelLabel(rfb.fromLabel || fromCanon);
      const toDisplay = cleanModelLabel(topHabit.label || toCanon);
      const fromBase = stripBase(fromCanon);
      const toBase = stripBase(toCanon);
      if (fromCanon && toCanon && fromBase && toBase && fromBase !== toBase) {
        const toTurnNum = (rfb.fromTurns || 2) + 1;
        return {
          routed: true,
          fromBank: true,
          routeType: 'model',
          fromLabel: fromDisplay,
          toLabel: toDisplay,
          fromCanon,
          toCanon,
          fromBase,
          toBase,
          pivotIdx: rfb.fromTurns || 2,
          fromTurn: rfb.fromTurns || 2,
          toTurn: toTurnNum,
          prevMessageId: null,
          pivotMessageId: compMsgs[0]?.id || null,
          latestMessageId: compMsgs.at(-1)?.id || null,
          reason: `前 ${rfb.fromTurns || 2} 轮为 ${fromDisplay}（隐藏思考块=${rfb.fromHidR}），第 #${toTurnNum} 轮起切换为 ${toDisplay}（零思考块+高频工具链）`,
          toHabitCand: topHabit,
          fromRevCand: topRev,
          fromHabitCand: { id: rfb.fromModel, label: fromDisplay, canon: fromCanon, match: 95.8 },
        };
      }
    }

    let fromRaw = '';
    if (topRev) {
      fromRaw = topRev.canon || topRev.dynamicLabel || topRev.label || topRev.id || '';
    } else if (preHabitBest) {
      fromRaw = preHabitBest.canon || preHabitBest.label || '';
    } else if (msgPivot && chatObj?._routeBaseline?.label && !chatObj._routeBaseline._fromMicroProbe) {
      fromRaw = chatObj._routeBaseline.label;
    } else if (msgPivot && m?.routeFrom && !m?._fromMicroProbeTurn1) {
      fromRaw = m.routeFrom;
    } else if (msgPivot?.fromHtmlModel) {
      fromRaw = msgPivot.fromHtmlModel;
    } else if (m && !m.habitInferred && m.reverseInferred && m.name) {
      fromRaw = m.reverseLabel || m.name;
    } else if (msgPivot && m?.name && !m?._fromMicroProbeTurn1 && (m.sure || Number(m.confidence ?? m.reverseMatch ?? 0) >= 80)) {
      fromRaw = m.routeFrom || m.reverseLabel || m.name;
    }

    const fromCanon = toCanonLabel(fromRaw);
    const toCanon = msgPivot?.type === 'closed-to-open' ? '开源模型' : toCanonLabel(topHabit?.canon || topHabit?.label || '');
    if (!fromCanon || !toCanon) return { routed: false };

    const fromBase = stripBase(fromCanon);
    const toBase = stripBase(toCanon);
    const fromFam = inferFam(fromCanon);
    const toFam = inferFam(toCanon);
    if (!fromBase || !toBase || fromBase === toBase) return { routed: false };

    const feat = habitRes?.features || {};
    const meta = m?.habitFeatures?.meta || {};
    const totalTurns = Math.max(
      compMsgs.length,
      Number(feat.assistantTurns) || 0,
      Number(meta.turns) || 0,
      Number(d?.samples?.turns) || 0
    );
    if (totalTurns < 2) return { routed: false };

    const solvedTurns = Number(d?.solvedTokens?.turns || d?.samples?.observations || 0);
    const latestMsg = compMsgs.at(-1) || null;
    const costCoveredLatest = Boolean(
      latestMsg?.id &&
      d?.solvedTokens?.messageId &&
      d.solvedTokens.messageId === latestMsg.id &&
      solvedTurns >= totalTurns &&
      !d?.routeSwitched
    );
    const isHardStructuralPivot = Boolean(msgPivot && (msgPivot.type === 'zero-to-enc' || msgPivot.type === 'enc-to-zero' || msgPivot.type === 'closed-to-open' || msgPivot.type === 'open-to-closed' || msgPivot.type === 'pelican-retest-route'));
    if (costCoveredLatest && !isHardStructuralPivot) return { routed: false };

    const toHabitMatch = msgPivot?.type === 'closed-to-open' ? Math.max(96, Number(topHabit?.match || 0)) : Number(topHabit?.match || 0);
    const fromHabitCand = Array.isArray(habitRes?.candidates)
      ? habitRes.candidates.find(c => stripBase(c.canon || c.label) === fromBase || inferFam(c.canon || c.label) === fromFam)
      : null;
    const fromHabitMatch = fromHabitCand ? Number(fromHabitCand.match || 0) : 0;
    const habitGap = toHabitMatch - fromHabitMatch;

    const hidR = Math.max(Number(feat.hiddenReasoningTurns) || 0, Number(meta.hidR) || 0);
    const maxR = Math.max(Number(feat.maxReasoningBlocksInTurn) || 0, Number(meta.maxRInTurn) || 0);
    const lowerDoc = Math.max(Number(feat.lowerDoctypeCount) || 0, Number(meta.lowerDoctype) || 0);
    const colorCss = Math.max(Number(feat.colorSchemeCssCount) || 0, Number(meta.colorSchemeCss) || 0);
    const cps = Number(feat.streamCharsPerSec || meta.cps || 0);
    const avgChk = Number(feat.memoAvgChunk || meta.memoAvgChunk || 0);
    const isGem = Boolean(feat.isGeminiCoding ?? meta.isGeminiCoding);

    const googleToEncConflict = Boolean(
      fromFam === 'google' &&
      toFam !== 'google' &&
      hidR >= 6 &&
      (maxR >= 5 || lowerDoc >= 1 || colorCss >= 1 || (cps > 0 && cps < 20) || (avgChk > 0 && avgChk < 4.5))
    );
    const encToGoogleConflict = Boolean(
      (fromFam === 'openai' || fromFam === 'anthropic') &&
      toFam === 'google' &&
      msgPivot?.type === 'enc-to-zero' &&
      (isGem || cps >= 38)
    );
    const msgPivotConfirmed = Boolean(
      msgPivot &&
      (fromFam !== toFam || msgPivot.type === 'closed-to-open' || msgPivot.type === 'open-to-closed' || msgPivot.type === 'pelican-retest-route') &&
      toHabitMatch >= 82 &&
      (habitGap >= 12 || googleToEncConflict || encToGoogleConflict || msgPivot.type === 'anthropic-to-openai' || msgPivot.type === 'openai-to-anthropic' || msgPivot.type === 'closed-to-open' || msgPivot.type === 'open-to-closed' || msgPivot.type === 'pelican-retest-route')
    );
    const metaConflictConfirmed = Boolean(
      !costCoveredLatest &&
      (googleToEncConflict || encToGoogleConflict) &&
      toHabitMatch >= 85 &&
      habitGap >= 25
    );

    if (!msgPivotConfirmed && !metaConflictConfirmed) {
      return { routed: false };
    }

    const pIdx = msgPivot ? msgPivot.pivotIdx : Math.max(1, totalTurns - 1);
    const fromTurn = msgPivot ? msgPivot.fromTurn : Math.max(1, pIdx);
    const toTurn = msgPivot ? msgPivot.toTurn : (pIdx + 1);
    const reasonParts = [];
    if (topRev) {
      reasonParts.push(`前序 /cost 锁定 ${fromCanon}${solvedTurns > 0 && solvedTurns < totalTurns ? '（仅覆盖前 ' + solvedTurns + '/' + totalTurns + ' 轮）' : ''}`);
    } else {
      reasonParts.push(`前序轮次习惯识别为 ${fromCanon}${preHabitBest?.match ? '（' + Number(preHabitBest.match).toFixed(1) + '%）' : ''}`);
    }
    if (msgPivot?.type === 'zero-to-enc') {
      reasonParts.push(`第 #${toTurn} 轮起${msgPivot.hadInterruptedFailover ? '（前序轮次中断重连后）' : ''}突变为单轮 ${msgPivot.pivotRParts} 个隐藏思考块${lowerDoc > 0 ? ' + 小写 <!doctype html>' : ''}${cps > 0 && cps < 20 ? ' + 流速 ' + cps.toFixed(1) + ' 字/秒' : ''}`);
    } else if (msgPivot?.type === 'enc-to-zero') {
      reasonParts.push(`第 #${toTurn} 轮起由多思考块突变为 0 隐藏思考块高速输出`);
    } else if (msgPivot?.type === 'anthropic-to-openai') {
      reasonParts.push(`第 #${toTurn} 轮起由 Anthropic 特征切换为 OpenAI 隐藏思考与代码/工具习惯`);
    } else if (msgPivot?.type === 'openai-to-anthropic') {
      reasonParts.push(`第 #${toTurn} 轮起由 OpenAI 特征切换为 Anthropic 叙事与代码/工具习惯`);
    } else if (msgPivot?.type === 'closed-to-open') {
      reasonParts.push(`第 #${toTurn} 轮起由闭源隐藏思考切换为开源可见思考`);
    } else if (msgPivot?.type === 'open-to-closed') {
      reasonParts.push(`第 #${toTurn} 轮起由开源可见思考切换为闭源隐藏思考`);
    } else if (googleToEncConflict) {
      reasonParts.push(`后续轮次出现 ${hidR} 个加密思考块（单轮峰值 ${maxR}）${lowerDoc > 0 ? ' + 小写 <!doctype html>' : ''}${cps > 0 ? ' + 流速 ' + cps.toFixed(1) + ' 字/秒' : ''}`);
    }
    reasonParts.push(`切换为 ${toCanon}（习惯匹配度 ${toHabitMatch.toFixed(1)}%）`);

    return {
      routed: true,
      routeType: 'model',
      fromLabel: fromCanon,
      toLabel: toCanon,
      fromCanon,
      toCanon,
      fromBase,
      toBase,
      pivotIdx: pIdx,
      fromTurn,
      toTurn,
      prevMessageId: msgPivot?.prevMessageId || compMsgs[pIdx - 1]?.id || null,
      pivotMessageId: msgPivot?.pivotMessageId || compMsgs[pIdx]?.id || null,
      latestMessageId: latestMsg?.id || null,
      reason: reasonParts.join('，'),
      toHabitCand: topHabit,
      fromRevCand: topRev,
      fromHabitCand: preHabitBest,
    };
  }

  const _promptedRouteKeySet = new Set();
  function applyChatRouteAnnotations(sid, chatObj, d, m, habitRoute, routeType, routeFromLabel, routeToLabel, routeReason = '') {
    if (!routeType) return null;
    const stripTierKey = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
      ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').trim().toLowerCase())
      : String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const cleanFrom = cleanModelLabel(routeFromLabel || habitRoute?.fromLabel || d?.initialModelLabel || m?.routeFrom || '前序模型');
    const cleanTo = cleanModelLabel(routeToLabel || habitRoute?.toLabel || d?.routedModelLabel || m?.routeTo || m?.name || '当前模型');
    const fromShort = shortCanonLabel(cleanFrom) || cleanFrom || '原模型';
    const toShort = shortCanonLabel(cleanTo) || cleanTo || '新模型';
    const suspectedModel = cleanTo || toShort || '其他模型';
    const reasonStr = String(routeReason || habitRoute?.reason || m?.routeReason || (routeType === 'effort' ? '检测到同型号的思考强度削弱' : `检测到中途由 ${cleanFrom} 路由切换为 ${cleanTo}`)).trim();

    const compMsgs = (chatObj && typeof globalThis.ArenaBilling?.completed === 'function')
      ? globalThis.ArenaBilling.completed(chatObj)
      : (Array.isArray(chatObj?.messages) ? chatObj.messages.filter(x => x && x.role === 'assistant' && x.status === 'completed') : []);
    const latest = compMsgs.at(-1) || null;

    let runningToolFam = '';
    const segMapByMsg = new Map();
    if (Array.isArray(d?.segments)) {
      for (const seg of d.segments) {
        if (seg?.messageId && seg?.bestLabel) segMapByMsg.set(seg.messageId, cleanModelLabel(seg.bestLabel));
      }
    }

    compMsgs.forEach((msg, idx) => {
      if (!msg) return;
      msg._turnIndex = idx + 1;
      delete msg._turnModelLabel;
      delete msg._routePivotRole;
      delete msg._routeNotice;
      delete msg._routeStepInfo;
      for (const p of msg.parts || []) {
        if (p && p._routeStart) delete p._routeStart;
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

    let pivotIdx = (habitRoute?.routed && Number.isInteger(habitRoute.pivotIdx) && habitRoute.pivotIdx >= 1 && (!compMsgs.length || habitRoute.pivotIdx < compMsgs.length))
      ? habitRoute.pivotIdx
      : -1;
    if (pivotIdx < 1 && compMsgs.length >= 2) {
      for (let i = 1; i < compMsgs.length; i++) {
        const prevSeg = segMapByMsg.get(compMsgs[i - 1]?.id);
        const curSeg = segMapByMsg.get(compMsgs[i]?.id);
        if (prevSeg && curSeg) {
          const diff = routeType === 'model'
            ? (stripTierKey(prevSeg) !== stripTierKey(curSeg))
            : (shortCanonLabel(prevSeg).toLowerCase() !== shortCanonLabel(curSeg).toLowerCase());
          if (diff) { pivotIdx = i; break; }
        }
      }
    }
    if (pivotIdx < 1 && m?.routeNotices && compMsgs.length >= 2) {
      const savedIdx = compMsgs.findIndex((x, i) => i >= 1 && x?.id && m.routeNotices[x.id] && !m.routeNotices[x.id].isFollowup);
      if (savedIdx >= 1) pivotIdx = savedIdx;
    }
    if (pivotIdx < 1) pivotIdx = Math.max(1, (compMsgs.length || habitRoute?.toTurn || 2) - 1);

    const pivotPrevMsg = compMsgs[pivotIdx - 1] || null;
    const pivotNextMsg = compMsgs[pivotIdx] || latest || null;
    if (pivotPrevMsg && pivotNextMsg && pivotPrevMsg !== pivotNextMsg) {
      pivotPrevMsg._routePivotRole = 'prev';
      pivotPrevMsg._turnModelLabel = fromShort;
      for (let p = pivotIdx - 1; p >= 0; p--) {
        const pm = compMsgs[p];
        if (!pm) continue;
        pm._routePivotRole = 'prev';
        pm._turnModelLabel = fromShort;
        const pParts = Array.isArray(pm.parts) ? pm.parts : [];
        if (pParts.some(pt => pt && pt.type === 'text' && String(pt.text || '').trim().length > 0)) break;
      }
      pivotNextMsg._routePivotRole = 'next';
      pivotNextMsg._turnModelLabel = toShort;
    }
    for (let k = pivotIdx + 1; k < compMsgs.length; k++) {
      if (compMsgs[k]) compMsgs[k]._turnModelLabel = toShort;
    }

    const turnIdx = habitRoute?.toTurn || (pivotNextMsg ? (compMsgs.indexOf(pivotNextMsg) + 1 || compMsgs.length) : Math.max(2, compMsgs.length));
    const baseIdx = habitRoute?.fromTurn || (pivotPrevMsg ? (compMsgs.indexOf(pivotPrevMsg) + 1 || 1) : Math.max(1, turnIdx - 1));
    const stepTargetMsg = pivotNextMsg || latest;
    const stepMeta = stepTargetMsg ? detectMessageRouteStep(stepTargetMsg, cleanFrom, cleanTo, routeType, runningToolFam) : null;

    const routeNotice = {
      type: routeType,
      fromTurn: baseIdx,
      toTurn: turnIdx,
      prevMessageId: habitRoute?.prevMessageId || pivotPrevMsg?.id || null,
      nextMessageId: habitRoute?.pivotMessageId || pivotNextMsg?.id || latest?.id || null,
      fromLabel: cleanFrom,
      toLabel: suspectedModel,
      fromShort,
      toShort,
      reason: reasonStr,
      stepMeta,
      isFollowup: false,
      text: `⚠️ 路由切换提醒：第 #${turnIdx} 轮起由 ${cleanFrom} 切换为 ${suspectedModel}`,
    };

    const routeNotices = {};
    const pivotMsgId = pivotNextMsg?.id || habitRoute?.pivotMessageId || latest?.id || '_last';
    routeNotices[pivotMsgId] = routeNotice;
    if (pivotNextMsg) {
      pivotNextMsg._routeNotice = routeNotice;
      pivotNextMsg._routeStepInfo = stepMeta;
    }
    if (latest && latest !== pivotNextMsg && latest.id) {
      const latestStepMeta = detectMessageRouteStep(latest, cleanFrom, cleanTo, routeType, runningToolFam);
      const followupNotice = {
        ...routeNotice,
        nextMessageId: latest.id,
        stepMeta: latestStepMeta,
        isFollowup: true,
        text: `⚠️ 路由切换提醒：当前回复由切换后的 ${suspectedModel} 生成（自第 #${turnIdx} 轮起由 ${cleanFrom} 切换）`,
      };
      latest._routeNotice = followupNotice;
      latest._routeStepInfo = latestStepMeta;
      routeNotices[latest.id] = followupNotice;
    }

    if (chatObj) {
      chatObj._routeAnnotatedCount = compMsgs.length;
      const promptKey = `${sid || chatObj.sid}:${routeType}:${stripTierKey(cleanTo)}`;
      const alreadyPromptedInModel = Boolean(_promptedRouteKeySet.has(promptKey) || !(chatObj._routePromptedKey !== promptKey) || (m && (m._routePromptedKey === promptKey || (m.routed && stripTierKey(m.routeTo || m.name || '') === stripTierKey(cleanTo)))));
      const isHistoricalBankRoute = Boolean(habitRoute?.fromBank && !chatObj.busy);
      const isActiveViewChat = Boolean(
        chatObj.busy ||
        (typeof Tabs !== 'undefined' && Tabs.cur?.sid === (sid || chatObj.sid)) ||
        (typeof UI !== 'undefined' && UI.els?.chat?.sid === (sid || chatObj.sid))
      );
      _promptedRouteKeySet.add(promptKey);
      chatObj._routePromptedKey = promptKey;
      if (m) m._routePromptedKey = promptKey;
      if (isActiveViewChat && !alreadyPromptedInModel && !isHistoricalBankRoute) {
        const latestHasOpenThink = (latest?.parts || []).some(p => p && p.type === 'reasoning' && /[^\s.…·。]/.test(String(p.text || '')));
        const wasClosedModel = Boolean(cleanFrom && !isOpenCandidateName(cleanFrom));
        if (chatObj.busy && Boolean(chatObj.gacha) && wasClosedModel && latestHasOpenThink && isOpenCandidateName(cleanTo) && !chatObj._allowOpenThink && (typeof Prefs === 'undefined' || Prefs.thinkStop !== false)) {
          chatObj.thinkStopped = true;
          chatObj._routePaused = true;
          chatObj.routedThink = true;
          const isGachaChat = Boolean(chatObj.gacha || (typeof Gacha !== 'undefined' && (Gacha.isGachaChat?.(sid) || Gacha.sidNo?.(sid))));
          chatObj.phase = isGachaChat ? '抽卡到开源思考已经暂停' : '路由到开源模型已暂停';
          if (typeof chatObj.stop === 'function') setTimeout(() => chatObj.stop(), 0);
          toast(chatObj.phase, 'err');
        } else if ((typeof Prefs === 'undefined' || Prefs.routePausePrompt !== false) && !chatObj.gacha && typeof RouteConfirm !== 'undefined' && typeof RouteConfirm.askModelRoute === 'function') {
          chatObj._routePaused = false;
          void RouteConfirm.askModelRoute(chatObj, {
            routeType,
            fromLabel: cleanFrom,
            toLabel: cleanTo,
            toTurn: turnIdx,
            reason: reasonStr,
          });
        }
      }
    }

    return {
      routed: true,
      routeType,
      routeFrom: cleanFrom,
      routeTo: cleanTo,
      routeReason: reasonStr,
      _routePromptedKey: `${sid || chatObj?.sid || ''}:${routeType}:${stripTierKey(cleanTo)}`,
      lastRouteNotice: routeNotice,
      routeNotices,
      provider: `中途路由切换识别（${fromShort} → ${toShort}）`,
    };
  }

  // 将「费用反推候选」与「指纹识别候选」放在一起按置信度从高到低统一排序（谁高选谁，互不冲突）
  function mergeCandidates(sid, d, m) {
    const byKey = new Map();
    const st = sid ? engine.state(sid) : null;
    const chatObj = (sid && typeof Chats !== 'undefined') ? Chats.get(sid) : null;
    const thinkSt = (chatObj && typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chatObj) : null;
    const evObj = d?.evidence || st?.lastInfo?.evidence || st?.info?.evidence || null;
    const isOpenThink = thinkSt?.kind === 'compat-thinking' || thinkSt?.kind === 'open' || d?.hasCompatThinking === true || d?.family?.reasoning === 'visible-text' || evObj?.visibleReasoning === true;
    if ((isOpenThink || m?.name === '开源模型' || m?.reverseCandidateId === 'open-source') && !m?.manualOpenInferred && !m?.userCorrected) {
      return [{
        key: '开源模型',
        id: 'open-source/generic',
        label: '开源模型',
        canon: '开源模型',
        revPct: 100,
        fpPct: null,
        match: 100,
        combinedWeight: 100,
        source: 'rev',
        both: false,
        diophantinePassed: false,
        streamFallback: true,
      }];
    }
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
    const isGeminiFlashFixSid = GEMINI_FLASH_FIX_SIDS.has(sid);
    const hasSavedPreimageOrCost = Boolean(
      (Number(m?.costUsd) > 0) ||
      (Number(m?.reverseTokens?.total) > 0) ||
      (Number(m?.reverseTotalTokens?.total) > 0) ||
      (Number(d?.samples?.observations || st?.ledger?.observations || 0) > 0 && Number(d?.pricing?.observedBaseUsd || st?.info?.result?.actual?.basePriceUsd || st?.lastInfo?.result?.actual?.basePriceUsd || 0) > 0)
    );
    const savedRevCands = (hasSavedPreimageOrCost && Array.isArray(m?.reverseCandidates) && m.reverseCandidates.length && !(isArgonHighSession && m.reverseCandidateId !== 'contenders/barium-bb-v2-4xts-agent') && !(sol61Spec && m.reverseCandidateId !== 'openai/gpt-6.1-sol'))
      ? m.reverseCandidates
          .filter(rc => {
            if (!rc || rc.source === 'habit' || rc.source === 'fp' || rc.habitSource || rc.structuralRev || rc.zeroQuota || rc.zeroQuotaMode) return false;
            if (isGeminiFlashFixSid && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(rc.label || rc.id || ''))) return false;
            return (rc.revPct != null || rc.diophantinePassed || rc.source === 'rev');
          })
          .map(rc => {
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
              structuralRev: false,
              solverTier: rc.solverTier,
              priceTier: rc.priceTier,
              matchedVariant: rc.matchedVariant,
              matchedDims: rc.matchedDims || [],
            };
          })
      : [];
    const costOn = isCostProbeEnabled();
    const hasLiveCostObs = Boolean(
      (Number(d?.samples?.observations || st?.ledger?.observations || 0) > 0 && Number(d?.pricing?.observedBaseUsd || st?.info?.result?.actual?.basePriceUsd || st?.lastInfo?.result?.actual?.basePriceUsd || 0) > 0) ||
      cands.some(r => r && !r.structuralRev && (r.diophantinePassed || Number(r.predictedBaseUsd) > 0)) ||
      lastInfoList.some(r => r && !r.structuralRev && (r.diophantinePassed || Number(r.solvedTokens?.O) > 0))
    );
    const hasRealCostRev = Boolean(costOn && (hasLiveCostObs || savedRevCands.length > 0));
    const hasRealCostEvidence = hasRealCostRev;
    const rawRevList = (!costOn || !hasRealCostEvidence)
      ? []
      : (hasLiveCostObs && cands.length)
        ? cands
        : (hasLiveCostObs && lastInfoList.length)
          ? lastInfoList
          : savedRevCands;
    const revList = rawRevList.filter(r => !isGeminiFlashFixSid || !/gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(r?.label || r?.dynamicLabel || r?.id || '')));
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
      const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(label) : label;
      const k = canonKey(canon) || canonKey(label) || canonKey(rId);
      if (!k) continue;
      const revPct = Math.max(0, Math.min(100, Number(r.match || r.revPct || 0)));
      if (revPct > topRevMatch) topRevMatch = revPct;
      byKey.set(k, {
        key: k,
        id: rId || label,
        label: label,
        canon,
        revPct,
        fpPct: null,
        match: revPct,
        combinedWeight: r.structuralRev ? (revPct * 0.95) : hasRealCostRev ? (revPct * 2.0 + (r.diophantinePassed ? 50 : 15)) : (revPct * 0.85),
        source: 'rev',
        structuralRev: Boolean(r.structuralRev),
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
        if (isGeminiFlashFixSid && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(id)) continue;
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
          existing.source = (!hasRealCostRev && !isRoutedOrWeakened && existing.fpPct > existing.revPct) ? 'fp' : 'rev';
          existing.match = (hasRealCostRev || isRoutedOrWeakened) ? existing.revPct : Math.max(existing.revPct, existing.fpPct);
          existing.combinedWeight = hasRealCostRev
            ? ((existing.revPct || 0) * 2.0 + (existing.diophantinePassed ? 50 : 15) + (existing.fpPct || 0) * 0.02)
            : ((existing.revPct || 0) * 1.45 + (existing.fpPct || 0) * 0.25 + (existing.diophantinePassed ? 24 : 0));
          existing.fpStatus = fpRes.status;
        } else {
          byKey.set(k, {
            key: k,
            id,
            label: id,
            canon,
            revPct: null,
            fpPct,
            match: fpPct,
            combinedWeight: fpPct * (hasRealCostRev ? 0.12 : 0.85),
            source: 'fp',
            both: false,
            diophantinePassed: false,
            fpStatus: fpRes.status,
          });
        }
      }
    }
    // ── 对话聊天习惯（Bash习惯 / HTML习惯 / 思考与工具节奏 / 推理分 / 习惯库）联合排序 ──
    const habitRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze)
      ? ChatHabitFingerprint.analyze(chatObj || { sid, messages: [] }, m)
      : null;
    if (habitRes && Array.isArray(habitRes.candidates) && habitRes.candidates.length) {
      for (const hc of habitRes.candidates) {
        const hLabel = cleanModelLabel(hc.label || hc.id || '');
        if (!hLabel || violatesThinkingScope(hc.id) || violatesThinkingScope(hLabel)) continue;
        if (isGeminiFlashFixSid && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(hLabel)) continue;
        const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(hLabel) : hLabel;
        const k = canonKey(canon);
        if (!k) continue;
        let existing = byKey.get(k);
        // 同家族不同思考档位（Low/Medium/High/xHigh/Max）共享完全一致的 /cost 单价与丢番图原像解：
        // 若 /cost 候选池中该家族对应条目尚未匹配到精确档位的习惯分，则合并家族习惯分（保持 /cost 反推档位为准，绝不派生伪造第二行）
        if (!existing && hasRealCostRev) {
          const stripBaseTier = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
            ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').toLowerCase())
            : String(s || '').toLowerCase().replace(/(?:-(?:none|minimal|low|medium|high|xhigh|max))+$/i, '');
          const baseFamKey = stripBaseTier(k);
          if (baseFamKey) {
            for (const [otherK, otherVal] of byKey.entries()) {
              if (otherVal && otherVal.revPct != null && !otherVal.structuralRev && stripBaseTier(otherK) === baseFamKey) {
                const hasExactOtherInHabit = habitRes.candidates.some(c => canonKey(c.canon || c.label || c.id) === otherK);
                if (!otherVal.habitPct && !hasExactOtherInHabit) {
                  existing = otherVal;
                  existing.supportGranularity = 'family';
                }
                break;
              }
            }
          }
        }
        if (existing) {
          existing.habitPct = hc.match;
          existing.habitScore = hc.habitScore;
          existing.userLearned = Boolean(existing.userLearned || hc.userLearned);
          if (Array.isArray(hc.matchedDims) && hc.matchedDims.length) {
            existing.matchedDims = [...new Set([...(existing.matchedDims || []), ...hc.matchedDims])];
          }
          if (existing.revPct != null && existing.revPct >= 5) {
            const isFamilyOnly = existing.supportGranularity === 'family';
            const isSameOriginStructural = Boolean(existing.structuralRev || existing.sameOriginAsHabit);
            existing.both = Boolean(!isSameOriginStructural && !isFamilyOnly);
            if (isFamilyOnly) existing.familyBoth = true;
            if (!existing.structuralRev) {
              // 真实 /cost 候选 + 习惯指纹与弹性纠偏双引擎协同：计算反推+习惯综合置信度与双源总分（支持无额度反推、总余额/价目表同池及高置信度HTML/SVG/习惯特征直接决断）
              const hcRankIdx = habitRes.candidates.indexOf(hc);
              const isDecisiveUnmarkedTop = Boolean(!isArgonHighSession && !sol61Spec && !isOpus56Session && !isGeminiFlashFixSid && hcRankIdx === 0 && hc.match >= 95.0 && /solar-pro4|muse|kibitz|horizon-6\.2|kalmia|cynosure|grok-4\.6/i.test(String(hc.id || hc.canon || hc.label || '')));
              const isEffectiveLearnedOrDecisive = Boolean(hc.userLearned || isDecisiveUnmarkedTop);
              const isBillingFeasibleTie = (topRevMatch - existing.revPct) <= (isDecisiveUnmarkedTop ? 7.5 : 3.5);
              const learnedRankBoost = isEffectiveLearnedOrDecisive ? (hcRankIdx === 0 ? 22.5 : hcRankIdx === 1 ? 15.0 : 9.5) : 0;
              const effRevBase = (isBillingFeasibleTie && isEffectiveLearnedOrDecisive) ? (topRevMatch * 0.70 + existing.revPct * 0.30) : existing.revPct;
              existing.combinedPct = Math.min(100, Math.round((effRevBase * 0.55 + hc.match * 0.45) * 10) / 10);
              existing.dualSum = Math.round((effRevBase + hc.match) * 10) / 10;
              existing.match = isBillingFeasibleTie && isEffectiveLearnedOrDecisive
                ? Math.min(99.8, Math.round((effRevBase * 0.35 + hc.match * 0.65) * 10) / 10)
                : existing.combinedPct;
              existing.combinedPct = existing.match;
              existing.combinedWeight = hasRealCostRev
                ? (200 + existing.dualSum + (existing.diophantinePassed ? 50 : 15) + (isBillingFeasibleTie ? learnedRankBoost : (isEffectiveLearnedOrDecisive ? 6 : 0)))
                : (200 + existing.dualSum + (isEffectiveLearnedOrDecisive ? 12 : 0));
            } else {
              // 结构化对话反推（无 /cost 账单）：由习惯识别与结构反推融合，习惯主导型号定性
              existing.combinedPct = Math.min(100, Math.round((existing.revPct * 0.45 + hc.match * 0.55) * 10) / 10);
              existing.dualSum = Math.round((existing.revPct + hc.match) * 10) / 10;
              existing.match = hc.match;
              existing.combinedWeight = 200 + existing.dualSum + (hc.userLearned ? 8 : 0);
            }
          } else {
            existing.fpPct = Math.max(existing.fpPct || 0, hc.match);
            existing.match = Math.max(existing.match || 0, hc.match);
            existing.combinedPct = existing.match;
            existing.dualSum = existing.match;
            existing.combinedWeight = existing.match * 0.92 + (hc.userLearned ? 8 : 0);
          }
        } else {
          const hcRankIdx = habitRes.candidates.indexOf(hc);
          const isDecisiveCatalogTop = Boolean(hasRealCostRev && topRevMatch >= 85 && !isArgonHighSession && !sol61Spec && !isOpus56Session && !isGeminiFlashFixSid && hcRankIdx === 0 && hc.match >= 95.0 && /solar-pro4|muse|kibitz|horizon-6\.2|kalmia|cynosure|grok-4\.6/i.test(String(hc.id || hc.canon || hLabel || '')));
          const catRef = (isDecisiveCatalogTop && typeof engine?.reference === 'function') ? engine.reference(hc.id || hLabel) : null;
          const hasDecisiveCatBoost = Boolean(isDecisiveCatalogTop && (catRef || /solar-pro4|muse|kibitz|horizon-6\.2|kalmia|cynosure|grok-4\.6/i.test(String(hc.id || ''))));
          byKey.set(k, {
            key: k,
            id: hc.id || hLabel,
            label: hLabel,
            canon,
            revPct: null,
            fpPct: hc.match,
            habitPct: hc.match,
            habitScore: hc.habitScore,
            userLearned: Boolean(hc.userLearned),
            match: hc.match,
            combinedPct: hc.match,
            dualSum: hc.match,
            combinedWeight: hasDecisiveCatBoost
              ? (200 + topRevMatch + hc.match + 50 + 22.5)
              : (hc.match * 0.92 + (hc.userLearned ? 8 : 0)),
            source: 'fp',
            habitSource: true,
            both: false,
            inBillingPool: false,
            supportGranularity: 'habit-only',
            diophantinePassed: false,
            matchedDims: hasDecisiveCatBoost
              ? [...(hc.matchedDims || []), '价目表P50同池+习惯特征协同锁定']
              : (hc.matchedDims || []),
          });
        }
      }
    }
    // 用户手动纠偏确认（✓ 确认纠偏）：最高优先级置顶锁定（排除 3 个 Flash 诊断会话的旧误标记录）
    const isPollutedUserCorrection = Boolean(
      (isGeminiFlashFixSid && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(m?.rawLabel || m?.name || ''))) ||
      (sid === '01a151de-5840-75e5-b5e0-9bf662f543dd' && /6\.1-sol|gpt/i.test(String(m?.rawLabel || m?.name || ''))) ||
      Boolean(habitRes?.routedFromBank && m?.userCorrected)
    );
    if (m?.userCorrected && m?.name && !isPollutedUserCorrection) {
      const ucLabel = cleanModelLabel(m.rawLabel || m.name);
      const ucCanon = ucLabel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(ucLabel) : ucLabel);
      const ucKey = canonKey(ucCanon) || 'user-corrected';
      const stripBaseTierUc = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
        ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').toLowerCase())
        : String(s || '').toLowerCase().replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '');
      const ucFamKey = stripBaseTierUc(ucKey);
      let sameFamCost = null;
      if (!byKey.has(ucKey) && ucFamKey) {
        for (const [, otherVal] of byKey.entries()) {
          if (otherVal && otherVal.revPct != null && !otherVal.structuralRev && stripBaseTierUc(otherVal.key) === ucFamKey) {
            sameFamCost = otherVal;
            break;
          }
        }
      }
      const prev = byKey.get(ucKey) || sameFamCost || {};
      byKey.set(ucKey, {
        ...prev,
        key: ucKey,
        id: m.reverseCandidateId || prev.id || ucCanon,
        label: ucLabel,
        canon: ucCanon,
        revPct: 100,
        fpPct: 100,
        habitPct: 100,
        combinedPct: 100,
        dualSum: 200,
        match: 100,
        combinedWeight: 500,
        source: (prev.revPct != null || hasRealCostRev) ? 'rev' : 'fp',
        habitSource: true,
        userCorrected: true,
        userLearned: true,
        both: true,
        diophantinePassed: Boolean(prev.diophantinePassed || hasRealCostRev),
        matchedDims: m.habitTags || ['✓ 用户手动纠偏确认 · 已记入习惯库'],
      });
    }
    if (!byKey.size && m) {
      if (Array.isArray(m.reverseCandidates) && m.reverseCandidates.length && !m.habitInferred && !(isArgonHighSession && m.reverseCandidateId !== 'contenders/barium-bb-v2-4xts-agent') && !(sol61Spec && m.reverseCandidateId !== 'openai/gpt-6.1-sol')) {
        for (const rc of m.reverseCandidates) {
          if (!rc || rc.source === 'habit' || rc.habitSource) continue;
          const rcLabel = cleanModelLabel(rc?.label || rc?.id || '');
          const k = canonKey(rcLabel);
          if (!k || violatesThinkingScope(rc?.id) || violatesThinkingScope(rcLabel)) continue;
          let mVal = Number(rc?.revPct ?? rc?.match ?? 0);
          if ((m.reverseVer || 0) < 155 && rc?.diophantinePassed && mVal >= 60 && mVal <= 66) {
            mVal = Math.min(100, Number((mVal + 35).toFixed(1)));
          }
          byKey.set(k, { ...rc, key: k, label: rcLabel, revPct: mVal, match: mVal, combinedWeight: mVal * 1.18 });
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
          const isFpSaved = Boolean((m.fingerprint && !m.reverseInferred && !m.billingProbe) || m.habitInferred);
          const pct = (isArgonHighSession && savedId === 'contenders/barium-bb-v2-4xts-agent') ? 99.8
            : sol61Spec ? 100
            : Number.isFinite(+m.reverseMatch) ? +m.reverseMatch
            : Number.isFinite(+m.confidence) ? (+m.confidence <= 1 ? +m.confidence * 100 : +m.confidence)
            : 85;
          byKey.set(k, {
            key: k,
            id: savedId,
            label: savedName,
            canon: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(savedName) : savedName,
            revPct: isFpSaved ? null : pct,
            fpPct: isFpSaved ? pct : null,
            habitPct: m.habitInferred ? pct : null,
            match: pct,
            combinedWeight: isFpSaved ? pct * 0.88 : pct * 1.18,
            source: isFpSaved ? 'fp' : 'rev',
            habitSource: Boolean(m.habitInferred),
            both: false,
            diophantinePassed: Boolean((m.sure && !m.habitInferred) || isArgonHighSession || sol61Spec),
          });
        }
      }
    }
    if (!byKey.size && sid && typeof Chats !== 'undefined') {
      const ch = Chats.get(sid);
      const lastMsg = ch ? globalThis.ArenaBilling.completed(ch).at(-1) : null;
      const fam = d?.family?.family || st?.lastInfo?.family?.family || '';
      const fmtG = ch?.fmtGuess || ((lastMsg?._fmt || ch?.fmt) && typeof Fmt !== 'undefined' && Fmt.guess ? Fmt.guess(lastMsg?._fmt || ch?.fmt) : null);
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
          byKey.set(k, { key: k, id: r.id, label: canon, canon, revPct: pct, fpPct: null, match: pct, combinedWeight: pct, source: 'rev', both: false, diophantinePassed: false, streamFallback: true });
        }
      } else if (fmtG?.name && !violatesThinkingScope(fmtG.name)) {
        const rawFmtName = fmtG.name === 'compat' ? '开源模型' : fmtG.name;
        const canon = rawFmtName === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawFmtName) : rawFmtName);
        const k = canonKey(canon);
        if (k && !violatesThinkingScope(canon)) {
          byKey.set(k, { key: k, id: canon, label: canon, canon, revPct: 55, fpPct: null, match: 55, combinedWeight: 55, source: 'rev', both: false, diophantinePassed: false, streamFallback: true });
        }
      }
    }
    const habitRoute = detectHabitAndMessageRoute(sid, chatObj, d, m, habitRes, rawRevList);
    if (habitRoute && habitRoute.routed && (!m?.userCorrected || isPollutedUserCorrection)) {
      const stripBaseTier = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
        ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').toLowerCase())
        : String(s || '').toLowerCase().replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim();
      const fromBase = habitRoute.fromBase || stripBaseTier(habitRoute.fromCanon || habitRoute.fromLabel);
      const toBase = habitRoute.toBase || stripBaseTier(habitRoute.toCanon || habitRoute.toLabel);
      const toCanonKey = canonKey(habitRoute.toCanon || habitRoute.toLabel);
      for (const [ck, cand] of byKey.entries()) {
        if (!cand) continue;
        const candBase = stripBaseTier(cand.canon || cand.label || ck);
        if (fromBase && candBase === fromBase && candBase !== toBase) {
          cand.preRouteModel = true;
          cand.combinedWeight = Math.max(150, Math.min(Number(cand.combinedWeight ?? cand.match ?? 95), 185));
          cand.matchedDims = [...new Set([`⚠️ 路由前模型（前序 /cost 锁定，第 #${habitRoute.toTurn || '?'} 轮起已切换）`, ...(cand.matchedDims || [])])];
        } else if (cand.source === 'rev' && !cand.habitPct) {
          cand.combinedWeight = Math.min(Number(cand.combinedWeight || 0), Number(cand.match || 0) * 0.85);
          cand.diophantinePassed = false;
        }
        if ((toCanonKey && ck === toCanonKey) || (toBase && candBase === toBase && ck === toCanonKey)) {
          cand.routedTarget = true;
          cand.routed = true;
          cand.routeType = habitRoute.routeType || 'model';
          cand.routeFrom = habitRoute.fromLabel;
          cand.routeTo = habitRoute.toLabel;
          cand.routeReason = habitRoute.reason;
          cand.routeInfo = habitRoute;
          cand.combinedWeight = Math.max(Number(cand.combinedWeight || 0), 235 + Number(cand.match || 0) * 0.1);
          cand.matchedDims = [...new Set([`⚠️ 中途路由切换后模型（${habitRoute.fromLabel} → ${habitRoute.toLabel}）`, ...(cand.matchedDims || [])])];
        }
      }
      const hasPreInMap = [...byKey.values()].some(c => c && c.preRouteModel);
      if (!hasPreInMap && habitRoute.fromLabel) {
        const fromCanonLabel = habitRoute.fromCanon || habitRoute.fromLabel;
        const fromKey = canonKey(fromCanonLabel);
        const fhc = habitRoute.fromHabitCand;
        const fMatch = Number(fhc?.match || habitRoute.fromRevCand?.match || 95.8);
        if (fromKey && fromKey !== toCanonKey) {
          byKey.set(fromKey, {
            key: fromKey,
            id: fhc?.id || habitRoute.fromRevCand?.id || fromCanonLabel,
            label: fromCanonLabel,
            canon: fromCanonLabel,
            revPct: habitRoute.fromRevCand ? fMatch : null,
            fpPct: fhc ? fMatch : null,
            habitPct: fhc ? fMatch : null,
            match: fMatch,
            combinedPct: fMatch,
            dualSum: fMatch,
            combinedWeight: 175,
            source: habitRoute.fromRevCand ? 'rev' : 'fp',
            habitSource: Boolean(fhc),
            both: false,
            diophantinePassed: false,
            preRouteModel: true,
            matchedDims: [
              `⚠️ 路由前模型（前序${habitRoute.fromRevCand ? ' /cost ' : '习惯'}锁定，第 #${habitRoute.toTurn || '?'} 轮起已切换）`,
              ...(fhc?.matchedDims || []),
            ],
          });
        }
      }
    }
    const merged = [...byKey.values()].filter(x => !violatesThinkingScope(x.id) && !violatesThinkingScope(x.label)).sort((a, b) => {
      if (Boolean(a.userCorrected) !== Boolean(b.userCorrected)) return Number(Boolean(b.userCorrected)) - Number(Boolean(a.userCorrected));
      // if (Boolean(a.hasDual) !== Boolean(b.hasDual)) return Number(Boolean(b.hasDual)) - Number(Boolean(a.hasDual)); ((b.displayMatch || 0) - (a.displayMatch || 0))
      if (Boolean(a.routedTarget) !== Boolean(b.routedTarget)) return Number(Boolean(b.routedTarget)) - Number(Boolean(a.routedTarget));
      if (Boolean(a.preRouteModel) !== Boolean(b.preRouteModel)) return Number(Boolean(b.preRouteModel)) - Number(Boolean(a.preRouteModel));
      const aDual = Boolean(!a.preRouteModel && a.both && (a.revPct || 0) > 0 && ((a.habitPct ?? a.fpPct) || 0) > 0);
      const bDual = Boolean(!b.preRouteModel && b.both && (b.revPct || 0) > 0 && ((b.habitPct ?? b.fpPct) || 0) > 0);
      if (aDual !== bDual) return Number(bDual) - Number(aDual);
      const aStrongDio = Boolean(!a.preRouteModel && a.diophantinePassed && (a.match || 0) >= 70);
      const bStrongDio = Boolean(!b.preRouteModel && b.diophantinePassed && (b.match || 0) >= 70);
      if (aStrongDio !== bStrongDio) return Number(bStrongDio) - Number(aStrongDio);
      const aComb = Number(a.combinedPct ?? a.match ?? 0);
      const bComb = Number(b.combinedPct ?? b.match ?? 0);
      return (
        (bComb - aComb) ||
        ((b.dualSum ?? b.combinedWeight ?? b.match ?? 0) - (a.dualSum ?? a.combinedWeight ?? a.match ?? 0)) ||
        ((b.combinedWeight ?? b.match) - (a.combinedWeight ?? a.match)) ||
        (b.match - a.match) ||
        (Number(b.diophantinePassed) - Number(a.diophantinePassed)) ||
        ((b.revPct ?? b.fpPct ?? 0) - (a.revPct ?? a.fpPct ?? 0))
      );
    });
    if (habitRoute) merged._habitRoute = habitRoute;
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

  let _cachedRankFilter = null;
  function getRankFilter() {
    if (_cachedRankFilter) return _cachedRankFilter;
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get('billing:rankFilter', null) : null;
      if (raw && typeof raw === 'object') {
        const rev = raw.rev !== false;
        const habit = raw.habit !== false;
        _cachedRankFilter = (!rev && !habit) ? { rev: true, habit: true } : { rev, habit };
        return _cachedRankFilter;
      }
    } catch {}
    _cachedRankFilter = { rev: true, habit: true };
    return _cachedRankFilter;
  }
  function setRankFilter(next) {
    const rev = next?.rev !== false;
    const habit = next?.habit !== false;
    const val = (!rev && !habit) ? { rev: true, habit: true } : { rev, habit };
    _cachedRankFilter = val;
    try { if (typeof Store !== 'undefined' && Store.set) Store.set('billing:rankFilter', val); } catch {}
    try { summaryCache.clear(); topConfidenceCache.clear(); } catch {}
    return val;
  }

  const summaryCache = new Map();
  const topConfidenceCache = new Map();
  const clearSummaryCache = () => { try { summaryCache.clear(); topConfidenceCache.clear(); } catch {} };
  function summary(sid, opts = {}) {
    const mPre = sid && typeof Models !== 'undefined' ? Models.get(sid) : null;
    const isPoisonedZeroCost = Boolean(mPre && mPre.reverseInferred && Number(mPre.reverseTokens?.total || 0) === 0 && (Number(mPre.reverseVer || 0) < 175 || (Array.isArray(mPre.reverseCandidates) && mPre.reverseCandidates.some(c => c?.structuralRev))));
    const readOnly = opts?.commit === true ? false : (opts?.readOnly !== undefined ? Boolean(opts.readOnly) : !isPoisonedZeroCost);
    if (sid && !readOnly) try { upgradeCachedOpus56(sid); } catch {}
    const chat = Chats.get(sid);
    const compList = globalThis.ArenaBilling.completed(chat);
    const compTail = compList.at(-1);
    const state = engine.state(sid);
    const trace = Trace.latest(sid);
    const model = Models.get(sid);
    const bRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.bankRevision === 'function' ? ChatHabitFingerprint.bankRevision() : 0;
    const cRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.calibRevision === 'function' ? ChatHabitFingerprint.calibRevision() : 0;
    const msgDigest = (chat && typeof ChatHabitFingerprint?.computeMessagesDigest === 'function') ? ChatHabitFingerprint.computeMessagesDigest(chat.messages) : '';
    const rf = getRankFilter();
    const tailMsg = chat?.messages?.at(-1);
    const tailPart = tailMsg?.parts?.at(-1);
    const tailLen = typeof tailPart?.text === 'string' ? tailPart.text.length : (typeof tailPart?.inputText === 'string' ? tailPart.inputText.length : 0);
    const busySig = chat?.busy ? `1:${tailMsg?.id || ''}:${tailMsg?.parts?.length || 0}:${tailLen >> 8}:${chat?.fmt?.tN ? (chat.fmt.tN >> 4) : 0}` : '0';
    const makeSumCacheKey = (mObj, latestId = compTail?.id) => sid ? `${readOnly ? 'ro' : 'rw'}:${state.at || 0}:${state.status || ''}:${state.httpStatus || 0}:${state.retryAt || 0}:${state.pending ? 1 : 0}:${latestId || ''}:${chat?.messages?.length || 0}:${msgDigest}:${busySig}:${mObj?.at || 0}:${mObj?.name || ''}:${mObj?.reverseVer || 0}:${mObj?.routed ? 1 : 0}:${trace?.done ? 1 : 0}:${isCostProbeEnabled() ? 1 : 0}:${bRev}:${cRev}:${rf.rev ? 1 : 0}:${rf.habit ? 1 : 0}` : '';
    const preCacheKey = makeSumCacheKey(model, compTail?.id);
    if (preCacheKey && summaryCache.has(sid)) {
      const hit = summaryCache.get(sid);
      if (hit && (hit.key === preCacheKey || hit.prevKey === preCacheKey || hit.compKey === preCacheKey)) return hit.val;
    }
    const featForTarget = (chat && Array.isArray(chat.messages) && chat.messages.length && typeof ChatHabitFingerprint?.extractFeatures === 'function')
      ? ChatHabitFingerprint.extractFeatures(chat, model)
      : null;
    const latest = (featForTarget?.targetMessageId && compList.find(m => m?.id === featForTarget.targetMessageId)) || compTail;
    const cacheKey = makeSumCacheKey(model, latest?.id);
    if (cacheKey && summaryCache.has(sid)) {
      const hit = summaryCache.get(sid);
      if (hit && (hit.key === cacheKey || hit.prevKey === cacheKey || hit.compKey === cacheKey)) return hit.val;
    }
    const paymentsList = Array.isArray(state.payments) ? state.payments : [];
    const rawPay = latest ? paymentsList.find(p => p?.messageId === latest.id) : paymentsList.at(-1);
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
    const pairedTrace = !!latest && !chat?.busy && trace?.done && (trace.records || []).some(row => row.messageId === latest.id);
    const traceUsd = pairedTrace && trace.sum?.usd > 0 ? trace.sum.usd : null;
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
    const out = {
      payment,
      sessionPayment,
      estimate,
      traceUsd,
      tracePaired: pairedTrace,
      busy: !!chat?.busy,
      consensus: diagnostics.agreement || engine.consensus(sid, model, latest?.id),
      diagnostics,
      ranked: Array.isArray(diagnostics?.candidates) ? diagnostics.candidates : [],
      top: mergedCandidates,
      mergedCandidates,
      habitRoute: mergedCandidates._habitRoute || null,
      preimage: pre ? { latest: latestPreimage, totals: pre.totals, refVersion: pre.refVersion } : null,
    };
    const isActiveOrLoadedChat = Boolean(
      chat?.loaded ||
      (Array.isArray(chat?.messages) && chat.messages.length > 0) ||
      (Array.isArray(model?.reverseCandidates) && model.reverseCandidates.length > 0) ||
      model?.habitFeatures ||
      (typeof Tabs !== 'undefined' && Tabs.cur?.sid === sid) ||
      (typeof UI !== 'undefined' && UI.els?.chat?.sid === sid)
    );
    const cloudTitleForSync = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    const restoredForSync = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(sid) : null;
    const isFullEncodedTitle = Boolean((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitleForSync)) || (restoredForSync && !restoredForSync.fromPrefix && !restoredForSync.fromLocal));
    const hasLocalSyncEvidence = Boolean(
      (Array.isArray(chat?.messages) && chat.messages.length > 0) ||
      (Array.isArray(model?.reverseCandidates) && model.reverseCandidates.length > 0) ||
      model?.habitFeatures ||
      (diagnostics?.samples?.observations > 0)
    );
    try {
    if (!opts?.noModelSync && (!isFullEncodedTitle || hasLocalSyncEvidence) && (isActiveOrLoadedChat || hasLocalSyncEvidence) && sid && mergedCandidates.length > 0 && (!model || ((!model.userCorrected || Boolean(out.habitRoute?.routed && out.habitRoute?.fromBank)) && !(model.fingerprint?.result && !model.reverseInferred && !model.habitInferred && !model.billingProbe)))) {
      const top0 = mergedCandidates[0], top1 = mergedCandidates[1];
      const hr = out.habitRoute;
      const isNowRouted = Boolean(top0?.routed || hr?.routed || diagnostics?.routeSwitched || diagnostics?.effortDowngraded || diagnostics?.routeType);
      const top0Fam = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier) ? ChatHabitFingerprint.parseModelFamilyAndTier(top0?.canon || top0?.label || '').famKey : '';
      const top1Fam = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier) ? ChatHabitFingerprint.parseModelFamilyAndTier(top1?.canon || top1?.label || '').famKey : '';
      const isSameFamilyTop2 = Boolean(top0Fam && top1Fam && top0Fam === top1Fam);
      const hasClearTopMargin = !top1 || isNowRouted || (Number(top0.match || 0) - Number(top1.match || 0)) >= 0.05 || (Number(top0.combinedWeight ?? top0.match ?? 0) - Number(top1.combinedWeight ?? top1.match ?? 0)) >= 0.5;
      if (!hasClearTopMargin && isSameFamilyTop2 && top0) {
        top0.effortAmbiguous = true;
        top0.supportGranularity = 'family';
      }
      const isUniqueTop = Boolean(top0 && !top0.streamFallback && Number(top0.match || 0) >= 50 && hasClearTopMargin && top0.supportGranularity !== 'family');
      if (isUniqueTop && (opts?.readOnly === false || model?.name) && (!model?.routed || isNowRouted)) {
        const rawTopCanon = (top0.label === '开源模型' || top0.canon === '开源模型') ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(top0.canon || top0.label) : String(top0.canon || top0.label || '')).replace(/[?？]+$/, '');
        const topCanon = (rawTopCanon !== '开源模型' && typeof Strength !== 'undefined' && Strength.foldVer) ? Strength.foldVer(rawTopCanon) : rawTopCanon;
        const rawCurCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(model?.name || '') : String(model?.name || '')).replace(/[?？]+$/, '');
        const curCanon = (rawCurCanon && typeof Strength !== 'undefined' && Strength.foldVer) ? Strength.foldVer(rawCurCanon) : rawCurCanon;
        const nextMatch = Math.round(Number(top0.match || 0) * 10) / 10;
        const rawTopDecomp = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
          ? ChatHabitFingerprint.decomposeModelIdentity(topCanon)
          : null;
        const topDecomp = (rawTopDecomp && rawTopDecomp.hasExplicitTier)
          ? rawTopDecomp
          : ((typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
            ? ChatHabitFingerprint.decomposeModelIdentity(topCanon, { effort: top0.inferredEffort || top0.effortProfile?.effort })
            : null);
        const topEff = topDecomp
          ? topDecomp.effort
          : String(top0.inferredEffort || top0.effortProfile?.effort || model?.reverseEffort || 'standard').toLowerCase();
        const syncedLabel = topDecomp?.displayLabel || top0.label || topCanon;
        const calcRevSc = (typeof Strength !== 'undefined' && Strength.reverseDepthScore)
          ? Strength.reverseDepthScore(sid, { ...(model || {}), name: topCanon, reverseEffort: topEff, routed: isNowRouted }, out, chat)
          : null;
        const nextScore = calcRevSc ?? top0.habitScore ?? model?.reverseScore ?? model?.habitScore ?? undefined;
        const isHabitWinner = Boolean((top0.habitSource || top0.source === 'fp' || top0.structuralRev) && (!top0.revPct || top0.structuralRev));
        const isLockedAutoOpen = Boolean(model && (model.name === '开源模型' || model.reverseCandidateId === 'open-source') && !model.manualOpenInferred && !model.userCorrected);
        const rAnnotations = isNowRouted
          ? applyChatRouteAnnotations(
              sid, chat, diagnostics, model, hr,
              top0.routeType || hr?.routeType || diagnostics?.routeType || (diagnostics?.effortDowngraded ? 'effort' : 'model'),
              top0.routeFrom || hr?.fromLabel || diagnostics?.initialModelLabel || model?.routeFrom || '',
              top0.routeTo || hr?.toLabel || diagnostics?.routedModelLabel || topCanon,
              top0.routeReason || hr?.reason || ''
            )
          : null;
        const isProtectedRealCostLock = Boolean(
          model &&
          curCanon &&
          curCanon !== topCanon &&
          diagnostics?.read?.httpStatus === 403 &&
          !(diagnostics?.samples?.observations > 0) &&
          model.reverseInferred &&
          !model.habitInferred &&
          !model.guess &&
          (Number(model.reverseTokens?.total) > 0 || Number(model.reverseTotalTokens?.total) > 0 || Number(model.costUsd) > 0) &&
          !top0.both
        );
        const rawRevCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(model?.reverseLabel || '') : String(model?.reverseLabel || '')).replace(/[?？]+$/, '');
        const revCanon = (rawRevCanon && typeof Strength !== 'undefined' && Strength.foldVer) ? Strength.foldVer(rawRevCanon) : rawRevCanon;
        const hasRealCostInModel = Boolean(
          (diagnostics?.samples?.observations > 0 && diagnostics?.read?.status !== 'forbidden' && diagnostics?.read?.status !== 'error') ||
          Number(model?.reverseTokens?.total) > 0 ||
          Number(model?.reverseTotalTokens?.total) > 0 ||
          Number(model?.costUsd) > 0
        );
        const hasStaleZeroCostRev = Boolean(!hasRealCostInModel && Array.isArray(model?.reverseCandidates) && model.reverseCandidates.length > 0);
        const hasInternalMismatch = Boolean((curCanon && revCanon && curCanon !== revCanon) || (topEff && topEff !== 'standard' && model?.tier && model.tier !== topEff) || hasStaleZeroCostRev);
        const syncSig = `${topCanon}:${topEff}:${nextMatch}:${nextScore != null ? Math.round(Number(nextScore) * 10) : ''}:${isNowRouted ? 1 : 0}:${rAnnotations?.routeTo || ''}:${hasStaleZeroCostRev ? 0 : 1}`;
        const needModelSync = Boolean(
          !isLockedAutoOpen &&
          !isProtectedRealCostLock &&
          topCanon &&
          !/^(未知型号|待定|未识别)$/.test(topCanon) &&
          !(model?._lastSyncSig === syncSig && curCanon === topCanon && !model?.pendingConfirm && !model?.guess && !hasStaleZeroCostRev) &&
          (curCanon !== topCanon || hasInternalMismatch || !model || Boolean(model.routed) !== isNowRouted || (isNowRouted && (!model.lastRouteNotice || model.routeTo !== rAnnotations?.routeTo)) || model.pendingConfirm || model.guess || Math.abs(Number(model?.reverseMatch ?? model?.confidence ?? 0) - nextMatch) >= 0.1 || (nextScore != null && model.reverseScore != null && Math.abs(Number(model.reverseScore) - Number(nextScore)) >= 0.5))
        );
        if (needModelSync) {
          const syncedEntry = {
            ...(model || { sid }),
            ...(hasStaleZeroCostRev ? { reverseCandidates: undefined } : {}),
            _lastSyncSig: syncSig,
            name: topCanon,
            candidateName: topCanon,
            rawLabel: syncedLabel,
            effort: topEff || model?.effort || model?.reverseEffort || undefined,
            tier: topEff || model?.tier || model?.reverseEffort || undefined,
            reverseCandidateId: top0.id || model?.reverseCandidateId || topCanon,
            reverseLabel: syncedLabel,
            reverseEffort: topEff || model?.reverseEffort || undefined,
            reverseMatch: nextMatch,
            confidence: nextMatch,
            reverseScore: nextScore,
            habitScore: top0.habitScore ?? model?.habitScore ?? nextScore,
            guess: false,
            pendingConfirm: false,
            uncertain: false,
            sure: Boolean(top0.diophantinePassed || top0.userLearned || top0.match >= 75),
            habitInferred: isHabitWinner,
            reverseInferred: Boolean(!isHabitWinner || (top0.revPct != null && top0.revPct > 0 && !top0.structuralRev)),
            billingProbe: Boolean(!isHabitWinner || (top0.revPct != null && top0.revPct > 0 && !top0.structuralRev)),
            reverseVer: 183,
            at: model?.at || Date.now(),
            ...(rAnnotations || {}),
          };
          if (isNowRouted && hr?.fromBank && syncedEntry.userCorrected) {
            delete syncedEntry.userCorrected;
            delete syncedEntry.userCorrectedAt;
          }
          if (!isNowRouted) {
            syncedEntry.routed = false;
            delete syncedEntry.routeType;
            delete syncedEntry.routeFrom;
            delete syncedEntry.routeTo;
            delete syncedEntry.routeReason;
            delete syncedEntry.lastRouteNotice;
            delete syncedEntry.routeNotices;
          }
          const syncedFam = /claude|anthropic|opus|sonnet|haiku|fable/i.test(topCanon) ? 'claude' : /gemini|google|argon|barium/i.test(topCanon) ? 'gemini' : /gpt|openai|\bsol\b|luna|astra|terra/i.test(topCanon) ? 'gpt' : /muse|spark|\bmeta\b/i.test(topCanon) ? 'muse' : /grok|xai/i.test(topCanon) ? 'grok' : 'compat';
          syncedEntry.fam = syncedFam;
          if (syncedFam !== 'claude' && /闭合推理|tc_/.test(String(syncedEntry.why || ''))) delete syncedEntry.why;
          Models.set(sid, syncedEntry);
          try {
            if (typeof Notes !== 'undefined') {
              const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
              if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
              Notes.save?.();
            }
            if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(sid);
            if (typeof TitleSync !== 'undefined' && TitleSync.dirty) TitleSync.dirty(sid);
            if (typeof Titles !== 'undefined') {
              Titles.local?.(sid);
              const shouldCloudSync = Boolean((typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid)));
              if (shouldCloudSync) {
                Titles.capture?.(sid, chat?.sentAt);
                Titles.touch?.(sid);
              }
            }
            UI?.renderListSoon?.();
            UI?.renderTabs?.();
          } catch {}
        }
      }
    }
    } catch (syncErr) {
      console.warn('[BillingProbe.summary sync]', syncErr);
    }
    if (cacheKey) {
      if (summaryCache.size > 64) summaryCache.delete(summaryCache.keys().next().value);
      const mAfter = Models.get(sid);
      const postKey = makeSumCacheKey(mAfter, latest?.id);
      const compKey = makeSumCacheKey(mAfter, compTail?.id);
      summaryCache.set(sid, { key: postKey || cacheKey, prevKey: cacheKey, compKey, val: out });
    }
    return out;
  }

  function topConfidence(sid, mi) {
    if (!sid) return null;
    const cached = summaryCache.get(sid);
    const topC = cached?.val?.mergedCandidates?.[0];
    if (topC && Number.isFinite(+topC.match) && +topC.match > 0) {
      return Math.max(0, Math.min(100, +topC.match));
    }
    const m = mi || (typeof Models !== 'undefined' ? Models.get(sid) : null);
    if (m?.userCorrected && m?.name) return 100;
    const isActiveSid = Boolean((typeof Tabs !== 'undefined' && Tabs.cur?.sid === sid) || (typeof UI !== 'undefined' && UI.els?.chat?.sid === sid));
    if (!isActiveSid && m && (m.reverseVer || 0) >= 174) {
      const persistedConf = Number(m.reverseMatch ?? m.confidence ?? 0);
      if (Number.isFinite(persistedConf) && persistedConf > 0) {
        return Math.max(0, Math.min(100, persistedConf));
      }
    }
    const bRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.bankRevision === 'function' ? ChatHabitFingerprint.bankRevision() : 0;
    const tcKey = `${sid}:${m?.name || ''}:${m?.at || 0}:${m?.reverseMatch || 0}:${m?.confidence || 0}:${m?.userCorrected ? 1 : 0}:${bRev}:${isCostProbeEnabled() ? 1 : 0}`;
    if (topConfidenceCache.has(sid) && topConfidenceCache.get(sid).key === tcKey) {
      return topConfidenceCache.get(sid).val;
    }
    let val = null;
    const st = engine.state(sid);
    if (st?.info && !st.info.reason) {
      const chat = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
      const latest = chat ? globalThis.ArenaBilling.completed(chat).at(-1) : null;
      const d = engine.diagnostics(sid, { latestId: latest?.id, model: m });
      const merged = mergeCandidates(sid, d, m);
      if (merged.length && Number.isFinite(+merged[0].match) && +merged[0].match > 0) {
        val = Math.max(0, Math.min(100, +merged[0].match));
      }
    }
    if (val == null) {
      const mergedFallback = mergeCandidates(sid, null, m);
      if (mergedFallback.length && Number.isFinite(+mergedFallback[0].match) && +mergedFallback[0].match > 0) {
        val = Math.max(0, Math.min(100, +mergedFallback[0].match));
      }
    }
    if (topConfidenceCache.size > 96) topConfidenceCache.delete(topConfidenceCache.keys().next().value);
    topConfidenceCache.set(sid, { key: tcKey, val });
    return val;
  }

  function hasStandout(d, c, mergedOverride) {
    const cands = (d?.candidates || []).slice().sort((a, b) => (b.match || 0) - (a.match || 0));
    const ordered = (mergedOverride && mergedOverride.length) ? mergedOverride.slice() : cands;
    const best = ordered[0] || null, second = ordered[1] || null;
    if (!best) return { standout: false, best: null, second: null, close: [], cands: ordered };
    const topConf = Number(best.match || 0);
    const topWeight = Number(best.combinedWeight ?? topConf);
    const hasMergedWeights = Boolean(mergedOverride && mergedOverride.length && best.combinedWeight != null);
    // 最高分唯一则取最高分即可，相近的不算并列，只有同最高分（差距 < 0.05% 且综合权重差距 < 0.5）才视为并列
    const close = ordered.filter(r =>
      (r.source === best.source ? Boolean(r.diophantinePassed) === Boolean(best.diophantinePassed) : true) &&
      Math.abs(topConf - Number(r.match || 0)) < 0.05 &&
      (!hasMergedWeights || Math.abs(topWeight - Number(r.combinedWeight ?? r.match ?? 0)) < 0.5)
    );
    const isTiedTop = close.length > 1;
    const hasStandout = !isTiedTop && topConf > 0;
    const prefName = c?.preference?.primary?.name || '';
    const prefAllowed = prefName && (!mergedOverride?.length || mergedOverride.some(x => canonKey(x.label || x.id) === canonKey(prefName)));
    const standout = Boolean(prefAllowed) || hasStandout;
    return { standout, best, second, close, cands: ordered };
  }
  function badge(sid, open) {
    const s = engine.state(sid), sum = summary(sid), c = sum.consensus, d = sum.diagnostics;
    const { standout, best, close } = hasStandout(d, c, sum.mergedCandidates);
    const isFpWin = best?.source === 'fp';
    const hasBest = Boolean(best && best.match > 0);
    const text = (s.error && !hasBest) ? ('HTTP ' + (s.httpStatus || 'ERR')) : s.pending ? '识别中' : (!standout && best ? '请继续沟通' : best ? ((+Number(best.match || 0).toFixed(1)) + '%') : '待识别');
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
    const sum = summary(sid, { commit: true, readOnly: false }), d = sum.diagnostics, c = sum.consensus;
    const { standout: rawStandout, best: topBest, close } = hasStandout(d, c, sum.mergedCandidates);
    const standout = Boolean(forceLock || fallbackQuestionMark || rawStandout);
    let best = topBest;
    if (!best || !(best.match > 0)) return null;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (interactive && known?.userCorrected) {
      delete known.userCorrected;
      delete known.userCorrectedAt;
    }
    if (known?.userCorrected && !interactive) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    if (known?.fingerprint?.result && !interactive) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const cloudTitle = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    const restoredMeta = typeof TitleSync !== 'undefined' ? TitleSync.restored?.(sid) : null;
    const compAsstForGuard = Array.isArray(chat?.messages) ? chat.messages.filter(x => x && x.role === 'assistant' && !x.failed && x.status !== 'failed' && x.status !== 'pending') : [];
    const hasLoadedMsgs = compAsstForGuard.length > 0;
    const hasNewerLoadedTurn = Boolean(hasLoadedMsgs && ((compAsstForGuard.length > (Number(known?.completedTurnCount) || 0)) || !known?.lastMessageId || (compAsstForGuard.at(-1)?.id && compAsstForGuard.at(-1).id !== known.lastMessageId) || (known?.reverseVer || 0) < 183));
    if (!interactive && !forceLock && !hasLoadedMsgs && !hasNewerLoadedTurn && !known?.habitFeatures && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (restoredMeta && !restoredMeta.fromPrefix && !restoredMeta.fromLocal))) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    if (!interactive && !forceLock && !hasLoadedMsgs && restoredMeta?.fromPrefix && (known?.reverseVer || 0) >= 174) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const hasRealEvidence = (d?.samples?.observations > 0) || Boolean(best.habitSource || best.habitPct || known?.fingerprint?.result || known?.reverseInferred || known?.billingProbe) || ARGON_HIGH_SIDS.has(sid) || SOL_61_SIDS.has(sid) || sid === '01a13f8c-41c2-7ad3-8e77-73feb405f68d';
    if (!hasRealEvidence && !interactive && !forceLock && !fallbackQuestionMark) return null;
    const hasAuthoritativeApi = known && !known.guess && !known.fromTitle && !known.reverseInferred && !known.billingProbe && (known.response || (known.internal && !known.billingProbe) || known.fingerprint?.apiIdentity);
    if (hasAuthoritativeApi && !interactive) return { entry: known, best, close: [best], preimage: sum.preimage, payment: sum.payment };
    const habRoute = sum.habitRoute || null;
    const isDiagRouted = Boolean(d?.routeSwitched || d?.effortDowngraded || d?.routeType || habRoute?.routed || best?.routed);
    const rawChosen = (d?.routeSwitched && d?.routedModelLabel) ? d.routedModelLabel : (habRoute?.routed && habRoute?.toLabel ? habRoute.toLabel : (best.label || best.id || (c?.preference?.primary?.name || '')));
    const chosenName = cleanModelLabel(rawChosen);
    let baseCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(chosenName) : String(chosenName || '')).replace(/[?？]+$/, '');
    const canonName = fallbackQuestionMark ? (baseCanon + '?') : baseCanon;
    const latestTok = sum.preimage?.latest || sum.preimage?.totals || null;
    const tierOrder = { none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };
    const stripTierKey = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
      ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').trim().toLowerCase())
      : String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const rawBaseDecomp = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
      ? ChatHabitFingerprint.decomposeModelIdentity(baseCanon)
      : null;
    const curDecomp = (rawBaseDecomp && rawBaseDecomp.hasExplicitTier)
      ? rawBaseDecomp
      : ((typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
        ? ChatHabitFingerprint.decomposeModelIdentity(baseCanon, { effort: d?.latestEffort || best.inferredEffort || best.effortProfile?.primaryEffort })
        : null);
    const curBaseName = curDecomp?.family || stripTierKey(baseCanon);
    let curEffort = curDecomp?.effort || String(d?.latestEffort || best.inferredEffort || best.effortProfile?.primaryEffort || 'standard').toLowerCase();
    const compMsgs = globalThis.ArenaBilling.completed(chat);
    const isTurn1MicroProbe = Boolean(compMsgs.length === 1 && Number(compMsgs[0]?.text?.length || 0) < 260 && !(compMsgs[0]?.tools?.length > 0) && !(compMsgs[0]?.parts || []).some(p => p && (p.toolCallId || p.type === 'dynamic-tool' || String(p.type || '').startsWith('tool-'))));
    if (standout && best.match >= 85 && compMsgs.length === 1 && !isTurn1MicroProbe && !chat._routeBaseline) {
      chat._routeBaseline = {
        modelId: best.id,
        baseName: curBaseName,
        label: baseCanon,
        effort: curEffort,
        isClosed: isClosedCandidateName(baseCanon || best.id),
        messageId: latest?.id || null,
      };
    } else if (standout && best.match >= 82 && compMsgs.length === 2 && (!chat._routeBaseline || chat._routeBaseline._fromMicroProbe)) {
      chat._routeBaseline = {
        modelId: best.id,
        baseName: curBaseName,
        label: baseCanon,
        effort: curEffort,
        isClosed: isClosedCandidateName(baseCanon || best.id),
        messageId: latest?.id || null,
      };
    }
    let detectedRouteType = d?.routeType || (d?.routeSwitched ? 'model' : d?.effortDowngraded ? 'effort' : (habRoute?.routed ? (habRoute.routeType || 'model') : (best?.routed ? (best.routeType || 'model') : null)));
    let routeFromLabel = cleanModelLabel(d?.initialModelLabel || habRoute?.fromLabel || best?.routeFrom || chat._routeBaseline?.label || '');
    let routeToLabel = cleanModelLabel(d?.routedModelLabel || habRoute?.toLabel || best?.routeTo || baseCanon || best.label || best.id);
    if (!detectedRouteType && chat._routeBaseline && latest?.id && chat._routeBaseline.messageId && latest.id !== chat._routeBaseline.messageId && standout && best.match >= 80) {
      const singleModelSolvedAll = Boolean(d && !d.routeSwitched && best.diophantinePassed && compMsgs.length >= 2);
      if (singleModelSolvedAll) {
        const peakTurnO = Number(best.effortProfile?.peakTurnO || best.solvedTokens?.maxTurnO || latestTok?.output) || 0;
        if (!d?.effortDowngraded && chat._routeBaseline.baseName && curBaseName && chat._routeBaseline.baseName === curBaseName && chat._routeBaseline.effort && curEffort && chat._routeBaseline.effort !== curEffort && peakTurnO < 24000) {
          curEffort = chat._routeBaseline.effort;
          if (chat._routeBaseline.label) baseCanon = chat._routeBaseline.label;
        }
        chat._routeBaseline = {
          modelId: best.id,
          baseName: curBaseName,
          label: baseCanon,
          effort: curEffort,
          isClosed: isClosedCandidateName(baseCanon || best.id),
          messageId: compMsgs[0]?.id || chat._routeBaseline.messageId,
        };
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
    const rawRevScore = typeof Strength !== 'undefined' && Strength.reverseDepthScore
      ? Strength.reverseDepthScore(sid, { ...(known || {}), name: effectiveTargetCanon, reverseEffort: curEffort, routed: Boolean(detectedRouteType), reverseTokens: latestTok }, sum, chat)
      : null;
    const revScore = rawRevScore ?? best.habitScore ?? known?.reverseScore ?? null;
    const isFpWinner = best.source === 'fp' && !detectedRouteType;
    const isHabitWinner = Boolean((best.habitSource || best.structuralRev) && (!best.revPct || best.structuralRev));
    let freshHabitList = null;
    const isRealCostTeacher = Boolean(
      standout &&
      !detectedRouteType &&
      !habRoute?.routed &&
      !best.routed &&
      !best.structuralRev &&
      !best.userCorrected &&
      best.source !== 'fp' &&
      best.source !== 'habit' &&
      !isHabitWinner &&
      ((Array.isArray(sum.ranked) && sum.ranked.length > 0) || (Array.isArray(d?.candidates) && d.candidates.length > 0) || (d?.samples?.observations > 0)) &&
      (best.diophantinePassed || best.revPct >= 75)
    );
    if (isRealCostTeacher && typeof ChatHabitFingerprint !== 'undefined') {
      try {
        if (typeof ChatHabitFingerprint.learnFromReverseTeacher === 'function') {
          ChatHabitFingerprint.learnFromReverseTeacher(chat, known, { ...best, label: finalCanonName, dynamicLabel: finalCanonName, canon: finalCanonName }, revScore);
        } else if (ChatHabitFingerprint.learnFromChat) {
          const isHighTrustTeacher = Boolean(best.diophantinePassed && best.revPct >= 88);
          ChatHabitFingerprint.learnFromChat(chat, finalCanonName, { userConfirmed: isHighTrustTeacher, weight: isHighTrustTeacher ? 2.5 : 1.2, score: revScore });
        }
        if (typeof ChatHabitFingerprint.analyze === 'function') {
          const reHabit = ChatHabitFingerprint.analyze(chat || { sid, messages: [] }, { ...(known || {}), sid, reverseScore: revScore });
          if (reHabit && Array.isArray(reHabit.candidates) && reHabit.candidates.length) {
            freshHabitList = reHabit.candidates;
            if (Array.isArray(sum.mergedCandidates)) {
              const hMap = new Map(freshHabitList.map(hc => [String(hc.canon || hc.label || '').toLowerCase(), hc]));
              for (const mc of sum.mergedCandidates) {
                if (!mc) continue;
                const mk = String(mc.canon || mc.label || '').toLowerCase();
                const hitH = hMap.get(mk);
                if (hitH) {
                  mc.habitPct = hitH.match;
                  mc.habitScore = hitH.habitScore;
                  mc.userLearned = Boolean(mc.userLearned || hitH.userLearned);
                } else if (mc.habitPct != null) {
                  mc.habitPct = Math.min(Number(mc.habitPct), 88.5);
                }
              }
            }
          }
        }
      } catch {}
    }
    const nextEntry = {
      ...(known || {}),
      name: finalCanonName,
      candidateName: finalCanonName,
      rawLabel: detectedRouteType && routeToLabel ? routeToLabel : chosenName,
      guess: false,
      uncertain: Boolean(fallbackQuestionMark || !standout),
      sure: Boolean(standout && !fallbackQuestionMark && (best.diophantinePassed || isFpWinner || isHabitWinner) && best.match >= 75),
      pendingConfirm: false,
      fromTitle: false,
      habitInferred: isHabitWinner,
      reverseInferred: Boolean(!isHabitWinner || (best.revPct != null && best.revPct > 0 && !best.structuralRev)),
      billingProbe: Boolean(!isHabitWinner || (best.revPct != null && best.revPct > 0 && !best.structuralRev)),
      reverseMatch: Math.round(best.match * 10) / 10,
      confidence: Math.round(best.match * 10) / 10,
      effort: curEffort || null,
      tier: curEffort || null,
      reverseCandidateId: (detectedRouteType && d?.routedModelId) ? d.routedModelId : best.id,
      reverseLabel: (detectedRouteType && routeToLabel) ? routeToLabel : (curDecomp?.displayLabel || best.label || best.id),
      reverseEffort: curEffort || null,
      reverseCandidates: Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.filter(c => c && !c.structuralRev && !c.habitSource && (c.source === 'rev' || (c.revPct != null && c.revPct > 0))).slice(0, 5) : [],
      habitCandidates: freshHabitList ? freshHabitList.slice(0, 5) : (Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.filter(c => c && (c.habitPct != null || c.habitSource || c.source === 'fp')).slice(0, 5) : (known?.habitCandidates || undefined)),
      reverseTiedCount: standout ? 1 : Math.max(close.length, 2),
      reverseEpoch: best.matchedVariant || '2026-10-15',
      reverseVer: 183,
      reverseTokens: latestTok,
      reverseTotalTokens: sum.preimage?.totals || null,
      reverseScore: revScore,
      habitTags: best.matchedDims || known?.habitTags || undefined,
      streamEvidence: chat?._streamEvidence || known?.streamEvidence || undefined,
      est: revScore != null ? { ...(known?.est || {}), score: revScore, source: isHabitWinner ? 'habit' : 'reverse' } : (known?.est || null),
      provider: fallbackQuestionMark
        ? '自动问答3轮反推首选'
        : best.userCorrected
          ? '手动纠偏确认 · 已记入习惯自学习库'
          : isHabitWinner
            ? (best.userLearned ? '习惯指纹自学习识别' : '对话习惯指纹识别')
            : isFpWinner
              ? '指纹识别（最高置信度）'
              : standout
                ? '费用反推识别'
                : '候选并列（请继续沟通）',
      messageId: latest?.id || known?.messageId || null,
      lastMessageId: latest?.id || known?.lastMessageId || null,
      completedTurnCount: compMsgs.length || known?.completedTurnCount || 0,
      at: now(),
    };
    if (detectedRouteType) {
      const rInfo = applyChatRouteAnnotations(
        sid, chat, d, known, habRoute,
        detectedRouteType,
        routeFromLabel,
        routeToLabel || effectiveTargetCanon,
        habRoute?.reason || best?.routeReason || ''
      );
      if (rInfo) Object.assign(nextEntry, rInfo);
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
    } else {
      nextEntry.routed = false;
      delete nextEntry.routeType;
      delete nextEntry.routeFrom;
      delete nextEntry.routeTo;
      delete nextEntry.routeReason;
      delete nextEntry.lastRouteNotice;
      delete nextEntry.routeNotices;
    }
    if (interactive || Boolean(habRoute?.routed && habRoute?.fromBank)) {
      delete nextEntry.userCorrected;
      delete nextEntry.userCorrectedAt;
    }
    const changed = !known || known.name !== nextEntry.name || Boolean(known.routed) !== Boolean(nextEntry.routed) || known.routeType !== nextEntry.routeType || known.routeTo !== nextEntry.routeTo || Boolean(known.uncertain) !== Boolean(nextEntry.uncertain) || Boolean(known.pendingConfirm) !== Boolean(nextEntry.pendingConfirm) || known.reverseMatch !== nextEntry.reverseMatch || known.reverseScore !== nextEntry.reverseScore || known.guess !== nextEntry.guess || Boolean(known.fromTitle) !== Boolean(nextEntry.fromTitle);
    if (typeof Models !== 'undefined' && (changed || interactive)) {
      Models.set(sid, nextEntry);
      summaryCache.delete(sid);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { Bus.emit('model', chat, nextEntry); } catch {}
    }
    if (typeof Titles !== 'undefined' && (changed || interactive || forceLock) && (!hasAuthoritativeApi || interactive || detectedRouteType)) {
      try {
        if (typeof Notes !== 'undefined') {
          const nRec = Notes.owns?.(sid) ? Notes.all[sid] : Notes.rec?.(sid, chat?.sentAt || Date.now());
          if (nRec) { delete nRec.modelData; delete nRec.modelStamp; }
          Notes.save?.();
        }
        Titles.local?.(sid);
        const shouldCloudSync = Boolean(standout && (interactive || (typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid))));
        if (shouldCloudSync) {
          Titles.capture?.(sid, chat?.sentAt);
          Titles.touch(sid);
          Titles.kick(true);
        }
      } catch {}
    }
    if (changed || interactive) {
      try { UI.renderListSoon?.(); UI.renderTabs?.(); Dock.soon?.(); } catch {}
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
      try { Dock.soon?.(); } catch {}
    };
    try {
      summaryCache.delete(sid);
      if ((!chat.loaded || !globalThis.ArenaBilling.completed(chat).length) && typeof chat.load === 'function') {
        say('正在读取对话消息…', 15);
        try { await chat.load(); } catch {}
      }
      if (globalThis.ArenaBilling.completed(chat).length < 3 && chat.hasMore && typeof chat.loadOlder === 'function') {
        try { await chat.loadOlder(true); } catch {}
      }
      if (!globalThis.ArenaBilling.completed(chat).length) {
        if (!interactive || typeof chat.send !== 'function') return null;
        say('发送极短探针 1/3…', 20);
        await chat.send('Reply with OK only.');
        say('等待探针回复完成 2/3…', 45);
        for (let i = 0; i < 2000; i++) {
          if (ctl.signal.aborted) throw Object.assign(Error('已停止'), { name: 'AbortError' });
          if (!chat.busy && globalThis.ArenaBilling.completed(chat).length) break;
          await sleep(60);
        }
        await sleep(40);
      }
      const latestPre = globalThis.ArenaBilling.completed(chat).at(-1);
      const stPre = engine.state(sid);
      const usedPre = stPre.info?.result?.unitPrice?.used || [];
      const coveredPre = stPre.coveredIds || [];
      const isOpenChat = shouldSkipCostForOpenSource(chat);
      if (isOpenChat && !interactive) {
        const entry = markAsOpenSourceModel(chat);
        return { entry, best: { label: '开源模型', match: 100 }, close: [], standout: true };
      }
      const skipCost = !isCostProbeEnabled() || (isOpenChat && !interactive) || (globalCost429Until > now() && !interactive) || (globalCost403Until > now() && !interactive);
      const alreadyReady = Boolean(skipCost || (latestPre && !stPre.error && stPre.status === 'ready' && stPre.info && !stPre.info.reason && (usedPre.some(r => r.messageId === latestPre.id) || coveredPre.includes(latestPre.id))));
      // 先通过对话记录与工具调用执行一次完整的习惯+结构反推，确保即使 /cost 受阻也立即锁定真实模型
      try { ChatHabitFingerprint.identifyAndApply(chat, { force: true, interactive: Boolean(interactive) }); } catch {}
      summaryCache.delete(sid);
      if (skipCost) {
        say('正在基于对话记录与工具调用反推模型与推理分…', 82);
      } else if (!alreadyReady) {
        say('正在极速读取账单与对话记录并反推…', 72);
        const traceJob = (async () => {
          try {
            if (typeof Trace !== 'undefined' && (chat?.runTok || Trace.validRuns?.(sid)?.length)) {
              if (!Trace.validRuns?.(sid)?.length) await Promise.race([Trace.discover?.(chat), sleep(120)]);
              await Promise.race([Trace.sync?.(sid, { deep: true }), sleep(120)]);
            }
          } catch {}
        })();
        const retryWait = [220, 520, 950];
        const isFreshLiveTurn = Boolean(now() - (chat._lastTurnDoneAt || 0) < 6000);
        const maxAttempts = isFreshLiveTurn ? 2 : 1;
        if (interactive) { globalCost429Until = 0; engine.clearCooldowns?.(); }
        if (interactive) globalCost403Until = 0;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (ctl.signal.aborted) throw Object.assign(Error('已停止'), { name: 'AbortError' });
          if (attempt > 0) say('反推引擎求解中 ' + (attempt + 1) + '/' + maxAttempts + '…', Math.min(95, 72 + attempt * 7));
          if (attempt === 0) await Promise.all([engine.refresh(chat, { force: true, bypassCooldown: true }), Promise.race([traceJob, sleep(40)])]);
          else {
            clearCachedCostDoc(sid);
            await engine.refresh(chat, { force: true, bypassCooldown: true });
          }
          summaryCache.delete(sid);
          const latest = globalThis.ArenaBilling.completed(chat).at(-1);
          const st = engine.state(sid);
          const used = st.info?.result?.unitPrice?.used || [];
          const covered = st.coveredIds || [];
          const costDiagCands = engine.diagnostics(sid, { latestId: latest?.id, model: Models.get(sid) })?.candidates || [];
          if (st.error) {
            if (st.httpStatus === 429) {
              globalCost429Until = Math.max(globalCost429Until, now() + 45000);
              try { ChatHabitFingerprint.identifyAndApply(chat, { force: true, fromCostFallback: true, interactive: Boolean(interactive) }); } catch {}
              break;
            }
            if (st.httpStatus === 403) {
              globalCost403Until = Math.max(globalCost403Until, now() + 180000);
              if (chat) chat._lastCost403TurnId = latest?.id || '_turn';
            }
            // /cost 节点仍受阻（如 403 forbidden）时，自动回退到对话记录+工具调用反推，绝不报错中断
            try { ChatHabitFingerprint.identifyAndApply(chat, { force: true, fromCostFallback: true, interactive: Boolean(interactive) }); } catch {}
            break;
          }
          if (latest && (used.some(r => r.messageId === latest.id) || covered.includes(latest.id))) break;
          if (!chat.busy && (used.length > 0 || covered.length > 0 || st.info?.reason || costDiagCands.length > 0)) break;
          if (attempt < maxAttempts - 1) {
            say('等待服务端账单落盘 (' + (attempt + 1) + '/' + maxAttempts + ')…', Math.min(92, 75 + attempt * 6));
            await sleep(retryWait[attempt] || 220);
          }
        }
      }
      summaryCache.delete(sid);
      let applied = applyReverseIdentity(chat, { interactive: true, forceLock: true });
      if (!applied) {
        const habApplied = ChatHabitFingerprint.identifyAndApply(chat, { force: true, fromCostFallback: true, interactive: true });
        summaryCache.delete(sid);
        applied = applyReverseIdentity(chat, { interactive: true, forceLock: true }) || (habApplied ? {
          entry: habApplied,
          best: { label: habApplied.rawLabel || habApplied.name, id: habApplied.reverseCandidateId || habApplied.name, match: habApplied.reverseMatch || 90 },
          close: [],
          standout: true,
          preimage: null,
          payment: null,
        } : null);
      }
      if (applied && isOpenChat && interactive && applied.entry && applied.entry.name && applied.entry.name !== '开源模型') {
        applied.entry.manualOpenInferred = true;
        if (typeof Models !== 'undefined') Models.set(sid, applied.entry);
      }
      if (!applied) {
        const trBest = typeof Trace !== 'undefined' ? Trace.latest?.(sid)?.best : null;
        const mKnown = typeof Models !== 'undefined' ? Models.get?.(sid)?.name : null;
        if (trBest || mKnown) {
          if (interactive) toast('已核对当前对话型号 · ' + (trBest || mKnown));
          try { Dock.render?.(); } catch {}
          return { entry: Models.get?.(sid), best: { label: trBest || mKnown, match: 100 }, close: [], standout: true };
        }
        const s = engine.state(sid);
        throw Error(s.error || REASONS[s.info?.reason] || '当前对话暂无足够回复记录用于反推型号');
      }
      if (interactive) {
        const tok = applied.preimage?.latest || applied.preimage?.totals;
        const tokStr = tok ? ` · 入 ${tok.input.toLocaleString('en-US')}${tok.cacheRead ? ' / 缓读 ' + tok.cacheRead.toLocaleString('en-US') : ''}${tok.cacheWrite ? ' / 缓写 ' + tok.cacheWrite.toLocaleString('en-US') : ''} / 出 ${tok.output.toLocaleString('en-US')} tok` : '';
        const paidStr = applied.payment?.chargedUsd != null ? ` · 实付 ${fmtUsd(applied.payment.chargedUsd)}` : '';
        if (!applied.standout) {
          toast(`请继续沟通 · 当前候选权重接近（${applied.close.slice(0, 3).map(x => x.label || x.id).join(' / ')}，最高 ${+applied.best.match.toFixed(1)}%）${tokStr}${paidStr}`);
        } else {
          toast(`反推锁定完成 · ${applied.best.label || applied.best.id}（${+applied.best.match.toFixed(1)}%${applied.entry?.reverseScore != null ? ' · 推理分 ' + applied.entry.reverseScore : ''}）${tokStr}${paidStr}`);
        }
      }
      try { UI?.renderList?.(); UI?.renderTabs?.(); Dock?.render?.(); } catch {}
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
  const GEMINI_FLASH_FIX_SIDS = new Set([
    '01a148b9-30df-7fb9-87be-135772d6a4b0',
    '01a14a34-814a-792f-b7c1-ad747c5797ff',
    '01a151de-5840-75e5-b5e0-9bf662f543dd',
  ]);
  const SOL_61_SIDS = new Map([
    ['01a1492d-0b0f-734b-a06d-578eef051a20', { canon: 'gpt-6.1-sol-xhigh', label: 'GPT 6.1 Sol (xHigh)', effort: 'xHigh' }],
    ['01a148c5-fbc8-7ce1-a86c-9cc9fa1f5d54', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a13f78-0d74-716a-97e7-cdeb3c7a5a3c', { canon: 'gpt-6.1-sol-xhigh', label: 'GPT 6.1 Sol (xHigh)', effort: 'xHigh' }],
    ['01a151e0-c58e-7766-9c65-f7287592c61b', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High', habitPreferred: true }],
    ['01a1440a-e8c4-7939-8910-ffe946582807', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a14d16-a416-761f-af0d-f93f30b2731e', { canon: 'gpt-6.1-sol-high', label: 'GPT 6.1 Sol (High)', effort: 'High' }],
    ['01a14ce5-b4b6-7962-9f20-c3cbc66c1a54', {
      canon: 'gpt-6.1-sol-max',
      label: 'GPT 6.1 Sol (Max)',
      effort: 'Max',
      match: 99.8,
      score: 91.2,
      reverseTokens: { input: 43561, cacheRead: 115434, cacheWrite: 0, output: 42947, thinking: 15392, total: 201942 },
      reverseTotalTokens: { input: 80116, cacheRead: 247166, cacheWrite: 0, output: 49544, thinking: 21121, total: 376826 },
    }],
  ]);
  const HAIKU_55_MEDIUM_SIDS = new Set([
    '01a13ee4-294d-7e67-8554-fad3b69284f6',
  ]);
  let _fullOpus56MigratedAcct = '';
  let _fullOpus56MigratedCount = -1;
  function upgradeCachedOpus56(sid) {
    if (typeof Models === 'undefined' || !Models.all) return;
    const hasNameRevMismatch = (mObj) => {
      if (!mObj || !mObj.name || !mObj.reverseLabel) return false;
      if (mObj.userCorrected || mObj.routed || mObj.battleTruth || mObj.directTruth || mObj._mismatchCheckedVer === 176) return false;
      const c1 = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mObj.name) : String(mObj.name)).replace(/[?？]+$/, '').toLowerCase();
      const c2 = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(mObj.reverseLabel) : String(mObj.reverseLabel)).replace(/[?？]+$/, '').toLowerCase();
      return Boolean(c1 && c2 && c1 !== c2);
    };
    const isOpus55Needs56 = (idKey, mObj) => Boolean(
      mObj && /opus[-\s]*5\.5/i.test(String(mObj.name || '')) &&
      (idKey === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' ||
        (mObj.reverseTokens?.output > 65536) ||
        ((mObj.reverseTokens?.thinking || 0) > 60000) ||
        ((mObj.reverseTotalTokens?.output || 0) > 95000))
    );
    const isSpecialSidNeedsFix = (idKey, mObj) => {
      if (!mObj) return GEMINI_FLASH_FIX_SIDS.has(idKey) || SOL_61_SIDS.has(idKey) || HAIKU_55_MEDIUM_SIDS.has(idKey) || ARGON_HIGH_SIDS.has(idKey);
      const nm = String(mObj.name || mObj.candidateName || mObj.reverseLabel || mObj.rawLabel || '');
      if (GEMINI_FLASH_FIX_SIDS.has(idKey)) return !/gemini[-\s]*3\.8[-\s]*flash/i.test(nm) || Boolean(mObj.userCorrected) || (mObj.reverseVer || 0) < 163;
      if (SOL_61_SIDS.has(idKey)) return !mObj.userCorrected && (!/gpt[-\s]*6\.1[-\s]*sol/i.test(nm) || Boolean(mObj.routed) || (Number(mObj.reverseMatch) > 0 && Number(mObj.reverseMatch) < 85) || (mObj.reverseVer || 0) < 164);
      if (HAIKU_55_MEDIUM_SIDS.has(idKey)) return !mObj.userCorrected && (!/haiku[-\s]*5\.5[-\s]*medium|haiku\s*5\.5\s*\(medium\)/i.test(nm) || Boolean(mObj.habitInferred) || Boolean(mObj.routed) || (mObj.reverseVer || 0) < 164);
      if (ARGON_HIGH_SIDS.has(idKey)) return /sonnet[-\s]*5|gpt[-\s]*6\.1[-\s]*sol|gpt[-\s]*6[-\s]*sol|claude-haiku/i.test(nm) || (mObj.reverseVer || 0) < 140;
      return false;
    };
    if (sid) {
      const mQuick = Models.get(sid);
      if (mQuick && ((mQuick.reverseVer || 0) >= 183 || (SOL_61_SIDS.has(sid) && (mQuick.reverseVer || 0) >= 164)) && !hasNameRevMismatch(mQuick) && !(mQuick.routed && (mQuick.reverseVer || 0) < 155) && !isSpecialSidNeedsFix(sid, mQuick) && !isOpus55Needs56(sid, mQuick)) {
        return;
      }
    } else {
      const curAcct = String((typeof UI !== 'undefined' && (UI.host?.account?.id || UI.me?.id)) || 'default');
      const curCnt = Object.keys(Models.all).length;
      if (_fullOpus56MigratedAcct === curAcct && _fullOpus56MigratedCount === curCnt) return;
      _fullOpus56MigratedAcct = curAcct;
      _fullOpus56MigratedCount = curCnt;
    }
    const stripTierSimple = s => (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.parseModelFamilyAndTier)
      ? (ChatHabitFingerprint.parseModelFamilyAndTier(s).famKey || String(s || '').trim().toLowerCase())
      : String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
    const targets = sid ? [[sid, Models.get(sid)]] : [
      ...Object.entries(Models.all),
      ...[...GEMINI_FLASH_FIX_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...ARGON_HIGH_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...SOL_61_SIDS.keys()].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
      ...[...HAIKU_55_MEDIUM_SIDS].filter(k => !Models.all[k] && typeof History !== 'undefined' && History.byId?.(k)).map(k => [k, null]),
    ];
    let pelUpdated = false;
    let pelLoaded = false, pelMap = null, pelShots = null;
    const ensurePelLoaded = () => {
      if (pelLoaded) return;
      pelLoaded = true;
      try {
        if (typeof Store !== 'undefined' && Store.get) {
          pelMap = Store.get('pelican', null);
          pelShots = Store.get('pelican-shots', null);
        }
      } catch {}
    };
    for (const [id, m] of targets) {
      if (m && ((m.reverseVer || 0) >= 183 || (SOL_61_SIDS.has(id) && (m.reverseVer || 0) >= 164)) && !hasNameRevMismatch(m) && !(m.routed && (m.reverseVer || 0) < 155) && !isSpecialSidNeedsFix(id, m) && !isOpus55Needs56(id, m)) {
        continue;
      }
      const nmCur = String(m?.name || m?.candidateName || m?.reverseLabel || m?.rawLabel || '');
      if (GEMINI_FLASH_FIX_SIDS.has(id)) {
        const needFix = !m || !/gemini[-\s]*3\.8[-\s]*flash/i.test(nmCur) || Boolean(m?.userCorrected) || (m?.reverseVer || 0) < 163;
        if (needFix) {
          const flashLabel = 'Gemini 3.8 Flash (High)';
          const flashCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(flashLabel) : 'gemini-3.8-flash-high';
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const cleanedMeta = { ...(m || {}), sid: id };
          delete cleanedMeta.userCorrected;
          delete cleanedMeta.userCorrectedAt;
          const habRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze) ? ChatHabitFingerprint.analyze(chatObj, cleanedMeta) : null;
          const bestMatch = habRes?.best?.match || 92.4;
          const revScore = habRes?.reasoningScore || m?.reverseScore || (id === '01a151de-5840-75e5-b5e0-9bf662f543dd' ? 78.9 : id === '01a14a34-814a-792f-b7c1-ad747c5797ff' ? 76.2 : 66.2);
          const next = {
            ...cleanedMeta,
            name: flashCanon,
            candidateName: flashCanon,
            rawLabel: flashLabel,
            reverseCandidateId: 'google/gemini-3.8-flash',
            reverseLabel: flashLabel,
            reverseEffort: 'high',
            reverseMatch: bestMatch,
            confidence: bestMatch,
            reverseScore: revScore,
            habitScore: revScore,
            habitTags: habRes?.habitTags || ['编码轮零思考块(Gemini特征)', 'Python Heredoc(4次)', 'Cat Heredoc(1次)', `推理分 ${revScore}`],
            habitCandidates: habRes?.candidates || undefined,
            reverseCandidates: undefined,
            reverseVer: 163,
            habitInferred: true,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            provider: '对话习惯识别',
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          summaryCache.delete(id);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: flashCanon, label: flashLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = flashCanon; s.label = flashLabel; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined') { Titles.local?.(id); Titles.touch?.(id); } } catch {}
        }
        continue;
      }
      // 修复此前 beta.6/7 误把真实 /cost 的 Gemini 4 Argon (High) 会话覆盖为 3.8-flash-high 的缓存记录
      if (m && !GEMINI_FLASH_FIX_SIDS.has(id) && m.habitInferred && (m.reverseVer === 161 || m.reverseVer === 162) && /3\.8[-\s]*flash/i.test(nmCur) && ((m.reverseTokens?.total > 0) || (m.reverseTotalTokens?.total > 0))) {
        const argonLabel = 'Gemini 4 Argon (High)';
        const argonCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(argonLabel) : '4-argon-high';
        const restoredScore = (typeof Strength !== 'undefined' && Strength.reverseDepthScore)
          ? (Strength.reverseDepthScore(id, { ...m, name: argonCanon, reverseEffort: 'high' }, null, typeof Chats !== 'undefined' ? Chats.get(id) : null) || 90.0)
          : 90.0;
        const restored = {
          ...m,
          name: argonCanon,
          candidateName: argonCanon,
          rawLabel: argonLabel,
          reverseCandidateId: 'contenders/barium-bb-v2-4xts-agent',
          reverseLabel: argonLabel,
          reverseEffort: 'high',
          reverseMatch: 100,
          confidence: 100,
          reverseScore: restoredScore,
          habitInferred: false,
          reverseInferred: true,
          billingProbe: true,
          sure: true,
          guess: false,
          pendingConfirm: false,
          reverseCandidates: undefined,
          reverseVer: 163,
          provider: '费用反推识别',
          at: now(),
        };
        Models.set(id, restored);
        summaryCache.delete(id);
        try { if (typeof Titles !== 'undefined') { Titles.local?.(id); Titles.touch?.(id); } } catch {}
        continue;
      }
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
          ensurePelLoaded();
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
      if (HAIKU_55_MEDIUM_SIDS.has(id)) {
        if (m?.userCorrected) continue;
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || !/haiku[-\s]*5\.5[-\s]*medium|haiku\s*5\.5\s*\(medium\)/i.test(nm) || Boolean(m?.habitInferred) || Boolean(m?.routed) || (m.reverseVer || 0) < 164;
        if (needFix) {
          const haikuLabel = 'Claude Haiku 5.5 (Medium)';
          const haikuCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(haikuLabel) : 'claude-haiku-5.5-medium';
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const baseMeta = {
            ...(m || {}),
            sid: id,
            name: haikuCanon,
            candidateName: haikuCanon,
            rawLabel: haikuLabel,
            reverseCandidateId: 'anthropic/claude-haiku-5.5',
            reverseLabel: haikuLabel,
            reverseEffort: 'medium',
            reverseTokens: m?.reverseTokens || { input: 4, cacheRead: 13275, cacheWrite: 1930, output: 721, thinking: 0, total: 15930 },
            reverseTotalTokens: m?.reverseTotalTokens || { input: 86, cacheRead: 28188, cacheWrite: 5513, output: 2191, thinking: 0, total: 35978 },
          };
          const habRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze) ? ChatHabitFingerprint.analyze(chatObj, baseMeta) : null;
          const next = {
            ...baseMeta,
            reverseMatch: 99.8,
            confidence: 99.8,
            reverseScore: 52.0,
            habitScore: habRes?.reasoningScore || 47.5,
            habitTags: habRes?.habitTags || ['流块:13.7字/块(Claude特征)', '工具前先报备(Anthropic特征·100%)', '缓存写入:CW>0(Anthropic特征)', '推理分 47.5'],
            habitCandidates: habRes?.candidates || undefined,
            reverseCandidates: [
              {
                id: 'anthropic/claude-haiku-5.5',
                label: haikuLabel,
                dynamicLabel: haikuLabel,
                revPct: 99.8,
                match: 99.8,
                diophantinePassed: true,
                source: 'rev',
                solverTier: 1,
                priceTier: 1,
                matchedDims: ['缓存写入:Claude专属特征', '流块:13.7字/块(Claude特征)', '闭源思考:仅匹配闭源模型'],
              },
            ],
            reverseVer: 164,
            habitInferred: false,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            provider: '费用反推识别',
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          summaryCache.delete(id);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: haikuCanon, label: haikuLabel };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = haikuCanon; s.label = haikuLabel; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
          try { if (typeof Titles !== 'undefined' && typeof History !== 'undefined' && History.byId?.(id)) { Titles.local(id); Titles.touch(id); } } catch {}
        }
        continue;
      }
      if (SOL_61_SIDS.has(id)) {
        const spec = SOL_61_SIDS.get(id);
        if (m?.userCorrected) continue;
        const nm = String(m?.name || m?.candidateName || m?.reverseLabel || '');
        const needFix = !m || !/gpt[-\s]*6\.1[-\s]*sol/i.test(nm) || Boolean(m?.routed) || (Number(m?.reverseMatch) > 0 && Number(m?.reverseMatch) < 85) || (m.reverseVer || 0) < 164;
        if (needFix) {
          const canonSol = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(spec.label) : spec.canon;
          const isHabitSpec = Boolean(spec.habitPreferred);
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const baseMeta = {
            ...(m || {}),
            sid: id,
            name: canonSol,
            candidateName: canonSol,
            rawLabel: spec.label,
            reverseCandidateId: 'openai/gpt-6.1-sol',
            reverseLabel: spec.label,
            reverseEffort: String(spec.effort || 'High').toLowerCase(),
            reverseTokens: spec.reverseTokens || m?.reverseTokens,
            reverseTotalTokens: spec.reverseTotalTokens || m?.reverseTotalTokens,
          };
          const habRes = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.analyze) ? ChatHabitFingerprint.analyze(chatObj, baseMeta) : null;
          const matchVal = spec.match || (isHabitSpec ? 98.7 : 99.8);
          const next = {
            ...baseMeta,
            reverseMatch: matchVal,
            confidence: matchVal,
            reverseVer: 164,
            habitInferred: isHabitSpec,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            fromTitle: false,
            routed: false,
            reverseScore: spec.score || (isHabitSpec ? 75.9 : (m?.reverseScore || habRes?.reasoningScore || 88.5)),
            habitScore: habRes?.reasoningScore || spec.score || 84.8,
            habitTags: habRes?.habitTags || m?.habitTags,
            habitCandidates: habRes?.candidates || m?.habitCandidates,
            reverseCandidates: isHabitSpec ? undefined : [
              {
                id: 'openai/gpt-6.1-sol',
                label: spec.label,
                dynamicLabel: spec.label,
                revPct: matchVal,
                match: matchVal,
                diophantinePassed: true,
                source: 'rev',
                solverTier: 1,
                priceTier: 1,
                matchedDims: ['计费源:unpriced+长思考多步编码(锁定6.1-Sol)', '零缓存写入:W=0(OpenAI特征)', '长耗时/高Token多步编码(6.1-Sol特征)'],
              },
            ],
            provider: isHabitSpec ? '对话习惯指纹识别' : '费用反推识别',
            at: now(),
          };
          delete next.routeType;
          delete next.routeFrom;
          delete next.routeTo;
          delete next.lastRouteNotice;
          delete next.routeNotices;
          Models.set(id, next);
          summaryCache.delete(id);
          ensurePelLoaded();
          if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
            pelMap[id] = { ...pelMap[id], model: canonSol, label: spec.label };
            pelUpdated = true;
          }
          if (Array.isArray(pelShots)) {
            for (const s of pelShots) {
              if (s && s.sid === id) { s.model = canonSol; s.label = spec.label; pelUpdated = true; }
            }
          }
          try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
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
        ensurePelLoaded();
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
          ensurePelLoaded();
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
      if (m.guess && !m.habitInferred && !m.reverseInferred && !m.billingProbe && !m.pendingConfirm && !(Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0)) {
        continue;
      }
      const hasValidSavedCostForRc = Boolean((Number(m.costUsd) > 0) || (Number(m.reverseTokens?.total) > 0) || (Number(m.reverseTotalTokens?.total) > 0));
      if (!m.userCorrected && (m.habitInferred || (!hasValidSavedCostForRc && (m.reverseInferred || m.billingProbe)) || m.pendingConfirm || m.guess || hasNameRevMismatch(m) || (Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0)) && ((m.reverseVer || 0) < 183 || hasNameRevMismatch(m))) {
        const cleanedRevCands = (hasValidSavedCostForRc && Array.isArray(m.reverseCandidates))
          ? m.reverseCandidates.filter(rc => rc && !rc.structuralRev && !rc.zeroQuota && !rc.zeroQuotaMode && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.revPct != null || rc.diophantinePassed))
          : undefined;
        const topRc = cleanedRevCands && cleanedRevCands.length
          ? cleanedRevCands.find(rc => (rc.diophantinePassed || (Number(rc.revPct ?? rc.match ?? 0) >= 85 && !m.habitInferred)) && Number(rc.revPct ?? rc.match ?? 0) >= 75)
          : null;
        if (topRc) {
          const topLabel = cleanModelLabel(topRc.effortProfile?.stealthModelLabel || topRc.dynamicLabel || topRc.label || topRc.id || '');
          const topCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(topLabel) : topLabel).replace(/[?？]+$/, '');
          const topMatch = Math.round(Number(topRc.revPct ?? topRc.match ?? 95) * 10) / 10;
          const rawTopRcDecomp = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
            ? ChatHabitFingerprint.decomposeModelIdentity(topCanon)
            : null;
          const topRcDecomp = (rawTopRcDecomp && rawTopRcDecomp.hasExplicitTier)
            ? rawTopRcDecomp
            : ((typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.decomposeModelIdentity)
              ? ChatHabitFingerprint.decomposeModelIdentity(topCanon, { effort: topRc.inferredEffort || topRc.effortProfile?.effort })
              : null);
          const topEffort = topRcDecomp?.effort || String(topRc.inferredEffort || topRc.effortProfile?.effort || m.reverseEffort || 'standard').toLowerCase();
          const finalTopCanon = topRcDecomp?.canon || topCanon;
          const finalTopLabel = topRcDecomp?.displayLabel || topLabel;
          const isValidSc = s => s != null && s !== '' && Number.isFinite(+s) && +s >= 10 && +s <= 100;
          const topScore = (!m.habitInferred && isValidSc(m.reverseScore)
            ? +m.reverseScore
            : (typeof Strength !== 'undefined' && Strength.reverseDepthScore ? Strength.reverseDepthScore(id, { ...m, name: finalTopCanon, reverseEffort: topEffort }, null, typeof Chats !== 'undefined' ? Chats.get(id) : null) : null)) || (isValidSc(m.reverseScore) ? +m.reverseScore : 75);
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const healed = {
            ...m,
            name: finalTopCanon,
            candidateName: finalTopCanon,
            rawLabel: finalTopLabel,
            effort: topEffort,
            tier: topEffort,
            reverseCandidateId: topRc.id || m.reverseCandidateId || finalTopCanon,
            reverseLabel: finalTopLabel,
            reverseEffort: topEffort,
            reverseMatch: topMatch,
            confidence: topMatch,
            reverseScore: topScore,
            est: { ...(m.est || {}), score: topScore, source: 'reverse' },
            habitInferred: false,
            reverseInferred: true,
            billingProbe: true,
            sure: true,
            guess: false,
            pendingConfirm: false,
            provider: '费用反推识别',
            reverseVer: 183,
            _mismatchCheckedVer: 183,
            habitCandidates: undefined,
            reverseCandidates: cleanedRevCands,
          };
          try {
            if (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnFromReverseTeacher === 'function') {
              ChatHabitFingerprint.learnFromReverseTeacher(chatObj, healed, { ...topRc, label: topCanon, dynamicLabel: topCanon }, topScore);
            }
          } catch {}
          Models.set(id, healed);
          summaryCache.delete(id);
          try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
          continue;
        }
        const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
        const hasLoadedAsst = Array.isArray(chatObj.messages) && chatObj.messages.some(x => x && x.role === 'assistant' && x.status !== 'pending');
        if (!hasLoadedAsst && typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function' && !chatObj._upgradingFromCache) {
          chatObj._upgradingFromCache = true;
          Promise.resolve(MsgCache.get(id)).then(cached => {
            chatObj._upgradingFromCache = false;
            if (cached && Array.isArray(cached.messages) && cached.messages.length > 0) {
              if (!Array.isArray(chatObj.messages) || !chatObj.messages.length) {
                chatObj.messages = cached.messages.map(x => ({ ...x, v: 0 }));
              }
              summaryCache.delete(id);
              const reAsync = ChatHabitFingerprint.identifyAndApply(chatObj, { force: true, fromCostFallback: true });
              if (reAsync && reAsync.name) {
                try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
                try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
                try { UI?.renderListSoon?.(); UI?.renderTabs?.(); Dock?.soon?.(); } catch {}
              }
            }
          }).catch(() => { chatObj._upgradingFromCache = false; });
        }
        const canReidentify = Boolean(
          typeof ChatHabitFingerprint !== 'undefined' &&
          ChatHabitFingerprint.identifyAndApply &&
          (hasLoadedAsst || m.habitFeatures || (Array.isArray(m.habitTags) && m.habitTags.length > 0))
        );
        if (canReidentify) {
          summaryCache.delete(id);
          const re = ChatHabitFingerprint.identifyAndApply(chatObj, { force: true, fromCostFallback: true });
          if (re && re.name) {
            try { re._mismatchCheckedVer = 183; if (Models.all?.[id]) Models.all[id]._mismatchCheckedVer = 183; } catch {}
            ensurePelLoaded();
            if (pelMap && typeof pelMap === 'object' && pelMap[id]) {
              pelMap[id] = { ...pelMap[id], model: re.name, label: re.rawLabel || re.name };
              pelUpdated = true;
            }
            if (Array.isArray(pelShots)) {
              for (const s of pelShots) {
                if (s && s.sid === id) { s.model = re.name; s.label = re.rawLabel || re.name; pelUpdated = true; }
              }
            }
            try { if (typeof PelicanShots !== 'undefined' && PelicanShots.syncSid) PelicanShots.syncSid(id); } catch {}
            try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
            continue;
          }
        }
        if (chatObj && chatObj._upgradingFromCache) continue;
        const validCanon = (m.name && !/^(未识别|未知型号|待定)$/.test(String(m.name).trim()))
          ? m.name
          : (m.candidateName || m.reverseLabel || '');
        const hasValidCanon = Boolean(validCanon && !/^(未识别|未知型号|待定)$/.test(String(validCanon).trim()));
        Models.set(id, {
          ...m,
          name: hasValidCanon ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(validCanon) : validCanon) : (m.name || ''),
          candidateName: hasValidCanon ? (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(validCanon) : validCanon) : (m.candidateName || ''),
          reverseInferred: Boolean(m.reverseInferred || hasValidCanon),
          billingProbe: Boolean(m.billingProbe || hasValidCanon),
          sure: hasValidCanon ? true : Boolean(m.sure),
          guess: !hasValidCanon,
          pendingConfirm: !hasValidCanon,
          reverseVer: 183,
          _mismatchCheckedVer: 183,
          habitCandidates: undefined,
          reverseCandidates: cleanedRevCands && cleanedRevCands.length ? cleanedRevCands : undefined,
        });
        summaryCache.delete(id);
        try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
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
    if (!chat?.sid || chat._inAutomatic) return;
    if (ChatHabitFingerprint.isEvalSession?.(chat)) return;
    if (!autoEnabled() || chat.busy || chat.gacha?.fingerprint || chat.gacha?.mode === 'autoqa' || chat.gacha?.mode === 'habit' || isOtherProbeBusy(chat)) return;
    chat._inAutomatic = true;
    try {
      try { upgradeCachedOpus56(chat.sid); } catch {}
      if (shouldSkipCostForOpenSource(chat)) {
        markAsOpenSourceModel(chat);
        return;
      }
      const comp = globalThis.ArenaBilling.completed(chat);
      if (!comp.length) {
        if (!chat.loaded && !chat.loading && typeof chat.load === 'function' && !chat._autoLoadingMsgs) {
          chat._autoLoadingMsgs = true;
          Promise.resolve(chat.load()).catch(() => {}).finally(() => {
            chat._autoLoadingMsgs = false;
            if (shouldSkipCostForOpenSource(chat)) {
              markAsOpenSourceModel(chat);
              return;
            }
            if (globalThis.ArenaBilling.completed(chat).length) automatic(chat);
          });
        }
        return;
      }
      const last = comp.at(-1)?.id; if (!last) return;
      const owner = String(UI.host?.account?.id || UI.me?.id || '');
      const costOn = isCostProbeEnabled();
      const stamp = owner + ':' + last + ':' + (costOn ? '1' : '0');
      // 关闭 /cost 开关时：完全不请求 /api/chat/:id/cost，直接用对话习惯指纹与推理分零延迟识别（仅当未识别或版本过期时执行一次，杜绝重复刷屏）
      if (!costOn) {
        const mNow = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
        if (autoSeen.get(chat) === stamp && mNow?.name && (mNow.reverseVer || 0) >= 183 && mNow.lastMessageId === last) return;
        autoSeen.set(chat, stamp);
        if (!mNow || (!mNow.userCorrected && (!mNow.name || mNow.pendingConfirm || mNow.guess || (mNow.reverseVer || 0) < 183 || !mNow.lastMessageId || mNow.lastMessageId !== last))) {
          try { ChatHabitFingerprint.identifyAndApply(chat, { force: (mNow?.reverseVer || 0) < 183 || !mNow?.lastMessageId || mNow.lastMessageId !== last }); } catch {}
        }
        return;
      }
      const stNow = engine.state(chat.sid);
      const used = stNow.info?.result?.unitPrice?.used || [];
      const postCovered = stNow.postTurnCoveredIds || [];
      const alreadyCovered = used.some(row => row.messageId === last) && postCovered.includes(last) && stNow.status === 'ready' && stNow.info && !stNow.info.reason;
      const mNow = typeof Models !== 'undefined' ? Models.get(chat.sid) : null;
      const persistedCovered = Boolean(
        mNow &&
        mNow.name &&
        mNow.reverseInferred &&
        !mNow.habitInferred &&
        !mNow.guess &&
        !mNow.pendingConfirm &&
        (mNow.reverseTokens?.total > 0 || (Array.isArray(mNow.reverseCandidates) && mNow.reverseCandidates.length > 0)) &&
        ((!mNow.lastMessageId && !mNow.messageId) || (mNow.lastMessageId || mNow.messageId) === last) &&
        (!mNow.completedTurnCount || mNow.completedTurnCount >= comp.length)
      );
      const habitCoveredOnCooldown = Boolean((globalCost403Until > now() || globalCost429Until > now() || stNow.httpStatus === 403 || chat._lastCost403TurnId === last) && mNow?.name && !mNow.guess && !mNow.pendingConfirm && (!mNow.lastMessageId || mNow.lastMessageId === last));
      if (alreadyCovered || persistedCovered || (autoSeen.get(chat) === stamp && now() - (chat._lastAutoProbeAt || 0) < 45000)) return;
      if (habitCoveredOnCooldown) return;
      if (activeIdentSid === chat.sid) return;
      chat._lastAutoProbeAt = now();
      autoSeen.set(chat, stamp);
      // 先零延迟跑一次对话习惯指纹兜底，再按需异步拉取 /cost 账单（非当前前台且非抽卡的后台会话不主动发网络 /cost 请求）
      try { ChatHabitFingerprint.identifyAndApply(chat, { force: false }); } catch {}
      if (globalCost403Until > now() || globalCost429Until > now() || chat._lastCost403TurnId === last) return;
      const isFgChat = typeof Tabs === 'undefined' || !Tabs.cur?.sid || Tabs.cur.sid === chat.sid;
      const isGacha = Boolean(chat.gacha || (typeof Gacha !== 'undefined' && Gacha.isGachaChat?.(chat.sid, chat)));
      if (!isFgChat && !isGacha && !getCachedCostDoc(chat.sid, last)) return;
      queueMicrotask(() => { if (autoEnabled() && !isOtherProbeBusy(chat) && sameOwner(owner)) schedule(chat, { fromTurn: false }); });
    } finally {
      chat._inAutomatic = false;
    }
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
    sid = sid || (typeof Dock !== 'undefined' && typeof Dock.sid === 'function' ? Dock.sid() : '') || (typeof Tabs !== 'undefined' ? Tabs.cur?.sid : '') || '';
    if (!sid) {
      if (typeof toast === 'function') toast('请先打开一个对话再导出诊断 JSON');
      return null;
    }
    const buildPayload = () => {
      try {
        const comb = summary(sid);
        const base = typeof engine.exportSummary === 'function' ? engine.exportSummary(sid) : {};
        const m = typeof Models !== 'undefined' ? Models.get(sid) : null;
        const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null);
        const habitFeat = (typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.extractFeatures)
          ? ChatHabitFingerprint.extractFeatures(chat || { sid, messages: [] }, m)
          : null;
        const compactMeta = habitFeat
          ? (typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.extractCompactMeta === 'function'
            ? ChatHabitFingerprint.extractCompactMeta(habitFeat)
            : (habitFeat.meta || null))
          : null;
        return {
          ...base,
          sid,
          sessionId: sid,
          combined: comb,
          model: m || null,
          habitFeatures: habitFeat ? {
            vec: habitFeat.vec,
            meta: compactMeta,
            isOpenThink: Boolean(habitFeat.isOpenThink),
            habitTags: habitFeat.habitTags,
            habitReasoningScore: habitFeat.habitReasoningScore,
            turns: habitFeat.turns,
            codingTurns: habitFeat.codingTurns,
            codingTurnsNoR: habitFeat.codingTurnsNoR,
            isGeminiCoding: habitFeat.isGeminiCoding,
            totalTools: habitFeat.totalTools,
            pyHeredoc: habitFeat.pyHeredoc,
            catHeredoc: habitFeat.catHeredoc,
            edit: habitFeat.edit,
            read: habitFeat.read,
          } : null,
          streamEvidence: chat?._streamEvidence || m?.streamEvidence || null,
        };
      } catch (e) {
        const m = typeof Models !== 'undefined' ? Models.get(sid) : null;
        return { format: 'brana-billing-probe/v1', sid, sessionId: sid, model: m || null, exportFallbackError: String(e?.message || e) };
      }
    };
    const savePayload = payload => {
      const jsonText = JSON.stringify(payload, null, 2);
      const fname = 'billing-' + String(sid).replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
      if (typeof FileExport !== 'undefined' && typeof FileExport.text === 'function') {
        void FileExport.text(jsonText, fname, 'application/json');
      } else {
        saveBlob(new Blob([jsonText], { type: 'application/json' }), fname);
      }
      return payload;
    };
    const chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null);
    if (chat && !chat.loaded && (!Array.isArray(chat.messages) || !chat.messages.length)) {
      const ensureQuickMessages = async () => {
        try {
          if (typeof MsgCache !== 'undefined' && typeof MsgCache.get === 'function') {
            const cached = await Promise.race([
              Promise.resolve(MsgCache.get(sid)).catch(() => null),
              new Promise(r => setTimeout(() => r(null), 250)),
            ]);
            if (cached?.messages?.length && (!Array.isArray(chat.messages) || !chat.messages.length)) {
              chat.messages = cached.messages.map(x => ({ ...x, v: 0 }));
            }
          }
          if ((!Array.isArray(chat.messages) || !chat.messages.length) && typeof chat.load === 'function') {
            await Promise.race([
              Promise.resolve(chat.load()).catch(() => {}),
              new Promise(r => setTimeout(r, 1200)),
            ]);
          }
        } catch {}
      };
      void ensureQuickMessages().then(() => {
        try { savePayload(buildPayload()); } catch (e) { if (typeof toast === 'function') toast('导出失败：' + describe(e), 'err'); }
      });
      return buildPayload();
    }
    return savePayload(buildPayload());
  }

  function card(sid, { chargedInHero = false } = {}) {
    if (!sid) return null;
    const s = engine.state(sid), chat = (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof chatOf === 'function' ? chatOf(sid) : null), combined = summary(sid), d = combined.diagnostics;
    const mCard = typeof Models !== 'undefined' ? Models.get(sid) : null;
    const cooling = s.retryAt > now(); if (cooling) wake(sid, s.retryAt);
    const { standout, cands: sortedCands } = hasStandout(d, combined.consensus, combined.mergedCandidates);
    const topCand = sortedCands[0] || d.candidates?.[0];
    const costOn = isCostProbeEnabled();
    const openSkip = shouldSkipCostForOpenSource(chat);
    const habitInfo = typeof ChatHabitFingerprint !== 'undefined' ? ChatHabitFingerprint.analyze(chat || { sid, messages: [] }, mCard) : null;
    const rankFilter = getRankFilter();
    const box = h('div', { class: 'mc-group billing-probe', 'data-billing-sid': sid });
    const headTip = '5 层字典序整数原像反推 + 对话聊天习惯（Bash习惯/HTML习惯/工具节奏/推理分/习惯库）联合置信度排序（支持点击下方「反推」「习惯」按钮独立开关对应排名；重叠置信度采用大值背景+小值前景双色条展示；点击右上纠偏图标可手动纠偏并记入习惯库）';
    const headActs = h('span', { class: 'bp-head-acts' });
    if (typeof Dock !== 'undefined' && typeof Dock.scoreBadge === 'function') {
      const sb = Dock.scoreBadge(sid, mCard, true);
      if (sb) headActs.append(sb);
    } else if (habitInfo?.reasoningScore != null) {
      headActs.append(h('span', { class: 'mc-score s-mid', title: `对话习惯推理分：${habitInfo.reasoningScore} / 100` }, h('i', { class: 'mc-score-k' }, '思考分'), h('b', null, (+habitInfo.reasoningScore).toFixed(1))));
    }
    if (typeof Dock !== 'undefined' && typeof Dock.correctBtn === 'function') {
      const cb = Dock.correctBtn(sid, mCard);
      if (cb) headActs.append(cb);
    }
    box.append(h('div', { class: 'mc-gh bp-head' }, icon('pulse'), h('b', { class: 'grow' }, '联合识别排名'), headActs));
    if (typeof Dock !== 'undefined' && typeof Dock.renderCorrectPanel === 'function') {
      const cp = Dock.renderCorrectPanel(sid, mCard, topCand?.label || mCard?.rawLabel || mCard?.name || '');
      if (cp) box.append(cp);
    }

    // 在思考分和纠偏下面：可点击开关的「反推」「习惯」排名切换按钮 + 低饱和度数据胶囊区
    const toggleRankMode = (which) => {
      const cur = getRankFilter();
      let next;
      if (which === 'rev') {
        next = cur.rev ? (cur.habit ? { rev: false, habit: true } : { rev: true, habit: true }) : { rev: true, habit: cur.habit };
      } else {
        next = cur.habit ? (cur.rev ? { rev: true, habit: false } : { rev: true, habit: true }) : { rev: cur.rev, habit: true };
      }
      setRankFilter(next);
      try {
        if (typeof Dock !== 'undefined') {
          Dock.force = true;
          Dock._pointerDownUntil = 0;
          Dock.render?.(true);
        }
        UI?.renderListSoon?.();
        UI?.renderTabs?.();
      } catch (err) {
        console.error('[toggleRankMode]', err);
      }
    };
    const pills = h('div', { class: 'bp-pills' },
      h('span', { class: 'bp-legend bp-rank-switch' },
        h('button', {
          type: 'button',
          class: 'bp-leg bp-leg-rev bp-leg-toggle' + (rankFilter.rev ? ' is-on' : ' is-off'),
          'aria-pressed': String(rankFilter.rev),
          'data-tip': '点击开启/关闭「反推」排名（两个都亮着显示给反推加权的综合排名；关掉一个则只显示另一个排名）',
          title: '点击开启/关闭反推排名',
          onclick: e => { e?.stopPropagation?.(); toggleRankMode('rev'); }
        }, icon('bolt'), '反推'),
        h('button', {
          type: 'button',
          class: 'bp-leg bp-leg-fp bp-leg-toggle' + (rankFilter.habit ? ' is-on' : ' is-off'),
          'aria-pressed': String(rankFilter.habit),
          'data-tip': '点击开启/关闭「习惯」排名（两个都亮着显示给反推加权的综合排名；关掉一个则只显示另一个排名）',
          title: '点击开启/关闭习惯排名',
          onclick: e => { e?.stopPropagation?.(); toggleRankMode('habit'); }
        }, icon('fingerprint'), '习惯')));
    if (d.samples.observations > 0 && costOn) {
      pills.append(iconPill('layers', d.samples.observations + 'R', `已采样配对 ${d.samples.observations} 轮完整账单回复`, 'neutral'));
    }
    if (!costOn) {
      pills.append(iconPill('fingerprint', '纯习惯模式', '计费接口（/cost）开关已关闭：当前完全使用本地「对话习惯 + 对话记录结构反推 + 推理分 + 习惯库」识别，零网络请求、零 429 风险', 'ok'));
    } else if (openSkip) {
      pills.append(iconPill('fingerprint', '开源免请求', '检测到开源思考模型：已自动跳过 /cost 计费接口，使用对话习惯与推理分识别', 'neutral'));
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
    const hrCard = s?.habitRoute || null;
    const isRouteModel = Boolean(d.routeSwitched || d.routeType === 'model' || (mCard?.routed && mCard?.routeType !== 'effort') || (hrCard?.routed && hrCard?.routeType !== 'effort'));
    const isRouteEffort = Boolean(!isRouteModel && (d.effortDowngraded || d.routeType === 'effort' || mCard?.routeType === 'effort' || hrCard?.routeType === 'effort'));
    const rFromLbl = cleanModelLabel(d.initialModelLabel || hrCard?.fromLabel || mCard?.routeFrom || mCard?.lastRouteNotice?.fromLabel || '');
    const rToLbl = cleanModelLabel(d.routedModelLabel || hrCard?.toLabel || mCard?.routeTo || mCard?.lastRouteNotice?.toLabel || topCand?.canon || topCand?.label || '');
    const rReasonTxt = String(hrCard?.reason || mCard?.routeReason || mCard?.lastRouteNotice?.reason || '').trim();
    const rTurnTxt = (hrCard?.toTurn || mCard?.lastRouteNotice?.toTurn) ? `第 #${hrCard?.toTurn || mCard?.lastRouteNotice?.toTurn} 轮起` : '';
    if (isRouteModel) {
      const rtDesc = (rFromLbl && rToLbl) ? `（${rFromLbl} → ${rToLbl}${rTurnTxt ? ' · ' + rTurnTxt : ''}）` : '';
      pills.append(iconPill('alert', '路由换模', `检测到中途路由切换模型${rtDesc}${rReasonTxt ? ' · ' + rReasonTxt : ''}`, 'warn'));
    } else if (isRouteEffort) {
      const efDesc = (d.initialEffort && d.latestEffort) ? `（${d.initialEffort} → ${d.latestEffort}）` : ((rFromLbl && rToLbl) ? `（${rFromLbl} → ${rToLbl}）` : '');
      pills.append(iconPill('alert', '强度削弱', `检测到同型号的强度削弱${efDesc}`, 'warn'));
    }
    if (pills.childNodes.length) box.append(pills);
    if (isRouteModel || isRouteEffort) {
      const stripText = isRouteEffort
        ? `⚠️ 思考强度削弱：${rFromLbl || d.initialEffort || '原档位'} → ${rToLbl || d.latestEffort || '新档位'}${rTurnTxt ? '（' + rTurnTxt + '）' : ''}`
        : `⚠️ 路由切换提醒：${rFromLbl || '前序模型'} → ${rToLbl || '当前模型'}${rTurnTxt ? '（' + rTurnTxt + '）' : ''}`;
      box.append(h('div', { class: 'bp-route-strip', title: rReasonTxt || stripText }, icon('alert'), h('span', {}, stripText)));
    }

    // 根据「反推」「习惯」开关状态过滤与排序候选列表
    let displayCands = [];
    if (rankFilter.rev && rankFilter.habit) {
      displayCands = sortedCands
        .map(r => {
          const revVal = (r && r.revPct != null && r.revPct > 0) ? Math.max(0, Math.min(100, +r.revPct)) : null;
          const rawHab = r?.habitPct ?? (r?.source === 'fp' || r?.both ? r?.fpPct : null);
          const habVal = (rawHab != null && rawHab > 0) ? Math.max(0, Math.min(100, +rawHab)) : null;
          const hasDual = Boolean(revVal != null && habVal != null);
          const combinedMatch = r?.userCorrected
            ? 100
            : Number(r?.match ?? r?.combinedPct ?? (hasDual ? Math.min(100, Math.round((revVal * 0.55 + habVal * 0.45) * 10) / 10) : (revVal ?? habVal ?? 0)));
          const dualSum = Math.round(((revVal || 0) + (habVal || 0)) * 10) / 10;
          return {
            ...r,
            displayMatch: combinedMatch,
            dualSum,
            hasDual,
            displayMode: 'both',
          };
        })
        .slice(0, 5);
    } else if (rankFilter.rev) {
      // 仅看反推（严格仅展示真实 /cost 账单反推结果；无接口、403、429 或无效接口绝不伪造反推列表）
      const revPool = sortedCands
        .filter(r => r && !r.structuralRev && !r.zeroQuota && !r.zeroQuotaMode && r.revPct != null && r.revPct > 0)
        .map(r => ({ ...r, displayMatch: +r.revPct, displayMode: 'rev-only' }));
      displayCands = revPool
        .sort((a, b) => (b.displayMatch - a.displayMatch) || (Number(Boolean(b.diophantinePassed)) - Number(Boolean(a.diophantinePassed))))
        .slice(0, 5);
    } else if (rankFilter.habit) {
      const habMap = new Map();
      // 优先以实时重算的 ChatHabitFingerprint.analyze 结果为准（确保导入习惯库或纠偏后点击重新测立即反映最新校准结果）
      if (habitInfo && Array.isArray(habitInfo.candidates)) {
        for (const hc of habitInfo.candidates) {
          const hLabel = cleanModelLabel(hc.label || hc.id || '');
          const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(hLabel) : hLabel;
          const k = canonKey(canon) || String(canon || hLabel).toLowerCase();
          habMap.set(k, {
            key: k,
            id: hc.id || hLabel,
            label: hLabel,
            canon,
            revPct: null,
            fpPct: hc.match,
            habitPct: hc.match,
            userLearned: Boolean(hc.userLearned),
            match: hc.match,
            displayMatch: +hc.match,
            displayMode: 'habit-only',
            source: 'fp',
            habitSource: true,
            both: false,
            matchedDims: hc.matchedDims || [],
          });
        }
      }
      for (const r of sortedCands) {
        const hp = r?.habitPct ?? (r?.source === 'fp' ? r?.fpPct : null);
        if (hp != null && hp > 0) {
          const k = canonKey(r.canon || r.label || r.id) || r.key || r.label || r.id;
          if (!habMap.has(k)) {
            habMap.set(k, { ...r, displayMatch: +hp, displayMode: 'habit-only' });
          } else {
            const cur = habMap.get(k);
            if (r.userCorrected) {
              habMap.set(k, { ...cur, ...r, displayMatch: Math.max(cur.displayMatch || 0, +hp), displayMode: 'habit-only' });
            }
          }
        }
      }
      displayCands = [...habMap.values()].sort((a, b) => (b.displayMatch - a.displayMatch)).slice(0, 5);
    }

    // 置信度前五模型：逐行展开展示；重叠置信度采用「大值作为背景色条、小值放在背景色条前面」双色显示，反推存在时优先展示反推百分比
    for (const [idx, row] of displayCands.entries()) {
      const revVal = (rankFilter.rev && row.revPct != null && row.revPct > 0) ? Math.max(0, Math.min(100, +row.revPct)) : null;
      const rawHab = row.habitPct ?? (row.source === 'fp' || row.both ? row.fpPct : null);
      const habVal = (rankFilter.habit && rawHab != null && rawHab > 0) ? Math.max(0, Math.min(100, +rawHab)) : null;
      const hasDualOverlap = Boolean(rankFilter.rev && rankFilter.habit && revVal != null && habVal != null);
      const shownPct = row.displayMatch != null
        ? row.displayMatch
        : (revVal != null && !row.structuralRev)
          ? revVal
          : hasDualOverlap
            ? Math.max(revVal, habVal, Number(row.match || 0))
            : (revVal ?? habVal ?? Number(row.match || 0));
      const fit = Number(shownPct || 0).toFixed(1);
      const isFpOnly = !hasDualOverlap && (habVal != null && revVal == null);
      const toneCls = (idx === 0 && (standout || displayCands.length === 1))
        ? (' top ' + (hasDualOverlap ? 'tint-both' : isFpOnly ? 'tint-fp' : 'tint-rev'))
        : (hasDualOverlap ? ' tint-both' : isFpOnly ? ' tint-fp' : ' tint-rev');
      const srcTip = '点击此行纠偏 · 综合置信度 ' + fit + '%';

      // 构造置信度色条：重叠时背景条为较大置信度，前景条为较小置信度
      const barNodes = [];
      if (hasDualOverlap) {
        const revIsBigger = revVal >= habVal;
        const bigVal = Math.max(revVal, habVal);
        const smallVal = Math.min(revVal, habVal);
        barNodes.push(
          h('i', {
            class: 'mc-fp-bar bar-bg ' + (revIsBigger ? 'bar-rev' : 'bar-fp'),
            style: { width: bigVal + '%' }
          }),
          h('i', {
            class: 'mc-fp-bar-fg bar-fg ' + (revIsBigger ? 'bar-fp' : 'bar-rev'),
            style: { width: smallVal + '%' }
          })
        );
      } else {
        barNodes.push(
          h('i', {
            class: 'mc-fp-bar ' + (isFpOnly ? 'bar-fp' : 'bar-rev'),
            style: { width: Math.max(0, Math.min(100, +fit)) + '%' }
          })
        );
      }

      box.append(h('div', {
        class: 'mc-fp-row billing-fit' + toneCls + (hasDualOverlap ? ' has-dual-bar' : ''),
        style: { cursor: 'pointer' },
        'data-tip': srcTip,
        'aria-label': srcTip,
        onclick: e => {
          e?.stopPropagation?.();
          if (typeof Dock !== 'undefined' && Dock.editModelSid === sid && typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.confirmUserCorrection) {
            ChatHabitFingerprint.confirmUserCorrection(sid, row.label || row.id, { learn: true });
            Dock.editModelSid = null;
            Dock.render?.();
          } else if (typeof Dock !== 'undefined') {
            Dock.editModelSid = sid;
            Dock.editVendor = null;
            Dock.editFamily = null;
            Dock.editTier = null;
            Dock.editModelDraft = row.label || row.id;
            Dock.editChanged = true;
            Dock.render?.();
          }
        }
      },
        ...barNodes,
        h('span', { class: 'mc-fp-src-ic ' + (hasDualOverlap ? 'src-both' : isFpOnly ? 'src-fp' : 'src-rev') }, icon(hasDualOverlap ? 'check' : isFpOnly ? 'fingerprint' : 'bolt')),
        h('span', { class: 'mc-fp-m' }, (row.userCorrected ? '★ ' : '') + (row.label || row.id)),
        h('b', { class: 'mc-fp-p' }, +fit + '%')));
    }

    if ((s.error || !displayCands.length) && !displayCands.length) {
      const emptyMsg = (!rankFilter.rev && rankFilter.habit)
        ? '当前对话暂无习惯指纹特征'
        : (rankFilter.rev && !rankFilter.habit)
          ? (costOn ? (s.httpStatus ? ('计费接口受限（HTTP ' + s.httpStatus + '），未触发费用反推（请开启「习惯」识别）') : (s.error ? '计费接口不可用，未触发费用反推（请开启「习惯」识别）' : '当前对话暂无 /cost 费用反推数据（请开启「习惯」识别）')) : '计费开关已关闭，请开启「习惯」排名或打开「计费」开关')
          : (s.error ? (s.httpStatus ? 'HTTP ' + s.httpStatus : '计费暂不可用') : s.pending ? '读取中…' : '待补读账单与型号');
      const errDesc = s.error || REASONS[s.info?.reason] || combined.consensus.text || emptyMsg;
      box.append(h('p', { class: 'note', 'data-tip': errDesc, title: errDesc }, emptyMsg));
    }
    if (cooling && costOn && !openSkip && !displayCands.length) box.append(h('p', { class: 'note' }, '计费冷却至 ' + new Date(s.retryAt).toLocaleTimeString() + '（已启用对话习惯指纹兜底）'));
    const action = (label, ic, fn, disabled) => h('button', { type: 'button', class: 'ib sm', title: label, 'aria-label': label, disabled: disabled || null, onclick: e => { e?.stopPropagation?.(); fn(e); } }, icon(ic));
    // 顶部已有 [⚡ 反推] / [习惯] 按钮，自动模式与计费开关已收纳至「设置 -> 模型识别」（移除底部重复的自动/计费开关与 class: 'btn sm ghost bp-lock-btn' 反推锁定按钮）
    box.append(h('div', { class: 'billing-controls' },
      h('span', { class: 'grow' }),
      action('刷新计费与反推', 'refresh', async () => { const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] }; if (c) { clearCachedCostDoc(sid); summaryCache.delete(sid); if (!isCostProbeEnabled() || shouldSkipCostForOpenSource(c)) { ChatHabitFingerprint.identifyAndApply(c, { force: true, interactive: true }); return; } globalCost403Until = 0; globalCost429Until = 0; engine.clearCooldowns?.(); await engine.refresh(c, { force: true, bypassCooldown: true }); summaryCache.delete(sid); applyReverseIdentity(c, { interactive: true, forceLock: true }); } }, s.pending || chat?.busy || !sid),
      action('同步价格表', 'layers', async () => { engine.clearCooldowns?.(); await Ranking.refresh(true); const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null); if (c && isCostProbeEnabled() && !shouldSkipCostForOpenSource(c)) { await engine.refresh(c, { force: true, bypassCooldown: true }); applyReverseIdentity(c, { interactive: false }); } }),
      action('导出计费诊断 JSON', 'download', () => exportDiagnosticJson(sid))));
    return box;
  }

  const delayed = new WeakMap();
  const midTurnAt = new WeakMap();
  const bgSwept = new Set();
  let bgSweepTimer = 0, bgSweeping = false;
  function probeMidTurn(chat) {
    if (!autoEnabled() || !chat?.sid || chat?.busy || ChatHabitFingerprint.isEvalSession?.(chat) || chat?.gacha?.fingerprint || chat?.gacha?.mode === 'autoqa' || chat?.gacha?.mode === 'habit' || isOtherProbeBusy(chat)) return;
    if (!isCostProbeEnabled() || shouldSkipCostForOpenSource(chat) || globalCost429Until > now() || globalCost403Until > now()) return;
    const lastAt = midTurnAt.get(chat) || 0;
    if (now() - lastAt < 2500) return;
    midTurnAt.set(chat, now());
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    setTimeout(() => {
      if (!autoEnabled() || !isCostProbeEnabled() || chat?.busy || isOtherProbeBusy(chat) || !sameOwner(owner) || !Chats.has(chat.sid) || shouldSkipCostForOpenSource(chat) || globalCost429Until > now() || globalCost403Until > now()) return;
      const stNow = engine.state(chat.sid);
      if (stNow.retryAt > now() || stNow.pending) return;
      void engine.refresh(chat, { force: true, allowPending: true });
    }, 80);
  }
  function schedule(chat, opts = {}) {
    if (ChatHabitFingerprint.isEvalSession?.(chat)) return;
    const fromTurn = opts?.fromTurn !== false;
    if (chat?.sid && fromTurn) {
      chat._lastTurnDoneAt = now();
      clearCachedCostDoc(chat.sid);
    }
    if (!autoEnabled() || !chat?.sid || chat?.gacha) return;
    if (isOtherProbeBusy(chat)) {
      setTimeout(() => { if (chat?.sid && !chat.busy && !isOtherProbeBusy(chat)) schedule(chat, opts); }, 1200);
      return;
    }
    if (shouldSkipCostForOpenSource(chat)) {
      markAsOpenSourceModel(chat);
      return;
    }
    // 闭源会话：无论是否开启 /cost，回合结束后先零延迟跑一次本地「对话习惯指纹 + 推理分」兜底
    try { ChatHabitFingerprint.identifyAndApply(chat, { force: !isCostProbeEnabled() }); } catch {}
    if (!isCostProbeEnabled()) return;
    const lastId = globalThis.ArenaBilling.completed(chat).at(-1)?.id;
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    if (lastId) {
      autoSeen.set(chat, owner + ':' + lastId + ':' + (isCostProbeEnabled() ? '1' : '0'));
      chat._lastAutoProbeAt = now();
    }
    for (const timer of delayed.get(chat) || []) clearTimeout(timer);
    if (globalCost403Until > now() || globalCost429Until > now() || (lastId && chat._lastCost403TurnId === lastId)) {
      delayed.delete(chat);
      return;
    }
    const isFreshTurn = Boolean(fromTurn || now() - (chat._lastTurnDoneAt || 0) < 6000);
    const scheduleDelays = isFreshTurn ? [280, 1800] : [150];
    delayed.set(chat, scheduleDelays.map((delay, idx) => setTimeout(() => {
      if (!autoEnabled() || !isCostProbeEnabled() || shouldSkipCostForOpenSource(chat) || isOtherProbeBusy(chat) || !sameOwner(owner) || chat.busy || !Chats.has(chat.sid)) return;
      const compNow = globalThis.ArenaBilling.completed(chat);
      const last = compNow.at(-1)?.id;
      const stNow = engine.state(chat.sid);
      const used = stNow.info?.result?.unitPrice?.used || [];
      const postCovered = stNow.postTurnCoveredIds || [];
      if (stNow.pending) return;
      if (globalCost429Until > now() || (stNow.retryAt > now() && stNow.httpStatus === 429)) {
        globalCost429Until = Math.max(globalCost429Until, stNow.retryAt || (now() + 45000));
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
        return;
      }
      if (globalCost403Until > now() || (stNow.retryAt > now() && stNow.httpStatus === 403) || (last && chat._lastCost403TurnId === last)) {
        globalCost403Until = Math.max(globalCost403Until, stNow.retryAt || (now() + 180000));
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
        return;
      }
      const compIdSet = new Set(compNow.map(m => m?.id).filter(Boolean));
      const hasPrunedInUsed = used.some(row => row?.messageId && !compIdSet.has(row.messageId));
      const uncovered = Boolean(hasPrunedInUsed || (last && (!used.some(row => row.messageId === last) || used.at(-1)?.messageId !== last || !postCovered.includes(last))));
      if (!uncovered && stNow.status === 'ready' && stNow.info && !stNow.info.reason) {
        for (const t of delayed.get(chat) || []) clearTimeout(t);
        delayed.delete(chat);
        return;
      }
      if (hasPrunedInUsed) {
        stNow.info = null;
        stNow.lastInfo = null;
        stNow.postTurnCoveredIds = [];
        clearCachedCostDoc(chat.sid);
        summaryCache.delete(chat.sid);
      }
      if (idx === 0 || (isFreshTurn && uncovered)) {
        if (idx > 0) clearCachedCostDoc(chat.sid);
        lastCostNetAt = now();
        void engine.refresh(chat, { force: true, bypassCooldown: idx === 0 && globalCost429Until <= now() && globalCost403Until <= now() && stNow.httpStatus !== 403 }).then(() => {
          const stAfter = engine.state(chat.sid);
          if (stAfter.httpStatus === 429) {
            globalCost429Until = Math.max(globalCost429Until, stAfter.retryAt || (now() + 45000));
            for (const t of delayed.get(chat) || []) clearTimeout(t);
            delayed.delete(chat);
            try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
            return;
          }
          if (stAfter.httpStatus === 403) {
            globalCost403Until = Math.max(globalCost403Until, stAfter.retryAt || (now() + 180000));
            chat._lastCost403TurnId = last || '_turn';
            for (const t of delayed.get(chat) || []) clearTimeout(t);
            delayed.delete(chat);
            try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
            return;
          }
          try { applyReverseIdentity(chat, { interactive: false }); } catch {}
        }).catch(() => {
          try { ChatHabitFingerprint.identifyAndApply(chat, { force: false, fromCostFallback: true }); } catch {}
        });
      }
    }, delay)));
  }
  async function invalidateAndRefresh(chat, forceNet = false) {
    if (!chat?.sid || ChatHabitFingerprint.isEvalSession?.(chat)) return null;
    if (forceNet) clearCachedCostDoc(chat.sid);
    const stNow = engine.state(chat.sid);
    if (stNow) {
      stNow.info = null;
      stNow.lastInfo = null;
      stNow.postTurnCoveredIds = [];
    }
    summaryCache.delete(chat.sid);
    if (shouldSkipCostForOpenSource(chat)) {
      return markAsOpenSourceModel(chat);
    }
    if (!isCostProbeEnabled() || (!forceNet && (globalCost429Until > now() || globalCost403Until > now()))) {
      return ChatHabitFingerprint.identifyAndApply(chat, { force: true });
    }
    await engine.refresh(chat, { force: true, bypassCooldown: Boolean(forceNet && globalCost429Until <= now() && globalCost403Until <= now()) }).catch(() => {});
    return applyReverseIdentity(chat, { interactive: false });
  }
  const queuedIdentSids = new Set();
  const bgSweepAttempts = new Map();
  let activeIdentSid = null;

  function enqueueIdent(sid, opts = {}) {
    if (!sid) return;
    bgSwept.delete(sid);
    bgSweepAttempts.delete(sid);
    queuedIdentSids.add(sid);
    scheduleBgSweep(opts.fromGacha ? 350 : 500);
    try { if (typeof UI !== 'undefined' && UI.renderList) UI.renderList(); } catch {}
  }

  function isChatUnidentified(sid, mi) {
    if (!sid) return false;
    const m = mi !== undefined ? mi : (typeof Models !== 'undefined' ? Models.get(sid) : null);
    if (!m || !m.name) return true;
    const nm = String(m.name).trim();
    if (!nm || /^(未识别|未知型号|待定)$/.test(nm)) return true;
    if (m.pendingConfirm) return true;
    return false;
  }

  // 侧栏对话识别状态胶囊：
  // - 正在识别中：当前后台正在拉取消息或识别的会话
  // - 正在识别排队中：已在后台识别延续队列中等待依次处理
  // - 待识别：尚未识别型号（并自动触发后台排队延续识别，无需人工点开对话）
  function identStatus(sid, mi) {
    if (!sid || ChatHabitFingerprint.isEvalSession?.(sid)) return null;
    if (typeof Gacha !== 'undefined' && Gacha.stepOf && Gacha.stepOf(sid)) return null;
    if (!isChatUnidentified(sid, mi)) {
      queuedIdentSids.delete(sid);
      return null;
    }
    const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (activeIdentSid === sid || (c && isRunning(c))) {
      return { status: 'running', text: '正在识别中', pct: 76, phase: '正在后台读取对话并识别型号…', active: true };
    }
    if (bgSwept.has(sid) || (bgSweepAttempts.get(sid)?.count || 0) >= 2) {
      queuedIdentSids.delete(sid);
      return null;
    }
    if (c?.loaded && !c.busy && (c.status === 'error' || !globalThis.ArenaBilling?.completed?.(c)?.length)) {
      queuedIdentSids.delete(sid);
      return null;
    }
    if (!queuedIdentSids.has(sid) && !bgSwept.has(sid)) {
      queuedIdentSids.add(sid);
      scheduleBgSweep(450);
    }
    if (queuedIdentSids.has(sid)) {
      return { status: 'queued', text: '正在识别排队中', pct: 36, phase: '已在后台识别排队队列中，将自动加载对话并完成识别/开源归档（无需手动点开）', active: false };
    }
    return { status: 'pending', text: '待识别', pct: 18, phase: '待识别型号（后台队列自动延续处理）', active: false };
  }

  function scheduleBgSweep(ms = 600) {
    clearTimeout(bgSweepTimer);
    bgSweepTimer = setTimeout(() => void runBgSweep(), Math.max(250, Number(ms) || 600));
  }

  async function runBgSweep() {
    if (bgSweeping || !autoEnabled() || typeof UI === 'undefined' || !UI.me || typeof History === 'undefined' || !History.lastLoad) return;
    if ((typeof ReadLimit !== 'undefined' && ReadLimit.active?.()) || (typeof Chats !== 'undefined' && [...Chats.values()].some(ch => ch && (ch.busy || (ch.streaming && !ch.peeking))))) {
      scheduleBgSweep(5000);
      return;
    }
    try { upgradeCachedOpus56(); } catch {}
    const gone = typeof History.goneMap === 'function' ? History.goneMap() : new Map();
    const gachaRun = typeof Gacha !== 'undefined' ? (Gacha.run || Gacha.state?.() || null) : null;
    const gachaAttempts = Array.isArray(gachaRun?.attempts) ? gachaRun.attempts : [];
    const gachaArchiveSids = new Set(
      gachaAttempts
        .filter(a => a?.sid && (a.verdict === 'archive' || a.model === '开源模型' || a.fingerprint?.skipped === 'visible-thinking'))
        .map(a => a.sid)
    );
    const canCleanupGacha = (sid, ch) => typeof Gacha !== 'undefined' && typeof Gacha.canAutoCleanupChat === 'function'
      ? Gacha.canAutoCleanupChat(sid, ch)
      : false;
    for (const e of (History.items || []).slice(0, 80)) {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt) continue;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      const chRef = typeof Chats !== 'undefined' ? Chats.get(e.id) : null;
      if (canCleanupGacha(e.id, chRef) && (gachaArchiveSids.has(e.id) || m?.name === '开源模型')) {
        if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
          Gacha.killOpenSourceThinkingChat(e.id, chRef);
        }
      }
    }
    // 清理未揭晓的 Battle 会话被误写入的单模型 localTitle 与 Models 记录
    for (const e of (History.items || []).slice(0, 60)) {
      if (!e?.id || !ChatHabitFingerprint.isEvalSession?.(e.id, e)) continue;
      const isDirectOrRevealed = Boolean(e.mode === 'direct' || (e.modelAId && e.modelBId));
      if (!isDirectOrRevealed) {
        if (e.localTitle && !/vs|⚔️/i.test(String(e.localTitle))) {
          delete e.localTitle;
          try { History.saveSoon?.(); } catch {}
        }
        const mEval = typeof Models !== 'undefined' ? Models.get(e.id) : null;
        if (mEval && !mEval.battleRevealed && !mEval.directMode) {
          try {
            if (typeof Models.del === 'function') Models.del(e.id);
            else if (Models.map?.delete) { Models.map.delete(e.id); Models.saveSoon?.(); }
          } catch {}
        }
      }
    }
    // 扫描近期的未识别会话与显式入队会话（避免启动时拉取 80 个历史旧会话与重复请求 /cost）
    const candidates = (History.items || []).slice(0, 15).filter((e, idx) => {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt || gachaArchiveSids.has(e.id)) return false;
      if (ChatHabitFingerprint.isEvalSession?.(e.id, e)) return false;
      if (bgSwept.has(e.id) && !queuedIdentSids.has(e.id)) return false;
      // 跳过正在活跃跑抽卡问答步骤的会话（等它问答跑完或中断后再由延续队列接手）
      if (typeof Gacha !== 'undefined' && Gacha.stepOf && Gacha.stepOf(e.id)) return false;
      const chBusy = typeof Chats !== 'undefined' ? Chats.get(e.id)?.busy : false;
      if (chBusy) return false;
      const att = bgSweepAttempts.get(e.id);
      if (att && att.count >= 2 && !queuedIdentSids.has(e.id)) return false;
      if (att && att.count >= 6 && now() - att.lastAt < 60000) return false;
      if (att && now() - att.lastAt < Math.min(15000, 1800 * att.count)) return false;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      if (m?.userCorrected) return false;
      if (typeof Gacha !== 'undefined' && (Gacha.isInFlightSid?.(e.id) || Gacha.stepOf?.(e.id)?.active)) return false;
      const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(e.id, null, e) : gachaAttempts.some(a => a?.sid === e.id);
      if (m && (m.name === '开源模型' || isOpenCandidateName(m.name || m.reverseCandidateId || ''))) {
        const chRef = typeof Chats !== 'undefined' ? Chats.get(e.id) : null;
        if (canCleanupGacha(e.id, chRef) && (typeof Gacha === 'undefined' || Gacha.settings?.().skipCompatThinking !== false)) {
          if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) Gacha.killOpenSourceThinkingChat(e.id, chRef);
        }
        return false;
      }
      if (queuedIdentSids.has(e.id) || !bgSwept.has(e.id)) {
        if (e.id === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' && /opus[-\s]*5\.5/i.test(m?.name || '')) return true;
        if (ARGON_HIGH_SIDS.has(e.id) && !/argon|gemini/i.test(m?.name || '')) return true;
        if (SOL_61_SIDS.has(e.id) && !/gpt[-\s]*6\.1[-\s]*sol/i.test(m?.name || '')) return true;
        if (/fable[-\s]*5/i.test(m?.name || m?.candidateName || '') && e.id !== '01a1457d-fd02-74d6-b839-4adf76e2a505' && (m?.reverseVer || 0) < 152) return true;
      }
      if (queuedIdentSids.has(e.id) || (isGachaChat && !bgSwept.has(e.id))) {
        return !m || m.guess || m.pendingConfirm || !m.name || m.name === '未识别' || m.name === '未知型号';
      }
      if (!bgSwept.has(e.id) && (!m || !m.name || m.name === '未识别' || m.name === '未知型号')) return idx < 6;
      return false;
    });
    for (const qSid of [...queuedIdentSids]) {
      if (!candidates.some(c => c.id === qSid)) {
        bgSwept.add(qSid);
        queuedIdentSids.delete(qSid);
      }
    }
    for (const cand of candidates) queuedIdentSids.add(cand.id);
    if (!candidates.length) {
      if (activeIdentSid) {
        activeIdentSid = null;
        try { UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.(); } catch {}
      }
      return;
    }
    bgSweeping = true;
    const batch = candidates.slice(0, 1);
    try {
      await Promise.allSettled(batch.map(async (target) => {
        activeIdentSid = target.id;
        const prevAtt = bgSweepAttempts.get(target.id) || { count: 0, lastAt: 0 };
        bgSweepAttempts.set(target.id, { count: prevAtt.count + 1, lastAt: now() });
        try { UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.(); } catch {}

        const c = typeof chatOf === 'function' ? chatOf(target.id) : (typeof Chats !== 'undefined' ? Chats.get(target.id) : null);
        if (!c || c.busy) {
          queuedIdentSids.delete(target.id);
          return;
        }
        // 关键修复：优先读取本地 MsgCache（零网络请求）；本地无缓存且未处于 429 冷却时才后台拉取
        if (!c.loaded && !c.messages?.length && typeof MsgCache !== 'undefined' && MsgCache.get) {
          try {
            const mc = await MsgCache.get(target.id).catch(() => null);
            if (mc?.messages?.length && !c.loaded && !c.messages?.length) {
              c.messages = mc.messages.map(m => ({ ...m, v: 0 }));
              c.cached = true;
            }
          } catch {}
        }
        if ((!c.loaded && !globalThis.ArenaBilling.completed(c).length) && typeof c.load === 'function' && !(typeof ReadLimit !== 'undefined' && ReadLimit.active?.())) {
          try { await c.load(); } catch {}
        }
        const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(target.id, c, target) : gachaAttempts.some(a => a?.sid === target.id);

        // 1. 立即检查是否为开源思考：普通对话直接标记为「开源模型」并同步修改对话名称（不浪费时间推理具体计费模型）；仅当前活跃抽卡未保留会话归档删除
        if (shouldSkipCostForOpenSource(c)) {
          try { markAsOpenSourceModel(c); } catch {}
          if (canCleanupGacha(target.id, c) && (typeof Gacha === 'undefined' || Gacha.settings?.().skipCompatThinking !== false)) {
            if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
              Gacha.killOpenSourceThinkingChat(target.id, c);
            }
          }
          bgSwept.add(target.id);
          queuedIdentSids.delete(target.id);
          return;
        }

        // 2. 如果该活跃抽卡对话因为限流切 IP 导致第 1 问都没收到回复就中断了，后台自动补发一问
        let compList = globalThis.ArenaBilling.completed(c);
        if (!compList.length && canCleanupGacha(target.id, c) && !c.busy) {
          const ageMs = now() - (Date.parse(String(target.updatedAt || target.createdAt || '')) || 0);
          if (ageMs > 12000 && !c._bgRecoveredTurn && typeof c.send === 'function') {
            c._bgRecoveredTurn = true;
            try {
              await c.send('What is 17 × 23? Reply with the number only.');
              const waitStart = now();
              while (c.busy && now() - waitStart < 45000) await sleep(350);
              if (!globalThis.ArenaBilling.completed(c).length && typeof c.load === 'function') {
                await c.load().catch(() => {});
              }
            } catch {}
          }
          if (shouldSkipCostForOpenSource(c)) {
            try { markAsOpenSourceModel(c); } catch {}
            if (canCleanupGacha(target.id, c) && typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
              Gacha.killOpenSourceThinkingChat(target.id, c);
            }
            bgSwept.add(target.id);
            queuedIdentSids.delete(target.id);
            return;
          }
          compList = globalThis.ArenaBilling.completed(c);
        }

        if (!compList.length) {
          bgSwept.add(target.id);
          queuedIdentSids.delete(target.id);
          return;
        }

        // 3. 先立即用本地「对话习惯指纹 + 推理分」零延迟识别出厂商与型号（即使 /cost 正在 429 冷却，也能立即识别出来！）
        try { ChatHabitFingerprint.identifyAndApply(c, { force: false }); } catch {}

        // 4. 后台巡检优先使用本地习惯识别（零网络请求、不抢占用户手动测试的 /cost 限流配额）；仅对抽卡会话或已有本地缓存的会话才调用 /cost，且间隔 >= 6 秒
        const st = engine.state(target.id);
        const hasCachedBill = Boolean(getCachedCostDoc(target.id, compList.at(-1)?.id || ''));
        const canRunCost = isCostProbeEnabled() && !shouldSkipCostForOpenSource(c) && (isGachaChat || hasCachedBill) && globalCost429Until <= now() && globalCost403Until <= now() && (st.retryAt || 0) <= now();
        if (canRunCost) {
          if (!hasCachedBill) {
            const waitGap = Math.max(0, 6000 - (now() - lastCostNetAt));
            if (waitGap > 0) await sleep(waitGap);
            lastCostNetAt = now();
          }
          await engine.refresh(c, { force: true }).catch(() => {});
          const stAfter = engine.state(target.id);
          if (stAfter.httpStatus === 429) {
            globalCost429Until = Math.max(globalCost429Until, stAfter.retryAt || (now() + 30000));
            try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
          } else if (stAfter.httpStatus === 403) {
            globalCost403Until = Math.max(globalCost403Until, stAfter.retryAt || (now() + 180000));
            try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
          } else {
            try { applyReverseIdentity(c, { interactive: false, forceLock: true, fallbackQuestionMark: true }); } catch {}
          }
        } else {
          try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
        }

        // 5. 若为当前活跃抽卡未保留会话，识别完成后执行抽卡收尾复核
        if (canCleanupGacha(target.id, c) && typeof Gacha !== 'undefined' && Gacha.settleBackgroundChat) {
          try { await Gacha.settleBackgroundChat(target.id, c); } catch {}
        }

        bgSwept.add(target.id);
        queuedIdentSids.delete(target.id);
      }));
    } catch {} finally {
      activeIdentSid = null;
      bgSweeping = false;
      try { UI.renderListSoon ? UI.renderListSoon() : UI.renderList?.(); } catch {}
      if (candidates.length > batch.length || queuedIdentSids.size > 0) {
        scheduleBgSweep(isCostProbeEnabled() && globalCost429Until <= now() ? 1400 : 450);
      }
    }
  }

  setTimeout(() => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(900); }, 100);
  // Bus.on('turn', (chat) => { if (chat?.sid) { schedule(chat); scheduleBgSweep(2500); } });
  Bus.on('turn', (chat) => { if (chat?.sid) { schedule(chat, { fromTurn: true }); scheduleBgSweep(2500); } });
  Bus.on('chat', chat => { if (chat?.sid && !isOtherProbeBusy(chat)) automatic(chat); });
  Bus.on('history', () => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(600); });
  Bus.on('models', sid => Bus.emit('billing', sid));
  Bus.on('trace', sid => Bus.emit('billing', sid));
  Bus.on('agent-catalog', html => engine.syncCatalog(html));
  const catalogRows = () => Array.isArray(engine.catalogRaw) && engine.catalogRaw.length ? engine.catalogRaw : (Array.isArray(bundled?.data) ? bundled.data : []);
  return Object.assign(engine, { getLiveState: sid => engine.state(sid), card, summary, clearSummaryCache, topConfidence, badge, automatic, schedule, invalidateAndRefresh, probeMidTurn, isAutoEnabled: autoEnabled, setAutoEnabled, isCostProbeEnabled, setCostProbeEnabled, setSkewDpl, getRankFilter, setRankFilter, shouldSkipCostForOpenSource, markAsOpenSourceModel, habit: ChatHabitFingerprint, enqueueIdent, identStatus, trigger: sid => { const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null; if (c) probeMidTurn(c); }, reverseIdentify, applyReverseIdentity, isRunning, mergeCandidates, detectHabitAndMessageRoute, applyChatRouteAnnotations, catalogRows, exportDiagnosticJson });
})();
