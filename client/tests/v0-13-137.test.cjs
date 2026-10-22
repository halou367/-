'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('v0.13.137: 1. Smooth animated loading overlay on Browser <-> Client mode switch', () => {
  const acc = fs.readFileSync('ui/accounts.js', 'utf8');
  const wb = fs.readFileSync('ui/webbar.js', 'utf8');
  const css = fs.readFileSync('ui/app.css', 'utf8');
  assert.ok(acc.includes('showModeSwitchMask') && acc.includes('anc:mode-switching'), 'accounts.js mounts mode-switch mask and sets anc:mode-switching');
  assert.ok(wb.includes('wb-loader') && wb.includes('anc:mode-switching') && wb.includes('showLoader'), 'webbar.js keeps loading curtain until readyState is complete');
  assert.ok(css.includes('.mode-switch-mask'), 'app.css styles .mode-switch-mask');
});

test('v0.13.137: 2. Browser mode top toolbar pushes page content and observes DOM mutations without folding', () => {
  const wb = fs.readFileSync('ui/webbar.js', 'utf8');
  assert.ok(wb.includes('scroll-padding-top:var(--anc-bar,40px)!important'), 'viewportSheet sets scroll-padding-top');
  assert.ok(wb.includes('MutationObserver'), 'webbar.js observes documentElement/body mutations to keep pushPage and fit active');
  assert.ok(wb.includes('.h-svh,.h-dvh,.h-screen,.h-lvh,[data-anc-fit]{height:var(--anc-fill)!important'), 'viewportSheet clamps full-screen heights');
});

test('v0.13.137: 3 & 4. Unified Extensions & Bookmarks UI and crisp vector puzzle icon', () => {
  const wb = fs.readFileSync('ui/webbar.js', 'utf8');
  const bmCss = fs.readFileSync('ui/bookmarks.css', 'utf8');
  const extCss = fs.readFileSync('ui/extensions.css', 'utf8');
  const view = fs.readFileSync('ui/view.js', 'utf8');
  assert.ok(!wb.includes('🧩'), 'webbar.js no longer uses mismatched emoji puzzle icon');
  assert.ok(wb.includes('PUZZLE_PATH') && view.includes("ext: '<path d=\"M12 2.2"), 'both webbar.js and view.js use unified vector puzzle icon');
  assert.ok(bmCss.includes('#faf9f7') && bmCss.includes('#1f1e1c') && bmCss.includes('#8c7664'), 'bookmarks.css uses unified Brana AI design tokens');
  assert.ok(extCss.includes('#faf9f7') && extCss.includes('#1f1e1c') && extCss.includes('#8c7664'), 'extensions.css uses unified Brana AI design tokens');
});

test('v0.13.137: 5. Client mode top-right header has Extensions button (#extbtn) right next to palette button (#palbtn)', () => {
  const view = fs.readFileSync('ui/view.js', 'utf8');
  const pal = fs.readFileSync('ui/palette.js', 'utf8');
  const boot = fs.readFileSync('ui/boot.js', 'utf8');
  assert.ok(view.includes("id: 'extbtn'") && view.includes("id: 'extpins'"), 'view.js mounts #extbtn and #extpins next to #palbtn');
  assert.ok(pal.includes('const ExtPop =') && pal.includes("id: 'extpop'"), 'palette.js defines ExtPop unified extension popover');
  assert.ok(boot.includes('ExtPop,'), 'boot.js exposes ExtPop');
});