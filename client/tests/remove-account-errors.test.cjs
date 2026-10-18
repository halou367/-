const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8');
const fn=core.slice(core.indexOf('function removeCheck(r)'),core.indexOf('// ---------- 宿主（Electron / Android）'));
const c=vm.createContext({});vm.runInContext(fn+'\nthis.removeCheck=removeCheck;',c);
test('only an explicit true / {ok:true} counts as removed; Android reasons are surfaced',()=>{
  assert.equal(c.removeCheck(true),true);assert.equal(c.removeCheck({ok:true}),true);
  assert.throws(()=>c.removeCheck({error:'账号「a@b.c」正在认证'}),/正在认证/);
  assert.throws(()=>c.removeCheck(false),/不存在|已被删除/);
  assert.throws(()=>c.removeCheck(null),/没有确认/);
  assert.throws(()=>c.removeCheck(undefined),/没有确认/);
});
test('all three delete entry points check the result instead of assuming success',()=>{
  for(const f of ['mgr.js','accounts.js']){const s=fs.readFileSync(path.join(root,'ui',f),'utf8');assert.match(s,/removeCheck\(await Host\.removeAccount/);assert.doesNotMatch(s,/r === false\) toast\('删除失败'/);}
});
test('Android removeAccount reports a reason, allows deleting the account that holds the stale auth lease, never says deleted silently',()=>{
  const j=fs.readFileSync(path.join(root,'android/app/src/main/java/ai/arena/client/MainActivity.java'),'utf8');
  const i=j.indexOf('String removeAccountChecked(String id)'),body=j.slice(i,j.indexOf('void openAccount(String id)',i));
  assert.ok(i>0);assert.doesNotMatch(body,/return "false"/);
  assert.match(body,/AuthRouteState\.locked\(a\)/);assert.match(body,/id\.equals\(a\.optString\("id"\)\)\) continue/);   // 只看「别的账号」的认证租约
  assert.match(body,/没能切换到其他账号/);assert.match(body,/toast\("删除失败：/);
  assert.match(j,/!curId\.equals\(id\) && !curId\.equals\(removingId\)/);
  assert.match(j,/@JavascriptInterface public String removeAccount\(String id\) \{ return MainActivity\.this\.removeAccountChecked\(id\); \}/);
});
