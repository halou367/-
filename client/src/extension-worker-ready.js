'use strict';
// loadExtension resolves before an MV3 registration is necessarily ready.
// Retry only worker startup, never the extension's user action/event.
async function startExtensionWorker(serviceWorkers,scope,{validate=()=>{},timeoutMs=5000,waitMs=1200,maxAttempts=4}={}){
 let changes=0,wake=null,lastError;
 const changed=()=>{changes++;wake?.();};
 const registration=(_event,details)=>{if(details?.scope===scope)changed();};
 const running=details=>{
  try{const info=serviceWorkers.getInfoFromVersionID?.(details.versionId)||serviceWorkers.getAllRunning()[details.versionId];if(info?.scope===scope)changed();}catch{}
 };
 serviceWorkers.on('registration-completed',registration);serviceWorkers.on('running-status-changed',running);
 const deadline=Date.now()+timeoutMs;
 const pause=ms=>new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);if(wake===finish)wake=null;resolve();};wake=finish;timer=setTimeout(finish,ms);});
 try{
  for(let attempt=0;attempt<maxAttempts&&Date.now()<deadline;attempt++){
   validate();const before=changes;let timer;
   try{
    const worker=await Promise.race([serviceWorkers.startWorkerForScope(scope),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('扩展后台启动超时')),Math.max(1,deadline-Date.now()));})]);
    validate();
    if(!worker||worker.isDestroyed()||worker.scope!==scope)throw Error('扩展后台身份无效或已经停止');
    return worker;
   }catch(error){lastError=error;validate();}
   finally{clearTimeout(timer);}
   if(attempt+1>=maxAttempts||Date.now()>=deadline)break;
   if(changes===before)await pause(Math.min(waitMs,Math.max(0,deadline-Date.now())));
  }
  const error=Error('扩展后台尚未就绪：'+String(lastError?.message||'未完成注册'));
  error.code='EXTENSION_WORKER_START_FAILED';throw error;
 }finally{
  wake?.();serviceWorkers.removeListener('registration-completed',registration);serviceWorkers.removeListener('running-status-changed',running);
 }
}
module.exports={startExtensionWorker};
