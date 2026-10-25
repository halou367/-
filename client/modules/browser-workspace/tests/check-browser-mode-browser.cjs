// 浏览器模式（官网页面 + 顶部浏览条）：不放右下角「返回客户端」；整页正好铺满窗口（没有整页上下滚动条，随窗口大小自适应）；
// 左侧对话列表里的加密名称解码成「型号 + 厂商图标」，官网 DOM 不被改结构。
// node scripts/check-browser-mode-browser.cjs（全部本地夹具，不联网，不用账号）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const vm = require('node:vm');
const { build } = require('../src/bundle');
const version = require('../package.json').version;
const bundle = build(path.join(__dirname, '..', 'ui'), version);
const webbar = fs.readFileSync(path.join(__dirname, '..', 'ui', 'webbar.js'), 'utf8');
const SID = '019a0010-0000-7000-8000-0000000000b1', SID2 = '019a0010-0000-7000-8000-0000000000b2';
// 官网结构的简化版：html.h-svh / body.min-h-svh / 外层 flex h-svh，左侧 aside 里是对话链接（标题在最里层 span）
const PAGE = `<!doctype html><html class="m-0 h-svh w-full p-0"><head><meta charset="utf-8"><style>
.h-svh{height:100svh}.min-h-svh{min-height:100svh}.h-full{height:100%}.flex{display:flex}.w-full{width:100%}.m-0{margin:0}.p-0{padding:0}
aside{width:260px;overflow:auto;background:#eee}main{flex:1;overflow:auto}a{display:block;padding:6px;color:#222;text-decoration:none}
</style></head><body class="m-0 h-full min-h-svh w-full p-0"><div class="flex h-svh w-full"><aside data-sidebar="sidebar"><nav>
<a href="/agent/${SID}"><div class="row"><span class="truncate" id="t1">TITLE1</span></div><button aria-label="more">⋯</button></a>
<a href="/agent/${SID2}"><div class="row"><span class="truncate" id="t2">普通标题</span></div></a>
</nav></aside><main><div style="height:3000px">long content scrolls inside main</div></main></div></body></html>`;

async function encTitle(sid) {   // 和客户端同一套加密（默认口令），在 Node 里生成真实的 100 字符加密标题
  const c = vm.createContext({ console, setTimeout, clearTimeout, Bus: { on() {}, emit() {} }, crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, BigInt });
  for (const f of ['title-compact.js', 'title-flex.js', 'title-cipher.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8'), c);
  vm.runInContext('this.TC = TitleCipher', c); c.TC.unlock('755287249');
  return c.TC.encrypt(sid, [2, 'claude-opus-5-5', 0.948, 40.2, 22.4, 1728000000000, '', 'high', 'fingerprint', 1728000000000]);
}
(async () => {
  const enc = await encTitle(SID); assert.equal(enc.length, 100);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];
  for (const [platform, width, height] of [['desktop', 1280, 800], ['android', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE.replace('TITLE1', enc) }));
    await page.addInitScript(p => { window.BranaHost = { platform: p, info: async () => ({ platform: p }), back: async () => {}, shared: async () => null }; }, platform);
    await page.goto('https://arena.ai/agent/' + SID);
    await page.evaluate(js => { window.__ancBarPad = [0, 150]; (0, eval)(js); }, webbar);
    await page.addScriptTag({ content: bundle });
    await page.waitForTimeout(2600);
    // 1) 没有右下角「返回客户端」
    assert.equal(await page.locator('#anc-back').count(), 0, platform + ' no bottom-right back button when the top bar exists');
    // 2) 不出现整页滚动条，内容区高度 = 窗口 − 浏览条
    const fit = async () => page.evaluate(() => { const de = document.documentElement, bar = document.getElementById('__anc_webbar'); return { sh: de.scrollHeight, ch: de.clientHeight, vh: innerHeight, outer: document.querySelector('body > div').getBoundingClientRect().toJSON(), bar: !!bar, footH: (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;height:var(--anc-foot,0px)'; document.body.append(d); const v = d.getBoundingClientRect().height; d.remove(); return v; })(), footAt: document.elementFromPoint(innerWidth / 2, innerHeight - 5)?.id || '', hasFoot: !!document.getElementById('__anc_webfoot') }; });
    let f = await fit();
    assert.ok(f.bar, 'webbar mounted');
    assert.ok(f.sh <= f.ch + 1, platform + ' no page-level vertical scroll ' + JSON.stringify(f));
    assert.ok(f.hasFoot && f.footH >= 20 && f.footAt === '__anc_webfoot', platform + ' client info footer is kept in browser mode ' + JSON.stringify(f));
    assert.ok(Math.abs(f.outer.bottom - (f.vh - f.footH)) <= 1 && f.outer.top >= 39, platform + ' layout ends exactly above the footer, below the bar (nothing covered) ' + JSON.stringify(f.outer));
    await page.setViewportSize({ width, height: height - 200 }); await page.waitForTimeout(300);
    f = await fit();
    assert.ok(f.sh <= f.ch + 1 && Math.abs(f.outer.bottom - (f.vh - f.footH)) <= 1, platform + ' follows window resize ' + JSON.stringify(f));
    await page.setViewportSize({ width, height });
    // 3) 加密名称 → 型号 + 厂商图标；普通标题原样
    const side = await page.evaluate(() => { const a = document.querySelector('a[href*="b1"]'), b = document.querySelector('a[href*="b2"]'), t1 = document.getElementById('t1'); return { t: a.dataset.ancT, v: a.dataset.ancV, hidden: getComputedStyle(t1).display, after: getComputedStyle(a, '::after').content, icon: getComputedStyle(a, '::before').backgroundImage.slice(0, 30), plain: b.dataset.ancT || '', plainShown: getComputedStyle(document.getElementById('t2')).display, same: t1.parentElement.className === 'row' && a.querySelector('button') !== null }; });
    assert.equal(side.t, 'opus-5.5', platform + ' decoded model label ' + JSON.stringify(side));
    assert.equal(side.v, 'anthropic'); assert.match(side.after, /opus-5\.5/i); assert.match(side.icon, /^url\("data:image\/svg\+xml/);
    assert.equal(side.hidden, 'none', 'ciphertext hidden'); assert.equal(side.plain, ''); assert.notEqual(side.plainShown, 'none'); assert.ok(side.same, 'site DOM structure untouched');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '-' + platform + '.png') });
    assert.deepEqual(errors, [], platform + ' page errors');
    results.push(platform); console.log('PASS', platform);
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify({ passed: results.length }));
})().catch(e => { console.error(e); process.exit(1); });
