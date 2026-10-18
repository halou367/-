const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),V=require('../ui/vless.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('captcha route spec: empty = off, local, valid http/socks proxy; anything else is rejected',()=>{
  assert.equal(V.capSpec(''),'');assert.equal(V.capSpec(null),'');assert.equal(V.capSpec('LOCAL'),'local');
  for(const ok of ['http://127.0.0.1:7890','socks5://u:p@h.example:1080','127.0.0.1:7890','https://p.example:443'])assert.equal(V.capSpec(ok),ok);
  for(const bad of ['foo','http://a b:1','ftp://h:21','http://h','http://h:99999','vless://x@y:1'])assert.equal(V.capSpec(bad),null,bad);
});
test('withCap adds a cap outbound and a domain rule BEFORE everything else; off = config untouched',()=>{
  const base=()=>V.config({tag:'proxy',protocol:'vless'},1080);
  assert.deepEqual(V.withCap(base(),''),base());assert.deepEqual(V.withCap(base(),'garbage'),base());
  const c=V.withCap(base(),'socks5://u:p@h.example:1080');
  assert.equal(c.outbounds[0].tag,'proxy');   // 默认出站仍是账号的节点
  assert.deepEqual(c.outbounds.at(-1),{tag:'cap',protocol:'socks',settings:{address:'h.example',port:1080,user:'u',pass:'p'}});
  assert.equal(c.routing.rules[0].outboundTag,'cap');assert.ok(c.routing.rules[0].domain.includes('domain:recaptcha.net')&&c.routing.rules[0].domain.includes('domain:gstatic.com'));
  assert.ok(!c.routing.rules[0].domain.some(d=>/brana/.test(d)));   // arena.ai 永远不改线路
  assert.equal(V.withCap(base(),'local').outbounds.at(-1).protocol,'freedom');
});
test('Electron applies the cap route per tunnel (part of the tunnel signature) but never to probe tunnels',()=>{
  const m=read('src/main.js');
  assert.match(m,/startsWith\('ip-test-'\) \? '' : \(Vless\.capSpec\(DB\.shared\?\.caproute\)/);
  assert.match(m,/JSON\.stringify\(ob\) \+ \(cap \?/);assert.match(m,/Vless\.withCap\(Vless\.config\(/);
  assert.match(m,/if \(k === 'caproute'\)/);
});
test('fixed password and captcha route are real shared keys on BOTH platforms (they used to be silently rejected by the whitelist)',()=>{
  const m=read('src/main.js'),j=read('android/app/src/main/java/ai/arena/client/MainActivity.java');
  assert.match(m,/if \(k === 'fixedpw'\)/);assert.match(m,/DB\.shared\.fixedpw = \{ on: true, pw: encPw\(pw\) \}/);
  const g=j.slice(j.indexOf('public String sharedGet(String k)')),s=j.slice(j.indexOf('public String sharedSet(String k, String v)'));
  assert.ok(g.indexOf('"fixedpw".equals(k)')>0&&g.indexOf('"fixedpw".equals(k)')<g.indexOf('return sp.getString("shared_" + k'));
  assert.ok(s.indexOf('"fixedpw".equals(k)')>0&&s.indexOf('"caproute".equals(k)')>0&&s.indexOf('"caproute".equals(k)')<s.indexOf('if (!"prefs".equals(k)'));
  assert.match(s,/encPw\(pw\)/);   // 密码不是明文落盘
  assert.match(j,/capOutbound\(\)/);assert.match(j,/put\("domain", capDomains\(\)\)\.put\("outboundTag", "cap"\)/);
  assert.match(j,/if \(cap != null && isVless\(/);
});
test('Recaptcha falls back to the route chooser on load failure and exposes 换线路 in the modal and the floating bar',()=>{
  const c=read('ui/core.js');
  assert.match(c,/async function loadOrFallback\(\)/);assert.match(c,/return v2Open = loadOrFallback\(\)/);
  assert.match(c,/data-route title="[^"]*">换线路/);assert.match(c,/data-route2>换线路/);
  assert.ok(read('src/bundle.js').includes("'core.js', 'cap-route.js'"));
});
