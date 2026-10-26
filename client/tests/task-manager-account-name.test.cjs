'use strict';
// 任务管理器里每个账号窗口的进程/窗口名必须能区分账号：
// 有账号备注显示备注，否则显示邮箱前缀/账号名，且改备注后实时刷新（不再被第一次捕获的旧标题冻结）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function sliceFn(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  assert.ok(i >= 0, 'missing source slice: ' + startMarker);
  const j = src.indexOf(endMarker, i);
  assert.ok(j > i, 'unterminated source slice: ' + startMarker);
  return src.slice(i, j + endMarker.length);
}

function loadNaming() {
  const helper = sliceFn(main, 'const acctDisplayName', '\n};');
  const tag = sliceFn(main, 'function formatProcessMemTag()', '\n}');
  const apply = sliceFn(main, 'function applyWindowTaskMgrTitle(w, rawSubTitle)', '\n}');
  const accounts = new Map();
  const wins = new Map();
  const ctx = {
    APP_TITLE: 'Brana AI',
    app: { getAppMetrics: () => ([
      { type: 'Browser', memory: { workingSetSize: 60 * 1024 } },
      { type: 'Tab', memory: { workingSetSize: 90 * 1024 } },
      { type: 'GPU', memory: { workingSetSize: 50 * 1024 } },
      { type: 'Utility', memory: { workingSetSize: 12 * 1024 } },
    ]) },
    wins,
    acct: id => accounts.get(id),
  };
  vm.createContext(ctx);
  vm.runInContext(helper + '\n' + tag + '\n' + apply + '\nthis.__fns = { acctDisplayName, applyWindowTaskMgrTitle, formatProcessMemTag };', ctx);
  return { fns: ctx.__fns, accounts, wins };
}

const mkWin = (title = '') => ({
  _t: title,
  destroyed: false,
  isDestroyed() { return this.destroyed; },
  getTitle() { return this._t; },
  setTitle(s) { this._t = String(s); },
});

test('acctDisplayName: remark first, then email prefix, then account name', () => {
  const { fns } = loadNaming();
  assert.equal(fns.acctDisplayName({ remark: '  主力   工作号 ', email: 'alice@example.com', name: 'alice@example.com' }), '主力 工作号');
  assert.equal(fns.acctDisplayName({ remark: '   ', email: 'bob.smith@example.com', name: 'x' }), 'bob.smith');
  assert.equal(fns.acctDisplayName({ email: '', name: '账号 2' }), '账号 2');
  assert.equal(fns.acctDisplayName({ email: 'carol@example.com' }), 'carol');
  assert.equal(fns.acctDisplayName(null), '');
  assert.equal(fns.acctDisplayName({}), '');
});

test('account window title leads with the remark so Task Manager rows differ', () => {
  const { fns, accounts, wins } = loadNaming();
  accounts.set('a1', { id: 'a1', remark: '主力工作号', email: 'alice@example.com', name: 'alice@example.com' });
  const w = mkWin('Brana AI · alice');
  wins.set('a1', w);
  fns.applyWindowTaskMgrTitle(w, '深度对话 · alice · 1.2.3.4');
  assert.ok(w._t.startsWith('主力工作号 · '), w._t);
  assert.ok(w._t.includes('深度对话'), w._t);
  assert.ok(w._t.includes('alice'), 'email still present after the remark for disambiguation');
  assert.ok(w._t.includes('【前台窗口·对话交互】[前台进程: 1主控'), w._t);
  assert.ok(w._t.length <= 220);
});

test('account without remark falls back to email prefix', () => {
  const { fns, accounts, wins } = loadNaming();
  accounts.set('a2', { id: 'a2', remark: '', email: 'bob@example.com', name: 'bob@example.com' });
  const w = mkWin('Brana AI · bob');
  wins.set('a2', w);
  fns.applyWindowTaskMgrTitle(w, '新对话 · bob · 5.6.7.8');
  assert.ok(w._t.startsWith('bob · '), w._t);
  assert.equal(w._t.split('bob').length - 1, 1, w._t);
});

test('renaming the remark refreshes the window title (no frozen first title)', () => {
  const { fns, accounts, wins } = loadNaming();
  const acctObj = { id: 'a3', remark: '', email: 'carol@example.com', name: 'carol@example.com' };
  accounts.set('a3', acctObj);
  const w = mkWin('Brana AI · carol');
  wins.set('a3', w);
  fns.applyWindowTaskMgrTitle(w);
  assert.ok(w._t.startsWith('carol · '), w._t);
  acctObj.remark = '新备注';
  fns.applyWindowTaskMgrTitle(w);
  assert.ok(w._t.startsWith('新备注 · '), w._t);
  acctObj.remark = '';
  fns.applyWindowTaskMgrTitle(w);
  assert.ok(w._t.startsWith('carol · '), w._t);
});

test('windows without an owning account keep the legacy tag-first title', () => {
  const { fns } = loadNaming();
  const orphan = mkWin('Brana AI · 账号管理');
  fns.applyWindowTaskMgrTitle(orphan, '设置');
  assert.ok(orphan._t.startsWith('【前台窗口·对话交互】'), orphan._t);
  assert.ok(orphan._t.includes('账号管理'), orphan._t);
  const { fns: f2, wins: wins2 } = loadNaming();
  const dangling = mkWin('Brana AI · 旧窗口');
  wins2.set('gone', dangling);
  assert.doesNotThrow(() => f2.applyWindowTaskMgrTitle(dangling));
  const dead = mkWin('Brana AI · x');
  dead.destroyed = true;
  assert.doesNotThrow(() => f2.applyWindowTaskMgrTitle(dead));
  assert.equal(dead._t, 'Brana AI · x');
});

test('main.js wiring: all per-account title writes go through the central composer', () => {
  assert.ok(main.includes('const acctDisplayName'), 'display-name helper exists');
  assert.ok(main.includes("title: `${APP_TITLE} · ${acctDisplayName(a) || '账号'}`"), 'openAccount seeds an account-named title');
  assert.ok(main.includes("acctWin && !acctWin.isDestroyed()) applyWindowTaskMgrTitle(acctWin);"), 'saveAccount refreshes the title after remark/name writes');
  const rename = main.slice(main.indexOf("ipcMain.handle('host:renameAccount'"), main.indexOf("ipcMain.handle('host:removeAccount'"));
  assert.ok(rename.includes('applyWindowTaskMgrTitle(w);'), 'renameAccount refreshes through the central composer');
  assert.ok(!rename.includes('w.setTitle('), 'renameAccount no longer hard-codes a stale title');
  assert.ok(main.includes('【前台窗口·对话交互】[前台进程: 1主控'));
  assert.ok(main.includes('｜ 后台进程: 3显卡加速'));
});
