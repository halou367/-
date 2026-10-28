'use strict';
// 预览动画按需播放：HTML/SVG 预览只在鼠标悬停时运动，移开后定格在当前帧
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const hpSrc = fs.readFileSync(path.join(__dirname, '../ui/html-preview.js'), 'utf8');
const thSrc = fs.readFileSync(path.join(__dirname, '../ui/tihu-hub.js'), 'utf8');

function loadPvAnim() {
  const start = hpSrc.indexOf('const PvAnim = (() => {');
  const endMark = 'if (typeof globalThis !== \'undefined\') globalThis.PvAnim = PvAnim;';
  const end = hpSrc.indexOf(endMark, start);
  assert.ok(start >= 0 && end > start, 'PvAnim block present in html-preview.js');
  const ctx = vm.createContext({});
  vm.runInContext(hpSrc.slice(start, end + endMark.length), ctx);
  return ctx.PvAnim;
}

function makeGuestEnv({ hoverNone = false } = {}) {
  let now = 0, tid = 0, rid = 0;
  const timers = [], rafs = new Map(), winL = {}, docL = {}, cls = new Set();
  const anims = [{ playState: 'running', paused: 0, played: 0, pause() { this.playState = 'paused'; this.paused++; }, play() { this.playState = 'running'; this.played++; } }];
  const svg = { p: false, pauseAnimations() { this.p = true; }, unpauseAnimations() { this.p = false; }, animationsPaused() { return this.p; } };
  const doc = {
    readyState: 'complete',
    head: { appendChild() {} },
    documentElement: { classList: { add: c => cls.add(c), remove: c => cls.delete(c) } },
    createElement: () => ({}),
    addEventListener: (n, f) => { (docL[n] = docL[n] || []).push(f); },
    getAnimations: () => anims,
    getElementsByTagName: () => [svg],
    querySelectorAll: () => [],
  };
  const win = {
    document: doc,
    matchMedia: q => ({ matches: q === '(hover: none)' ? hoverNone : !hoverNone }),
    performance: { now: () => now },
    requestAnimationFrame: cb => { const id = ++rid; rafs.set(id, cb); return id; },
    cancelAnimationFrame: id => rafs.delete(id),
    setTimeout: (fn, ms) => { const id = ++tid; timers.push({ id, fn, at: now + (ms || 0) }); return id; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const id = ++tid; timers.push({ id, fn, at: now + ms, every: ms }); return id; },
    addEventListener: (n, f) => { (winL[n] = winL[n] || []).push(f); },
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const advance = ms => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 16);
      for (const t of timers.filter(t => t.at <= now)) {
        if (t.every) t.at += t.every; else timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
      const due = [...rafs.entries()]; rafs.clear();
      for (const [, cb] of due) cb(now);
    }
  };
  const msg = data => (winL.message || []).forEach(f => f({ data }));
  return { ctx, advance, msg, cls, anims, svg, run: code => vm.runInContext(code, ctx), get now() { return now; } };
}

test('guest script freezes rAF / CSS / SMIL after warm-up and resumes on hover without time jump', () => {
  const P = loadPvAnim();
  const env = makeGuestEnv();
  env.run(P.SCRIPT);
  env.run('var frames=0,lastT=0;function tick(t){frames++;lastT=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);');
  env.advance(400);
  const warmFrames = env.run('frames');
  assert.ok(warmFrames > 10, 'animates during warm-up');
  env.advance(P.WARM_MS + 200);
  const f1 = env.run('frames');
  env.advance(2000);
  assert.equal(env.run('frames'), f1, 'no frames while not hovered');
  assert.ok(env.cls.has('__pvp'), 'CSS animations paused via class');
  assert.equal(env.anims[0].playState, 'paused');
  assert.equal(env.svg.p, true, 'SMIL paused');
  assert.equal(env.run('window.__pvAnim.isPaused()'), true);
  const frozen = env.run('performance.now()');
  env.run('var late=0;setTimeout(function(){late++;},10);');
  env.advance(500);
  assert.equal(env.run('late'), 0, 'timeouts held while frozen');
  assert.equal(env.run('performance.now()'), frozen, 'virtual clock stopped');

  env.msg({ __pvAnim: 'play' });
  assert.ok(!env.cls.has('__pvp'));
  assert.equal(env.anims[0].playState, 'running');
  assert.equal(env.svg.p, false);
  env.advance(200);
  assert.ok(env.run('frames') > f1, 'resumes on hover');
  assert.equal(env.run('late'), 1, 'held timeout flushed on resume');
  const lastT = env.run('lastT');
  assert.ok(lastT - frozen < 400, 'rAF timestamps continue from frozen frame (no jump)');

  env.msg({ __pvAnim: 'pause' });
  const f2 = env.run('frames');
  env.advance(1000);
  assert.equal(env.run('frames'), f2, 'freezes again when mouse leaves');
});

test('guest script stays inactive on touch-only devices', () => {
  const P = loadPvAnim();
  const env = makeGuestEnv({ hoverNone: true });
  env.run(P.SCRIPT);
  assert.equal(env.run('typeof window.__pvAnim'), 'undefined');
});

test('inject keeps doctype first and puts the controller before page scripts', () => {
  const P = loadPvAnim();
  const out = P.inject('<!doctype html><html><head><title>t</title></head><body><script>requestAnimationFrame(()=>{})</script></body></html>');
  assert.ok(out.startsWith('<!doctype html><html><head><script>'));
  assert.ok(out.indexOf('W.__pvAnim') < out.indexOf('requestAnimationFrame(()=>{})'));
  assert.equal(P.inject(out), out, 'idempotent');
  assert.ok(P.inject('<svg></svg>').startsWith('<script>'));
});

test('all HTML/SVG preview surfaces are wired to hover-only animation', () => {
  assert.match(hpSrc, /animSc\.textContent = PvAnim\.SCRIPT;/);
  assert.match(hpSrc, /PvAnim\.bind\(c\.stage, f\);/);
  assert.match(hpSrc, /PvAnim\.bind\(stage, f\);/);
  assert.match(thSrc, /function toSrcdoc\(rawCode\) \{ return pvAnimInject\(toSrcdocRaw\(rawCode\)\); \}/);
  assert.match(thSrc, /pvAnimBind\(box, ifr\);/);
  assert.match(thSrc, /pvAnimBind\(frameWrap, ifr\);/);
});
