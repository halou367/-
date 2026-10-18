const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function picker() {
  const env = { now: () => 1000, fmtClock: () => '12:30', emailUser: a => a?.email?.split('@')[0] || a?.name || '账号' };
  vm.createContext(env); vm.runInContext(fs.readFileSync(path.join(root, 'ui/account-picker.js'), 'utf8') + '\nthis.picker=AccountPicker;', env);
  return env.picker;
}
function native() {
  const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const code = source.slice(source.indexOf("ipcMain.handle('host:renameAccount'"), source.indexOf("ipcMain.handle('host:removeAccount'"));
  const account = { id: 'a', name: '原名称', email: 'a@example.test', pw: 'encrypted-fixture', proxy: 'vless://fixture', proxyIp: 'fixture-ip', nodeId: 'node', region: 'JP', status: { loggedIn: true, quota: { chatRemaining: 4 } }, fp: { seed: 7 } };
  const env = { account, calls: 0, fail: false, wins: new Map(), acct: id => id === 'a' ? account : null, ipcMain: { handle: (_name, fn) => { env.fn = fn; } }, saveDB: strict => { assert.equal(strict, true); env.calls++; if (env.fail) throw Error('disk full'); } };
  vm.createContext(env); vm.runInContext(code, env); return env;
}
test('explicit remark wins; legacy and official nicknames never override the email prefix', () => {
  const p = picker(); assert.equal(p.name({ name: '官方昵称', remark: '工作 GPT', email: 'old@example.test' }), '工作 GPT');
  assert.equal(p.name({ name: 'old@example.test', email: 'old@example.test' }), 'old');
  assert.equal(p.name({ name: '旧手动名称', email: 'fallback@example.test' }), 'fallback');assert.equal(p.name({name:'官方昵称'}),'账号');
});
test('search covers accounts beyond page one and never mutates source-order shortcuts', () => {
  const p = picker(), rows = Array.from({ length: 121 }, (_, i) => ({ id: i, remark: '账号 ' + i }));
  assert.equal(p.select(rows, '账号 120', 0).visible[0].id, 120); assert.equal(rows[120].id, 120);
  assert.equal(p.select(rows, '', 5).visible.length, 20); assert.equal(p.select(rows, '', 6).visible.length, 1);
});
test('search normalizes full width/case and supports literal punctuation rather than regex', () => {
  const p = picker(); assert.ok(p.match({ remark: 'GPT 工作 [A]' }, ' ｇｐｔ ')); assert.ok(p.match({ remark: '[A]' }, '['));
  assert.ok(!p.match({ remark: '业务', email: 'BackUP@example.test' }, 'backup')); assert.ok(p.match({ email: 'BackUP@example.test' }, 'backup')); assert.ok(!p.match({ remark: 'abc' }, '.*'));
});
test('paging clamps invalid indices and empty matches stay empty', () => {
  const p = picker(), rows = [{ id: 1, name: '一' }]; assert.equal(p.select(rows, '', 99).page, 0);
  assert.equal(p.select(rows, '不存在', 3).visible.length, 0); assert.equal(p.select(rows, '', NaN).page, 0);
});
test('Pulse is the sole quota source; retired dollar caches never override it', () => {
  const p = picker(), b = quota => p.balance({ status: { quota } }).pct;
  assert.equal(b({ usd: 4, allowance: 10, pulse: 80 }), 80); assert.equal(b({ usd: 0, allowance: 10 }), null);
  assert.equal(b({ usd: 12, allowance: 10 }), null); assert.equal(b({ usd: -2, allowance: 10 }), null);
  assert.equal(b({ usd: 4, allowance: 0 }), null); assert.equal(b({ pulse: 62 }), 62); assert.equal(b({ pulse: 150 }), 100); assert.equal(b({ pulse: -3 }), 0); assert.equal(b({ usd: '4', allowance: 10 }), null);
});
test('idle status shows remaining new-chat quota including zero, not a fabricated limit', () => {
  const p = picker(); assert.equal(p.progress({ status: { quota: { chatRemaining: 4, chatLimit: 10 } } }), '4/10');
  assert.equal(p.quota({ status: { quota: { chatRemaining: 0, chatLimit: 10 } } }), '0/10'); assert.equal(p.quota({}), '—/—');
  assert.equal(p.quota({ status: { quota: { chatRemaining: 4 } } }), '4');
});
test('running/captcha/error and previous results are preserved over idle quota', () => {
  const p = picker(), a = { status: { quota: { chatRemaining: 4, chatLimit: 10 } } };
  assert.match(p.progress(a, { busy: true, done: 2, total: 10, hits: 1, phase: '运行中' }), /抽卡中 2\/10.*命中 1.*运行中/);
  assert.match(p.progress(a, { cap: true }), /人机验证/); assert.match(p.progress(a, { err: '失败' }), /抽卡已停：失败/);
  assert.match(p.progress(a, { done: 3, total: 10 }), /上次抽卡 3\/10.*4\/10/);
});
test('rate limit appears only with exhausted quota when idle', () => {
  const p = picker(); assert.match(p.progress({ status: { quota: { blockedUntil: 2000, chatRemaining: 0, chatLimit: 10 } } }), /0\/10.*限流/);
  assert.doesNotMatch(p.progress({ status: { quota: { blockedUntil: 2000, chatRemaining: 4, chatLimit: 10 } } }), /限流/);
});
test('late pre-rename snapshots cannot roll the visible name back', () => {
  const p = picker(); p.renamed.set('a', { name: '新名称', at: 900 });
  assert.equal(p.mergeRead([{ id: 'a', name: '原名称' }], 800)[0].remark, '新名称');
  p.mergeRead([{ id: 'a', remark: '新名称' }]); assert.equal(p.renamed.size, 1, 'local render is not a native acknowledgement');
  p.mergeRead([{ id: 'a', remark: '新名称' }], 950); assert.equal(p.renamed.size, 0);
});
test('rename overlays expire instead of masking later account-manager edits forever', () => {
  const p = picker(); p.renamed.set('a', { name: '过期', at: -20000 }); assert.equal(p.mergeRead([{ id: 'a', name: '管理器名称' }])[0].name, '管理器名称');
  assert.equal(p.renamed.size, 0);
});
test('desktop native rename writes only explicit remark and does not create or restart an account', () => {
  const e = native(), old = JSON.parse(JSON.stringify(e.account)); const result = e.fn({}, 'a', ' 新名称 ');
  assert.equal(result.ok, true); assert.equal(result.id, 'a'); assert.equal(e.account.remark, '新名称'); assert.equal(e.calls, 1);
  old.remark = '新名称'; assert.deepEqual(e.account, old);
});
test('desktop native rename rejects missing accounts, controls, blanks and oversized values', () => {
  const e = native(); for (const value of ['', ' ', 'a\nb', 'x'.repeat(41), null, 15]) assert.throws(() => e.fn({}, 'a', value));
  assert.throws(() => e.fn({}, 'missing', '新名称')); assert.equal(e.calls, 0); assert.equal(e.account.name, '原名称');
});
test('desktop native rename rolls back in-memory name and returns failure if persistence fails', () => {
  const e = native(); e.fail = true; assert.throws(() => e.fn({}, 'a', '新名称'), /disk full/); assert.equal(e.account.name, '原名称');assert.equal(Object.hasOwn(e.account,'remark'),false);
});
test('both native bridges expose the name-only operation; UI never calls saveAccount for rename', () => {
  for (const name of ['src/preload.js', 'ui/core.js']) assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /renameAccount:.*call\('renameAccount', id, name\)/);
  const ui = fs.readFileSync(path.join(root, 'ui/account-picker.js'), 'utf8'); assert.match(ui, /Host\.renameAccount\(a\.id, name\)/); assert.doesNotMatch(ui, /Host\.saveAccount\(/);
  const java = fs.readFileSync(path.join(root, 'android/app/src/main/java/ai/arena/client/MainActivity.java'), 'utf8');
  const body = java.slice(java.indexOf('@JavascriptInterface public String renameAccount('), java.indexOf('@JavascriptInterface public String saveAccount('));
  assert.match(body, /synchronized \(acctLock\)/); assert.match(body, /\.commit\(\)/); assert.doesNotMatch(body, /proxyChanged|put\("proxy"|encPw|newId\(/);
});
test('wheel exempts pencil and gacha actions and remeasures padding on viewport changes', () => {
  const source = fs.readFileSync(path.join(root, 'ui/accounts.js'), 'utf8'); assert.match(source, /closest\('\.gacct,\.acct-edit'\)/);
  assert.match(source, /ResizeObserver\(\(\)=>\{if\(dead\)return;const c=cs\[center\];pad\(\)/);
});
test('strict desktop name persistence writes a temporary file before replacement and cleans failure', () => {
  const s = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'), start = s.indexOf('function saveDB('), end = s.indexOf('\n}', start) + 2;
  const calls = [], fake = { mkdirSync: () => {}, writeFileSync: (p) => calls.push(['write', p]), renameSync: (a,b) => calls.push(['rename',a,b]), unlinkSync: p => calls.push(['unlink',p]) };
  const env = { fs: fake, path, DB: {}, dataFile: () => '/fixture/accounts.json', console: { error() {} } }; vm.createContext(env);vm.runInContext(s.slice(start,end),env);env.saveDB(true);
  assert.deepEqual(calls.map(x=>x[0]),['write','rename','unlink']);assert.equal(calls[0][1],'/fixture/accounts.json.rename.tmp');
  calls.length=0;fake.writeFileSync=()=>{throw Error('disk full');};assert.throws(()=>env.saveDB(true),/disk full/);assert.deepEqual(calls,[['unlink','/fixture/accounts.json.rename.tmp']]);
});
