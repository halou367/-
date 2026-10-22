const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const uiDir = path.join(__dirname, '..', 'ui');
const viewSrc = fs.readFileSync(path.join(uiDir, 'view.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(uiDir, 'core.js'), 'utf8');
const dockSrc = fs.readFileSync(path.join(uiDir, 'dock.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(uiDir, 'app.css'), 'utf8');
const bpUiSrc = fs.readFileSync(path.join(uiDir, 'billing-probe-ui.js'), 'utf8');

function loadCmdTranslate(prefs = {}) {
  const start = viewSrc.indexOf('const CmdTranslate = (() => {');
  const end = viewSrc.indexOf('\nconst R = {', start);
  assert.ok(start >= 0 && end > start, 'CmdTranslate block must exist in ui/view.js');
  const h = (tag, attrs = {}, ...kids) => ({
    tag,
    attrs: attrs || {},
    children: kids.flat().filter(x => x !== null && x !== undefined && x !== false),
  });
  const ctx = vm.createContext({
    console,
    Prefs: prefs,
    h,
  });
  ctx.globalThis = ctx;
  vm.runInContext(viewSrc.slice(start, end), ctx);
  return ctx.CmdTranslate;
}

const plain = o => JSON.parse(JSON.stringify(o));
const sorted = o => JSON.stringify(Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {}));

test('CmdTranslate.cmdOps matches all 40+ fixture cases from Arena流式修复', () => {
  const api = loadCmdTranslate();
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cmd-ops-cases.json'), 'utf8'));
  assert.ok(cases.length >= 40);
  for (const c of cases) {
    assert.equal(sorted(plain(api.cmdOps(c.cmd, c.cwd))), sorted(c.expected), c.cmd);
  }
});

test('CmdTranslate.describe, lineDiff, heredocWrites, endState, and groupSummary work accurately', () => {
  const api = loadCmdTranslate();
  const d = (cmd, cwd = '/home/user/proj') => api.describe(cmd, cwd).text;
  assert.equal(d('cd Arena流式修复 && node --test test/ 2>&1 | grep -E "^# (pass|fail)"'), '跑测试 · 搜索 1 次');
  assert.equal(d("python3 - <<'PYEOF'\np='src/a.ts'; s=open(p).read()\nopen(p,'w').write(s)\nPYEOF"), '改 a.ts');
  assert.equal(d('npm run package && sha256sum x.vsix'), '打包 · 读 x.vsix');
  assert.equal(d('git status && git diff'), 'git status · git diff');
  assert.equal(d('curl -sS https://arena.ai/x -o /tmp/a'), '网络请求 arena.ai');
  assert.equal(d('cat a b c d e'), '读 a、b 等 5 个');
  assert.equal(d('head -c 600 notes.md'), '读 notes.md');

  assert.deepEqual(plain(api.lineDiff('a\nb\nc\nd', 'a\nB\nB2\nd')), { add: 2, del: 2 });
  const w = api.describe("cat > src/new.js <<'EOF'\nline1\nline2\nline3\nEOF\nnode --check src/new.js", '/p');
  assert.deepEqual(plain(w.stat), { add: 3, del: 0 });

  assert.deepEqual(plain(api.endState({ state: 'output-available', output: { status: 'timeout' } })), { k: 'timeout', t: '超时（可能还在跑）' });
  assert.deepEqual(plain(api.endState({ state: 'output-available', output: { exit_code: 124 } })), { k: 'timeout', t: '超时（退出码 124）' });
  assert.deepEqual(plain(api.endState({ state: 'output-error', errorText: 'Request aborted by user' })), { k: 'stop', t: '已中断' });

  const grp = api.groupSummary([
    { type: 'tool-bash', toolCallId: 't1', state: 'output-available', input: { command: 'cat a.js b.js && grep foo a.js', cwd: '/p' }, output: { exit_code: 0 } },
    { type: 'tool-edit_file', toolCallId: 't2', state: 'output-available', input: { path: '/p/a.js', old_text: 'x\ny', new_text: 'x\nY1\nY2' }, output: 'ok' },
    { type: 'tool-bash', toolCallId: 't3', state: 'output-available', input: { command: 'node --test tests/', cwd: '/p' }, output: { exit_code: 124 } },
  ]);
  assert.equal(grp.nE, 1, 'a.js was both read and edited so only counts as edited');
  assert.equal(grp.nR, 1, 'only b.js remains read-only');
  assert.equal(grp.nS, 1);
  assert.equal(grp.nT, 1);
  assert.equal(grp.nTo, 1);
  assert.deepEqual(plain(grp.stat), { add: 2, del: 1 });
});

test('CmdTranslate respects Prefs.cmdTranslate toggle and uses muted low-saturation CSS palette', () => {
  const apiOn = loadCmdTranslate({ cmdTranslate: true });
  const apiOff = loadCmdTranslate({ cmdTranslate: false });
  const samplePart = { type: 'tool-bash', toolCallId: 'c1', state: 'output-available', input: { command: 'node --test && cat a.js', cwd: '/p' }, output: { exit_code: 0 } };
  assert.ok(apiOn.renderRowChips(samplePart, 'ok') !== null);
  assert.equal(apiOff.renderRowChips(samplePart, 'ok'), null);

  assert.match(cssSrc, /\.trow>summary:has\(\.ct-x\) \.tr-sum\{display:none!important\}/);
  assert.match(cssSrc, /\.ct-edit,\.asf-edit\{color:color-mix\(in srgb,#8c6d46/);
  assert.match(cssSrc, /\.ct-read,\.asf-read\{color:color-mix\(in srgb,#5b7894/);
  assert.match(cssSrc, /\.ct-search,\.asf-search\{color:color-mix\(in srgb,#746885/);
  assert.match(cssSrc, /\.ct-test,\.ct-build,\.asf-test,\.asf-build\{color:color-mix\(in srgb,#4d7c60/);
  assert.match(dockSrc, /sw\('streamKeepAlive',\s*true\)/);
  assert.match(dockSrc, /sw\('cmdTranslate',\s*true,\s*\(\)\s*=>\s*UI\.renderChat\(\)\)/);
});

test('Stream keep-alive, JWT token monotonicity guard, and full-pipeline network purity verification', () => {
  const iprepSrc = fs.readFileSync(path.join(uiDir, 'iprep.js'), 'utf8');
  const evalCoreSrc = fs.readFileSync(path.join(uiDir, 'eval-core.js'), 'utf8');
  const regionIpSrc = fs.readFileSync(path.join(uiDir, 'region-ip.js'), 'utf8');
  const nodeRoutesSrc = fs.readFileSync(path.join(uiDir, 'node-routes.js'), 'utf8');
  const routeNativeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'route-native.js'), 'utf8');
  assert.match(coreSrc, /if \(this\.token && !this\._badToks\?\.has\(this\.token\) && jwtExp > 0 && \(this\.tokenExp \|\| 0\) > nextExp \+ 5000\) return;/);
  assert.match(coreSrc, /serverSettled = \/\^\(true\|1\)\$\/i\.test\(res\.headers\?\.get\?\.\('x-session-settled'\) \|\| ''\)/);
  assert.match(coreSrc, /IPRep\.ensurePreSendPure/);
  assert.match(coreSrc, /const egChanged = Boolean\(eg && \/\^\[0-9a-f:\.\]\+\$\/i\.test\(eg\) && e\.eg !== eg\)/);
  assert.match(iprepSrc, /async ensurePreSendPure\(opt = \{\}\)/);
  assert.match(iprepSrc, /\[8, 12, 15, 16, 22\]\.includes\(\+repEntry\.pu\.fs\)/);
  assert.match(evalCoreSrc, /IPRep\.ensurePreSendPure/);
  assert.match(evalCoreSrc, /IPRep\.note\('rc'\)/);
  assert.match(evalCoreSrc, /IPRep\.note\('ok'\)/);
  assert.match(regionIpSrc, /切换后实测出口/);
  assert.match(nodeRoutesSrc, /await IPRep\.rate\(unrated\)\.catch\(\(\)=>\{\}\);await P\.purgeImpureAndUnstable/);
  assert.match(routeNativeSrc, /if \(isV4 && !Number\.isFinite\(fs\)\)/);
  assert.match(dockSrc, /sw\('preSendPurityCheck',\s*true\)/);
  assert.match(bpUiSrc, /bashReadFiles/);
  assert.match(bpUiSrc, /bashEditFiles/);
  assert.match(bpUiSrc, /bashTestRuns/);
  assert.match(bpUiSrc, /editAddedLines/);
});
