const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const rd=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('auth pages never run on the pinned old deployment',()=>{
  const core=rd('ui/core.js');const line=core.split('\n').find(l=>l.startsWith('Pin.authUrl = '));
  const Pin={};const location={href:'https://arena.ai/robots.txt'};eval(line);
  for(const u of ['https://arena.ai/auth/callback?code=x','https://auth.arena.ai/v1/verify?token=1','https://arena.ai/?auth=signup','https://arena.ai/create-password','https://arena.ai/login'])assert.equal(Pin.authUrl(u),true,u);
  for(const u of ['https://arena.ai/c/019a','https://arena.ai/robots.txt','https://evil.example/auth?code=1'])assert.equal(Pin.authUrl(u),false,u);
  assert.match(core,/if \(location\.pathname !== '\/robots\.txt' && Pin\.authUrl\(location\.href\)\) Pin\.hold\(true\); else Pin\.ensure\(true\);/);
  assert.match(core,/sign-up\|sign-in\|signup\|signin\|reset-password/,'page-originated auth requests release the pin');
});
test('web signup window and pasted auth links release the pin first',()=>{
  assert.match(rd('ui/boot.js'),/Pin\.hold\(true\); \} catch \{\}   \/\/ 网页注册全程不固定旧部署[^\n]*\n\s*try \{ await Host\.login\(\); return;/);
  assert.match(rd('ui/webbar.js'),/__vdpl=; path=\/; max-age=0[\s\S]*anc-pin-hold[\s\S]*location\.href = u;/);
});
