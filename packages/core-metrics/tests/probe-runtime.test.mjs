import assert from 'node:assert/strict';
import test from 'node:test';
import {PROBES} from '../model-probe-engine.js';

await import('../probe-runtime.js');
const helper=globalThis.BranaProbeRuntime;
function values(length,salt){return Array.from({length},(_,index)=>1+((index*97+index*index*13+salt*31)%355));}

test('standalone automatic prompts match the scoring protocol exactly',()=>{
  assert.deepEqual(helper.probes.map(item=>item.expected_count),PROBES.map(item=>item.expected_count));
  assert.deepEqual(helper.probes.map(item=>item.prompt),PROBES.map(item=>item.prompt));
});

test('rendered comma/newline output remains one numeric run',()=>{
  const list=values(297,1),text=`Prompt asks for 297 values from 1 to 355.\nAssistant\n${list.slice(0,150).join(', ')}\n${list.slice(150).join(', ')}`;
  assert.equal(Math.max(...helper.parseRuns(text).map(run=>run.length)),297);
});

test('new response selection excludes runs present before sending',()=>{
  const prior=values(297,2),fresh=values(315,3),beforeText=`Old answer\n${prior.join(',')}`;
  const selected=helper.selectCandidate(`${beforeText}\nPrompt 315 in 1 to 355\nAssistant\n${fresh.join(',')}`,helper.signatures(beforeText),315);
  assert.deepEqual(selected,fresh);
});

test('task-success feedback matching covers card and accessible-label variants',()=>{
  assert.equal(helper.isTaskSuccessText('此任务成功了吗？'),true);
  assert.equal(helper.isTaskSuccessText('任务是否成功了吗'),true);
  assert.equal(helper.isTaskSuccessText('Was this task successful?'),true);
  assert.equal(helper.isTaskSuccessText('Task status'),false);
  assert.equal(helper.isContinueWorkText(' 继续工作 '),true);
  assert.equal(helper.isContinueWorkText('不，继续工作'),true);
  assert.equal(helper.isContinueWorkText('Continue working'),true);
  assert.equal(helper.isContinueWorkText('No, keep working'),true);
  assert.equal(helper.isContinueWorkText('继续'),false);
});

test('weak matches receive one trailing question mark in the conversation title',()=>{
  assert.equal(helper.renameTitleForResult('GPT-6 Astra','weak'),'GPT-6 Astra?');
  assert.equal(helper.renameTitleForResult('GPT-6 Astra','clear'),'GPT-6 Astra');
  assert.equal(helper.renameTitleForResult('GPT-6 Astra?','weak'),'GPT-6 Astra?');
  assert.equal(helper.renameTitleForResult('Claude Sonnet？','weak'),'Claude Sonnet？');
});

test.after(()=>{delete globalThis.BranaProbeRuntime;});
