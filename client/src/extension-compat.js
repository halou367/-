'use strict';
const path=require('node:path'),crypto=require('node:crypto');
const RPC='brana:extension-compat:call',EVENT='brana:extension-compat:event',ACK='brana:extension-compat:ack';
const extApi=ses=>ses.extensions||ses;
function extensionId(url){try{const u=new URL(url);return u.protocol==='chrome-extension:'&&!u.username&&!u.password&&/^[a-p]{32}$/.test(u.hostname)?u.hostname:'';}catch{return '';}}
function matchURL(pattern,value){
 try{
  const u=new URL(value);if(!['https:','http:','file:'].includes(u.protocol))return false;
  if(pattern==='<all_urls>')return true;
  const m=/^(\*|https?|file):\/\/([^/]*)(\/.*)$/.exec(pattern);if(!m)return false;
  if(m[1]==='*'&&!['https:','http:'].includes(u.protocol)||m[1]!=='*'&&u.protocol!==m[1]+':')return false;
  const host=m[2].toLowerCase();
  if(host!=='*'&&!(host.startsWith('*.')?(u.hostname===host.slice(2)||u.hostname.endsWith('.'+host.slice(2))):u.hostname===host))return false;
  return new RegExp('^'+m[3].split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(u.pathname+u.search);
 }catch{return false;}
}
function canReadURL(manifest,url,id){
 if(extensionId(url)===id)return true;
 try{if(!['https:','http:'].includes(new URL(url).protocol))return false;}catch{return false;}
 const permissions=manifest.permissions||[];
 return permissions.includes('tabs')||[...(manifest.host_permissions||[]),...permissions.filter(x=>typeof x==='string'&&(x.includes('://')||x==='<all_urls>'))].some(p=>matchURL(p,url));
}
function navigationURL(value,id){
 if(typeof value!=='string'||value.length>16000)throw Error('扩展目标地址无效');
 const u=new URL(value,'chrome-extension://'+id+'/');
 if(u.username||u.password)throw Error('扩展地址不能包含凭据');
 if(u.protocol==='https:'||(u.protocol==='chrome-extension:'&&u.hostname===id)||u.href==='about:blank')return u.href;
 throw Error('扩展仅可打开 HTTPS 页面或自己的扩展页面');
}
function cleanError(error){return String(error?.message||error||'扩展操作失败').replace(/(password|token|secret|authorization|cookie|密码|令牌)\s*[:=]\s*[^\s]+/gi,'$1=[redacted]').replace(/github_pat_[\w]+|gh[pousr]_[\w]+/g,'[redacted]').replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g,'$1?[redacted]').slice(0,350);}
function createExtensionCompat({ipcMain,createTab,navigateTab,preload=path.join(__dirname,'extension-compat-preload.js'),webContents}){
 const accounts=new Map(),bySession=new WeakMap(),pending=new Map();
 function account(id){const a=accounts.get(id);if(!a)throw Error('扩展账号会话尚未准备');return a;}
 function extension(a,id){const e=extApi(a.session).getExtension(id);if(!e?.manifest)throw Error('扩展已停用或清单未就绪');return e;}
 function tab(a,id){const t=a.tabs.get(id);if(!t||t.wc.isDestroyed())throw Error('标签页不存在或不属于此账号');return t;}
 function current(a,ctx){return ctx?.wc&&a.tabs.has(ctx.wc.id)?ctx.wc.id:a.current;}
 function info(a,t,ext){
  const result={id:t.wc.id,windowId:t.windowId,index:0,active:true,highlighted:true,pinned:false,incognito:false,status:t.wc.isLoading?.()?'loading':'complete'};
  const url=t.wc.getURL();if(canReadURL(ext.manifest,url,ext.id)){result.url=url;result.title=t.wc.getTitle?.()||'';}
  return result;
 }
 function state(a,id,tabId){
  const ext=extension(a,id),m=ext.manifest.action||ext.manifest.browser_action||ext.manifest.page_action||{};
  const stored=a.actions.get(id)||new Map();
  return {title:m.default_title||ext.name,popup:m.default_popup||'',badgeText:'',enabled:true,...stored.get('global'),...stored.get(tabId)};
 }
 function setState(a,id,key,patch){let map=a.actions.get(id);if(!map)a.actions.set(id,map=new Map());map.set(key,{...map.get(key),...patch});}
 function contextForFrame(event){
  const wc=event?.sender,frame=event?.senderFrame,a=wc&&bySession.get(wc.session),id=extensionId(frame?.url);
  if(!a||!id||wc.isDestroyed()||frame.isDestroyed?.())throw Error('扩展接口只允许该账号已加载扩展的真实上下文');
  extension(a,id);
  const ctx={a,id,wc,frame,key:'frame:'+wc.id+':'+frame.routingId,send:(channel,value)=>frame.send(channel,value)};
  a.frames.set(ctx.key,ctx);return ctx;
 }
 function contextForWorker(a,worker){
  const id=extensionId(worker.scope);
  if(!id||worker.isDestroyed())throw Error('扩展后台已停止');
  extension(a,id);
  return {a,id,worker,key:'worker:'+worker.versionId,send:(channel,value)=>worker.send(channel,value)};
 }
 function acceptAck(ctx,message){
  const p=message&&pending.get(message.id);
  if(!p||p.account!==ctx.a.id||p.extension!==ctx.id||p.target!==ctx.key)return;
  pending.delete(message.id);clearTimeout(p.timer);
  message.ok===true?p.resolve(message.value):p.reject(Error(cleanError(message.error||'扩展后台处理失败')));
 }
 function ask(ctx,event,args,timeout=7000){
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('扩展后台响应超时，请在扩展管理中查看错误或重新加载'));},timeout);
   pending.set(id,{account:ctx.a.id,extension:ctx.id,target:ctx.key,resolve,reject,timer});
   try{ctx.send(EVENT,{id,event,args});}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
  });
 }
 function bindWorker(a,worker){
  if(!worker||worker.isDestroyed()||!extensionId(worker.scope)||a.workers.has(worker.versionId))return;
  a.workers.set(worker.versionId,worker);
  worker.ipc.handle(RPC,async(_event,name,args)=>{
   try{return {ok:true,value:await dispatch(contextForWorker(a,worker),name,args)};}
   catch(error){return {ok:false,error:cleanError(error)};}
  });
  worker.ipc.on(ACK,(_event,message)=>{try{acceptAck(contextForWorker(a,worker),message);}catch{}});
 }
 function sendEvent(a,name,makeArgs){
  for(const [version,worker] of a.workers){
   try{if(worker.isDestroyed()){a.workers.delete(version);continue;}const ctx=contextForWorker(a,worker),ext=extension(a,ctx.id);ctx.send(EVENT,{event:name,args:makeArgs(ext)});}catch{}
  }
  for(const [key,ctx] of a.frames){
   try{if(ctx.frame.isDestroyed?.()||extensionId(ctx.frame.url)!==ctx.id){a.frames.delete(key);continue;}ctx.send(EVENT,{event:name,args:makeArgs(extension(a,ctx.id))});}catch{a.frames.delete(key);}
  }
 }
 function prepareSession(id,session){
  if(accounts.has(id)){if(account(id).session!==session)throw Error('不能更换已有账号的扩展会话');return;}
  if(bySession.has(session))throw Error('不同账号不能复用扩展会话');
  const a={id,session,tabs:new Map(),frames:new Map(),workers:new Map(),actions:new Map(),errors:new Map(),current:null};
  accounts.set(id,a);bySession.set(session,a);
  if(typeof session.registerPreloadScript==='function'){
   session.registerPreloadScript({type:'frame',filePath:preload});
   try{session.registerPreloadScript({type:'service-worker',filePath:preload});}catch{}
  }else if(typeof session.setPreloads==='function'){
   const cur=typeof session.getPreloads==='function'?(session.getPreloads()||[]):[];
   if(!cur.includes(preload))session.setPreloads([...cur,preload]);
  }
  if(typeof session.serviceWorkers?.on==='function'){
   session.serviceWorkers.on('running-status-changed',details=>{
    if(details.runningStatus==='stopped'){a.workers.delete(details.versionId);return;}
    try{bindWorker(a,session.serviceWorkers.getWorkerFromVersionID(details.versionId));}catch{}
   });
   session.serviceWorkers.on('console-message',(_event,details)=>{
    if(details.level<3)return;const id=extensionId(details.sourceUrl);if(id)a.errors.set(id,'后台错误：'+cleanError(details.message));
   });
  }
  if(typeof session.serviceWorkers?.getAllRunning==='function'){
   for(const version of Object.keys(session.serviceWorkers.getAllRunning())){try{bindWorker(a,session.serviceWorkers.getWorkerFromVersionID(Number(version)));}catch{}}
  }
 }
 function registerTab(id,wc,window){
  const a=account(id);if(wc.session!==a.session)throw Error('标签页与账号会话不一致');
  if(a.tabs.has(wc.id))return;
  const windowId=window.id,t={wc,window,windowId};a.tabs.set(wc.id,t);if(!a.current)a.current=wc.id;
  const focus=()=>{a.current=wc.id;sendEvent(a,'tabs.onActivated',()=>[{tabId:wc.id,windowId}]);};
  window.on('focus',focus);
  const update=status=>sendEvent(a,'tabs.onUpdated',ext=>[wc.id,{status},info(a,t,ext)]);
  wc.on('did-start-loading',()=>update('loading'));wc.on('did-finish-load',()=>update('complete'));
  wc.once('destroyed',()=>{a.tabs.delete(wc.id);if(a.current===wc.id)a.current=a.tabs.keys().next().value||null;window.removeListener('focus',focus);sendEvent(a,'tabs.onRemoved',()=>[wc.id,{windowId,isWindowClosing:true}]);});
  sendEvent(a,'tabs.onCreated',ext=>[info(a,t,ext)]);
 }
 async function dispatch(ctx,name,args){
  if(typeof name!=='string'||name.length>80||!/^((tabs|action)\.[A-Za-z]+)$/.test(name)||!Array.isArray(args)||args.length>5||Buffer.byteLength(JSON.stringify(args))>1024*1024)throw Error('扩展请求格式无效');
  const {a,id}=ctx,ext=extension(a,id);
  if(name.startsWith('action.')){
   const method=name.slice(7),details=args[0]??{};
   let tabId=typeof details==='number'?details:details.tabId;
   if(tabId!==undefined)tab(a,tabId);
   const key=tabId===undefined?'global':tabId,old=state(a,id,tabId);
   const field={getTitle:'title',getPopup:'popup',getBadgeText:'badgeText'}[method];if(field)return field==='popup'&&old[field]?navigationURL(old[field],id):old[field];
   if(method==='enable'||method==='disable'){setState(a,id,key,{enabled:method==='enable'});return;}
   if(!details||typeof details!=='object'||Array.isArray(details))throw Error('扩展按钮参数无效');
   if(method==='setTitle'){if(typeof details.title!=='string'||details.title.length>1000)throw Error('按钮标题无效');setState(a,id,key,{title:details.title});return;}
   if(method==='setBadgeText'){if(typeof details.text!=='string'||details.text.length>100)throw Error('按钮标记无效');setState(a,id,key,{badgeText:details.text});return;}
   if(method==='setPopup'){if(typeof details.popup!=='string')throw Error('弹出页地址无效');const popup=details.popup?navigationURL(details.popup,id):'';if(popup&&extensionId(popup)!==id)throw Error('弹出页必须属于该扩展');setState(a,id,key,{popup});return;}
   throw Error('尚未适配的扩展按钮接口');
  }
  if(name==='tabs.get')return info(a,tab(a,args[0]),ext);
  if(name==='tabs.getCurrent')return ctx.wc&&a.tabs.has(ctx.wc.id)?info(a,tab(a,ctx.wc.id),ext):undefined;
  if(name==='tabs.query'){
   const query=args[0]||{};if(typeof query!=='object'||Array.isArray(query))throw Error('标签查询无效');
   const allowed=new Set(['windowId','currentWindow','lastFocusedWindow','active','url','status','title','pinned','highlighted','audible','muted','discarded','windowType']);
   if(Object.keys(query).some(k=>!allowed.has(k)))throw Error('查询包含尚未适配的筛选条件');
   const currentId=current(a,ctx),windowId=currentId?tab(a,currentId).windowId:null;
   const titleMatches=(pattern,title)=>typeof pattern==='string'&&new RegExp('^'+pattern.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(title);
   return [...a.tabs.values()].filter(t=>!t.wc.isDestroyed()).filter(t=>{
    const readable=canReadURL(ext.manifest,t.wc.getURL(),ext.id);
    return (query.windowId===undefined||(query.windowId===-2?windowId:query.windowId)===t.windowId)&&
     (!query.currentWindow&&!query.lastFocusedWindow||t.windowId===windowId)&&
     (query.active===undefined||query.active===true)&&(query.highlighted===undefined||query.highlighted===true)&&
     (query.pinned===undefined||query.pinned===false)&&(query.discarded===undefined||query.discarded===false)&&
     (query.windowType===undefined||query.windowType==='normal')&&
     (query.status===undefined||query.status===(t.wc.isLoading?.()?'loading':'complete'))&&
     (query.audible===undefined||query.audible===!!t.wc.isCurrentlyAudible?.())&&
     (query.muted===undefined||query.muted===!!t.wc.isAudioMuted?.())&&
     (query.title===undefined||readable&&titleMatches(query.title,t.wc.getTitle?.()||''))&&
     (!query.url||readable&&(Array.isArray(query.url)?query.url:[query.url]).some(pattern=>matchURL(pattern,t.wc.getURL())));
   }).map(t=>info(a,t,ext));
  }
  if(name==='tabs.create'){
   const properties=args[0]||{};if(typeof properties!=='object'||Array.isArray(properties))throw Error('新标签参数无效');
   if(Object.keys(properties).some(k=>!['url','active','openerTabId'].includes(k)))throw Error('此测试版的新标签使用同账号独立窗口；不支持指定窗口、索引或固定状态');
   if(properties.active!==undefined&&typeof properties.active!=='boolean')throw Error('标签激活状态无效');
   if(properties.openerTabId!==undefined)tab(a,properties.openerTabId);
   if(a.session.__routeBlocked||a.session.__routeApplying)throw Error('账号线路尚未就绪，未打开新页面');
   const url=navigationURL(properties.url||'about:blank',id);
   const created=await createTab(a.id,{...properties,url,opener:properties.openerTabId??current(a,ctx),extensionId:id});
   if(!created?.webContents||!created?.window)throw Error('宿主未创建真实标签窗口');
   registerTab(a.id,created.webContents,created.window);
   if(properties.active!==false){a.current=created.webContents.id;created.window.show();created.window.focus();}
   return info(a,tab(a,created.webContents.id),ext);
  }
  if(name==='tabs.update'){
   const explicit=typeof args[0]==='number',t=tab(a,explicit?args[0]:current(a,ctx)),changes=(explicit?args[1]:args[0])||{};
   if(typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!['url','active','muted'].includes(k)))throw Error('标签更新包含尚未适配的选项');
   if(changes.active!==undefined&&typeof changes.active!=='boolean'||changes.muted!==undefined&&typeof changes.muted!=='boolean')throw Error('标签状态无效');
   if((changes.url!==undefined)&&(a.session.__routeBlocked||a.session.__routeApplying))throw Error('账号线路尚未就绪，未导航');
   if(changes.url!==undefined){const url=navigationURL(changes.url,id);const ok=await navigateTab(t.wc,url);if(ok===false)throw Error('标签页导航失败，原账号会话已保留');}
   if(changes.muted!==undefined)t.wc.setAudioMuted(!!changes.muted);
   if(changes.active===true){a.current=t.wc.id;t.window.show();t.window.focus();}
   return info(a,t,ext);
  }
  if(name==='tabs.remove'){
   const ids=Array.isArray(args[0])?args[0]:[args[0]];if(!ids.length||ids.length>100)throw Error('关闭标签参数无效');
   const targets=[...new Set(ids)].map(id=>tab(a,id));for(const t of targets)t.window.close();return;
  }
  if(name==='tabs.reload'){
   const explicit=typeof args[0]==='number',t=tab(a,explicit?args[0]:current(a,ctx)),options=(explicit?args[1]:args[0])||{};
   if(a.session.__routeBlocked||a.session.__routeApplying)throw Error('账号线路尚未就绪，未刷新');
   if(typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='bypassCache'))throw Error('刷新参数无效');
   options.bypassCache?t.wc.reloadIgnoringCache():t.wc.reload();return;
  }
  throw Error('尚未适配的扩展接口：'+name);
 }
 ipcMain.handle(RPC,async(event,name,args)=>{try{return {ok:true,value:await dispatch(contextForFrame(event),name,args)};}catch(error){return {ok:false,error:cleanError(error)};}});
 ipcMain.on(ACK,(event,message)=>{try{acceptAck(contextForFrame(event),message);}catch{}});
 async function activate(id,extId,owner){
  const a=account(id),ext=extension(a,extId),t=tab(a,owner.id);
  if(owner.session!==a.session)throw Error('扩展不能操作其他账号');
  a.current=t.wc.id;
  const action=state(a,extId,owner.id);if(!action.enabled)throw Error('该扩展按钮当前已停用');
  if(action.popup){const url=navigationURL(action.popup,extId);if(extensionId(url)!==extId)throw Error('弹出页必须属于该扩展');return {kind:'popup',url};}
  const eventName=ext.manifest.manifest_version===2?'browserAction.onClicked':'action.onClicked';
  let ctx,task;
  try{
  if(ext.manifest.background?.service_worker){
   const worker=await require('./extension-worker-ready').startExtensionWorker(a.session.serviceWorkers,'chrome-extension://'+extId+'/',{validate:()=>{extension(a,extId);tab(a,owner.id);}});
   bindWorker(a,worker);ctx=contextForWorker(a,worker);task=worker.startTask?.();
  }else{
   const background=webContents?.getAllWebContents().find(wc=>wc.session===a.session&&wc.getType()==='backgroundPage'&&extensionId(wc.getURL())===extId);
   if(!background)throw Error('扩展没有可运行的后台点击处理器');
   ctx={a,id:extId,wc:background,key:'frame:'+background.id+':'+background.mainFrame.routingId,send:(channel,value)=>background.send(channel,value)};
  }
   let ready;
   for(let i=0;i<20;i++){ready=await ask(ctx,'bridge.ping',[],3000);if(ready?.clickListeners>0)break;await new Promise(resolve=>setTimeout(resolve,50));}
   if(!ready?.clickListeners)throw Error('扩展后台没有注册按钮点击处理器，请查看加载错误');
   const result=await ask(ctx,eventName,[info(a,t,ext)]);
   if(!result?.handled)throw Error('扩展未接收按钮点击');
   a.errors.delete(extId);return {kind:'action',handled:result.handled};
  }catch(error){a.errors.set(extId,cleanError(error));throw error;}
  finally{task?.end();}
 }
 return {prepareSession,registerTab,activate,
  actionState:(id,extId,tabId)=>state(account(id),extId,tabId),
  error:(id,extId)=>accounts.get(id)?.errors.get(extId)||'',
  clear:(id,extId)=>{const a=accounts.get(id);a?.errors.delete(extId);a?.actions.delete(extId);},
  reportError:(id,extId,error)=>{if(extId)accounts.get(id)?.errors.set(extId,cleanError(error));},
 };
}
module.exports={createExtensionCompat,extensionId,matchURL,canReadURL,navigationURL,cleanError};
