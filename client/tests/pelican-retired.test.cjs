'use strict';
// 2.0.3-beta.1：旧鹈鹕截图库取消，只保留在线醍醐库；在线库只在手动 / 每天 09:00 拉取；纠错上传失败排队重传
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const ui = f => fs.readFileSync(path.join(__dirname, '..', 'ui', f), 'utf8');
const hp = ui('html-preview.js'), th = ui('tihu-hub.js'), main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
test('screenshot library code is gone from html-preview', () => {
  assert.ok(hp.includes('旧「鹈鹕截图库」已取消'));
  assert.ok(!/async function shootText\(/.test(hp)); assert.ok(!/async function shoot\(/.test(hp));
  assert.ok(!hp.includes("toDataURL('image/jpeg'")); assert.ok(!hp.includes('anc:pelican-shots'));
});
test('PelicanShots compatibility shell routes to the online library and stores nothing', () => {
  const a = hp.indexOf('const PelicanShots = (() => {'), b = hp.indexOf("if (typeof globalThis !== 'undefined') globalThis.PelicanShots", a);
  const opened = [];
  const TihuHub = { renderLibraryPanel: (cmp) => { opened.push(cmp); return { isConnected: true }; }, renderModelCardSection: () => 'card', isReady: () => true, recognizePelicanChatAndApply: async () => ({ matched: true }) };
  const PS = new Function('TihuHub', 'modal', 'toast', 'Models', 'document', hp.slice(a, b) + '\nreturn PelicanShots;')(TihuHub, () => ({ remove() {} }), () => {}, { get: () => ({ name: 'gpt-5', effort: 'high' }) }, undefined);
  assert.equal(PS.retired, true);
  assert.deepEqual(PS.all(), []); assert.equal(PS.add({ sid: 'x' }), null);
  PS.table({ compareModel: 'claude-opus?' }); assert.deepEqual(opened, ['claude-opus']);
  assert.equal(PS.card('s1'), 'card'); assert.equal(PS.entryCard('s1'), 'card');
  return PS.auto('s1', {}).then(r => { assert.ok(r.tihu?.matched); });
});
test('online library: quiet automatic syncs are skipped; only manual or the daily 09:00 slot pulls', () => {
  assert.ok(th.includes("if (quiet && !force && !scheduled && !customCfg) return { ok: false, skipped: 'manual-or-daily-0900-only' };"));
  assert.ok(th.includes('const DAILY_HOUR = 9;'));
  assert.ok(th.includes('sync({ force: false, quiet: true, scheduled: true })'));
  assert.ok(!th.includes('setInterval(() => { void checkDaily(); }, 3600 * 1000)'));
  assert.ok(!th.includes('force: !globalThis.PelicanFingerprintEngine?._conditionedV3'));
});
test('daily slot math: due only when last sync is before the most recent 09:00', () => {
  const s = th.slice(th.indexOf('const lastSlot = '), th.indexOf('const dailyDue = '));
  const { lastSlot, nextSlot } = new Function(s.replace('const lastSlot', 'var lastSlot').replace('const nextSlot', 'var nextSlot').replace(/DAILY_HOUR/g, '9') + '\nreturn { lastSlot, nextSlot };')();
  const at = (h, m = 0, d = 28) => new Date(2026, 9, d, h, m).getTime();
  assert.equal(lastSlot(at(8)), at(9, 0, 27)); assert.equal(lastSlot(at(10)), at(9)); assert.equal(nextSlot(at(8)), at(9)); assert.equal(nextSlot(at(9)), at(9, 0, 29));
});
test('corrections upload automatically and failed uploads are queued for retry', () => {
  assert.ok(th.includes("const CORR_Q_KEY = 'tihu:corr-queue:v1';"));
  assert.ok(th.includes('async function flushCorrectionQueue()'));
  assert.ok(th.includes('if (r && r.ok === false && r.error && sid && nextEntry?.userCorrected) corrQ.put(sid, nextEntry, r.error);'));
});
test('main process no longer harvests screenshots from account windows', () => {
  assert.ok(main.includes('function harvestAccountPelicanSoon(force = false) {\n  return;'));
});
