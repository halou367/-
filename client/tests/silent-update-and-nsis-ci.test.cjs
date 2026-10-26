'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '..');

test('patchNsisTemplates fixes electron-builder multiUser.nsh 0xC0000005 out-of-bounds read idempotently', () => {
  const { patchNsisTemplates } = require(path.join(clientRoot, 'scripts', 'after-pack.js'));
  assert.equal(typeof patchNsisTemplates, 'function');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brana-nsis-tpl-'));
  try {
    const tplDir = path.join(tmpRoot, 'node_modules', 'app-builder-lib', 'templates', 'nsis');
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'node_modules', 'app-builder-lib', 'package.json'),
      JSON.stringify({ name: 'app-builder-lib', version: '25.1.8' }),
      'utf8'
    );
    const multiUserPath = path.join(tplDir, 'multiUser.nsh');
    const buggySample = [
      '      StrCpy $0 "$LocalAppData\\Programs"',
      '      System::Store S',
      '      System::Call \'SHELL32::SHGetKnownFolderPath(g "${FOLDERID_UserProgramFiles}", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1\'',
      '      ${If} $1 == 0',
      "        System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'",
      '        StrCpy $0 $1',
      "        System::Call 'OLE32::CoTaskMemFree(p r2)'",
      '      ${endif}',
      '      System::Store L',
      '      StrCpy $INSTDIR "$0\\${APP_FILENAME}"',
    ].join('\r\n');
    fs.writeFileSync(multiUserPath, buggySample, 'utf8');

    const count1 = patchNsisTemplates([tmpRoot]);
    assert.ok(count1 >= 1, 'Expected at least 1 multiUser.nsh file patched');
    const patched = fs.readFileSync(multiUserPath, 'utf8');
    assert.ok(!patched.includes('*$2(&w${NSIS_MAX_STRLEN} .s)'), 'Unbounded &w8192 read must be removed');
    assert.ok(patched.includes("System::Call 'kernel32::lstrcpynW(t .s, p r2, i ${NSIS_MAX_STRLEN})'"));
    assert.ok(patched.includes('Pop $0'));
    assert.ok(patched.includes('StrCpy $0 "$LocalAppData\\Programs"'));

    const count2 = patchNsisTemplates([tmpRoot]);
    assert.ok(count2 >= 1);
    assert.equal(fs.readFileSync(multiUserPath, 'utf8'), patched, 'Second run must be idempotent');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('installer.nsh & main.js enforce completely silent update/install without popup bursts', () => {
  const nsh = fs.readFileSync(path.join(clientRoot, 'scripts', 'installer.nsh'), 'utf8');
  const main = fs.readFileSync(path.join(clientRoot, 'src', 'main.js'), 'utf8');
  const wf = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'client.yml'), 'utf8');

  // LogicLib customInit & lock-gated PowerShell in both customCheckAppRunning and customUnInit
  assert.ok(!nsh.includes('IfFileExists "$0\\*.*" 0 +7'), 'Fragile relative +7 jump must be replaced with LogicLib');
  assert.ok(nsh.includes('ReadEnvStr $2 "BRANA_UPDATING"'));
  assert.ok(nsh.includes('!macro customUnInit'));
  assert.ok(nsh.includes('_brana_skip_ps_close'));

  // Scoped WMI process termination & zero interactive NSIS/Explorer popup storms in brana-ai-launch.vbs
  const vbsStart = main.indexOf("const vbsPath = path.join(updDir, 'brana-ai-launch.vbs');");
  const vbsSlice = main.slice(vbsStart, vbsStart + 8500);
  assert.ok(vbsSlice.includes('Function IsScopedTarget(procObj)'));
  assert.ok(!vbsSlice.includes('cmd.exe /d /c'), 'WMI fallback must not spawn cmd.exe / Windows Terminal');
  assert.ok(!vbsSlice.includes('explorer.exe /select,'), 'Portable background update must not pop open Explorer');
  assert.ok(!vbsSlice.includes('/NCRC --updated --force-run /D=" & appDir, 1, True'), 'Auto-update must not pop open interactive NSIS wizard');
  assert.ok(main.includes('brana-ai-manual-upd.vbs'), 'Manual update waits for old PID exit and tries silent /S first');

  // CI workflow pre-patches NSIS templates and logs Application crash events on non-zero exit
  assert.ok(wf.includes('node scripts/after-pack.js --patch-nsis'));
  assert.ok(wf.includes('npx --no-install electron-builder --win nsis --x64 --publish never'));
  assert.ok(wf.includes("Get-WinEvent -FilterHashtable @{LogName='Application'; ID=1000,1001"));
});
