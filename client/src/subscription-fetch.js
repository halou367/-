'use strict';
// Subscription-only transport: no account session, Cookie jar, or account route mutation.
const http=require('node:http'),https=require('node:https'),net=require('node:net'),zlib=require('node:zlib');
const DEFAULT_PORTS=Object.freeze([7980,18080,7890,7897,10809,10808,1080,8080,8888,20171,20170,2080]);
function error(code){const e=Error(code);e.code=code;return e;}
function normalizeURL(value){
 if(typeof value!=='string'||value.length>16000||/[\r\n\0]/.test(value))throw error('INVALID_SUBSCRIPTION_URL');
 const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw error('INVALID_SUBSCRIPTION_URL');return u;
}
function candidatePorts(preferred=[]){return [...new Set([...preferred,...DEFAULT_PORTS].map(Number))].filter(p=>Number.isInteger(p)&&p>0&&p<65536).slice(0,16);}
function configuredLoopbackPorts(value){try{let text=String(value||'').trim();if(!text.includes('://'))text='http://'+text;const u=new URL(text);return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&u.port?[Number(u.port)]:[];}catch{return [];}}
function publicError(e){
 const code=String(e?.code||'');if(/^(?:HTTP_[0-9]{3}|E[A-Z0-9_]+|ERR_[A-Z0-9_]+|CERT_[A-Z0-9_]+|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|TIMEOUT|CANCELLED|RESPONSE_TOO_LARGE|REDIRECT_[A-Z_]+|UNEXPECTED_HTML|INVALID_SUBSCRIPTION_URL)$/.test(code))return code;
 if(e?.name==='AbortError')return 'TIMEOUT';
 if(/407|authentication|auth method/i.test(String(e?.message||'')))return 'PROXY_AUTH_REQUIRED';
 return 'CONNECTION_OR_PROXY_HANDSHAKE_FAILED';
}
function scopedAbort(parent,ms){const ctl=new AbortController(),onAbort=()=>ctl.abort(parent.reason||error('CANCELLED'));if(parent?.aborted)onAbort();else parent?.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>ctl.abort(error('TIMEOUT')),Math.max(1,ms));return {signal:ctl.signal,abort:reason=>ctl.abort(reason),close:()=>{clearTimeout(timer);parent?.removeEventListener('abort',onAbort);}};}
function tcpOpen(host,port,{signal,timeoutMs=350}={}){return new Promise(resolve=>{
 if(signal?.aborted)return resolve(false);let settled=false;
 const socket=net.createConnection({host,port});socket.on('error',()=>{});
 const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);socket.destroy();resolve(value);};
 const cancel=()=>finish(false),timer=setTimeout(cancel,timeoutMs);signal?.addEventListener('abort',cancel,{once:true});
 socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));
});}
async function discover(ports,{signal,hosts=['127.0.0.1','::1'],concurrency=8}={}){
 const queue=ports.flatMap(port=>hosts.map(host=>({host,port}))),out=new Array(queue.length);let next=0;
 await Promise.all(Array.from({length:Math.min(concurrency,queue.length)},async()=>{for(;;){const i=next++;if(i>=queue.length||signal?.aborted)return;const p=queue[i];if(await tcpOpen(p.host,p.port,{signal}))out[i]=p;}}));return out.filter(Boolean);
}
function createAgent(url,proxy,timeoutMs){
 if(!proxy){const family=url.hostname.startsWith('[')||net.isIP(url.hostname)===6?6:4;return url.protocol==='https:'?new https.Agent({keepAlive:false,rejectUnauthorized:true,family}):new http.Agent({keepAlive:false,family});}
 const host=proxy.host==='::1'?'[::1]':proxy.host;
 if(proxy.scheme==='http'){const {HttpsProxyAgent}=require('https-proxy-agent');return new HttpsProxyAgent('http://'+host+':'+proxy.port,{keepAlive:false,rejectUnauthorized:true,timeout:timeoutMs});}
 const {SocksProxyAgent}=require('socks-proxy-agent');return new SocksProxyAgent('socks5h://'+host+':'+proxy.port,{keepAlive:false,rejectUnauthorized:true,timeout:timeoutMs});
}
async function requestOnce(url,{proxy,signal,maxBytes=8*1024*1024,timeoutMs=7000,agentFactory=createAgent}={}){
 const agent=agentFactory(url,proxy,timeoutMs);
 try{return await new Promise((resolve,reject)=>{
  let done=false;const finish=(e,value)=>{if(done)return;done=true;e?reject(e):resolve(value);};
  const req=(url.protocol==='https:'?https:http).request(url,{method:'GET',agent,signal,rejectUnauthorized:true,maxHeaderSize:16384,headers:{'User-Agent':'v2rayN/6.23','Accept':'*/*','Accept-Encoding':'gzip, deflate, br','Cache-Control':'no-cache'}},res=>{
   res.once('error',e=>finish(e));
   const status=res.statusCode||0;
   if([301,302,303,307,308].includes(status)){const location=res.headers.location;res.destroy();if(!location){finish(error('REDIRECT_LOCATION'));return;}finish(null,{redirect:location,status});return;}
   if(status<200||status>=300){res.destroy();finish(error('HTTP_'+status));return;}
   let stream=res;const encoding=String(res.headers['content-encoding']||'').toLowerCase();
   if(encoding==='gzip')stream=res.pipe(zlib.createGunzip());else if(encoding==='deflate')stream=res.pipe(zlib.createInflate());else if(encoding==='br')stream=res.pipe(zlib.createBrotliDecompress());
   const chunks=[];let bytes=0;stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){finish(error('RESPONSE_TOO_LARGE'));stream.destroy();res.destroy();req.destroy();return;}chunks.push(chunk);});
   stream.once('error',e=>finish(e));res.once('aborted',()=>finish(signal?.aborted?(signal.reason||error('TIMEOUT')):error('ECONNRESET')));
   stream.once('end',()=>{const text=Buffer.concat(chunks).toString('utf8');if(/^\s*(?:<!doctype\s+html|<html[\s>])/i.test(text)){finish(error('UNEXPECTED_HTML'));return;}finish(null,{text,contentType:String(res.headers['content-type']||'')});});
  });
  req.once('error',e=>finish(signal?.aborted?(signal.reason||error('TIMEOUT')):e));req.end();
 });}finally{agent.destroy?.();}
}
async function fetchText(raw,{proxy=null,signal,timeoutMs=7000,maxBytes,request=requestOnce}={}){
 let url=normalizeURL(raw);const timer=scopedAbort(signal,timeoutMs);
 try{
  for(let hops=0;hops<5;hops++){
   if(timer.signal.aborted)throw timer.signal.reason;
   const r=await request(url,{proxy,signal:timer.signal,timeoutMs,maxBytes});if(!r.redirect)return r;
   const next=normalizeURL(new URL(r.redirect,url).href);if(url.protocol==='https:'&&next.protocol!=='https:')throw error('REDIRECT_DOWNGRADE');
   url=next;
  }
  throw error('REDIRECT_LIMIT');
 }finally{timer.close();}
}
function createSubscriptionFetcher({request=fetchText,discoverPorts=discover,totalMs=30000,directMs=3500,proxyMs=6500,parallel=4}={}){
 return async function fetchSubscription(url,{preferredPorts=[],signal}={}){
  const start=Date.now(),attempts=[];let parsed;try{parsed=normalizeURL(url);}catch{return {error:'订阅地址不正确，请使用不含用户名和密码的 HTTP(S) 地址',code:'INVALID_SUBSCRIPTION_URL'};}
  const life=scopedAbort(signal,totalMs),left=()=>Math.max(0,totalMs-(Date.now()-start));
  const failure=(phase,e,proxy)=>attempts.push({phase,code:publicError(e),...(proxy?{proxy:proxy.scheme+'://'+(proxy.host==='::1'?'[::1]':proxy.host)+':'+proxy.port}:{})});
  try{
   try{const r=await request(parsed.href,{signal:life.signal,timeoutMs:Math.min(directMs,left())});return {...r,via:'直连',elapsedMs:Date.now()-start};}catch(e){failure('direct',e);}
   const ghM=/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/i.exec(parsed.href);
   if(ghM&&!life.signal.aborted){
    const [,ghO,ghR,ghB,ghP]=ghM;
    const mirrors=[`https://testingcf.jsdelivr.net/gh/${ghO}/${ghR}@${ghB}/${ghP}`,`https://fastly.jsdelivr.net/gh/${ghO}/${ghR}@${ghB}/${ghP}`,`https://cdn.jsdelivr.net/gh/${ghO}/${ghR}@${ghB}/${ghP}`,`https://gcore.jsdelivr.net/gh/${ghO}/${ghR}@${ghB}/${ghP}`,`https://ghfast.top/${parsed.href}`];
    try{const mr=await Promise.any(mirrors.map(mu=>request(mu,{signal:life.signal,timeoutMs:Math.min(directMs,left())}).then(x=>{if(x&&typeof x.text==='string'&&x.text.trim())return x;throw error('EMPTY');})));return {...mr,via:'镜像直连',elapsedMs:Date.now()-start};}catch{}
   }
   if(life.signal.aborted)throw life.signal.reason;
   const open=await discoverPorts(candidatePorts(preferredPorts),{signal:life.signal});
   const queue=open.flatMap(p=>[{...p,scheme:'http'},{...p,scheme:'socks5'}]);let next=0,settled=false;
   const found=await new Promise(resolve=>{
    let workers=0;
    const finish=value=>{if(settled)return;settled=true;life.signal.removeEventListener('abort',abort);resolve(value);};
    const abort=()=>finish(null);life.signal.addEventListener('abort',abort,{once:true});
    async function worker(){workers++;try{while(!settled&&!life.signal.aborted){const proxy=queue[next++];if(!proxy)return;try{const r=await request(parsed.href,{proxy,signal:life.signal,timeoutMs:Math.min(proxyMs,left())});finish({...r,via:'本地 '+(proxy.scheme==='http'?'HTTP':'SOCKS5')+' '+(proxy.host==='::1'?'[::1]':proxy.host)+':'+proxy.port,proxy:proxy.scheme+'://'+(proxy.host==='::1'?'[::1]':proxy.host)+':'+proxy.port,elapsedMs:Date.now()-start});life.abort(error('CANCELLED'));return;}catch(e){if(!settled)failure('proxy',e,proxy);}}}finally{workers--;if(!settled&&workers===0)finish(null);}}
    if(!queue.length)finish(null);else for(let i=0;i<Math.min(parallel,queue.length);i++)void worker();
   });
   if(found)return found;
   if(signal?.aborted)return {error:'订阅获取已取消',code:'CANCELLED'};
   if(life.signal.aborted)return {error:'获取订阅超时：直连与自动代理未能在限定时间内完成',code:'TIMEOUT',attempts,elapsedMs:Date.now()-start};
   return {error:'无法获取订阅：直连与自动代理均未成功或已超时',code:'SUBSCRIPTION_UNAVAILABLE',attempts,detectedPorts:open.map(p=>p.host+':'+p.port),elapsedMs:Date.now()-start};
  }catch(e){failure('overall',e);const timed=life.signal.aborted||publicError(e)==='TIMEOUT';return {error:signal?.aborted?'订阅获取已取消':timed?'获取订阅超时：直连与自动代理未能在限定时间内完成':'无法获取订阅：网络获取流程失败',code:signal?.aborted?'CANCELLED':timed?'TIMEOUT':'SUBSCRIPTION_UNAVAILABLE',attempts,elapsedMs:Date.now()-start};}
  finally{life.abort(error('CANCELLED'));life.close();}
 };
}
module.exports={DEFAULT_PORTS,normalizeURL,candidatePorts,configuredLoopbackPorts,publicError,tcpOpen,discover,requestOnce,fetchText,createSubscriptionFetcher};
