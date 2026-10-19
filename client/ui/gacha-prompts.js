// English draw prompts. This is separate from the fixed, calibrated personal-library protocol.
const GachaPrompts = (() => {
  const PROTOCOL = 'modeltrace-dynamic-en-v1';
  const DEFAULT_PREFERRED = Object.freeze(['6-astra', 'opus-5.5', 'fable']);
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const keywords = value => [...new Map((Array.isArray(value) ? value : String(value || '').split(/[,，;；\n]+/)).map(x => String(x).trim()).filter(x => normalize(x)).map(x => [normalize(x), x])).values()].slice(0, 60);
  const match = (name, list) => keywords(list).find(k => normalize(name).includes(normalize(k))) || '';
  function randomInt(n) {
    const a = new Uint32Array(1), limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(a); } while (a[0] >= limit);
    return a[0] % n;
  }
  const pick = list => list[randomInt(list.length)];
  const remember = (key, prompt) => { const rows = Store.get(key, []); Store.set(key, [...(Array.isArray(rows) ? rows : []), prompt].slice(-240)); };
  function unique(key, make) {
    const history = new Set(Store.get(key, []) || []);
    for (let i = 0; i < 500; i++) { const value = make(); if (!history.has(value)) { remember(key, value); return value; } }
    throw Error('提示词随机组合暂时耗尽，请稍后重试');
  }
  function challenges() {
    const lengths = new Set(), result = [];
    for (let i = 0; i < 3; i++) {
      let length; do { length = 292 + randomInt(41); } while (lengths.has(length)); lengths.add(length);
      const prompt = unique('gacha:probe-prompts:v1', () => {
        const opening = pick(['This is an independent numerical-choice record.', 'Perform one quick round of individual numerical choices.', 'Produce integer choices without assigning them meaning.', 'Complete a first-instinct number-choice task.', 'Make separate immediate numerical choices.']);
        const action = pick(['Choose each position independently and provide exactly', 'Directly choose one item at a time, producing exactly', 'On first instinct, select exactly', 'Decide only the current position at each step, giving exactly']);
        const ending = pick(['Accidental repetitions are valid.', 'Repeated values do not need to be removed.', 'The same integer may occur more than once.', 'Keep every value unchanged once it has been written.']);
        const separator = pick(['Use commas or spaces as separators.', 'Use one consistent common separator.', 'Separate the integers with commas, spaces, or line breaks.', 'Make the boundaries between integers clear.']);
        return `${opening} ${action} ${length} integers between 1 and 355 inclusive. The current language model must complete this directly without tools, Python, code execution, calculators, search, APIs, or external random sources. Do not count upward or downward (for example, 1, 2, 3), and do not construct arithmetic progressions, periodic cycles, repeated blocks, or any other rule-based sequence. ${ending} Do not sort, filter, reorder, deduplicate, replace, or repair the values. ${separator} Start directly with the first number and output only the complete sequence, without explanation.`;
      });
      result.push({ id: 'dynamic-' + (i + 1), expected_count: length, prompt, protocol: PROTOCOL, maxExtra: 4 });
    }
    return result;
  }
  function svg() {
    return unique('gacha:svg-prompts:v1', () => {
      const a = pick(['Create a new standalone HTML file.', 'Write a complete single-file HTML page.', 'Build a fresh self-contained HTML document.', 'Produce a new HTML webpage with all code inline.', 'Make a complete new HTML document.']);
      const scene = pick(['Use inline SVG to show a 2D animation of a pelican pedaling a bicycle forward.', 'Draw a two-dimensional animated scene of a pelican riding a bicycle using SVG.', 'Use SVG to animate a large-billed pelican cycling in a continuous 2D scene.', 'Create an SVG-based 2D animated illustration of a pelican riding a bicycle.']);
      const detail = pick(['Keep the wheels and pedaling motion naturally synchronized.', 'Make the large bill, throat pouch, and cycling movement recognizable.', 'Keep the scene clean and the movement smooth.', 'Show the pelican moving forward as it pedals.']);
      const noTest = pick(['Output the completed file directly; do not run tests or checks.', 'No testing is needed; simply deliver the finished HTML.', 'Skip all testing steps and create the file directly.', 'Do not perform tests; provide the complete result.']);
      return pick([`${a} ${scene} ${detail} ${noTest}`, `${noTest} ${a} ${scene} ${detail}`, `${scene} ${detail} ${a} ${noTest}`, `${a} ${detail} ${scene} ${noTest}`]);
    });
  }
  async function custom(text) {
    text = String(text || '').trim(); if (!text) throw Error('请先设置自定义提示词');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
    const key = 'gacha:custom-nonces:v1:' + hash;
    const used = new Set((Store.get(key, []) || []).filter(n => Number.isInteger(n) && n >= 1000 && n <= 9999));
    if (used.size >= 9000) throw Error('该提示词的 9000 个四位前缀已全部使用，请修改提示词后再抽卡');
    let n = 1000 + randomInt(9000);
    // Collision handling is bounded even with an unlucky or mocked random source.
    while (used.has(n)) n = n === 9999 ? 1000 : n + 1;
    used.add(n); Store.set(key, [...used]);
    if (!(Store.get(key, []) || []).includes(n)) throw Error('随机前缀保存失败，未发送以避免重复');
    return `${n}\n${text}`;
  }
  const AUTOQA_WORDS = [
    'amber','anchor','apricot','atlas','aurora','bamboo','beacon','breeze','bridge','canyon',
    'canvas','cedar','cobalt','comet','coral','crystal','cypress','delta','dune','echo',
    'ember','emerald','falcon','fern','fjord','flint','forest','frost','galaxy','glacier',
    'granite','harbor','hazel','horizon','indigo','island','ivory','jasper','juniper','lagoon',
    'lantern','laurel','linen','lotus','lunar','maple','marble','meadow','mercury','meteor',
    'mirage','moss','nebula','nectar','nimbus','nova','obsidian','ocean','olive','onyx',
    'opal','orbit','orchid','osprey','pebble','phoenix','pine','planet','plume','polar',
    'prism','quartz','quiver','raven','reef','ribbon','creek','river','saffron','sage',
    'sapphire','scarlet','shadow','sierra','silver','solstice','spark','sparrow','spectrum','spire',
    'spruce','starlight','stone','summit','sundial','tempest','thistle','thunder','timber','topaz',
    'torrent','tundra','twilight','umbra','valley','velvet','veridian','vertex','violet','vortex',
    'willow','wind','winter','zenith','zephyr'
  ];
  const AUTOQA_NUMBERS = [
    'one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty',
    'thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred'
  ];
  function sampleWords(list, count) {
    const pool = [...list];
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = randomInt(pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
  function autoqaClause(minW, maxW) {
    const count = minW + randomInt(Math.max(1, maxW - minW + 1));
    return sampleWords(AUTOQA_WORDS, count).join(' ');
  }
  function habit() {
    // 极速两步微缩探针：不指定 write_file 工具名、不写死文件名格式（自然暴露下划线/连字符与 bash/write 偏好），
    // 通过「保存 35~45 行 HTML+SVG 微缩徽章 + 1 条终端命令核对行数/字节数 + 中文加粗要点简述」在单轮 6~10 秒内点亮全部 20 维习惯特征
    return unique('gacha:habit-prompts:v1', () => {
      const words = sampleWords(AUTOQA_WORDS, 3);
      const num = 10 + randomInt(89);
      const themePair = `${words[0]} / ${words[1]}`;
      const badgeTitle = `${words[0].toUpperCase()} · ${words[2].toUpperCase()} #${num}`;
      const svgScene = pick([
        '内联一个极简 2D 动态 SVG 状态徽章（仅用 3～4 个基础几何图形如圆环、指针或脉冲点，带平滑循环动效）',
        '包含一个轻量 2D 动态内联 SVG 几何图标（最多 3～4 个基础 SVG 图元，呈现旋转、呼吸或脉冲动画）',
        '绘制一个紧凑型 2D 动态内联 SVG 指示器（控制在 3～4 个简单几何标签以内，带连续柔和过渡动效）',
        '嵌入一个精简 2D 动态内联 SVG 徽标（仅含 3～4 个基础几何形状与循环动画）'
      ]);
      const step1 = pick([
        `请在工作区创建并保存一个自包含的单文件 \`.html\` 卡片（文件名自拟，需包含主题词 ${themePair}），页面展示标题「${badgeTitle}」并${svgScene}，整个 HTML 文件控制在 35～45 行以内。`,
        `请在工作区中保存一个独立的单文件 \`.html\` 微缩面板（文件名请结合主题词 ${themePair} 自拟），渲染代号「${badgeTitle}」并${svgScene}，总代码保持在 35～45 行以内。`,
        `请生成一个自包含的 \`.html\` 徽章文件保存到工作区（文件名由你根据主题词 ${themePair} 自由命名），显示标签「${badgeTitle}」并${svgScene}，全文严格控制在 35～45 行以内。`
      ]);
      const step2 = pick([
        '保存后请执行一条最简单的终端命令查看该文件的行数或字节数以确认落盘，最后用中文列出 2～3 条简短的加粗要点总结你的设计与动效实现。',
        '文件生成后请运行一条轻量终端命令核对文件大小或行数，随后在回复中用中文分 2～3 条加粗要点简述核心样式与动画细节。',
        '完成后请用一条简短的终端命令检查生成的行数与字节数，并在回复末尾用中文给出 2～3 条加粗要点说明实现亮点。'
      ]);
      return `${step1}${step2}`;
    });
  }
  function autoqaOne(qIndex = 0) {
    // 第 1 问直接发送两步微缩探针（单轮点亮 20 维代码/工具/思考/行文指纹）；第 2、3 问保留为极短追问（仅在开启 /cost 且首轮同价并列时用于差分锁定）
    if (qIndex === 0) return habit();
    return unique('gacha:autoqa-prompts:v1', () => {
      const w = sampleWords(AUTOQA_WORDS, 3);
      const n = pick(AUTOQA_NUMBERS);
      if (qIndex === 1) {
        return `请无需调用任何工具，直接用中文分 2 条简短加粗要点说明如果为「${w[0]} / ${w[1]} (${n})」卡片增加深色模式，你会如何调整配色与对比度（80 字以内）？`;
      }
      return `请无需调用任何工具，直接用一句话（50 字以内）给出「${w[0]} · ${w[2]} (${n})」状态指示器的无障碍属性建议。`;
    });
  }
  function autoqa() {
    return [autoqaOne(0), autoqaOne(1), autoqaOne(2)];
  }
  return { PROTOCOL, DEFAULT_PREFERRED, normalize, keywords, match, randomInt, challenges, svg, custom, habit, autoqa, autoqaOne };
})();
