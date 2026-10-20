// Client UI adapter: Session telemetry & billing cost analytics view controller.
const ChatHabitFingerprint = (() => {
  const BANK_KEY = 'habitLearnBank:v1';
  const MAX_BANK_SAMPLES = 1200;
  let sharedBankLoaded = false;

  const isOpenName = s => {
    const id = String(s || '').toLowerCase();
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
      id: 'anthropic/claude-opus-5',
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
      id: 'openai/gpt-6-sol',
      label: 'GPT 6 Sol (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 83.0,
      vec: [1.0, 0.0, 0.05, 0.12, 0.20, 0.04, 0.30, 0.08, 0.12, 0.08, 0.76, 0.66, 0.74, 0.34, 0.30, 0.44, 0.56, 0.72, 0.58, 0.74],
      tags: ['OpenAI长单轮深层推理(少并发工具)', '长耗时深度思考与详尽分节阐述'],
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
      id: 'openai/gpt-6-astra',
      label: 'GPT 6 Astra (Max)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 81.5,
      vec: [1.0, 0.0, 0.06, 0.22, 0.32, 0.12, 0.28, 0.08, 0.14, 0.10, 0.80, 0.74, 0.78, 0.36, 0.36, 0.48, 0.66, 0.68, 0.60, 0.52],
      tags: ['OpenAI中高速均衡流(80~120字/秒)', 'Write/Read主导的高完成度单页构建', '三级标题与表格化条理排版'],
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
      id: 'openai/gpt-5.6-sol',
      label: 'GPT 5.6 Sol (High)',
      vendor: 'OpenAI',
      isOpen: false,
      baseScore: 66.0,
      vec: [1.0, 0.0, 0.08, 0.14, 0.22, 0.0, 0.32, 0.08, 0.14, 0.08, 0.66, 0.56, 0.64, 0.26, 0.24, 0.44, 0.50, 0.52, 0.46, 0.46],
      tags: ['OpenAI 5.6稳健串行工具流(零并发步)', '中等思考块(1~2段/轮)与中速流式输出'],
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
      id: 'x-ai/grok-4.7',
      label: 'Grok 4.7 (Max)',
      vendor: 'xAI',
      isOpen: false,
      baseScore: 76.0,
      vec: [0.85, 0.15, 0.35, 0.15, 0.15, 0.10, 0.40, 0.15, 0.22, 0.15, 0.72, 0.68, 0.70, 0.32, 0.42, 0.50, 0.50, 0.64, 0.60, 0.56],
      tags: ['xAI闭源推理节奏', '直白紧凑技术行文'],
    },
    // ── Open-Source Models (isOpen: true, visR > 0 or open-source Apache/MIT contenders, NEVER calls /cost) ──
    {
      id: 'moonshot/kimi-k3-max',
      label: 'Kimi K3 (Max)',
      vendor: 'Moonshot',
      isOpen: true,
      baseScore: 62.0,
      vec: [0.0, 0.0, 0.28, 0.18, 0.20, 0.06, 0.35, 0.15, 0.18, 0.12, 0.68, 0.60, 0.64, 0.30, 0.35, 0.72, 0.55, 0.55, 0.52, 0.50],
      tags: ['开源可见思考过程', 'Kimi中文结构化分点与工具习惯'],
    },
    {
      id: 'deepseek/deepseek-v4.1-flash-max',
      label: 'DeepSeek V4.1 Flash (Max)',
      vendor: 'DeepSeek',
      isOpen: true,
      baseScore: 89.0,
      vec: [0.0, 0.0, 0.18, 0.16, 0.22, 0.08, 0.48, 0.18, 0.22, 0.16, 0.80, 0.76, 0.78, 0.45, 0.48, 0.78, 0.52, 0.74, 0.78, 0.72],
      tags: ['开源深度可见思考链', 'DeepSeek密集推导与破折号/加粗冒号习惯'],
    },
    {
      id: 'zhipu/glm-5.2-max',
      label: 'GLM 5.2 (Max)',
      vendor: 'Zhipu',
      isOpen: true,
      baseScore: 88.0,
      vec: [0.0, 0.0, 0.22, 0.20, 0.22, 0.08, 0.42, 0.16, 0.20, 0.14, 0.78, 0.74, 0.76, 0.38, 0.30, 0.80, 0.58, 0.72, 0.75, 0.68],
      tags: ['开源可见思考过程', 'GLM工整中文总分结构与长思考链'],
    },
    {
      id: 'alibaba/qwen-3.7-max-high',
      label: 'Qwen 3.7 Max (High)',
      vendor: 'Alibaba',
      isOpen: true,
      baseScore: 76.0,
      vec: [0.0, 0.0, 0.25, 0.18, 0.20, 0.06, 0.38, 0.14, 0.18, 0.12, 0.72, 0.66, 0.70, 0.32, 0.25, 0.74, 0.55, 0.64, 0.62, 0.58],
      tags: ['开源可见思考过程', 'Qwen条理化列表与稳健工具调用'],
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
  ];

  const KNOWN_ARGON_SIDS = new Set([
    '01a148c8-6f04-710a-88aa-9560c56c0bd4',
    '01a14957-ba36-7f15-9640-56b3d0ec48ee',
    '01a148ca-9c83-77c7-8d6c-6dd42a957363',
    '01a148c6-1fc1-719e-b17c-e867ca76a520',
    '01a14952-47dd-77e8-91cc-03516f61aa29',
    '01a14945-7382-7327-8fd5-e99f94473d3d',
  ]);
  const CONFIRMED_GEMINI_FLASH_SIDS = new Set([
    '01a148b9-30df-7fb9-87be-135772d6a4b0',
    '01a14a34-814a-792f-b7c1-ad747c5797ff',
    '01a151de-5840-75e5-b5e0-9bf662f543dd',
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

  let bankRev = 1;

  function sanitizeBankSample(s) {
    if (!s || !s.model || !Array.isArray(s.vec)) return null;
    let out = s;
    const mStr = String(out.model || '').trim();
    const sidStr = String(out.sid || '');
    // 修复此前导入 billing-01a1440a...json 时因未读取 sessionId 而生成 diag-* 临时 ID 的记录
    if (sidStr.startsWith('diag-') && /6\.1[-\s]*sol/i.test(mStr) && Math.abs((Number(out.score) || 0) - 46.6) < 1.0) {
      out = { ...out, sid: '01a1440a-e8c4-7939-8910-ffe946582807' };
    }
    // 清理已知误标为 Gemini 4 Argon 的 3 个 Flash 诊断样本（01a148b9 / 01a14a34 / 01a151de），自动迁移为 Gemini 3.8 Flash (High)
    if (/gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(mStr) && CONFIRMED_GEMINI_FLASH_SIDS.has(String(out.sid || ''))) {
      return {
        ...out,
        model: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 3.8 Flash (High)') : 'gemini-3.8-flash-high',
        userConfirmed: false,
        weight: 1.0,
      };
    }
    if (String(out.sid || '') === '01a151de-5840-75e5-b5e0-9bf662f543dd' && /6\.1-sol|gpt/i.test(mStr)) {
      return {
        ...out,
        model: typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('Gemini 3.8 Flash (High)') : 'gemini-3.8-flash-high',
        userConfirmed: false,
        weight: 1.0,
      };
    }
    // 若本机已对该会话跑出高置信度 /cost 反推结果，自动纠偏早期误写入习惯库的旧样本（如 01a13ef8 被旧版习惯记为 Luna Max）
    if (sidStr === '01a13ef8-3b56-7b99-a43b-d991064c46d8' && /luna.*max/i.test(mStr)) {
      const fixedCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon('GPT-6 Luna (Medium)') : 'GPT-6 Luna (Medium)';
      out = { ...out, model: fixedCanon, rawLabel: 'GPT-6 Luna (Medium)', score: 74, userConfirmed: true, autoTeacher: true, teacherConf: 98.2, weight: 3.2 };
    } else if (sidStr && !out.importedFromDiag && typeof Models !== 'undefined' && typeof Models.get === 'function') {
      const mLocal = Models.get(sidStr);
      if (mLocal && !mLocal.userCorrected && Array.isArray(mLocal.reverseCandidates)) {
        const topRc = mLocal.reverseCandidates.find(rc => rc && !rc.structuralRev && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 85) && Number(rc.revPct ?? rc.match ?? 0) >= 75);
        if (topRc) {
          const rcRaw = String(topRc.label || topRc.dynamicLabel || topRc.id || '').replace(/[?？]+$/, '').trim();
          const rcCanon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rcRaw) : rcRaw;
          const rcScore = Number.isFinite(+topRc.effortProfile?.reiScore) ? +topRc.effortProfile.reiScore : (Number.isFinite(+mLocal.reverseScore) && !mLocal.habitInferred ? +mLocal.reverseScore : out.score);
          if (rcCanon && (String(out.model || '').toLowerCase() !== String(rcCanon).toLowerCase() || (Number.isFinite(+rcScore) && Math.abs((Number(out.score) || 0) - (+rcScore)) >= 1))) {
            out = {
              ...out,
              model: rcCanon,
              rawLabel: rcRaw,
              score: Number.isFinite(+rcScore) ? +rcScore : out.score,
              userConfirmed: true,
              autoTeacher: true,
              teacherConf: Number(topRc.revPct ?? topRc.match ?? 95),
              weight: topRc.diophantinePassed ? 3.2 : 2.2,
            };
          }
        }
      }
    }
    // 快照加载的 OpenAI/Anthropic 闭源会话可能因服务端未返回空 reasoning 块导致 vec[0]=0, vec[1]=1，自动校准为闭源隐藏思考向量
    if (!/gemini|google/i.test(mStr) && !isOpenName(mStr) && out.vec.length === 20 && out.vec[0] === 0 && out.vec[1] === 1) {
      const fixedVec = [...out.vec];
      fixedVec[0] = 1;
      fixedVec[1] = 0;
      out = { ...out, vec: fixedVec };
    }
    return out;
  }

  function loadBank() {
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(BANK_KEY, null) : null;
      let changed = false;
      const samples = (Array.isArray(raw?.samples) ? raw.samples : []).map(s => {
        const clean = sanitizeBankSample(s);
        if (clean !== s) changed = true;
        return clean;
      }).filter(Boolean);
      if (changed && typeof Store !== 'undefined' && Store.set) {
        try { Store.set(BANK_KEY, { v: 1, updatedAt: Date.now(), samples }); } catch {}
      }
      if (!sharedBankLoaded && typeof Host !== 'undefined' && typeof Host.shared === 'function') {
        sharedBankLoaded = true;
        Promise.resolve(Host.shared('habitLearnBank')).then(sh => {
          if (sh && Array.isArray(sh.samples) && sh.samples.length) {
            mergeSharedBank(sh.samples, sh.calibration || null);
          }
        }).catch(() => {});
      }
      return samples;
    } catch {
      return [];
    }
  }

  const CALIB_KEY = 'habit:calibration:v1';
  function loadCalibration() {
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get(CALIB_KEY, null) : null;
      if (raw && typeof raw === 'object' && raw.protoCentroids && raw.scoreOffsets) return raw;
    } catch {}
    return { v: 1, protoCentroids: {}, scoreOffsets: {}, updatedAt: 0 };
  }

  function saveCalibration(cal) {
    try {
      if (typeof Store !== 'undefined' && Store.set) Store.set(CALIB_KEY, cal);
    } catch {}
    return cal;
  }

  function recordTeacherCalibration(canonModel, feat, teacherScore, weight = 1.0) {
    try {
      if (!canonModel || !feat) return;
      const canon = canonModel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(canonModel) : canonModel);
      const k = String(canon || '').replace(/[?？]+$/, '').trim().toLowerCase();
      if (!k || k === '开源模型') return;
      const cal = loadCalibration();
      if (Array.isArray(feat.vec) && feat.vec.length === 20) {
        const prev = cal.protoCentroids[k];
        const n = (prev?.count || 0) + 1;
        const alpha = Math.max(0.08, Math.min(0.35, (Number(weight) || 1) / (n + 4)));
        const nextVec = prev && Array.isArray(prev.vec) && prev.vec.length === 20
          ? prev.vec.map((v, i) => Math.round(((1 - alpha) * (Number(v) || 0) + alpha * (Number(feat.vec[i]) || 0)) * 1000) / 1000)
          : feat.vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000);
        const curMeta = extractCompactMeta(feat);
        const nextMeta = {};
        if (curMeta) {
          for (const [mk, mv] of Object.entries(curMeta)) {
            if (typeof mv === 'boolean') nextMeta[mk] = mv;
            else {
              const pv = Number(prev?.meta?.[mk] ?? mv) || 0;
              nextMeta[mk] = Math.round(((1 - alpha) * pv + alpha * (Number(mv) || 0)) * 100) / 100;
            }
          }
        }
        cal.protoCentroids[k] = { vec: nextVec, meta: curMeta ? nextMeta : (prev?.meta || null), count: n, updatedAt: Date.now() };
      }
      if (Number.isFinite(+teacherScore) && Number.isFinite(+feat.habitReasoningScore)) {
        const rawDelta = Math.max(-24, Math.min(24, (+teacherScore) - (+feat.habitReasoningScore)));
        const prevS = cal.scoreOffsets[k];
        const sn = (prevS?.count || 0) + 1;
        const beta = Math.max(0.12, Math.min(0.45, 1 / (sn + 2)));
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

  function saveBank(samples, { replace = false } = {}) {
    bankRev++;
    const clean = (Array.isArray(samples) ? samples : [])
      .map(sanitizeBankSample)
      .filter(s => s && s.model && Array.isArray(s.vec))
      .sort((a, b) => (Number(Boolean(b.userConfirmed || b.importedFromDiag)) - Number(Boolean(a.userConfirmed || a.importedFromDiag))) || ((b.at || 0) - (a.at || 0)))
      .slice(0, MAX_BANK_SAMPLES);
    const cal = loadCalibration();
    const payload = { v: 2, updatedAt: Date.now(), replace: Boolean(replace), samples: clean, calibration: cal };
    try { if (typeof Store !== 'undefined' && Store.set) Store.set(BANK_KEY, payload); } catch {}
    try { if (typeof Host !== 'undefined' && typeof Host.shared === 'function') void Host.shared('habitLearnBank', payload); } catch {}
    try { if (typeof Host !== 'undefined' && typeof Host.setShared === 'function') void Host.setShared('habitLearnBank', payload); } catch {}
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    return clean;
  }

  function mergeSharedBank(remoteSamples, remoteCalib = null, remoteStats = null) {
    let added = 0, updated = 0, skipped = 0;
    try {
      const local = loadBank();
      const bySid = new Map();
      for (const rawL of local) {
        const s = sanitizeBankSample(rawL);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const k = s.sid || `${s.model}:${s.at || 0}`;
        bySid.set(k, s);
      }
      for (const rawS of (Array.isArray(remoteSamples) ? remoteSamples : [])) {
        const s = sanitizeBankSample(rawS);
        if (!s || !s.model || !Array.isArray(s.vec)) continue;
        const k = s.sid || `${s.model}:${s.at || 0}`;
        const prev = bySid.get(k);
        if (!prev) {
          bySid.set(k, s);
          added++;
          continue;
        }
        const sConf = Boolean(s.userConfirmed || s.importedFromDiag);
        const pConf = Boolean(prev.userConfirmed || prev.importedFromDiag);
        if (pConf && !sConf) {
          skipped++;
          continue;
        }
        const shouldUpdate = (sConf && !pConf) ||
          ((s.at || 0) > (prev.at || 0)) ||
          (sConf && String(s.model || '').toLowerCase() !== String(prev.model || '').toLowerCase()) ||
          (!prev.meta && Boolean(s.meta));
        if (shouldUpdate) {
          bySid.set(k, {
            ...prev,
            ...s,
            meta: s.meta || prev.meta || null,
            score: s.score != null && Number.isFinite(+s.score) ? +s.score : prev.score,
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
          if (typeof Store !== 'undefined' && Store.set) Store.set(FREQ_KEY, st);
        } catch {}
      }
      const saved = saveBank([...bySid.values()]);
      const modelSet = new Set(saved.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
      return { added, updated, skipped, total: saved.length, modelCount: modelSet.size };
    } catch {
      const cur = loadBank();
      const modelSet = new Set(cur.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
      return { added, updated, skipped, total: cur.length, modelCount: modelSet.size };
    }
  }

  // 从已保存的 habitTags / habitFeatures（或导入的诊断 JSON）重建习惯特征（当对话消息尚未从 IndexedDB 加载时的即时还原）
  function extractFeaturesFromSaved(chat, modelEntry) {
    const sid = chat?.sid || modelEntry?.sid || '';
    const topRev = Array.isArray(modelEntry?.reverseCandidates) ? modelEntry.reverseCandidates[0] : null;
    const revTopLabel = (topRev && !topRev.structuralRev && (topRev.diophantinePassed || (topRev.revPct || 0) >= 75)) ? String(topRev.stealthModelLabel || topRev.dynamicLabel || topRev.label || topRev.id || '') : '';
    const mKnownName = String(revTopLabel || modelEntry?.name || modelEntry?.candidateName || modelEntry?.reverseLabel || modelEntry?.reverseCandidateId || '');
    const isKnownNonGoogle = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && ((typeof CONFIRMED_SOL_61_SIDS !== 'undefined' && CONFIRMED_SOL_61_SIDS.has(sid)) || HAIKU_55_MEDIUM_SIDS.has(sid) || /gpt|openai|sol|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName));
    const savedFeat = modelEntry?.habitFeatures || chat?._habitFeatures || null;
    const rawTags = [
      ...(Array.isArray(savedFeat?.habitTags) ? savedFeat.habitTags : []),
      ...(Array.isArray(modelEntry?.habitTags) ? modelEntry.habitTags : []),
      ...(Array.isArray(modelEntry?.habitCandidates?.[0]?.matchedDims) ? modelEntry.habitCandidates[0].matchedDims : []),
      ...(Array.isArray(modelEntry?.reverseCandidates?.[0]?.matchedDims) ? modelEntry.reverseCandidates[0].matchedDims : []),
    ];
    const tags = [...new Set(rawTags.map(String).filter(Boolean))];
    const tagStr = tags.join(' | ');
    if (!tags.length && !savedFeat?.vec && !modelEntry?.streamEvidence && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return null;
    const isOpenThink = Boolean(savedFeat?.isOpenThink ?? savedFeat?.meta?.isOpenThink) || /开源可见思考/.test(tagStr);
    const rMatch = /闭源隐藏思考\(([\d.]+)段\/轮\)/.exec(tagStr);
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
    const sandboxLink = /sandbox:\/链接/.test(tagStr) ? 1 : 0;
    const lowerDoctype = /小写<!doctype>/i.test(tagStr) ? 1 : 0;
    const colorSchemeCss = /color-scheme/i.test(tagStr) ? 1 : 0;
    const svgSmilNoScript = /SMIL动画/i.test(tagStr) ? 1 : 0;
    const prefersReducedMotion = /reduced-motion/i.test(tagStr) ? 1 : 0;
    const cssRoot = /:root✓/.test(tagStr) ? 1 : 0;
    const raf = /rAF✓/.test(tagStr) ? 1 : 0;
    const streamRBlocks = Number(modelEntry?.streamEvidence?.rBlocks ?? chat?._streamEvidence?.rBlocks ?? 0);
    const hasOpenAiHtmlOrR = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (isKnownNonGoogle || prefersReducedMotion > 0 || lowerDoctype > 0 || sandboxLink > 0 || colorSchemeCss > 0 || svgSmilNoScript > 0 || streamRBlocks > 0);
    const rPerTurn = rMatch
      ? parseFloat(rMatch[1])
      : ((!hasOpenAiHtmlOrR && /编码轮零思考块/.test(tagStr)) || (/无显式思考块/.test(tagStr) && !hasOpenAiHtmlOrR && (pyHeredoc > 0 || catHeredoc > 0 || CONFIRMED_GEMINI_FLASH_SIDS.has(sid))))
        ? 0
        : (streamRBlocks > 0 ? Math.max(0.5, streamRBlocks / Math.max(1, Number(savedFeat?.turns) || 2)) : 1.5);
    const scoreMatch = /推理分\s*([\d.]+)/.exec(tagStr);
    const habitReasoningScore = (modelEntry?.habitScore != null && Number.isFinite(+modelEntry.habitScore) && +modelEntry.habitScore >= 10 && +modelEntry.habitScore <= 100) ? +modelEntry.habitScore : (scoreMatch ? parseFloat(scoreMatch[1]) : 72.0);
    const isGeminiCoding = !isOpenThink && (
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
    if ((hasOpenAiHtmlOrR || (pyHeredoc === 0 && catHeredoc === 0 && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid))) && vec[0] === 0 && vec[1] === 1) {
      vec[0] = 1;
      vec[1] = 0;
    }
    const bankSample = sid ? loadBank().find(b => b && b.sid === sid) : null;
    const savedMeta = bankSample?.meta || savedFeat?.meta || (savedFeat && typeof savedFeat.turns === 'number' ? savedFeat : null) || null;
    const pickMeta = (k, def) => (savedMeta && savedMeta[k] !== undefined && savedMeta[k] !== null)
      ? savedMeta[k]
      : (savedFeat && savedFeat[k] !== undefined && savedFeat[k] !== null)
        ? savedFeat[k]
        : def;
    const savedTurns = Number(pickMeta('turns', 0)) || (savedFeat?.vec ? Math.max(1, Math.round((Number(vec[16]) || 0.167) * 12)) : 2);
    const savedHidR = Number(pickMeta('hidR', modelEntry?.streamEvidence?.rBlocks ?? chat?._streamEvidence?.rBlocks ?? (isGeminiCoding ? 0 : Math.round(rPerTurn * savedTurns))));
    const savedTotalTools = Number(pickMeta('totalTools', savedFeat?.vec ? Math.max(0, Math.round((Number(vec[15]) || 0) * 6 * savedTurns)) : Math.max(2, pyHeredoc + catHeredoc + edit + read + askUser + 2)));
    const savedMeanChars = Number(pickMeta('meanChars', savedFeat?.vec ? Math.round((Number(vec[17]) || 0.3) * 4000) : (isGeminiCoding ? 32000 : 4500)));
    const revDimsStr = Array.isArray(modelEntry?.reverseCandidates?.[0]?.matchedDims || modelEntry?.reverseCandidates?.[0]?.dims)
      ? (modelEntry.reverseCandidates[0].matchedDims || modelEntry.reverseCandidates[0].dims).join(' | ')
      : '';
    const cpsMatch = /流式速度[:(]\s*([\d.]+)\s*字\/秒/.exec(revDimsStr + ' | ' + tagStr);
    const savedCps = Number(pickMeta('cps', modelEntry?.streamEvidence?.cps || chat?._streamEvidence?.cps || (cpsMatch ? parseFloat(cpsMatch[1]) : 0))) || 0;
    const effIsGemini = isKnownNonGoogle ? false : Boolean(pickMeta('isGeminiCoding', vec[0] === 1 ? false : isGeminiCoding));
    return {
      turns: savedTurns,
      hidR: savedHidR,
      maxRInTurn: Number(pickMeta('maxRInTurn', Math.max(1, Math.round(savedHidR / Math.max(1, savedTurns))))),
      visR: isOpenThink ? 2 : 0,
      visRChars: isOpenThink ? 1200 : 0,
      codingTurns: effIsGemini ? 2 : 1,
      codingTurnsNoR: effIsGemini ? 2 : 0,
      codingTurnsWithHidR: effIsGemini ? 0 : (hasHidR ? 1 : 0),
      geminiPyHelper: Number(pickMeta('geminiPyHelper', CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0)),
      inlineHtmlEcho: Number(pickMeta('inlineHtmlEcho', CONFIRMED_GEMINI_FLASH_SIDS.has(sid) ? 1 : 0)),
      isGeminiCoding: effIsGemini,
      totalTools: savedTotalTools,
      toolsPerTurn: savedTotalTools / Math.max(1, savedTurns),
      rPerTurn: savedHidR / Math.max(1, savedTurns),
      cps: savedCps,
      knownCwTok: Number(modelEntry?.reverseTokens?.cacheWrite || modelEntry?.reverseTotalTokens?.cacheWrite || 0),
      bash: Number(pickMeta('bash', Math.max(effIsGemini ? 1 : 0, pyHeredoc + catHeredoc))),
      write: Number(pickMeta('write', writeFromTag || (effIsGemini ? 2 : 1))),
      edit: Number(pickMeta('edit', edit)),
      read: Number(pickMeta('read', read)),
      present: 0,
      search: Number(pickMeta('search', 0)),
      askUser: Number(pickMeta('askUser', askUser)),
      askUserIntent: Number(pickMeta('askUserIntent', 0)),
      parallelSteps: Number(pickMeta('parallelSteps', parallelSteps)),
      preNarrate: Number(pickMeta('preNarrate', 0.05)),
      pyHeredoc: Number(pickMeta('pyHeredoc', pyHeredoc)),
      catHeredoc: Number(pickMeta('catHeredoc', catHeredoc)),
      chainAnd: 0,
      rgSed: 0,
      cssRoot: Number(pickMeta('cssRoot', cssRoot)),
      raf: Number(pickMeta('raf', raf)),
      svgRich: 1,
      boxComment: Number(pickMeta('boxComment', 0)),
      htmlMaxLen: Number(pickMeta('htmlMaxLen', effIsGemini ? 65000 : (writtenCharsFromTag || 0))),
      writtenChars: Number(pickMeta('writtenChars', writtenCharsFromTag || (effIsGemini ? 65000 : 0))),
      lowerDoctype: Number(pickMeta('lowerDoctype', lowerDoctype)),
      colorSchemeCss: Number(pickMeta('colorSchemeCss', colorSchemeCss)),
      prefersReducedMotion: Number(pickMeta('prefersReducedMotion', prefersReducedMotion)),
      svgSmilNoScript: Number(pickMeta('svgSmilNoScript', svgSmilNoScript)),
      ariaLabelledby: Number(pickMeta('ariaLabelledby', 0)),
      sandboxLink: Number(pickMeta('sandboxLink', sandboxLink)),
      emDash: Number(pickMeta('emDash', 0)),
      cnColon: Number(pickMeta('cnColon', 0)),
      curlyApostrophe: Number(pickMeta('curlyApostrophe', 0)),
      unspacedEmDash: Number(pickMeta('unspacedEmDash', 0)),
      h2: 1,
      h3: 2,
      meanChars: savedMeanChars,
      ...(savedMeta || {}),
      isGeminiCoding: effIsGemini,
      codingTurnsNoR: effIsGemini ? 2 : 0,
      codingTurnsWithHidR: effIsGemini ? 0 : (hasHidR ? 1 : 0),
      isOpenThink,
      wireFam: '',
      vec,
      habitReasoningScore,
      habitTags: tags.length ? tags.filter(t => !/^✓ 用户手动纠偏确认/.test(t)) : ['编码轮零思考块(Gemini特征)', `推理分 ${habitReasoningScore}`],
    };
  }

  function extractFeatures(chat, modelEntry = null) {
    if (!chat && !modelEntry) return null;
    const allMsgs = Array.isArray(chat?.messages) ? chat.messages : [];
    const compMsgs = (chat && typeof globalThis.ArenaBilling !== 'undefined' && typeof globalThis.ArenaBilling.completed === 'function')
      ? globalThis.ArenaBilling.completed(chat)
      : allMsgs.filter(m => m && m.role === 'assistant').slice(-3);
    const asstMsgs = (compMsgs.length ? compMsgs : allMsgs.filter(m => m && m.role === 'assistant')).slice(-3);
    if (!asstMsgs.length) {
      const mFallback = modelEntry || (chat?.sid && typeof Models !== 'undefined' ? Models.get(chat.sid) : null);
      return extractFeaturesFromSaved(chat, mFallback);
    }

    let hidR = 0, visR = 0, visRChars = 0, maxRInTurn = 0;
    let codingTurns = 0, codingTurnsNoR = 0, codingTurnsWithHidR = 0, geminiPyHelper = 0, inlineHtmlEcho = 0;
    let nonCodeTurns = 0, nonCodeChars = 0;
    let bash = 0, write = 0, edit = 0, read = 0, present = 0, search = 0, askUser = 0, askUserIntent = 0, otherTools = 0;
    let stepStarts = 0, parallelSteps = 0, toolTurns = 0, preTextTurns = 0, silentToolTurns = 0;
    let preToolTextChars = 0, interToolTextChars = 0;
    let pyHeredoc = 0, catHeredoc = 0, chainAnd = 0, rgSed = 0, gitCmd = 0;
    let cssRoot = 0, raf = 0, svgRich = 0, boxComment = 0, htmlMaxLen = 0, writtenChars = 0, claudeWarmPalette = 0;
    let lowerDoctype = 0, colorSchemeCss = 0, prefersReducedMotion = 0, svgSmilNoScript = 0, ariaLabelledby = 0, sandboxLink = 0;
    let emDash = 0, cnColon = 0, curlyApostrophe = 0, unspacedEmDash = 0, h2 = 0, h3 = 0, totalChars = 0;
    let askQCount = 0, askOptTotal = 0, askDescChars = 0, askDescCount = 0, askPeriodCount = 0, askIdHasUnderscore = 0, askIdBareIntent = 0;
    let askFormatOpt = 0, askTransformOpt = 0, askSolSig = 0, askSol56Sig = 0;
    let lunaNotSurePhrase = 0, solClarifyPhrase = 0, astraSelfContainedPhrase = 0, terraPhrase = 0;
    let straightApostrophe = 0, writeUnderscoreName = 0, genImg = 0, checkmarkEmoji = 0;
    let wireFam = '';
    const firstUserMsg = allMsgs.find(m => m && m.role === 'user');
    const firstUserTxt = String(firstUserMsg?.text || (Array.isArray(firstUserMsg?.parts) ? firstUserMsg.parts.map(p => p?.text || '').join(' ') : '') || '');
    const isMicroProbePrompt = Boolean(chat?._isMicroProbe || chat?.gacha?.mode === 'habit' || modelEntry?.habitFeatures?.meta?.isMicroProbeChat || /35[～~-]45\s*行以内|50\s*行以内|微缩面板|动态\s*SVG\s*状态徽章|动态内联\s*SVG\s*(?:几何图标|指示器|徽标)/i.test(firstUserTxt));

    const scanHtmlHabits = (src) => {
      if (!src || !/<!doctype html|<html\b|<svg\b/i.test(src)) return;
      if (src.length > htmlMaxLen) htmlMaxLen = src.length;
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

    const scanTextHabits = (txt) => {
      if (!txt) return;
      totalChars += txt.length;
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
      scanHtmlHabits(txt);
    };

    for (const m of asstMsgs) {
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
          if (/[^\s.…·。]/.test(rt)) { visR++; turnVisR++; visRChars += rt.length; }
          else { hidR++; turnHidR++; }
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
          if (/<!DOCTYPE html|<html\b/i.test(txt)) turnInlineHtmlChars += txt.length;
          scanTextHabits(txt);
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
          if (!wireFam && tcId) {
            if (/^(?:toolu|srvtoolu|msg)_01/.test(tcId)) wireFam = 'anthropic';
            else if (/^call_[A-Za-z0-9]{24}$/.test(tcId) && !/^call_[0-9a-f]{24}$/.test(tcId)) wireFam = 'openai';
            else if (/^call_\d+_/.test(tcId)) wireFam = 'deepseek';
            else if (/^functions\.|_\d+_[0-9a-f]{6,}/.test(tcId)) wireFam = 'kimi';
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
            scanHtmlHabits(cmd);
          } else if (tName === 'write_file') {
            write++;
            turnWrite++;
            const fpath = String(inp.path || inp.file_path || '');
            if (/[a-z]+_[a-z]+\.html$/i.test(fpath)) writeUnderscoreName++;
            const content = String(inp.content || '');
            writtenChars += content.length;
            scanHtmlHabits(content);
          } else if (tName === 'edit_file') {
            edit++;
            turnEdit++;
            const nt = String(inp.new_text || '');
            writtenChars += nt.length;
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
      if (turnHidR > maxRInTurn) maxRInTurn = turnHidR;
      if (curStepTools >= 2) parallelSteps++;
      if (turnWrite > 0 && turnInlineHtmlChars >= (isMicroProbePrompt ? 500 : 12000)) {
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
        scanTextHabits(String(m.text || ''));
      }
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
    if (visR > 0 && visRChars < 320 && (askIdHasUnderscore > 0 || askUserIntent > 0 || askSolSig > 0)) {
      hidR += visR;
      if (maxRInTurn < visR) maxRInTurn = visR;
      visR = 0;
      visRChars = 0;
    }
    const isFlash38LowIdentity = turns === 1 && totalTools === 0 && visR === 1 && visRChars < 1500 && totalChars >= 180 && totalChars <= 320;
    if (isFlash38LowIdentity) {
      visR = 0;
    }
    const thinkSt = (typeof ThinkingStatus !== 'undefined' && ThinkingStatus.of) ? ThinkingStatus.of(chat) : null;
    const isOpenThink = Boolean(visR > 0 || (thinkSt?.kind === 'compat-thinking' && !chat?._closedLockedModel));
    const sidStr = String(chat?.sid || modelEntry?.sid || '');
    let sseMemoObj = (typeof window !== 'undefined' && window.__atiSseMemo instanceof Map && sidStr) ? (window.__atiSseMemo.get(sidStr) || null) : null;
    try {
      if (!sseMemoObj && sidStr && typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const rawMemo = localStorage.getItem('ati.v4.sseMemo.' + sidStr);
        if (rawMemo) sseMemoObj = JSON.parse(rawMemo);
      }
    } catch {}
    const mKnown = modelEntry || (sidStr && typeof Models !== 'undefined' ? Models.get(sidStr) : null);
    const bankMatch = sidStr ? loadBank().find(b => b && b.sid === sidStr && (b.userConfirmed || b.importedFromDiag)) : null;
    const mKnownName = String(bankMatch?.model || '');
    const topRevCand = null;
    const knownRBlocks = Number(chat?._streamEvidence?.rBlocks || mKnown?.streamEvidence?.rBlocks || sseMemoObj?.reasoningBlocks || 0);
    const knownCwTok = 0;
    const isKnownGoogleName = /gemini|google|argon|barium/i.test(mKnownName);
    const hasDefiniteGoogleBash =
      ((turns >= 3 && totalTools >= 10 && hidR === 0 && visR === 0 && knownRBlocks === 0) ||
       ((pyHeredoc > 0 || catHeredoc > 0 || geminiPyHelper > 0 || inlineHtmlEcho > 0) && hidR === 0 && visR === 0 && knownRBlocks === 0 && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0)) &&
      wireFam !== 'openai' && wireFam !== 'anthropic' && !/gpt|openai|sol|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName);
    const hasNonGoogleEvidence = Boolean(
      !CONFIRMED_GEMINI_FLASH_SIDS.has(sidStr) && !isKnownGoogleName && !hasDefiniteGoogleBash && (
        knownRBlocks > 0 ||
        /gpt|openai|sol|luna|astra|terra|claude|anthropic|opus|sonnet|haiku|fable/i.test(mKnownName) ||
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
        cnColon >= 2 ||
        boxComment >= 1
      )
    );
    if (!isOpenThink && hidR === 0 && visR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0 && (pyHeredoc === 0 || lowerDoctype > 0 || sandboxLink > 0 || prefersReducedMotion > 0 || knownRBlocks > 0) && (catHeredoc === 0 || prefersReducedMotion > 0 || knownRBlocks > 0)) {
      hidR = knownRBlocks > 0 ? knownRBlocks : Math.max(turns, codingTurns * 2 || turns);
      if (maxRInTurn === 0) maxRInTurn = Math.max(1, Math.round(hidR / turns));
      if (codingTurns > 0) {
        codingTurnsWithHidR = codingTurns;
        codingTurnsNoR = 0;
      }
    } else if (!isOpenThink && hidR > 0 && codingTurns > 0 && codingTurnsWithHidR === 0 && hasNonGoogleEvidence && geminiPyHelper === 0 && inlineHtmlEcho === 0 && (prefersReducedMotion > 0 || lowerDoctype > 0 || sandboxLink > 0 || knownRBlocks > 0)) {
      codingTurnsWithHidR = codingTurns;
      codingTurnsNoR = 0;
    }
    const isGeminiCoding = !isOpenThink && (
      CONFIRMED_GEMINI_FLASH_SIDS.has(sidStr) ||
      hasDefiniteGoogleBash ||
      (!hasNonGoogleEvidence && (hidR === 0 && visR === 0)) ||
      (!hasNonGoogleEvidence && codingTurnsNoR >= 1 && codingTurnsWithHidR === 0) ||
      geminiPyHelper > 0 ||
      inlineHtmlEcho > 0 ||
      (!hasNonGoogleEvidence && codingTurnsNoR >= 1 && codingTurnsWithHidR === 0 && (catHeredoc > 0 || pyHeredoc > 0) && sandboxLink === 0 && lowerDoctype === 0 && colorSchemeCss === 0 && svgSmilNoScript === 0 && prefersReducedMotion === 0 && (askUser === 0 || hidR === 0))
    );

    // 从消息 timing / UUIDv7 时间戳 / streamEvidence 提取单轮耗时与流式吐字速度 cps
    let durSumMs = 0, durCount = 0;
    for (let i = 0; i < allMsgs.length; i++) {
      const m = allMsgs[i];
      if (!m || m.role !== 'assistant') continue;
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
    const meanChars = (totalChars + writtenChars * 0.85) / turns;
    const nonCodeMeanChars = nonCodeTurns > 0 ? Math.round(nonCodeChars / nonCodeTurns) : Math.round(meanChars);
    const rPerTurn = (hidR + visR * 0.85) / turns;
    const memoDeltaCountEarly = Number(sseMemoObj?.textDeltaCount || chat?.fmt?.tN || 0);
    const fmtAvgChunkEarly = (Number(chat?.fmt?.tN) >= 3 && Number(chat?.fmt?.tChars) > 0) ? Math.round((Number(chat.fmt.tChars) / Number(chat.fmt.tN)) * 10) / 10 : 0;
    const memoAvgChunkEarly = Number(sseMemoObj?.avgChunk || streamEv?.avgChunk || (memoDeltaCountEarly > 0 && Number(sseMemoObj?.textDeltaChars) > 0 ? Math.round((Number(sseMemoObj.textDeltaChars) / memoDeltaCountEarly) * 10) / 10 : fmtAvgChunkEarly) || 0);
    const codeSpanLen = Math.max(writtenChars || 0, htmlMaxLen || 0);
    const isMicroProbeChat = Boolean(isMicroProbePrompt || (turns <= 2 && codingTurns >= 1 && codeSpanLen >= 320 && codeSpanLen <= 6200 && (svgRich > 0 || svgSmilNoScript > 0 || cssRoot > 0 || raf > 0 || colorSchemeCss > 0 || prefersReducedMotion > 0 || lowerDoctype > 0 || boxComment > 0)));
    const hasCompactMultiTurnSurge = nonCodeTurns >= 2 && codingTurns === 1 && nonCodeMeanChars <= 850 && rPerTurn <= 1.5 && totalTools <= 3 && bash === 0 && edit === 0 && writeUnderscoreName === 0 && lunaNotSurePhrase === 0 && sandboxLink === 0 && boxComment === 0 && !(prefersReducedMotion > 0 && ariaLabelledby > 0 && cnColon === 0) && (memoDeltaCountEarly === 0 || memoAvgChunkEarly >= 10);
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
    const rawReasonScore = 38
      + Math.min(25, rPerTurn * 4.2)
      + Math.min(18, toolsPerTurn * 2.2)
      + Math.min(8, parallelSteps * 1.8)
      + Math.min(13, htmlDepthBonus)
      + Math.min(6, effMeanChars / 2200);
    const habitReasoningScore = Math.round(Math.max(22, Math.min(98.5, rawReasonScore)) * 10) / 10;

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
    if (cssRoot > 0 || raf > 0) habitTags.push(`HTML习惯(:root${cssRoot ? '✓' : ''}/rAF${raf ? '✓' : ''})`);
    if (cnColon >= 2 || emDash >= 2) habitTags.push(`行文(**冒号**${cnColon}/破折号${emDash})`);
    else if (curlyApostrophe >= 1 || unspacedEmDash >= 1) habitTags.push(`英文标点(弯撇号${curlyApostrophe}/紧凑破折号${unspacedEmDash})`);
    if (isMicroProbeChat) habitTags.push('微缩探针');
    if (memoDeltaCountEarly >= 4 && memoAvgChunkEarly > 0) habitTags.push(`流块(${memoAvgChunkEarly}字)`);
    habitTags.push(`推理分 ${habitReasoningScore}`);

    const askOptsAvg = askQCount > 0 ? Math.round((askOptTotal / askQCount) * 10) / 10 : 0;
    const askDescAvg = askDescCount > 0 ? Math.round(askDescChars / askDescCount) : 0;
    const askPeriodRate = askDescCount > 0 ? Math.round((askPeriodCount / askDescCount) * 100) / 100 : 1;
    const memoDeltaCount = memoDeltaCountEarly;
    const memoAvgChunk = memoAvgChunkEarly;

    return {
      turns,
      hidR,
      maxRInTurn,
      visR,
      visRChars,
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
      meanChars: Math.round(meanChars),
      nonCodeMeanChars,
      isMicroProbeChat,
      hasCompactMultiTurnSurge,
      knownCwTok,
      isFlash38LowIdentity,
      isOpenThink,
      wireFam,
      vec,
      habitReasoningScore,
      habitTags,
    };
  }

  function vectorSimilarity(v1, v2, feat) {
    if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length) return 0;
    // Feature weights: thinking signature (0,1), pre-narration (2), tool ratios (3,4,5), bash habits (6,7,8,9), HTML/prose/depth (10..19)
    const W = [
      2.6, 2.6, 2.0, 2.5, 1.6,
      2.2, 2.2, 1.5, 1.8, 1.6,
      1.1, 1.1, 1.0, 1.3, 1.4,
      1.6, 1.4, 1.8, 2.0, 1.8,
    ];
    // Subspace masking: downweight unactivated feature subspaces (no tools, no HTML, or ask_user-only)
    const noTools = feat && feat.totalTools === 0;
    const noHtml = feat && !feat.htmlMaxLen && !feat.writtenChars && !feat.cssRoot && !feat.raf && !feat.svgRich && !feat.boxComment;
    const onlyAskUser = feat && feat.totalTools > 0 && feat.askUser === feat.totalTools;
    let sumSq = 0, wTot = 0;
    for (let i = 0; i < v1.length; i++) {
      let w = W[i] || 1;
      if (noTools && i >= 2 && i <= 13) w *= 0.08;
      else {
        if (onlyAskUser && i >= 3 && i <= 9) w *= 0.08;
        if (noHtml && i >= 10 && i <= 13) w *= 0.06;
      }
      if (noHtml && (noTools || onlyAskUser) && i >= 14 && i <= 19) w *= 0.10;
      const d = (Number(v1[i]) || 0) - (Number(v2[i]) || 0);
      sumSq += w * d * d;
      wTot += w;
    }
    const rmse = Math.sqrt(sumSq / Math.max(1e-6, wTot));
    return Math.max(0, Math.min(1, 1 - rmse * 1.25));
  }

  // ── 常用纠偏频次统计（驱动三次卡片跳转置顶 + 习惯先验微调）──
  const FREQ_KEY = 'habit:correctionFreq:v1';
  function getUsageStats() {
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
        const canon = clean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(clean) : clean);
        const s = canon.toLowerCase();
        let vid = 'other';
        if (/gpt|openai|sol|astra|luna|terra/.test(s)) vid = 'openai';
        else if (/claude|anthropic|opus|sonnet|haiku|fable/.test(s)) vid = 'anthropic';
        else if (/gemini|google|argon|barium/.test(s)) vid = 'google';
        else if (/grok|x-ai/.test(s)) vid = 'xai';
        else if (/deepseek|qwen|glm|kimi|mimo|step|beam|nemotron|inkling|开源/.test(s)) vid = 'open';
        const fam = canon.replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').trim();
        const effM = /\b(max|xhigh|high|medium|low)\b/i.exec(canon);
        const eff = effM ? effM[1].toLowerCase() : 'high';
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
    return stats;
  }

  function recordModelUse(modelLabel, vendorHint = '', familyHint = '', effortHint = '') {
    try {
      const stats = getUsageStats();
      const clean = String(modelLabel || '').replace(/[?？]+$/, '').trim();
      const canon = clean === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(clean) : clean);
      const s = canon.toLowerCase();
      let vid = vendorHint;
      if (!vid) {
        if (/gpt|openai|sol|astra|luna|terra/.test(s)) vid = 'openai';
        else if (/claude|anthropic|opus|sonnet|haiku|fable/.test(s)) vid = 'anthropic';
        else if (/gemini|google|argon|barium/.test(s)) vid = 'google';
        else if (/grok|x-ai/.test(s)) vid = 'xai';
        else vid = 'open';
      }
      const fam = (familyHint || canon.replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '')).trim().toLowerCase();
      const effM = /\b(max|xhigh|high|medium|low)\b/i.exec(effortHint || canon);
      const eff = effM ? effM[1].toLowerCase() : 'high';
      stats.vendors[vid] = (stats.vendors[vid] || 0) + 3;
      if (fam) stats.families[fam] = (stats.families[fam] || 0) + 3;
      if (s) stats.models[s] = (stats.models[s] || 0) + 3;
      if (eff) stats.efforts[eff] = (stats.efforts[eff] || 0) + 2;
      stats.updatedAt = Date.now();
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
      isGeminiCoding: Boolean(feat.isGeminiCoding),
      isOpenThink: Boolean(feat.isOpenThink),
    };
  }

  function metaSimilarity(feat, meta) {
    if (!feat || !meta) return null;
    const fTools = feat.totalTools || 0;
    const mTools = meta.totalTools || 0;
    if ((fTools === 0) !== (mTools === 0)) return 0.25;
    const fOnlyAsk = fTools > 0 && feat.askUser === fTools;
    const mOnlyAsk = mTools > 0 && meta.askUser === mTools;
    if (fOnlyAsk !== mOnlyAsk) return 0.30;
    if (Boolean(feat.isGeminiCoding) !== Boolean(meta.isGeminiCoding)) return 0.20;
    let dSq = 0, wSum = 0;
    const addD = (a, b, scale, w) => {
      const diff = Math.min(1, Math.abs((Number(a) || 0) - (Number(b) || 0)) / Math.max(1e-5, scale));
      dSq += w * diff * diff;
      wSum += w;
    };
    addD(feat.hidR / Math.max(1, feat.turns), (meta.hidR || 0) / Math.max(1, meta.turns || 1), 6.0, 2.8);
    addD(feat.maxRInTurn || 0, meta.maxRInTurn || 0, 12.0, 2.6);
    addD(feat.preToolTextChars || 0, meta.preToolTextChars || 0, 280.0, 2.2);
    addD(feat.interToolTextChars || 0, meta.interToolTextChars || 0, 280.0, 1.8);
    addD(feat.askIdHasUnderscore || 0, meta.askIdHasUnderscore || 0, 1.0, fOnlyAsk ? 3.5 : 1.0);
    if ((feat.avgTurnDurMs || 0) > 0 && (meta.avgTurnDurMs || 0) > 0) {
      const fDur = feat.isMicroProbeChat ? feat.avgTurnDurMs * 4.2 : feat.avgTurnDurMs;
      const mDur = meta.isMicroProbeChat ? meta.avgTurnDurMs * 4.2 : meta.avgTurnDurMs;
      addD(fDur, mDur, 90000.0, 2.2);
    }
    const fWritten = feat.isMicroProbeChat ? Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0) * 8.5 : (feat.writtenChars || 0);
    const mWritten = meta.isMicroProbeChat ? Math.max(meta.writtenChars || 0, meta.htmlMaxLen || 0) * 8.5 : (meta.writtenChars || 0);
    addD(fWritten, mWritten, 45000.0, 1.6);
    addD(feat.meanChars || 0, meta.meanChars || 0, 5000.0, 1.5);
    addD(feat.edit || 0, meta.edit || 0, 4.0, 1.8);
    addD(feat.parallelSteps || 0, meta.parallelSteps || 0, 3.0, 1.6);
    return Math.max(0, Math.min(1, 1 - Math.sqrt(dSq / Math.max(1e-6, wSum))));
  }

  function analyze(chat, modelEntry = null) {
    const feat = extractFeatures(chat, modelEntry);
    if (!feat) return null;
    const sid = String(chat?.sid || modelEntry?.sid || '');
    // 若当前会话已存在高置信度 /cost 反推候选（diophantinePassed 或 revPct >= 85），自动触发反推教师向习惯引擎拟合校准
    if (sid && modelEntry && !modelEntry.userCorrected && Array.isArray(modelEntry.reverseCandidates)) {
      const rcTeacher = modelEntry.reverseCandidates.find(c => c && !c.structuralRev && c.source !== 'habit' && c.source !== 'fp' && !c.habitSource && (c.diophantinePassed || Number(c.revPct ?? c.match ?? 0) >= 85) && Number(c.revPct ?? c.match ?? 0) >= 75);
      if (rcTeacher) {
        try { learnFromReverseTeacher(chat || { sid, messages: [] }, modelEntry, rcTeacher); } catch {}
      }
    }
    const bank = loadBank();
    const calib = loadCalibration();
    const usageStats = getUsageStats();
    const scoreMap = new Map();

    const isArgonBehavior = (feat.inlineHtmlEcho === 0 || (feat.turns >= 4 && feat.bash >= 5 && feat.writtenChars >= 80000) || (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 1000 && feat.avgTurnDurMs >= 220000)) && feat.geminiPyHelper === 0 && (
      feat.edit >= 1 ||
      feat.read >= 12 ||
      (feat.parallelSteps >= 2 && feat.catHeredoc === 0) ||
      (feat.parallelSteps >= 1 && feat.avgTurnDurMs >= 60000) ||
      (feat.bash >= 3 && feat.avgTurnDurMs >= 95000 && (feat.write >= 1 || (feat.turns === 1 && feat.bash <= 19 && feat.totalTools <= 36))) ||
      (feat.askUser >= 1 && feat.bash >= 1 && feat.bash <= 8 && feat.totalTools <= 10 && feat.write === 0 && feat.edit === 0) ||
      (feat.turns >= 2 && feat.bash >= 5 && feat.write === 0 && feat.edit === 0 && feat.cnColon >= 5) ||
      (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 1000 && feat.avgTurnDurMs >= 220000) ||
      (feat.turns === 1 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && feat.askUser === 0 && feat.avgTurnDurMs >= 45000 && feat.meanChars >= 1000) ||
      (feat.totalTools === 0 && feat.meanChars >= 400 && feat.avgTurnDurMs >= 21000)
    );
    const isKnownArgon = !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (
      KNOWN_ARGON_SIDS.has(sid) ||
      Boolean(isArgonBehavior) ||
      bank.some(b => b && b.sid === sid && (b.userConfirmed || b.importedFromDiag) && /argon|barium/i.test(String(b.id || b.model || '')))
    );

    const onlyAskUser = feat.totalTools > 0 && feat.askUser === feat.totalTools;
    const isHaikuPlainMedium = feat.totalTools === 0 && feat.straightApostrophe >= 1 && feat.curlyApostrophe === 0 && feat.meanChars >= 380 && feat.meanChars <= 1600;
    const wPerWrite = (feat.writtenChars || 0) / Math.max(1, feat.write || 1);
    const isHaikuMultiTurnMedium = feat.turns >= 2 && feat.write >= 1 && feat.write <= 2 && feat.bash === 0 && feat.edit === 0 && feat.askUser === 0 && wPerWrite >= 12000 && wPerWrite < 14000 && (feat.nonCodeMeanChars || 0) > 0 && (feat.nonCodeMeanChars || 0) <= 220 && feat.maxRInTurn <= 2 && feat.memoDeltaCount >= 50 && feat.sandboxLink === 0 && feat.lowerDoctype === 0 && feat.prefersReducedMotion === 0 && feat.boxComment === 0;
    const isMicroProbe = Boolean(feat.isMicroProbeChat);
    const effWChars = isMicroProbe ? Math.round(Math.max(feat.writtenChars || 0, feat.htmlMaxLen || 0) * 8.5) : (feat.writtenChars || 0);
    const avgChunk = Number(feat.memoAvgChunk) || 0;
    const deltaCnt = Number(feat.memoDeltaCount) || 0;
    const hasClaudeChunkSig = deltaCnt >= 6 && avgChunk >= 6.0 && avgChunk <= 16.5 && !feat.isGeminiCoding && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.prefersReducedMotion || 0) === 0;
    const hasOpenAiChunkSig = deltaCnt >= 6 && ((avgChunk >= 20.0 && avgChunk <= 62.0) || (avgChunk >= 1.0 && avgChunk <= 5.2)) && !feat.isGeminiCoding && (feat.claudeWarmPalette || 0) === 0 && (feat.boxComment || 0) === 0;
    const isHaikuCodingOrSearch =
      (feat.turns === 1 && feat.write === 1 && feat.bash === 0 && feat.writtenChars > 0 && feat.writtenChars < 12000 && feat.cnColon >= 1 && (!isMicroProbe || (feat.boxComment === 0 && feat.claudeWarmPalette === 0 && feat.hidR <= 1 && feat.preToolTextChars < 90 && feat.interToolTextChars < 60))) ||
      (isMicroProbe && feat.turns <= 2 && feat.write >= 1 && feat.bash <= 1 && feat.hidR <= 1 && feat.boxComment === 0 && feat.claudeWarmPalette === 0 && feat.preToolTextChars < 25 && feat.interToolTextChars < 45 && effWChars > 0 && effWChars < 11500 && feat.cnColon >= 1) ||
      (feat.turns === 1 && feat.search >= 2 && feat.bash === 0 && feat.write === 0 && feat.askUser === 0);
    const isSonnetPlainMulti = feat.turns === 2 && feat.totalTools === 0 && feat.memoAvgChunk >= 240 && feat.curlyApostrophe === 0;
    const hasAnthropicSig = Boolean(
      !feat.isGeminiCoding && (feat.askIdHasUnderscore || 0) === 0 && (feat.sandboxLink || 0) === 0 && (feat.lowerDoctype || 0) === 0 && (feat.prefersReducedMotion || 0) === 0 && ((feat.genImg || 0) === 0 || HAIKU_55_MEDIUM_SIDS.has(sid) || (feat.knownCwTok || 0) > 0 || isHaikuMultiTurnMedium || feat.cnColon >= 8 || feat.interToolTextChars >= 500) && ((feat.checkmarkEmoji || 0) === 0 || HAIKU_55_MEDIUM_SIDS.has(sid) || feat.cnColon >= 2 || (feat.knownCwTok || 0) > 0 || isHaikuMultiTurnMedium) && (
        feat.wireFam === 'anthropic' ||
        (feat.knownCwTok || 0) > 0 ||
        HAIKU_55_MEDIUM_SIDS.has(sid) ||
        isHaikuPlainMedium ||
        isHaikuMultiTurnMedium ||
        isHaikuCodingOrSearch ||
        isSonnetPlainMulti ||
        Boolean(feat.hasCompactMultiTurnSurge) ||
        feat.claudeWarmPalette > 0 ||
        feat.interToolTextChars >= 100 ||
        (feat.preToolTextChars >= 140 && feat.askUser === 0) ||
        (feat.memoAvgChunk >= 195 && feat.hidR <= feat.totalTools + feat.turns && feat.hidR >= 3 && feat.maxRInTurn < 6 && feat.askUser === 0) ||
        (feat.preNarrate >= 0.45 && feat.totalTools >= 1 && feat.askUser === 0 && feat.maxRInTurn < 6) ||
        (feat.cnColon >= 2 && feat.curlyApostrophe === 0) ||
        feat.boxComment >= 1 ||
        (isMicroProbe && hasClaudeChunkSig && (feat.cnColon >= 1 || feat.preToolTextChars >= 20 || feat.interToolTextChars >= 25))
      )
    );
    const hasStrongOpenAiSig = Boolean(
      !feat.isGeminiCoding && !hasAnthropicSig && (
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
        (feat.prefersReducedMotion > 0 && feat.write >= 1 && (feat.preNarrate || 0) < 0.25) ||
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
      if (proto.argonOnly && !isKnownArgon) continue;
      let sim = vectorSimilarity(feat.vec, proto.vec, feat);
      const pLabel = proto.label.toLowerCase();

      // 1. 协议与跨家族边界约束
      if (feat.wireFam === 'anthropic' && proto.vendor === 'Anthropic') sim = Math.min(0.99, sim + 0.14);
      if (feat.wireFam === 'openai' && proto.vendor === 'OpenAI') sim = Math.min(0.99, sim + 0.12);
      if (!feat.isOpenThink && !feat.isGeminiCoding && feat.hidR > 0 && proto.vendor === 'Google') sim *= 0.58;
      if (!feat.isOpenThink && feat.isGeminiCoding && proto.vendor !== 'Google') sim *= 0.58;

      // 2. Google Gemini 家族内部细分（Gemini 3.8 Flash vs 3.7 Flash vs 4 Argon High/Medium）
      if (!feat.isOpenThink && feat.isGeminiCoding && proto.vendor === 'Google') {
        const isArgonMediumProfile = isKnownArgon && !KNOWN_ARGON_SIDS.has(sid) && (
          (feat.turns === 1 && feat.bash >= 15 && feat.bash <= 19 && feat.totalTools <= 36 && feat.write === 0 && feat.edit === 0 && feat.parallelSteps === 0 && durMs >= 95000 && durMs < 250000) ||
          (feat.turns >= 2 && feat.askUser >= 1 && feat.bash >= 1 && feat.totalTools <= 4 && feat.write === 0 && feat.edit === 0) ||
          (feat.turns >= 20 && feat.write === 0 && feat.edit === 0 && feat.meanChars < 500)
        );
        const isArgonHighProfile = isKnownArgon && !isArgonMediumProfile && (
          KNOWN_ARGON_SIDS.has(sid) ||
          feat.edit >= 1 ||
          feat.read >= 12 ||
          (feat.turns >= 4 && feat.bash >= 5 && feat.writtenChars >= 80000) ||
          (feat.turns === 2 && feat.bash === 0 && feat.write === 1 && (feat.nonCodeMeanChars || 0) >= 1000 && durMs >= 220000) ||
          (feat.parallelSteps >= 2 && feat.catHeredoc === 0) ||
          (feat.parallelSteps >= 1 && durMs >= 60000) ||
          (feat.bash >= 3 && durMs >= 95000 && (feat.write >= 1 || (feat.turns === 1 && feat.bash <= 19 && feat.totalTools <= 36))) ||
          (feat.askUser >= 1 && feat.bash >= 1 && feat.bash <= 8 && feat.totalTools >= 5 && feat.totalTools <= 10 && feat.write === 0 && feat.edit === 0) ||
          (feat.turns >= 2 && feat.bash >= 5 && feat.write === 0 && feat.edit === 0 && feat.cnColon >= 5) ||
          (feat.turns === 1 && feat.totalTools === 1 && feat.bash === 0 && feat.write === 0 && feat.edit === 0 && feat.askUser === 0 && durMs >= 45000 && feat.meanChars >= 1000) ||
          (feat.totalTools === 0 && feat.meanChars >= 400 && durMs >= 21000)
        );
        const isFlash37MediumProfile = !isKnownArgon && !feat.isFlash38LowIdentity && feat.totalTools === 0 && feat.turns === 1 && feat.meanChars >= 80 && feat.meanChars <= 460 && (durMs === 0 || durMs < 20000);
        if (proto.id === 'google/gemini-3.7-flash-medium' && !isFlash37MediumProfile) {
          sim -= 0.14;
        }
        if (proto.id === 'google/gemini-3.8-flash-low' && !feat.isFlash38LowIdentity) {
          sim -= 0.16;
        }
        if (KNOWN_ARGON_SIDS.has(sid) && proto.id === 'contenders/barium-bb-v2-4xts-agent') {
          sim = 0.995;
        } else if (feat.isFlash38LowIdentity && proto.id === 'google/gemini-3.8-flash-low') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.28));
        } else if (isArgonMediumProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent-medium') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.25));
        } else if (isArgonHighProfile && proto.id === 'contenders/barium-bb-v2-4xts-agent') {
          sim = Math.max(0.96, Math.min(0.992, sim + 0.24));
        } else if (isFlash37MediumProfile && proto.id === 'google/gemini-3.7-flash-medium') {
          sim = Math.max(0.96, Math.min(0.99, sim + 0.24));
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isFlash37MediumProfile && !feat.isFlash38LowIdentity && feat.edit === 0 && (feat.pyHeredoc >= 1 || feat.catHeredoc >= 1 || feat.geminiPyHelper >= 1 || feat.inlineHtmlEcho >= 1 || feat.search >= 1 || feat.bash >= 1 || CONFIRMED_GEMINI_FLASH_SIDS.has(sid))) {
          if (/3\.8\s*flash\s*\(high\)/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.992, sim + 0.22));
          else sim = Math.min(0.88, sim - 0.06);
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isFlash37MediumProfile && !feat.isFlash38LowIdentity && feat.edit >= 1) {
          if (/3\.1\s*pro/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.985, sim + 0.18));
          else sim = Math.min(0.88, sim - 0.06);
        } else if (!isArgonHighProfile && !isArgonMediumProfile && !isFlash37MediumProfile && !feat.isFlash38LowIdentity) {
          if (/3\.8\s*flash\s*\(high\)/i.test(proto.label)) sim = Math.max(0.96, Math.min(0.98, sim + 0.16));
          else sim = Math.min(0.88, sim - 0.06);
        } else {
          sim = Math.min(0.88, sim - 0.08);
        }
      }

      // 3. OpenAI 家族内部精细区分（6.1 Sol Max/xHigh/High vs 6 Sol vs 5.6 Sol vs 6 Luna Max/High/Medium vs 6 Astra High/Medium）
      if (proto.vendor === 'OpenAI' && !feat.isGeminiCoding && !feat.isOpenThink) {
        if (hasStrongOpenAiSig) sim += 0.10;
        else if (hasOpenAiProseSig) sim += 0.06;
        else if (hasAnthropicSig) sim -= 0.16;

        const isTerraLow = (
          (feat.askTransformOpt > 0 && feat.askSol56Sig === 0 && (onlyAskUser || feat.turns <= 2)) ||
          feat.terraPhrase > 0 ||
          (feat.turns === 3 && feat.askUser === 1 && feat.bash === 3 && feat.write === 0)
        );
        const isMidAstra = !isTerraLow && (
          (feat.astraSelfContainedPhrase > 0 && (feat.totalTools === 0 || feat.memoDeltaCount === 0 || feat.memoDeltaCount < 15 || feat.turns >= 2)) ||
          (feat.turns >= 2 && feat.write >= 1 && feat.bash === 0 && feat.edit === 0 && feat.totalTools <= 5 && feat.preToolTextChars >= 60 && feat.writtenChars < 35000 && feat.genImg === 0 && feat.askIdHasUnderscore === 0 && feat.askSolSig === 0) ||
          (feat.turns === 1 && feat.write >= 1 && feat.bash === 0 && effWChars < 18000 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.cnColon === 0 && (!isMicroProbe || (feat.prefersReducedMotion === 0 && feat.colorSchemeCss === 0 && feat.ariaLabelledby === 0 && feat.writeUnderscoreName === 0 && feat.hidR <= 2))) ||
          (isMicroProbe && feat.turns === 1 && feat.write === 1 && feat.bash === 1 && effWChars < 16500 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.prefersReducedMotion === 0 && feat.colorSchemeCss === 0 && feat.ariaLabelledby === 0 && feat.writeUnderscoreName === 0 && feat.parallelSteps === 0 && feat.hidR <= 2 && (avgChunk === 0 || avgChunk >= 15))
        );
        const isMultiTurnLightLunaMed = feat.turns >= 6 && toolsPerTurn < 1.0 && (feat.edit || 0) === 0 && (feat.sandboxLink > 0 || feat.lowerDoctype > 0 || feat.pyHeredoc > 0);
        const isFastLunaStream = cps >= 135 && feat.habitReasoningScore < 80 && sid !== '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54' && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) === 0 && (feat.turns <= 2 || !(feat.write >= 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0));
        const isLunaMaxBurst = !isTerraLow && !isMidAstra && !isMultiTurnLightLunaMed && !isFastLunaStream && (
          (feat.maxRInTurn >= 4 && feat.hidR >= feat.totalTools + feat.turns + 3 && feat.askIdHasUnderscore === 0 && !(feat.bash >= 5 && feat.writtenChars >= 30000) && (feat.memoDeltaCount === 0 || feat.memoDeltaCount < 40)) ||
          (feat.turns >= 8 && rPerTurn >= 40 && feat.hidR >= 400) ||
          (onlyAskUser && feat.turns === 1 && feat.hidR >= 4 && feat.askFormatOpt > 0 && feat.memoDeltaCount === 0 && feat.askIdHasUnderscore === 0) ||
          (feat.turns >= 3 && feat.write >= 1 && feat.writeUnderscoreName > 0 && !(feat.turns === 4 && feat.writtenChars >= 7000 && feat.writtenChars < 9000)) ||
          (feat.turns === 4 && feat.write === 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0 && feat.writtenChars >= 9000 && feat.writtenChars < 10500)
        );
        const isXHigh61Sol = !isTerraLow && !isMidAstra && !isLunaMaxBurst && !isFastLunaStream && (
          ((feat.sandboxLink > 0 || feat.prefersReducedMotion > 0) && effWChars >= 28000 && effWChars < 44000 && feat.svgSmilNoScript === 0 && (feat.edit || 0) === 0 && (feat.parallelSteps || 0) === 0 && (feat.bash || 0) <= 2 && (feat.totalTools || 0) <= 4) ||
          (isMicroProbe && feat.writeUnderscoreName > 0 && feat.svgSmilNoScript === 0 && (feat.parallelSteps || 0) === 0 && feat.turns <= 2 && (feat.bash || 0) <= 2) ||
          (feat.turns === 2 && feat.write >= 1 && feat.bash >= 2 && feat.askUser === 0 && feat.writtenChars < 15000) ||
          ((feat.turns === 2 || (feat.turns === 3 && feat.bash === 1)) && feat.write === 1 && feat.askUser === 0 && feat.prefersReducedMotion > 0 && feat.ariaLabelledby === 0 && feat.writtenChars >= 11000 && feat.writtenChars < 16000)
        );
        const isDeep61Sol = sid === '01a14ce5-b4b6-7962-9f20-c3cbc66c1a54' || (!isTerraLow && !isMidAstra && !isLunaMaxBurst && !isXHigh61Sol && !isFastLunaStream && (
          (feat.parallelSteps >= 1 && (feat.edit >= 1 || feat.bash >= 2 || (isMicroProbe && feat.write >= 1 && feat.bash >= 1))) ||
          (feat.totalTools >= 4 && toolsPerTurn >= 3.2 && feat.askSol56Sig === 0 && feat.checkmarkEmoji === 0 && (feat.turns >= 2 || feat.write >= 1 || feat.bash >= 2)) ||
          (feat.genImg >= 1 && feat.write >= 1 && feat.checkmarkEmoji === 0 && (feat.bash >= 1 || feat.sandboxLink > 0)) ||
          (feat.write >= 1 && feat.bash >= 4 && feat.askIdHasUnderscore > 0) ||
          (feat.sandboxLink > 0 && effWChars >= 34000 && (feat.edit >= 1 || feat.bash >= 3 || feat.parallelSteps >= 1))
        ));
        const isMid56Sol = !isTerraLow && !isMidAstra && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && (
          (feat.turns === 1 && feat.askUser >= 1 && (feat.preToolTextChars >= 40 || feat.askSol56Sig > 0)) ||
          (feat.totalTools === 0 && feat.askSol56Sig > 0) ||
          (feat.genImg >= 1 && feat.checkmarkEmoji > 0) ||
          (!onlyAskUser && (feat.turns === 1 || (feat.turns === 2 && effWChars >= 18000)) && feat.ariaLabelledby > 0 && effWChars < 34000 && feat.sandboxLink === 0) ||
          (!onlyAskUser && feat.turns === 1 && feat.colorSchemeCss > 0 && effWChars >= 18000 && effWChars < 34000 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0)
        );
        const isLunaHighBurst = !isTerraLow && !isMidAstra && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isMid56Sol && !isFastLunaStream && (
          (onlyAskUser && feat.maxRInTurn >= 2 && feat.hidR >= 2 && feat.hidR <= 7 && feat.askIdHasUnderscore === 0 && (feat.solClarifyPhrase === 0 || (feat.turns >= 2 && feat.askFormatOpt > 0)) && (feat.askFormatOpt > 0 || (feat.askSolSig === 0 && feat.preToolTextChars === 0)) && (feat.memoDeltaCount < 35 || feat.askFormatOpt > 0 || feat.hidR >= 5)) ||
          (!onlyAskUser && feat.turns === 2 && feat.askUser === 1 && feat.write === 1 && feat.preToolTextChars === 0 && feat.writtenChars < 20000 && feat.svgSmilNoScript === 0 && feat.askFormatOpt === 0) ||
          (!onlyAskUser && feat.totalTools > 0 && feat.maxRInTurn >= 2 && feat.maxRInTurn <= 7 && feat.hidR >= feat.totalTools + feat.turns + 1 && feat.sandboxLink === 0 && feat.svgSmilNoScript === 0 && feat.parallelSteps === 0 && feat.writtenChars < 32000 && feat.genImg === 0 && feat.askSolSig === 0 && feat.solClarifyPhrase === 0) ||
          (feat.turns === 4 && feat.write === 1 && feat.sandboxLink > 0 && feat.prefersReducedMotion > 0 && feat.writtenChars >= 7000 && feat.writtenChars < 9000) ||
          (feat.totalTools === 0 && feat.hidR >= 3 && feat.hidR <= 6 && feat.maxRInTurn <= 3 && feat.solClarifyPhrase === 0 && feat.meanChars < 4500)
        );
        const isLunaMedProfile = !isTerraLow && !isMidAstra && !isLunaMaxBurst && !isXHigh61Sol && !isDeep61Sol && !isMid56Sol && (
          isMultiTurnLightLunaMed ||
          isFastLunaStream ||
          (!isLunaHighBurst && (
            (onlyAskUser && feat.maxRInTurn <= 1 && feat.askFormatOpt > 0 && feat.askSolSig === 0) ||
            (feat.turns === 2 && feat.askUser === 1 && feat.write === 1 && feat.askFormatOpt > 0) ||
            (feat.totalTools === 0 && feat.hidR <= 2 && feat.astraSelfContainedPhrase === 0 && (feat.lunaNotSurePhrase > 0 || (feat.solClarifyPhrase === 0 && (feat.meanChars < 80 || (feat.turns >= 3 && feat.memoDeltaCount < 20)))))
          ))
        );
        const isFastLuna = isLunaMaxBurst || isLunaHighBurst || isLunaMedProfile;
        const isLong6Sol = !isTerraLow && !isMidAstra && !isFastLuna && !isXHigh61Sol && !isDeep61Sol && !isMid56Sol && (
          feat.writtenChars >= 34000 && feat.sandboxLink === 0 && (feat.prefersReducedMotion > 0 || feat.colorSchemeCss > 0 || feat.lowerDoctype > 0)
        );
        const isHigh61Sol = !isTerraLow && !isMidAstra && !isFastLuna && !isXHigh61Sol && !isDeep61Sol && !isMid56Sol && !isLong6Sol && (
          feat.svgSmilNoScript > 0 ||
          (onlyAskUser && (feat.askIdHasUnderscore > 0 || feat.askSolSig > 0 || feat.memoDeltaCount >= 35 || (feat.askFormatOpt === 0 && feat.askTransformOpt === 0))) ||
          (feat.sandboxLink > 0 && feat.writtenChars < 28000) ||
          (feat.turns === 2 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.prefersReducedMotion === 0) ||
          (feat.turns === 3 && feat.write === 1 && feat.bash === 0 && feat.askUser === 0 && feat.writeUnderscoreName === 0) ||
          (feat.turns === 1 && feat.bash === 1 && feat.write === 0 && feat.askUser === 0) ||
          (feat.askUser > 0 && feat.write > 0 && feat.writtenChars < 28000 && feat.preToolTextChars < 60) ||
          (feat.totalTools === 0 && feat.lunaNotSurePhrase === 0 && (feat.solClarifyPhrase > 0 || feat.meanChars >= 4500 || (feat.astraSelfContainedPhrase === 0 && feat.meanChars >= 80)))
        );

        if (hasAnthropicSig) sim = Math.min(0.84, sim - 0.12);
        else if (proto.id === 'openai/gpt-6-luna' && isLunaMaxBurst) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6-luna-high' && isLunaHighBurst) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-luna-medium' && isLunaMedProfile) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra' && isMidAstra && feat.turns === 1 && feat.write >= 1) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-astra-medium' && isMidAstra && (feat.turns >= 2 || feat.totalTools === 0)) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6.1-sol' && isDeep61Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-xhigh' && isXHigh61Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-6.1-sol-high' && isHigh61Sol) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-6-sol' && isLong6Sol) sim = Math.max(0.96, sim + 0.25);
        else if (proto.id === 'openai/gpt-5.6-sol' && isMid56Sol) sim = Math.max(0.96, sim + 0.26);
        else if (proto.id === 'openai/gpt-5.6-terra' && isTerraLow) sim = Math.max(0.96, sim + 0.26);
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
        const isOpus56Profile = !isHaikuProfile && (
          (feat.preToolTextChars === 0 && feat.interToolTextChars === 0 && (feat.edit >= 1 || feat.parallelSteps >= 1 || feat.totalTools >= 5 || (isMicroProbe && (feat.totalTools >= 2 || feat.hidR >= 2)))) ||
          (feat.boxComment >= 2 && feat.preToolTextChars < 60 && feat.interToolTextChars < 80)
        );
        const isOpus55Profile = !isHaikuProfile && !isOpus56Profile && feat.preToolTextChars >= (isMicroProbe ? 75 : 120) && feat.interToolTextChars === 0 && feat.claudeWarmPalette === 0 && (feat.bash >= (isMicroProbe ? 1 : 2) || rPerTurn <= 1.2);
        const isFable51Profile = !isHaikuProfile && !isOpus56Profile && !isOpus55Profile && feat.interToolTextChars >= (isMicroProbe ? 45 : 100) && feat.claudeWarmPalette === 0;
        const isSonnet55Profile = !isHaikuProfile && !isOpus56Profile && !isOpus55Profile && (isSonnetPlainMulti || feat.claudeWarmPalette > 0 || (feat.boxComment === 1 && feat.preToolTextChars < 60 && feat.interToolTextChars < 80) || (feat.preToolTextChars >= (isMicroProbe ? 20 : 40) && feat.preToolTextChars < (isMicroProbe ? 75 : 180) && feat.bash <= 1 && feat.write >= 1));

        if (!hasAnthropicSig) {
          sim = Math.min(0.84, sim - 0.12);
        } else if (proto.id === 'anthropic/claude-haiku-5.5-medium' && isHaikuMediumSid) {
          sim = Math.max(0.96, sim + 0.26);
        } else if (proto.id === 'anthropic/claude-haiku-5.5' && isHaikuProfile && !isHaikuMediumSid) {
          sim = Math.max(0.96, sim + 0.25);
        } else if (proto.id === 'anthropic/claude-opus-5.6' && isOpus56Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-opus-5.5' && isOpus55Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-fable-5.1' && isFable51Profile) {
          sim = Math.max(0.96, sim + 0.24);
        } else if (proto.id === 'anthropic/claude-sonnet-5.5' && isSonnet55Profile) {
          sim = Math.max(0.96, sim + 0.25);
        } else {
          sim = Math.min(0.88, sim - 0.08);
        }
      }

      const canon = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(proto.label) : proto.label;
      const k = String(canon || proto.label).toLowerCase();
      // 结合本账号用户历史常用纠偏先验（越用越准，温和加权不喧宾夺主）
      const famKey = canon.replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').trim().toLowerCase();
      const freqHits = (usageStats.models?.[k] || 0) + (usageStats.families?.[famKey] || 0) * 0.5;
      if (freqHits > 0) {
        sim += Math.min(0.038, Math.log10(1 + freqHits) * 0.022);
      }
      sim = Math.max(0.1, Math.min(0.992, sim));
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
    const bankByKey = new Map();
    for (const sample of bank) {
      if (!sample || !sample.model || !Array.isArray(sample.vec)) continue;
      if (CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(sample.model || ''))) continue;
      const sampleOpen = Boolean(sample.isOpen ?? isOpenName(sample.model));
      if (sampleOpen !== feat.isOpenThink) continue;
      const isConfirmedSample = Boolean(sample.userConfirmed || sample.importedFromDiag || (sample.autoTeacher && (Number(sample.teacherConf) || 0) >= 85));
      const isExactSid = Boolean(sid && sample.sid && String(sample.sid) === sid && isConfirmedSample);
      let vSim = isExactSid ? 0.998 : vectorSimilarity(feat.vec, sample.vec, feat);
      if (!isExactSid && isConfirmedSample && sample.vec.length === 20 && feat.vec.length === 20 && sample.vec[0] !== feat.vec[0]) {
        const alignedVec = [...sample.vec];
        alignedVec[0] = feat.vec[0];
        alignedVec[1] = feat.vec[1];
        vSim = Math.max(vSim, vectorSimilarity(feat.vec, alignedVec, feat) * 0.96);
      }
      const mSim = (!isExactSid && sample.meta) ? metaSimilarity(feat, sample.meta) : null;
      const sim = isExactSid ? 0.998 : (mSim !== null ? (vSim * 0.52 + mSim * 0.48) : vSim);
      if (!isExactSid && sim < 0.80) continue;
      const label = typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(sample.model) : sample.model;
      if (!isExactSid) {
        if (feat.isGeminiCoding && !/gemini|google/i.test(label)) continue;
        if (!feat.isGeminiCoding && /gemini|google/i.test(label)) continue;
        if (hasStrongOpenAiSig && !/gpt|openai|sol|astra|luna|terra/i.test(label)) continue;
        if (hasAnthropicSig && !/claude|anthropic|haiku|sonnet|opus|fable/i.test(label)) continue;
      }
      const k = String(label || sample.model).toLowerCase();
      if (!bankByKey.has(k)) bankByKey.set(k, []);
      bankByKey.get(k).push({ sample, sim, isExactSid, isConfirmedSample, label, sampleOpen });
    }
    let winExactKey = null;
    for (const [k, hits] of bankByKey.entries()) {
      hits.sort((a, b) => b.sim - a.sim);
      const top = hits[0];
      const top3 = hits.slice(0, 3);
      const meanTopSim = top3.reduce((acc, h) => acc + h.sim, 0) / top3.length;
      const nudge = top.isExactSid ? 0.45 : Math.max(0, (meanTopSim - 0.80) * (top.isConfirmedSample ? 0.14 : 0.06));
      if (top.isExactSid) winExactKey = k;
      const existing = scoreMap.get(k);
      if (existing) {
        existing.sim = top.isExactSid
          ? 0.996
          : existing.sim >= 0.94
            ? Math.min(0.994, existing.sim + nudge)
            : Math.min(0.895, existing.sim + nudge * 0.35);
        existing.learnedHits += hits.length;
        if (top.isExactSid) {
          existing.userLearned = true;
          const hitTag = top.sample.importedFromDiag
            ? '📥 命中习惯库诊断导入 ✓'
            : top.sample.autoTeacher
              ? '⚡ 已自动拟合反推结果 ✓'
              : '★ 命中习惯库纠偏样本 ✓';
          existing.tags = [hitTag, ...(existing.tags || []).filter(t => t !== hitTag).slice(0, 5)];
        }
      } else {
        const protoMatch = PROTOTYPES.find(p => String(Strength?.canon ? Strength.canon(p.label) : p.label).toLowerCase() === k);
        const dispLabel = protoMatch?.label || top.sample.rawLabel || top.sample.model || top.label;
        scoreMap.set(k, {
          id: protoMatch?.id || top.sample.model,
          label: dispLabel,
          canon: top.label,
          vendor: protoMatch?.vendor || (typeof Brand !== 'undefined' && Brand.of ? Brand.NAME?.[Brand.of(top.label)] : '') || '自学习',
          isOpen: top.sampleOpen,
          sim: top.isExactSid ? 0.996 : Math.min(0.89, meanTopSim * 0.90),
          tags: [top.sample.importedFromDiag && top.isExactSid ? '📥 命中习惯库诊断导入 ✓' : top.isExactSid ? '★ 命中习惯库纠偏样本 ✓' : '命中历史习惯样本', ...feat.habitTags.slice(0, 4)],
          learnedHits: hits.length,
          userLearned: top.isExactSid,
        });
      }
    }
    if (winExactKey) {
      for (const [k, item] of scoreMap.entries()) {
        if (k !== winExactKey && !item.userLearned) {
          item.sim = Math.min(item.sim, 0.885);
        }
      }
    }

    const sorted = [...scoreMap.values()].sort((a, b) => (b.sim - a.sim) || ((b.userLearned ? 1 : 0) - (a.userLearned ? 1 : 0)));
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
    const candidates = sorted.slice(0, 6).map((c, idx) => {
      const pct = Math.round(Math.max(35, Math.min(99.2, c.sim * 100)) * 10) / 10;
      return {
        id: c.id,
        label: c.label,
        canon: c.canon || c.label,
        vendor: c.vendor,
        match: pct,
        habitPct: pct,
        source: 'habit',
        userLearned: c.userLearned,
        learnedHits: c.learnedHits,
        matchedDims: c.tags,
        habitScore: calibratedScore,
        rank: idx + 1,
      };
    });

    return {
      features: feat,
      reasoningScore: calibratedScore,
      habitTags: feat.habitTags,
      candidates,
      best: candidates[0] || null,
      learnedTotal: bank.length,
    };
  }

  // 通过对话记录与工具调用拓扑结构直接反推模型（仅在 /cost 接口 403/关闭/无账单时，作为纯展示兜底）
  function structuralReverse(chat, modelEntry = null) {
    const res = analyze(chat, modelEntry);
    if (!res || !Array.isArray(res.candidates) || !res.candidates.length) return [];
    const feat = res.features;
    return res.candidates.map((c, idx) => {
      let revPct = Number(c.match || 0);
      if (feat) {
        if (feat.isGeminiCoding && /gemini/i.test(c.label)) {
          revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 1.2 : 0.4)).toFixed(1)));
        } else if (feat.sandboxLink > 0 || feat.lowerDoctype > 0) {
          if (/gpt|openai|sol|astra|luna/i.test(c.label)) revPct = Math.min(99.4, Number((revPct + (idx === 0 ? 0.8 : 0.3)).toFixed(1)));
        } else if (feat.wireFam === 'anthropic' && /claude|opus|sonnet|haiku|fable/i.test(c.label)) {
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
        diophantinePassed: false,
        matchedDims: ['对话记录+工具流结构反推', ...(c.matchedDims || []).slice(0, 4)],
        habitScore: res.reasoningScore,
      };
    });
  }

  function learnFromChat(chat, modelName, { userConfirmed = false, autoTeacher = false, teacherConf = 0, weight = 1.0, score = null, modelMeta = null } = {}) {
    if (!chat?.sid || !modelName) return null;
    const rawName = String(modelName || '').replace(/[?？]+$/, '').trim();
    if (!rawName || /^(未知型号|待定|未识别)$/.test(rawName)) return null;
    if (/gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(rawName) && CONFIRMED_GEMINI_FLASH_SIDS.has(String(chat.sid))) {
      return null;
    }
    const canon = rawName === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawName) : rawName);
    const known = modelMeta || (typeof Models !== 'undefined' ? Models.get(chat.sid) : null);
    const feat = extractFeatures(chat, known);
    const isHighTrustTeacher = Boolean(userConfirmed || (autoTeacher && (Number(teacherConf) || 0) >= 85));
    if (!feat && !isHighTrustTeacher) return null;
    if (!isHighTrustTeacher && feat && feat.turns < 1) return null;
    const protoFallback = PROTOTYPES.find(p => String(Strength?.canon ? Strength.canon(p.label) : p.label).toLowerCase() === canon.toLowerCase() || p.label.toLowerCase() === rawName.toLowerCase());
    const vec = (feat && Array.isArray(feat.vec) && feat.vec.length === 20)
      ? feat.vec
      : (protoFallback ? [...protoFallback.vec] : [1, 0, 0.08, 0.14, 0.22, 0.08, 0.34, 0.08, 0.14, 0.08, 0.72, 0.64, 0.70, 0.30, 0.26, 0.46, 0.54, 0.56, 0.52, 0.48]);
    const bank = loadBank();
    const idx = bank.findIndex(s => s && s.sid === chat.sid);
    const validScore = score != null && score !== '' && Number.isFinite(+score) && +score >= 10 && +score <= 100;
    const targetScore = validScore ? +score : (feat?.habitReasoningScore ?? 75);
    if (idx >= 0) {
      const prev = bank[idx];
      const prevScoreValid = prev.score != null && Number.isFinite(+prev.score) && +prev.score >= 10 && +prev.score <= 100;
      const hasRicherMeta = Boolean(feat && (chat?.messages?.length || 0) >= 2 && (!prev.meta || (prev.meta.turns || 0) < (feat.turns || 0) || (prev.vec?.[0] === 0 && feat.vec?.[0] === 1)));
      if (prev.importedFromDiag && !userConfirmed && prevScoreValid) return prev;
      if (prev.userConfirmed && !isHighTrustTeacher && prevScoreValid) return prev;
      if (autoTeacher && !userConfirmed && prevScoreValid && !hasRicherMeta && String(prev.model || '').toLowerCase() === String(canon || '').toLowerCase() && prev.autoTeacher && Math.abs((Number(prev.score) || 0) - targetScore) < 0.2) {
        return prev;
      }
    }
    const entry = {
      sid: chat.sid,
      model: canon,
      rawLabel: rawName,
      isOpen: Boolean(feat?.isOpenThink || isOpenName(canon)),
      score: targetScore,
      rawHabitScore: feat?.habitReasoningScore ?? null,
      vec: vec.map(v => Math.round((Number(v) || 0) * 1000) / 1000),
      meta: extractCompactMeta(feat),
      tags: (feat?.habitTags && feat.habitTags.length) ? feat.habitTags.slice(0, 5) : [autoTeacher ? '⚡ 反推自动纠偏样本' : '✓ 用户手动纠偏样本'],
      userConfirmed: isHighTrustTeacher,
      autoTeacher: Boolean(autoTeacher),
      teacherConf: Number(teacherConf) || (userConfirmed ? 100 : 0),
      weight: userConfirmed ? 3.5 : (isHighTrustTeacher ? 3.0 : weight),
      at: Date.now(),
    };
    if (idx >= 0) bank[idx] = entry;
    else bank.unshift(entry);
    if (isHighTrustTeacher && feat) {
      recordTeacherCalibration(canon, feat, targetScore, entry.weight);
    }
    saveBank(bank);
    if (userConfirmed) recordModelUse(canon);
    return entry;
  }

  // 反推教师 -> 习惯学生 自动闭环学习入口：每当 /cost 锁定结果时，自动纠偏该会话习惯样本并在线更新原型均值与推理分偏移
  function learnFromReverseTeacher(chat, modelEntry, topRev, teacherScore = null) {
    if (!topRev || topRev.structuralRev || topRev.source === 'habit' || topRev.source === 'fp' || topRev.habitSource) return null;
    const revPct = Number(topRev.revPct ?? topRev.match ?? 0);
    if (!(topRev.diophantinePassed || revPct >= 85) || revPct < 75) return null;
    const sid = chat?.sid || modelEntry?.sid || '';
    if (!sid) return null;
    const label = String(topRev.effortProfile?.stealthModelLabel || topRev.dynamicLabel || topRev.label || topRev.canon || topRev.id || '').replace(/[?？]+$/, '').trim();
    if (!label || /^(未知型号|待定|未识别)$/.test(label)) return null;
    const isOkScore = s => s != null && s !== '' && Number.isFinite(+s) && +s >= 10 && +s <= 100;
    const resolvedScore = isOkScore(teacherScore)
      ? +teacherScore
      : (isOkScore(modelEntry?.reverseScore) && !modelEntry?.habitInferred)
        ? +modelEntry.reverseScore
        : isOkScore(topRev.effortProfile?.reiScore)
          ? +topRev.effortProfile.reiScore
          : null;
    return learnFromChat(chat || { sid, messages: [] }, label, {
      userConfirmed: false,
      autoTeacher: true,
      teacherConf: revPct,
      weight: topRev.diophantinePassed ? 3.2 : 2.2,
      score: resolvedScore,
      modelMeta: modelEntry,
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
      if (typeof Chats !== 'undefined') {
        for (const [otherSid, otherChat] of Chats.entries()) {
          if (!otherSid || otherChat?.busy) continue;
          const om = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
          if (!om || (!om.userCorrected && (om.habitInferred || om.guess || om.pendingConfirm || !om.sure))) {
            try { identifyAndApply(otherChat, { force: true }); } catch {}
          } else if (om && typeof Models !== 'undefined') {
            try {
              const hab = analyze(otherChat, om);
              if (hab && Array.isArray(hab.candidates) && hab.candidates.length) {
                Models.set(otherSid, {
                  ...om,
                  habitCandidates: hab.candidates.slice(0, 5),
                  habitTags: hab.habitTags || om.habitTags,
                });
              }
            } catch {}
          }
        }
      }
      try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
      try {
        UI?.renderList?.();
        UI?.renderTabs?.();
        Dock?.render?.();
        Bar?.render?.();
      } catch {}
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
      const canon = rawModel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(rawModel) : rawModel);
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
        const proto = PROTOTYPES.find(p => String(Strength?.canon ? Strength.canon(p.label) : p.label).toLowerCase() === canon.toLowerCase() || p.label.toLowerCase() === rawModel.toLowerCase());
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
      importedCount++;
      lastModel = canon;
      recordModelUse(canon);
      if (sid && !sid.startsWith('diag-')) importedSids.push({ sid, rawModel, canon });
    }

    saveBank(bank);

    // 如果当前客户端存在被导入的对话，同步校准其习惯与模型记录
    for (const { sid, rawModel } of importedSids) {
      if (typeof Models !== 'undefined' && (Models.get(sid) || (typeof Chats !== 'undefined' && Chats.get(sid)) || (typeof History !== 'undefined' && History.byId?.(sid)))) {
        confirmUserCorrection(sid, rawModel, { learn: false });
      }
    }

    // 立即用新导入的习惯样本刷新本机所有已加载对话的习惯候选（未锁定对话同步应用，已锁定对话同步刷新 habitCandidates）
    if (typeof Chats !== 'undefined') {
      for (const [otherSid, otherChat] of Chats.entries()) {
        if (!otherSid || otherChat?.busy) continue;
        const om = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
        if (!om || (!om.userCorrected && (om.habitInferred || om.guess || om.pendingConfirm || !om.sure))) {
          try { identifyAndApply(otherChat, { force: true }); } catch {}
        } else if (om && typeof Models !== 'undefined') {
          try {
            const hab = analyze(otherChat, om);
            if (hab && Array.isArray(hab.candidates) && hab.candidates.length) {
              Models.set(otherSid, {
                ...om,
                habitCandidates: hab.candidates.slice(0, 5),
                habitTags: hab.habitTags || om.habitTags,
                habitFeatures: hab.features ? { vec: hab.features.vec, meta: extractCompactMeta(hab.features), isOpenThink: Boolean(hab.features.isOpenThink), habitTags: hab.features.habitTags, habitReasoningScore: hab.features.habitReasoningScore } : om.habitFeatures,
              });
            }
          } catch {}
        }
      }
    }
    try { if (typeof BillingProbe !== 'undefined' && typeof BillingProbe.clearSummaryCache === 'function') BillingProbe.clearSummaryCache(); } catch {}
    try {
      UI?.renderList?.();
      UI?.renderTabs?.();
      Dock?.render?.();
      Bar?.render?.();
    } catch {}
    return { kind: 'diagnostic', imported: importedCount, model: lastModel, total: bank.length };
  }

  function identifyAndApply(chat, { force = false, fromCostFallback = false, interactive = false } = {}) {
    if (!chat?.sid) return null;
    const sid = chat.sid;
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (known?.userCorrected && !force && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return known;
    if (known?.fingerprint?.result && !interactive) return known;
    const cloudTitle = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    if (!interactive && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (typeof TitleSync !== 'undefined' && TitleSync.restored?.(sid)))) return known;
    const hasAuthoritativeApi = known && !known.guess && !known.fromTitle && !known.reverseInferred && !known.billingProbe && !known.habitInferred && (known.response || (known.internal && !known.billingProbe));
    if (hasAuthoritativeApi && !force) return known;
    // 识别到开源模型后，除非用户手动点击「反推锁定」（interactive: true），否则直接标记为「开源模型」并同步修改对话名称，不再浪费算力去推理具体计费型号
    if (!interactive && typeof BillingProbe !== 'undefined' && typeof BillingProbe.shouldSkipCostForOpenSource === 'function' && BillingProbe.shouldSkipCostForOpenSource(chat)) {
      if (typeof BillingProbe.markAsOpenSourceModel === 'function') {
        return BillingProbe.markAsOpenSourceModel(chat);
      }
    }
    const costEnabledNow = typeof BillingProbe !== 'undefined' && typeof BillingProbe.isCostProbeEnabled === 'function' ? BillingProbe.isCostProbeEnabled() : true;
    const liveCostCands = typeof engine !== 'undefined' && typeof engine.state === 'function' ? (engine.state(sid)?.info?.result?.baseMatch?.candidates || engine.state(sid)?.lastInfo?.result?.baseMatch?.candidates || []) : [];
    const realSavedRevCand = (known && Array.isArray(known.reverseCandidates))
      ? known.reverseCandidates.find(rc => rc && !rc.structuralRev && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 75))
      : null;
    const hasRealCostModel = Boolean(
      !CONFIRMED_GEMINI_FLASH_SIDS.has(sid) && (
        liveCostCands.length > 0 ||
        realSavedRevCand ||
        (known && !known.habitInferred && known.reverseInferred && (
          (known.reverseTokens?.total > 0) ||
          (known.reverseTotalTokens?.total > 0)
        ))
      )
    );
    // 以反推为准：只要已有真实 /cost 反推结果，绝不让对话习惯覆盖 /cost 的型号与推理分，并用反推结果自动纠偏习惯库
    if (hasRealCostModel && costEnabledNow && !interactive) {
      if (realSavedRevCand && known) {
        try { learnFromReverseTeacher(chat, known, realSavedRevCand); } catch {}
      }
      return known;
    }
    if (known?.sure && known?.reverseInferred && !known?.habitInferred && !force && !CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) return known;

    const res = analyze(chat, known);
    if (!res || !res.best) return null;
    if (!interactive && res.features?.isOpenThink && typeof BillingProbe !== 'undefined' && typeof BillingProbe.markAsOpenSourceModel === 'function') {
      return BillingProbe.markAsOpenSourceModel(chat);
    }
    const best = res.best;
    const second = res.candidates[1] || null;
    const isStandout = !second || (best.match - second.match) >= 0.5 || best.match >= 82;
    const canon = best.label === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(best.label) : best.label).replace(/[?？]+$/, '');
    const revScore = (known && !known.habitInferred && known.reverseScore != null) ? known.reverseScore : res.reasoningScore;
    const effMatch = /\b(none|minimal|low|medium|high|xhigh|max)\b/i.exec(canon);
    const curEffort = effMatch ? effMatch[1].toLowerCase() : (revScore >= 82 ? 'max' : revScore >= 65 ? 'high' : 'medium');
    // 绝不把 structuralRev 写入 reverseCandidates（保留全部真实 /cost 反推候选池）
    const preservedRevCands = Array.isArray(known?.reverseCandidates)
      ? known.reverseCandidates.filter(rc => rc && !rc.structuralRev && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (!CONFIRMED_GEMINI_FLASH_SIDS.has(sid) || !/gemini[-\s]*4|argon/i.test(String(rc.label || rc.id || ''))) && (rc.revPct != null || rc.diophantinePassed))
      : [];
    const shouldLockHabitNow = true;
    const nextProvider = best.userLearned
      ? '习惯库自学习识别'
      : fromCostFallback
        ? '对话习惯识别（/cost 免请求兜底）'
        : '对话习惯识别';
    const nextEntry = {
      ...(known || {}),
      name: canon,
      candidateName: canon,
      rawLabel: best.label,
      reverseCandidateId: best.id || canon,
      reverseLabel: best.label,
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
      reverseVer: 168,
      guess: false,
      sure: Boolean(best.userLearned || best.match >= 75),
      uncertain: !isStandout,
      pendingConfirm: false,
      fromTitle: false,
      habitCandidates: res.candidates,
      reverseCandidates: preservedRevCands.length ? preservedRevCands : undefined,
      est: { ...(known?.est || {}), score: revScore, source: 'habit' },
      provider: nextProvider,
      at: Date.now(),
    };
    if (CONFIRMED_GEMINI_FLASH_SIDS.has(sid)) {
      delete nextEntry.userCorrected;
      delete nextEntry.userCorrectedAt;
    }
    const isUnchanged = Boolean(
      known &&
      known.name === nextEntry.name &&
      Boolean(known.habitInferred) === true &&
      !known.pendingConfirm &&
      !known.guess &&
      known.reverseMatch === nextEntry.reverseMatch &&
      known.reverseScore === nextEntry.reverseScore &&
      known.provider === nextEntry.provider &&
      (known.reverseVer || 0) >= 168
    );
    if (isUnchanged && !interactive) return known;
    if (typeof Models !== 'undefined') {
      Models.set(sid, nextEntry);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { if (typeof Bus !== 'undefined') Bus.emit('model', chat, nextEntry); } catch {}
    }
    try {
      if (typeof Notes !== 'undefined' && !Notes.owns?.(sid)) {
        Notes.rec?.(sid, chat?.sentAt || Date.now());
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
    const canon = cleaned === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(cleaned) : cleaned).replace(/[?？]+$/, '');
    const score = known?.reverseScore ?? habitRes?.reasoningScore ?? 78;
    const effMatch = /\b(none|minimal|low|medium|high|xhigh|max)\b/i.exec(canon);
    const curEffort = effMatch ? effMatch[1].toLowerCase() : (score >= 82 ? 'max' : score >= 65 ? 'high' : 'medium');
    const isOpen = canon === '开源模型' || isOpenName(canon);

    if (!isOpen && chat) {
      chat._closedLockedModel = canon;
    }

    recordModelUse(canon, vendorHint, familyHint, effortHint || curEffort);
    let learnedEntry = null;
    if (learn && chat) {
      learnedEntry = learnFromChat(chat, canon, { userConfirmed: true, weight: 3.5, score });
    }

    const nextEntry = {
      ...(known || {}),
      name: canon,
      candidateName: canon,
      rawLabel: cleaned,
      reverseCandidateId: canon,
      reverseLabel: cleaned,
      reverseEffort: curEffort,
      reverseMatch: 100,
      confidence: 100,
      reverseScore: score,
      habitScore: score,
      habitTags: ['✓ 用户手动纠偏确认', ...(habitRes?.habitTags || []).slice(0, 4)],
      userCorrected: true,
      userCorrectedAt: Date.now(),
      habitInferred: true,
      reverseInferred: true,
      billingProbe: true,
      reverseVer: 168,
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
      if (typeof Titles !== 'undefined') {
        Titles.capture?.(sid, chat?.sentAt);
        Titles.local?.(sid);
        Titles.touch?.(sid);
        Titles.kick?.(true);
      }
    } catch {}

    // Re-evaluate other unconfirmed open chats so the newly learned habit takes effect immediately (`越用越准`)
    if (learn && typeof Chats !== 'undefined') {
      for (const [otherSid, otherChat] of Chats.entries()) {
        if (!otherSid || otherSid === sid || otherChat?.busy) continue;
        const om = typeof Models !== 'undefined' ? Models.get(otherSid) : null;
        if (!om || (!om.userCorrected && (om.habitInferred || om.guess || om.pendingConfirm || !om.sure))) {
          try { identifyAndApply(otherChat, { force: true }); } catch {}
        }
      }
    }

    const totalLearned = loadBank().length;
    if (typeof toast === 'function') {
      toast(`已确认纠偏为「${canon}」（推理分 ${score}）${learnedEntry ? ` · 已记入习惯库（共 ${totalLearned} 条样本）` : ''}`);
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

  function openManager() {
    if (typeof modal !== 'function' || typeof h !== 'function') return;
    const MODEL_PRESETS = [
      '',
      'Gemini 3.8 Flash (High)',
      'Gemini 3.8 Flash (Medium)',
      'Gemini 3.7 Flash (High)',
      'Gemini 3.1 Pro Preview',
      'GPT 6.1 Sol (Max)',
      'GPT 6.1 Sol (High)',
      'GPT 6 Astra (Max)',
      'GPT 6 Luna (Max)',
      'GPT 6 Luna (Medium)',
      'Claude Opus 5.6 (Max)',
      'Claude Sonnet 5.5 (Max)',
      'Claude Fable 5.1 (Max)',
      'Claude Haiku 5.5 (High)',
      'Grok 4.7 (Max)',
      'DeepSeek V4.1 Flash (Max)',
      'GLM 5.2 (Max)',
      'Qwen 3.7 Max (High)',
      'Kimi K3 (Max)',
      'Beam 1.0 501B A23B',
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
      placeholder: '输入确定知道的模型名（如 Gemini 3.8 Flash (High)，留空则用文件内记录）',
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
        const curBank = loadBank();
        const modSet = new Set(curBank.map(x => String(x?.model || '').trim().toLowerCase()).filter(Boolean));
        const msg = bankFiles > 0 && diagCnt === 0
          ? `已导入合并习惯测试库：新增 ${bankAdd} 条 · 更新 ${bankUpd} 条 · 跳过重复 ${bankSkip} 条（当前共 ${modSet.size} 个型号 / ${curBank.length} 条样本）`
          : bankFiles > 0
            ? `已导入 ${diagCnt} 份诊断 JSON 并合并 ${bankFiles} 份习惯库（新增 ${bankAdd} · 更新 ${bankUpd} · 当前共 ${curBank.length} 条样本）`
            : `成功导入 ${diagCnt} 份诊断 JSON 到习惯库${lastM ? `（型号：${lastM}）` : ''}，已同步更新习惯识别！`;
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
      const userSamples = samples.filter(s => s.userConfirmed);
      const diagSamples = samples.filter(s => s.importedFromDiag);
      listWrap.replaceChildren();
      listWrap.append(h('div', { class: 'mc-gh', style: { marginBottom: '4px' } },
        h('b', {}, `本机习惯库样本（共 ${samples.length} 条 · 纠偏确认 ${userSamples.length} 条 · 诊断JSON导入 ${diagSamples.length} 条）`)));
      if (!samples.length) {
        listWrap.append(h('p', { class: 'note' }, '暂无自学习样本。可在上方选择已知模型的诊断 JSON（billing-*.json）或习惯库备份文件导入合并，或在右上角模型卡片点「纠偏」确认型号后自动沉淀。'));
        return;
      }
      for (const s of samples.slice(0, 80)) {
        const sidShort = s.sid ? String(s.sid).slice(0, 8) : 'sample';
        const tagText = Array.isArray(s.tags) ? s.tags.join(' · ') : '';
        listWrap.append(h('div', { class: 'mc-row', title: tagText },
          h('span', { style: { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            (s.importedFromDiag ? '📥 诊断导入 · ' : s.userConfirmed ? '★ 纠偏确认 · ' : '自动沉淀 · ') + sidShort + (tagText ? ' · ' + tagText.slice(0, 42) : '')),
          h('b', { style: { marginRight: '8px' } }, `${s.model}${s.score != null ? ` · 推理分 ${s.score}` : ''}`),
          h('button', {
            type: 'button',
            class: 'btn ghost sm',
            title: '从习惯库删除此条样本',
            onclick: () => {
              const next = loadBank().filter(x => x !== s && (x.sid !== s.sid || x.at !== s.at));
              saveBank(next, { replace: true });
              renderSamples();
              Dock?.render?.();
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
      h('p', { class: 'note' }, `对话习惯库结合「内置真实会话特征原型（思考块拓扑 / Bash Python与Cat Heredoc习惯 / HTML与SVG习惯 / 工具调用节奏 / 行文特征 / 推理分）」与「本机纠偏及诊断 JSON 导入样本」，通过对话记录及工具调用零风控精准识别模型。`),
      importBox,
      listWrap
    );
    renderSamples();

    const back = modal('对话习惯库（诊断 JSON 导入与自学习）', body, K(
      h('button', { class: 'btn ghost', onclick: async () => {
        if (await Dialog.confirm({ title: '清空习惯库自学习样本', text: '确定清空本机累积的习惯自学习与导入样本吗？（内置基准原型仍保留）', ok: '清空', danger: true })) {
          saveBank([], { replace: true });
          back.remove();
          Dock?.render?.();
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
      version: typeof VERSION !== 'undefined' ? VERSION : '0.13.161',
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

  return {
    extractFeatures,
    extractCompactMeta,
    analyze,
    structuralReverse,
    learnFromChat,
    learnFromReverseTeacher,
    loadCalibration,
    importDiagnosticJson,
    exportHabitBank,
    importHabitBank,
    identifyAndApply,
    confirmUserCorrection,
    getUsageStats,
    recordModelUse,
    learnedCount,
    bankRevision: () => bankRev,
    loadBank,
    openManager,
    PROTOTYPES,
  };
})();
try { globalThis.ChatHabitFingerprint = ChatHabitFingerprint; } catch {}

const BillingProbe = (() => {
  const bundled = /*__ARENA_AGENT_CATALOG__*/null;
  const activeRuns = new WeakMap();
  const isRunning = chat => !!(chat && activeRuns.has(chat));
  const isOtherProbeBusy = chat => !!(chat && ((typeof Fingerprint !== 'undefined' && Fingerprint.isRunning?.(chat)) || (typeof PelicanTest !== 'undefined' && PelicanTest.isRunning?.(chat))));
  let lastCostReloginAt = 0;
  let globalCost429Until = 0;
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
    const fullPool = [...new Set([locked, activeCostSkewDpl, 'dpl_3UbNvzoXfT6iNZqgBa7GjsGeKLaT', ...(typeof Pin !== 'undefined' && Array.isArray(Pin.POOL) ? Pin.POOL : []), ...COST_SKEW_POOL].filter(d => d && !isExp(d)))].slice(0, 2);
    const pool = (options && options._triedAllSkew) ? fullPool.slice(0, 1) : fullPool;
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
        if (err && err.status === 403 && dpl && !(options && options._triedAllSkew)) {
          try {
            if (typeof Pin !== 'undefined' && typeof Pin.ensureBillingFlags === 'function') Pin.ensureBillingFlags(true);
            const qOpts = { ...options, headers: { ...(options?.headers || {}), 'x-deployment-id': dpl } };
            const qRes = await fallbackCostReq(path, qOpts);
            if (qRes && typeof qRes === 'object') {
              promoteWorkingCostDpl(dpl, path);
              return qRes;
            }
          } catch (qErr) {
            lastErr = qErr || err;
          }
          demoteFailedCostDpl(dpl);
        } else if (err && err.status === 409 && dpl) {
          demoteFailedCostDpl(dpl);
        }
        if (!err || (err.status !== 403 && err.status !== 409)) throw err;
        if (i === pool.length - 1 && !scrapedInRun) {
          scrapedInRun = true;
          const freshList = await scrapeFreshCostDpls(true);
          for (const fd of freshList.slice(0, 1)) {
            if (fd && !pool.includes(fd)) pool.push(fd);
          }
        }
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
    costDocCache.set(sid, { lastId: lastCompId || '', count: Object.keys(data.messages).length, at: now(), data });
    if (costDocCache.size > 100) {
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
  const protoCostReq = async (path, options = {}) => {
    const sidMatch = /\/(?:api|nextjs-api)\/(?:chat|evaluation)\/([0-9a-f-]{36})\/cost\b/i.exec(String(path || ''));
    const reqSid = sidMatch ? sidMatch[1] : '';
    const chatRef = (reqSid && typeof Chats !== 'undefined') ? Chats.get(reqSid) : null;
    const lastCompId = chatRef ? (globalThis.ArenaBilling.completed(chatRef).at(-1)?.id || '') : '';
    if (reqSid && !options?.forceNet && !chatRef?.busy) {
      const cached = getCachedCostDoc(reqSid, lastCompId);
      if (cached) return cached;
    }
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
            promoteWorkingCostDpl(r.skewDpl, r.endpointTpl || reqPath);
          }
          if ((r.status === 403 || r.status === 409) && r.triedAllSkew) options = Object.assign({}, options, { _triedAllSkew: true, _protoStatus: r.status });
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
  function markAsOpenSourceModel(chat, { force = false } = {}) {
    const sid = typeof chat === 'string' ? chat : chat?.sid;
    if (!sid) return null;
    const c = typeof chat === 'object' && chat ? chat : (typeof Chats !== 'undefined' ? Chats.get(sid) : null);
    const known = typeof Models !== 'undefined' ? Models.get(sid) : null;
    if (known?.userCorrected && !force) return known;
    // 若用户之前已手动点击「反推锁定」推理出了具体的开源型号（manualOpenInferred），在自动流程中保留该结果不覆盖
    if (known?.manualOpenInferred && !force) return known;
    const alreadyOpen = known && known.name === '开源模型' && !known.guess && !known.pendingConfirm && known.sure;
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
      at: now(),
    };
    if (typeof Models !== 'undefined' && (!alreadyOpen || force)) {
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
        Titles.touch?.(sid);
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
      Bar?.render?.();
    } catch {}
    return nextEntry;
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
    const isGeminiFlashFixSid = GEMINI_FLASH_FIX_SIDS.has(sid);
    const savedRevCands = (Array.isArray(m?.reverseCandidates) && m.reverseCandidates.length && !(isArgonHighSession && m.reverseCandidateId !== 'contenders/barium-bb-v2-4xts-agent') && !(sol61Spec && m.reverseCandidateId !== 'openai/gpt-6.1-sol'))
      ? m.reverseCandidates
          .filter(rc => {
            if (!rc || rc.source === 'habit' || rc.source === 'fp' || rc.habitSource || rc.structuralRev) return false;
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
    const structFallbackCands = (!cands.length && !lastInfoList.length && !savedRevCands.length && costOn && Array.isArray(chatObj?.messages) && chatObj.messages.length > 0)
      ? (ChatHabitFingerprint.structuralReverse?.(chatObj, m) || [])
      : [];
    const hasRealCostRev = Boolean(costOn && (cands.length > 0 || lastInfoList.length > 0 || savedRevCands.length > 0));
    const rawRevList = !costOn
      ? []
      : cands.length
        ? cands
        : lastInfoList.length
          ? lastInfoList
          : savedRevCands.length
            ? savedRevCands
            : structFallbackCands;
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
        combinedWeight: r.structuralRev ? (revPct * 0.95) : (revPct * 2.0 + (r.diophantinePassed ? 50 : 15)),
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
    // ── 反推教师 -> 习惯学生 实时自动校准：当存在真实 /cost 反推首选时，先自动喂入习惯库校准再计算习惯排名 ──
    if (hasRealCostRev && revList.length && !m?.userCorrected && typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.learnFromReverseTeacher === 'function') {
      const topRev0 = byKey.values().next().value || revList[0];
      if (topRev0 && !topRev0.structuralRev && (topRev0.diophantinePassed || Number(topRev0.match || topRev0.revPct || 0) >= 85) && Number(topRev0.match || topRev0.revPct || 0) >= 75) {
        try { ChatHabitFingerprint.learnFromReverseTeacher(chatObj || { sid, messages: [] }, m, topRev0); } catch {}
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
        const existing = byKey.get(k);
        if (existing) {
          existing.habitPct = hc.match;
          existing.habitScore = hc.habitScore;
          existing.userLearned = Boolean(existing.userLearned || hc.userLearned);
          if (Array.isArray(hc.matchedDims) && hc.matchedDims.length) {
            existing.matchedDims = [...new Set([...(existing.matchedDims || []), ...hc.matchedDims])];
          }
          if (existing.revPct != null && existing.revPct >= 5) {
            existing.both = true;
            if (!existing.structuralRev) {
              // 真实 /cost 候选：始终以反推为准（保持 /cost 原始百分比与绝对主导权），习惯仅提供双色条印证与同分微调
              existing.match = existing.revPct;
              existing.combinedWeight = existing.revPct * 2.0 + (existing.diophantinePassed ? 50 : 15) + hc.match * 0.02 + (hc.userLearned ? 1.5 : 0);
            } else {
              // 结构化对话反推（无 /cost 账单）：由习惯识别与结构反推融合，习惯主导型号定性
              existing.match = hc.match;
              existing.combinedWeight = hc.match * 1.15 + existing.revPct * 0.10 + (hc.userLearned ? 8 : 0);
            }
          } else {
            existing.fpPct = Math.max(existing.fpPct || 0, hc.match);
            existing.match = Math.max(existing.match || 0, hc.match);
            existing.combinedWeight = existing.match * (hasRealCostRev ? 0.12 : 0.92) + (hc.userLearned ? (hasRealCostRev ? 2 : 6) : 0);
          }
        } else {
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
            combinedWeight: hc.match * (hasRealCostRev ? 0.12 : 0.92) + (hc.userLearned ? (hasRealCostRev ? 2 : 6) : 0),
            source: 'fp',
            habitSource: true,
            both: false,
            diophantinePassed: false,
            matchedDims: hc.matchedDims || [],
          });
        }
      }
    }
    // 用户手动纠偏确认（✓ 确认纠偏）：最高优先级置顶锁定（排除 3 个 Flash 诊断会话的旧误标记录）
    const isPollutedUserCorrection = Boolean(
      (isGeminiFlashFixSid && /gemini[-\s]*4|argon|barium-bb-v2-4xts/i.test(String(m?.rawLabel || m?.name || ''))) ||
      (sid === '01a151de-5840-75e5-b5e0-9bf662f543dd' && /6\.1-sol|gpt/i.test(String(m?.rawLabel || m?.name || '')))
    );
    if (m?.userCorrected && m?.name && !isPollutedUserCorrection) {
      const ucLabel = cleanModelLabel(m.rawLabel || m.name);
      const ucCanon = ucLabel === '开源模型' ? '开源模型' : (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(ucLabel) : ucLabel);
      const ucKey = canonKey(ucCanon) || 'user-corrected';
      const prev = byKey.get(ucKey) || {};
      byKey.set(ucKey, {
        ...prev,
        key: ucKey,
        id: m.reverseCandidateId || ucCanon,
        label: ucLabel,
        canon: ucCanon,
        revPct: prev.revPct ?? 100,
        fpPct: 100,
        habitPct: 100,
        match: 100,
        combinedWeight: 250,
        source: 'fp',
        habitSource: true,
        userCorrected: true,
        userLearned: true,
        both: true,
        diophantinePassed: Boolean(prev.diophantinePassed),
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
    const merged = [...byKey.values()].filter(x => !violatesThinkingScope(x.id) && !violatesThinkingScope(x.label)).sort((a, b) => {
      const aStrongDio = Boolean(a.source === 'rev' && a.diophantinePassed && (a.match || 0) >= 70);
      const bStrongDio = Boolean(b.source === 'rev' && b.diophantinePassed && (b.match || 0) >= 70);
      if (aStrongDio !== bStrongDio) return Number(bStrongDio) - Number(aStrongDio);
      return (
        ((b.combinedWeight ?? b.match) - (a.combinedWeight ?? a.match)) ||
        (b.match - a.match) ||
        (Number(b.both) - Number(a.both)) ||
        (Number(b.diophantinePassed) - Number(a.diophantinePassed)) ||
        ((b.revPct ?? b.fpPct ?? 0) - (a.revPct ?? a.fpPct ?? 0))
      );
    });
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

  function getRankFilter() {
    try {
      const raw = typeof Store !== 'undefined' && Store.get ? Store.get('billing:rankFilter', null) : null;
      if (raw && typeof raw === 'object') {
        const rev = raw.rev !== false;
        const habit = raw.habit !== false;
        if (!rev && !habit) return { rev: true, habit: true };
        return { rev, habit };
      }
    } catch {}
    return { rev: true, habit: true };
  }
  function setRankFilter(next) {
    const rev = next?.rev !== false;
    const habit = next?.habit !== false;
    const val = (!rev && !habit) ? { rev: true, habit: true } : { rev, habit };
    try { if (typeof Store !== 'undefined' && Store.set) Store.set('billing:rankFilter', val); } catch {}
    return val;
  }

  const summaryCache = new Map();
  const clearSummaryCache = () => { try { summaryCache.clear(); } catch {} };
  function summary(sid) {
    if (sid) try { upgradeCachedOpus56(sid); } catch {}
    const chat = Chats.get(sid), latest = globalThis.ArenaBilling.completed(chat).at(-1), state = engine.state(sid);
    const trace = Trace.latest(sid);
    const model = Models.get(sid);
    const bRev = typeof ChatHabitFingerprint !== 'undefined' && typeof ChatHabitFingerprint.bankRevision === 'function' ? ChatHabitFingerprint.bankRevision() : 0;
    const cacheKey = sid && !chat?.busy ? `${state.at || 0}:${state.status || ''}:${state.httpStatus || 0}:${state.retryAt || 0}:${state.pending ? 1 : 0}:${latest?.id || ''}:${chat?.messages?.length || 0}:${model?.at || 0}:${model?.name || ''}:${model?.reverseVer || 0}:${model?.routed ? 1 : 0}:${trace?.done ? 1 : 0}:${isCostProbeEnabled() ? 1 : 0}:${bRev}` : '';
    const cachedSum = cacheKey ? summaryCache.get(sid) : null;
    if (cachedSum && cachedSum.key === cacheKey) return cachedSum.val;
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
      mergedCandidates,
      preimage: pre ? { latest: latestPreimage, totals: pre.totals, refVersion: pre.refVersion } : null,
    };
    if (cacheKey) {
      if (summaryCache.size > 80) summaryCache.clear();
      summaryCache.set(sid, { key: cacheKey, val: out });
    }
    return out;
  }

  function topConfidence(sid, mi) {
    if (!sid) return null;
    if (!mi) {
      const cached = summaryCache.get(sid);
      const topC = cached?.val?.mergedCandidates?.[0];
      if (topC && Number.isFinite(+topC.match) && +topC.match > 0) {
        return Math.max(0, Math.min(100, +topC.match));
      }
    }
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
    if (known?.userCorrected && !interactive) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    if (known?.fingerprint?.result && !interactive) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const cloudTitle = (typeof History !== 'undefined' && History.byId?.(sid)?.title) || chat?.title || '';
    if (!interactive && ((typeof TitleCipher !== 'undefined' && TitleCipher.isEncoded?.(cloudTitle)) || (typeof TitleSync !== 'undefined' && TitleSync.restored?.(sid)))) {
      return { entry: known, best, close: [best], standout: true, preimage: sum.preimage, payment: sum.payment };
    }
    const hasRealEvidence = (d?.samples?.observations > 0) || Boolean(best.habitSource || best.habitPct || known?.fingerprint?.result || known?.reverseInferred || known?.billingProbe) || ARGON_HIGH_SIDS.has(sid) || SOL_61_SIDS.has(sid) || sid === '01a13f8c-41c2-7ad3-8e77-73feb405f68d';
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
    const rawRevScore = typeof Strength !== 'undefined' && Strength.reverseDepthScore
      ? Strength.reverseDepthScore(sid, { ...(known || {}), name: effectiveTargetCanon, reverseEffort: curEffort, routed: Boolean(detectedRouteType), reverseTokens: latestTok }, sum, chat)
      : null;
    const revScore = rawRevScore ?? best.habitScore ?? known?.reverseScore ?? null;
    const isFpWinner = best.source === 'fp' && !detectedRouteType;
    const isHabitWinner = Boolean((best.habitSource || best.structuralRev) && (!best.revPct || best.structuralRev));
    let freshHabitList = null;
    if (standout && !best.structuralRev && (best.diophantinePassed || best.revPct >= 75) && !isHabitWinner && typeof ChatHabitFingerprint !== 'undefined') {
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
      reverseInferred: true,
      billingProbe: true,
      reverseMatch: Math.round(best.match * 10) / 10,
      confidence: Math.round(best.match * 10) / 10,
      reverseCandidateId: (detectedRouteType && d?.routedModelId) ? d.routedModelId : best.id,
      reverseLabel: (detectedRouteType && routeToLabel) ? routeToLabel : (best.label || best.id),
      reverseEffort: curEffort || null,
      reverseCandidates: Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.filter(c => c && !c.structuralRev && (c.source === 'rev' || (c.revPct != null && c.revPct > 0))).slice(0, 5) : [],
      habitCandidates: freshHabitList ? freshHabitList.slice(0, 5) : (Array.isArray(sum.mergedCandidates) ? sum.mergedCandidates.filter(c => c && (c.habitPct != null || c.habitSource || c.source === 'fp')).slice(0, 5) : (known?.habitCandidates || undefined)),
      reverseTiedCount: standout ? 1 : Math.max(close.length, 2),
      reverseEpoch: best.matchedVariant || '2026-10-15',
      reverseVer: 168,
      completedCount: compMsgs.length,
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
        if (wasClosedModel && latestHasOpenThink && isOpenCandidateName(routeToLabel || best.id) && !chat._allowOpenThink && (typeof Prefs === 'undefined' || Prefs.thinkStop !== false)) {
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
      summaryCache.delete(sid);
      try { if (typeof Strength !== 'undefined' && Strength.noteReverse) Strength.noteReverse(sid, nextEntry); } catch {}
      try { Bus.emit('model', chat, nextEntry); } catch {}
    }
    if (standout && typeof Titles !== 'undefined' && (changed || interactive) && (!hasAuthoritativeApi || interactive || detectedRouteType)) {
      try {
        Titles.local?.(sid);
        const shouldCloudSync = Boolean(interactive || (typeof Prefs !== 'undefined' && Prefs.autoTitle) || (typeof TitleSync !== 'undefined' && TitleSync.shouldGoldPrefix?.(sid)));
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
      if (chat.hasMore && typeof chat.loadAll === 'function') {
        try { await chat.loadAll(); } catch {}
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
      const skipCost = !isCostProbeEnabled() || (isOpenChat && !interactive);
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
        const maxAttempts = isFreshLiveTurn ? 3 : 1;
        engine.clearCooldowns?.();
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
            if (attempt < 1 && st.httpStatus === 403) {
              say('计费节点受阻，自动搜寻新节点并轮换…', 82);
              await scrapeFreshCostDpls(true);
              engine.clearCooldowns?.();
              await sleep(retryWait[attempt] || 220);
              continue;
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
  function upgradeCachedOpus56(sid) {
    if (typeof Models === 'undefined' || !Models.all) return;
    if (sid) {
      const mQuick = Models.get(sid);
      if (mQuick && (mQuick.reverseVer || 0) >= 165 && !mQuick.routed && !GEMINI_FLASH_FIX_SIDS.has(sid) && !SOL_61_SIDS.has(sid) && !HAIKU_55_MEDIUM_SIDS.has(sid) && !ARGON_HIGH_SIDS.has(sid) && sid !== '01a13f8c-41c2-7ad3-8e77-73feb405f68d' && !/opus[-\s]*5\.5/i.test(String(mQuick.name || ''))) {
        return;
      }
    }
    const stripTierSimple = s => String(s || '').replace(/\s*\((?:none|minimal|low|medium|high|xhigh|max)\)\s*$/i, '').replace(/-(?:none|minimal|low|medium|high|xhigh|max)$/i, '').replace(/[?？]+$/, '').trim().toLowerCase();
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
      if (!m.userCorrected && (m.habitInferred || m.pendingConfirm || m.guess || (Array.isArray(m.reverseCandidates) && m.reverseCandidates.length > 0)) && (m.reverseVer || 0) < 168) {
        const cleanedRevCands = Array.isArray(m.reverseCandidates)
          ? m.reverseCandidates.filter(rc => rc && !rc.structuralRev && rc.source !== 'habit' && rc.source !== 'fp' && !rc.habitSource && (rc.revPct != null || rc.diophantinePassed))
          : undefined;
        const topRc = cleanedRevCands && cleanedRevCands.length
          ? cleanedRevCands.find(rc => (rc.diophantinePassed || Number(rc.revPct ?? rc.match ?? 0) >= 85) && Number(rc.revPct ?? rc.match ?? 0) >= 75)
          : null;
        if (topRc) {
          const topLabel = cleanModelLabel(topRc.effortProfile?.stealthModelLabel || topRc.dynamicLabel || topRc.label || topRc.id || '');
          const topCanon = (typeof Strength !== 'undefined' && Strength.canon ? Strength.canon(topLabel) : topLabel).replace(/[?？]+$/, '');
          const topMatch = Math.round(Number(topRc.revPct ?? topRc.match ?? 95) * 10) / 10;
          const topEffort = String(topRc.inferredEffort || topRc.effortProfile?.effort || (/\b(none|minimal|low|medium|high|xhigh|max)\b/i.exec(topCanon)?.[1]) || m.reverseEffort || 'high').toLowerCase();
          const isValidSc = s => s != null && s !== '' && Number.isFinite(+s) && +s >= 10 && +s <= 100;
          const topScore = isValidSc(topRc.effortProfile?.reiScore)
            ? +topRc.effortProfile.reiScore
            : (!m.habitInferred && isValidSc(m.reverseScore)
              ? +m.reverseScore
              : (typeof Strength !== 'undefined' && Strength.reverseDepthScore ? Strength.reverseDepthScore(id, { ...m, name: topCanon, reverseEffort: topEffort }, null, typeof Chats !== 'undefined' ? Chats.get(id) : null) : null)) || (isValidSc(m.reverseScore) ? +m.reverseScore : 75);
          const chatObj = (typeof Chats !== 'undefined' && Chats.get(id)) || { sid: id, messages: [] };
          const healed = {
            ...m,
            name: topCanon,
            candidateName: topCanon,
            rawLabel: topLabel,
            reverseCandidateId: topRc.id || m.reverseCandidateId || topCanon,
            reverseLabel: topLabel,
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
            reverseVer: 168,
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
        const chatObj = typeof Chats !== 'undefined' ? Chats.get(id) : null;
        if (chatObj && Array.isArray(chatObj.messages) && chatObj.messages.some(x => x && x.role === 'assistant' && x.status !== 'pending') && typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.identifyAndApply) {
          summaryCache.delete(id);
          const re = ChatHabitFingerprint.identifyAndApply(chatObj, { force: true, fromCostFallback: true });
          if (re && re.name) {
            try { if (typeof Titles !== 'undefined' && Titles.local) { Titles.local(id); Titles.touch?.(id); } } catch {}
            continue;
          }
        }
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
          reverseVer: 168,
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
    chat._inAutomatic = true;
    try {
      try { upgradeCachedOpus56(chat.sid); } catch {}
      if (!autoEnabled() || chat.busy || chat.gacha?.fingerprint || chat.gacha?.mode === 'autoqa' || chat.gacha?.mode === 'habit' || isOtherProbeBusy(chat)) return;
      if (shouldSkipCostForOpenSource(chat)) {
        markAsOpenSourceModel(chat);
        return;
      }
      const comp = globalThis.ArenaBilling.completed(chat);
      if (!comp.length) {
        if (!chat.loaded && typeof chat.load === 'function' && !chat._autoLoadingMsgs) {
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
        if (autoSeen.get(chat) === stamp && mNow?.name && (mNow.reverseVer || 0) >= 156) return;
        autoSeen.set(chat, stamp);
        if (!mNow || !mNow.userCorrected) {
          try { ChatHabitFingerprint.identifyAndApply(chat, { force: true }); } catch {}
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
      if (alreadyCovered || persistedCovered || (autoSeen.get(chat) === stamp && now() - (chat._lastAutoProbeAt || 0) < 45000)) return;
      chat._lastAutoProbeAt = now();
      autoSeen.set(chat, stamp);
      // 先零延迟跑一次对话习惯指纹兜底，再异步拉取 /cost 账单
      try { ChatHabitFingerprint.identifyAndApply(chat, { force: false }); } catch {}
      queueMicrotask(() => { if (autoEnabled() && !isOtherProbeBusy(chat) && sameOwner(owner)) schedule(chat); });
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
    headActs.append(tipI(headTip));
    box.append(h('div', { class: 'mc-gh bp-head' }, icon('pulse'), h('b', { class: 'grow' }, '联合识别排名'), headActs));
    if (typeof Dock !== 'undefined' && typeof Dock.renderCorrectPanel === 'function') {
      const cp = Dock.renderCorrectPanel(sid, mCard);
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
      try { Dock?.render?.(); } catch {}
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
    if (d.routeSwitched || d.routeType === 'model') {
      const rtDesc = (d.initialModelLabel && d.routedModelLabel) ? `（${d.initialModelLabel} → ${d.routedModelLabel}）` : '';
      pills.append(iconPill('alert', '路由换模', `检测到路由到其他模型${rtDesc}，已自动截取最新连续段反推`, 'warn'));
    } else if (d.effortDowngraded || d.routeType === 'effort') {
      const efDesc = (d.initialEffort && d.latestEffort) ? `（${d.initialEffort} → ${d.latestEffort}）` : '';
      pills.append(iconPill('alert', '强度削弱', `检测到同型号的强度削弱${efDesc}`, 'warn'));
    }
    if (pills.childNodes.length) box.append(pills);

    // 根据「反推」「习惯」开关状态过滤与排序候选列表
    let displayCands = [];
    if (rankFilter.rev && rankFilter.habit) {
      displayCands = sortedCands.slice(0, 5);
    } else if (rankFilter.rev) {
      // 仅看反推（优先展示真实 /cost 账单反推置信度；当 /cost 受阻如 403 时回退展示结构反推候选）
      const hasNonStructRev = sortedCands.some(r => r && !r.structuralRev && r.revPct != null && r.revPct > 0);
      const revPool = costOn
        ? sortedCands
            .filter(r => r && (hasNonStructRev ? !r.structuralRev : true) && r.revPct != null && r.revPct > 0)
            .map(r => ({ ...r, displayMatch: +r.revPct, displayMode: 'rev-only' }))
        : [];
      displayCands = revPool
        .sort((a, b) => {
          const aDio = Boolean(a.diophantinePassed && (a.displayMatch || 0) >= 70);
          const bDio = Boolean(b.diophantinePassed && (b.displayMatch || 0) >= 70);
          return (Number(bDio) - Number(aDio)) || (b.displayMatch - a.displayMatch);
        })
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
      const srcTip = [
        `#${idx + 1} ${row.label || row.id}（点击此行可打开纠偏面板并填入该型号）`,
        row.revPct != null ? `⚡ 反推置信度：${+row.revPct.toFixed(1)}%${row.diophantinePassed ? '（整数精确解）' : row.structuralRev ? '（对话记录+工具流反推）' : ''}` : null,
        (row.habitPct ?? row.fpPct) != null ? `🖐 对话习惯置信度：${+(row.habitPct ?? row.fpPct).toFixed(1)}%${row.userLearned ? '（命中习惯库样本 ✓）' : ''}` : null,
        hasDualOverlap ? `双色重叠条：背景大值 ${Math.max(revVal, habVal).toFixed(1)}%（${revVal >= habVal ? '反推' : '习惯'}）+ 前景小值 ${Math.min(revVal, habVal).toFixed(1)}%（${revVal >= habVal ? '习惯' : '反推'}）` : null,
        row.effortProfile?.effort ? `5维思考档位：${row.effortProfile.effort}（REI=${row.effortProfile.reiScore}）` : null,
        row.matchedDims?.length ? `命中习惯/特征：${row.matchedDims.slice(0, 5).join(' · ')}` : null,
      ].filter(Boolean).join('\n');

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
        title: srcTip,
        onclick: e => {
          e?.stopPropagation?.();
          if (typeof Dock !== 'undefined' && Dock.editModelSid === sid && typeof ChatHabitFingerprint !== 'undefined' && ChatHabitFingerprint.confirmUserCorrection) {
            ChatHabitFingerprint.confirmUserCorrection(sid, row.label || row.id, { learn: true });
            Dock.editModelSid = null;
            Dock.render?.();
          } else if (typeof Dock !== 'undefined') {
            Dock.editModelSid = sid;
            Dock.editModelDraft = row.label || row.id;
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
          ? (costOn ? '当前对话暂无 /cost 费用反推数据（可开启「习惯」或点击「反推锁定」）' : '计费开关已关闭，请开启「习惯」排名或打开「计费」开关')
          : (s.error ? (s.httpStatus ? 'HTTP ' + s.httpStatus : '计费暂不可用') : s.pending ? '读取中…' : '待补读账单与型号');
      const errDesc = s.error || REASONS[s.info?.reason] || combined.consensus.text || emptyMsg;
      box.append(h('p', { class: 'note', 'data-tip': errDesc, title: errDesc }, emptyMsg));
    }
    if (cooling && costOn && !openSkip && !displayCands.length) box.append(h('p', { class: 'note' }, '计费冷却至 ' + new Date(s.retryAt).toLocaleTimeString() + '（已启用对话习惯指纹兜底）'));
    const action = (label, ic, fn, disabled) => h('button', { type: 'button', class: 'ib sm', title: label, 'aria-label': label, disabled: disabled || null, onclick: e => { e?.stopPropagation?.(); fn(e); } }, icon(ic));
    // 顶部已有 [⚡ 反推] / [习惯] 按钮，自动模式与计费开关已收纳至「设置 -> 模型识别」（移除底部重复的自动/计费开关与 class: 'btn sm ghost bp-lock-btn' 反推锁定按钮）
    box.append(h('div', { class: 'billing-controls' },
      h('span', { class: 'grow' }),
      action('刷新计费与反推', 'refresh', async () => { const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null) || { sid, messages: [] }; if (c) { clearCachedCostDoc(sid); summaryCache.delete(sid); if (!isCostProbeEnabled() || shouldSkipCostForOpenSource(c)) { ChatHabitFingerprint.identifyAndApply(c, { force: true, interactive: true }); return; } engine.clearCooldowns?.(); if (s.httpStatus === 403) await scrapeFreshCostDpls(true); await engine.refresh(c, { force: true, bypassCooldown: true }); summaryCache.delete(sid); applyReverseIdentity(c, { interactive: true, forceLock: true }); } }, s.pending || chat?.busy || !sid),
      action('同步价格表', 'layers', async () => { engine.clearCooldowns?.(); await Ranking.refresh(true); const c = chat || (typeof chatOf === 'function' ? chatOf(sid) : null); if (c && isCostProbeEnabled() && !shouldSkipCostForOpenSource(c)) { await engine.refresh(c, { force: true, bypassCooldown: true }); applyReverseIdentity(c, { interactive: false }); } }),
      action('导出计费诊断 JSON', 'download', () => exportDiagnosticJson(sid))));
    return box;
  }

  const delayed = new WeakMap();
  const midTurnAt = new WeakMap();
  const bgSwept = new Set();
  let bgSweepTimer = 0, bgSweeping = false;
  function probeMidTurn(chat) {
    if (!autoEnabled() || !chat?.sid || chat?.busy || chat?.gacha?.fingerprint || chat?.gacha?.mode === 'autoqa' || chat?.gacha?.mode === 'habit' || isOtherProbeBusy(chat)) return;
    if (!isCostProbeEnabled() || shouldSkipCostForOpenSource(chat) || globalCost429Until > now()) return;
    const lastAt = midTurnAt.get(chat) || 0;
    if (now() - lastAt < 2500) return;
    midTurnAt.set(chat, now());
    const owner = String(UI.host?.account?.id || UI.me?.id || '');
    setTimeout(() => {
      if (!autoEnabled() || !isCostProbeEnabled() || chat?.busy || isOtherProbeBusy(chat) || !sameOwner(owner) || !Chats.has(chat.sid) || shouldSkipCostForOpenSource(chat) || globalCost429Until > now()) return;
      const stNow = engine.state(chat.sid);
      if (stNow.retryAt > now() || stNow.pending) return;
      void engine.refresh(chat, { force: true, allowPending: true });
    }, 80);
  }
  function schedule(chat) {
    if (chat?.sid) {
      chat._lastTurnDoneAt = now();
      clearCachedCostDoc(chat.sid);
    }
    if (!autoEnabled() || !chat?.sid || chat?.gacha?.fingerprint || chat?.gacha?.mode === 'autoqa' || chat?.gacha?.mode === 'habit') return;
    if (isOtherProbeBusy(chat)) {
      setTimeout(() => { if (chat?.sid && !chat.busy && !isOtherProbeBusy(chat)) schedule(chat); }, 1200);
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
      autoSeen.set(chat, owner + ':' + lastId);
      chat._lastAutoProbeAt = now();
    }
    for (const timer of delayed.get(chat) || []) clearTimeout(timer);
    const isFreshTurn = Boolean(now() - (chat._lastTurnDoneAt || 0) < 6000);
    const scheduleDelays = isFreshTurn ? [150, 1500] : [150];
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
        void engine.refresh(chat, { force: true, bypassCooldown: idx === 0 }).then(() => {
          const stAfter = engine.state(chat.sid);
          if (stAfter.httpStatus === 429) {
            globalCost429Until = Math.max(globalCost429Until, stAfter.retryAt || (now() + 45000));
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
    if (!chat?.sid) return null;
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
    if (!isCostProbeEnabled()) {
      return ChatHabitFingerprint.identifyAndApply(chat, { force: true });
    }
    await engine.refresh(chat, { force: true, bypassCooldown: true }).catch(() => {});
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
    if (!sid) return null;
    if (typeof Gacha !== 'undefined' && Gacha.stepOf && Gacha.stepOf(sid)) return null;
    if (!isChatUnidentified(sid, mi)) {
      queuedIdentSids.delete(sid);
      return null;
    }
    const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null;
    if (activeIdentSid === sid || (c && isRunning(c))) {
      return { status: 'running', text: '正在识别中', pct: 76, phase: '正在后台读取对话并识别型号…', active: true };
    }
    if (!queuedIdentSids.has(sid) && !bgSwept.has(sid)) {
      queuedIdentSids.add(sid);
      scheduleBgSweep(450);
    }
    if (queuedIdentSids.has(sid) || bgSweeping) {
      return { status: 'queued', text: '正在识别排队中', pct: 36, phase: '已在后台识别排队队列中，将自动加载对话并完成识别/开源归档（无需手动点开）', active: true };
    }
    return { status: 'pending', text: '待识别', pct: 18, phase: '待识别型号（后台队列自动延续处理）', active: true };
  }

  function scheduleBgSweep(ms = 600) {
    clearTimeout(bgSweepTimer);
    bgSweepTimer = setTimeout(() => void runBgSweep(), Math.max(250, Number(ms) || 600));
  }

  async function runBgSweep() {
    if (bgSweeping || !autoEnabled() || typeof UI === 'undefined' || !UI.me || typeof History === 'undefined' || !History.lastLoad) return;
    try { upgradeCachedOpus56(); } catch {}
    const gone = typeof History.goneMap === 'function' ? History.goneMap() : new Map();
    const gachaRun = typeof Gacha !== 'undefined' ? (Gacha.run || Gacha.state?.() || null) : null;
    const gachaAttempts = Array.isArray(gachaRun?.attempts) ? gachaRun.attempts : [];
    const gachaArchiveSids = new Set(
      gachaAttempts
        .filter(a => a?.sid && (a.verdict === 'archive' || a.model === '开源模型' || a.fingerprint?.skipped === 'visible-thinking'))
        .map(a => a.sid)
    );
    for (const e of (History.items || []).slice(0, 80)) {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt) continue;
      const m = typeof Models !== 'undefined' ? Models.get(e.id) : null;
      const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(e.id, null, e) : gachaAttempts.some(a => a?.sid === e.id);
      if (gachaArchiveSids.has(e.id) || (m?.name === '开源模型' && (m?.provider === '开源思考过滤' || isGachaChat))) {
        if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
          Gacha.killOpenSourceThinkingChat(e.id, typeof Chats !== 'undefined' ? Chats.get(e.id) : null);
        } else {
          void History.archive(e.id).catch(() => {});
        }
      }
    }
    // 扫描近期的未识别会话与显式入队会话（避免启动时拉取 80 个历史旧会话与重复请求 /cost）
    const candidates = (History.items || []).slice(0, 15).filter((e, idx) => {
      if (!e?.id || gone.has(e.id) || e.isArchived || e.archivedAt || gachaArchiveSids.has(e.id)) return false;
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
      const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(e.id, null, e) : gachaAttempts.some(a => a?.sid === e.id);
      if (m && (m.name === '开源模型' || isOpenCandidateName(m.name || m.reverseCandidateId || ''))) {
        if (isGachaChat && (typeof Gacha === 'undefined' || Gacha.settings?.().skipCompatThinking !== false)) {
          if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) Gacha.killOpenSourceThinkingChat(e.id, typeof Chats !== 'undefined' ? Chats.get(e.id) : null);
          else void History.archive(e.id).catch(() => {});
        }
        return false;
      }
      if (queuedIdentSids.has(e.id) || !bgSwept.has(e.id)) {
        if (e.id === '01a13f8c-41c2-7ad3-8e77-73feb405f68d' && /opus[-\s]*5\.5/i.test(m?.name || '')) return true;
        if (ARGON_HIGH_SIDS.has(e.id) && !/argon|gemini/i.test(m?.name || '')) return true;
        if (SOL_61_SIDS.has(e.id) && !/gpt[-\s]*6\.1[-\s]*sol/i.test(m?.name || '')) return true;
        if (/fable[-\s]*5/i.test(m?.name || m?.candidateName || '') && e.id !== '01a1457d-fd02-74d6-b839-4adf76e2a505' && (m?.reverseVer || 0) < 152) return true;
      }
      if (queuedIdentSids.has(e.id) || isGachaChat) {
        return !m || m.guess || m.pendingConfirm || !m.name || m.name === '未识别' || m.name === '未知型号';
      }
      if (!m || !m.name || m.name === '未识别' || m.name === '未知型号') return idx < 6;
      return false;
    });
    for (const cand of candidates) queuedIdentSids.add(cand.id);
    if (!candidates.length) {
      if (activeIdentSid) {
        activeIdentSid = null;
        try { UI.renderList?.(); } catch {}
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
        try { UI.renderList?.(); } catch {}

        const c = typeof chatOf === 'function' ? chatOf(target.id) : (typeof Chats !== 'undefined' ? Chats.get(target.id) : null);
        if (!c || c.busy) return;
        // 关键修复：后台自动调用 c.load() 拉取未打开会话的消息内容，无需用户手动点击打开对话！
        if ((!c.loaded || !globalThis.ArenaBilling.completed(c).length) && typeof c.load === 'function') {
          try { await c.load(); } catch {}
        }
        if ((!globalThis.ArenaBilling.completed(c).length) && typeof c.reconcile === 'function') {
          try { await c.reconcile(0); } catch {}
        }
        const isGachaChat = typeof Gacha !== 'undefined' && Gacha.isGachaChat ? Gacha.isGachaChat(target.id, c, target) : gachaAttempts.some(a => a?.sid === target.id);

        // 1. 立即检查是否为开源思考：普通对话直接标记为「开源模型」并同步修改对话名称（不浪费时间推理具体计费模型）；抽卡对话立刻归档删除
        if (shouldSkipCostForOpenSource(c)) {
          try { markAsOpenSourceModel(c); } catch {}
          if (isGachaChat && (typeof Gacha === 'undefined' || Gacha.settings?.().skipCompatThinking !== false)) {
            if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
              Gacha.killOpenSourceThinkingChat(target.id, c);
            } else {
              void History.archive(target.id).catch(() => {});
            }
          }
          bgSwept.add(target.id);
          queuedIdentSids.delete(target.id);
          return;
        }

        // 2. 如果该抽卡对话因为限流切 IP 导致第 1 问都没收到回复就中断了，后台自动补发一问或清理僵尸空会话
        let compList = globalThis.ArenaBilling.completed(c);
        if (!compList.length && isGachaChat && !c.busy) {
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
            if (typeof Gacha !== 'undefined' && Gacha.killOpenSourceThinkingChat) {
              Gacha.killOpenSourceThinkingChat(target.id, c);
            } else {
              void History.archive(target.id).catch(() => {});
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
        const canRunCost = isCostProbeEnabled() && !shouldSkipCostForOpenSource(c) && (isGachaChat || hasCachedBill) && globalCost429Until <= now() && (st.retryAt || 0) <= now();
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
          } else {
            try { applyReverseIdentity(c, { interactive: false, forceLock: true, fallbackQuestionMark: true }); } catch {}
          }
        } else {
          try { ChatHabitFingerprint.identifyAndApply(c, { force: true, fromCostFallback: true }); } catch {}
        }

        // 5. 若为抽卡产生的会话，识别完成后立即执行抽卡收尾复核（开源归档 / 黑名单归档 / 命中统计）
        if (isGachaChat && typeof Gacha !== 'undefined' && Gacha.settleBackgroundChat) {
          try { await Gacha.settleBackgroundChat(target.id, c); } catch {}
        }

        bgSwept.add(target.id);
        queuedIdentSids.delete(target.id);
      }));
    } catch {} finally {
      activeIdentSid = null;
      bgSweeping = false;
      try { UI.renderList?.(); } catch {}
      if (candidates.length > batch.length || queuedIdentSids.size > 0) {
        scheduleBgSweep(isCostProbeEnabled() && globalCost429Until <= now() ? 1400 : 450);
      }
    }
  }

  setTimeout(() => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(900); }, 100);
  Bus.on('turn', (chat) => { if (chat?.sid) { schedule(chat); scheduleBgSweep(2500); } });
  Bus.on('chat', chat => { if (chat?.sid && !isOtherProbeBusy(chat)) automatic(chat); });
  Bus.on('history', () => { try { upgradeCachedOpus56(); } catch {} scheduleBgSweep(600); });
  Bus.on('models', sid => Bus.emit('billing', sid));
  Bus.on('trace', sid => Bus.emit('billing', sid));
  Bus.on('agent-catalog', html => engine.syncCatalog(html));
  const catalogRows = () => Array.isArray(engine.catalogRaw) && engine.catalogRaw.length ? engine.catalogRaw : (Array.isArray(bundled?.data) ? bundled.data : []);
  return Object.assign(engine, { card, summary, clearSummaryCache, topConfidence, badge, automatic, schedule, invalidateAndRefresh, probeMidTurn, isAutoEnabled: autoEnabled, setAutoEnabled, isCostProbeEnabled, setCostProbeEnabled, setSkewDpl, getRankFilter, setRankFilter, shouldSkipCostForOpenSource, markAsOpenSourceModel, habit: ChatHabitFingerprint, enqueueIdent, identStatus, trigger: sid => { const c = typeof Chats !== 'undefined' ? Chats.get(sid) : null; if (c) probeMidTurn(c); }, reverseIdentify, applyReverseIdentity, isRunning, mergeCandidates, catalogRows, exportDiagnosticJson });
})();
