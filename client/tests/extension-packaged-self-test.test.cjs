'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {assertEmptyProfile}=require('../src/extension-packaged-self-test');
function root(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'packaged-guard-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));fs.mkdirSync(path.join(p,'s'));return p;}
test('packaged diagnostic accepts only a fresh empty isolated profile',t=>{assert.doesNotThrow(()=>assertEmptyProfile(root(t)));});
test('packaged diagnostic refuses an existing account file without changing it',t=>{const p=root(t),file=path.join(p,'accounts.json');fs.writeFileSync(file,'preserve');assert.throws(()=>assertEmptyProfile(p));assert.equal(fs.readFileSync(file,'utf8'),'preserve');});
test('packaged diagnostic refuses existing session state',t=>{const p=root(t);fs.writeFileSync(path.join(p,'s','Cookie-marker'),'preserve');assert.throws(()=>assertEmptyProfile(p));});
