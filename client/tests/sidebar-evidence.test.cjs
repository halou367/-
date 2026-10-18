const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../ui');
function fixture(){const c=vm.createContext({Strength:{canon:x=>x}});vm.runInContext(fs.readFileSync(path.join(root,'conversation-labels.js'),'utf8'),c);const src=fs.readFileSync(path.join(root,'view.js'),'utf8');return vm.runInContext('({'+src.slice(src.indexOf('  cardMetrics('),src.indexOf('  cardEl('))+'})',c);}
test('current missing/skipped fingerprint evidence does not fall back to stale title values',()=>{
 const ui=fixture();
 for(const fp of [{skipped:'visible-thinking',thinkSec:30},{reasoning:{score:null}},{apiIdentity:{model:'new'},result:{nearest:{id:'old'},signals:{relative_probability:.99}},reasoning:{score:null}}]){
  const m=ui.cardMetrics('new(99%)-88分',{name:'new',fingerprint:fp});assert.equal(m.conf,null);assert.doesNotMatch(m.tip,/88|99|30s|未思考/);
 }
});
test('sidebar does not label unmeasured reasoning as no thinking, and retains zero',()=>{
 const ui=fixture(),fp={reasoning:{score:null},result:{signals:{relative_probability:.8}}};
 assert.match(ui.cardMetrics('x',{name:'x',fingerprint:fp}).tip,/未测/);
 fp.reasoning.score=0;assert.match(ui.cardMetrics('x',{name:'x',fingerprint:fp}).tip,/推理分 0/);
});
