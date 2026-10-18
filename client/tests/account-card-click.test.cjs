// 切换账号面板的卡片：除按钮外点哪里都进入账号（含中间的统计区）；重建列表时旧卡片留到新卡片就绪；右上角有明确的「打开」按钮。
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');

function statsClickHandler() {
  const s = read('ui/account-management.js'), m = s.match(/stats\.addEventListener\('click', (ev => \{[\s\S]*?\n\s*\})\);/);
  assert.ok(m, 'stats block click handler exists');
  return (c, getSelection) => new Function('c', 'getSelection', 'return ' + m[1])(c, getSelection);
}
const event = (hit = () => null, defaultPrevented = false) => ({ defaultPrevented, target: { closest: hit } });
const card = () => { const c = { entered: 0, contains: () => true }; c._enter = () => { c.entered++; }; return c; };

test('clicking text or empty space in the stats block enters the account', () => {
  const c = card(), handler = statsClickHandler()(c, () => ({ isCollapsed: true }));
  handler(event()); assert.equal(c.entered, 1);
  handler(event(() => null)); assert.equal(c.entered, 2);
});

test('controls, the expanded detail list, text selections and handled events never enter', () => {
  const make = selection => { const c = card(); return { c, handler: statsClickHandler()(c, () => selection) }; };
  let x = make({ isCollapsed: true });
  x.handler(event(sel => /button/.test(sel) ? {} : null)); assert.equal(x.c.entered, 0, 'buttons stay buttons');
  x.handler(event(sel => /\.acct-vendor-detail/.test(sel) ? {} : null)); assert.equal(x.c.entered, 0, 'expanded detail list is for browsing');
  x.handler(event(() => null, true)); assert.equal(x.c.entered, 0, 'defaultPrevented is respected');
  x = make({ isCollapsed: false, anchorNode: {}, focusNode: {} });
  x.handler(event()); assert.equal(x.c.entered, 0, 'a text selection inside the card is not a click');
  x = make(null);
  x.handler(event()); assert.equal(x.c.entered, 1, 'no selection API still enters');
  const s = read('ui/account-management.js'), mount = s.slice(s.indexOf('mount(c, a, enter) {'), s.indexOf('paint,', s.indexOf('mount(c, a, enter) {')));
  assert.match(mount, /c\._enter = enter/); assert.match(mount, /c\._enter\?\.\(\)/);
  assert.match(mount, /closest\('button,input,select,textarea,label,a,\[role=button\],\.acct-vendor-detail'\)/);
});

test('rebuilding the list keeps the old cards clickable until the new ones are ready', () => {
  const s = read('ui/account-picker.js'), render = s.slice(s.indexOf('const render = async () => {'), s.indexOf('const refresh = async'));
  assert.ok(render.length > 200, 'render body found');
  assert.doesNotMatch(render, /list\.replaceChildren\(\);/, 'list is no longer emptied before the rebuild');
  assert.match(render, /cards = next; list\.style\.paddingTop = ''; list\.style\.paddingBottom = ''; list\.replaceChildren\(\.\.\.cards\);/, 'single swap once every card exists');
  assert.ok(render.indexOf('await PanelWork.frame()') < render.indexOf('list.replaceChildren(...cards)'), 'yielding happens before the swap, not after an empty list');
});

test('account cards remove inline open/delete buttons and use click to enter plus right-click contextMenu to delete', () => {
  const s = read('ui/account-picker.js');
  assert.doesNotMatch(s, /acct-enter/, 'inline open button is removed from account cards');
  assert.doesNotMatch(s, /acct-del/, 'inline delete button is removed from account cards');
  assert.match(s, /c\.addEventListener\('contextmenu', menu\)/, 'right-click contextmenu delete is bound');
  const cards = read('ui/accounts.js'), start = cards.indexOf('function acctCard('), end = cards.indexOf('function acctWheel(', start);
  assert.doesNotMatch(cards.slice(start, end), /acct-enter/, 'the shared card builder stays free of the desktop-only button');
  const css = read('ui/app.css');
  assert.match(css, /\.acct-compact \.acct-stats\{[^}]*cursor:pointer\}/); assert.match(css, /\.acct-compact \.acct-stats \.acct-vendor-detail\{cursor:default\}/);
  assert.match(css, /\.acct-menu \.acct-list\.wheel>\.acct-compact\{cursor:pointer\}/);
});
