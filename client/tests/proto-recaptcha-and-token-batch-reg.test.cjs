const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const MailToken = require('../ui/mail-token.js');
const { protoRecaptchaV3, createAccountTokenRegistrar } = require('../src/account-auth.js');

test('1. Pure-protocol reCAPTCHA Enterprise (anchor -> reload) acquires rresp token with sa action', async () => {
  const calls = [];
  const mockSes = {
    async fetch(url, init = {}) {
      calls.push({ url, method: init.method || 'GET', body: init.body || '', headers: init.headers || {} });
      if (url.includes('/recaptcha/enterprise/anchor')) {
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          async text() {
            return '<html><body><input type="hidden" id="recaptcha-token" value="03AFcWeA_ANCHOR_TOKEN_XYZ"></body></html>';
          },
        };
      }
      if (url.includes('/recaptcha/enterprise/reload')) {
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          async text() {
            return ')]}\'\n["rresp","03AFcWeA_FINAL_RRESP_TOKEN_999",null,120]';
          },
        };
      }
      throw new Error('Unexpected URL: ' + url);
    },
  };

  const token = await protoRecaptchaV3(mockSes, { action: 'sign_up' });
  assert.equal(token, '03AFcWeA_FINAL_RRESP_TOKEN_999');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].url, /\/recaptcha\/enterprise\/anchor\?ar=1&k=6LeTGMcsAAAAALuIlkVwIxaAuZA8VledA6d3Nnb0/);
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[1].body, /c=03AFcWeA_ANCHOR_TOKEN_XYZ/);
  assert.match(calls[1].body, /sa=sign_up/);
});

