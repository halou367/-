const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const SRC=fs.readFileSync(path.join(__dirname,'../ui/update.js'),'utf8');
function load({version,platform='desktop',latest,dialog=true,ticket}){
  const calls={toasts:[],prompts:[],bodies:[],dialogs:0,asks:[]};
  const Prefs={updUrl:'https://upd.example'};
  const ctx={VERSION:version,Prefs,savePrefs(){},now:()=>1,cleanErr:e=>String(e),sleep:async()=>{},
    setTimeout(){},setInterval(){},toast:t=>calls.toasts.push(t),Bus:{emit(){},on(){}},
    h:()=>({}),modal:()=>({}),icon:()=>'',MD:{render:s=>s},document:{querySelector:()=>null,hasFocus:()=>true},
    Dialog:{open:async()=>{calls.dialogs++;return dialog;}},
    Host:{platform,updStart:async()=>({}),updInfo:async()=>({kind:platform==='android'?'apk':'setup'}),
      fetchText:async(u,o)=>{if(o?.body){calls.bodies.push(JSON.parse(o.body));return {text:JSON.stringify(ticket||{proxy:'p',version:'0.13.123'})};}
        if(/\/beta\/latest/.test(u))return {text:JSON.stringify({version:version})};
        return {text:JSON.stringify({version:latest,files:{setup:{},apk:{}}})};}}};
  vm.createContext(ctx);vm.runInContext(SRC+'\n;globalThis.Update=Update;',ctx);
  const U=ctx.Update;U.prompt=async o=>{calls.prompts.push(o||{});};
  const ask=U.askPass.bind(U);U.askPass=async o=>{calls.asks.push(o||{});return {version:'0.13.123',proxy:'p'};};
  return {U,calls,Prefs,ask};
}
test('beta build: 检查更新 also finds a newer stable release',async()=>{
  const {U,calls}=load({version:'0.13.124-beta.2',latest:'0.13.124'});
  await U.checkNow();assert.equal(calls.prompts.length,1);assert.ok(calls.toasts.some(t=>/正式版 v0.13.124/.test(t)));
});
test('beta build: 正式版 on Android with an older stable switches channel, no impossible downgrade',async()=>{
  const {U,calls,Prefs}=load({version:'0.13.124-beta.2',latest:'0.13.123',platform:'android'});
  await U.stable();assert.equal(Prefs.updChannel,'stable');assert.equal(calls.dialogs,0);assert.equal(calls.prompts.length,0);
  assert.ok(calls.toasts.some(t=>/正式版通道/.test(t)));
});
test('beta build: 正式版 on desktop confirms then installs the older stable as a downgrade',async()=>{
  const {U,calls}=load({version:'0.13.124-beta.2',latest:'0.13.123'});
  await U.stable();assert.equal(calls.dialogs,1);assert.equal(calls.asks.length,1);assert.equal(calls.asks[0].beta,undefined);
  assert.equal(calls.prompts[0].downgrade,true);assert.equal(calls.prompts[0].ticket.version,'0.13.123');
});
test('beta build: 正式版 with a newer stable goes straight to the normal update',async()=>{
  const {U,calls}=load({version:'0.13.124-beta.2',latest:'0.13.125'});
  await U.stable();assert.equal(calls.dialogs,0);assert.equal(calls.prompts.length,1);assert.equal(calls.prompts[0].downgrade,undefined);
});
test('tickets say which channel they want (beta password in the normal prompt must not return a beta)',async()=>{
  const {U,calls}=load({version:'0.13.124-beta.2',latest:'0.13.124'});
  await U.ticket('pw',false);await U.ticket('pw',true);
  assert.equal(calls.bodies[0].channel,'stable');assert.equal(calls.bodies[0].beta,undefined);
  assert.equal(calls.bodies[1].channel,'beta');assert.equal(calls.bodies[1].beta,1);
});
test('worker: beta password + channel stable serves the latest stable release',()=>{
  const w=fs.readFileSync(path.join(__dirname,'../../update-worker/worker.js'),'utf8');
  assert.match(w,/betaTicket\(env, ctx, u, b, ip, b\.channel === 'stable' && !b\.beta\)/);
  assert.match(w,/const o = stable \? await latest\(env, ctx\) : await betaLatest\(env, ctx\)/);
});

