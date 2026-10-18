'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function load(hostImpl) {
  const ctx = { Host: hostImpl || {}, sleep: () => Promise.resolve(), URLSearchParams, Date, JSON, Error, Promise, String };
  vm.createContext(ctx); vm.runInContext(read('ui/mail-token.js') + ';this.MailToken=MailToken;', ctx); return ctx.MailToken;
}
const CID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';
test('token line parses (email----password----clientId----refreshToken) and rejects bad input', () => {
  const M = load();
  const t = M.parse('  User@Outlook.com----mailpw----' + CID + '----M.C5_BAY.0.U.-Abc!def*xyz$$1234567890  \n');
  assert.strictEqual(t.email, 'user@outlook.com'); assert.strictEqual(t.clientId, CID); assert.ok(t.refreshToken.startsWith('M.C5_BAY'));
  assert.throws(() => M.parse('a@b.com----x----notuuid----' + 'r'.repeat(30)));
  assert.throws(() => M.parse('bad----x----' + CID + '----' + 'r'.repeat(30)));
  assert.throws(() => M.parse('a@b.com----x----' + CID));
});
test('only official auth links are extracted, verification-looking links first', () => {
  const M = load();
  const html = '<a href="https://arena.ai/unsubscribe?x=1">u</a> <a href="https://arena.ai/">home</a> <a href="https://auth.arena.ai/auth/v1/verify?token=abc&amp;type=magiclink&amp;redirect_to=https%3A%2F%2Farena.ai">Verify</a> https://evil.example/arena.ai/verify';
  const l = [...M.links(html)];
  assert.strictEqual(l[0], 'https://auth.arena.ai/auth/v1/verify?token=abc&type=magiclink&redirect_to=https%3A%2F%2Farena.ai');
  assert.ok(!l.some(u => /unsubscribe|evil/.test(u)));
});
test('waitLink refreshes the token, reads Outlook mail with a bearer, and skips mail older than the send time', async () => {
  const calls = []; const now = Date.now();
  const Host = { fetchText: async (url, o) => {
    calls.push([url, o]);
    if (/oauth2/.test(url)) return { text: JSON.stringify({ access_token: 'AT', refresh_token: 'NEWRT_' + 'x'.repeat(30), scope: 'https://outlook.office.com/IMAP.AccessAsUser.All', expires_in: 3600 }) };
    return { text: JSON.stringify({ value: [
      { Subject: 'Old', From: { EmailAddress: { Address: 'noreply@arena.ai' } }, ReceivedDateTime: new Date(now - 3600e3).toISOString(), Body: { Content: 'https://auth.arena.ai/verify?token=OLD' } },
      { Subject: 'Confirm your email', From: { EmailAddress: { Address: 'noreply@arena.ai' } }, ReceivedDateTime: new Date(now).toISOString(), Body: { Content: '<a href="https://auth.arena.ai/verify?token=NEW">x</a>' } }] }) };
  } };
  const M = load(Host);
  const tok = M.parse('a@outlook.com----p----' + CID + '----' + 'r'.repeat(30)); let saved = null;
  const r = await M.waitLink(tok, { since: now - 1000, onToken: t => { saved = t.refreshToken; } });
  assert.strictEqual(r.link, 'https://auth.arena.ai/verify?token=NEW');
  assert.ok(saved.startsWith('NEWRT_'));
  assert.strictEqual(calls[0][1].method, 'POST');
  assert.ok(/outlook\.office\.com\/api\/v2\.0\/me\/messages/.test(calls[1][0])); assert.strictEqual(calls[1][1].bearer, 'AT');
});
test('token storage is encrypted on both hosts and never stores the mailbox password', () => {
  const main = read('src/main.js'), java = read('android/app/src/main/java/ai/arena/client/MainActivity.java'), mt = read('ui/mail-token.js');
  assert.ok(/mailtok@[\s\S]{0,1500}rt: encPw\(rt\), pw: encPw\(pw\)/.test(main));
  assert.ok(/mailtok@[\s\S]{0,1200}put\("rt", encPw\(rt\)\)/.test(java));
  assert.ok(!/password: tok\.password/.test(mt));
  assert.ok(/bearer/.test(read('src/preload.js')) && /fetchAuthStart/.test(read('ui/core.js')));
});
test('add-account has 登录 / 注册 / 令牌 tabs and the token pipeline is wired end to end', () => {
  const a = read('ui/accounts.js'), boot = read('ui/boot.js');
  assert.ok(a.includes("[['login', '登录'], ['signup', '注册'], ['token', '令牌']]"));
  assert.ok(a.includes('MailToken.save(a.id, tok)') && a.includes('MailToken.waitLink(tok'));
  assert.ok(a.includes('Host.authLink && await this.autoLink('));
  assert.ok(/auth=reset-password|'reset-password' && code\) \{ this\.authGate\('reset', \{ code, email: opt\.email, auto/.test(a));
  assert.ok(boot.includes("UI.authGate('signup', { email: signup.email, auto })"));
  assert.ok(read('src/bundle.js').includes("'mail-token.js'"));
});
test('magic-link / reset mail requests treat requiresVerification as "mail sent", other calls still fail', async () => {
  const AuthFlow = require('../ui/auth-flow.js');
  const resp = (o, status = 200) => ({ status, ok: status < 400, headers: { get: k => /content-type/i.test(k) ? 'application/json' : null }, text: async () => JSON.stringify(o) });
  const poster = AuthFlow.createPoster({ fetch: async () => resp({ success: true, requiresVerification: true }), deadline: (w) => w(), now: Date.now, retryAfter: () => 0 });
  assert.deepStrictEqual({ ...(await poster('/nextjs-api/sign-up/magic-link', {}, { mailRequest: true })) }, { success: true, requiresVerification: true });
  await assert.rejects(poster('/nextjs-api/sign-in/email', {}, {}), e => e.code === 'AUTH_EMAIL_UNVERIFIED');
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'ui/core.js'), 'utf8').includes('mailRequest: true'));
});
