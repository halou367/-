const State = require('../ui/route-state');
const NetPolicy = require('../ui/net-policy');
const signature = a => JSON.stringify(['proxy','proxyIp','nodeId','region'].map(k => String(a?.[k] || '')));
const probeKey = a => JSON.stringify(['proxy','proxyIp','nodeId'].map(k => String(a?.[k] || '')));
const plain = text => !/<(?:!doctype|html)|cf-chl|captcha|cloudflare/i.test(text);
function serviceOK(code,text) { let j; try { j=JSON.parse(text); } catch {} return plain(text)&&((code===200&&j&&Object.hasOwn(j,'user'))||(code===401&&(!text.trim()||!!j||/unauthori[sz]ed/i.test(text)))); }
function realtimeOK(code,text,type='') { return plain(text)&&([400,401,404].includes(code)||code===200&&/event-stream/i.test(type)); }
function blocked(response) {
  const { status, text, retryAfter } = response;
  if (status === 429) return { ok:false, reachable:true, kind:'rate-limit', status, retryAfterMs:NetPolicy.retryAfter(retryAfter)||60000, error:'这条线路的出口 IP 被 Brana 限流（429），已跳过' };
  if (status === 403 || !plain(text)) return { ok:false, reachable:true, kind:'verification', status, error:'线路可达，但 Brana 要求网页验证；不能据此判定节点断网' };
  if (status >= 500) return { ok:false, reachable:true, kind:'service', status, error:'Brana 服务异常（HTTP '+status+'），保留当前线路' };
  return null;
}
// 冷启动（新 xray + 节点握手 + ProxyIP 建连）可能要好几秒：第一次超时 / 网络错误时，隧道已建好，再测一次；
// 报错写明卡在哪一步，不再一律说「节点不通」
// IPPure 纯净度兜底：经同一条隧道请求 my.ippure.com/v1/info（报告的是「调用方」的出口 IP，即 Brana 看到的那个），
// fraudScore 0–100 越高越危险；失败 / 超时只是没有这项数据，不影响线路检测结果
async function ippure(ses, ms=2200, signal) {
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
  const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try { const r=await ses.fetch('https://my.ippure.com/v1/info',{method:'GET',signal:ctl.signal,credentials:'omit',cache:'no-store',redirect:'follow'}); if(!r.ok)return null;
    const j=JSON.parse((await r.text()).slice(0,20000)), fs=Number(j?.fraudScore); if(!Number.isFinite(fs))return null;
    return {fs:Math.max(0,Math.min(100,Math.round(fs))),ip:String(j.ip||'').slice(0,64),res:!!j.isResidential,bc:!!j.isBroadcast,dc:!!j.isDataCenter,org:String(j.asOrganization||'').slice(0,40)}; }
  catch { return null; } finally { clearTimeout(t);signal?.removeEventListener('abort',abort); }
}
// ip-api（经隧道，查「调用方」）：是否代理 / 机房 / 移动网络，免费不限每日次数 —— 和 IPPure 一起测，保证测延迟时就评出纯净度
async function ipapi(ses, ms=1800, signal) {
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
  const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try { const r=await ses.fetch('http://ip-api.com/json/?fields=status,query,isp,org,as,mobile,proxy,hosting',{method:'GET',signal:ctl.signal,credentials:'omit',cache:'no-store',redirect:'follow'}); if(!r.ok)return null;
    const j=JSON.parse((await r.text()).slice(0,20000)); if(j?.status!=='success'||!j.query)return null;
    return {ip:String(j.query).slice(0,64),h:!!j.hosting,px:!!j.proxy,m:!!j.mobile,isp:String(j.isp||j.org||'').slice(0,40),as:String(j.as||'').split(' ')[0].slice(0,12)}; }
  catch { return null; } finally { clearTimeout(t);signal?.removeEventListener('abort',abort); }
}
// 测延迟时顺带测纯净度：IPPure + ip-api 并行（同一条隧道）
async function purity(ses, ms=2500, signal) { const [pure,ipa]=await Promise.all([ippure(ses,ms,signal),ipapi(ses,ms,signal)]); return {...(pure?{pure}:{}),...(ipa?{ipa}:{})}; }
async function checkService(ses, timeout=6500) { const r=await checkService0(ses,timeout); if(r&&r.ok&&r.ip)Object.assign(r,await purity(ses,Math.min(2500,Math.max(50,timeout)))); return r; }
async function checkService0(ses, timeout=6500) {
  try { return await checkOnce(ses, timeout); }
  catch (e) { if (e.kind !== 'network') throw e; try { return await checkOnce(ses, Math.round(timeout * 1.1)); } catch (e2) { if (e2.kind === 'network' && e2.stage) e2.message += '（已重试 1 次）'; throw e2; } }
}
async function checkOnce(ses, timeout) {
  const ctl=new AbortController(),start=Date.now(); let timer,stage='出口检测（cdn-cgi/trace）';
  try { return await Promise.race([(async()=>{
    const get=async path=>{
      const r=await ses.fetch('https://arena.ai'+path,{method:'GET',credentials:'omit',cache:'no-store',redirect:'manual',signal:ctl.signal});
      if(r.status===429||r.status===403||r.status>=500||(r.status===200&&String(r.headers?.get('content-type')||'').includes('text/event-stream'))){try{void r.body?.cancel?.().catch(()=>{});}catch{}return {status:r.status,text:'',type:r.headers?.get('content-type')||'',retryAfter:r.headers?.get('retry-after')||''};}
      const text=await r.text(); if(text.length>65536)throw Object.assign(Error('服务检测响应过大'),{kind:'service'});
      return {status:r.status,text,type:r.headers?.get('content-type')||'',retryAfter:r.headers?.get('retry-after')||''};
    };
    const t=await get('/cdn-cgi/trace'), tb=blocked(t); if(tb)return {...tb,ms:Date.now()-start};
    if(t.status!==200)return {ok:false,reachable:true,kind:'service',status:t.status,error:'出口检测未返回有效结果'};
    const kv=Object.fromEntries(t.text.trim().split('\n').map(l=>l.split('=')));
    if(!kv.ip)return {ok:false,reachable:true,kind:'service',error:'出口信息无效'};
    const base={ip:kv.ip,loc:kv.loc||''};
    stage='账号 API 与实时入口';
    const [s,r]=await Promise.all([
      get('/api/me'),
      Promise.race([
        get('/ai-proxy/realtime/v1/sessions/00000000-0000-0000-0000-000000000000/out').catch(e=>({status:404,text:'{"error":"unknown session"}',type:'application/json',retryAfter:'',softErr:e})),
        new Promise(res=>setTimeout(()=>res({status:404,text:'{"error":"unknown session"}',type:'application/json',retryAfter:'',softTimeout:true}),Math.max(40,Math.round(timeout*0.65)))),
      ]),
    ]);
    const sb=blocked(s); if(sb)return {...base,...sb,ms:Date.now()-start};
    const service=serviceOK(s.status,s.text);
    if(!service)return {...base,ok:false,reachable:true,kind:'service',service:false,realtime:false,ms:Date.now()-start,error:'账号 API 响应未通过检测，不能确认为可用线路'};
    const rb=blocked(r);
    if(rb)return {...base,...rb,service:true,ms:Date.now()-start};
    const realtime=realtimeOK(r.status,r.text,r.type);
    return {...base,ok:realtime,service:true,realtime,ms:Date.now()-start,...(!realtime?{reachable:true,kind:'service',error:'实时入口未通过检测'}:{})};
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{ctl.abort();reject(Object.assign(Error('服务检测超时：卡在'+stage+'，'+Math.round(timeout/1000)+' 秒内没有响应'),{kind:'network',routeTimeout:true,stage}));},timeout);})]); }
  catch(error) { if(!error.kind)error.kind='network'; if(/failed to fetch|fetch failed|ERR_[A-Z_]+|net::|NetworkError|Load failed/i.test(String(error.message||''))){const code=(/ERR_[A-Z_]+/.exec(String(error.message||''))||[''])[0];error.message='经此线路访问 Brana 失败：'+stage+(code?' · '+code:'')+(stage.startsWith('出口')?'（节点或这个 ProxyIP 连不上）':'（节点和出口已连通，是 Brana 这一步没响应）');error.stage=stage;} throw error; }
  finally { clearTimeout(timer);ctl.abort(); }
}
function createProbe(run,max=2) { let active=0; const waiting=[]; return async(...args)=>{ if(active>=max){if(waiting.length>=16)throw Error('线路检测繁忙');await new Promise(r=>waiting.push(r));}else active++;try{return await run(...args);}finally{const next=waiting.shift();if(next)next();else active--;}}; }
function createProofs({ now=Date.now, nonce=()=>require('node:crypto').randomUUID(), ttl=300000 }={}) {
  const entries=new Map();
  return {
    issue(owner, candidate, result) {
      if(!result?.ok||!result.ip||!(result.service&&result.realtime||result.scope==='website'&&result.website===true))return result;
      for(const [key,value]of entries)if(value.until<=now())entries.delete(key);
      while(entries.size>=128)entries.delete(entries.keys().next().value);
      const ticket=nonce();entries.set(ticket,{owner,key:probeKey(candidate),loc:result.loc||'',until:now()+ttl});return {...result,ticket,proofExpires:now()+ttl};
    },
    check(owner,candidate,ticket) {
      const entry=entries.get(ticket);
      if(!entry||entry.owner!==owner||entry.until<=now()||entry.key!==probeKey(candidate))throw Error('节点检测结果已过期或配置已改变，请重新检测');
      if(candidate.region&&entry.loc!==candidate.region)throw Error('节点实际出口与所选地区不一致，未应用');
      return true;
    },
    consume(ticket) { entries.delete(ticket); },
  };
}
function createApply({find,owner,validate,apply,persist,publicAccount,now=Date.now}) {
  const busy=new Set();
  const fn=async(event,o)=>{
    const a=owner(event);if(!a||a.id!==o?.id||find(a.id)!==a)return {ok:false,error:'账号已改变'};
    const manual=o.manual===true;
    if(State.locked(a))return {ok:false,authLocked:true,error:'账号正在认证，禁止更换节点或出口'};
    if(manual&&!State.MODES.includes(o.mode))return {ok:false,error:'连接模式无效'};
    if(!manual&&!o.forceFailover&&!State.canRecover(a))return {ok:false,error:'当前模式未启用故障恢复'};
    if(busy.has(a.id))return {ok:false,error:'线路正在切换'};
    if(!manual&&!o.forceFailover&&a.routeAt&&now()-a.routeAt<20000)return {ok:false,error:'线路切换冷却中'};
    if(signature(a)!==signature(o.expected)||(o.expectedConfig&&State.signature(a)!==o.expectedConfig)||(o.expectedMode&&State.mode(a)!==o.expectedMode))return {ok:false,error:'配置已改变'};
    const beforeMode=State.mode(a), beforeConfig=State.signature(a);
    if(manual&&o.preservePolicy===true&&o.mode!==beforeMode)return {ok:false,error:'保留策略时不能改变连接模式'};
    validate(a,o.route,o,event);busy.add(a.id);
    const old={};for(const k of ['proxy','proxyIp','nodeId','region','routeHome','routeAt','routeMode','routeAuto','nodeFailover','tunErr'])old[k]=a[k];
    try {
      const candidate={...a};for(const k of ['proxy','proxyIp','nodeId','region'])candidate[k]=String(o.route[k]||'');
      await apply(candidate,{manual,event});
      if(find(a.id)!==a||signature(a)!==signature(o.expected)||State.signature(a)!==beforeConfig||State.mode(a)!==beforeMode||State.locked(a)||(!manual&&!o.forceFailover&&!State.canRecover(a)))throw Error('配置已改变，取消应用');
      validate(a,o.route,o,event);
      for(const k of ['proxy','proxyIp','nodeId','region'])a[k]=String(o.route[k]||'');
      Object.assign(a,manual&&o.preservePolicy===true?{routeMode:beforeMode,routeAuto:old.routeAuto!==false,nodeFailover:old.nodeFailover===true}:State.prefs(manual?o.mode:beforeMode));
      a.routeHome=String(o.route.routeHome||o.route.region||old.routeHome||old.region||'');a.routeAt=now();a.tunErr=candidate.tunErr||'';
      try{persist();}catch(e){for(const k of Object.keys(old))if(old[k]===undefined)delete a[k];else a[k]=old[k];throw e;}
      return {ok:true,account:publicAccount(a)};
    }catch(e){if(find(a.id)===a)try{await apply(a);}catch{}return {ok:false,error:String(e.message||e)};}
    finally{busy.delete(a.id);}
  };fn.busy=busy;return fn;
}
module.exports={ippure,ipapi,purity,signature,probeKey,serviceOK,realtimeOK,blocked,checkService,createProbe,createProofs,createApply};
