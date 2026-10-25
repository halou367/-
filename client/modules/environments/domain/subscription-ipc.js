'use strict';
const {createSubscriptionFetcher,configuredLoopbackPorts}=require('./subscription-fetch');
function setupSubscriptionFetch({ipcMain,authorize,accountFor,tunnelPortsFor,fetcher=createSubscriptionFetcher(),maxActive=8}){
 const jobs=new Map();let active=0;
 ipcMain.handle('host:fetchSubscription',async(event,url)=>{
  const wc=event?.sender,frame=event?.senderFrame;
  if(!wc||wc.isDestroyed()||!frame||frame!==wc.mainFrame)return {error:'订阅只能从客户端主界面或离线连接页获取',code:'UNTRUSTED_CALLER'};
  let owner;try{owner=authorize(event);}catch{return {error:'此页面不能获取订阅',code:'UNTRUSTED_CALLER'};}
  if(typeof url!=='string'||url.length>16000)return {error:'订阅地址无效',code:'INVALID_SUBSCRIPTION_URL'};
  const key=owner+'\n'+url;if(jobs.has(key))return jobs.get(key);
  if(active>=maxActive)return {error:'正在获取其他订阅，请稍后再试',code:'BUSY'};
  const ctl=new AbortController(),cancel=()=>ctl.abort(),navigate=(_e,_url,inPlace,isMain)=>{if(isMain&&!inPlace)cancel();};
  wc.once('destroyed',cancel);wc.on('did-start-navigation',navigate);active++;
  const job=(async()=>{
   try{
    const a=accountFor(wc);
    const extra=typeof tunnelPortsFor==='function'?await Promise.resolve(tunnelPortsFor(wc,a)).catch(()=>[]):[];
    const preferredPorts=[...new Set([...configuredLoopbackPorts(a?.proxy),...(Array.isArray(extra)?extra:[])].map(Number).filter(p=>Number.isInteger(p)&&p>0&&p<65536))];
    const result=await fetcher(url,{preferredPorts,signal:ctl.signal});
    if(ctl.signal.aborted||wc.isDestroyed())return {error:'订阅获取已取消',code:'CANCELLED'};
    try{if(authorize(event)!==owner)return {error:'订阅页面已切换，请重新获取',code:'CANCELLED'};}catch{return {error:'订阅页面已切换，请重新获取',code:'CANCELLED'};}
    return result;
   }catch{return {error:'订阅获取失败，请重试',code:'SUBSCRIPTION_UNAVAILABLE'};}
   finally{active--;jobs.delete(key);wc.removeListener('destroyed',cancel);wc.removeListener('did-start-navigation',navigate);}
  })();jobs.set(key,job);return job;
 });
 return {pending:()=>active};
}
module.exports={setupSubscriptionFetch};
