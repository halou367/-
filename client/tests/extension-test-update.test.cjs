'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../ui/update.js'),'utf8');
function setup(flag){let requests=0;const ctx={Host:{fetchText:async()=>{requests++;return {text:'{}'};},updStart:async()=>{}},BranaHost:flag?{extensionCompatibilityTest:true}:undefined,VERSION:'0.13.130-beta.8-ext.1',Prefs:{updUrl:'https://updates.invalid'},toast(){},setTimeout(){},setInterval(){},console};vm.createContext(ctx);vm.runInContext(source+'\nthis.checker=Update;',ctx);return {update:ctx.checker,requests:()=>requests};}
test('isolated extension test never contacts or switches to the official update channel',async()=>{const s=setup(true);assert.equal(s.update.can(),false);await s.update.check();await s.update.checkNow();await s.update.stable();await s.update.beta();assert.equal(s.requests(),0);});
test('normal update behavior remains available without the test-build marker',()=>{assert.equal(setup(false).update.can(),true);});
