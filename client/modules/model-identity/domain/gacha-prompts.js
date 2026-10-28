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
  const PELICAN_SHORT_BANKS = [
    {
      lang: 'zh-CN',
      weight: 24,
      make() {
        const pre = pick(['', '', '现在', '立刻', '马上', '请', '帮我', '请帮我', '请帮我现在', '现在帮我', '请立刻', '麻烦帮我']);
        const verb = pick(['制作', '制作', '做', '写', '生成', '创建', '编写']);
        const det = pick(['', '', '一个', '一份']);
        const svgTag = pick(['svg', 'SVG']);
        const htmlTag = pick(['html', 'HTML']);
        const bike = pick(['自行车', '自行车', '单车']);
        const core = pick([
          '鹈鹕骑' + bike + '的' + svgTag + '的' + htmlTag,
          svgTag + '鹈鹕骑' + bike + '的' + htmlTag,
          '鹈鹕骑' + bike + svgTag + '的' + htmlTag,
          '骑' + bike + '的鹈鹕' + svgTag + '的' + htmlTag,
          svgTag + '的鹈鹕骑' + bike + htmlTag,
          '鹈鹕骑' + bike + '的' + htmlTag + '(' + svgTag + ')',
        ]);
        const suf = pick(['', '', '', '文件', '页面', '网页']);
        return pre + verb + det + core + suf;
      },
    },
    {
      lang: 'zh-TW',
      weight: 18,
      make() {
        const pre = pick(['', '', '現在', '立刻', '馬上', '請', '幫我', '請幫我', '請幫我現在', '現在幫我']);
        const verb = pick(['製作', '做', '寫', '產生', '建立']);
        const det = pick(['', '', '一個', '一份']);
        const svgTag = pick(['svg', 'SVG']);
        const htmlTag = pick(['html', 'HTML']);
        const bike = pick(['自行車', '腳踏車']);
        const core = pick([
          '鵜鶘騎' + bike + '的' + svgTag + '的' + htmlTag,
          svgTag + '鵜鶘騎' + bike + '的' + htmlTag,
          '騎' + bike + '的鵜鶘' + svgTag + '的' + htmlTag,
          svgTag + '的鵜鶘騎' + bike + htmlTag,
        ]);
        const suf = pick(['', '', '檔案', '頁面', '網頁']);
        return pre + verb + det + core + suf;
      },
    },
    {
      lang: 'en',
      weight: 26,
      make() {
        const lead = pick(['', '', 'Now ', 'Right now, ', 'Immediately ', 'Please ', 'Help me ', 'Please help me ', 'Quickly ']);
        let verb = pick(['make', 'create', 'build', 'write', 'generate']);
        if (!lead) verb = verb[0].toUpperCase() + verb.slice(1);
        const svgTag = pick(['SVG', 'svg']);
        const htmlTag = pick(['HTML', 'html']);
        const bike = pick(['a bicycle', 'a bike']);
        const suf = pick(['', '', ' file', ' page']);
        const body = pick([
          'an ' + htmlTag + suf + ' of an ' + svgTag + ' pelican riding ' + bike,
          'an ' + svgTag + ' pelican riding ' + bike + ' ' + htmlTag + suf,
          'a pelican riding ' + bike + ' ' + svgTag + ' ' + htmlTag + suf,
          'an ' + htmlTag + suf + ' with an ' + svgTag + ' pelican riding ' + bike,
          'an ' + svgTag + ' of a pelican riding ' + bike + ' in ' + htmlTag + suf,
        ]);
        return lead + verb + ' ' + body;
      },
    },
    {
      lang: 'ja',
      weight: 12,
      make() {
        const pre = pick(['', '今すぐ', 'すぐに', '今から']);
        const svgTag = pick(['SVG', 'svg']);
        const htmlTag = pick(['HTML', 'html']);
        const core = pick([
          'ペリカンが自転車に乗る' + svgTag + 'の' + htmlTag,
          svgTag + 'のペリカンが自転車に乗る' + htmlTag,
          '自転車に乗るペリカンの' + svgTag + 'の' + htmlTag,
          'ペリカンが自転車を漕ぐ' + svgTag + 'の' + htmlTag,
        ]);
        const suf = pick(['', 'ファイル', 'ページ']);
        const tail = pick(['を作って', 'を作成して', 'を作成してください', 'を書いて', 'を生成して']);
        return pre + core + suf + tail;
      },
    },
    {
      lang: 'ko',
      weight: 10,
      make() {
        const pre = pick(['', '지금 ', '바로 ', '지금 바로 ']);
        const svgTag = pick(['SVG', 'svg']);
        const htmlTag = pick(['HTML', 'html']);
        const core = pick([
          '펠리컨이 자전거를 타는 ' + svgTag + '의 ' + htmlTag,
          '자전거 타는 펠리컨 ' + svgTag + ' ' + htmlTag,
          svgTag + ' 펠리컨 자전거 타기 ' + htmlTag,
        ]);
        const suf = pick(['', ' 파일', ' 페이지']);
        const tail = pick([' 만들어줘', ' 만들어 주세요', ' 작성해줘', ' 생성해 주세요']);
        return pre + core + suf + tail;
      },
    },
    {
      lang: 'fr',
      weight: 4,
      make() {
        const pre = pick(['', 'Maintenant, ', 'Tout de suite, ', 'Vite, ']);
        let verb = pick(['crée', 'fais', 'génère', 'écris']);
        if (!pre) verb = verb[0].toUpperCase() + verb.slice(1);
        const body = pick([
          'un HTML avec un SVG de pélican à vélo',
          'un fichier HTML avec un SVG de pélican sur un vélo',
          'un SVG de pélican qui fait du vélo en HTML',
        ]);
        return pre + verb + ' ' + body;
      },
    },
    {
      lang: 'de',
      weight: 3,
      make() {
        const pre = pick(['', 'Jetzt ', 'Sofort ', 'Bitte ']);
        let verb = pick(['erstelle', 'mache', 'schreibe', 'generiere']);
        if (!pre) verb = verb[0].toUpperCase() + verb.slice(1);
        const body = pick([
          'ein HTML mit einem Fahrrad fahrenden Pelikan als SVG',
          'eine HTML-Datei eines SVG-Pelikans auf einem Fahrrad',
          'einen Pelikan auf dem Fahrrad als SVG im HTML',
        ]);
        return pre + verb + ' ' + body;
      },
    },
    {
      lang: 'es',
      weight: 3,
      make() {
        const pre = pick(['', 'Ahora ', 'De inmediato ', 'Por favor ']);
        let verb = pick(['crea', 'haz', 'genera', 'escribe']);
        if (!pre) verb = verb[0].toUpperCase() + verb.slice(1);
        const body = pick([
          'un HTML de un pelícano en bicicleta en SVG',
          'un archivo HTML con un SVG de un pelícano montando bicicleta',
          'un SVG de pelícano en bicicleta en HTML',
        ]);
        return pre + verb + ' ' + body;
      },
    },
  ];

  function pickWeighted(items, weightFn) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return null;
    const weights = list.map(x => Math.max(1, Number(weightFn ? weightFn(x) : x?.weight) || 1));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = randomInt(total);
    for (let i = 0; i < list.length; i++) {
      if (r < weights[i]) return list[i];
      r -= weights[i];
    }
    return list[0];
  }

  function svg() {
    return unique('gacha:svg-prompts:v2', () => {
      const lastKey = 'gacha:pelican-svg-last-lang:v2';
      const lastLang = String(Store.get(lastKey, '') || '');
      const pool = PELICAN_SHORT_BANKS.filter(b => b.lang !== lastLang);
      const bank = pickWeighted(pool.length ? pool : PELICAN_SHORT_BANKS, b => b.weight) || PELICAN_SHORT_BANKS[0];
      try { Store.set(lastKey, bank.lang); } catch {}
      return bank.make();
    });
  }
  async function custom(text) {
    text = String(text || '').trim(); if (!text) throw Error('请先设置自定义提示词');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
    const key = 'gacha:custom-nonces:v1:' + hash;
    const used = new Set((Store.get(key, []) || []).filter(n => Number.isInteger(n) && n >= 1000 && n <= 9999));
    if (used.size >= 9000) throw Error('该提示词的 9000 个四位前缀已全部使用，请修改提示词后再抽卡');
    let n = 1000 + randomInt(9000);
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
  const PROBE_POOL_CATEGORIES = Object.freeze({
    svg_micro: [
      '内联一个极简 2D 动态 SVG 状态徽章（仅用 3～4 个基础几何图形如圆环、指针或脉冲点，带平滑循环动效）',
      '包含一个轻量 2D 动态内联 SVG 几何图标（最多 3～4 个基础 SVG 图元，呈现旋转、呼吸或脉冲动画）',
    ],
    html_card: [
      '绘制一个紧凑型 2D 动态内联 SVG 指示器（控制在 3～4 个简单几何标签以内，带连续柔和过渡动效）',
      '嵌入一个精简 2D 动态内联 SVG 徽标（仅含 3～4 个基础几何形状与循环动画）',
    ],
    css_fx: [
      '内联一个带 CSS 变量流光与 2D 动态 SVG 环形刻度的微型仪表徽章（控制在 3～4 个基础 SVG 图元以内）',
      '构建一个含柔和呼吸渐变与 2D 动态内联 SVG 脉冲波纹的极简指示卡（仅用 3～4 个基础几何图形）',
    ],
    data_viz: [
      '内联一个 2D 动态 SVG 微型水位/频谱状态图（仅用 3～4 个基础几何柱条或圆弧，带平滑循环过渡动效）',
      '嵌入一个 2D 动态内联 SVG 迷你遥测环形指示器（控制在 3～4 个简单几何图元以内，呈现连续动态变化）',
    ],
  });
  function probeSalt(len = 4) {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < len; i++) s += chars[randomInt(chars.length)];
    return s;
  }
  function probeFromPool(category = '', preferFast = true) {
    const cats = Object.keys(PROBE_POOL_CATEGORIES);
    const chosenCat = (category && PROBE_POOL_CATEGORIES[category]) ? category : (preferFast ? pick(['svg_micro', 'html_card', 'css_fx', 'data_viz']) : pick(cats));
    return { category: chosenCat, scene: pick(PROBE_POOL_CATEGORIES[chosenCat]), salt: probeSalt(4) };
  }
  const _promptReplayRing = new Map();
  function polymorphPrompt3D(basePrompt, accountKey = 'default') {
    const raw = String(basePrompt || '').trim();
    if (!raw) return { prompt: raw, repeatCount: 0, mutated: false, salt: '' };
    const k = String(accountKey || 'default') + '::' + raw.replace(/\s*\[ref:[0-9a-z]{3,8}\]\s*$/i, '').toLowerCase();
    const prev = _promptReplayRing.get(k) || 0;
    const repeatCount = prev + 1;
    _promptReplayRing.set(k, repeatCount);
    if (_promptReplayRing.size > 256) {
      const firstKey = _promptReplayRing.keys().next().value;
      if (firstKey !== undefined) _promptReplayRing.delete(firstKey);
    }
    if (repeatCount === 1) {
      return { prompt: raw, repeatCount: 1, mutated: false, salt: '' };
    }
    const salt = probeSalt(4);
    const hasRef = /\[ref:[0-9a-z]{3,8}\]\s*$/i.test(raw);
    const mutatedPrompt = hasRef
      ? raw.replace(/\[ref:[0-9a-z]{3,8}\]\s*$/i, `[ref:${salt}]`)
      : `${raw} [ref:${salt}]`;
    return { prompt: mutatedPrompt, repeatCount, mutated: true, salt };
  }
  function habit() {
    // 极速两步微缩探针（融合千面助手 v9.2 四分类防重探针池与随机盐）：不指定 write_file 工具名、不写死文件名格式（自然暴露下划线/连字符与 bash/write 偏好），
    // 通过「保存 35~45 行 HTML+SVG 微缩徽章 + 1 条终端命令核对行数/字节数 + 中文加粗要点简述」在单轮 6~10 秒内点亮全部 20 维习惯特征
    return unique('gacha:habit-prompts:v1', () => {
      const words = sampleWords(AUTOQA_WORDS, 3);
      const num = 10 + randomInt(89);
      const { scene: svgScene, salt } = probeFromPool('', true);
      const themePair = `${words[0]} / ${words[1]}`;
      const badgeTitle = `${words[0].toUpperCase()} · ${words[2].toUpperCase()} #${num} [${salt}]`;
      const step1 = pick([
        `请在工作区创建并保存一个自包含的单文件 \`.html\` 卡片（文件名自拟，需包含主题词 ${themePair}），页面展示标题「${badgeTitle}」并${svgScene}，整个 HTML 文件控制在 35～45 行以内。`,
        `请在工作区中保存一个独立的单文件 \`.html\` 微缩面板（文件名请结合主题词 ${themePair} 自拟），渲染代号「${badgeTitle}」并${svgScene}，总代码保持在 35～45 行以内。`,
        `请生成一个自包含的 \`.html\` 徽章文件保存到工作区（文件名由你根据主题词 ${themePair} 自由命名），显示标签「${badgeTitle}」并${svgScene}，全文严格控制在 35～45 行以内。`
      ]);
      const step2 = pick([
        '保存后请执行一条终端命令自检同时查看该文件的行数、字节数并统计 SVG 图元标签数量以确认落盘，最后用中文列出 2～3 条简短的加粗要点总结你的设计与动效实现，不要调用提问工具。',
        '文件生成后请运行一条轻量终端命令同时核对文件行数、字节大小及 SVG 几何标签数量，随后在回复中用中文分 2～3 条加粗要点简述核心样式与动画细节，不要调用提问工具。',
        '完成后请用一条简短的终端命令检查生成的行数与字节数并核验 SVG 图元个数，并在回复末尾用中文给出 2～3 条加粗要点说明实现亮点，不要调用提问工具。'
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

  const PELICAN_I18N_POOL = [
    { lang: '中文(简)', text: '创建一个新 HTML，使用 SVG 绘制一个鹈鹕骑自行车的 2D 动画。页面中只展示自动播放、循环播放的动画，不要解释、说明文字、按钮、菜单或任何交互功能，不需要任何测试。' },
    { lang: '中文(繁)', text: '建立一個新的 HTML，使用 SVG 繪製一個鵜鶘騎自行車的 2D 動畫。頁面中只展示自動播放、循環播放的動畫，不要解釋、說明文字、按鈕、選單或任何互動功能，不需要任何測試。' },
    { lang: 'English', text: 'Create a new HTML file that uses SVG to draw a 2D animation of a pelican riding a bicycle. The page must only display the auto-playing, looping animation, with no explanations, descriptive text, buttons, menus, or any interactive features, and no tests are needed.' },
    { lang: '日本語', text: '新しいHTMLを作成し、SVGを使用してペリカンが自転車に乗っている2Dアニメーションを描画してください。ページには自動再生・ループ再生されるアニメーションのみを表示し、説明やテキスト、ボタン、メニュー、インタラクティブな機能は一切含めず、テストも不要です。' },
    { lang: '한국어', text: '새로운 HTML을 생성하고 SVG를 사용하여 펠리컨이 자전거를 타는 2D 애니메이션을 그리세요. 페이지에는 자동 재생 및 무한 반복되는 애니메이션만 표시하고, 설명이나 안내 문구, 버튼, 메뉴 또는 어떠한 상호작용 기능도 넣지 마세요. 테스트도 필요하지 않습니다.' },
    { lang: 'Français', text: 'Créez un nouveau fichier HTML utilisant SVG pour dessiner une animation 2D d\'un pélican faisant du vélo. La page doit uniquement afficher l\'animation en lecture automatique et en boucle, sans explications, texte descriptif, boutons, menus ni aucune fonctionnalité interactive, et aucun test n\'est nécessaire.' },
    { lang: 'Deutsch', text: 'Erstellen Sie eine neue HTML-Datei, die mithilfe von SVG eine 2D-Animation eines fahrradfahrenden Pelikans zeichnet. Die Seite darf nur die automatisch abspielende, in einer Endlosschleife laufende Animation anzeigen – ohne Erklärungen, Beschreibungstexte, Schaltflächen, Menüs oder interaktive Funktionen; Tests sind nicht erforderlich.' },
    { lang: 'Español', text: 'Crea un nuevo archivo HTML utilizando SVG para dibujar una animación 2D de un pelícano montando en bicicleta. La página solo debe mostrar la animación en reproducción automática y en bucle, sin explicaciones, textos descriptivos, botones, menús ni ninguna función interactiva, y no se necesita ninguna prueba.' },
    { lang: 'Русский', text: 'Создайте новый HTML-файл, использующий SVG для отрисовки 2D-анимации пеликана, едущего на велосипеде. На странице должна отображаться только автоматически воспроизводимая зацикленная анимация — без пояснений, текста, кнопок, меню или любых интерактивных элементов; никакие тесты не нужны.' },
    { lang: 'Italiano', text: 'Crea un nuovo file HTML utilizzando SVG per disegnare un\'animazione 2D di un pellicano che va in bicicletta. La pagina deve mostrare esclusivamente l\'animazione con riproduzione automatica e in loop, senza spiegazioni, testi descrittivi, pulsanti, menu o qualsiasi funzione interattiva, e non è necessario alcun test.' },
    { lang: 'Português', text: 'Crie um novo arquivo HTML usando SVG para desenhar uma animação 2D de um pelicano andando de bicicleta. A página deve exibir apenas a animação com reprodução automática e em loop, sem explicações, textos descritivos, botões, menus ou qualquer recurso interativo, e nenhum teste é necessário.' },
    { lang: 'Nederlands', text: 'Maak een nieuw HTML-bestand dat met behulp van SVG een 2D-animatie tekent van een pelikaan op een fiets. De pagina mag alleen de automatisch afspelende, herhalende animatie tonen, zonder uitleg, beschrijvende tekst, knoppen, menu\'s of enige interactieve functies, en er zijn geen tests nodig.' },
    { lang: 'Polski', text: 'Utwórz nowy plik HTML używający SVG do narysowania animacji 2D przedstawiającej pelikana jadącego na rowerze. Strona ma wyświetlać wyłącznie automatycznie odtwarzaną, zapętloną animację, bez wyjaśnień, tekstów opisowych, przycisków, menu ani żadnych funkcji interaktywnych; żadne testy nie są potrzebne.' },
    { lang: 'Türkçe', text: 'SVG kullanarak bisiklet süren bir pelikanın 2D animasyonunu çizen yeni bir HTML oluşturun. Sayfada yalnızca otomatik oynatılan ve döngüye alınan animasyon gösterilmelidir; açıklama, metin, düğme, menü veya herhangi bir etkileşimli özellik olmamalıdır ve hiçbir teste gerek yoktur.' },
    { lang: 'Tiếng Việt', text: 'Tạo một tệp HTML mới sử dụng SVG để vẽ hoạt ảnh 2D một chú bồ nông đang đạp xe. Trang chỉ hiển thị hoạt ảnh tự động phát và lặp lại liên tục, không có giải thích, văn bản mô tả, nút bấm, menu hay bất kỳ tính năng tương tác nào, và không cần bất kỳ bài kiểm tra nào.' },
    { lang: 'Bahasa Indonesia', text: 'Buat file HTML baru menggunakan SVG untuk menggambar animasi 2D burung pelikan yang sedang mengendarai sepeda. Halaman hanya boleh menampilkan animasi yang diputar otomatis dan berulang, tanpa penjelasan, teks deskripsi, tombol, menu, atau fitur interaktif apa pun, serta tidak memerlukan pengujian apa pun.' },
    { lang: 'ไทย', text: 'สร้างไฟล์ HTML ใหม่โดยใช้ SVG เพื่อวาดแอนิเมชัน 2 มิติของนกกระทุงกำลังปั่นจักรยาน ในหน้าเว็บให้แสดงเฉพาะแอนิเมชันที่เล่นอัตโนมัติและวนซ้ำเท่านั้น โดยไม่ต้องมีคำอธิบาย ข้อความ ปุ่ม เมนู หรือฟีเจอร์โต้ตอบใดๆ และไม่จำเป็นต้องมีการทดสอบใดๆ' },
    { lang: 'Svenska', text: 'Skapa en ny HTML-fil som använder SVG för att rita en 2D-animation av en pelikan som cyklar. Sidan ska endast visa den automatiskt spelande och loopande animationen, utan förklaringar, beskrivande text, knappar, menyer eller några interaktiva funktioner, och inga tester behövs.' },
    { lang: 'Čeština', text: 'Vytvořte nový soubor HTML využívající SVG k vykreslení 2D animace pelikána jedoucího na kole. Stránka musí zobrazovat pouze automaticky přehrávanou animaci ve smyčce, bez vysvětlení, popisného textu, tlačítek, nabídek nebo jakýchkoli interaktivních prvků, a nejsou potřeba žádné testy.' },
    { lang: 'Українська', text: 'Створіть новий HTML-файл, використовуючи SVG для малювання 2D-анімації пелікана, який їде на велосипеді. На сторінці має відображатися лише анімація з автовідтворенням та зацикленням, без пояснень, текстових описів, кнопок, меню чи будь-яких інтерактивних функцій, і жодні тести не потрібні.' },
    { lang: 'Română', text: 'Creați un fișier HTML nou folosind SVG pentru a desena o animație 2D cu un pelican care merge pe bicicletă. Pagina trebuie să afișeze doar animația redată automat și în buclă, fără explicații, text descriptiv, butoane, meniuri sau orice funcții interactive, și nu este nevoie de niciun test.' },
    { lang: 'Ελληνικά', text: 'Δημιουργήστε ένα νέο αρχείο HTML χρησιμοποιώντας SVG για να σχεδιάσετε ένα 2D κινούμενο σχέδιο ενός πελεκάνου που κάνει ποδήλατο. Η σελίδα πρέπει να εμφανίζει μόνο το κινούμενο σχέδιο σε αυτόματη και επαναλαμβανόμενη αναπαραγωγή, χωρίς εξηγήσεις, κείμενο, κουμπιά, μενού ή διαδραστικές λειτουργίες, και δεν χρειάζονται δοκιμές.' },
    { lang: 'العربية', text: 'أنشئ ملف HTML جديدًا يستخدم SVG لرسم رسوم متحركة ثنائية الأبعاد لبجعة تقود دراجة هوائية. يجب أن تعرض الصفحة فقط الرسوم المتحركة التي تعمل تلقائيًا وبشكل متكرر، بدون أي شرح أو نصوص توضيحية أو أزرار أو قوائم أو أي ميزات تفاعلية، ولا حاجة لأي اختبارات.' },
    { lang: 'हिन्दी', text: 'एक नया HTML बनाएं जो साइकिल चलाते हुए पेलिकन का 2D एनीमेशन बनाने के लिए SVG का उपयोग करता हो। पेज में केवल ऑटो-प्ले और लूप होने वाला एनीमेशन ही दिखना चाहिए, कोई व्याख्या, विवरण पाठ, बटन, मेनू या कोई इंटरैक्टिव फ़ीचर नहीं होना चाहिए, और किसी परीक्षण की आवश्यकता नहीं है।' },
  ];

  function makePelicanSuffix11D6L() {
    let digits = String(1 + randomInt(9));
    for (let i = 0; i < 10; i++) digits += String(randomInt(10));
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let letters = "";
    for (let i = 0; i < 6; i++) letters += alpha[randomInt(alpha.length)];
    return digits + letters;
  }

  function buildRandomPelicanTestPrompt() {
    const HKEY = "gacha:pelican-i18n-history:v1";
    let hist = Store.get(HKEY, []);
    if (!Array.isArray(hist)) hist = [];
    const lastLang = hist.length ? hist[hist.length - 1].lang : "";
    const i18nWeight = lang => {
      if (lang === '中文(繁)') return 24;
      if (lang === 'English') return 24;
      if (lang === '日本語') return 22;
      if (lang === '한국어') return 20;
      if (lang === '中文(简)') return 3;
      return 1;
    };
    const cands = PELICAN_I18N_POOL.filter(x => x.lang !== lastLang);
    const chosen = pickWeighted(cands.length ? cands : PELICAN_I18N_POOL, x => i18nWeight(x.lang)) || PELICAN_I18N_POOL[1];
    const usedSuffixes = new Set(hist.map(h => h.suffix));
    let suffix = makePelicanSuffix11D6L();
    for (let g = 0; g < 15 && usedSuffixes.has(suffix); g++) suffix = makePelicanSuffix11D6L();
    const prompt = chosen.text + " " + suffix;
    hist.push({ lang: chosen.lang, suffix, at: Date.now() });
    if (hist.length > 60) hist = hist.slice(-60);
    Store.set(HKEY, hist);
    return { prompt, lang: chosen.lang, suffix };
  }

  const DIVERSE_MICRO_PROBES_V13 = [
    "帮我把下面这份办公文具领用记录按数量从少到多排成三行：\n签字笔 24 支、记事本 9 本、长尾夹 15 盒",
    "请把这三项厨房食材按克重从轻到重分成三行写出来：\n面粉 450 克、黄油 85 克、细砂糖 160 克",
    "帮我将以下三条快递货架编号按包裹数从多到少列成三行：\nA区货架 31 件、B区货架 12 件、C区货架 48 件",
    "请把下面三本借阅图书按页数从厚到薄排成三行：\n历史年表 410 页、植物图鉴 185 页、天文入门 290 页",
    "帮我把这三杯饮品的制作温度从低到高排成三行：\n冷萃咖啡 4℃、温牛奶 52℃、红茶拿铁 78℃",
    "请把下面三段慢跑打卡记录按里程从短到长列成三行：\n周二晨跑 4.2 公里、周四夜跑 6.8 公里、周六公园跑 3.5 公里",
    "帮我将三盆阳台绿植的浇水间隔按天数从短到长排成三行：\n薄荷 2 天、虎皮兰 14 天、绿萝 5 天",
    "请把这三个会议室的座位容量按人数从少到多分成三行：\n兰花厅 8 人、松柏厅 26 人、竹林厅 14 人",
    "帮我把以下三趟城际班车的发车耗时按分钟数从短到长排成三行：\n早班车 42 分钟、午间车 29 分钟、晚班车 55 分钟",
    "请将这三款充电宝的额定容量按毫安时从小到大列成三行：\n便携款 5000mAh、旅行款 20000mAh、日常款 10000mAh",
    "帮我把下面三箱水果的净重按斤数从重到轻排成三行：\n脐橙 18 斤、脆柿 9 斤、香梨 14 斤",
    "请把这三张水电账单的金额按数字从低到高列成三行：\n水费 46 元、燃气费 118 元、电费 235 元"
  ];

  const PROBE_POOL_VERSION = "probe-pool-v1";
  const PROBE_POOL_STORAGE = "arena-agent-billing:probe-pool:v1";
  const PROBE_POOL_LOG_LIMIT = 50;
  const PROBE_POOL_SUMMARY_MAX = 40;
  const PROBE_POOL = [
    { id: "P01", first: "帮我把下面这段小组例会的记录收成三条要点，别加自己的评论。", material: "例会记录：\n值班表、报销单、团建时间", ask: "请用 50 到 100 个字回答：写成三条要点，一行一条。" },
    { id: "P02", first: "手边有一份读书清单，麻烦按页数从少到多帮我排一下。", material: "《城南旧事》218 页\n《活着》156 页\n《围城》302 页", ask: "用 50 到 100 个字回答：按页数从少到多，一行一本。" },
    { id: "P03", first: "这份租车结算单的信息有点散，我想先把关键字段抠出来。", material: "租车单：车型 朗逸；取车 10 月 3 日；还车 10 月 6 日；押金 500", ask: "请用 50 到 100 个字回答：字段名与取值一行一条。" },
    { id: "P04", first: "数一下下面这段场地说明里“备用”这个词出现了几次，顺便标出所在句子。", material: "场地说明：备用电源 2 处，备用桌椅 4 套，其余物资已清点，备用区暂不开放。", ask: "用 50 到 100 个字回答：先给次数，再说分别在哪一句。" },
    { id: "P05", first: "几个维修工单的日期顺序乱了，你能替我理一下先后吗？", material: "工单：3 月 8 日 换灯；3 月 2 日 修门；3 月 15 日 通下水", ask: "请用 50 到 100 个字回答：按日期从早到晚排，一行一条。" },
    { id: "P06", first: "这周的天气播报稿太长，帮我压成三句话。", material: "播报稿：\n周三晴 12–20℃；周四阴有小雨；周五转晴", ask: "用 50 到 100 个字回答：压成三句话，别加评论。" },
    { id: "P07", first: "我不太确定公里和英里怎么换算，下面这组里程你能不能统一成公里？", material: "里程：\n3.5 英里、8 英里、12.4 英里", ask: "请用 50 到 100 个字回答：全部换成公里，保留一位小数。" },
    { id: "P08", first: "两份物资申领单合在一起以后有重复，帮我判断哪些是重复项。", material: "甲单：帐篷 2、睡袋 4\n乙单：睡袋 4、手电 3", ask: "用 50 到 100 个字回答：先列重复项，再列只在一边的。" },
    { id: "P09", first: "有个包裹面单的内容我抄下来了，需要你拆成字段。", material: "面单：收件人 李；电话 1380000；地址 光明路 7 号；到付", ask: "请用 50 到 100 个字回答：拆成字段，一行一条。" },
    { id: "P10", first: "冰箱里剩下的东西我列了一下，想按类别归归拢。", material: "冰箱：鸡蛋 6 个、酸奶 2 盒\n冷藏室还有半棵白菜、一块豆腐", ask: "用 50 到 100 个字回答：按类别归拢，每类一行。" },
    { id: "P11", first: "说明书这段我读着费劲，你替我提炼要点。", material: "说明书：首次使用先空烧 5 分钟；每次用完擦干；勿浸水。", ask: "请用 50 到 100 个字回答：提炼成三条要点。" },
    { id: "P12", first: "排班表在下面，请把它改成一人一行的清单。", material: "排班：周一 早班 王、晚班 李\n周二 早班 赵", ask: "用 50 到 100 个字回答：改成一人一行，写清班次。" },
    { id: "P13", first: "仓库盘点的小票在这儿，帮我算一下总数。", material: "盘点：螺丝 120 个、垫片 3 包共 84 个、铰链 16 个", ask: "请用 50 到 100 个字回答：先给总数，再按品名列。" },
    { id: "P14", first: "昨晚那场球我看了一半，这段赛况帮我缩成几句。", material: "赛况：上半场 1:0；下半场连丢两球，终场 1:2。", ask: "用 50 到 100 个字回答：缩成两三句，说清比分。" },
    { id: "P15", first: "烤箱温度我拿不准，这里有一组摄氏读数，换算成华氏。", material: "烤箱：180℃、200℃、220℃", ask: "请用 50 到 100 个字回答：全部换成华氏，一行一个。" },
    { id: "P16", first: "两份书单看着差不多，帮我看看有没有重复的条目。", material: "书单甲：《活着》《围城》\n书单乙：《围城》《边城》", ask: "用 50 到 100 个字回答：指出重复条目，再说差异。" },
    { id: "P17", first: "课程表截图上的内容我打成了文字，需要抽出关键字段。", material: "课程：高等数学 周一 3-4 节 教三 201；英语 周三 1-2 节 教一 105", ask: "请用 50 到 100 个字回答：抽出课程、时间、地点三列。" },
    { id: "P18", first: "待办事项堆了一屏，麻烦按紧急程度重新排。", material: "待办：交报表（急）截止 10/12\n订机票（中）10/20\n整理照片（缓）11/05", ask: "用 50 到 100 个字回答：按紧急程度排，一行一条。" },
    { id: "P19", first: "实验记录写得比较碎，请归纳成一段简短说明。", material: "实验记录：\n第一批 3 次失败；第二批 1 次；第三批 2 次", ask: "用 50 到 100 个字回答：写成一段简短说明，含次数。" },
    { id: "P20", first: "报价单上有几个方案，按价格从低到高列一下。", material: "方案 A 报价 3200；方案 B 报价 2750；方案 C 报价 4100", ask: "请用 50 到 100 个字回答：按价格从低到高，一行一个。" },
    { id: "P21", first: "配方里用的是盎司，我只有克秤，帮我把单位统一。", material: "配方：黄油 4 盎司、糖 2 盎司", ask: "用 50 到 100 个字回答：换成克，一行一条。" },
    { id: "P22", first: "两个部门的名单要合并，注意重名与兼任的情况。", material: "技术部：张伟、李娜\n市场部：张伟（兼）、王强", ask: "请用 50 到 100 个字回答：合并名单，标出重名与兼任。" },
    { id: "P23", first: "出差行程的文字版在下面，请把车次和住宿信息抽出来。", material: "行程：G1234 次 10:05 开；住 如家 两晚；返程 D567 次", ask: "用 50 到 100 个字回答：抽车次与住宿，一行一条。" },
    { id: "P24", first: "几个会议邀请时间打架了，帮我排个先后并指出来。", material: "会议：9:30 评审；9:00 站会；11:00 面试", ask: "请用 50 到 100 个字回答：排出先后并指出冲突。" },
    { id: "P25", first: "这段社区活动的通稿有点长，缩成一小段。", material: "活动通稿：周六上午义诊，下午亲子手工，晚饭后有露天电影。", ask: "用 50 到 100 个字回答：缩成一小段，保留时间。" },
    { id: "P26", first: "候选方案各有评分，请按总分排序并给出前两名。", material: "评分：甲 82、乙 91、丙 76、丁 88", ask: "请用 50 到 100 个字回答：按总分排，给前两名。" },
    { id: "P27", first: "这页流水账里有若干笔支出，帮我按类别汇总笔数。", material: "流水：餐费 3 笔、交通 2 笔、打印 1 笔、餐费补记 1 笔", ask: "用 50 到 100 个字回答：按类别给笔数，一行一类。" },
    { id: "P28", first: "饮料配方写的是加仑，我想换成升。", material: "配方：加水 2 加仑、糖浆半加仑", ask: "请用 50 到 100 个字回答：换成升，保留一位小数。" },
    { id: "P29", first: "词条表里有些说法其实是同一个意思，帮我判断哪些可以合并。", material: "词条：\n“充电宝”“移动电源”\n“截图”“截屏”", ask: "用 50 到 100 个字回答：指出可合并的说法。" },
    { id: "P30", first: "设备台账抄在下面，请把编号、位置、状态三个字段分开列。", material: "台账：A-12 三楼主控 正常；B-07 地下泵房 待修", ask: "请用 50 到 100 个字回答：编号、位置、状态分三列。" },
    { id: "P31", first: "客服工单的原始描述在下面，帮我归类成一句话结论。", material: "工单原文：用户说 App 打不开，重启后仍旧，怀疑版本旧。", ask: "用 50 到 100 个字回答：归成一句话结论，再列可能原因。" },
    { id: "P32", first: "这份内部花名册的顺序是乱的，请按部门分组再按入职年份排。", material: "花名册：市场部 2019 入职 3 人；技术部 2021 入职 2 人", ask: "请用 50 到 100 个字回答：按部门分组、组内按年份排。" },
    { id: "P33", first: "药箱好久没清了，你帮我归归类。", material: "药箱：感冒药 2 盒（过期）、创可贴 1 包、退烧药 1 瓶", ask: "用 50 到 100 个字回答：按类别归拢，标出过期的。" },
    { id: "P34", first: "民宿退房前我挨屋转了一圈，东西有点乱。", material: "退房清点：\n主卧 台灯一个；厨房 锅铲两把；阳台 晾衣架", ask: "请用 50 到 100 个字回答：按房间归类，一行一间。" },
    { id: "P35", first: "合唱团群里刷了一屏排练安排，", material: "排练单：8日晚7点合练，12日下午2点走台；\n19日全天外地演出，6点半校门集合。", ask: "请用 50 到 100 个字回答：按时间归纳成要点，一行一条，写日期和事项。" },
    { id: "P36", first: "花店这周的进货条子攒了一沓，", material: "花店本周进货：红玫瑰60支、白玫瑰30支；\n多肉12盆、琴叶榕3盆；缎带3卷。", ask: "请用 50 到 100 个字回答：按品类归纳，一行一类，只写品名和数量。" },
    { id: "P37", first: "二手相机那笔交易我记了张单子，", material: "相机转让备忘：机身快门2万次，卡口有浅划痕；\n35mm定焦镜片一粒灰，附两块电池。", ask: "请用 50 到 100 个字回答：归纳成三行，行首写类别，瑕疵要留着。" },
    { id: "P38", first: "校运会借器材的条子我收了一叠，", material: "器材借还登记：起跑器4副缺2颗钉；接力棒8根，\n1根有磕痕；跳高垫2块，绑带断过。", ask: "请用 50 到 100 个字回答：归纳成一种器材一行，写名称、数量和借的班级。" },
    { id: "P39", first: "茶馆那几张会员卡规则写得太绕，", material: "储值卡充300送30，赠额不能单用；10次卡180元，不含茶点；\n家庭卡可登记3人。", ask: "请用 50 到 100 个字回答：一种卡归纳一行，写成「卡种：能用的范围」。" },
    { id: "P40", first: "宠物医院复诊完塞给我一张交代单，", material: "复诊交代：早晚饭后各半片，吐了隔2小时补；\n7天后复查血常规，来前4小时别喂食。", ask: "请用 50 到 100 个字回答：按用药、饮食、观察、复诊归纳，各写一行。" },
    { id: "P41", first: "快递驿站的取件通知堆了一屏，", material: "驿站到件：\n4821 昨15:18；0973 今09:05；7208 上周六12:30。", ask: "请用 50 到 100 个字回答：按到件时间排，一行一件，写尾数和时刻。" },
    { id: "P42", first: "甜品店门口的取号牌我拍下来了，", material: "取号：A017 13:20；B003 13:05；A012 13:12。", ask: "请用 50 到 100 个字回答：按取号时间从早到晚，只写号码和时间。" },
    { id: "P43", first: "图书馆书架上那几本书的页数我抄了，", material: "页数抄录：\n《山南旧事》312页；《桥下人家》194页；《河湾手记》406页。", ask: "请用 50 到 100 个字回答：按页数从少到多，一行一本，写书名和页数。" },
    { id: "P44", first: "青旅前台那张房价表我看不清，", material: "房价（平日）：六人间68、四人间88、双人间158、单人间128、帐篷位45。", ask: "请用 50 到 100 个字回答：按平日价从低到高，一行一种房型。" },
    { id: "P45", first: "登山队那份打卡表上的海拔我抄下来了，", material: "打卡点海拔：山门320米、凉亭760米、碎石坡1080米、垭口1450米。", ask: "请用 50 到 100 个字回答：按海拔从低到高，一行一个点，写名称和海拔。" },
    { id: "P46", first: "摄影比赛那批评分我整理不动了，", material: "初评：雨巷86/82/88，晨渡79/91/84，旧站93/87/90。", ask: "请用 50 到 100 个字回答：按平均分从高到低排，写作品名和分数。" },
    { id: "P47", first: "一箱老唱片的发行年份我记混了，", material: "唱片年份：南风夜曲1979、夏夜小调1983、河畔三重奏1971、远山回声1966。", ask: "请用 50 到 100 个字回答：按发行年份从早到晚，只写名称和年份。" },
    { id: "P48", first: "装修队给的工序表前后顺序乱，", material: "工序工期：拆旧2天、水电5天、防水3天、贴砖6天、木工4天、油漆7天。", ask: "请用 50 到 100 个字回答：按天数从少到多，一行一道工序。" },
    { id: "P49", first: "旧手机拿去以旧换新，报价我记了几条。", material: "检测记录：屏幕浅划痕；电池健康度78%，扣50；\n扬声器有杂音；电池官方换过。", ask: "请用 50 到 100 个字回答：按外观、电池、功能归并，一块一行，别写金额。" },
    { id: "P50", first: "露营前我把要带的东西列了一堆。", material: "露营清单：帐篷1顶、地钉12根、睡袋2个；\n炉子1个、气罐2瓶、头灯2个（1个不亮）。", ask: "请用 50 到 100 个字回答：按类别归并，一块一行，坏的必须标出来。" },
    { id: "P51", first: "篮球队体测成绩单在我手上，", material: "折返跑成绩：陈熙11.2秒、周牧12.8秒、林阔10.9秒、赵桓13.4秒。", ask: "请用 50 到 100 个字回答：按折返跑用时从少到多，只写姓名和用时。" },
    { id: "P52", first: "面包房的出炉时刻表贴歪了，", material: "出炉时刻：吐司6:50、法棍7:10、可颂7:40、碱水结8:00。", ask: "请用 50 到 100 个字回答：按出炉时刻排，一行一种，写名称和时刻。" },
    { id: "P53", first: "邮票册里那张面值表我抄下来了，", material: "面值记录：纪念票8分、普通票4分、欠资票2分、小型张1元2角。", ask: "请用 50 到 100 个字回答：按面值从小到大，一行一枚，写名称和面值。" },
    { id: "P54", first: "修车厂的工位排期我看花眼了，", material: "工位空档：1号9点到11点、2号8点半到10点、4号7点50到9点10。", ask: "请用 50 到 100 个字回答：按空闲开始时刻排，只写工位号和时段。" },
    { id: "P55", first: "种子袋上写的发芽天数我没记全，", material: "发芽天数：樱桃萝卜5-7天、小白菜3-5天、生菜7-10天、香菜10-15天。", ask: "请用 50 到 100 个字回答：按发芽天数从短到长，写菜名和天数。" },
    { id: "P56", first: "门诊预约那张单子我照着抄了下来，帮我抠字段。", material: "门诊预约：周敏，34岁，呼吸内科；\n就诊11月14日9:20，序号A36。", ask: "请用 50 到 100 个字回答：一行一个字段，写成「字段名＝取值」。" },
    { id: "P57", first: "宠物店寄养登记那张卡片，内容我要整理成字段。", material: "寄养卡：豆包，比熊，公，2岁半；主人陈立；\n入店12月3日，押金500，怕打雷。", ask: "请用 50 到 100 个字回答：每行一个字段，写成「字段名：取值」。" },
    { id: "P58", first: "婚宴回执的那一叠小纸条，帮我把信息归成字段。", material: "回执：李建国一家3口，出席，想坐主桌；\n赵小雨带1位同伴，吃素；孙老师要靠窗那桌。", ask: "请用 50 到 100 个字回答：一行一位客人，分「姓名／人数／备注」三列。" },
    { id: "P59", first: "农机租赁那份合同我摘了几行，需要拆成字段。", material: "租赁摘录：承租刘庆丰；机具久保田收割机；\n租期9月20日到10月5日，日租240元。", ask: "请用 50 到 100 个字回答：只列字段名和取值，一行一条，缺失写未填。" },
    { id: "P60", first: "琴行那张维修单我看不太懂，帮我抽出字段来。", material: "维修单：客户许安然；立式钢琴两键回弹慢；\n送修11月8日；调律180元，换毡垫30元。", ask: "请用 50 到 100 个字回答：输出两列，左边字段名右边取值，缺的写未填。" },
    { id: "P61", first: "茶站收茶的那张单据，帮我把字段抄明白。", material: "收购单：农户吴有田，上坑组；4月17日；\n毛重38斤，扣杂后按35斤；单价12元。", ask: "请用 50 到 100 个字回答：一行一个字段，用冒号分隔，没提的写未填。" },
    { id: "P62", first: "看房那天的记录我随手写了几行，需要提字段。", material: "看房记录：临江路9号院两室一厅，租2300；\n地铁口老楼一室一厅，租1900含物业。", ask: "请用 50 到 100 个字回答：先写房号，再写字段名和取值，缺的写未填。" },
    { id: "P63", first: "驾校那份学员档案，我想把里面的字段理出来。", material: "学员档案：郭春燕；报考C1，报名3月9日；\n科一94分，科二补考一次，教练是马师傅。", ask: "请用 50 到 100 个字回答：只输出字段与取值，一行一条，没填的写未填。" },
    { id: "P64", first: "中药房给的那张方子抄件，帮我拆成字段。", material: "药方抄件：田素芬；每日一剂，水煎两次；\n黄芪30克、当归12克，共12味，三味先煎。", ask: "请用 50 到 100 个字回答：一行一味药，写成「药名／用量」，说明也要。" },
    { id: "P65", first: "影楼那份拍摄订单，麻烦把关键字段挑出来。", material: "拍摄订单：客户郝佳，婚纱照11月2日拍；\n服装3套，定金1000，尾款取片时付清。", ask: "请用 50 到 100 个字回答：按「字段名：取值」一行一条，空栏写未填。" },
    { id: "P66", first: "民宿那本入住登记册，我想理成一列字段。", material: "登记册：谭姓住2晚；一家4口要带阳台房；\n有客人只留名和车牌后3位；押金200。", ask: "请用 50 到 100 个字回答：一行一位客人，列出登记到的字段，没写清的写未填。" },
    { id: "P67", first: "苗圃那张采购单我拍了照抄下来，帮我提字段。", material: "采购单：香樟胸径8厘米60株；红叶石楠高50厘米300株；\n草皮卷30块，货到付七成。", ask: "请用 50 到 100 个字回答：一行一项，格式「品名｜规格｜数量」，缺的写未填。" },
    { id: "P68", first: "车站失物登记那几行字，帮我分成字段。", material: "失物登记：黑色双肩包，周一早高峰拾于第二节车厢\n暂存值班室，已联系失主，人未到场", ask: "请用 50 到 100 个字回答：一行一件，写「物品／时间／状态」。" },
    { id: "P69", first: "菜市场这本摊位费流水，帮我按类别数一下。", material: "摊位费流水：蔬菜 4 笔×30 元，水果 3 笔×35 元\n猪肉 5 笔×50 元，水产 2 笔×45 元", ask: "请用 50 到 100 个字回答：一行一类，写「类别／笔数／金额」。" },
    { id: "P70", first: "图书馆还书记录里我标了一堆，帮我数一下。", material: "还书登记：十月八日 3 本，九日 5 本\n十日 2 本，十二日 7 本，逾期 1 本", ask: "请用 50 到 100 个字回答：一行一天，只写日期和逾期本数。" },
    { id: "P71", first: "花园那本种植清单，帮我数数各类有多少。", material: "花坛清单：月季 6 株、绣球 4 株\n薰衣草 10 株成活 7 株，郁金香球 40 个", ask: "请用 50 到 100 个字回答：一行一种，写「花名／株数」。" },
    { id: "P72", first: "驿站那份入库明细，帮我按公司统计件数。", material: "入库明细：通达 40 件，顺风 12 件\n京邦 8 件，极兔 15 件，京东 9 件", ask: "请用 50 到 100 个字回答：一行一家，写「公司／件数」。" },
    { id: "P73", first: "食堂这几天的采购记了几页，帮我算个数。", material: "食堂采购：周一白菜 40 斤、土豆 30 斤\n周二白菜 35 斤、豆腐 15 斤、鸡蛋 25 斤", ask: "请用 50 到 100 个字回答：一行一天，写「日期／斤数」。" },
    { id: "P74", first: "幼儿园点名册那几页，帮我数出勤人数。", material: "点名册：周一实到 24、请假 3\n周二实到 26、请假 1；周三实到 21", ask: "请用 50 到 100 个字回答：一行一天，写「实到／请假」。" },
    { id: "P75", first: "志愿者签到那几张表，帮我统计一下人次。", material: "志愿签到：周六上午 19 人，下午 14 人\n周日上午 22 人，下午 17 人", ask: "请用 50 到 100 个字回答：一行一场，写「场次／人次」。" },
    { id: "P76", first: "洗衣店那本收衣登记，帮我数一下件数。", material: "收衣单：衬衫 3 件，西裤 2 条\n床单 2 条，大衣 1 件，裤子 3 条", ask: "请用 50 到 100 个字回答：一行一类，写「品名／件数」。" },
    { id: "P77", first: "充电桩那页运行记录，帮我数故障次数。", material: "充电桩一号正常，二号上午故障 1 次\n四号下午故障 2 次，五号整晚离线", ask: "请用 50 到 100 个字回答：一行一台，写「桩号／故障次数」。" },
    { id: "P78", first: "陶艺工坊那本窑位记录，帮我数出总数。", material: "窑位记录：素烧杯 8 只、碗 5 只\n釉烧杯 7 只、盘 4 只、小摆件 5 件", ask: "请用 50 到 100 个字回答：一行一批，写「批次／件数」。" },
    { id: "P79", first: "老家院墙那段尺寸单你帮我看看", material: "西厢房外墙 12.5 英尺，门框上沿 6.75 英尺\n后院梯子横档 4.2 英尺", ask: "请用 50 到 100 个字回答：一行一条，写成「名目→米数」。" },
    { id: "P80", first: "楼上鱼缸那套管件尺寸我抄下来了", material: "鱼缸玻璃 0.47 英寸，进水管外径 1.25 英寸\n灯架横臂 11.8 英寸", ask: "请用 50 到 100 个字回答：一行一条，只写厘米数值。" },
    { id: "P81", first: "院里那家拳馆的装备单子你理理", material: "拳馆装备：大沙袋 120 磅，速度球 15 磅\n壶铃 18 磅，地垫 33 磅", ask: "请用 50 到 100 个字回答：一行一条，写成「器材→千克」。" },
    { id: "P82", first: "船厂订帆布的清单搁我桌上了", material: "帆布清单：主帆 38 码，防雨罩 26 码\n舱盖蒙布 5.5 码", ask: "请用 50 到 100 个字回答：一行一条，项目后跟米数。" },
    { id: "P83", first: "山脚那间库房的面积表你看得懂吗", material: "库房面积表：主仓 2450 平方英尺\n副仓 980，装卸平台 620", ask: "请用 50 到 100 个字回答：一行一条，写成「区域→平方米」。" },
    { id: "P84", first: "车队长途那条线的限速牌我记了一路", material: "限速牌：出城 45 迈，弯道 35 迈\n隧道 50 迈，大桥 55 迈", ask: "请用 50 到 100 个字回答：一行一条，单位用米每秒。" },
    { id: "P85", first: "库房那几只储罐的容积表给你", material: "储罐容积：一号 32.5 立方米\n二号 31.9，消防水罐 120 立方米", ask: "请用 50 到 100 个字回答：一行一条，写成「罐体→立方英尺」。" },
    { id: "P86", first: "花园那几瓶营养液的配比你看看", material: "营养液配比：开花肥 2 品脱\n生根粉 3 品脱，除虫乳油 0.4 品脱", ask: "请用 50 到 100 个字回答：一行一条，只写毫升数值。" },
    { id: "P87", first: "田里那几块地的面积我记了个大概", material: "地块面积：东大片 12 亩，西洼地 8.5 亩\n南坡 4.2 亩，秧田 1.6 亩", ask: "请用 50 到 100 个字回答：一行一条，写成「地块→平方米」。" },
    { id: "P88", first: "灯杆那批电表读数你帮我转一下", material: "电表读数：东环路 2140 千瓦时\n公园步道 3020，桥下 640 千瓦时", ask: "请用 50 到 100 个字回答：一行一条，单位用兆焦。" },
    { id: "P89", first: "厨房墙上那张能量表你给看看", material: "能量表：红烧鸡腿 320 千卡\n米饭 230 千卡，紫菜汤 60 千卡", ask: "请用 50 到 100 个字回答：一行一条，写成「菜名→千焦」。" },
    { id: "P90", first: "茶厂那台烘干机的耗热记录在这", material: "烘干机耗热：萎凋槽 24 万英热单位\n初烘 32 万，足烘 41 万英热单位", ask: "请用 50 到 100 个字回答：一行一条，工序后跟千焦数。" },
    { id: "P91", first: "港区拖轮那条日志你帮我换算下", material: "拖轮日志：出海航道 9 节，进港 6 节\n靠泊 3 节，备用待命 11 节", ask: "请用 50 到 100 个字回答：一行一条，单位用公里每小时。" },
    { id: "P92", first: "珠宝店那几颗裸石的重量单给你", material: "裸石重量：主石 1.25 克拉\n配石 6 颗每颗 0.18 克拉，吊坠 2.1 克拉", ask: "请用 50 到 100 个字回答：一行一条，写成「石料→克」。" },
    { id: "P93", first: "柜子里翻出张老地契上面数你认认", material: "老地契：北坡林地 46 英亩\n南坡草场 18.5 英亩，水塘 7.2 英亩", ask: "请用 50 到 100 个字回答：一行一条，写成「地块→公顷」。" },
    { id: "P94", first: "铺子里那卷海图上的航程我抄了一段", material: "海图航程：码头到浮标 3.4 海里\n东礁灯塔 12.6 海里，环岛 33 海里", ask: "请用 50 到 100 个字回答：一行一条，只写航段和公里数。" },
    { id: "P95", first: "桥下那批报修单里的加急件你数数", material: "报修单：1 号伸缩缝加急，2 号护栏加急\n3 号路灯普通，4 号支座垫石加急", ask: "请用 50 到 100 个字回答：一行一条，写「编号／是否加急」。" },
    { id: "P96", first: "账上这页缴费记录你帮我归类统计", material: "缴费记录：物业费 1280 元\n公共电费 316 元、288 元，水管维修 780 元", ask: "请用 50 到 100 个字回答：一行一类，写「项目／笔数／合计」。" },
    { id: "P97", first: "蜂场那本检查记录你帮我统计下", material: "蜂箱检查：1 号新王，3 号缺王\n6 号缺王，8 号老王", ask: "请用 50 到 100 个字回答：一行一类，写「类型／箱数」。" },
    { id: "P98", first: "出苗单上每块的株数我数不清，你帮我合计一下。", material: "出苗单：香樟 1200 株、桂花 860 株\n杜鹃 640 株、女贞 1750 株", ask: "请用 50 到 100 个字回答：一行一种，写「品种／株数」。" },
    { id: "P99", first: "塔吊那几页班次记录我看着头晕", material: "塔吊班次：早班停机 25 分钟\n中班无停机，晚班停机 40 分钟", ask: "请用 50 到 100 个字回答：一行一班，写「班次／原因／时长」。" },
    { id: "P100", first: "锅贴铺那张订货单你帮我算算", material: "锅贴订货：鲜肉 30 份，素三鲜 18 份\n虾仁 12 份，小米粥 40 份", ask: "请用 50 到 100 个字回答：一行一类，写「品类／份数／金额」。" },
  ];

  function probePoolText(entry) { return entry.first + "\n\n" + entry.material + "\n\n" + entry.ask; }
  function probePoolFirstSentence(entry) { return String(entry.first || "").trim(); }
  function probePoolHash(list) {
    let hash = 0x811c9dc5;
    for (const entry of list) {
      const text = entry.id + "\u0000" + entry.first + "\u0000" + entry.material + "\u0000" + entry.ask + "\u0001";
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
    return "fnv1a32:" + hash.toString(16).padStart(8, "0");
  }
  function probePoolFind(id) { return PROBE_POOL.find(e => e.id === id) || null; }
  function probePoolUsedIds(store) {
    const kept = new Set((store?.used || []).filter(id => !!probePoolFind(id)));
    return PROBE_POOL.filter(e => kept.has(e.id)).map(e => e.id);
  }
  function probePoolReadStore() {
    const raw = Store.get(PROBE_POOL_STORAGE, null);
    const parsed = (raw && typeof raw === "object") ? raw : {};
    const used = Array.isArray(parsed.used) ? parsed.used.slice() : [];
    const normUsed = probePoolUsedIds({ used });
    const cycle = Number.isFinite(Number(parsed.cycle)) && Number(parsed.cycle) >= 1 ? Math.floor(Number(parsed.cycle)) : 1;
    const usedTotal = Number.isFinite(Number(parsed.usedTotal)) && Number(parsed.usedTotal) >= 0 ? Math.floor(Number(parsed.usedTotal)) : normUsed.length;
    return {
      cycle,
      used: normUsed,
      usedTotal,
      last: (parsed.last && typeof parsed.last === "object") ? { id: String(parsed.last.id || ""), at: Number(parsed.last.at) || 0 } : null,
      log: Array.isArray(parsed.log) ? parsed.log.slice(-PROBE_POOL_LOG_LIMIT) : [],
    };
  }
  function probePoolWriteStore(store) {
    Store.set(PROBE_POOL_STORAGE, {
      version: PROBE_POOL_VERSION,
      poolHash: probePoolHash(PROBE_POOL),
      cycle: Number(store.cycle) || 1,
      used: (store.used || []).slice(),
      usedTotal: Number(store.usedTotal) || 0,
      last: store.last || null,
      log: (store.log || []).slice(-PROBE_POOL_LOG_LIMIT),
    });
  }
  function probePoolNext(usedIds, lastId) {
    const used = new Set(usedIds || []);
    const remaining = PROBE_POOL.filter(e => !used.has(e.id));
    if (remaining.length) return remaining[0];
    const fresh = PROBE_POOL.filter(e => e.id !== lastId);
    return fresh[0] || PROBE_POOL[0] || null;
  }
  function probePoolInfo() {
    const store = probePoolReadStore();
    const used = probePoolUsedIds(store);
    const total = PROBE_POOL.length;
    const lastId = store.last ? store.last.id : null;
    const next = probePoolNext(used, lastId);
    const usedTotal = Math.max(Number(store.usedTotal) || 0, used.length);
    return {
      version: PROBE_POOL_VERSION,
      poolHash: probePoolHash(PROBE_POOL),
      total,
      used: used.length,
      usedInCycle: used.length,
      remaining: total - used.length,
      usedTotal,
      cycle: Number(store.cycle) || 1,
      next: next ? { id: next.id, firstSentence: probePoolFirstSentence(next) } : null,
    };
  }
  function probePoolDraw() {
    const total = PROBE_POOL.length;
    if (!total) return null;
    const store = probePoolReadStore();
    const used = probePoolUsedIds(store);
    const usedSet = new Set(used);
    const previousId = store.last ? store.last.id : null;
    let cycle = Number(store.cycle) || 1;
    let usedTotal = Math.max(Number(store.usedTotal) || 0, used.length);
    let candidates = PROBE_POOL.filter(e => !usedSet.has(e.id));
    if (!candidates.length) {
      cycle += 1;
      used.length = 0;
      candidates = PROBE_POOL.filter(e => e.id !== previousId);
      if (!candidates.length) candidates = PROBE_POOL.slice();
    }
    const entry = candidates[randomInt(candidates.length)];
    const text = probePoolText(entry);
    const nextUsed = used.concat([entry.id]);
    usedTotal += 1;
    const at = Date.now();
    const record = {
      at,
      id: entry.id,
      firstSentence: probePoolFirstSentence(entry),
      text,
      version: PROBE_POOL_VERSION,
      poolHash: probePoolHash(PROBE_POOL),
      cycle,
      used: nextUsed.length,
      usedTotal,
      remaining: PROBE_POOL.length - nextUsed.length,
    };
    store.cycle = cycle;
    store.used = probePoolUsedIds({ used: nextUsed });
    store.usedTotal = usedTotal;
    store.last = { id: entry.id, at };
    store.log = (store.log || []).concat([record]).slice(-PROBE_POOL_LOG_LIMIT);
    probePoolWriteStore(store);
    return { id: entry.id, firstSentence: record.firstSentence, text, cycle, usedTotal };
  }
  function probePoolReset() {
    const store = probePoolReadStore();
    store.cycle = 1; store.used = []; store.usedTotal = 0; store.last = null;
    probePoolWriteStore(store);
    return probePoolInfo();
  }
  function probePoolSnapshot() {
    return PROBE_POOL.map(e => ({ id: e.id, firstSentence: probePoolFirstSentence(e), material: e.material, ask: e.ask, text: probePoolText(e) }));
  }
  function probePoolLast() {
    const last = probePoolReadStore().last;
    const entry = last ? probePoolFind(last.id) : null;
    return entry ? { id: entry.id, firstSentence: probePoolFirstSentence(entry), at: Number(last.at) || 0 } : null;
  }
  function probePoolLog() { return probePoolReadStore().log.map(r => ({ ...r })); }
  function probePoolAttach(patch) {
    if (!patch || typeof patch !== "object") return null;
    const store = probePoolReadStore();
    if (!store.log.length) return null;
    const idx = store.log.length - 1;
    store.log[idx] = { ...store.log[idx], ...patch };
    probePoolWriteStore(store);
    return { ...store.log[idx] };
  }
  function probePoolExhausted() { return PROBE_POOL.length === 0; }
  function probePoolSummary(sentence) {
    const text = String(sentence || "").replace(/\s+/g, " ").trim();
    const chars = [...text];
    return chars.length <= PROBE_POOL_SUMMARY_MAX ? text : chars.slice(0, PROBE_POOL_SUMMARY_MAX - 1).join("") + "…";
  }
  function probePoolLabel(id) {
    const last = probePoolLast();
    const targetId = id || (last && last.id) || null;
    const entry = targetId ? probePoolFind(targetId) : probePoolNext(probePoolUsedIds(probePoolReadStore()), null);
    return entry ? ("探针 " + entry.id + " · " + probePoolSummary(entry.first)) : "探针池不可用：池内 0 条（不会自动发送探针）";
  }
  const GachaProbePool = {
    PROBE_POOL,
    probePoolDraw,
    probePoolInfo,
    probePoolReset,
    probePoolSnapshot,
    probePoolLast,
    probePoolLog,
    probePoolExhausted,
    probePoolSummary,
    probePoolAttach,
    probePoolLabel,
  };
  try {
    if (typeof globalThis !== "undefined" && !globalThis.__arenaGachaProbePool) globalThis.__arenaGachaProbePool = GachaProbePool;
    if (typeof globalThis !== "undefined" && !globalThis.__mcpBuildRandomPelicanPrompt) globalThis.__mcpBuildRandomPelicanPrompt = buildRandomPelicanTestPrompt;
  } catch {}

  return { PROTOCOL, DEFAULT_PREFERRED, PROBE_POOL_CATEGORIES, PELICAN_I18N_POOL, DIVERSE_MICRO_PROBES_V13, PROBE_POOL, GachaProbePool, makePelicanSuffix11D6L, buildRandomPelicanTestPrompt, probeFromPool, probePoolDraw, probePoolInfo, probePoolReset, probePoolSnapshot, probePoolLast, probePoolLog, probePoolExhausted, probePoolSummary, probePoolAttach, probePoolLabel, polymorphPrompt3D, normalize, keywords, match, randomInt, challenges, svg, custom, habit, autoqa, autoqaOne };
})();