test('2. URL mail token parsing & polling supports ic-mail.tibosb.cloud and yunapi.pro, tagging invalid tokens', async () => {
  const line1 = 'decals.vise-2q@icloud.com----https://ic-mail.tibosb.cloud/api/v1/access/voJeWNAyuaBUvL6b1dzM8R7T9F7PRbqI/mailboxes/decals.vise-2q@icloud.com/code';
  const line2 = 'tab.prelate_7e@icloud.com----https://www.yunapi.pro/api/key=eL1J0OX09url9AMzy1pUlb0J36ObeMejpvbfPNgXNM8';

  const t1 = MailToken.parse(line1);
  assert.equal(t1.kind, 'url');
  assert.equal(t1.email, 'decals.vise-2q@icloud.com');
  assert.match(t1.apiUrl, /^https:\/\/ic-mail\.tibosb\.cloud\/api\/v1\/access\//);

  const t2 = MailToken.parse(line2);
  assert.equal(t2.kind, 'url');
  assert.equal(t2.email, 'tab.prelate_7e@icloud.com');
  assert.match(t2.apiUrl, /^https:\/\/www\.yunapi\.pro\/api\/key=/);

  const batch = MailToken.parseBatch(line1 + '\n' + line2 + '\ninvalid_line');
  assert.equal(batch.items.length, 2);
  assert.equal(batch.errors.length, 1);

  // Test yunapi.pro polling returning login_url
  const prevHost = global.Host;
  try {
    global.Host = {
      async fetchText(url) {
        if (url.includes('yunapi.pro')) {
          return {
            text: JSON.stringify({
              success: true,
              code: '739201',
              type: 'verification',
              login_url: 'https://auth.arena.ai/auth/v1/verify?token=pkce_yunapi_123&type=magiclink&redirect_to=https://arena.ai/',
              email: 'tab.prelate_7e@icloud.com',
            }),
          };
        }
        return { error: 'HTTP 404', body: '{"detail":"取码地址无效"}' };
      },
    };
    const r = await MailToken.waitLink(t2, { since: Date.now() - 5000, timeout: 5000, pollMs: 50 });
    assert.equal(r.link, 'https://auth.arena.ai/auth/v1/verify?token=pkce_yunapi_123&type=magiclink&redirect_to=https://arena.ai/');
    assert.equal(r.code, '739201');

    // Test invalid token throws tokenInvalid: true & mailFailed: true
    await assert.rejects(
      () => MailToken.access(MailToken.parse('bad@icloud.com----https://ic-mail.tibosb.cloud/api/v1/access/bad/mailboxes/bad@icloud.com/code')),
      err => err.tokenInvalid === true && err.mailFailed === true
    );
  } finally {
    global.Host = prevHost;
  }
});

test('3. Pure-protocol createAccountTokenRegistrar completes warmup, reCAPTCHA, magic-link, mail polling, fixed password setup, and account save', async () => {
  const acct = {
    id: 'acc_tok_1',
    name: '账号 1',
    email: 'decals.vise-2q@icloud.com',
    proxy: 'vless://node1',
    proxyIp: '198.51.100.22:443',
    region: 'US',
    fp: { ua: 'Mozilla/5.0 Chrome/135.0.0.0' },
    status: {},
  };
  let savedPw = '';
  let saveCalls = 0;
  let stage = 'signup';

  const ses = {
    cookies: {
      async get() { return [{ name: 'arena-auth-prod-v1', value: 'cookie_val' }]; },
      async flushStore() {},
    },
    async fetch(url, init = {}) {
      if (url === 'https://arena.ai/cdn-cgi/trace') {
        return { ok: true, status: 200, headers: new Map(), async text() { return 'ip=198.51.100.22\nloc=US\n'; } };
      }
      if (url === 'https://arena.ai/') {
        return {
          ok: true,
          status: 200,
          headers: new Map(),
          async text() { return '<html>"userId":"11111111-2222-4333-8444-555555555555","userState":"provisional"</html>'; },
        };
      }
      if (url.includes('/recaptcha/enterprise/anchor')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return '<input id="recaptcha-token" value="ANCHOR_1">'; } };
      }
      if (url.includes('/recaptcha/enterprise/reload')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return ')]}\'\n["rresp","RRESP_1"]'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/sign-up') {
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"ok":true}'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/sign-up/magic-link') {
        stage = 'magic_sent';
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"requiresVerification":true}'; } };
      }
      if (url.includes('ic-mail.tibosb.cloud')) {
        if (stage === 'signup') {
          return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"success":false,"code":"no_code","retryable":true}'; } };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() {
            return JSON.stringify({
              success: true,
              login_url: 'https://auth.arena.ai/auth/v1/verify?token=magic_tok_1&type=signup',
            });
          },
        };
      }
      if (url.startsWith('https://auth.arena.ai/auth/v1/verify')) {
        return {
          ok: false,
          status: 302,
          headers: new Map([['location', 'https://arena.ai/?auth=reset-password&code=reset_code_999']]),
          async text() { return ''; },
        };
      }
      if (url.startsWith('https://arena.ai/?auth=reset-password')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return '<html></html>'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/reset-password/confirm') {
        const body = JSON.parse(init.body || '{}');
        assert.equal(body.code, 'reset_code_999');
        assert.equal(body.password, 'Brana#2026Pw');
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"success":true}'; } };
      }
      if (url === 'https://arena.ai/api/me') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async json() {
            return { user: { id: 'u_1', email: 'decals.vise-2q@icloud.com', emailConfirmed: true } };
          },
        };
      }
      throw new Error('Unhandled fetch URL: ' + url);
    },
  };

  const registrar = createAccountTokenRegistrar({
    find: id => (id === acct.id ? acct : null),
    password: () => savedPw,
    setPassword: (_a, pw) => { savedPw = pw; },
    session: () => ses,
    prepare: async () => {},
    syncCookies: async () => {},
    save: () => { saveCalls++; },
    navigate: () => {},
    read: async (s, u) => s.fetch(u),
  });

  const res = await registrar('acc_tok_1', {
    tokenLine: 'decals.vise-2q@icloud.com----https://ic-mail.tibosb.cloud/api/v1/access/tok12345678901234567890/mailboxes/decals.vise-2q@icloud.com/code',
    password: 'Brana#2026Pw',
    pollMs: 20,
  });

  assert.equal(res.ok, true);
  assert.equal(res.email, 'decals.vise-2q@icloud.com');
  assert.equal(savedPw, 'Brana#2026Pw');
  assert.equal(acct.status.loggedIn, true);
  assert.equal(acct.status.me, 'decals.vise-2q@icloud.com');
  assert.ok(saveCalls >= 1);
});

