'use strict';
// One real, account-owned BrowserWindow per new extension tab in this test build.
// Do not emulate a new tab by silently navigating an existing account window.
function validTarget(value){
 const u=new URL(value);
 if(u.username||u.password)throw Error('页面地址不能包含凭据');
 if(u.protocol==='https:'||u.href==='about:blank'||u.protocol==='chrome-extension:'&&/^[a-p]{32}$/.test(u.hostname))return u.href;
 throw Error('扩展标签只允许 HTTPS 或已安装扩展页面');
}
function createExtensionTabs({BrowserWindow,ownerFor,accountFor,attachOwner,detachOwner,applyProxy,privacyInit,loadURL,registerTab,windowOptions,decorate,reportError}){
 const entries=new Map();
 const live=id=>[...entries.values()].filter(e=>e.id===id&&!e.initializing&&!e.window.isDestroyed()&&!e.wc.isDestroyed());
 async function idle(ses){const deadline=Date.now()+8000;while(ses.__routeApplying){const pending=ses.__routeTask;if(!pending)throw Error('账号线路正在切换');let timer;try{await Promise.race([pending.catch(()=>{}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('等待账号线路超时')),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}if(Date.now()>=deadline&&ses.__routeApplying)throw Error('等待账号线路超时');}await Promise.resolve();}
 function release(wc){try{wc.__privacyReset?.();if(!wc.isDestroyed()&&wc.debugger?.isAttached())wc.debugger.detach();}catch{}}
 async function create(id,properties){
  if([...entries.values()].filter(e=>e.id===id&&!e.window.isDestroyed()).length>=16||[...entries.values()].filter(e=>!e.window.isDestroyed()).length>=64)throw Error('扩展页面数量已达测试版上限，请先关闭不需要的窗口');
  const ownerWindow=ownerFor(id),account=accountFor(id);
  if(!ownerWindow||ownerWindow.isDestroyed()||!account)throw Error('请先打开此账号的主窗口');
  const owner=ownerWindow.webContents;
  await idle(owner.session);await applyProxy(accountFor(id));
  if(owner.isDestroyed()||ownerFor(id)!==ownerWindow)throw Error('账号窗口已关闭或更换');
  if([...entries.values()].filter(e=>e.id===id&&!e.window.isDestroyed()).length>=16||[...entries.values()].filter(e=>!e.window.isDestroyed()).length>=64)throw Error('扩展页面数量已达测试版上限');
  const url=validTarget(properties.url||'about:blank');
  const options=windowOptions(account);
  const window=new BrowserWindow({...options,parent:ownerWindow,show:false,webPreferences:{...options.webPreferences,session:owner.session,contextIsolation:true,sandbox:true,nodeIntegration:false}});
  const wc=window.webContents,wcId=wc.id,entry={id,window,wc,owner,target:url,extensionId:properties.extensionId,initializing:true};
  entries.set(wc.id,entry);attachOwner(wc,owner);
  const close=()=>{if(!window.isDestroyed())window.close();};
  const failed=error=>reportError?.(id,entry.extensionId,error);
  wc.__extensionTab=true;
  wc.__retryTarget={get:()=>entry.target,remember:value=>{try{if(value!=='about:blank')entry.target=validTarget(value);}catch{}}};
  wc.__privacyFault=reason=>{failed(Error('扩展页面隐私保护中断：'+reason));close();};
  wc.__navigate=(value,options={})=>{
   if(window.__navigateP)return window.__navigateP;
   const target=validTarget(value);entry.target=target;
   window.__navigateP=(async()=>{
    try{
     await idle(wc.session);const current=accountFor(id);if(!current||owner.isDestroyed())throw Error('账号已关闭');
     await applyProxy(current);await idle(wc.session);if(wc.isDestroyed())throw Error('扩展页面已关闭');
     if(!wc.__uam||wc.__privacyFailed)await privacyInit(wc);
     if(wc.__privacyRefresh)await wc.__privacyRefresh(accountFor(id));
     if(wc.session.__routeBlocked||wc.__privacyFailed)throw Error('账号线路或隐私保护尚未就绪');
     await loadURL(wc,target,45000,options);wc.__privacyNeedsReload=false;return true;
    }catch(error){if(wc.isDestroyed()||['ERR_ABORTED','ERR_RENDER_PROCESS_GONE','ERR_WEB_CONTENTS_DESTROYED'].includes(error.code))return false;failed(error);throw error;}
   })().finally(()=>{window.__navigateP=null;});
   return window.__navigateP;
  };
  wc.on('did-start-navigation',(_event,value,inPlace,isMain)=>{if(isMain&&!inPlace&&value!=='about:blank'){try{entry.target=validTarget(value);}catch{}}});
  const guard=(event,url)=>{try{validTarget(url);}catch(error){event.preventDefault();failed(error);}};
  wc.on('will-navigate',guard);wc.on('will-redirect',guard);
  wc.setWindowOpenHandler(({url})=>{try{if(url.startsWith('https://'))void wc.__navigate(url).catch(failed);}catch{}return {action:'deny'};});
  wc.on('render-process-gone',()=>{wc.session.__routeBlocked=true;failed(Error('扩展页面渲染进程退出，网络已阻断'));close();});
  owner.once('destroyed',close);
  window.on('close',()=>release(wc));
  window.on('closed',()=>{entries.delete(wcId);detachOwner(wc);owner.removeListener('destroyed',close);});
  decorate?.(window,wc,account);
  try{
   await loadURL(wc,'about:blank');if(owner.isDestroyed()||wc.isDestroyed())throw Error('账号已关闭');await privacyInit(wc);
   let stable=false;for(let i=0;i<3;i++){await idle(wc.session);if(owner.isDestroyed()||wc.isDestroyed()||!accountFor(id))throw Error('账号已关闭');const epoch=wc.session.__routeEpoch;if(wc.__privacyRefresh)await wc.__privacyRefresh(accountFor(id));if(!wc.session.__routeApplying&&!wc.session.__routeBlocked&&epoch===wc.session.__routeEpoch){stable=true;break;}}
   if(!stable)throw Error('账号线路仍在切换，请稍后重试');
   entry.initializing=false;registerTab(id,wc,window);
   // Chrome tabs.create acknowledges creation, not completion of remote page loading.
   // The owned navigation reports failures separately and keeps the real window available.
   void wc.__navigate(url).catch(()=>{});
   if(properties.active!==false){window.show();window.focus();}else window.showInactive?.();
   return {webContents:wc,window};
  }catch(error){release(wc);if(!window.isDestroyed())window.destroy();throw error;}
 }
 function ready(id){return live(id).every(e=>e.wc.__uam&&!e.wc.__privacyFailed&&e.wc.debugger?.isAttached());}
 async function refresh(account,{check=()=>{}}={}){
  const reload=[];
  for(const e of live(account.id)){
   const wc=e.wc,target=wc.getURL()!=='about:blank'?wc.getURL():e.target;
   try{
    if(!wc.__uam||wc.__privacyFailed){release(wc);await loadURL(wc,'about:blank');check();await privacyInit(wc);check();wc.__privacyNeedsReload=true;}
    const changed=wc.__privacyRefresh?await wc.__privacyRefresh(account):false;check();
    if(wc.__privacyFailed||!wc.__uam||!wc.debugger.isAttached())throw Error('扩展标签页隐私保护未就绪');
    wc.__privacyNeedsReload=wc.__privacyNeedsReload||changed;
    if(wc.__privacyNeedsReload)reload.push({entry:e,url:target});
   }catch(error){if(!wc.isDestroyed()){reportError?.(account.id,e.extensionId,error);throw error;}}
  }
  // Called only after the main account transaction releases its network fence.
  return ()=>{
   for(const {entry:e,url} of reload)setTimeout(()=>{
    try{check();if(!e.wc.isDestroyed()&&!e.window.isDestroyed()&&!e.wc.session.__routeBlocked&&!e.window.__navigateP)void Promise.resolve(loadURL(e.wc,url)).then(()=>{check();if(!e.wc.isDestroyed())e.wc.__privacyNeedsReload=false;}).catch(error=>{try{check();reportError?.(e.id,e.extensionId,error);}catch{}});}catch{}
   },60);
  };
 }
 return {create,ready,refresh,owns:wc=>entries.has(wc?.id),list:id=>live(id).map(e=>e.wc)};
}
module.exports={createExtensionTabs,validTarget};
