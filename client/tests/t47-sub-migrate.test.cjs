// T47: after a subscription update/change, accounts move to the newest subscription's node (old node/link not kept)
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const OLD = 'vless://00000000-0000-4000-8000-00000000000a@old.example.com:443?encryption=none&security=tls&type=ws&host=old.example.com&path=%2F#JP-1';
const NEW = 'vless://00000000-0000-4000-8000-00000000000b@new.example.com:443?encryption=none&security=tls&type=ws&host=new.example.com&path=%2F#JP-1';
function setup() {
  const shared = {}, saves = [];
  const c = vm.createContext({ console, setTimeout, clearTimeout, URL, URLSearchParams, atob, btoa, TextDecoder, TextEncoder, now: () => Date.now(), sleep: async () => {}, Bus: { emit() {}, on() { return () => {}; } }, UI: { host: null } });
  let accounts = [];
  c.Host = { shared: async (k, v) => { if (v !== undefined) shared[k] = JSON.parse(JSON.stringify(v)); return shared[k]; }, listAccounts: async () => JSON.parse(JSON.stringify(accounts)), saveAccount: async a => { saves.push(a); accounts = accounts.map(x => x.id === a.id ? { ...x, ...a } : x); return a; }, info: async () => ({}) };
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/accounts.js'), 'utf8').match(/^const isVless = .*;$/m)[0] + ';this.isVless=isVless;', c);
  vm.runInContext(fs.readFileSync(path.join(root, 'ui/vless.js'), 'utf8') + ';this.Vless=Vless;', c);
  const src = fs.readFileSync(path.join(root, 'ui/nodes.js'), 'utf8');
  vm.runInContext(src.slice(0, src.indexOf('// 导入节点对话框')) + ';this.Nodes=Nodes;', c);
  return { c, N: c.Nodes, saves, setAccounts: a => { accounts = a; } };
}
test('refreshing a subscription moves accounts off the replaced node onto the newest one', async () => {
  const { c, N, saves, setAccounts } = setup();
  const old = N.mk(c.Vless.parse(OLD), 'https://sub.example/a');
  const manual = N.mk(c.Vless.parse(OLD.replace('old.example.com:443', 'manual.example.com:443').replace('#JP-1', '#mine')));
  await c.Host.shared('nodes', [old, manual]); await c.Host.shared('nodesubs', [{ url: 'https://sub.example/a' }]);
  setAccounts([{ id: 'acc', proxy: c.Vless.toLink(old), nodeId: old.id, region: 'JP', proxyIp: '' }, { id: 'keep', proxy: c.Vless.toLink(manual), nodeId: manual.id, region: 'US', proxyIp: '' }]);
  await N.load(); N.fetchSub = async () => ({ text: NEW });
  const r = await N.refreshSubs();
  assert.equal(r.moved, 1);
  assert.ok(!N.list.some(n => n.id === old.id), 'old subscription node removed even though it was in use');
  const fresh = N.list.find(n => n.address === 'new.example.com');
  assert.equal(saves.length, 1); assert.equal(saves[0].id, 'acc');
  assert.equal(saves[0].nodeId, fresh.id); assert.equal(saves[0].proxy, c.Vless.toLink(fresh)); assert.equal(saves[0].region, 'JP');
});
test('changing the subscription URL drops the old subscription nodes and moves accounts to the new one', async () => {
  const { c, N, saves, setAccounts } = setup();
  const old = N.mk(c.Vless.parse(OLD), 'https://sub.example/a');
  await c.Host.shared('nodes', [old]); await c.Host.shared('nodesubs', [{ url: 'https://sub.example/a' }]);
  setAccounts([{ id: 'acc', proxy: c.Vless.toLink(old), nodeId: old.id, region: 'JP', proxyIp: '' }]);
  await N.load(); N.fetchSub = async () => ({ text: NEW });
  const r = await N.setSub('https://sub.example/b');
  assert.equal(r.ok, true); assert.equal(r.moved, 1);
  assert.deepEqual(N.subs.map(s => s.url), ['https://sub.example/b']);
  assert.deepEqual(N.list.map(n => n.address), ['new.example.com']);
  assert.equal(saves[0].nodeId, N.list[0].id);
});
test('importing the same subscription twice does not duplicate nodes', async () => {
  const { N } = setup();
  await N.load(); N.fetchSub = async () => ({ text: NEW });
  await N.importAny('https://sub.example/b'); const r = await N.importAny('https://sub.example/b');
  assert.equal(N.list.length, 1); assert.equal(r.exist, 1); assert.equal(r.added.length, 0);
});