test('4. Pool enforces 30-minute ProxyIP registration cooldown and auto-waits when all ProxyIPs are cooling', async () => {
  const poolSrc = fs.readFileSync(path.join(root, 'ui/pool.js'), 'utf8');
  const marker = '// 节点在编辑器里改了';
  const slice = poolSrc.slice(poolSrc.indexOf('const Pool ='), poolSrc.indexOf(marker));

  let curTime = 1_000_000_000;
  const ctx = {
    now: () => curTime,
    sleep: async () => {},
    Store: { get: () => null, set: () => {} },
    Bus: { on: () => {}, emit: () => {} },
    Nodes: {
      list: [{ id: 'n1', name: 'Node 1', address: '1.1.1.1' }],
      accts: [],
      load: async () => {},
      refreshAccts: async () => [],
      get: () => ({ id: 'n1', name: 'Node 1', address: '1.1.1.1' }),
    },
    Vless: { toLink: () => 'vless://node1' },
    Host: {
      shared: async () => null,
      probe: async ({ pips }) => (pips || []).map(pip => ({ pip, ip: pip.split(':')[0], brana: true, loc: 'US', ms: 55 })),
    },
    IPRep: {
      risky: () => false,
      pure: () => true,
      rank: () => 90,
    },
    toast: () => {},
    cleanErr: e => String(e?.message || e),
  };
  vm.createContext(ctx);
  vm.runInContext(slice + '\nthis.Pool = Pool;', ctx);
  const Pool = ctx.Pool;

  Pool.d = {
    node: 'n1',
    sources: [],
    ban: [],
    regCool: {},
    ips: {
      '198.51.100.10:443': { ok: true, loc: 'US', eg: '198.51.100.10', ms: 40 },
      '198.51.100.11:443': { ok: true, loc: 'US', eg: '198.51.100.11', ms: 50 },
    },
  };
  Pool.loaded = true;
  Pool.load = async () => Pool.d;
  Pool.mutate = async fn => { fn(Pool.d); return Pool.d; };

  assert.equal(Pool.REG_COOL_MS, 30 * 60 * 1000);

  // First registration acquires 198.51.100.10:443
  const r1 = await Pool.acquireForRegistration({ id: 'a1' });
  assert.equal(r1.ok, true);
  assert.equal(r1.proxyIp, '198.51.100.10:443');
  assert.equal(Pool.isRegCooling('198.51.100.10:443', curTime), true);
  assert.equal(Pool.regCoolRemaining('198.51.100.10:443', curTime), 30 * 60 * 1000);

  // Advance 5 minutes: second registration must NOT pick .10, must pick .11
  curTime += 5 * 60 * 1000;
  const r2 = await Pool.acquireForRegistration({ id: 'a2' });
  assert.equal(r2.ok, true);
  assert.equal(r2.proxyIp, '198.51.100.11:443');
  assert.equal(Pool.isRegCooling('198.51.100.11:443', curTime), true);

  // Advance 10 more minutes (15 mins since r1, 10 mins since r2): both IPs are in 30-min cooldown!
  curTime += 10 * 60 * 1000;
  const r3 = await Pool.acquireForRegistration({ id: 'a3' });
  assert.equal(r3.ok, false);
  assert.equal(r3.cooling, true);
  // Earliest cooldown to expire is .10 (15 minutes remaining = 900,000 ms)
  assert.equal(r3.waitMs, 15 * 60 * 1000);

  // Advance 15 minutes + 1 ms: .10 cooldown has expired and is automatically available again!
  curTime += 15 * 60 * 1000 + 1;
  assert.equal(Pool.isRegCooling('198.51.100.10:443', curTime), false);
  const r4 = await Pool.acquireForRegistration({ id: 'a3' });
  assert.equal(r4.ok, true);
  assert.equal(r4.proxyIp, '198.51.100.10:443');
});

