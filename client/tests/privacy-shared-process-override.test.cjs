'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../src/browser-privacy');

// reCAPTCHA v2 puts anchor + bframe (both google.com) in one renderer process. Chromium keeps the time zone / locale
// override per process, so the 2nd target is refused with "... override is already in effect". That must not trip the
// fail-closed privacy guard (it showed up as the "无法连接 arena.ai (PRIVACY)" page whenever a captcha appeared).
const profile = P.profile({ region: 'JP' });
const mk = refuse => {
  const calls = [];
  const send = async (m, p) => {
    calls.push(m);
    if (refuse.includes(m)) throw new Error('Another locale override is already in effect');
    return m === 'Page.addScriptToEvaluateOnNewDocument' ? { identifier: 'x' } : {};
  };
  return { calls, send };
};

test('configure tolerates "override is already in effect" and still installs the lockdown script', async () => {
  const { calls, send } = mk(['Emulation.setLocaleOverride', 'Emulation.setTimezoneOverride']);
  const id = await P.configure(send, profile, { metadata: { userAgent: 'UA' } });
  assert.equal(id, 'x');
  assert.ok(calls.includes('Emulation.setUserAgentOverride'));
  assert.ok(calls.includes('Page.addScriptToEvaluateOnNewDocument'), 'RTC lockdown must still be injected');
});

test('configure still fails closed on any other CDP error', async () => {
  const send = async m => { if (m === 'Emulation.setLocaleOverride') throw new Error('Session closed'); return {}; };
  await assert.rejects(P.configure(send, profile, {}), /Session closed/);
});

test('applyRegion only swallows the already-in-effect error', async () => {
  await P.applyRegion(mk(['Emulation.setLocaleOverride']).send, profile);
  await assert.rejects(P.applyRegion(async () => { throw new Error('boom'); }, profile), /boom/);
});
