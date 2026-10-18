'use strict';
const { safeNavigationURL } = require('./runtime-navigation');
const NetPolicy = require('../ui/net-policy');
// Probe only a main-process remembered origin, never user-provided paths/tokens or account credentials.
function target(event, offline, requireOffline=true) {
  try {
    const {fileURLToPath}=require('node:url'),path=require('node:path'),current=new URL(event.sender.getURL());
    if(requireOffline&&(current.protocol!=='file:'||path.resolve(fileURLToPath(current))!==path.resolve(offline)))return '';
    const origin=safeNavigationURL(event.sender.__retryTarget?.get()),u=new URL(origin);
    return u.protocol==='https:'&&u.hostname!=='arena.ai'?origin:'';
  }catch{return '';}
}
function proofOwner(event, account, offline) {
  const origin=target(event,offline,false);
  return origin?account.id+':website:'+event.sender.id+':'+origin:account.id;
}
async function check(ses, origin, timeout=12000) {
  const start=Date.now();let reached=false;
  return NetPolicy.deadline(async signal=>{
    const options={credentials:'omit',cache:'no-store',redirect:'manual',signal};
    const response=await ses.fetch(origin+'/',{...options,method:'HEAD'});
    try{await response.body?.cancel();}catch{}
    if(response.status===403||response.status===429||response.status>=500)return {ok:false,reachable:true,kind:response.status===403?'verification':response.status===429?'rate-limit':'service',status:response.status,error:'目标网站已响应 HTTP '+response.status+'，请在原线路重试或完成网页验证'};
    if(response.status<200||response.status>=500)throw Error('目标网站未响应');
    reached=true;
    const trace=await ses.fetch('https://www.cloudflare.com/cdn-cgi/trace',{...options,method:'GET'});
    if(!trace.ok)throw Error('出口检测未通过，未更换线路');
    const reader=trace.body.getReader();let text='',bytes=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192)throw Error('出口检测响应过大');text+=new TextDecoder().decode(value);}}finally{await reader.cancel().catch(()=>{});}
    const ip=(/^ip=([0-9a-f:.]+)$/im.exec(text)||[])[1],loc=(/^loc=([A-Z]{2})$/m.exec(text)||[])[1];
    if(!ip||!loc)throw Error('出口检测响应无效');
    return {ok:true,ip,loc,ms:Date.now()-start,scope:'website',website:true};
  },{timeout}).catch(error=>{if(reached)return {ok:false,reachable:true,kind:'config',error:'目标网站可达，但出口检测未确认，保持原线路并重试'};throw Object.assign(Error('目标网站或出口检测失败，保留原线路'),{kind:'network',routeTimeout:error.routeTimeout===true});});
}
module.exports={target,proofOwner,check};