test('5. UI includes BatchTokenReg with separate 待注册列表 and 注册失败列表', () => {
  const ac = fs.readFileSync(path.join(root, 'ui/accounts.js'), 'utf8');
  assert.match(ac, /const BatchTokenReg =/);
  assert.match(ac, /待注册列表（含等待 IP 冷却自动继续）/);
  assert.match(ac, /注册失败列表（收不到邮件 \/ 令牌失效）/);
  assert.match(ac, /uniqueFp\(/);
  assert.match(ac, /Pool\.acquireForRegistration/);
});

test('6. Chat actions prioritize DOM grecaptcha.enterprise.execute, pack cx + arena_visit_id, escalate 403 recaptcha to v2 without double-submitting, rotate consumed retry IDs, and IPRep screens out CAPTCHA-prone ProxyIPs', () => {
  const core = fs.readFileSync(path.join(root, 'ui/core.js'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'ui/view.js'), 'utf8');
  const iprep = fs.readFileSync(path.join(root, 'ui/iprep.js'), 'utf8');
  assert.match(core, /if \(action === 'sign_up'\)/);
  assert.match(core, /function getOrCreateVisitId\(\)/);
  assert.match(core, /packCx\(textLen = 8, kind = 'enter'\)/);
  assert.match(core, /function packClientInteraction\(textLen = 8, kind = 'enter'\)/);
  assert.match(core, /const isRc403 = res\.status === 403 && \/recaptcha\|人机\|验证失败\|verification required\/i\.test\(t \|\| ''\)/);
  assert.match(core, /opt\.retryOf\._appendAccepted \|\| opt\.retryOf\._streamRejected/);
  assert.match(view, /if \(lastUser && removedErrTail\) lastUser\._streamRejected = true/);
  assert.match(iprep, /else if \(rc >= 1\)/);
  assert.match(iprep, /p\.pu\.dc && p\.pu\.bc/);
});

test('7. createAccountTokenRegistrar handles multi-poll waitLink sleep, Supabase 60s email cooldown ("after 23 seconds"), and provisional /api/me users', async () => {
  const acct = {
    id: 'acc_yun_1',
    name: '账号 2',
    email: 'mottos_90_taking+f9mw@icloud.com',
    proxy: 'vless://node1',
    proxyIp: '198.51.100.33:443',
    region: 'US',
    fp: { ua: 'Mozilla/5.0 Chrome/135.0.0.0' },
    status: {},
  };
  let savedPw = '';
  let magicSent = false;
  let yunPollsAfterMagic = 0;
  let resetReqAttempts = 0;
  let sleptMs = [];
  let confirmed = false;

  const ses = {
    cookies: {
      async get() { return [{ name: 'arena-auth-prod-v1', value: 'cookie_val' }]; },
      async flushStore() {},
    },
    async fetch(url) {
      if (String(url).includes('yunapi.pro/api/key=')) {
        let payload;
        if (!magicSent) {
          payload = { success: false, code: 'no_code', retryable: true, message: '暂未收到邮件' };
        } else if (resetReqAttempts === 0) {
          yunPollsAfterMagic++;
          if (yunPollsAfterMagic === 1) {
            payload = { success: false, code: 'no_code', retryable: true, message: '暂未收到邮件' };
          } else {
            payload = {
              success: true,
              email: 'mottos_90_taking+F9mW@icloud.com',
              type: 'link',
              login_url: 'https://arena.ai/nextjs-api/callback/email?token=pkce_043d56c7e10f412d&type=email&signup_intent_id=ea0e99f0',
              subject: 'Confirm Your Signup',
            };
          }
        } else {
          payload = {
            success: true,
            email: 'mottos_90_taking+F9mW@icloud.com',
            type: 'link',
            login_url: 'https://arena.ai/nextjs-api/callback/email?token=pkce_reset_999&type=recovery',
            subject: 'Reset Your Password',
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() { return JSON.stringify(payload); },
        };
      }
      if (url === 'https://arena.ai/cdn-cgi/trace') {
        return { ok: true, status: 200, headers: new Map(), async text() { return 'ip=198.51.100.33\nloc=US\n'; } };
      }
      if (url === 'https://arena.ai/') {
        return { ok: true, status: 200, headers: new Map(), async text() { return '<html>"userId":"11111111-2222-4333-8444-555555555555","userState":"provisional"</html>'; } };
      }
      if (url.includes('/recaptcha/enterprise/anchor')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return '<input id="recaptcha-token" value="ANCHOR_2">'; } };
      }
      if (url.includes('/recaptcha/enterprise/reload')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return ')]}\'\n["rresp","RRESP_2"]'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/sign-up') {
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"ok":true}'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/sign-up/magic-link') {
        magicSent = true;
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"requiresVerification":true}'; } };
      }
      if (url.startsWith('https://arena.ai/nextjs-api/callback/email?token=pkce_043d56c7e10f412d')) {
        return { ok: false, status: 307, headers: new Map([['location', 'https://arena.ai/']]), async text() { return ''; } };
      }
      if (url === 'https://arena.ai/nextjs-api/account/password') {
        return { ok: false, status: 404, headers: new Map([['content-type', 'application/json']]), async text() { return '{"error":"Not found"}'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/reset-password/request') {
        resetReqAttempts++;
        if (resetReqAttempts === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Map([['content-type', 'application/json']]),
            async text() { return JSON.stringify({ error: 'For security purposes, you can only request this after 23 seconds.' }); },
          };
        }
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"success":true}'; } };
      }
      if (url.startsWith('https://arena.ai/nextjs-api/callback/email?token=pkce_reset_999')) {
        return { ok: false, status: 307, headers: new Map([['location', 'https://arena.ai/?auth=reset-password&code=rc_yun_777']]), async text() { return ''; } };
      }
      if (url.startsWith('https://arena.ai/?auth=reset-password')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return '<html></html>'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/reset-password/confirm') {
        confirmed = true;
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"success":true}'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/sign-in/email') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() {
            return JSON.stringify({ success: true, user: { id: 'u_yun_1', email: 'mottos_90_taking+f9mw@icloud.com', emailConfirmed: true } });
          },
        };
      }
      if (url === 'https://arena.ai/api/me') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async json() {
            return { user: { id: 'prov_1', userState: 'provisional', email: null } };
          },
        };
      }
      throw new Error('Unhandled fetch URL: ' + url);
    },
  };

  const registrar = createAccountTokenRegistrar({
    find: id => (id === acct.id ? acct : null),
    password: () => savedPw,
    setPassword: (_a, pw) => { savedPw = pw; },
    session: () => ses,
    prepare: async () => {},
    syncCookies: async () => {},
    save: () => {},
    navigate: () => {},
    read: async (s, u) => s.fetch(u),
  });

  const res = await registrar('acc_yun_1', {
    tokenLine: 'mottos_90_taking+f9mw@icloud.com----https://www.yunapi.pro/api/key=WO5ThKwYroO3tiywd8bAkHC3VW-f7ojgsejSMXw_Iyo',
    password: 'Brana#2026Pw',
    pollMs: 15,
    sleep: async ms => { sleptMs.push(ms); },
  });

  assert.equal(res.ok, true);
  assert.equal(res.email, 'mottos_90_taking+f9mw@icloud.com');
  assert.ok(yunPollsAfterMagic >= 2);
  assert.equal(resetReqAttempts, 2);
  assert.deepEqual(sleptMs, [25000]);
  assert.equal(confirmed, true);
  assert.equal(savedPw, 'Brana#2026Pw');
  assert.equal(acct.status.loggedIn, true);
});

