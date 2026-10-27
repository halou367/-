'use strict';
const path=require('node:path');
async function bounded(job,ms=8000){let timer;try{return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('扩展存储响应超时')),ms);})]);}finally{clearTimeout(timer);}}
// A detached view has native extension APIs but never adds a user-visible window.
// The extension itself continues using Chromium's storage API and change notifications.
function createNativeStorage({WebContentsView,ipcMain}){
 const owners=new Map(),pending=new Map();
 let reqSeq=0;
 ipcMain.on('extension-storage:changed',(event,changes)=>{
  try{
   if(!event?.sender||event.sender.isDestroyed?.())return;
   const p=owners.get(event.sender.id);if(!p||event.senderFrame!==event.sender.mainFrame||event.sender.getURL()!==p.url)return;
   p.onChange(changes);
  }catch{}
 });
 if(typeof ipcMain.on==='function'){
  ipcMain.on('extension-storage:ack',(event,msg)=>{
   try{
    if(!msg||!event?.sender||event.sender.isDestroyed?.())return;
    const req=pending.get(msg.id);if(!req||req.wcId!==event.sender.id)return;
    pending.delete(msg.id);clearTimeout(req.timer);
    msg.ok?req.resolve(msg.val):req.reject(Error(msg.err||'扩展存储同步失败'));
   }catch{}
  });
 }
 return async({session,extensionId,onChange})=>{
  const view=new WebContentsView({webPreferences:{session,preload:(()=>{const p=path.join(__dirname,'extension-storage-preload.js'),u=p.replace(/app\.asar([\\/])/i,'app.asar.unpacked$1');try{if(u!==p&&require('node:fs').existsSync(u))return u;}catch{}return p;})(),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}),wc=view.webContents;
  const wcId=wc.id,url='chrome-extension://'+extensionId+'/manifest.json';
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',e=>e.preventDefault());
  // Keep the detached View alive: retaining webContents alone does not prevent View GC.
  owners.set(wcId,{view,url,onChange});
  const close=()=>{
   owners.delete(wcId);
   for(const [id,req] of pending){if(req.wcId===wcId){pending.delete(id);clearTimeout(req.timer);req.reject(Error('扩展存储视图已关闭'));}}
   try{if(!wc.isDestroyed())wc.close();}catch{}
  };
  try{
   await bounded(wc.loadURL(url));
   await bounded(wc.executeJavaScript(`(()=>{
    const local=chrome.storage.local,expected=new Map(),emit=BranaStorageMirror.changed;
    const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
    const same=(a,b,ja,jb)=>{if(a===b)return true;if(Array.isArray(a)&&Array.isArray(b)&&a.length!==b.length)return false;ja??=JSON.stringify(a);jb??=JSON.stringify(b);if(ja===jb)return true;if(!ja||!jb||ja.length!==jb.length)return false;return stable(a)===stable(b);};
    chrome.storage.onChanged.addListener((changes,area)=>{
     if(area!=='local')return;const out={};
     for(const [k,v] of Object.entries(changes)){
      const hasNew=Object.hasOwn(v,'newValue'),jNew=hasNew?JSON.stringify(v.newValue):'';
      const pending=expected.get(k),at=pending?.findIndex(x=>x.present===hasNew&&(!hasNew||same(x.value,v.newValue,x.j,jNew)));
      if(at>=0){pending.splice(at,1);if(!pending.length)expected.delete(k);}else Object.defineProperty(out,k,{value:v,enumerable:true});
     }
     if(Object.keys(out).length)emit(out);
    });
    globalThis.__branaStorage={read:()=>local.get(null),replace:async data=>{
     const current=await local.get(null),remove=[],set={};
     const expect=(k,present,value)=>{const row={present,value,j:present?JSON.stringify(value):''};if(!expected.has(k))expected.set(k,[]);expected.get(k).push(row);return row;};
     const pending=[];
     for(const k of new Set([...Object.keys(current),...Object.keys(data)])){
      if(!Object.hasOwn(data,k)){remove.push(k);pending.push([k,expect(k,false)]);}
      else if(!Object.hasOwn(current,k)||!same(current[k],data[k])){Object.defineProperty(set,k,{value:data[k],enumerable:true});pending.push([k,expect(k,true,data[k])]);}
     }
     try{if(Object.keys(set).length)await local.set(set);if(remove.length)await local.remove(remove);}
     finally{setTimeout(()=>{for(const [k,row] of pending){const list=expected.get(k);if(!list)continue;const at=list.indexOf(row);if(at>=0)list.splice(at,1);if(!list.length)expected.delete(k);}},1000);}
    }};
    if(typeof BranaStorageMirror?.onSync==='function'){
     BranaStorageMirror.onSync(msg=>msg.op==='read'?globalThis.__branaStorage.read():globalThis.__branaStorage.replace(msg.data));
    }
   })()`));
   const run=(method,data)=>{
    if(wc.isDestroyed())return Promise.reject(Error('扩展存储视图已关闭'));
    if(typeof wc.send==='function'&&typeof ipcMain?.on==='function'){
     return new Promise((resolve,reject)=>{
      const id=++reqSeq,timer=setTimeout(()=>{pending.delete(id);reject(Error('扩展存储响应超时'));},8000);
      pending.set(id,{wcId,resolve,reject,timer});
      try{wc.send('extension-storage:sync',{id,op:method,data});}
      catch(e){pending.delete(id);clearTimeout(timer);reject(e);}
     });
    }
    return bounded(wc.executeJavaScript('globalThis.__branaStorage.'+method+'('+(data===undefined?'':JSON.stringify(data))+')'));
   };
   return {read:()=>run('read'),replace:data=>run('replace',data),close};
  }catch(e){close();throw e;}
 };
}
module.exports={createNativeStorage};
