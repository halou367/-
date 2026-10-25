'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('BranaStorageMirror',{
 changed:changes=>ipcRenderer.send('extension-storage:changed',changes),
 onSync:fn=>ipcRenderer.on('extension-storage:sync',(_e,msg)=>{
  Promise.resolve().then(()=>fn(msg)).then(
   val=>ipcRenderer.send('extension-storage:ack',{id:msg.id,ok:true,val}),
   err=>ipcRenderer.send('extension-storage:ack',{id:msg.id,ok:false,err:String(err?.message||err)})
  );
 }),
});
