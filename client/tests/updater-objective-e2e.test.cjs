'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');

const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '..');
const UpdaterRuntime = require(path.join(clientRoot, 'src', 'updater-runtime'));

function extractVbsLinesFromMain(marker) {
  const mainSrc = fs.readFileSync(path.join(clientRoot, 'src', 'main.js'), 'utf8');
  const mIdx = mainSrc.indexOf(marker);
  assert.ok(mIdx !== -1, 'Could not find marker in main.js: ' + marker);
  const arrStart = mainSrc.indexOf('[', mIdx);
  const arrEnd = mainSrc.indexOf(']);', arrStart);
  assert.ok(arrStart !== -1 && arrEnd > arrStart, 'Could not extract VBS array for ' + marker);
  const arrLiteral = mainSrc.slice(arrStart, arrEnd + 1);
  return vm.runInNewContext(arrLiteral);
}

function buildValidNsisBuffer(totalBytes = 524288) {
  const NSIS_CRC_T = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    NSIS_CRC_T[n] = c;
  }
  const buf = crypto.randomBytes(totalBytes);
  const off = 512;
  const nsisTotal = totalBytes - off;
  buf.writeUInt32LE(0, off); // flags = 0 (CRC enabled)
  buf.writeUInt32LE(0xDEADBEEF, off + 4);
  buf.write('NullsoftInst', off + 8, 'latin1');
  buf.writeUInt32LE(nsisTotal, off + 24);
  let c = -1;
  for (let i = 512; i < totalBytes - 4; i++) {
    c = NSIS_CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8);
  }
  const crc = (c ^ -1) >>> 0;
  buf.writeUInt32LE(crc, totalBytes - 4);
  return buf;
}

function loadVerifyNsisFromMain() {
  const mainSrc = fs.readFileSync(path.join(clientRoot, 'src', 'main.js'), 'utf8');
  const sIdx = mainSrc.indexOf('const NSIS_CRC_T = new Int32Array(256);');
  const eIdx = mainSrc.indexOf('ipcMain.handle(\'host:updInfo\'', sIdx);
  const fnEnd = mainSrc.indexOf('\n}\n', mainSrc.indexOf('function verifyNsisInstaller(file)', sIdx));
  const slice = mainSrc.slice(sIdx, fnEnd + 3);
  const ctx = { fs, Buffer, Int32Array, Math, String };
  vm.createContext(ctx);
  vm.runInContext(slice + '; this.verify = verifyNsisInstaller;', ctx);
  return ctx.verify;
}

test('Objective #1: buildUpdateDownloadPlan prioritizes fast routes by system-proxy state and works with zero accounts', () => {
  const ghUrl = 'https://objects.githubusercontent.com/github-production-release-asset-2e65be/12345/BranaAi-Setup.exe?jwt=abc';
  const relayUrl = 'https://arena.755.cc.cd/dl/signed-ticket-xyz';
  const sysFn = () => {}, dirFn = () => {}, acct1 = () => {};

  // Case A: System proxy enabled (e.g. Clash 127.0.0.1:7890) -> sys-proxy hits GitHub CDN first, then relay, then direct-relay fallback
  const planSys = UpdaterRuntime.buildUpdateDownloadPlan({
    urls: [relayUrl, ghUrl],
    hasSysProxy: true,
    defaultFetch: sysFn,
    directFetch: dirFn,
    acctFetchers: [acct1],
  });
  assert.equal(planSys[0].label, 'sys-proxy');
  assert.equal(planSys[0].url, ghUrl, 'With active system proxy, GitHub CDN direct URL must be tried first');
  assert.equal(planSys[1].label, 'sys-proxy');
  assert.equal(planSys[1].url, relayUrl);
  assert.equal(planSys[2].label, 'direct-relay');
  assert.equal(planSys[2].url, relayUrl, 'If local system proxy is dead, direct Worker relay must follow immediately');
  assert.equal(planSys[3].label, 'acct-1');

  // Case B: No system proxy (DIRECT) & 0 accounts -> direct Worker relay first (never stalls on blocked objects.githubusercontent.com first)
  const planDirectZeroAcct = UpdaterRuntime.buildUpdateDownloadPlan({
    urls: [relayUrl, ghUrl],
    hasSysProxy: false,
    defaultFetch: sysFn,
    directFetch: dirFn,
    acctFetchers: [],
  });
  assert.equal(planDirectZeroAcct[0].label, 'direct-relay');
  assert.equal(planDirectZeroAcct[0].url, relayUrl);

  // Worker /dl/ supports HTTP Range pass-through and 206 Partial Content
  const workerSrc = fs.readFileSync(path.join(repoRoot, 'update-worker', 'worker.js'), 'utf8');
  assert.ok(workerSrc.includes("req.headers.get('range')"));
  assert.ok(workerSrc.includes("'accept-ranges': 'bytes'"));
  assert.ok(workerSrc.includes('status: r.status'));
});

