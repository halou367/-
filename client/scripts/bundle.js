#!/usr/bin/env node
// 生成 gen/ui.bundle.js（含内联库供安卓与测试校验）及 gen/ui.desktop.bundle.js（桌面端精简按需加载包），并同步安卓 assets
const fs = require('fs');
const path = require('path');
const { build } = require('../src/bundle');
const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const outFull = build(path.join(root, 'ui'), version, { slimDesktopBundle: false, forceRebuild: true });
for (const p of [path.join(root, 'gen', 'ui.bundle.js'), path.join(root, 'android', 'app', 'src', 'main', 'assets', 'ui.bundle.js')]) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, outFull);
  console.log('wrote', path.relative(root, p), outFull.length, 'bytes');
}
const outDesktop = build(path.join(root, 'ui'), version, { slimDesktopBundle: true, forceRebuild: true });
const desktopBundlePath = path.join(root, 'gen', 'ui.desktop.bundle.js');
fs.writeFileSync(desktopBundlePath, outDesktop);
console.log('wrote', path.relative(root, desktopBundlePath), outDesktop.length, 'bytes');

function compactAssetJs(raw) {
  let inTpl = 0, inBlk = false;
  const outLines = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = (inTpl > 0 || inBlk) ? line : line.trim();
    if (!inTpl && !inBlk && (!trimmed || trimmed.startsWith('//'))) continue;
    outLines.push(trimmed);
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i], nx = trimmed[i + 1];
      if (inBlk) { if (ch === '*' && nx === '/') { inBlk = false; i++; } continue; }
      if (!inTpl && ch === '/' && nx === '*') { inBlk = true; i++; continue; }
      if (!inTpl && ch === '/' && nx === '/') break;
      if (ch === '\\') { i++; continue; }
      if (!inTpl && (ch === "'" || ch === '"')) {
        const q = ch; i++;
        while (i < trimmed.length && trimmed[i] !== q) { if (trimmed[i] === '\\') i++; i++; }
        continue;
      }
      if (ch === '`') { inTpl = inTpl ? 0 : 1; }
    }
  }
  return outLines.join('\n');
}

const off = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'offline.html');
fs.copyFileSync(path.join(root, 'ui', 'offline.html'), off);
console.log('wrote', path.relative(root, off));
for (const name of ['vless.js', 'route-state.js', 'route-policy.js', 'route-host.js', 'node-routes.js', 'offline-modes.js', 'offline-context.js', 'nodes.js', 'iprep.js', 'pool.js', 'node-speed.js', 'app.css', 'flags.woff2', 'rtc-lockdown.js', 'webbar.js']) {
  const srcP = path.join(root, 'ui', name);
  const dstP = path.join(root, 'android', 'app', 'src', 'main', 'assets', name);
  if (name === 'app.css') {
    const minCss = fs.readFileSync(srcP, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>~])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}');
    fs.writeFileSync(dstP, minCss, 'utf8');
  } else if (name.endsWith('.js')) {
    fs.writeFileSync(dstP, compactAssetJs(fs.readFileSync(srcP, 'utf8')), 'utf8');
  } else {
    fs.copyFileSync(srcP, dstP);
  }
}
try { require('./after-pack').patchNsisTemplates([root]); } catch {}