test('8. createAccountTokenRegistrar completes signup in 1 step via /auth/set-password redirect -> POST /nextjs-api/auth/set-password', async () => {
  const acct = { id: 'acc_setpw_1', email: 'mottos_90_taking+f9mw@icloud.com', name: 'mottos_90_taking+f9mw@icloud.com', status: {} };
  let savedPw = '';
  let magicSent = false;
  let setPwPosted = null;
  let resetReqCalled = 0;

  const ses = {
    cookies: {
      async get() { return [{ name: 'arena-auth-prod-v1.0', value: 'cookie_val' }]; },
      async flushStore() {},
    },
    fetch: async (url, init = {}) => {
      if (String(url).includes('yunapi.pro/api/key=')) {
        const payload = !magicSent
          ? { success: false, code: 'no_code', retryable: true, message: '暂未收到邮件' }
          : {
              success: true,
              email: 'mottos_90_taking+F9mW@icloud.com',
              type: 'link',
              login_url: 'https://arena.ai/nextjs-api/callback/email?token=pkce_test_setpw_123&type=email&signup_intent_id=ea0e99f0-74fe-48e9-ab3c-82356f1eb38d',
              subject: 'Confirm Your Signup',
            };
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() { return JSON.stringify(payload); },
        };
      }
      if (url === 'https://arena.ai/cdn-cgi/trace') return { ok: true, status: 200, headers: new Map(), async text() { return 'ip=198.51.100.88\nloc=US\n'; } };
      if (url === 'https://arena.ai/') return { ok: true, status: 200, headers: new Map(), async text() { return '<html></html>'; } };
      if (url.includes('google.com/recaptcha/enterprise/anchor')) return { ok: true, status: 200, headers: new Map(), async text() { return '<input id="recaptcha-token" value="03AFcWeA_ANCHOR_SETPW">'; } };
      if (url.includes('google.com/recaptcha/enterprise/reload')) return { ok: true, status: 200, headers: new Map(), async text() { return ')}\'\n["rresp","03AFcWeA_SOLVED_SETPW",null,120]'; } };
      if (url === 'https://arena.ai/nextjs-api/sign-up') return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"ok":true}'; } };
      if (url === 'https://arena.ai/nextjs-api/sign-up/magic-link') {
        magicSent = true;
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"success":true,"requiresVerification":true}'; } };
      }
      if (url.startsWith('https://arena.ai/nextjs-api/callback/email')) {
        return {
          ok: false,
          status: 307,
          headers: new Map([['location', 'https://arena.ai/auth/set-password?token=eyJ0b2tlbktleSI6IjEyMzQifQ%3D%3D']]),
          async text() { return ''; },
        };
      }
      if (url.startsWith('https://arena.ai/auth/set-password')) {
        return { ok: true, status: 200, headers: new Map(), async text() { return '<html>Set Your Password</html>'; } };
      }
      if (url === 'https://arena.ai/nextjs-api/auth/set-password') {
        setPwPosted = JSON.parse(init.body || '{}');
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() {
            return JSON.stringify({ success: true, message: 'Password set successfully! You are now logged in.', redirectTo: '/?success=password_set' });
          },
        };
      }
      if (url === 'https://arena.ai/nextjs-api/reset-password/request') {
        resetReqCalled++;
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"success":true}'; } };
      }
      if (url === 'https://arena.ai/api/me') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async json() {
            return { user: { id: 'u_setpw_1', email: 'mottos_90_taking+F9mW@icloud.com', emailConfirmed: true } };
          },
        };
      }
      throw new Error('Unhandled fetch URL: ' + url);
    },
  };

  const registrar = createAccountTokenRegistrar({
    find: id => (id === acct.id ? acct : null),
    password: () => savedPw,
    setPassword: (_a, pw) => { savedPw = pw; },
    session: () => ses,
    prepare: async () => {},
    syncCookies: async () => {},
    save: () => {},
    navigate: () => {},
    read: async (s, u) => s.fetch(u),
  });

  const res = await registrar('acc_setpw_1', {
    tokenLine: 'mottos_90_taking+f9mw@icloud.com----https://www.yunapi.pro/api/key=WO5ThKwYroO3tiywd8bAkHC3VW-f7ojgsejSMXw_Iyo',
    password: 'Brana#2026Pw',
    pollMs: 10,
  });

  assert.equal(res.ok, true);
  assert.deepEqual(setPwPosted, { password: 'Brana#2026Pw', token: 'eyJ0b2tlbktleSI6IjEyMzQifQ==' });
  assert.equal(resetReqCalled, 0);
  assert.equal(savedPw, 'Brana#2026Pw');
  assert.equal(acct.email, 'mottos_90_taking+f9mw@icloud.com');
  assert.equal(acct.status.loggedIn, true);
});

