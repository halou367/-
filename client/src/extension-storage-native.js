'use strict';
const path=require('node:path');
async function bounded(job){let timer;try{return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('扩展存储响应超时')),5000);})]);}finally{clearTimeout(timer);}}
// A detached view has native extension APIs but never adds a user-visible window.
// The extension itself continues using Chromium's storage API and change notifications.
function createNativeStorage({WebContentsView,ipcMain}){
 const owners=new Map();
 ipcMain.on('extension-storage:changed',(event,changes)=>{
  const p=owners.get(event.sender.id);if(!p||event.senderFrame!==event.sender.mainFrame||event.sender.getURL()!==p.url)return;
  p.onChange(changes);
 });
 return async({session,extensionId,onChange})=>{
  const view=new WebContentsView({webPreferences:{session,preload:path.join(__dirname,'extension-storage-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}),wc=view.webContents;
  const url='chrome-extension://'+extensionId+'/manifest.json';
  wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',e=>e.preventDefault());
  // Keep the detached View alive: retaining webContents alone does not prevent View GC.
  owners.set(wc.id,{view,url,onChange});
  const close=()=>{owners.delete(wc.id);if(!wc.isDestroyed())wc.close();};
  try{
   await bounded(wc.loadURL(url));
   await bounded(wc.executeJavaScript(`(()=>{
    const local=chrome.storage.local,expected=new Map(),emit=BranaStorageMirror.changed;
    const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
    const same=(a,b)=>stable(a)===stable(b);
    chrome.storage.onChanged.addListener((changes,area)=>{
     if(area!=='local')return;const out={};
     for(const [k,v] of Object.entries(changes)){
      const pending=expected.get(k),at=pending?.findIndex(x=>x.present===Object.hasOwn(v,'newValue')&&same(x.value,v.newValue));
      if(at>=0){pending.splice(at,1);if(!pending.length)expected.delete(k);}else Object.defineProperty(out,k,{value:v,enumerable:true});
     }
     if(Object.keys(out).length)emit(out);
    });
    globalThis.__branaStorage={read:()=>local.get(null),replace:async data=>{
     const current=await local.get(null),remove=[],set={};
     const expect=(k,present,value)=>{const row={present,value};if(!expected.has(k))expected.set(k,[]);expected.get(k).push(row);return row;};
     const pending=[];
     for(const k of new Set([...Object.keys(current),...Object.keys(data)])){
      if(!Object.hasOwn(data,k)){remove.push(k);pending.push([k,expect(k,false)]);}
      else if(!Object.hasOwn(current,k)||!same(current[k],data[k])){Object.defineProperty(set,k,{value:data[k],enumerable:true});pending.push([k,expect(k,true,data[k])]);}
     }
     try{if(Object.keys(set).length)await local.set(set);if(remove.length)await local.remove(remove);}
     finally{setTimeout(()=>{for(const [k,row] of pending){const list=expected.get(k);if(!list)continue;const at=list.indexOf(row);if(at>=0)list.splice(at,1);if(!list.length)expected.delete(k);}},1000);}
    }};
   })()`));
   const run=(method,data)=>{if(wc.isDestroyed())return Promise.reject(Error('扩展存储视图已关闭'));return bounded(wc.executeJavaScript('globalThis.__branaStorage.'+method+'('+(data===undefined?'':JSON.stringify(data))+')'));};
   return {read:()=>run('read'),replace:data=>run('replace',data),close};
  }catch(e){close();throw e;}
 };
}
module.exports={createNativeStorage};
