'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('CSS handover & 5 optimizations are present and valid', () => {
  const css = read('ui/app.css');
  assert.ok(css.includes('.mc-prog-wrap'), 'mc-prog-wrap CSS present');
  assert.ok(css.includes('.bp-cands') && css.includes('.bp-cand.src-both'), 'bp-cands CSS present');
  assert.ok(css.includes('.acct-bal-row') && css.includes('.acct-refresh'), 'acct-bal-row CSS present');
  assert.ok(css.includes('.msg.a.seg-head') && css.includes('.msg.a.seg-mid') && css.includes('.msg.a.seg-tail'), 'multi-segment turn CSS present');
  assert.ok(css.includes('.auto-cont-pill') && css.includes('.kapill.ka-graphic'), 'graphical auto-continue & keepalive CSS present');

  const view = read('ui/view.js');
  assert.ok(view.includes('seg.hideFoot'), 'view.js suppresses duplicate intermediate footers');
  assert.ok(view.includes('seg.turnStartAt'), 'view.js computes total turn duration across segments');
  assert.ok(view.includes('buildRows()') && view.includes('R.toolBody(p)'), 'view.js lazy-renders tool groups and tool bodies');
  assert.ok(view.includes('auto-cont-pill'), 'view.js renders _autoContinue messages as graphical pills');

  const core = read('ui/core.js');
  assert.ok(core.includes('const ProtocolSchema = (() =>'), 'ProtocolSchema autoSync present in core.js');
  assert.ok(core.includes('async resumeIncremental('), 'resumeIncremental gap-filling present in core.js');
  assert.ok(core.includes('patchAssistantParts(o, m)'), 'O(1) non-destructive mergeServer present in core.js');
  assert.ok(core.includes('this.midTurnStall = { at: now()'), 'finishTurn midTurnStall detection present in core.js');
  assert.ok(core.includes('window.__ANC_FAST_RETURN'), 'Scheme B fast-return warm cache handoff present in core.js');

  const keep = read('ui/keep.js');
  assert.ok(keep.includes('isMidTurnStalled(c, msg)'), 'KeepAlive.isMidTurnStalled present in keep.js');
  assert.ok(keep.includes("c.send('继续', [], null, { autoContinue: true })"), 'silent graphical auto-continue present in keep.js');
  assert.ok(keep.includes('kapill ka-graphic'), 'graphical keepalive pill present in keep.js');

  const boot = read('ui/boot.js');
  assert.ok(boot.includes('c.fakeEnd || c.midTurnStall'), 'boot.js suppresses false completion notifications');
  assert.ok(boot.includes("sessionStorage.getItem('anc:fast-return')"), 'boot.js reads anc:fast-return for 0ms warm handoff');
});

test('BillingProbe UI uses original pill bars, expands tied candidates directly, and merges 反推锁定 & 补读型号', () => {
  const bp = read('ui/billing-probe-ui.js');
  assert.ok(!bp.includes('并列 '), 'no grouped 并列 N 款 in billing-probe-ui.js');
  assert.ok(!bp.includes('mc-prog-wrap'), 'no extra mc-prog-wrap header bar');
  assert.ok(bp.includes('mc-fp-row billing-fit') && bp.includes('tint-rev') && bp.includes('tint-both'), 'uses original mc-fp-row billing-fit pill bars with light tints');
  const dock = read('ui/dock.js');
  assert.ok(!dock.includes("'补读型号'"), 'standalone 补读型号 button merged into 反推锁定');
});
