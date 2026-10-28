'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const ui = f => fs.readFileSync(path.join(__dirname, '../ui', f), 'utf8');
const t = ui('titles.js'), code = t.slice(t.indexOf('const LocalCache = {'), t.indexOf('function forget(sid)'));
function env() {
  const calls = [], mem = new Map(); const log = (k, v) => calls.push(k + ':' + v);
  const Models = { all: { a: { name: 'opus-5.5' }, b: { name: 'sonnet-5.5' } } };
  const c = vm.createContext({ console, Models, Store: { get: (k, d) => mem.has(k) ? mem.get(k) : d, set: (k, v) => (mem.set(k, v), true) },
    MsgCache: { del: s => log('msg', s) }, Trace: { clear: s => log('trace', s) }, Drafts: { dropChats: l => log('drafts', l.join()) },
    Notes: { drop: s => log('notes', s) }, Fav: { setQuiet: (s, on) => log('fav', s + on) },
    Strength: { bookDrop: l => log('book', l.join()) }, PelicanTest: { drop: l => log('pelican', l.join()) }, Budget: { drop: l => log('budget', l.join()) } });
  vm.runInContext(code + ';this.LocalCache=LocalCache;', c);
  return { c, calls, Models, mem, L: c.LocalCache };
}
test('删除：消息缓存 / 运行记录 / 待发队列 / 型号 / 备注 / 收藏 / 推理分账本 / 鹈鹕结果 / 花费明细全部清掉', () => {
  const h = env(); h.L.drop(['a']);
  for (const k of ['msg:a', 'trace:a', 'drafts:a', 'notes:a', 'fav:afalse', 'book:a', 'pelican:a', 'budget:a']) assert.ok(h.calls.includes(k), k);
  assert.equal(h.Models.all.a, undefined); assert.ok(h.Models.all.b, 'other chats untouched'); assert.ok(h.mem.get('models').b);
});
test('归档：只清大块和临时的；型号 / 备注 / 收藏 / 推理分留着（归档列表要靠它们分类和搜索）', () => {
  const h = env(); h.L.drop(['a', 'b'], { archived: true });
  for (const k of ['msg:a', 'msg:b', 'trace:a', 'drafts:a,b']) assert.ok(h.calls.includes(k), k);
  assert.ok(!h.calls.some(x => /^(notes|fav|book|pelican|budget):/.test(x))); assert.ok(h.Models.all.a && h.Models.all.b);
});
test('空列表 / 重复 id 安全；一个清理失败不影响其它', () => {
  const h = env(); assert.equal(h.L.drop([]), 0); assert.equal(h.L.drop(['a', 'a', '']), 1);
  h.c.Trace.clear = () => { throw Error('x'); }; assert.doesNotThrow(() => h.L.drop(['b']));
});
test('所有「删除 / 归档」入口都走这一处：History.remove / History.archive / 批量删除 / 批量归档 / 单个删除', () => {
  const core = ui('core.js'), bulk = ui('bulk.js');
  assert.match(core, /protoMutate\('delete',\s*id[\s\S]*?try \{ LocalCache\.drop\(\[id\]\); \} catch \{\}/);
  assert.match(core, /try \{ LocalCache\.drop\(\[id\], \{ archived: true \}\); \} catch \{\}/);
  assert.match(bulk, /kind === 'arch'\) \{ try \{ LocalCache\.drop\(gone, \{ archived: true \}\)/);
  assert.match(bulk, /kind === 'del'\) \{\s*try \{ LocalCache\.drop\(gone\); \} catch \{\}/);
  assert.match(t, /function forget\(sid\) \{[\s\S]*?LocalCache\.drop\(\[(?:sid|sKey)\]\);/);
  assert.match(core, /if \(History\.goneMap\(\)\.has\(chat\.sid\)\) return;/, '刚删除 / 归档的对话不会被缓存写回');
});
