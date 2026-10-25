// Full UI bundle regression. All endpoints, account data and CAPTCHA DOM are local fixtures.
// NODE_PATH=/path/to/playwright/node_modules node scripts/check-auth-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const harness = require('./check-connection-browser.cjs');
const results = [], output = process.env.AUTH_RESULTS_DIR;
let browser;
async function fixture(opt = {}) {
  return harness.fixture({ mode: '401', cached: false, ...opt, setupData: opt.seed || {}, setup: async seed => {
    const host = window.BranaHost, a = (await host.info()).account, f = window.__fixture;
    a.proxy = 'direct'; a.hasPw = !!seed.credentials; if (seed.accountEmail) a.email = seed.accountEmail;
    f.saved = []; f.opened = []; f.credReads = 0; f.intentReads = 0;
    host.getCred = async () => { f.credReads++; return seed.credentials || null; };
    host.saveAccount = async value => { f.saved.push({ ...value }); if (value.id === a.id) Object.assign(a, value); return { ...a, ...value, id: value.id || 'created-account' }; };
    host.testIp = async () => ({ ip: '203.0.113.9', loc: 'JP', brana: true, ms: 25 });
    host.openAccount = async id => { if (seed.openFailure) throw Error('fixture window failure'); f.opened.push(id); return true; };
    const shared = host.shared;
    let signup = seed.signup ? { email: a.email, at: Date.now() } : null;
    host.shared = async (key, value) => {
      if (key.startsWith('signup@')) {
        if (value === undefined) { f.intentReads++; if (seed.readFailure) throw Error('fixture disk read'); return signup; }
        if (seed.writeFailure) return false;
        signup = value; f.intent = value; return true;
      }
      return shared(key, value);
    };
    if (seed.verification) localStorage.setItem('anc-auth', JSON.stringify({ accountId: a.id, kind: 'signup', email: seed.verification, at: Date.now() }));
  } });
}
async function done(f, name, details = {}) {
  assert.deepEqual(f.errors, [], name + ': no unhandled browser errors');
  results.push({ name, passed: true, ...details }); console.log('PASS', name);
  await f.context.close();
}
async function shot(page, file) {
  if (!output) return;
  fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, file), fullPage: true });
}
async function noMotion(page) { await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' }); }
async function hookAuth(page, { post = 'success', me = 'wrong' } = {}) {
  await page.evaluate(({ post, me }) => {
    __fixture.authPosts = [];
    window.__capFetch = async (url, opt, next) => {
      if (String(url).startsWith('/nextjs-api/')) {
        __fixture.authPosts.push({ path: String(url), body: JSON.parse(opt.body) });
        if (post === 'html') return new Response('<html>Verification required</html>', { headers: { 'content-type': 'text/html' } });
        if (post === 'hold') return new Promise(resolve => { window.__finishPost = () => resolve(new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json' } })); });
        return new Response(JSON.stringify({ success: true, user: { id: 'fixture-user', emailConfirmed: true } }), { headers: { 'content-type': 'application/json' } });
      }
      if (String(url) === '/api/me') {
        if (me === '503') return new Response(JSON.stringify({ error: 'temporary' }), { status: 503 });
        return new Response(JSON.stringify({ user: { id: me === 'wrong' ? 'other-user' : 'fixture-user', email: me === 'wrong' ? 'wrong@example.invalid' : 'fixture@example.invalid' } }), { headers: { 'content-type': 'application/json' } });
      }
      return next(url, opt);
    };
  }, { post, me });
}
(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); harness.setBrowser(browser);
  {
    const f = await fixture({ platform: 'desktop', width: 1280 });
    await f.page.locator('.auth-form input[type=email]').fill('login-draft@example.invalid');
    await f.page.locator('.auth-form input[type=password]').fill('typed-in-memory');
    await f.page.getByRole('tab', { name: '注册', exact: true }).click();
    assert.equal(await f.page.locator('.auth-form input[type=email]').inputValue(), 'login-draft@example.invalid');
    await f.page.locator('.auth-form input[type=email]').fill('signup-draft@example.invalid');
    await f.page.getByRole('tab', { name: '登录', exact: true }).click();
    assert.equal(await f.page.locator('.auth-form input[type=email]').inputValue(), 'signup-draft@example.invalid');
    assert.equal(await f.page.locator('.auth-form input[type=password]').inputValue(), 'typed-in-memory');
    await done(f, 'Desktop: login/signup share the current draft, not the saved email');
  }
  {
    const f = await fixture();
    await f.page.evaluate(() => {
      __anc.UI.host.account.hasPw = true;
      BranaHost.getCred = () => new Promise(resolve => { window.__finishCred = () => resolve({ email: 'fixture@example.invalid', password: 'old-account-secret' }); });
      __anc.UI.loginGate();
    });
    await f.page.locator('.auth-form input[type=email]').fill('different@example.invalid');
    await f.page.evaluate(() => __finishCred());
    assert.equal(await f.page.locator('.auth-form input[type=password]').inputValue(), '');
    await f.page.evaluate(() => __anc.UI.loginGate());
    await f.page.getByRole('tab', { name: '注册', exact: true }).click();
    await f.page.evaluate(() => __finishCred());
    assert.equal(await f.page.locator('.auth-form input[type=email]').inputValue(), 'different@example.invalid');
    await done(f, 'Android: late saved credentials cannot overwrite another email or a newer form');
  }
  for (const platform of ['desktop', 'android']) {
    const f = await fixture({ platform, width: platform === 'desktop' ? 1280 : 390, cached: true,
      seed: { signup: true, credentials: { email: 'fixture@example.invalid', password: 'existing-password' } } });
    assert.equal(await f.page.getByRole('tab', { name: '注册', exact: true }).getAttribute('aria-selected'), 'true');
    const state = await f.page.evaluate(() => ({ credentials: __fixture.credReads, sessions: __fixture.meCalls, marker: __fixture.intent, posts: __fixture.requests.filter(x => x.method === 'POST') }));
    assert.deepEqual(state, { credentials: 0, sessions: 0, marker: null, posts: [] });
    await done(f, platform + ': signup intent precedes cached UI and saved-password auto-login');
  }
  {
    const f = await fixture({ seed: { readFailure: true } });
    assert.match(await f.page.locator('.lmsg').innerText(), /注册任务读取失败/);
    assert.equal(await f.page.evaluate(() => __fixture.requests.filter(x => x.method === 'POST').length), 0);
    await done(f, 'Unreadable signup task fails closed instead of attempting login');
  }
  {
    const f = await fixture({ platform: 'desktop', width: 1280 });
    await hookAuth(f.page, { post: 'html' });
    await f.page.getByRole('tab', { name: '注册', exact: true }).click();
    await f.page.getByRole('button', { name: '发送注册邮件', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.textContent.includes('不能确认'));
    assert.equal(await f.page.getByText('邮件已发送', { exact: true }).count(), 0);
    assert.equal(await f.page.evaluate(() => __fixture.authPosts.length), 1);
    assert.equal(await f.page.getByRole('button', { name: '发送注册邮件', exact: true }).isEnabled(), true);
    await done(f, 'Signup HTML 200 remains an actionable verification error, never email-sent success');
  }
  {
    const f = await fixture();
    await hookAuth(f.page, { post: 'hold', me: 'ok' });
    await f.page.getByRole('tab', { name: '注册', exact: true }).click();
    await f.page.locator('.auth-form input[type=email]').fill('intended@example.invalid');
    await f.page.getByRole('button', { name: '发送注册邮件', exact: true }).click();
    await f.page.waitForFunction(() => !!window.__finishPost);
    assert.equal(await f.page.locator('.auth-form input[type=email]').isDisabled(), true);
    assert.equal(await f.page.getByRole('tab', { name: '登录', exact: true }).isDisabled(), true);
    await f.page.evaluate(() => { __anc.UI.loginGate('新的页面'); __finishPost(); });
    await f.page.clock.runFor(500);
    assert.match(await f.page.locator('.lmsg').innerText(), /新的页面/);
    assert.equal(await f.page.locator('.llink').count(), 0);
    assert.equal(await f.page.evaluate(() => __fixture.authPosts[0].body.email), 'intended@example.invalid');
    await done(f, 'In-flight auth snapshots the intended email and ignores a stale form callback');
  }
  for (const me of ['wrong', '503']) {
    const f = await fixture({ platform: 'desktop', width: 1280 });
    await hookAuth(f.page, { me });
    await f.page.locator('.auth-form input[type=password]').fill('fixture-password');
    await f.page.locator('.lgo button[type=submit]').click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('bad'));
    const text = await f.page.locator('.lmsg').innerText();
    assert.match(text, me === 'wrong' ? /账号.*不一致/ : /503/); assert.doesNotMatch(text, /Cookie/);
    assert.equal(await f.page.evaluate(() => __fixture.saved.filter(x => 'password' in x).length), 0);
    assert.equal(await f.page.evaluate(() => __fixture.authPosts.length), 1);
    await done(f, 'Login: ' + me + ' session is neither accepted nor saved as the requested account');
  }
  {
    const f = await fixture(); await hookAuth(f.page, { me: 'ok' });
    await f.page.locator('.auth-form input[type=email]').fill('first.last@icloud.com');
    await f.page.locator('.auth-form input[type=password]').fill('Fixture-Password!');
    await f.page.locator('.lgo button[type=submit]').click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('ok'));
    const state = await f.page.evaluate(() => ({ post: __fixture.authPosts[0], saved: __fixture.saved.at(-1) }));
    assert.equal(state.post.body.email, 'first.last@icloud.com');
    assert.equal(state.saved.email, 'first.last@icloud.com');
    assert.equal(state.saved.password, 'Fixture-Password!');
    await done(f, 'Alias password login submits the input unchanged and accepts the same server user ID');
  }
  {
    const f = await fixture({ mode: 'ok', seed: { accountEmail: 'first.last@icloud.com' } });
    assert.equal(await f.page.locator('.auth-form[data-auth-mode=login]').count(), 0);
    assert.equal(await f.page.evaluate(() => __anc.UI.me.email), 'fixture@example.invalid');
    await done(f, 'Returning to the client accepts the live canonical web identity despite a saved alias');
  }
  for (const remember of [true, false]) {
    const f = await fixture(); await hookAuth(f.page, { me: 'ok' });
    await f.page.locator('.auth-form input[type=password]').fill('Fixture-Password!');
    if (!remember) await f.page.locator('.auth-form input[type=checkbox]').uncheck();
    await f.page.locator('.lgo button[type=submit]').click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('ok'));
    const saved = await f.page.evaluate(() => __fixture.saved.at(-1));
    assert.equal(saved.email, 'fixture@example.invalid');
    if (remember) assert.equal(saved.password, 'Fixture-Password!');
    else { assert.equal(saved.clearPassword, true); assert.equal(Object.hasOwn(saved, 'password'), false); }
    assert.equal(await f.page.evaluate(() => __anc.UI.authDraft(__anc.UI.host.account).password), '');
    await done(f, 'Confirmed login: ' + (remember ? 'saves only the verified identity and chosen password' : 'unchecked remember explicitly removes old stored credentials'));
  }
  {
    const f = await fixture(); await hookAuth(f.page, { me: 'ok' });
    await f.page.evaluate(() => __anc.UI.authGate('reset', { code: 'fixture-code', email: 'fixture@example.invalid' }));
    await f.page.locator('.auth-form input[type=password]').nth(0).fill('Fixture-Password!');
    await f.page.locator('.auth-form input[type=password]').nth(1).fill('Fixture-Password!');
    await f.page.getByRole('button', { name: '设置新密码并登录', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('ok'));
    assert.equal(await f.page.evaluate(() => __fixture.saved.at(-1).email), 'fixture@example.invalid');
    assert.equal(await f.page.evaluate(() => __fixture.saved.at(-1).password), 'Fixture-Password!');
    assert.equal(await f.page.evaluate(() => __fixture.saved.at(-1).proxy), 'direct');
    await done(f, 'Confirmed password reset persists the verified target and keeps its connection');
  }
  {
    const f = await fixture({ mode: 'ok', seed: { accountEmail: 'previous@example.invalid', verification: 'fixture@example.invalid' } });
    await f.page.waitForFunction(() => __anc.UI.authed === true);
    const state = await f.page.evaluate(() => ({ saved: __fixture.saved, pending: localStorage.getItem('anc-auth'), proxy: __anc.UI.host.account.proxy }));
    const saved = state.saved.find(x => x.email === 'fixture@example.invalid');
    assert.ok(saved); assert.equal(saved.clearPassword, true); assert.equal(state.pending, null); assert.equal(state.proxy, 'direct');
    await done(f, 'Confirmed verification return updates local identity, clears another email’s old password, preserves route');
  }
  {
    const f = await fixture(); await hookAuth(f.page, { post: 'hold' });
    await f.page.getByRole('tab', { name: '注册', exact: true }).click();
    await f.page.getByRole('button', { name: '发送注册邮件', exact: true }).click();
    await f.page.waitForFunction(() => !!window.__finishPost); await f.page.clock.runFor(31000);
    assert.match(await f.page.locator('.lmsg').innerText(), /结果尚未确认/);
    assert.equal(await f.page.evaluate(() => __fixture.authPosts.length), 1);
    assert.equal(await f.page.getByRole('button', { name: '发送注册邮件', exact: true }).isEnabled(), true);
    await done(f, 'A hung signup request times out without automatic replay or a false email-sent screen');
  }
  {
    const f = await fixture(); await hookAuth(f.page);
    await f.page.getByRole('button', { name: '刷新', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('ok'));
    const saved = await f.page.evaluate(() => __fixture.saved.at(-1));
    assert.equal(saved.email, 'wrong@example.invalid');
    assert.equal(saved.clearPassword, true);
    await done(f, 'Explicit refresh adopts the live web session and discards credentials for the previous address');
  }
  {
    const f = await fixture(); await hookAuth(f.page, { me: 'ok' });
    await f.page.evaluate(() => {
      __anc.UI.host.account.email = 'previous@example.invalid';
      localStorage.setItem('anc-auth', JSON.stringify({ accountId: 'fixture', kind: 'signup', email: 'previous@example.invalid', at: Date.now() }));
      __anc.UI.loginGate();
    });
    await f.page.locator('.auth-form input[type=email]').fill('fixture@example.invalid');
    await f.page.getByRole('button', { name: '刷新', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('ok'));
    const saved = await f.page.evaluate(() => __fixture.saved.at(-1));
    assert.equal(saved.email, 'fixture@example.invalid'); assert.equal(saved.clearPassword, true);
    assert.equal(await f.page.evaluate(() => localStorage.getItem('anc-auth')), null);
    await done(f, 'Manual refresh saves the confirmed intended identity, not a stale verification task');
  }
  {
    const f = await fixture(); await hookAuth(f.page);
    await f.page.evaluate(() => __anc.UI.authGate('reset', { code: 'fixture-code', email: 'fixture@example.invalid' }));
    await f.page.locator('.auth-form input[type=password]').nth(0).fill('Fixture-Password!');
    await f.page.locator('.auth-form input[type=password]').nth(1).fill('Fixture-Password!');
    await f.page.getByRole('button', { name: '设置新密码并登录', exact: true }).click();
    await f.page.waitForFunction(() => document.querySelector('.lmsg')?.classList.contains('bad'));
    assert.match(await f.page.locator('.lmsg').innerText(), /邮箱不一致/);
    assert.equal(await f.page.evaluate(() => __fixture.saved.filter(x => 'password' in x).length), 0);
    await done(f, 'Password reset never substitutes the returned session email or saves a mismatched password');
  }
  {
    const f = await fixture({ mode: 'ok', seed: { verification: 'different@example.invalid' } });
    assert.match(await f.page.locator('.lmsg').innerText(), /邮箱不一致/);
    assert.equal(await f.page.locator('.auth-form input[type=email]').inputValue(), 'different@example.invalid');
    assert.equal(await f.page.evaluate(() => __fixture.saved.filter(x => 'email' in x).length), 0);
    await done(f, 'Returning from a verification link still requires the intended business identity');
  }
  {
    const f = await fixture();
    await f.page.evaluate(() => __anc.UI.authGate('link', { kind: 'forgot', email: 'fixture@example.invalid' }));
    await f.page.locator('.llink').fill('https://evil.invalid/?auth=reset-password&code=fixture-code');
    await f.page.getByRole('button', { name: '在客户端中打开链接', exact: true }).click();
    assert.match(await f.page.locator('.lmsg').innerText(), /Brana 官方认证域名/);
    assert.equal(await f.page.getByText('设置新密码', { exact: true }).count(), 0);
    assert.equal(await f.page.evaluate(() => !!__fixture.manualLogin), false);
    await done(f, 'An untrusted URL cannot activate the password-reset branch or native navigation');
  }
  for (const writeFailure of [true, false]) {
    const f = await fixture({ seed: { writeFailure } });
    await f.page.evaluate(() => __anc.UI.addAccount({ proxy: 'direct', email: 'new@example.invalid', password: 'not-yet-a-login-password' }));
    await f.page.locator('.auth-add .lseg').getByRole('tab', { name: '注册', exact: true }).click(); await f.page.getByRole('button', { name: '注册并打开', exact: true }).click();
    await f.page.clock.runFor(700);
    const state = await f.page.evaluate(() => ({ saved: __fixture.saved, opened: __fixture.opened, intent: __fixture.intent }));
    assert.equal(state.saved.some(a => Object.hasOwn(a, 'password')), false);
    if (writeFailure) {
      assert.deepEqual(state.opened, []); assert.match(await f.page.locator('.modal .lmsg').innerText(), /注册任务没有保存/);
    } else {
      assert.deepEqual(state.opened, ['created-account']); assert.equal(state.intent.email, 'new@example.invalid');
      assert.deepEqual(Object.keys(state.intent).sort(), ['at', 'email']);
    }
    await done(f, 'New account registration: ' + (writeFailure ? 'failed intent write prevents window opening' : 'confirmed metadata opens the correct account without persisting an unverified password'));
  }
  {
    const f = await fixture({ seed: { openFailure: true } });
    await f.page.evaluate(() => __anc.UI.addAccount({ proxy: 'direct', email: 'new@example.invalid' }));
    await f.page.locator('.auth-add .lseg').getByRole('tab', { name: '注册', exact: true }).click(); await f.page.getByRole('button', { name: '注册并打开', exact: true }).click(); await f.page.clock.runFor(700);
    assert.match(await f.page.locator('.modal .lmsg').innerText(), /账号窗口打开失败/);
    assert.equal(await f.page.getByRole('button', { name: '注册并打开', exact: true }).isEnabled(), true);
    await done(f, 'A failed native window-open retains the signup task and offers a visible retry');
  }
  {
    // 令牌注册：解析令牌 → 邮箱自动填好 → 先刷新令牌 → 保存令牌和注册任务 → 打开新窗口
    const f = await fixture(); await noMotion(f.page);
    await f.page.evaluate(() => {
      const host = window.BranaHost, store = {}; __fixture.mail = store; __fixture.fetches = [];
      const shared = host.shared; host.shared = async (k, v) => { if (k.startsWith('mailtok@')) { if (v === undefined) return store[k] || null; store[k] = v; return true; } return shared(k, v); };
      host.fetchText = async (url, o) => { __fixture.fetches.push([url, o?.method || 'GET', o?.bearer || '']); return { text: JSON.stringify({ access_token: 'AT', refresh_token: 'ROTATED_' + 'x'.repeat(30), scope: 'IMAP', expires_in: 3600 }) }; };
      __anc.UI.addAccount({ proxy: 'direct' });
    });
    await f.page.locator('.auth-add .lseg').getByRole('tab', { name: '令牌', exact: true }).click();
    await f.page.locator('.auth-add .token-only input').fill('Tok@Outlook.com----mailpw----9e5f94bc-e8a4-4e73-b8be-63364c29d753----M.C5_BAY.0.U.' + 'r'.repeat(40));
    assert.equal(await f.page.locator('.auth-add input[type=email]').inputValue(), 'tok@outlook.com');
    assert.equal(await f.page.locator('.auth-add input[type=email]').evaluate(e => e.readOnly), true);
    await f.page.locator('.auth-add input[type=password]').fill('weak');
    await f.page.getByRole('button', { name: '令牌注册并打开', exact: true }).click();
    assert.match(await f.page.locator('.modal .lmsg').innerText(), /大写、小写字母和符号/);
    await f.page.locator('.auth-add input[type=password]').fill('Brana!Pass9');
    await shot(f.page, 'token-add-account.png');
    await f.page.getByRole('button', { name: '令牌注册并打开', exact: true }).click(); await f.page.clock.runFor(1500);
    const st = await f.page.evaluate(() => ({ intent: __fixture.intent, opened: __fixture.opened, mail: Object.values(__fixture.mail)[0], fetches: __fixture.fetches }));
    assert.equal(st.intent?.email, 'tok@outlook.com'); assert.equal(st.opened.length, 1);
    assert.equal(st.mail.email, 'tok@outlook.com'); assert.equal(st.mail.pw, 'Brana!Pass9'); assert.ok(st.mail.refreshToken.startsWith('ROTATED_')); assert.equal(st.mail.password, undefined);
    assert.ok(/oauth2\/v2\.0\/token/.test(st.fetches[0][0]) && st.fetches[0][1] === 'POST');
    await done(f, 'token tab: parses the Outlook token, enforces the password, rotates and stores the token, then opens the signup window');
  }
  {
    // 令牌账号的验证页：客户端自己收信 → 本账号会话跟随链接 → 拿到设置密码代码 → 自动填入密码
    const f = await fixture({ accountEmail: 'tok@outlook.com' }); await noMotion(f.page);
    await f.page.evaluate(() => {
      const host = window.BranaHost; const id = __anc.UI.host.account.id; __fixture.links = [];
      const tok = { email: 'tok@outlook.com', clientId: '9e5f94bc-e8a4-4e73-b8be-63364c29d753', refreshToken: 'R'.repeat(40), pw: 'Brana!Pass9' };
      const shared = host.shared; host.shared = async (k, v) => k === 'mailtok@' + id ? (v === undefined ? tok : true) : shared(k, v);
      host.fetchText = async (url) => /oauth2/.test(url) ? { text: JSON.stringify({ access_token: 'AT', expires_in: 3600 }) }
        : { text: JSON.stringify({ value: [{ Subject: 'Verify your email', From: { EmailAddress: { Address: 'noreply@arena.ai' } }, ReceivedDateTime: new Date().toISOString(), Body: { Content: '<a href="https://auth.arena.ai/auth/v1/verify?token=T1&amp;type=signup">Verify</a>' } }] }) };
      host.authLink = async u => { __fixture.links.push(u); return { final: 'https://arena.ai/?auth=reset-password&code=CODE42', status: 200, hops: [303, 200] }; };
      __anc.UI.authGate('link', { kind: 'signup', email: 'tok@outlook.com', sentAt: Date.now() - 5000 });
    });
    await f.page.clock.runFor(3000);
    const st = await f.page.evaluate(() => ({ links: __fixture.links, mode: document.querySelector('#view .auth-form')?.dataset.authMode, pw: [...document.querySelectorAll('#view .auth-form input[type=password]')].map(i => i.value) }));
    assert.deepEqual([...st.links], ['https://auth.arena.ai/auth/v1/verify?token=T1&type=signup']);
    assert.equal(st.mode, 'reset'); assert.deepEqual([...st.pw], ['Brana!Pass9', 'Brana!Pass9']);
    await shot(f.page, 'token-auto-reset.png');
    await done(f, 'token account: mail fetched in-client, link followed in the account session, reset form auto-filled with the chosen password');
  }
  async function tokenSignup(f, { magic, signIn }) {
    await f.page.evaluate(({ magic, signIn }) => {
      const host = window.BranaHost, id = __anc.UI.host.account.id; __fixture.authPosts = [];
      const tok = { email: 'tok@outlook.com', clientId: '9e5f94bc-e8a4-4e73-b8be-63364c29d753', refreshToken: 'R'.repeat(40), pw: 'Brana!Pass9' };
      const shared = host.shared; host.shared = async (k, v) => k === 'mailtok@' + id ? (v === undefined ? tok : true) : shared(k, v);
      host.fetchText = async () => ({ text: JSON.stringify({ access_token: 'AT', expires_in: 3600, value: [] }) });
      const save = host.saveAccount; host.saveAccount = async v => { localStorage.setItem('fixture-token-saved', JSON.stringify(v)); localStorage.setItem('fixture-token-posts', JSON.stringify(__fixture.authPosts.map(p => p.path))); return save(v); };
      const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
      window.__capFetch = async (url, opt, next) => {
        url = String(url);
        if (url.startsWith('/nextjs-api/')) {
          __fixture.authPosts.push({ path: url, body: JSON.parse(opt.body) });
          if (url.includes('magic-link')) return magic === 'sent' ? json({ success: true, requiresVerification: true }) : json({ error: 'User already registered' }, 400);
          if (url.includes('sign-in')) return signIn === 'ok' ? json({ success: true }) : json({ error: 'Invalid login credentials' }, 400);
          return json({ success: true });
        }
        if (url === '/api/me') return signIn === 'ok' && __fixture.authPosts.some(p => p.path.includes('sign-in')) ? json({ user: { id: 'u1', email: 'tok@outlook.com' } }) : json({ error: 'unauthorized' }, 401);
        return next(url, opt);
      };
      __anc.UI.authGate('signup', { email: 'tok@outlook.com', auto: true });
    }, { magic, signIn });
    await f.page.clock.runFor(2500);
  }
  {
    // 发注册邮件时官方回「需要验证」= 邮件已发出：要进入收信步骤，而不是报「邮箱尚未验证」；称呼随机生成
    const f = await fixture({ accountEmail: 'tok@outlook.com' }); await noMotion(f.page);
    await tokenSignup(f, { magic: 'sent' });
    const st = await f.page.evaluate(() => ({ mode: document.querySelector('#view .auth-form')?.dataset.authMode, posts: __fixture.authPosts, msg: document.querySelector('#view .lmsg')?.textContent }));
    assert.equal(st.mode, 'link', st.msg);
    assert.match(st.posts[0].body.fullName, /^[A-Z][a-z]+ [A-Z]\.$/);
    await done(f, 'token signup: requiresVerification after the magic-link is treated as mail sent; random nickname is used');
  }
  {
    // 已注册的邮箱 + 固定密码：自动改走登录并保存
    const f = await fixture({ accountEmail: 'tok@outlook.com' }); await noMotion(f.page);
    await tokenSignup(f, { magic: 'exists', signIn: 'ok' }).catch(() => {});   // 成功后会刷新页面
    let st; for (let i = 0; i < 20 && !st; i++) { await f.page.waitForLoadState().catch(() => {}); st = await f.page.evaluate(() => ({ posts: JSON.parse(localStorage.getItem('fixture-token-posts') || '[]'), saved: [JSON.parse(localStorage.getItem('fixture-token-saved') || '{}')], msg: '' })).catch(() => null); if (!st) await new Promise(r => setTimeout(r, 250)); }
    assert.ok(st.posts.some(p => p.includes('sign-in')), st.msg);
    assert.ok(st.saved.some(x => x.email === 'tok@outlook.com' && x.password === 'Brana!Pass9'), st.msg);
    await done(f, 'already registered + fixed password: automatically signs in and stores the password');
  }
  {
    // 已注册但固定密码不对：给出「改成固定密码」/「自己登录」两个选择
    const f = await fixture({ accountEmail: 'tok@outlook.com' }); await noMotion(f.page);
    await tokenSignup(f, { magic: 'exists', signIn: 'bad' });
    assert.equal(await f.page.getByRole('button', { name: '把密码改成固定密码', exact: true }).isVisible(), true);
    assert.equal(await f.page.getByRole('button', { name: '我自己输入密码登录', exact: true }).isVisible(), true);
    await shot(f.page, 'token-exists-choice.png');
    await f.page.getByRole('button', { name: '把密码改成固定密码', exact: true }).click(); await f.page.clock.runFor(800);
    const st = await f.page.evaluate(() => ({ mode: document.querySelector('#view .auth-form')?.dataset.authMode, posts: __fixture.authPosts.map(p => p.path) }));
    assert.ok(st.posts.includes('/nextjs-api/reset-password/request')); assert.equal(st.mode, 'link');
    await done(f, 'already registered + wrong password: offers reset-to-fixed-password or manual login; reset goes to the mail step');
  }
  for (const [platform, width] of [['android', 320], ['android', 360], ['desktop', 1280]]) {
    const f = await fixture({ platform, width }); await noMotion(f.page);
    await f.page.evaluate(() => __anc.UI.addAccount({ proxy: 'direct' })); await f.page.clock.runFor(100);
    const layout = await f.page.evaluate(() => {
      const modal = document.querySelector('.auth-add').getBoundingClientRect();
      return { width: innerWidth, buttons: [...document.querySelectorAll('.auth-add .modal-f .btn')].filter(b => b.offsetParent).map(b => {
        const r = b.getBoundingClientRect(); return { label: b.textContent.trim(), width: r.width, height: r.height, contained: r.left >= Math.max(0, modal.left) - 1 && r.right <= Math.min(innerWidth, modal.right) + 1 };
      }), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.deepEqual(layout.buttons.map(b => b.label), ['导入账号', '登录并打开']); assert.ok(layout.buttons.every(b => b.contained && b.height >= 44)); assert.equal(layout.overflow, false);
    await shot(f.page, 'phase1-add-account-' + platform + '-' + width + '.png');
    await f.page.evaluate(() => { document.querySelector('.auth-add').closest('.modal-back').remove(); __anc.UI.authGate('signup'); });
    await f.page.clock.runFor(400);
    const form = await f.page.locator('#view .auth-form').boundingBox(); assert.ok(form.width <= 520.1);
    await shot(f.page, 'phase1-registration-' + platform + '-' + width + '.png');
    await done(f, platform + ' ' + width + 'px: four complete actions, 44px targets and bounded auth form', { layout });
  }
  // Synthetic Google challenge DOM only: no live challenge or token is solved/generated here.
  for (const platform of ['android', 'desktop']) {
    const f = await fixture({ platform, width: platform === 'android' ? 390 : 1280 }); await noMotion(f.page);
    await f.page.evaluate(() => {
      const key = '6Le3_cYsAAAAAGwWOK2RLDgNI15Bh8C0yLBOL1yL';
      const create = (id, sitekey, hidden = false) => {
        const outer = document.createElement('div'); outer.id = id;
        outer.style.cssText = 'position:fixed;inset:0;z-index:2000000000;background:white' + (hidden ? ';display:none' : '');
        const inner = document.createElement('div'); inner.style.cssText = 'position:absolute;z-index:2000000000;left:10px;top:80px;visibility:visible';
        const frame = document.createElement('iframe'); frame.width = '360'; frame.height = '500';
        frame.src = 'https://www.google.com/recaptcha/enterprise/bframe?k=' + sitekey;
        inner.append(frame); outer.append(inner); document.body.append(outer); return outer;
      };
      create('preexisting-v3', 'unrelated-v3-key', true); create('preexisting-v2', key, true);
      window.__captcha = { options: [], polls: 0, results: [], tokens: {}, serial: 0 };
      grecaptcha.enterprise.render = (box, options) => {
        const id = ++__captcha.serial; __captcha.options.push({ id, options }); create('owned-challenge-' + id, key);
        if (__captcha.renderError) throw Error('fixture render error');
        if (__captcha.syncComplete) { document.querySelector('#owned-challenge-' + id + ' iframe').remove(); options.callback('fixture-same-turn-complete'); }
        return id;
      };
      grecaptcha.enterprise.getResponse = id => { __captcha.polls++; return __captcha.tokens[id] || ''; };
      grecaptcha.enterprise.reset = id => { delete __captcha.tokens[id]; };
      window.__startCaptcha = () => {
        const p = __anc.Recaptcha.v2(); __captcha.samePromise = p === __anc.Recaptcha.v2();
        p.then(token => __captcha.results.push({ ok: true, token }), e => __captcha.results.push({ ok: false, error: e.message }));
      };
      __startCaptcha();
    });
    await f.page.waitForFunction(() => __captcha.options.length === 1); await f.page.clock.runFor(100);
    assert.equal(await f.page.evaluate(() => __captcha.samePromise), true);
    assert.equal(await f.page.locator('#owned-challenge-1').count(), 1);
    await f.page.evaluate(() => {
      document.querySelector('#owned-challenge-1 div').style.top = '90px'; dispatchEvent(new Event('resize'));
      __captcha.options[0].options.callback('fixture-completed-by-user');
      __captcha.options[0].options['error-callback']();
    });
    // No animation ghost or queued RAF may keep the completed challenge in front of the UI.
    assert.equal(await f.page.locator('.rc-back,.rc-bar').count(), 0);
    await f.page.clock.runFor(900);
    assert.equal(await f.page.locator('[id^=owned-challenge-]').count(), 0);
    assert.equal(await f.page.locator('.rc-back,.rc-bar,.rc-fit').count(), 0);
    const before = await f.page.evaluate(() => __captcha.polls); await f.page.clock.runFor(1400);
    assert.equal(await f.page.evaluate(() => __captcha.polls), before);
    assert.deepEqual(await f.page.evaluate(() => __captcha.results), [{ ok: true, token: 'fixture-completed-by-user' }]);
    assert.equal(await f.page.locator('#preexisting-v3,#preexisting-v2').count(), 2);
    await shot(f.page, 'phase1-captcha-completed-' + platform + '.png');
    // Reset creates a new generation. An old callback must not close the new challenge.
    await f.page.evaluate(() => __startCaptcha()); await f.page.waitForFunction(() => __captcha.options.length === 2);
    await f.page.evaluate(() => document.querySelector('.rc-back [data-r]').click());
    await f.page.waitForFunction(() => __captcha.options.length === 3);
    await f.page.evaluate(() => __captcha.options[1].options.callback('stale-reset-token'));
    assert.equal(await f.page.locator('.rc-back').count(), 1);
    await f.page.evaluate(() => __captcha.options[2].options['error-callback']());
    assert.match(await f.page.locator('.rc-st').innerText(), /验证组件出错/);
    await f.page.evaluate(() => document.querySelector('.rc-bar [data-x2]').click()); await f.page.clock.runFor(900);
    assert.equal(await f.page.locator('[id^=owned-challenge-]').count(), 0);
    assert.equal(await f.page.locator('.rc-back,.rc-bar,.rc-fit').count(), 0);
    // The official getResponse fallback has the same cleanup path as its success callback.
    await f.page.evaluate(() => __startCaptcha()); await f.page.waitForFunction(() => __captcha.options.length === 4);
    await f.page.evaluate(() => { __captcha.tokens[4] = 'fixture-getResponse'; }); await f.page.clock.runFor(900);
    assert.equal(await f.page.locator('[id^=owned-challenge-]').count(), 0);
    // An exception while rendering still leaves an operable cancel action.
    await f.page.evaluate(() => { __captcha.renderError = true; __startCaptcha(); });
    await f.page.waitForFunction(() => __captcha.options.length === 5);
    assert.match(await f.page.locator('.rc-st').innerText(), /加载失败/);
    await f.page.evaluate(() => document.querySelector('.rc-back [data-x]').click()); await f.page.clock.runFor(900);
    assert.equal(await f.page.locator('[id^=owned-challenge-],.rc-back,.rc-bar,.rc-fit').count(), 0);
    assert.equal(await f.page.locator('#preexisting-v3,#preexisting-v2').count(), 2);
    // Google can detach bframe first and call success afterwards; remember the outer layer.
    await f.page.evaluate(() => { __captcha.renderError = false; __startCaptcha(); });
    await f.page.waitForFunction(() => __captcha.options.length === 6); await f.page.clock.runFor(100);
    await f.page.evaluate(() => { document.querySelector('#owned-challenge-6 iframe').remove(); __captcha.options[5].options.callback('fixture-detached-frame'); });
    assert.equal(await f.page.locator('[id^=owned-challenge-],.rc-back,.rc-bar,.rc-fit').count(), 0);
    const state = await f.page.evaluate(() => ({ results: __captcha.results, staleOuterIntercepts: document.elementFromPoint(20, 400)?.id?.startsWith('owned-challenge-') || false }));
    assert.equal(state.staleOuterIntercepts, false);
    assert.deepEqual(state.results.map(x => x.ok), [true, false, true, false, true]);
    // Add/remove/success in one turn used to leave a blank white parent before the observer ran.
    await f.page.evaluate(() => { __captcha.syncComplete = true; __startCaptcha(); });
    await f.page.waitForFunction(() => __captcha.options.length === 7);
    assert.equal(await f.page.locator('[id^=owned-challenge-],.rc-back,.rc-bar,.rc-fit').count(), 0);
    // A completed widget reattached by a delayed close animation must not intercept the page.
    await f.page.evaluate(() => { __captcha.syncComplete = false; __startCaptcha(); });
    await f.page.waitForFunction(() => __captcha.options.length === 8);
    await f.page.evaluate(() => { const old = document.querySelector('#owned-challenge-8'); __captcha.options[7].options.callback('fixture-close-animation'); setTimeout(() => document.body.append(old), 40); });
    await f.page.clock.runFor(200);
    assert.equal(await f.page.locator('[id^=owned-challenge-],.rc-back,.rc-bar,.rc-fit').count(), 0);
    // The previous invocation's janitor must never remove a newly opened challenge.
    await f.page.evaluate(() => __startCaptcha()); await f.page.waitForFunction(() => __captcha.options.length === 9);
    await f.page.clock.runFor(400); assert.equal(await f.page.locator('#owned-challenge-9').count(), 1);
    await f.page.evaluate(() => document.querySelector('.rc-back [data-x]').click()); await f.page.clock.runFor(200);
    assert.equal(await f.page.locator('[id^=owned-challenge-],.rc-back,.rc-bar,.rc-fit').count(), 0);
    assert.equal(await f.page.locator('#preexisting-v3,#preexisting-v2').count(), 2);
    await shot(f.page, 'phase2b-captcha-final-' + platform + '.png');
    await done(f, platform + ': owned CAPTCHA layers removed after success, reset, cancel, polling and render error; unrelated layers preserved', { scope: 'synthetic DOM, not a live Google/Android device check' });
  }
  if (output) fs.writeFileSync(path.join(output, 'phase1-auth-browser.json'), JSON.stringify({ chromium: browser.version(), network: 'local intercepted fixtures only', results }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results.length, chromium: browser.version() }));
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => browser?.close());
