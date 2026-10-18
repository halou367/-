const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(version,routes){
  const urls=[],toasts=[];
  const src=fs.readFileSync(path.join(__dirname,'../ui/update.js'),'utf8').replace("const UPD_DEFAULT = '__UPD_URL__';","const UPD_DEFAULT = 'https://u.example.dev';").split('// 启动 4 秒后')[0];
  const c=vm.createContext({console,Prefs:{},VERSION:version,now:Date.now,toast:(...a)=>toasts.push(a),cleanErr:e=>e.message||String(e),Bus:{emit(){}},
    Host:{platform:'desktop',updStart(){},updInfo:async()=>({kind:'setup'}),fetchText:async u=>{urls.push(u);const k=Object.keys(routes).find(x=>u.includes(x));return {text:JSON.stringify(routes[k])};}}});
  vm.runInContext(src+';this.U=Update;',c);
  return {U:c.U,urls,toasts};
}
test('beta build: no newer stable -> checks the beta channel and reports already latest',async()=>{
  const h=setup('0.13.120-beta.5',{'/beta/latest':{version:'0.13.120-beta.5',files:{setup:{}}},'/latest':{version:'0.13.119'}});
  await h.U.checkNow();
  assert.ok(h.urls.some(u=>u.includes('/beta/latest')));
  assert.match(h.toasts.at(-1)[0],/最新测试版/);
});
test('beta build: a newer stable release is offered instead of saying already latest',async()=>{
  const h=setup('0.13.120-beta.5',{'/beta/latest':{version:'0.13.120-beta.5',files:{setup:{}}},'/latest':{version:'0.13.200',files:{setup:{}}}});
  let prompted=0;h.U.prompt=async()=>{prompted++;};
  await h.U.checkNow();
  assert.equal(prompted,1);
  assert.ok(!h.urls.some(u=>u.includes('/beta/latest')),'no need to look at the beta channel');
  assert.ok(!h.toasts.some(t=>/最新测试版/.test(t[0])));
});
test('stable build clicks check the stable channel only, even with no update',async()=>{
  const h=setup('0.13.119',{'/beta/latest':{version:'0.13.999-beta.1'},'/latest':{version:'0.13.119',files:{setup:{}}}});
  await h.U.checkNow();
  assert.ok(h.urls.length&&h.urls.every(u=>u.includes('/latest')&&!u.includes('/beta/')));
  assert.match(h.toasts.at(-1)[0],/已经是最新版本/);
});
test('beta build with a newer beta asks for the beta passphrase flow',async()=>{
  const h=setup('0.13.120-beta.4',{'/beta/latest':{version:'0.13.120-beta.5',files:{setup:{}}}});
  let asked=0;h.U.beta=async()=>{asked++;};
  await h.U.checkNow();
  assert.equal(asked,1);
});
