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
// IPPure 官方直连 HTTP/2 接口（api.123169.xyz / api.ippure.com）：直接按目标出口 IP 查询纯净度与原生/广播/家宽属性（0 节点请求量）
const _h2Sessions = new Map();
const _inFlightPure = new Map();
function _getH2Session(host) {
  const http2 = require('node:http2');
  let entry = _h2Sessions.get(host);
  if (entry && entry.client && !entry.client.closed && !entry.client.destroyed) return entry;
  const client = http2.connect('https://' + host);
  client.on('error', () => {});
  try { client.setTimeout(15000, () => { try { client.close(); } catch {} }); } catch {}
  try { client.unref?.(); } catch {}
  entry = { client, xk: entry?.xk || '', xt: entry?.xt || 0, lt: entry?.lt || 0, handshake: null };
  _h2Sessions.set(host, entry);
  return entry;
}
async function _ippureH2Host(host, qIp, ms = 3200, signal) {
  const crypto = require('node:crypto');
  const entry = _getH2Session(host);
  const h2Get = (p, extra = {}) => new Promise((res, rej) => {
    if (signal?.aborted) return rej(Error('aborted'));
    if (!entry.client || entry.client.closed || entry.client.destroyed) {
      try { Object.assign(entry, _getH2Session(host)); } catch (e) { return rej(e); }
    }
    const tm = setTimeout(() => { try { req?.close?.(); } catch {} rej(Error('ippure h2 timeout')); }, ms);
    const onAbort = () => { clearTimeout(tm); try { req?.close?.(); } catch {} rej(Error('aborted')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    let req;
    try {
      req = entry.client.request({
        ':method': 'GET',
        ':path': p,
        ':authority': host,
        ':scheme': 'https',
        'accept': '*/*',
        'origin': 'https://ippure.com',
        'referer': 'https://ippure.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...extra,
      });
      try { req.unref?.(); } catch {}
    } catch (e) {
      clearTimeout(tm);
      signal?.removeEventListener('abort', onAbort);
      return rej(e);
    }
    let rh = {};
    const ch = [];
    req.on('response', h => { rh = h || {}; });
    req.on('data', c => ch.push(c));
    req.on('end', () => {
      clearTimeout(tm);
      signal?.removeEventListener('abort', onAbort);
      res({ headers: rh, text: Buffer.concat(ch).toString('utf8') });
    });
    req.on('error', e => {
      clearTimeout(tm);
      signal?.removeEventListener('abort', onAbort);
      rej(e);
    });
    req.end();
  });
  const updateToken = hdrs => {
    const xk = hdrs?.['x-k'], xt = parseInt(hdrs?.['x-t'], 10);
    if (xk) {
      entry.xk = String(xk);
      if (Number.isFinite(xt)) { entry.xt = xt; entry.lt = Date.now(); }
      return true;
    }
    return false;
  };
  const callSigned = async p => {
    if (!entry.xk) {
      if (!entry.handshake) {
        entry.handshake = h2Get(p).then(r0 => { updateToken(r0.headers); return r0; }).finally(() => { entry.handshake = null; });
      }
      await entry.handshake;
    }
    if (!entry.xk) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t = Date.now() - (entry.lt || Date.now()) + (entry.xt || Date.now());
      const sig = crypto.createHmac('sha256', entry.xk).update(['GET', 'https://' + host + p, '', t].join('-')).digest('hex');
      const r = await h2Get(p, { 'x-k': entry.xk, 'x-t': t + '-' + sig });
      if (updateToken(r.headers)) continue;
      return r;
    }
    return null;
  };
  const encIp = encodeURIComponent(qIp);
  const isV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(qIp);
  const [basicRes, riskRes] = await Promise.all([
    callSigned('/api/info/ip-basic/' + encIp),
    isV4 ? callSigned('/api/info/ip-risk/' + encIp).catch(() => null) : Promise.resolve(null),
  ]);
  if (!basicRes?.text) return null;
  const bJson = JSON.parse(basicRes.text.slice(0, 20000));
  const rJson = riskRes?.text ? (() => { try { return JSON.parse(riskRes.text.slice(0, 8000)); } catch { return null; } })() : null;
  if (!bJson?.ok || !bJson?.data) return null;
  const d = bJson.data;
  const ip = String(d.ip || qIp).slice(0, 64);
  const org = String(d.asn?.organization || '').slice(0, 40);
  const asnType = String(d.asn?.type || '').toLowerCase();
  const dc = asnType ? /hosting|datacenter|cloud/i.test(asnType) : (d.asn?.is_residential === false && /cloudflare|oracle|amazon|google|microsoft|linode|akamai|vultr|digitalocean|hetzner|ovh|choopa|datacamp|contabo|zenlayer|cogent|hurricane|hosting|datacenter|cloud|vps|server/i.test(org));
  const res = d.asn?.is_residential !== undefined ? !!d.asn.is_residential : (!dc && /broadband|telecom|communications|cable|mobile|fpt|kt|ntt|softbank|kddi|comcast|verizon|charter/i.test(org));
  const bc = !!d.traits?.is_broadcast;
  let fs = Number(rJson?.data?.risk_score);
  if (!Number.isFinite(fs)) {
    fs = (dc || /cloudflare|oracle|amazon|google|microsoft|linode|akamai|vultr|digitalocean|hetzner|ovh|choopa|datacamp|contabo|zenlayer|cogent|hurricane/i.test(org)) ? 15 : 8;
  }
  return { fs: Math.max(0, Math.min(100, Math.round(fs))), ip, res, bc, dc, org };
}
function isReservedOrFixtureTarget(s, allowTestNet = false) {
  const h = String(s || '').trim().replace(/^\[|\]$/g, '').replace(/:\d{1,5}$/, '');
  if (!h) return true;
  if (/^(?:127\.|10\.|0\.|169\.254\.|localhost$|::1$)/i.test(h)) return true;
  if (!allowTestNet && /^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(h)) return true;
  if (/(?:^|\.)(?:invalid|example|localhost|test)$/i.test(h) || /\.example\./i.test(h)) return true;
  return false;
}
async function ippureDirect(targetIp, ms = 3200, signal, opt = null) {
  const qIp = String(targetIp || '').trim().replace(/^\[|\]$/g, '');
  if (!qIp || (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(qIp) && !qIp.includes(':'))) return null;
  if (isReservedOrFixtureTarget(qIp, opt?.allowTestNet === true)) return null;
  const inflight = _inFlightPure.get(qIp);
  if (inflight && !signal) return inflight;
  const task = (async () => {
    for (const host of ['api.123169.xyz', 'api.ippure.com']) {
      try {
        const r = await _ippureH2Host(host, qIp, ms, signal);
        if (r && Number.isFinite(r.fs)) return r;
      } catch {}
    }
    return null;
  })();
  if (!signal) {
    _inFlightPure.set(qIp, task);
    task.finally(() => { if (_inFlightPure.get(qIp) === task) _inFlightPure.delete(qIp); });
  }
  return task;
}
// IPPure 纯净度兜底：经同一条隧道请求 my.ippure.com/v1/info（报告的是「调用方」的出口 IP，即 Brana 看到的那个），
// fraudScore 0–100 越高越危险；失败 / 超时只是没有这项数据，不影响线路检测结果
async function ippure(ses, ms=3200, signal) {
  if (!ses || typeof ses.fetch !== 'function') return null;
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
  const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  try { const r=await ses.fetch('https://my.ippure.com/v1/info',{method:'GET',signal:ctl.signal,credentials:'omit',cache:'no-store',redirect:'follow'}); if(!r.ok)return null;
    const j=JSON.parse((await r.text()).slice(0,20000)), ip=String(j?.ip||'').slice(0,64), org=String(j?.asOrganization||'').slice(0,40);
    let fs=Number(j?.fraudScore);
    if(!Number.isFinite(fs)){
      if(!ip||!ip.includes(':'))return null;
      fs=/cloudflare|oracle|amazon|google|microsoft|linode|akamai|vultr|digitalocean|hetzner|ovh|choopa|datacamp|contabo|zenlayer|cogent|hurricane/i.test(org)?15:8;
    }
    return {fs:Math.max(0,Math.min(100,Math.round(fs))),ip,res:j?.isResidential!==undefined?!!j.isResidential:/broadband|telecom|communications|cable|mobile|fpt|kt|ntt|softbank|kddi|comcast|verizon|charter/i.test(org),bc:!!j?.isBroadcast,dc:!!j?.isDataCenter,org}; }
  catch { return null; } finally { clearTimeout(t);signal?.removeEventListener('abort',abort); }
}
// ip-api（经隧道或按已实测出口 IP 查询）：是否代理 / 机房 / 移动网络，免费不限每日次数 —— 和 IPPure 一起测，保证测延迟时就评出纯净度
async function ipapi(ses, ms=2500, signal, targetIp='', directFetch=null) {
  const qIp=String(targetIp||'').trim();
  const baseUrl='http://ip-api.com/json/?fields=status,query,isp,org,as,mobile,proxy,hosting';
  const tryFetch=async(url,fn)=>{
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms);
    const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try { const r=await fn(url,ctl.signal); if(!r?.ok)return null;
      const j=JSON.parse((await r.text()).slice(0,20000)); if(j?.status!=='success'||!j.query)return null;
      return {ip:String(j.query).slice(0,64),h:!!j.hosting,px:!!j.proxy,m:!!j.mobile,isp:String(j.isp||j.org||'').slice(0,40),as:String(j.as||'').split(' ')[0].slice(0,12)}; }
    catch { return null; } finally { clearTimeout(t);signal?.removeEventListener('abort',abort); }
  };
  // 若已由 /cdn-cgi/trace 或直连检测获知明确出口 IP 且宿主提供了直连通道，优先走直连按 IP 参数查询（不消耗 EdgeTunnel 节点请求量）
  if(qIp&&typeof directFetch==='function'&&!isReservedOrFixtureTarget(qIp)){
    const directUrl='http://ip-api.com/json/'+encodeURIComponent(qIp)+'?fields=status,query,isp,org,as,mobile,proxy,hosting';
    const viaDirect=await tryFetch(directUrl,(u,sig)=>directFetch(u,{method:'GET',signal:sig,cache:'no-store',redirect:'follow'}));
    if(viaDirect&&(!qIp||viaDirect.ip.toLowerCase()===qIp.toLowerCase()))return viaDirect;
  }
  const viaSes=(ses&&typeof ses.fetch==='function')
    ?await tryFetch(baseUrl,(u,sig)=>ses.fetch(u,{method:'GET',signal:sig,credentials:'omit',cache:'no-store',redirect:'follow'}))
    :null;
  if(viaSes&&(!qIp||viaSes.ip.toLowerCase()===qIp.toLowerCase()))return viaSes;
  if(qIp&&typeof fetch==='function'&&typeof directFetch!=='function'&&!isReservedOrFixtureTarget(qIp)){
    const directUrl='http://ip-api.com/json/'+encodeURIComponent(qIp)+'?fields=status,query,isp,org,as,mobile,proxy,hosting';
    return await tryFetch(directUrl,(u,sig)=>fetch(u,{method:'GET',signal:sig,cache:'no-store',redirect:'follow'}));
  }
  return viaSes;
}
// 测延迟时顺带测纯净度：优先复用 7 天内已缓存的出口信誉（0 额外节点请求），未命中时优先直连查 IPPure (HTTP/2) + ip-api（0 节点请求量）
async function purity(ses, ms=3200, signal, targetIp='', opt=null) {
  const qIp=String(targetIp||'').trim();
  const rep=(typeof opt?.getCachedRep==='function'&&qIp)?opt.getCachedRep(qIp):(opt?.cachedRep||null);
  const nowMs=Date.now();
  const cachedPu=(qIp&&rep?.pu&&Number.isFinite(+rep.pu.fs)&&(nowMs-(+rep.pu.at||0)<7*86400e3))
    ?{ip:qIp,fs:+rep.pu.fs,res:!!rep.pu.res,bc:!!rep.pu.bc,dc:!!rep.pu.dc,org:String(rep.pu.org||'')}
    :null;
  const cachedIpa=(qIp&&rep?.a&&(nowMs-(+rep.a||0)<7*86400e3))
    ?{ip:qIp,h:!!rep.h,px:!!rep.px,m:!!rep.m,isp:String(rep.isp||''),as:String(rep.as||'')}
    :null;
  const fetchPure=async()=>{
    if(cachedPu)return cachedPu;
    if(qIp&&(opt?.directIppure===true||!ses)){
      const dp=await ippureDirect(qIp,ms,signal,opt);
      if(dp)return dp;
    }
    return ses?await ippure(ses,ms,signal):null;
  };
  let [pure,ipa]=await Promise.all([
    fetchPure(),
    cachedIpa?Promise.resolve(cachedIpa):ipapi(ses,ms,signal,targetIp,opt?.directFetch||null),
  ]);
  const cmExit=opt?.cmliuExit||null;
  if(!ipa&&qIp&&cmExit&&(cmExit.asOrganization||cmExit.org||cmExit.asn)){
    const orgStr=String(cmExit.asOrganization||cmExit.org||'').replace(/^AS\d+\s+/i,'').trim().slice(0,40);
    const isHosting=/\b(?:cloudflare|oracle|amazon|aws|google|microsoft|azure|linode|akamai|vultr|digitalocean|hetzner|ovh|choopa|datacamp|contabo|zenlayer|cogent|hurricane|hosting|datacenter|cloud|vps|server)\b/i.test(orgStr)||Boolean(cmExit.botManagement?.corporateProxy);
    ipa={ip:qIp,h:isHosting,px:false,m:false,isp:orgStr,as:cmExit.asn?'AS'+cmExit.asn:''};
  }
  if(!pure&&targetIp&&ipa&&(!ipa.ip||ipa.ip.toLowerCase()===String(targetIp).trim().toLowerCase())){
    const bmScore=Number(cmExit?.botManagement?.score);
    const bmCorp=Boolean(cmExit?.botManagement?.corporateProxy);
    let fallbackFs=ipa.px?65:(ipa.h||bmCorp?16:12);
    if(Number.isFinite(bmScore)&&bmScore>0&&bmScore<30&&!ipa.px)fallbackFs=Math.max(fallbackFs,Math.min(75,99-bmScore));
    pure={ip:String(targetIp).trim(),fs:fallbackFs,res:!ipa.h&&!ipa.px&&!bmCorp,bc:false,dc:!!(ipa.h||bmCorp),org:String(ipa.isp||'')};
  }
  if(qIp&&(pure||ipa)&&typeof opt?.onCacheRep==='function'){
    try{opt.onCacheRep(qIp,{pure,ipa});}catch{}
  }
  return {...(pure?{pure}:{}),...(ipa?{ipa}:{})};
}
// 直连检测单个 ProxyIP 连通性、真实落地出口 IP、国家地区与纯净度（通过 check.proxyip.cmliussss.net + 直连 IPPure/ip-api，全程 0 节点请求量）
async function checkProxyIpDirect(pip, ms=9000, signal=null, directFetch=null, opt=null) {
  const raw=String(pip||'').trim();
  if(!raw||/^(?:socks5?|https?|turn|sstp):\/\//i.test(raw))return null;
  if(isReservedOrFixtureTarget(raw, opt?.allowTestNet === true))return null;
  const hasPort=/:\d{1,5}$/.test(raw);
  const target=hasPort?raw:(raw.includes(':')&&!raw.startsWith('[')?`[${raw}]:443`:`${raw}:443`);
  const doFetch=typeof directFetch==='function'?directFetch:(typeof fetch==='function'?fetch:null);
  if(!doFetch)return null;
  const bases=['https://api.check.proxyip.cmliussss.net','https://check.proxyip.cmliussss.net'];
  for(const base of bases){
    if(signal?.aborted)return {cancelled:true};
    const ctl=new AbortController(),t0=Date.now(),tm=setTimeout(()=>ctl.abort(),Math.max(2500,Math.min(12000,ms)));
    const abort=()=>ctl.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{
      const r=await doFetch(base+'/check?proxyip='+encodeURIComponent(target),{
        method:'GET',
        signal:ctl.signal,
        cache:'no-store',
        redirect:'follow',
        headers:{'Accept':'application/json,*/*','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'},
      });
      if(!r?.ok)continue;
      const txt=(await r.text()).slice(0,32000);
      const j=JSON.parse(txt);
      if(!j||typeof j.success!=='boolean')continue;
      if(!j.success){
        const errMsg=String(j.probe_results?.ipv4?.error||j.probe_results?.ipv6?.error||j.message||j.error||'ProxyIP 不可用').slice(0,160);
        return {pip:raw,error:errMsg,status:0,brana:false,via:'direct-check'};
      }
      const v4=j.probe_results?.ipv4,v6=j.probe_results?.ipv6;
      const probe=(v4?.ok&&v4?.exit)?v4:(v6?.ok&&v6?.exit)?v6:null;
      const exit=probe?.exit||(Array.isArray(j.info)?j.info[0]:j.info)||{};
      const ip=String(exit.ip||j.ip||'').trim();
      const loc=String(exit.country||j.country||'').trim().toUpperCase();
      if(!ip)continue;
      const elapsed=Date.now()-t0;
      const netMs=Math.max(1,Math.round(Number(probe?.http_ms||probe?.connect_ms||j.responseTime||elapsed)));
      const coldMs=Math.max(netMs,Math.round(Number(j.responseTime||elapsed)));
      const leftMs=Math.max(1800,Math.min(4000,ms-(Date.now()-t0)));
      const pur=await purity(null,leftMs,signal,ip,{...(opt||{}),directFetch:doFetch,directIppure:true,cmliuExit:exit});
      return {pip:raw,ip,loc,ms:netMs,cold:coldMs,status:200,brana:true,via:'direct-check',...pur};
    }catch{
      if(signal?.aborted)return {cancelled:true};
    }finally{
      clearTimeout(tm);
      signal?.removeEventListener('abort',abort);
    }
  }
  return null;
}
async function checkService(ses, timeout=6500, opt=null) { const r=await checkService0(ses,timeout); if(r&&r.ok&&r.ip)Object.assign(r,await purity(ses,Math.min(3200,Math.max(50,timeout)),null,r.ip,opt)); return r; }
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
module.exports={ippure,ippureDirect,ipapi,purity,checkProxyIpDirect,signature,probeKey,serviceOK,realtimeOK,blocked,checkService,createProbe,createProofs,createApply};
