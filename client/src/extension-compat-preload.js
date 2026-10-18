'use strict';
// The session registers this for extension frames and MV3 workers only.
// No Node or raw IPC object is exposed to extension JavaScript.
const {contextBridge, ipcRenderer} = require('electron');
const RPC='brana:extension-compat:call', EVENT='brana:extension-compat:event', ACK='brana:extension-compat:ack';
try {
  const allowed=contextBridge.executeInMainWorld({func:()=>{
    try{return location.protocol==='chrome-extension:'&&/^[a-p]{32}$/.test(chrome.runtime.id);}catch{return false;}
  }});
  if(allowed) contextBridge.executeInMainWorld({
    func:(invoke,subscribe)=>{
      const api=globalThis.chrome, events=new Map();
      const rawError=Object.getOwnPropertyDescriptor(api.runtime,'lastError');
      function failCallback(callback,error){
        let installed=false;
        try{Object.defineProperty(api.runtime,'lastError',{configurable:true,value:{message:error.message}});installed=true;}catch{console.warn('BRANA_EXTENSION_CALLBACK_FAILED');}
        try{callback();}finally{if(installed){if(rawError)Object.defineProperty(api.runtime,'lastError',rawError);else delete api.runtime.lastError;}}
      }
      async function call(name,args){
        const result=await invoke(name,args);
        if(!result||result.ok!==true)throw Error(result?.error||'Extension compatibility request failed');
        return result.value;
      }
      const method=name=>function(...args){
        const callback=typeof args.at(-1)==='function'?args.pop():null;
        const promise=call(name,args);
        if(!callback)return promise;
        promise.then(value=>callback(value),error=>failCallback(callback,error));
      };
      function event(name,nativeEvent,retainNative=false){
        const listeners=new Set();
        const add=nativeEvent?.addListener?.bind(nativeEvent),remove=nativeEvent?.removeListener?.bind(nativeEvent);
        const value={
          addListener(listener){
            if(typeof listener!=='function')throw TypeError('Listener must be a function');
            if(listeners.has(listener))return;
            if(retainNative&&add)add(listener);
            listeners.add(listener);
          },
          removeListener(listener){if(retainNative&&remove)remove(listener);listeners.delete(listener);},
          hasListener:listener=>listeners.has(listener),hasListeners:()=>listeners.size>0,
        };
        events.set(name,{listeners,value});return value;
      }
      const define=(object,key,value)=>Object.defineProperty(object,key,{value,writable:true,configurable:true,enumerable:true});
      const manifest=api.runtime.getManifest();
      const actionName=manifest.manifest_version===2?'browserAction':'action';
      if(!api[actionName])define(api,actionName,{});
      const action=api[actionName];
      define(action,'onClicked',event(actionName+'.onClicked',action.onClicked,true));
      for(const name of ['setTitle','getTitle','setPopup','getPopup','setBadgeText','getBadgeText','enable','disable'])define(action,name,method('action.'+name));
      if(!api.tabs)define(api,'tabs',{});
      for(const name of ['create','get','getCurrent','query','update','remove','reload'])define(api.tabs,name,method('tabs.'+name));
      for(const name of ['onCreated','onUpdated','onRemoved','onActivated'])define(api.tabs,name,event('tabs.'+name,null));
      subscribe(async(name,args)=>{
        if(name==='bridge.ping')return {ready:true,clickListeners:events.get(actionName+'.onClicked')?.listeners.size||0};
        const registered=events.get(name);
        if(!registered)return {handled:0};
        const listeners=[...registered.listeners];
        const results=await Promise.allSettled(listeners.map(listener=>Promise.resolve().then(()=>listener(...args))));
        const rejected=results.find(result=>result.status==='rejected');
        if(rejected)throw rejected.reason;
        return {handled:listeners.length};
      });
      return true;
    },
    args:[
      (name,args)=>ipcRenderer.invoke(RPC,name,args),
      callback=>{
        ipcRenderer.on(EVENT,async(_event,message)=>{
          if(!message||typeof message.event!=='string'||!Array.isArray(message.args))return;
          try{
            const value=await callback(message.event,message.args);
            if(message.id)ipcRenderer.send(ACK,{id:message.id,ok:true,value});
          }catch(error){
            if(message.id)ipcRenderer.send(ACK,{id:message.id,ok:false,error:String(error?.message||'Extension listener failed').slice(0,500)});
            else console.error('BRANA_EXTENSION_EVENT_FAILED',error?.name||'Error');
          }
        });
      },
    ],
  });
} catch(error) {
  console.error('BRANA_EXTENSION_COMPAT_PRELOAD_FAILED',error?.name||'Error',String(error?.message||'').slice(0,240));
}
