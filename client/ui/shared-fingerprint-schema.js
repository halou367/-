// Data-only host format. No account identifiers, messages, credentials or arbitrary settings.
const SharedFingerprintSchema = (() => {
  const schema='arena-client-fingerprint-store-v1',limit=32*1024*1024,hex=/^[a-f0-9]{64}$/,tiers=['none','minimal','low','medium','high','xhigh','max'];
  const keys=(o,allowed)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))throw Error('共享库字段无效');};
  const label=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,159}$/.test(s)&&/[0-9]/.test(s)&&!/unknown|auto|compatible/i.test(s);
  function body(data){
    keys(data,['rows','receipts','aliases']);
    if(!Array.isArray(data.rows)||data.rows.length>2000)throw Error('共享库最多 2000 批样本');
    const ids=new Set(),models=new Set();
    for(const r of data.rows){
      keys(r,['protocol','model','group','context','tier','outputs','measures','at','id','enabled','source','conflict','alternatives']);
      if(r.protocol!=='modeltrace-plain-v1'||!label(r.model)||!hex.test(r.group)||!hex.test(r.id)||ids.has(r.id))throw Error('共享样本标识无效或重复');ids.add(r.id);models.add(r.model);
      if(!['history','fresh'].includes(r.context)||(r.tier!==null&&!tiers.includes(r.tier))||typeof r.enabled!=='boolean'||typeof r.conflict!=='boolean'||r.conflict&&r.enabled||!Number.isFinite(r.at)||r.at<0)throw Error('共享样本状态无效');
      if(r.source!=='local-api'&&!/^import:(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(r.source))throw Error('共享样本来源无效');
      if(!Array.isArray(r.outputs)||r.outputs.length!==3)throw Error('共享样本缺探针');
      [297,315,331].forEach((n,i)=>{const a=r.outputs[i];if(!Array.isArray(a)||a.length<Math.ceil(n*.95)||a.length>Math.floor(n*1.05)||a.some(x=>!Number.isInteger(x)||x<1||x>355))throw Error('共享样本数字无效');});
      if(!Array.isArray(r.measures)||r.measures.length!==3)throw Error('共享样本分数无效');for(const m of r.measures){keys(m,['score','source']);if(m.score!==null&&(!Number.isFinite(m.score)||m.score<=0||m.score>=1e7)||!['measured','estimated','unavailable'].includes(m.source))throw Error('共享样本分数无效');}
      if(r.alternatives!==undefined&&(!Array.isArray(r.alternatives)||r.alternatives.length>20||r.alternatives.some(x=>typeof x!=='string'||x.length>180||!/^[a-zA-Z0-9._:\- /]+$/.test(x))))throw Error('共享冲突标签无效');
    }
    if(models.size>500)throw Error('共享库最多 500 个型号');
    for(const [name,max] of [['receipts',200000],['aliases',10000]]){
      const map=data[name];if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>max)throw Error('共享库迁移索引超限');
      for(const [k,v] of Object.entries(map))if(!hex.test(k)||(name==='receipts'?v!==true:!hex.test(v)))throw Error('共享库迁移索引无效');
    }
    for(const k of Object.keys(data.aliases)){let x=k;const seen=new Set();while(data.aliases[x]){if(seen.has(x)||seen.size>=20)throw Error('共享样本组别名循环');seen.add(x);x=data.aliases[x];}}
    if(JSON.stringify(data).length>limit)throw Error('共享库超过 32 MB');return data;
  }
  function state(s){keys(s,['schema','revision','salt','rows','receipts','aliases']);if(s.schema!==schema||!Number.isSafeInteger(s.revision)||s.revision<0||!hex.test(s.salt))throw Error('共享库版本无效');body({rows:s.rows,receipts:s.receipts,aliases:s.aliases});return s;}
  return {schema,limit,body,state};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=SharedFingerprintSchema;
