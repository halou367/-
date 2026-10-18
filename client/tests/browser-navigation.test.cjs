'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createReturnTargets,arenaURL,setupBrowserNavigation}=require('../src/browser-navigation');
test('last external page is exact and per account; Arena and unsafe pages do not prompt',()=>{const r=createReturnTargets();r.remember('one','https://example.com/path?q=1#part');assert.equal(r.previous('one'),'https://example.com/path?q=1#part');assert.equal(r.previous('two'),'');r.remember('one','https://arena.ai/agent/demo');assert.equal(r.previous('one'),'');r.remember('one','javascript:alert(1)');assert.equal(r.previous('one'),'');assert(arenaURL('https://auth.arena.ai/'));assert(!arenaURL('https://arena.ai.evil.example/'));});
test('mode switch prompts only after leaving an external page, honors both choices and cancellation',async()=>{
 const handlers=new Map(),a={id:'one'},frame={},calls=[],prompts=[];let url='https://example.com/path',response=0;
 const wc={mainFrame:frame,__navigate(){},isDestroyed:()=>false,getURL:()=>url};const e={sender:wc,senderFrame:frame};
 setupBrowserNavigation({BrowserWindow:{fromWebContents:()=>({})},ipcMain:{handle:(k,f)=>handlers.set(k,f)},dialog:{showMessageBox:async(_w,q)=>{prompts.push(q);return {response};}},clientURL:'https://arena.ai/robots.txt',arena:'https://arena.ai/',owners:new Map(),accountFor:()=>a,navigate:async(_wc,target)=>calls.push(target)});
 await handlers.get('browser:return-client')(e);url='https://arena.ai/robots.txt';await handlers.get('host:browserMode')(e,'https://arena.ai/agent/demo');assert.equal(calls.at(-1),'https://example.com/path');assert.equal(prompts.length,1);
 response=1;await handlers.get('host:browserMode')(e,'https://arena.ai/agent/demo');assert.equal(calls.at(-1),'https://arena.ai/agent/demo');response=2;const before=calls.length;assert.deepEqual(await handlers.get('host:browserMode')(e),{cancelled:true});assert.equal(calls.length,before);
 url='https://arena.ai/agent/demo';await handlers.get('browser:return-client')(e);url='https://arena.ai/robots.txt';const count=prompts.length;await handlers.get('host:browserMode')(e);assert.equal(prompts.length,count);assert.equal(calls.at(-1),'https://arena.ai/');url='chrome-extension://'+'a'.repeat(32)+'/popup.html';await handlers.get('browser:return-client')(e);assert.equal(calls.at(-1),'https://arena.ai/robots.txt');
 await assert.rejects(handlers.get('host:browserMode')({...e,senderFrame:{}}));url='https://arena.ai/';await assert.rejects(handlers.get('host:browserMode')(e));
});
