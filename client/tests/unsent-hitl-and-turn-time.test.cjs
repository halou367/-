const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const core=fs.readFileSync(path.join(root,'ui/core.js'),'utf8');
function hitl(){const c=vm.createContext({});vm.runInContext(core.slice(core.indexOf('const Hitl = {'),core.indexOf('const MsgCache = '))+'\nthis.Hitl=Hitl;',c);return c.Hitl;}
const ans=(id,failed)=>({role:'user',failed,parts:[{type:'data-tool-results',data:[{toolCallId:id,output:{answers:['x']}}]}]});
test('an interactive-card answer that failed to send does not count as answered',()=>{
  const H=hitl();
  assert.equal(H.answers({messages:[ans('t1',true)]}).has('t1'),false);
  assert.equal(H.answers({messages:[ans('t1',false)]}).has('t1'),true);
});
test('a staged (not yet sent) answer is still shown, and unsent ones revert after the failure is removed',()=>{
  const H=hitl(),chat={messages:[ans('t2',true)],hitlStage:new Map([['t3',{output:{answers:['y']}}]])};
  const m=H.answers(chat);assert.equal(m.has('t2'),false);assert.equal(m.has('t3'),true);
});
test('Trace.turnSec prefers the recorded turn duration and falls back to timestamps',()=>{
  const src=fs.readFileSync(path.join(root,'ui/trace.js'),'utf8'),line=src.split('\n').find(l=>l.includes('const turnSec = t =>'));
  const c=vm.createContext({});vm.runInContext(line+'\nthis.turnSec=turnSec;',c);
  assert.equal(c.turnSec({dur:48200}),48.2);
  assert.equal(c.turnSec({done:true,at:1000,lastAt:61000}),60);
  assert.equal(c.turnSec({done:true,at:1000,lastAt:1000}),null);
  assert.equal(c.turnSec(null),null);
});
