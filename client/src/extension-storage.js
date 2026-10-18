'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{isDeepStrictEqual:equal}=require('node:util');
const copy=x=>JSON.parse(JSON.stringify(x));
const put=(o,k,v)=>Object.defineProperty(o,k,{value:v,enumerable:true,writable:true,configurable:true});
function delta(before,after){const out={};for(const k of new Set([...Object.keys(before),...Object.keys(after)])){if(!Object.hasOwn(after,k))put(out,k,{});else if(!Object.hasOwn(before,k)||!equal(before[k],after[k]))put(out,k,{newValue:after[k]});}return out;}
function merge(data,changes){const out=copy(data);for(const [k,v] of Object.entries(changes)){if(Object.hasOwn(v,'newValue'))put(out,k,copy(v.newValue));else delete out[k];}return out;}
function object(value){if(!value||typeof value!=='object'||Array.isArray(value)||Buffer.byteLength(JSON.stringify(value))>64*1024*1024)throw Error('扩展存储数据无效或过大');return value;}
function createSharedStorage({root,open}){
 const groups=new Map();let queue=Promise.resolve(),closing=false;
 const serial=fn=>{const job=queue.catch(()=>{}).then(fn);queue=job;return job;};
 const key=id=>{if(!/^[a-p]{32}$/.test(id))throw Error('扩展 ID 无效');return id;};
 const account=id=>{if(!/^[\w-]{1,80}$/.test(id))throw Error('账号 ID 无效');return id;};
 async function atomic(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600});await fs.rename(tmp,file);}
 async function group(id){
  if(groups.has(id))return groups.get(id);
  const file=path.join(root,key(id),'local.json');let state;
  try{state=JSON.parse(await fs.readFile(file,'utf8'));if(state.version!==1||typeof state.initialized!=='boolean')throw Error('格式无效');object(state.data);object(state.replicas);}
  catch(e){if(e.code!=='ENOENT')throw Error('共享扩展存储无法读取，原文件已保留');state={version:1,initialized:false,data:{},replicas:{},source:''};}
  const g={id,file,state,peers:new Map(),error:''};groups.set(id,g);return g;
 }
 async function save(g){await atomic(g.file,g.state);}
 async function synchronize(g){
  for(const [id,p] of g.peers){try{await p.replace(copy(g.state.data));put(g.state.replicas,id,copy(g.state.data));p.error='';}catch(e){p.error='本地存储同步失败，请重新加载扩展';try{put(g.state.replicas,id,object(await p.read()));}catch{}}}
  await save(g);g.error='';
 }
 async function changed(g,id,changes){
  object(changes);for(const v of Object.values(changes))object(v);
  g.state.data=merge(g.state.data,changes);g.state.initialized=true;
  put(g.state.replicas,id,merge(g.state.replicas[id]||{},changes));
  await save(g);await synchronize(g);g.error='';
 }
 async function attach(id,ses,ext){
  account(id);key(ext.id);if(closing)throw Error('扩展存储正在关闭');
  return serial(async()=>{
   const g=await group(ext.id);if(g.peers.has(id)){await synchronize(g);return;}
   const p=await open({session:ses,extensionId:ext.id,onChange:changes=>{
    if(closing)return;
    void serial(()=>changed(g,id,changes)).catch(()=>{g.error='共享存储写入失败，原生数据已保留；请重启或重新加载扩展';});
   }});
   try{
    const snapshot=object(await p.read());
    if(Object.hasOwn(g.state.replicas,id)){
     // Recover native writes that survived a crash before the shared snapshot was committed.
     const changes=delta(g.state.replicas[id],snapshot);if(Object.keys(changes).length){g.state.data=merge(g.state.data,changes);g.state.initialized=true;}
    }else if(Object.keys(snapshot).length){
     // Preserve each legacy account verbatim before choosing the first nonempty canonical store.
     const backup=path.join(root,ext.id,'migration-backups',id+'.json');
     await fs.mkdir(path.dirname(backup),{recursive:true});try{await fs.writeFile(backup,JSON.stringify(snapshot),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
     if(!g.state.initialized){g.state.data=copy(snapshot);g.state.initialized=true;g.state.source=id;}
    }
    put(g.state.replicas,id,copy(snapshot));g.peers.set(id,p);await save(g);await synchronize(g);
    if(p.error)throw Error(p.error);
   }catch(e){g.peers.delete(id);p.close();throw e;}
  });
 }
 async function detach(id,extId){return serial(async()=>{const g=groups.get(extId),p=g?.peers.get(id);if(!p)return;const snapshot=await p.read();const changes=delta(g.state.replicas[id]||{},snapshot);if(Object.keys(changes).length)await changed(g,id,changes);g.peers.delete(id);p.close();});}
 const status=(id,extId)=>{const g=groups.get(extId),p=g?.peers.get(id),error=g?.error||p?.error||[...(g?.peers.values()||[])].find(x=>x.error)?.error||'';return {shared:!!p&&!error,error};};
 async function close(){
  closing=true;await queue.catch(()=>{});let failure;
  for(const g of groups.values()){
   try{
    for(const [id,p] of g.peers){
     try{const snapshot=object(await p.read()),changes=delta(g.state.replicas[id]||{},snapshot);if(Object.keys(changes).length){g.state.data=merge(g.state.data,changes);g.state.initialized=true;}put(g.state.replicas,id,snapshot);}
     catch(e){failure=e;}
    }
    await save(g);await synchronize(g);
   }catch(e){failure=e;}
   finally{for(const p of g.peers.values())p.close();g.peers.clear();}
  }
  if(failure)throw failure;
 }
 return {attach,detach,status,close};
}
module.exports={createSharedStorage,delta,merge};