test('NSIS installer integrity verification and atomic .part update download', () => {
  const os = require('node:os');
  const { check, crc32 } = require('../scripts/nsis-check');
  const tmp = path.join(os.tmpdir(), 'brana-nsis-test-' + process.pid + '.exe');
  try {
    const off = 1024, payloadLen = 256, end = off + payloadLen;
    const buf = Buffer.alloc(end, 0x41);
    buf.writeUInt32LE(0, off);
    buf.writeUInt32LE(0xDEADBEEF, off + 4);
    buf.write('NullsoftInst', off + 8, 'latin1');
    buf.writeUInt32LE(64, off + 20);
    buf.writeUInt32LE(payloadLen, off + 24);
    const crc = crc32(buf, 512, end - 4);
    buf.writeUInt32LE(crc, end - 4);
    fs.writeFileSync(tmp, buf);
    assert.equal(check(tmp).ok, true);

    // Truncated download fails integrity check
    fs.writeFileSync(tmp, buf.subarray(0, end - 12));
    const trunc = check(tmp);
    assert.equal(trunc.ok, false);
    assert.match(trunc.note, /截断/);

    // Corrupted byte fails CRC check
    const bad = Buffer.from(buf);
    bad[off + 40] ^= 0xff;
    fs.writeFileSync(tmp, bad);
    const badRes = check(tmp);
    assert.equal(badRes.ok, false);
    assert.match(badRes.note, /CRC 不一致/);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }

  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(mainSrc, /function verifyNsisInstaller\(file\)/);
  assert.match(mainSrc, /const partFile = file \+ '\.part'/);
  assert.match(mainSrc, /fs\.renameSync\(partFile, file\)/);
  assert.match(mainSrc, /"%ANC_NEW%" \/NCRC --updated \/S --force-run/);

  const { U } = load({ version: '0.13.133', latest: '0.13.134' });
  U.info = { version: '0.13.134', notes: 'bf21cb6fe7aa045de0e4544e34bdcc82cbfaabbc905f7f1a283aa83582879e9b  BranaAi-Setup-0.13.134.exe' };
  assert.equal(U.noteSha({ name: 'BranaAi-Setup-0.13.134.exe' }), 'bf21cb6fe7aa045de0e4544e34bdcc82cbfaabbc905f7f1a283aa83582879e9b');
});

test('v0.13.150: remembered update password (0 extra popup), 4-step progress UI with speed/ETA, standalone Windows progress window, and conflict-free silent install', async () => {
  const { Prefs, ask } = load({ version: '0.13.149', latest: '0.13.150', ticket: { proxy: 'https://dl.example/setup.exe', version: '0.13.150' } });
  Prefs.updPass = 'saved-token-123';
  const res = await ask({});
  assert.equal(res.version, '0.13.150');
  assert.equal(res.proxy, 'https://dl.example/setup.exe');

  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const updSrc = fs.readFileSync(path.join(__dirname, '../ui/update.js'), 'utf8');
  const closePs = fs.readFileSync(path.join(__dirname, '../scripts/close-installed-app.ps1'), 'utf8');

  assert.match(updSrc, /const stepLabels = \['1\. 下载更新包', '2\. 完整性校验', '3\. 保存会话'/);
  assert.match(updSrc, /fmtSpd\(spd\)/);
  assert.match(mainSrc, /brana-ai-progress\.ps1/);
  assert.match(mainSrc, /1\. 更新安装进度/);
  assert.match(mainSrc, /2\. 客户端重启与载入进度/);
  assert.match(mainSrc, /writeUpdRestartState/);
  assert.match(mainSrc, /updRestoredOpen/);
  assert.match(mainSrc, /window\.__anc\.History\?\.refresh\?\.\(\)/);
  assert.match(mainSrc, /\\uFEFF/);
  assert.match(mainSrc, /chcp 65001 >nul 2>&1/);
  assert.match(mainSrc, /brana-ai-launch\.vbs/);
  assert.match(mainSrc, /upd-state\.json/);
  assert.match(mainSrc, /taskkill \/F \/T \/IM "xray\.exe"/);
  assert.doesNotMatch(mainSrc, /taskkill \/F \/T \/PID %ANC_PID%/);
  assert.doesNotMatch(mainSrc, /taskkill \/F \/T \/IM "Brana AI\.exe"/);
  assert.doesNotMatch(mainSrc, /find\.exe" "%ANC_PID%"/);
  assert.doesNotMatch(mainSrc, /find\.exe" \/I "Brana AI\.exe"/);
  assert.match(mainSrc, /function cleanOrphanFindProcesses\(\)/);
  assert.match(mainSrc, /winmgmts:/);
  assert.ok(!mainSrc.includes('setTimeout(() => { try { shell.showItemInFolder(p.file); } catch {} }, 2500)'));
  assert.match(closePs, /\$hasMain -and -not \$env:BRANA_UPDATING/);
  assert.match(closePs, /Repair-UninstallRegistry/);
  assert.doesNotMatch(closePs, /taskkill\.exe.*\/T \/PID/);

  const instNsh = fs.readFileSync(path.join(__dirname, '../scripts/installer.nsh'), 'utf8');
  assert.match(instNsh, /!macro customInit/);
  assert.match(instNsh, /ReadEnvStr \$0 "ANC_DIR"/);
  assert.match(instNsh, /-WindowStyle Hidden/);

  const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(pkgJson.build.files.includes('gen/**/*'));
  assert.ok(pkgJson.build.files.includes('data/**/*'));
});
