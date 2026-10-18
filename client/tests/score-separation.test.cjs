const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../ui',n+'.js'),'utf8');
test('the 0-10000 strength score never feeds the reasoning score used in conversation names',()=>{
  const r=read('fingerprint-review');
  const i=r.indexOf('existingScore');assert.ok(i>0);
  assert.ok(!/existingScore[^\n]*Calib\.last/.test(r),'existingScore must not read Calib.last');
});
test('the message footer badge does not append the strength score to the model name',()=>{
  const v=read('view');assert.ok(!/·\s*\$\{[^}]*(Calib|cs)\w*[^}]*\}/.test(v.slice(v.indexOf('metricName')-200,v.indexOf('metricName')+3000)));
});
test('强度分与对照表已并入推理分：dock 不再单独计算 Claude 强度分',()=>{
  assert.doesNotMatch(read('dock'),/calTable/);
});
