const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const acc = read('ui/accounts.js'), nr = read('ui/node-routes.js'), view = read('ui/view.js'), css = read('ui/app.css'), boot = read('ui/boot.js');

test('连接设置默认收成一行摘要，展开才选节点/代理/直连，null 子节点不会渲染成文字', () => {
  assert.match(nr, /options\.collapsible/); assert.match(nr, /np-sum/); assert.match(nr, /np-expanded/);
  assert.match(nr, /\.filter\(Boolean\)/);
  assert.match(css, /\.np-body\[hidden\]/);
});

test('Google / Brana 检测在「确认」时自动进行，不再有单独的测试按钮', () => {
  assert.ok(!/'测 Google'|'测 Brana'|testGoogle|testBrana/.test(nr));
  assert.match(nr, /googleCheck/); assert.match(nr, /Google 连接正常/); assert.match(nr, /Brana 检测通过/);
});

test('登录页：登录/注册/网页三个标签，没有「切换到其他账号」，有删除账号（二次确认、至少保留一个）', () => {
  assert.match(acc, /\['web', '网页'\]/);
  assert.ok(!/'切换到其他账号'/.test(acc));
  assert.match(acc, /deleteCurrent\(\)/);
  const del = acc.slice(acc.indexOf('async deleteCurrent()'), acc.indexOf('authPost(path, body)'));
  assert.match(del, /accts\.length <= 1/); assert.match(del, /Dialog\.confirm/); assert.match(del, /danger: true/);
  assert.ok(del.indexOf('Host.openAccount') < del.indexOf('Host.removeAccount'));
  assert.match(acc, /刷新/);
});

test('登录页和添加账号页都用横排表单行和与 RegionIP 一致的展开式连接设置，说明收进 i 图标', () => {
  assert.equal((acc.match(/collapsible: true/g) || []).length, 0);
  assert.match(acc, /frow\('邮箱'/); assert.match(acc, /frow\('密码'/); assert.match(acc, /infoNote/);
  assert.match(css, /\.frow\{/); assert.match(css, /\.lnote-i/);
});

test('左上角 logo 是浏览器模式按钮：先确认，再用当前账号环境打开官网', () => {
  assert.match(view, /brand brand-btn/); assert.match(view, /browserModeAsk\(\)/);
  const fn = acc.slice(acc.indexOf('async browserModeAsk()'), acc.indexOf('// 删除当前账号'));
  assert.match(fn, /Dialog\.confirm/); assert.match(fn, /browserMode\(\)/);
  assert.match(acc, /\(Host\.browserMode\|\|Host\.login\)\(this\.browserTarget\(\) \|\| undefined\)/);
});

test('logo 切换浏览器模式：当前在哪个对话就直接打开官网的这个对话，新对话才开首页', () => {
  const src = acc.slice(acc.indexOf('browserTarget() {'), acc.indexOf('async browserMode()')).replace(/^browserTarget\(\) /, 'function browserTarget() ').replace(/\},\s*$/, '}');
  const run = cur => new Function('Tabs', src + ';return browserTarget()')({ cur });
  assert.equal(run({ sid: '3f2a9c10-7b1e-4c55-9d0a-1e2f3a4b5c6d' }), 'https://arena.ai/agent/3f2a9c10-7b1e-4c55-9d0a-1e2f3a4b5c6d');
  assert.equal(run({ sid: '' }), ''); assert.equal(run(null), ''); assert.equal(run({ sid: 'x/../evil' }), '');
  assert.match(acc, /当前在哪个对话，就直接打开官网上的这个对话/);
});

test('网页里登录后账号还没有邮箱，回到客户端自动补上', () => {
  assert.match(boot, /!c\.email && UI\.me\?\.email/); assert.match(boot, /glogin=1/);
});