test('9. MailToken.access preserves pre-existing verification link for fast-path consumption and registrar.cancel aborts active waitLink', async () => {
  const acct = { id: 'acc_prelink_1', name: '账号 9', email: '', status: {} };
  let savedPw = '';
  let magicLinkCalled = 0;

  const ses = {
    async fetch(url, init = {}) {
      if (url === 'https://arena.ai/cdn-cgi/trace') {
        return { ok: true, status: 200, headers: new Map(), async text() { return 'ip=198.51.100.88\nloc=NL\n'; } };
      }
      if (url.startsWith('https://www.yunapi.pro/api/key=PRELINK_KEY')) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() {
            return JSON.stringify({
              success: true,
              data: {
                subject: 'Confirm Your Signup',
                content: 'Click here: https://arena.ai/nextjs-api/callback/email?token_hash=pkce_prelink_1&type=email&next=%2F',
              },
            });
          },
        };
      }
      if (url.startsWith('https://arena.ai/nextjs-api/callback/email?token_hash=pkce_prelink_1')) {
        return {
          ok: false,
          status: 307,
          headers: new Map([['location', 'https://arena.ai/auth/set-password?token=eyJprelinkI6MX0=']]),
          async text() { return ''; },
        };
      }
      if (url === 'https://arena.ai/nextjs-api/auth/set-password') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async text() { return JSON.stringify({ success: true }); },
        };
      }
      if (url === 'https://arena.ai/nextjs-api/sign-up/magic-link') {
        magicLinkCalled++;
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"requiresVerification":true}'; } };
      }
      if (url === 'https://arena.ai/api/me') {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          async json() { return { user: { id: 'u_pre_1', email: 'prelink@icloud.com', emailConfirmed: true } }; },
        };
      }
      throw new Error('Unhandled fetch URL: ' + url);
    },
  };

  const registrar = createAccountTokenRegistrar({
    find: id => (id === acct.id ? acct : null),
    password: () => savedPw,
    setPassword: (_a, pw) => { savedPw = pw; },
    session: () => ses,
    prepare: async () => {},
    syncCookies: async () => {},
    save: () => {},
    navigate: () => {},
    read: async (s, u) => s.fetch(u),
  });

  // Simulate UI pre-check calling MailToken.access(tok) before registrar
  const prevHost = globalThis.Host;
  globalThis.Host = { fetchText: async u => ({ text: await (await ses.fetch(u)).text(), contentType: 'application/json' }) };
  let tok;
  try {
    tok = MailToken.parse('prelink@icloud.com----https://www.yunapi.pro/api/key=PRELINK_KEY');
    await MailToken.access(tok);
  } finally {
    if (prevHost === undefined) delete globalThis.Host; else globalThis.Host = prevHost;
  }
  assert.equal(tok._seen.size, 0, 'MailToken.access must not poison tok._seen before registrar runs');

  const res = await registrar('acc_prelink_1', {
    tok,
    password: 'Brana#2026Pw',
  });
  assert.equal(res.ok, true);
  assert.equal(magicLinkCalled, 0, 'Pre-existing valid signup link should complete without sending a duplicate magic-link email');

  // Verify registrar.cancel(id) aborts an active waitLink loop quickly
  const slowAcct = { id: 'acc_cancel_1', name: '账号 10', email: '', status: {} };
  const slowSes = {
    async fetch(url) {
      if (url === 'https://arena.ai/cdn-cgi/trace') return { ok: true, status: 200, headers: new Map(), async text() { return 'ip=198.51.100.89\nloc=NL\n'; } };
      if (url === 'https://arena.ai/') return { ok: true, status: 200, headers: new Map(), async text() { return '<html></html>'; } };
      if (url.startsWith('https://www.google.com/recaptcha/enterprise/')) return { ok: true, status: 200, headers: new Map(), async text() { return ')]}\'\n["rresp","tok",null,null,null,null,1]'; } };
      if (url === 'https://arena.ai/nextjs-api/sign-up/magic-link') return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return '{"requiresVerification":true}'; } };
      if (url.startsWith('https://www.yunapi.pro/api/key=SLOW_KEY')) {
        return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]), async text() { return JSON.stringify({ success: false, code: 'no_code', retryable: true }); } };
      }
      throw new Error('Unhandled slowSes URL: ' + url);
    },
  };
  const slowRegistrar = createAccountTokenRegistrar({
    find: id => (id === slowAcct.id ? slowAcct : null),
    password: () => 'Brana#2026Pw',
    setPassword: () => {},
    session: () => slowSes,
    prepare: async () => {},
    syncCookies: async () => {},
    save: () => {},
    navigate: () => {},
    read: async (s, u) => s.fetch(u),
  });
  setTimeout(() => slowRegistrar.cancel('acc_cancel_1'), 120);
  await assert.rejects(
    () => slowRegistrar('acc_cancel_1', {
      tokenLine: 'slow@icloud.com----https://www.yunapi.pro/api/key=SLOW_KEY',
      password: 'Brana#2026Pw',
      mailTimeoutMs: 60000,
      pollMs: 5000,
    }),
    err => Boolean(err && (err.cancelled || err.aborted || /已取消/.test(String(err.message || err))))
  );
});
