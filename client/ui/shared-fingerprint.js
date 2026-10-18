// References are client-wide; PersonalFP's legacy refs are read-only migration backups.
// Tests, login state and conversations remain in their original account partitions.
const SharedFP = {
  state:null,migrations:new Map(),
  guard(owner){if(owner!==PersonalFP.owner())throw Error('账号已变化，取消本次共享库操作');},
  async transport(op,revision,payload){
    if(typeof Host!=='undefined'&&Host.platform!=='web'){
      if(typeof Host.fingerprintStore!=='function')throw Error('客户端缺少共享库桥接，请更新客户端；原个人库保留');
      const r=await Host.fingerprintStore(op,revision,payload);if(!r||r.error)throw Error(r?.error||'共享库没有返回结果');return r;
    }
    // Browser-only fallback: a single IDB transaction compares revision and writes the whole state.
    const db=await PersonalFP.db();return new Promise((resolve,reject)=>{
      const t=db.transaction('meta','readwrite'),store=t.objectStore('meta'),key='client-fingerprint-store-v1',q=store.get(key);let result,err;
      q.onsuccess=()=>{try{
        let s=q.result?.value;if(!s){s={schema:SharedFingerprintSchema.schema,revision:0,salt:[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join(''),rows:[],receipts:{},aliases:{}};store.put({key,owner:'client-shared',value:s});}
        SharedFingerprintSchema.state(s);
        if(op==='read')result={ok:true,state:s};else if(op==='meta')result={ok:true,revision:s.revision,count:s.rows.length};
        else if(op==='cas'){
          if(revision!==s.revision)result={ok:false,conflict:true,revision:s.revision};
          else{const data=SharedFingerprintSchema.body(JSON.parse(payload));s={schema:s.schema,salt:s.salt,revision:s.revision+1,...data};SharedFingerprintSchema.state(s);store.put({key,owner:'client-shared',value:s});result={ok:true,revision:s.revision,count:s.rows.length};}
        }else throw Error('共享库操作无效');
      }catch(e){err=e;t.abort();}};
      t.oncomplete=()=>resolve(result);t.onerror=t.onabort=()=>reject(err||t.error||Error('共享库事务未保存'));
    });
  },
  accept(state){
    SharedFingerprintSchema.state(state);const changed=this.state?.revision!==state.revision;this.state=state;
    if(changed)PersonalFP.invalidate(PersonalFP.owner());return state;
  },
  async read(force=false){
    if(this.state&&!force){const meta=await this.transport('meta');if(meta.ok&&meta.revision===this.state.revision)return this.state;}
    const r=await this.transport('read');if(!r.ok)throw Error('共享库读取未确认');return this.accept(r.state);
  },
  canonical(s,group){const seen=new Set();while(s.aliases[group]){if(seen.has(group))throw Error('样本组别名循环');seen.add(group);group=s.aliases[group];}return group;},
  async mutate(owner,fn){
    for(let attempt=0;attempt<12;attempt++){
      this.guard(owner);const original=await this.read(true);this.guard(owner);
      const draft=JSON.parse(JSON.stringify(original)),result=await fn(draft);this.guard(owner);
      const body={rows:draft.rows,receipts:draft.receipts,aliases:draft.aliases};SharedFingerprintSchema.body(body);
      const text=JSON.stringify(body);if(text===JSON.stringify({rows:original.rows,receipts:original.receipts,aliases:original.aliases}))return result;
      const reply=await this.transport('cas',original.revision,text);
      if(reply.ok){draft.revision=reply.revision;this.accept(draft);return result;}
      if(!reply.conflict)throw Error('共享库保存未确认，原数据保留');
      await new Promise(r=>setTimeout(r,Math.min(250,15*(attempt+1))+Math.random()*25));
    }
    throw Error('其他账号正在更新共享库，请稍后重试；原数据保留');
  },
  async portable(raw){
    const source=raw.source==='local-api'?'local-api':/^import:(?:[a-f0-9]{12}|[a-f0-9]{64})$/.test(raw.source||'')?raw.source:'import:'+await PersonalFP.digest('legacy-import');
    const r=await PersonalFP.normalize(raw,raw.enabled===true,source);r.conflict=raw.conflict===true;if(r.conflict)r.enabled=false;
    if(raw.alternatives)r.alternatives=[...new Set(raw.alternatives.filter(x=>typeof x==='string'&&x.length<=180&&/^[a-zA-Z0-9._:\- /]+$/.test(x)))].slice(0,20);
    return r;
  },
  combine(s,incoming){
    // Exact repeated output connects legacy cohorts conservatively; importing/migrating never creates another vote.
    const byId=new Map(s.rows.map(r=>[r.id,r.group]));
    for(const r of incoming){const prev=byId.get(r.id);if(prev){const from=this.canonical(s,r.group),to=this.canonical(s,prev);if(from!==to)s.aliases[from]=to;}else byId.set(r.id,r.group);}
    // Compress chains before validation, so repeated consolidation stays bounded.
    for(const key of Object.keys(s.aliases)){let x=s.aliases[key];const seen=new Set([key]);while(s.aliases[x]){if(seen.has(x))throw Error('样本组别名循环');seen.add(x);x=s.aliases[x];}s.aliases[key]=x;}
    s.rows=s.rows.map(r=>({...r,group:this.canonical(s,r.group)}));
    const originals=new Map(s.rows.map(r=>[r.id,r]));
    const rows=incoming.map(r=>({...r,group:this.canonical(s,r.group)})),conflicted=new Set(rows.filter(r=>r.conflict).map(r=>r.id));
    for(const r of rows)if(!originals.has(r.id))originals.set(r.id,r);
    // In merge(), local-api duplicates may upgrade a row. Shared controls must win instead.
    const result=PersonalMath.merge(s.rows,rows.map(r=>({...r,source:'import:'+('0'.repeat(12))})));
    for(const r of result.rows){const first=originals.get(r.id);r.source=first.source;if(!first.enabled)r.enabled=false;if(conflicted.has(r.id)){r.conflict=true;r.enabled=false;}}
    s.rows=result.rows;return result;
  },
  async ensure(owner=PersonalFP.owner()){
    this.guard(owner);
    if(!this.migrations.has(owner)){
      const job=(async()=>{
        const state=await this.read(),old=await PersonalFP.all('refs',owner);this.guard(owner);const entries=[];
        for(let i=0;i<old.length;i++){
          const r=await this.portable(old[i]);entries.push({r,receipt:await PersonalFP.digest(state.salt+'|migration|'+owner+'|'+r.id+'|'+r.model+'|'+r.tier+'|'+r.context+'|'+r.group),deleted:await PersonalFP.digest('deleted|'+r.id)});
          if(i%20===0){await PanelWork.frame();this.guard(owner);}
        }
        if(entries.length)await this.mutate(owner,s=>{
          const rows=[];for(const e of entries)if(!s.receipts[e.receipt]){s.receipts[e.receipt]=true;if(!s.receipts[e.deleted])rows.push(e.r);}
          if(rows.length)this.combine(s,rows);
        });
      })().catch(e=>{this.migrations.delete(owner);throw e;});this.migrations.set(owner,job);
    }
    await this.migrations.get(owner);this.guard(owner);return this.read();
  },
  async refs(owner=PersonalFP.owner()){return (await this.ensure(owner)).rows;},
  async merge(incoming,owner=PersonalFP.owner(),{restoreDeleted=false}={}){
    await this.ensure(owner);const entries=[];
    for(const raw of incoming){const r=await this.portable(raw);entries.push({r,deleted:await PersonalFP.digest('deleted|'+r.id)});}
    return this.mutate(owner,s=>{
      const rows=[];let suppressed=0;
      for(const e of entries){if(s.receipts[e.deleted]&&!restoreDeleted){suppressed++;continue;}if(restoreDeleted)delete s.receipts[e.deleted];rows.push(e.r);}
      const result=this.combine(s,rows);result.duplicates+=suppressed;result.suppressed=suppressed;return result;
    });
  },
  async change(ids,{enabled,remove=false}={},owner=PersonalFP.owner()){
    await this.ensure(owner);const set=new Set(ids),deleted=new Map();if(remove)for(const id of set)deleted.set(id,await PersonalFP.digest('deleted|'+id));
    return this.mutate(owner,s=>{if(remove){s.rows=s.rows.filter(r=>!set.has(r.id));for(const key of deleted.values())s.receipts[key]=true;}
      else s.rows=s.rows.map(r=>set.has(r.id)&&!r.conflict?{...r,enabled:!!enabled}:r);});
  },
  async group(sid,owner=PersonalFP.owner()){
    const s=await this.ensure(owner),group=await PersonalFP.digest(s.salt+'|conversation|'+sid),legacy=await PersonalFP.legacyGroup(sid,owner);this.guard(owner);
    if(s.rows.some(r=>r.group===legacy)&&legacy!==group&&!s.aliases[legacy])await this.mutate(owner,state=>{
      const from=this.canonical(state,legacy),to=this.canonical(state,group);if(from===to)return;state.aliases[from]=to;
      state.rows=state.rows.map(r=>({...r,group:this.canonical(state,r.group)}));this.combine(state,[]);
    });
    return this.canonical(await this.read(),group);
  },
};
