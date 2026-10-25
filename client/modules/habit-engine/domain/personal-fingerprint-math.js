// Personal reference fitting in ModelTrace's fixed feature space (MIT upstream attribution in licenses).
// Default references remain immutable. Personal cohorts do not inherit the default bank's calibration claim.
function PersonalFingerprintMath() {
  const protocol='modeltrace-plain-v1', counts=[297,315,331], tiers=['none','minimal','low','medium','high','xhigh','max'];
  const idOf=s=>String(s||'').toLowerCase().replace(/@.*$/,'').replace(/-(?:none|minimal|low|medium|high|xhigh|max)(?:-vertex)?$/,'').replace(/(\d)\.(\d)/g,'$1-$2');
  const norm=a=>{const n=Math.max(1e-12,Math.hypot(...a));return a.map(x=>x/n);};
  const mean=rows=>rows[0].map((_,i)=>rows.reduce((s,r)=>s+r[i],0)/rows.length);
  const project=(v,a,remove=true)=>{let x=v.map((n,i)=>(n-a.feature_mean[i])/a.feature_scale[i]);if(remove)for(const b of a.nuisance_basis){const w=x.reduce((s,n,i)=>s+n*b[i],0);x=x.map((n,i)=>n-w*b[i]);}return norm(x);};
  const features=(numbers,bank)=>{
    const bins=Array(355).fill(.5);for(const n of numbers)bins[n-1]++;
    const total=numbers.length+177.5,h=bins.map(n=>Math.sqrt(n/total));
    const ordered=[];let at=0;
    for(let i=0;i<4;i++){const len=Math.floor(numbers.length/4)+(i<numbers.length%4?1:0),b=Array(16).fill(.5);for(const n of numbers.slice(at,at+len))b[Math.min(15,Math.floor((n-1)/355*16))]++;ordered.push(...b.map(n=>Math.sqrt(n/(len+8))));at+=len;}
    const digits=Array(10).fill(.5);for(const n of numbers)digits[n%10]++;ordered.push(...digits.map(n=>Math.sqrt(n/(numbers.length+5))));
    return {h:project(h,bank.robust.hellinger),o:project(ordered,bank.robust.ordered_blocks),env:project(ordered,bank.robust.ordered_blocks,false),counts:bins.map(n=>n-.5)};
  };
  function validate(row) {
    if(!row||row.protocol!==protocol||!Array.isArray(row.outputs)||row.outputs.length!==3)throw Error('需要协议一致的三条完整探针');
    if(typeof row.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,159}$/.test(row.model)||!/[0-9]/.test(row.model)||/unknown|auto|compatible/i.test(row.model))throw Error('型号标签无效或不具体');
    if(!/^[a-f0-9]{64}$/.test(row.group||''))throw Error('匿名样本组无效');
    if(row.context!=='history'&&row.context!=='fresh')throw Error('上下文分组缺失');
    if(row.tier!==null&&!tiers.includes(row.tier))throw Error('档位标签无效');
    for(let i=0;i<3;i++)if(!Array.isArray(row.outputs[i])||(row.outputs[i].length<Math.ceil(counts[i]*.95)||row.outputs[i].length>Math.floor(counts[i]*1.05))||row.outputs[i].some(n=>!Number.isInteger(n)||n<1||n>355))throw Error('数字范围或数量不完整');
    const measures=(row.measures||[]).map(m=>({score:Number.isFinite(m?.score)&&m.score>0&&m.score<=100?m.score:null,source:['measured','estimated'].includes(m?.source)?m.source:'unavailable'}));
    if(measures.length!==3)throw Error('推理分记录不完整');
    return {protocol,model:idOf(row.model),group:row.group,context:row.context,tier:row.tier,outputs:row.outputs.map(a=>a.slice()),measures,at:Number.isFinite(row.at)?row.at:0};
  }
  function merge(existing,incoming) {
    const map=new Map(existing.map(r=>[r.id,{...r}]));let added=0,duplicates=0,conflicts=0;
    for(const r of incoming){const old=map.get(r.id);if(!old){map.set(r.id,{...r});added++;continue;}
      if(old.model===r.model&&old.tier===r.tier&&old.context===r.context){if(r.source==='local-api'&&r.enabled&&!old.conflict)map.set(r.id,{...r});duplicates++;continue;}
      map.set(r.id,{...old,enabled:false,conflict:true,alternatives:[...new Set([...(old.alternatives||[]),r.model+(r.tier?' / '+r.tier:'')])].slice(0,20)});conflicts++;
    }
    // Contradictory labels from the same anonymous conversation cannot provide independent votes.
    const groups=new Map();for(const r of map.values()){const key=r.group;const labels=groups.get(key)||new Set();labels.add(r.model);groups.set(key,labels);}
    for(const r of map.values())if(groups.get(r.group).size>1){if(!r.conflict)conflicts++;r.conflict=true;r.enabled=false;}
    const rows=[...map.values()];if(rows.length>2000||new Set(rows.map(r=>r.model)).size>500)throw Error('本机容量上限：2000 批完整样本、500 个自定义型号；请分库导出保存');
    return {rows,added,duplicates,conflicts};
  }
  function augment(base,refs,{excludeGroup='',context='history',crossContext=false}={}) {
    const active=refs.filter(r=>r.enabled&&!r.conflict&&r.group!==excludeGroup),matched=new Set(active.filter(r=>r.context===context).map(r=>r.model)),seed=new Set(base.models.map(m=>idOf(m.id)));
    const eligible=active.filter(r=>r.context===context||(crossContext&&!matched.has(r.model)&&!seed.has(r.model)));
    if(!eligible.length)return {bank:base,personal:false,counts:{}};
    const bank=JSON.parse(JSON.stringify(base)),by=new Map(),sizes={};
    for(const r of eligible){let g=by.get(r.model);if(!g)by.set(r.model,g=new Map());let list=g.get(r.group);if(!list)g.set(r.group,list=[]);list.push(...r.outputs.map(n=>features(n,base)));}
    const blend=(a,b,w)=>norm(a.map((n,i)=>n*(1-w)+b[i]*w));
    for(const [model,groups] of by){
      const cohort=[...groups.values()].map(list=>({h:norm(mean(list.map(x=>x.h))),o:norm(mean(list.map(x=>x.o))),env:norm(mean(list.map(x=>x.env))),counts:mean(list.map(x=>x.counts))}));
      const f={h:norm(mean(cohort.map(x=>x.h))),o:norm(mean(cohort.map(x=>x.o))),env:norm(mean(cohort.map(x=>x.env))),counts:mean(cohort.map(x=>x.counts))};sizes[model]=groups.size;
      const indices=bank.models.map((m,i)=>idOf(m.id)===model?i:-1).filter(i=>i>=0);
      if(indices.length){for(const i of indices){const order=bank.robust.model_order.indexOf(bank.models[i].id),w=Math.min(.5,groups.size/(Math.max(3,(bank.models[i].response_count||36)/3)+groups.size));bank.robust.hellinger.centroids[order]=blend(bank.robust.hellinger.centroids[order],f.h,w);bank.robust.ordered_blocks.centroids[order]=blend(bank.robust.ordered_blocks.centroids[order],f.o,w);for(const env of bank.robust.ordered_blocks.environment_centroids)env[order]=blend(env[order],f.env,w);}}
      else {
        if(bank.models.length>=500)throw Error('合并型号超过安全上限 500');
        const family=/^(gpt|chatgpt|o[0-9])/.test(model)?'gpt':/^(claude|gemini|deepseek|qwen|mistral|grok|kimi|glm|llama|mimo|minimax|doubao)/.exec(model)?.[1]||'custom';
        bank.models.push({id:model,display_name:model,family,family_name:family,counts:f.counts.map(n=>n*groups.size*3),response_count:groups.size*3,personal_only:true,reference_groups:groups.size,context_mismatch:eligible.some(r=>r.model===model&&r.context!==context)});bank.robust.model_order.push(model);
        bank.robust.hellinger.centroids.push(f.h);bank.robust.ordered_blocks.centroids.push(f.o);for(const env of bank.robust.ordered_blocks.environment_centroids)env.push(f.env);
      }
    }
    // Candidate set changed: do not advertise the upstream held-out CV statistics as our own.
    bank.calibration=Object.fromEntries(['1','2','3'].map(k=>[k,{beta:1.5,fallback:true,personal_uncalibrated:true}]));
    bank.source_scope='Default reference + explicitly enabled personal cohorts; relative weights, not calibrated accuracy.';
    return {bank,personal:true,counts:sizes};
  }
  function tierConfidence(score,calibration) {
    if(!calibration?.tier||!Number.isFinite(score)||score<=0)return null;
    const refs=(calibration.refs||[]).filter(r=>r.n>=3&&r.score>0);if(refs.length<2)return null;
    const weights=refs.map(r=>({tier:r.tier,w:Math.exp(-.5*(Math.log(score/r.score)/.15)**2)})),sum=weights.reduce((s,r)=>s+r.w,0);
    return sum>0?weights.find(r=>r.tier===calibration.tier)?.w/sum:null;
  }
  return {protocol,counts,tiers,idOf,validate,merge,augment,features,tierConfidence};
}
const PersonalMath=PersonalFingerprintMath();
