const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../ui/dock.js'), 'utf8').replace(/\r\n/g, '\n');
const labels = fs.readFileSync(path.join(__dirname, '../ui/conversation-labels.js'), 'utf8');
function fixture(model) {
  const h = (tag, props, ...children) => ({tag, props, children:children.flat().filter(x=>x!=null), append(...xs){this.children.push(...xs.filter(x=>x!=null));}});
  const latest={best:'new-model',calls:[],records:[]}, chat={busy:false}, deep=[];
  const ctx=vm.createContext({h,icon:()=>null,tipI:()=>null,Models:{get:()=>model},Chats:{get:()=>chat},
    Trace:{latest:()=>latest},History:{byId:()=>({title:'new-model-88分'})},AutoId:{busy:new Set()},
    Brand:{short:n=>n,of:()=>null,NAME:{}},Strength:{canon:n=>n,parts:()=>({}),fmtScore:String},
    famTier:n=>[n],Budget:{sid:()=>null,est:()=>null,text:()=>({})},LiveEst:{of:()=>null},
    fmtUsd:n=>'$'+n,fmtClock2:()=>'',Prefs:{},useKeys:()=>[]});
  vm.runInContext(labels,ctx);
  function method(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))).trim();}
  const dock=vm.runInContext('({'+method('  candidateOf(m)', '  /* 导出：')+'\n'+method('  detailCard(sid, t, c)', '  data(box, sid, t, c)')+'})',ctx);
  Object.assign(dock,{unit:()=> 'usd',exportRow:()=>null,traceCard:(sid,m,opt)=>h('div',{class:'fingerprint'},opt.historical?'HISTORICAL FINGERPRINT':'CURRENT FINGERPRINT'),deep:(...a)=>deep.push(a)});
  return {dock,latest,chat,deep};
}
const text=n=>n==null?'':typeof n==='object'?n.children.map(text).join(' '):String(n);
const all=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...n.children.flatMap(c=>all(c,p))];
test('historical Trace details do not borrow current fingerprint, title score or identity',()=>{
  const f=fixture({name:'new-model',fingerprint:{reasoning:{score:88}},request:'new-request'});
  const call={effort:'low',detailed:true},old={best:'old-model',calls:[call],records:[]};
  const d=f.dock.detailCard('sid',old,call),s=text(d);
  assert.match(s,/old-model/);assert.match(s,/本轮无指纹记录/);assert.match(s,/显式档位 low/);
  assert.doesNotMatch(s,/CURRENT FINGERPRINT|new-model|new-request|88/);
  assert.equal(all(d,n=>n.tag==='meter')[0].props.value,0);assert.match(s,/未测/);
});
test('latest Trace retains its available fingerprint and measured score',()=>{
  const f=fixture({name:'new-model',fingerprint:{reasoning:{score:19.5}}});
  const d=f.dock.detailCard('sid',f.latest,null);
  assert.match(text(d),/CURRENT FINGERPRINT/);assert.equal(all(d,n=>n.tag==='meter')[0].props.value,19.5);
});
test('no Trace keeps manual identity discovery, with disabled state while reading',()=>{
  const f=fixture(null),d=f.dock.detailCard('sid',null,null);
  const b=all(d,n=>n.tag==='button' && (text(n).includes('补读型号') || text(n).includes('反推锁定')))[0];assert(b);assert.equal(b.props.disabled,null);
  b.props.onclick();assert.deepEqual(f.deep,[['sid',true]]);
  f.dock.busy=true;const busy=all(f.dock.detailCard('sid',null,null),n=>n.tag==='button')[0];assert.equal(busy.props.disabled,true);assert.match(text(busy),/读取中/);
});
test('no Trace identity source distinguishes saved API records, guesses and skipped probes',()=>{
  const f=fixture(null);
  const record=text(f.dock.heroFp('sid',{name:'api-model',response:'api-model'}));assert.match(record,/型号记录/);assert.doesNotMatch(record,/指纹识别/);
  assert.match(text(f.dock.heroFp('sid',{name:'guess',guess:true})),/按回复格式推测/);
  assert.match(text(f.dock.heroFp('sid',{name:'api-model',fingerprint:{skipped:'visible-thinking'}})),/指纹已跳过/);
  assert.match(text(f.dock.heroFp('sid',{name:'api-model',fingerprint:{apiIdentity:true}})),/API记录/);
});

