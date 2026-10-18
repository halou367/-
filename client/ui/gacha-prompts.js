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
  function autoqaOne(qIndex = 0) {
    // 随机生成3个长短英文单词分句（不需要语法）+ 4个数字单词组合
    return unique('gacha:autoqa-prompts:v1', () => {
      const c1 = autoqaClause(2, 4);
      const c2 = autoqaClause(4, 7);
      const c3 = autoqaClause(2, 5);
      const nums = sampleWords(AUTOQA_NUMBERS, 4);
      if (qIndex === 0) return `${c1} ${nums[0]}, ${c2} ${nums[1]} ${nums[2]}, ${c3} ${nums[3]}?`;
      if (qIndex === 1) return `${nums[0]} ${c1}, ${c2} ${nums[1]}, ${nums[2]} ${c3} ${nums[3]}?`;
      return `${c1} ${nums[0]} ${nums[1]}, ${nums[2]} ${c2}, ${c3} ${nums[3]}?`;
    });
  }
  function autoqa() {
    return [autoqaOne(0), autoqaOne(1), autoqaOne(2)];
  }
  return { PROTOCOL, DEFAULT_PREFERRED, normalize, keywords, match, randomInt, challenges, svg, custom, autoqa, autoqaOne };
})();
