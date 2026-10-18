#!/usr/bin/env node
// 生成 gen/ui.bundle.js，并复制到安卓 assets
const fs = require('fs');
const path = require('path');
const { build } = require('../src/bundle');
const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const out = build(path.join(root, 'ui'), version);
for (const p of [path.join(root, 'gen', 'ui.bundle.js'), path.join(root, 'android', 'app', 'src', 'main', 'assets', 'ui.bundle.js')]) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out);
  console.log('wrote', path.relative(root, p), out.length, 'bytes');
}
const off = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'offline.html');
fs.copyFileSync(path.join(root, 'ui', 'offline.html'), off);
console.log('wrote', path.relative(root, off));
// 离线页（安卓）要用 vless.js 生成 xray 出站：代理不通、主界面加载不了时也能切到 VLESS 节点
fs.copyFileSync(path.join(root, 'ui', 'vless.js'), path.join(root, 'android', 'app', 'src', 'main', 'assets', 'vless.js'));

for (const name of ['route-state.js', 'route-policy.js', 'route-host.js', 'node-routes.js', 'offline-modes.js', 'offline-context.js', 'nodes.js', 'iprep.js', 'pool.js', 'node-speed.js', 'app.css', 'flags.woff2', 'rtc-lockdown.js', 'webbar.js']) fs.copyFileSync(path.join(root, 'ui', name), path.join(root, 'android', 'app', 'src', 'main', 'assets', name));