test('synced fingerprint and score remain explicitly historical',()=>{
  const f=fixture({name:'new-model',fromTitle:true,fingerprint:{reasoning:{score:19.5}}});
  const d=f.dock.detailCard('sid',null,null);
  assert.match(text(d),/HISTORICAL FINGERPRINT/);assert.match(text(d),/历史时长估计/);
});

test('hero badge, collapsed summary and meter agree for measured, zero and missing scores',()=>{
  for(const score of [18.6,0,null]){
    const model={name:'3.8-flash?',fingerprint:{reasoning:{score}}},f=fixture(model);
    const hero=f.dock.heroFp('sid',model),detail=f.dock.detailCard('sid',null,null);
    const badge=all(hero,n=>n.props?.class==='mc-tier mc-reason-score');
    const summary=all(detail,n=>n.props?.class==='eyebrow mc-ident-summary')[0];
    if(score==null){assert.equal(badge.length,0);assert.equal(text(summary),'3.8-flash');assert.match(text(detail),/未测/);}
    else {assert.equal(badge.length,1);assert.equal(text(badge[0]),String(score));assert.equal(text(summary),'3.8-flash-'+score);assert.equal(all(detail,n=>n.tag==='meter')[0].props.value,score);}
  }
});
test('score from a skipped probe or different Trace identity is never attached to the model',()=>{
  const skipped={name:'model',est:{score:90},fingerprint:{skipped:'visible-thinking',reasoning:{score:88}}},f=fixture(skipped);
  assert.equal(f.dock.scoreBadge('sid',skipped),null);
  assert.equal(f.dock.scoreBadge('sid',{name:'new-model',fingerprint:{reasoning:{score:88}}},false,{best:'other-model'}),null);
  assert.equal(f.dock.scoreBadge('sid',null),null);
});

test('unknown identity presents the existing unique fingerprint candidate without changing records',()=>{
  const model={name:'未知型号',guess:true,fingerprint:{conflict:true,reasoning:{score:10.1},result:{status:'weak',nearest:{id:'hy4-preview'},signals:{relative_probability:.993},candidates:[{id:'hy4-preview',probability:.993},{id:'claude-opus-5',probability:.001}]}}};
  const before=JSON.stringify(model),f=fixture(model),hero=f.dock.heroFp('sid',model),detail=f.dock.detailCard('sid',null,null);
  assert.match(text(hero),/hy4-preview\?/);assert.match(text(hero),/候选 · 格式冲突 99.3%/);
  assert.equal(text(all(detail,n=>n.props?.class==='eyebrow mc-ident-summary')[0]),'hy4-preview?-10.1');
  assert.equal(JSON.stringify(model),before);
});
test('candidate fallback does not override known/API identity or select unsafe, missing and tied evidence',()=>{
  const make=()=>({name:'未知型号',guess:true,fingerprint:{result:{status:'weak',nearest:{id:'hy4-preview'},signals:{relative_probability:.993},candidates:[{id:'hy4-preview',probability:.993}]}}}),f=fixture(null);
  let m=make();m.name='claude-opus-5';assert.equal(f.dock.candidateOf(m),null);
  for(const flag of ['skipped','probeError','apiUnsafe','apiIdentity']){m=make();m.fingerprint[flag]=true;assert.equal(f.dock.candidateOf(m),null);}
  m=make();m.guess=false;m.response='api-model';assert.equal(f.dock.candidateOf(m),null);
  m=make();m.fingerprint.result.candidates.push({id:'other',probability:.993});assert.equal(f.dock.candidateOf(m),null);
  for(const p of [0,NaN,1.1,undefined]){m=make();m.fingerprint.result.signals.relative_probability=p;assert.equal(f.dock.candidateOf(m),null);}
});
