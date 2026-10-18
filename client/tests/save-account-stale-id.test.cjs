const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const rd=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('desktop saveAccount refuses a stale account id instead of creating a new account',()=>{
  const s=rd('src/main.js'),a=s.indexOf("ipcMain.handle('host:saveAccount'"),b=s.indexOf('cur = {',a);
  const body=s.slice(a,b);assert.match(body,/if \(a\.id && !cur\) throw/);
});
test('android saveAccount refuses a stale account id instead of creating a new account',()=>{
  const s=rd('android/app/src/main/java/ai/arena/client/MainActivity.java'),a=s.indexOf('JSONObject a = id.isEmpty() ? null : find(id);'),b=s.indexOf('a = new JSONObject().put("id", newId())',a);
  assert.ok(a>0&&b>a);assert.match(s.slice(a,b),/!id\.isEmpty\(\) && a == null\) throw new Exception/);
});
