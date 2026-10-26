// 浏览器模式（官网页面）：底栏按钮都以悬浮窗口打开（额度明细 / 出口 IP · 节点环境 / 榜单 / 指纹库 / 版本），不跳回客户端；
// 悬浮层用加了前缀的客户端样式，不影响官网页面。node scripts/check-web-panels-browser.cjs（本地夹具，不联网）
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const harness = require('./check-connection-browser.cjs'), N = require('./check-node-browser.cjs');
const SID = '019a0010-0000-7000-8000-0000000000b1';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); harness.setBrowser(browser);
  for (const dark of [true, false]) {
    const before = new Function(`window.__ancWebbar=true;window.__ancBarColors={dark:${dark}};const o=Element.prototype.attachShadow;Element.prototype.attachShadow=function(x){return o.call(this,{...x,mode:'open'});};document.body.innerHTML='<main id="site"><button class="site-btn">site</button></main>';`);
    const f = await N.fixture('desktop', 1300, {}, { path: '/agent/' + SID, before }), p = f.page;
    await p.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
    await p.clock.runFor(3000);
    const nav = []; p.on('framenavigated', fr => { if (fr === p.mainFrame()) nav.push(fr.url()); });
    const base = await p.evaluate(() => { const l = document.getElementById('__anc_layer'), w = document.querySelector('#__anc_webfoot')?.shadowRoot?.querySelector('.anc-h'); return { layer: (l || w)?.dataset.theme, site: getComputedStyle(document.querySelector('.site-btn')).borderRadius, pe: l ? getComputedStyle(l).pointerEvents : 'none' }; });
    assert.equal(base.layer, dark ? 'dark' : 'light', 'layer follows browser colours');
    assert.equal(base.pe, 'none', 'layer itself does not block the site');
    const want = { '.ipit': '.region-ip-back', '.lpbtn': '.lppop', '.fp-library-btn': '.modal-back' };
    for (const [btn, pop] of Object.entries(want)) {
      await p.locator('#__anc_webfoot #bar ' + btn).first().click(); await p.clock.runFor(800);
      const r = await p.evaluate(sel => { const e = document.querySelector('#__anc_layer ' + sel); return e ? { pos: getComputedStyle(e).position, vis: e.getBoundingClientRect().width > 0 } : null; }, pop);
      assert.ok(r && r.vis && r.pos === 'fixed', btn + ' opens ' + pop + ' as a floating window in the page ' + JSON.stringify(r));
      await p.evaluate(() => { for (const x of [...document.getElementById('__anc_layer').children]) if (x.id !== 'anc-toasts') x.remove(); });
    }
    assert.match(await p.locator('#__anc_webfoot #bar .ipit').getAttribute('data-nettip'), /ProxyIP|SSTP/, 'exit type shown in the bar');
    assert.deepEqual(nav, [], 'never navigates back to the client');
    assert.equal(p.url(), 'https://arena.ai/agent/' + SID);
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.site-btn')).borderRadius), base.site, 'site styles untouched');
    assert.deepEqual(f.errors, [], 'page errors');
    console.log('PASS web panels', dark ? 'dark' : 'light'); await f.context.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