test('Objective #2: Real HTTP server download with mid-stream TCP drops, 206 Range resume, 200 fallback, 416 recovery, and clobber self-healing', async () => {
  const verifyNsis = loadVerifyNsisFromMain();
  const payload = buildValidNsisBuffer(360 * 1024); // 360 KB real CRC-valid NSIS binary
  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brana-dl-obj-'));
  let mode = 'drop-twice';
  let reqCount = 0;
  const seenRanges = [];

  const srv = http.createServer((req, res) => {
    reqCount++;
    const rng = req.headers.range || '';
    seenRanges.push(rng);

    if (mode === 'drop-twice') {
      let start = 0;
      const m = /^bytes=(\d+)-/.exec(rng);
      if (m) start = Number(m[1]);
      if (reqCount === 1) {
        // Send first 110 KB of 200 OK then abruptly destroy TCP socket!
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length), 'Accept-Ranges': 'bytes' });
        res.write(payload.subarray(0, 110 * 1024));
        setTimeout(() => res.socket?.destroy(), 15);
        return;
      }
      if (reqCount === 2) {
        // Honor Range 206, send another 130 KB, then destroy TCP socket again!
        const slice = payload.subarray(start, start + 130 * 1024);
        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${ payload.length - 1 }/${ payload.length }`,
          'Content-Length': String(payload.length - start),
        });
        res.write(slice);
        setTimeout(() => res.socket?.destroy(), 15);
        return;
      }
      // Request #3: honor remaining Range 206 to completion
      const rest = payload.subarray(start);
      res.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Range': `bytes ${start}-${ payload.length - 1 }/${ payload.length }`,
        'Content-Length': String(rest.length),
      });
      res.end(rest);
      return;
    }

    if (mode === 'ignore-range-200') {
      // Server ignores Range header and sends full 200 OK
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length) });
      res.end(payload);
      return;
    }

    if (mode === '416-then-200') {
      if (rng) {
        res.writeHead(416);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length) });
      res.end(payload);
      return;
    }

    if (mode === 'normal-range') {
      const m = /^bytes=(\d+)-/.exec(rng);
      if (m) {
        const start = Number(m[1]);
        const rest = payload.subarray(start);
        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${ payload.length - 1 }/${ payload.length }`,
          'Content-Length': String(rest.length),
        });
        res.end(rest);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.length) });
      res.end(payload);
    }
  });

  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const baseUrl = 'http://127.0.0.1:' + srv.address().port + '/BranaAi-Setup.exe';

  try {
    // Subtest 2A: Two mid-stream disconnects -> seamless 206 Range resume without ever resetting progress to 0
    const partA = path.join(tmpDir, 'a.exe.part');
    const gotHistory = [];
    const resA = await UpdaterRuntime.downloadToPartWithRangeResume({
      plan: [{ url: baseUrl, fetch: (u, o) => fetch(u, o), label: 'sys-proxy' }],
      partFile: partA,
      expectedSize: payload.length,
      expectedSha256: sha256,
      verifyInstaller: verifyNsis,
      maxRangeRetriesPerStep: 3,
      onProgress: ({ got }) => { if (got > 0) gotHistory.push(got); },
    });
    assert.equal(resA.ok, true, JSON.stringify(resA));
    assert.equal(resA.resumed, true);
    assert.equal(reqCount, 3, 'Should finish on 3rd Range-resumed request');
    assert.equal(seenRanges[0], '');
    assert.equal(seenRanges[1], 'bytes=' + (110 * 1024) + '-');
    assert.equal(seenRanges[2], 'bytes=' + (240 * 1024) + '-');
    for (let i = 1; i < gotHistory.length; i++) {
      assert.ok(gotHistory[i] >= gotHistory[i - 1], 'Progress must never jump backwards during 206 Range resume');
    }
    assert.equal(UpdaterRuntime.hashFileSha256Sync(partA), sha256);
    assert.equal(verifyNsis(partA).ok, true);

    // Subtest 2B: Corrupted stale .part (e.g. from clobbered release) -> self-heals by deleting .part and re-downloading fresh
    mode = 'normal-range';
    reqCount = 0; seenRanges.length = 0;
    const partB = path.join(tmpDir, 'b.exe.part');
    fs.writeFileSync(partB, Buffer.alloc(100 * 1024, 0xAA)); // 100 KB corrupted prefix!
    const resB = await UpdaterRuntime.downloadToPartWithRangeResume({
      plan: [{ url: baseUrl, fetch: (u, o) => fetch(u, o), label: 'sys-proxy' }],
      partFile: partB,
      expectedSize: payload.length,
      expectedSha256: sha256,
      verifyInstaller: verifyNsis,
    });
    assert.equal(resB.ok, true, 'Must self-heal after corrupted .part fails SHA-256');
    assert.equal(UpdaterRuntime.hashFileSha256Sync(partB), sha256);

    // Subtest 2C: Server ignores Range and responds 200 OK -> truncates .part cleanly
    mode = 'ignore-range-200';
    const partC = path.join(tmpDir, 'c.exe.part');
    fs.writeFileSync(partC, payload.subarray(0, 80 * 1024));
    const resC = await UpdaterRuntime.downloadToPartWithRangeResume({
      plan: [{ url: baseUrl, fetch: (u, o) => fetch(u, o), label: 'direct-relay' }],
      partFile: partC,
      expectedSize: payload.length,
      expectedSha256: sha256,
      verifyInstaller: verifyNsis,
    });
    assert.equal(resC.ok, true);
    assert.equal(fs.statSync(partC).size, payload.length);

    // Subtest 2D: Server returns 416 -> resets .part and succeeds on retry
    mode = '416-then-200';
    const partD = path.join(tmpDir, 'd.exe.part');
    fs.writeFileSync(partD, Buffer.alloc(50 * 1024, 0x11));
    const resD = await UpdaterRuntime.downloadToPartWithRangeResume({
      plan: [{ url: baseUrl, fetch: (u, o) => fetch(u, o), label: 'direct-relay' }],
      partFile: partD,
      expectedSize: payload.length,
      expectedSha256: sha256,
      verifyInstaller: verifyNsis,
    });
    assert.equal(resD.ok, true);
  } finally {
    srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Objective #3 (Windows OS E2E): Real cscript/wscript UTF-16LE compilation + full native process lock/terminate/overwrite/scoped-relaunch simulation', async t => {
  const launchLines = extractVbsLinesFromMain("writeUtf16LeVbsSync(vbsPath,");
  const manualLines = extractVbsLinesFromMain("writeUtf16LeVbsSync(path.join(updDir, 'brana-ai-manual-upd.vbs'),");
  assert.ok(launchLines.some(l => l.includes('正在静默覆盖安装新版本核心组件…')), 'Extracted launch VBS must contain actual Chinese + ellipsis strings');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brana-win-e2e-'));
  try {
    // Verify raw UTF-16LE BOM bytes on all platforms
    const sampleVbs = UpdaterRuntime.writeUtf16LeVbsSync(path.join(tmpRoot, 'check.vbs'), launchLines);
    const rawBytes = fs.readFileSync(sampleVbs);
    assert.equal(rawBytes[0], 0xFF, 'Must begin with UTF-16LE BOM 0xFF');
    assert.equal(rawBytes[1], 0xFE, 'Must begin with UTF-16LE BOM 0xFE');

    if (process.platform !== 'win32') return;

    // 3A. Prove both exact VBS scripts parse with 0 compile errors under real Windows cscript.exe!
    for (const [name, lines] of [['launch', launchLines], ['manual', manualLines]]) {
      const probePath = UpdaterRuntime.writeUtf16LeVbsSync(path.join(tmpRoot, name + '-parse.vbs'), [
        'WScript.Echo "PARSE_OK_' + name + '"',
        'WScript.Quit 0',
        ...lines,
      ]);
      const cs = spawnSync('C:\\Windows\\System32\\cscript.exe', ['//Nologo', probePath], { encoding: 'utf8', timeout: 8000 });
      assert.equal(cs.status, 0, name + ' VBS failed to parse: ' + cs.stderr);
      assert.match(cs.stdout, new RegExp('PARSE_OK_' + name));
    }

    // 3B. Compile real native WINDOWS_GUI (.exe, Subsystem=2, zero console window!) dummy app & mock NSIS setup via .NET csc.exe
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (!fs.existsSync(cscPath)) return;

    const dummyCs = path.join(tmpRoot, 'DummyApp.cs');
    fs.writeFileSync(dummyCs, `
using System;
using System.IO;
using System.Threading;
class Program {
  static int Main(string[] args) {
    string exeDir = AppDomain.CurrentDomain.BaseDirectory;
    string asarPath = Path.Combine(exeDir, "resources", "app.asar");
    bool isUpdated = false;
    foreach (string a in args) { if (a == "--updated") isUpdated = true; }
    if (isUpdated) {
      string ver = File.Exists(asarPath) ? File.ReadAllText(asarPath).Trim() : "MISSING";
      string envUpd = Environment.GetEnvironmentVariable("BRANA_UPDATING") ?? "";
      File.WriteAllText(Path.Combine(exeDir, "relaunch-proof.txt"), "LAUNCHED_UPDATED|ver=" + ver + "|BRANA_UPDATING=" + envUpd);
      return 0;
    }
    FileStream lockStream = null;
    if (args.Length > 0 && args[0] == "--lock-asar" && File.Exists(asarPath)) {
      lockStream = new FileStream(asarPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
    }
    File.WriteAllText(Path.Combine(exeDir, "pid-" + Path.GetFileNameWithoutExtension( System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName ) + ".ready"), System.Diagnostics.Process.GetCurrentProcess().Id.ToString());
    Thread.Sleep(45000);
    if (lockStream != null) lockStream.Close();
    return 0;
  }
}
`, 'utf8');

    const setupCs = path.join(tmpRoot, 'MockSetup.cs');
    fs.writeFileSync(setupCs, `
using System;
using System.IO;
class SetupProgram {
  static int Main(string[] args) {
    string rawCmd = Environment.CommandLine;
    int idx = rawCmd.IndexOf("/D=", StringComparison.OrdinalIgnoreCase);
    if (idx < 0) return 11;
    string appDir = rawCmd.Substring(idx + 3).Trim();
    if (appDir.Length > 0 && appDir[0] == (char)34) return 12; // NSIS forbids quotes around /D=!
    if (Environment.GetEnvironmentVariable("BRANA_UPDATING") != "1") return 13;
    string mainExe = Path.Combine(appDir, "Brana AI.exe");
    string asarPath = Path.Combine(appDir, "resources", "app.asar");
    // Verify exclusive write access (zero lingering process locks!)
    try {
      using (var s1 = new FileStream(mainExe, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) {}
      using (var s2 = new FileStream(asarPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) {}
    } catch (Exception ex) {
      File.WriteAllText(Path.Combine(appDir, "setup-lock-err.txt"), ex.ToString());
      return 20;
    }
    // Verify hardlink role exe was cleaned up
    if (Directory.GetFiles(appDir, "BranaAI-*.exe").Length > 0) return 21;
    File.WriteAllText(asarPath, "UPDATED_ASAR_2.0.4");
    return 0;
  }
}
`, 'utf8');

    const dummyTemplateExe = path.join(tmpRoot, 'DummyTemplate.exe');
    const mockSetupExe = path.join(tmpRoot, 'BranaAi-Setup-2.0.4.exe');
    assert.equal(spawnSync(cscPath, ['/nologo', '/target:winexe', '/out:' + dummyTemplateExe, dummyCs], { encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync(cscPath, ['/nologo', '/target:winexe', '/out:' + mockSetupExe, setupCs], { encoding: 'utf8' }).status, 0);

    // Create isolated target appDir (with BOTH spaces AND Chinese chars!) and sibling otherDir
    const appDir = path.join(tmpRoot, '模拟安装目录 Brana AI');
    const otherDir = path.join(tmpRoot, '无关并行目录 Other Brana');
    fs.mkdirSync(path.join(appDir, 'resources', 'bin'), { recursive: true });
    fs.mkdirSync(otherDir, { recursive: true });

    const targetMainExe = path.join(appDir, 'Brana AI.exe');
    const targetRoleExe = path.join(appDir, 'BranaAI-前台进程-界面渲染(聊天排版与模型识别).exe');
    const targetXrayExe = path.join(appDir, 'resources', 'bin', 'xray.exe');
    const targetAsar = path.join(appDir, 'resources', 'app.asar');
    fs.copyFileSync(dummyTemplateExe, targetMainExe);
    fs.linkSync(targetMainExe, targetRoleExe); // Real NTFS hardlink just like production!
    fs.copyFileSync(dummyTemplateExe, targetXrayExe);
    fs.writeFileSync(targetAsar, 'OLD_ASAR_2.0.3', 'utf8');

    const otherBranaExe = path.join(otherDir, 'Brana AI.exe');
    const otherExtExe = path.join(otherDir, 'BranaAI-ExtensionTest.exe');
    fs.copyFileSync(dummyTemplateExe, otherBranaExe);
    fs.copyFileSync(dummyTemplateExe, otherExtExe);

    const spawnedProcs = [];
    const spawnGui = (exe, args, cwd) => {
      const p = spawn(exe, args, { cwd, detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
      spawnedProcs.push(p);
      return p;
    };

    try {
      const pMain = spawnGui(targetMainExe, ['--lock-asar'], appDir);
      const pRole = spawnGui(targetRoleExe, [], appDir);
      const pXray = spawnGui(targetXrayExe, [], appDir);
      const pOtherBrana = spawnGui(otherBranaExe, [], otherDir);
      const pOtherExt = spawnGui(otherExtExe, [], otherDir);

      // Wait until targetMainExe acquires exclusive lock on app.asar
      const waitDeadline = Date.now() + 5000;
      while (!fs.existsSync(path.join(appDir, 'pid-Brana AI.ready')) && Date.now() < waitDeadline) {
        await new Promise(r => setTimeout(r, 80));
      }
      assert.ok(fs.existsSync(path.join(appDir, 'pid-Brana AI.ready')), 'Old Brana AI.exe must be running and locking app.asar');

      // Confirm app.asar IS genuinely locked right now!
      assert.throws(() => {
        const fd = fs.openSync(targetAsar, 'r+');
        fs.closeSync(fd);
      }, 'app.asar must be exclusively locked before brana-ai-launch.vbs runs');

      // Prepare updDir and launch the EXACT production brana-ai-launch.vbs via detached wscript.exe //B //Nologo
      const updDir = path.join(tmpRoot, 'upd-temp');
      fs.mkdirSync(updDir, { recursive: true });
      const stateFile = path.join(updDir, 'upd-state.json');
      const runnerLog = path.join(updDir, 'upd-runner.log');
      const vbsFile = UpdaterRuntime.writeUtf16LeVbsSync(path.join(updDir, 'brana-ai-launch.vbs'), launchLines);

      // Simulate oldPid exiting 400ms after spawning wscript.exe (while pRole & pXray linger!)
      const runner = spawn('C:\\Windows\\System32\\wscript.exe', ['//B', '//Nologo', vbsFile], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: updDir,
        env: {
          ...process.env,
          BRANA_UPDATING: '1',
          ANC_KIND: 'setup',
          ANC_UPD_DIR: updDir,
          ANC_LOG: runnerLog,
          ANC_STATE: stateFile,
          ANC_FROM: '2.0.3',
          ANC_TO: '2.0.4',
          ANC_OPEN_CNT: '2',
          ANC_PID: String(pMain.pid),
          ANC_NEW: mockSetupExe,
          ANC_DIR: appDir,
          ANC_EXE: targetMainExe,
        },
      });
      runner.unref();
      setTimeout(() => { try { process.kill(pMain.pid); } catch {} }, 400);

      // Wait for relaunch-proof.txt to appear (max 15s)
      const proofFile = path.join(appDir, 'relaunch-proof.txt');
      const doneDeadline = Date.now() + 15000;
      while (!fs.existsSync(proofFile) && Date.now() < doneDeadline) {
        await new Promise(r => setTimeout(r, 200));
      }

      const logTxt = fs.existsSync(runnerLog) ? fs.readFileSync(runnerLog, 'utf16le') : 'NO_LOG';
      const lockErr = fs.existsSync(path.join(appDir, 'setup-lock-err.txt')) ? fs.readFileSync(path.join(appDir, 'setup-lock-err.txt'), 'utf8') : '';
      assert.ok(fs.existsSync(proofFile), 'Updated Brana AI.exe must be relaunched! Log:\n' + logTxt + '\nLockErr:' + lockErr);
      assert.equal(fs.readFileSync(proofFile, 'utf8'), 'LAUNCHED_UPDATED|ver=UPDATED_ASAR_2.0.4|BRANA_UPDATING=');
      assert.equal(fs.readFileSync(targetAsar, 'utf8'), 'UPDATED_ASAR_2.0.4');
      assert.equal(fs.existsSync(targetRoleExe), false, 'Hardlinked role exe in appDir must be removed before setup');

      // Verify pRole & pXray in appDir are dead, while pOtherBrana & pOtherExt in otherDir are 100% ALIVE!
      const isAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
      assert.equal(isAlive(pRole.pid), false, 'Scoped role child must be terminated');
      assert.equal(isAlive(pXray.pid), false, 'Scoped xray child must be terminated');
      assert.equal(isAlive(pOtherBrana.pid), true, 'Unrelated Brana AI.exe in another folder must NOT be killed');
      assert.equal(isAlive(pOtherExt.pid), true, 'BranaAI-ExtensionTest.exe must NOT be killed');

      // Verify upd-state.json & upd-runner.log
      const finalState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.equal(finalState.step, 4);
      assert.equal(finalState.pct, 100);
      assert.equal(finalState.exePath, targetMainExe);
      assert.match(finalState.text, /正在启动新版客户端/);
      assert.match(logTxt, /NSIS_1 rc=0/);
      assert.match(logTxt, /DONE/);
    } finally {
      for (const p of spawnedProcs) {
        try { process.kill(p.pid); } catch {}
      }
      await new Promise(r => setTimeout(r, 350));
    }
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
});

test('Objective #4 (Windows OS E2E): Real wscript.exe execution of brana-ai-manual-upd.vbs and portable mode replacement', async () => {
  if (process.platform !== 'win32') return;
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  if (!fs.existsSync(cscPath)) return;

  const launchLines = extractVbsLinesFromMain("writeUtf16LeVbsSync(vbsPath,");
  const manualLines = extractVbsLinesFromMain("writeUtf16LeVbsSync(path.join(updDir, 'brana-ai-manual-upd.vbs'),");
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brana-win-man-'));
  try {
    const appCs = path.join(tmpRoot, 'PortApp.cs');
    fs.writeFileSync(appCs, `
using System;
using System.IO;
class P {
  static int Main(string[] args) {
    string exeDir = AppDomain.CurrentDomain.BaseDirectory;
    File.WriteAllText(Path.Combine(exeDir, "portable-launched.txt"), "PORTABLE_V2|" + string.Join(",", args));
    return 0;
  }
}
`, 'utf8');
    const newPortExe = path.join(tmpRoot, 'NewPortable.exe');
    assert.equal(spawnSync(cscPath, ['/nologo', '/target:winexe', '/out:' + newPortExe, appCs], { encoding: 'utf8' }).status, 0);

    // 4A. Portable mode replacement via brana-ai-launch.vbs
    const portDir = path.join(tmpRoot, '便携目录 Portable');
    const updDir = path.join(tmpRoot, 'upd-port');
    fs.mkdirSync(portDir, { recursive: true });
    fs.mkdirSync(updDir, { recursive: true });
    const oldPortFile = path.join(portDir, 'BranaAi-Portable.exe');
    const stagedNewPort = path.join(updDir, 'BranaAi-Portable-2.0.4.exe');
    fs.writeFileSync(oldPortFile, 'OLD_PORTABLE_PLACEHOLDER');
    fs.copyFileSync(newPortExe, stagedNewPort);

    const vbsPort = UpdaterRuntime.writeUtf16LeVbsSync(path.join(updDir, 'brana-ai-launch.vbs'), launchLines);
    const statePort = path.join(updDir, 'upd-state.json');
    const logPort = path.join(updDir, 'upd-runner.log');
    const pRunner = spawn('C:\\Windows\\System32\\wscript.exe', ['//B', '//Nologo', vbsPort], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: updDir,
      env: {
        ...process.env,
        ANC_KIND: 'portable',
        ANC_UPD_DIR: updDir,
        ANC_LOG: logPort,
        ANC_STATE: statePort,
        ANC_FROM: '2.0.3',
        ANC_TO: '2.0.4',
        ANC_OPEN_CNT: '1',
        ANC_PID: '999999',
        ANC_NEW: stagedNewPort,
        ANC_OLD: oldPortFile,
      },
    });
    pRunner.unref();

    const portProof = path.join(portDir, 'portable-launched.txt');
    const dl1 = Date.now() + 10000;
    while (!fs.existsSync(portProof) && Date.now() < dl1) {
      await new Promise(r => setTimeout(r, 150));
    }
    assert.ok(fs.existsSync(portProof), 'Portable binary must be overwritten and launched with --updated');
    assert.equal(fs.readFileSync(portProof, 'utf8'), 'PORTABLE_V2|--updated');
    assert.equal(fs.existsSync(stagedNewPort), false, 'Staged portable update file must be cleaned up after copy');

    // 4B. Manual retry installer via brana-ai-manual-upd.vbs
    const manSetupCs = path.join(tmpRoot, 'ManSetup.cs');
    fs.writeFileSync(manSetupCs, `
using System;
using System.IO;
class M {
  static int Main(string[] args) {
    string raw = Environment.CommandLine;
    int idx = raw.IndexOf("/D=", StringComparison.OrdinalIgnoreCase);
    if (idx < 0) return 9;
    string dir = raw.Substring(idx + 3).Trim();
    File.WriteAllText(Path.Combine(dir, "man-setup-ok.txt"), "MAN_SETUP_OK");
    return 0;
  }
}
`, 'utf8');
    const manSetupExe = path.join(updDir, 'ManSetup.exe');
    assert.equal(spawnSync(cscPath, ['/nologo', '/target:winexe', '/out:' + manSetupExe, manSetupCs], { encoding: 'utf8' }).status, 0);
    const manAppDir = path.join(tmpRoot, '手动安装目录 Brana AI');
    fs.mkdirSync(manAppDir, { recursive: true });
    const manMainExe = path.join(manAppDir, 'Brana AI.exe');
    fs.copyFileSync(newPortExe, manMainExe);

    const manVbs = UpdaterRuntime.writeUtf16LeVbsSync(path.join(updDir, 'brana-ai-manual-upd.vbs'), manualLines);
    const mRunner = spawn('C:\\Windows\\System32\\wscript.exe', ['//B', '//Nologo', manVbs], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: updDir,
      env: {
        ...process.env,
        BRANA_UPDATING: '1',
        ANC_PID: '999998',
        ANC_NEW: manSetupExe,
        ANC_DIR: manAppDir,
        ANC_EXE: manMainExe,
      },
    });
    mRunner.unref();

    const manProof = path.join(manAppDir, 'portable-launched.txt');
    const dl2 = Date.now() + 10000;
    while (!fs.existsSync(manProof) && Date.now() < dl2) {
      await new Promise(r => setTimeout(r, 150));
    }
    assert.equal(fs.readFileSync(path.join(manAppDir, 'man-setup-ok.txt'), 'utf8'), 'MAN_SETUP_OK');
    assert.equal(fs.readFileSync(manProof, 'utf8'), 'PORTABLE_V2|--updated');
    await new Promise(r => setTimeout(r, 300));
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
});
