'use strict';
const https=require('https'),net=require('net');
const cache=new Map();
const echCache=new Map();
// Last-resort built-in only. Cloudflare rotates ECH keys, so the live record is always preferred.
const DEFAULT_STATIC_ECH='AEX+DQBBmQAgACD7Shh1d6qs0wpKexZQye4mLOUQsE3TN9MW0nZe3I37bwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=';
const DEFAULT_ECH_DOMAIN='cloudflare-ech.com', DEFAULT_ECH_DOH='https://dns.alidns.com/dns-query';
const DEFAULT_ECH_SPEC=DEFAULT_ECH_DOMAIN+'+'+DEFAULT_ECH_DOH;
const ECH_OK_TTL=30*60000, ECH_FAIL_TTL=60000;
const echLastGood=new Map();
// Keys shipped by older builds; Cloudflare has rotated them, so they are upgraded to a live lookup.
const STALE_ECH=new Set(['AEX+DQBBrwAgACB3V6T2X69/mCGQn8NhU8fkBpvDcuxha8C+xpuUHFRPGQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=']);

const BOOT_DOH=['https://223.5.5.5/resolve','https://1.12.12.12/dns-query','https://120.53.53.53/dns-query','https://1.1.1.1/dns-query','https://8.8.8.8/resolve'];
async function resolveBootstrap(name){
  name=String(name||'').replace(/^\[|\]$/g,'');
  if(net.isIP(name))return [name];
  if(!/^[a-z0-9.-]{1,253}$/i.test(name))throw Error('Invalid proxy endpoint hostname');
  const old=cache.get(name);if(old&&old.until>Date.now())return old.ips;
  // Only proxy/node endpoints use this bootstrap resolver. Website destinations stay as domain names in the tunnel.
  // Several IP-literal encrypted resolvers raced (domestic first: some ISPs hijack 1.1.1.1). No system DNS fallback.
  const one=(base,type)=>new Promise((resolve,reject)=>{
    const req=https.get(base+'?name='+encodeURIComponent(name)+'&type='+type,{headers:{Accept:'application/dns-json'},timeout:5000,agent:false},res=>{
      let text='';res.on('data',chunk=>{text+=chunk;if(text.length>65536)req.destroy(Error('DNS response too large'));});res.on('error',reject);
      res.on('end',()=>{try{if(res.statusCode!==200)throw Error('Encrypted bootstrap DNS failed');const out=[];for(const row of JSON.parse(text).Answer||[])if([1,28].includes(row.type)&&net.isIP(row.data))out.push(row.data);resolve(out);}catch(e){reject(e);}});
    });req.on('timeout',()=>req.destroy(Error('Encrypted bootstrap DNS timeout')));req.on('error',reject);
  });
  const ask=async base=>{let v=await one(base,'A');if(!v.length)v=await one(base,'AAAA');if(!v.length)throw Error('empty');return v;};
  const ips=await Promise.any(BOOT_DOH.map(ask)).catch(()=>[]);
  if(!ips.length)throw Error('No proxy endpoint IP; refusing system-DNS fallback');
  cache.set(name,{ips,until:Date.now()+60000});if(cache.size>256)cache.delete(cache.keys().next().value);return ips;
}

// ECH spec forms accepted (all resolved here, xray only ever sees static Base64):
//   <base64>                          static config, used as-is
//   cloudflare-ech.com                ECH domain, default DoH
//   cloudflare-ech.com+https://doh/   ECH domain + DoH endpoint (any HTTPS DoH with JSON support)
//   https://doh/dns-query             DoH endpoint, default ECH domain
function parseEchSpec(raw){
  raw=String(raw||'').trim();
  if(!raw)return null;
  let domain='',doh='';
  const plus=raw.indexOf('+');
  if(raw.includes('://')){
    if(plus>0&&plus<raw.indexOf('://')){domain=raw.slice(0,plus).trim();doh=raw.slice(plus+1).trim();}
    else doh=raw;
  }else if(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(raw)&&!/[+/=]/.test(raw)&&/[a-z]/i.test(raw.split('.').pop())){domain=raw;}
  else return null; // static base64
  domain=(domain||DEFAULT_ECH_DOMAIN).toLowerCase();
  if(!/^[a-z0-9.-]{1,253}$/.test(domain))throw Error('ECH 域名不正确：'+domain);
  doh=doh||DEFAULT_ECH_DOH;
  let u;try{u=new URL(doh);}catch{throw Error('ECH DoH 地址不正确');}
  if(u.protocol!=='https:')throw Error('ECH DoH 只支持 https://');
  return {domain,doh:u.href};
}
function dohJsonUrls(domain,doh){
  const u=new URL(doh),q='name='+encodeURIComponent(domain)+'&type=HTTPS';
  const list=[];
  if(/(^|\.)alidns\.com$/i.test(u.hostname))list.push('https://'+u.host+'/resolve?'+q.replace('type=HTTPS','type=65'));
  else if(/(^|\.)dns\.google$/i.test(u.hostname))list.push('https://'+u.host+'/resolve?'+q);
  else list.push(u.origin+u.pathname+(u.search?u.search+'&':'?')+q);
  // Fallbacks keep ECH working if one resolver is blocked or rate-limited.
  for(const f of ['https://dns.alidns.com/resolve?'+q.replace('type=HTTPS','type=65'),'https://1.1.1.1/dns-query?'+q,'https://dns.google/resolve?'+q])if(!list.includes(f))list.push(f);
  return list;
}
function fetchEchOnce(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{Accept:'application/dns-json, application/json'},timeout:5000,agent:false},res=>{
      let text='';res.setEncoding('utf8');
      res.on('data',c=>{text+=c;if(text.length>65536)req.destroy(Error('DNS response too large'));});
      res.on('error',reject);
      res.on('end',()=>{
        try{
          if(res.statusCode!==200)throw Error('HTTP '+res.statusCode);
          const j=JSON.parse(text);
          for(const r of (j.Answer||[])){
            const m=/ech=\\?["']?([A-Za-z0-9+/=_-]{20,})/.exec(String(r.data||''));
            if(m)return resolve(m[1]);
          }
          reject(Error('no ech in HTTPS record'));
        }catch(e){reject(e);}
      });
    });
    req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',reject);
  });
}
async function resolveStaticEch(rawEch,fetcher=fetchEchOnce){
  rawEch=String(rawEch||'').trim();
  if(STALE_ECH.has(rawEch))rawEch=DEFAULT_ECH_SPEC;
  const spec=parseEchSpec(rawEch);
  if(!spec)return rawEch;
  const key=spec.domain+'+'+spec.doh;
  const cached=echCache.get(key);
  if(cached&&cached.until>Date.now())return cached.val;
  for(const url of dohJsonUrls(spec.domain,spec.doh)){
    try{
      const val=await fetcher(url);
      echCache.set(key,{val,until:Date.now()+ECH_OK_TTL});echLastGood.set(spec.domain,val);
      if(echCache.size>256)echCache.delete(echCache.keys().next().value);
      return val;
    }catch{}
  }
  const fallback=echLastGood.get(spec.domain)||(spec.domain===DEFAULT_ECH_DOMAIN?DEFAULT_STATIC_ECH:'');
  if(!fallback)throw Error('无法获取 '+spec.domain+' 的 ECH 配置（DoH 均失败）');
  echCache.set(key,{val:fallback,until:Date.now()+ECH_FAIL_TTL});
  return fallback;
}

async function protectConfig(config,resolve=resolveBootstrap){
  const names=new Set();
  for(const ob of config.outbounds||[]){
    if(['freedom','blackhole','dns'].includes(ob.protocol))continue;
    const st=ob.settings||{};
    for(const x of [...(st.vnext||[]),...(st.servers||[]),st])if(x.address&&!net.isIP(x.address))names.add(x.address);
    const stream=ob.streamSettings||=( {} );stream.sockopt={...stream.sockopt,domainStrategy:'UseIP'};
    if(stream.tlsSettings?.echConfigList){
      stream.tlsSettings.echConfigList=await resolveStaticEch(stream.tlsSettings.echConfigList);
    }
  }
  const hosts={};for(const name of names)hosts[name]=await resolve(name);
  config.dns={hosts,servers:[],disableFallback:true};
  config.routing={...config.routing,domainStrategy:'AsIs'};
  return config;
}
// ProxyIP 域名解析：全部走直连的加密 DNS（Node https 不经过系统代理 / 本机代理），各解析器结果合并；
// 都失败才用系统 DNS，并丢掉 Clash fake-ip（198.18/15）。返回 IPv4 列表。
async function resolveAll(name){
  name=String(name||'').trim().replace(/^\[|\]$/g,'');
  if(net.isIPv4(name))return [name];
  if(!/^[a-z0-9.-]{1,253}$/i.test(name))throw Error('域名格式不正确');
  const urls=['https://223.5.5.5/resolve','https://1.12.12.12/dns-query','https://120.53.53.53/dns-query','https://1.1.1.1/dns-query','https://8.8.8.8/resolve'];
  const one=base=>new Promise(resolve=>{
    const req=https.get(base+'?name='+encodeURIComponent(name)+'&type=A',{headers:{Accept:'application/dns-json'},timeout:5000,agent:false},res=>{
      let text='';res.on('data',c=>{text+=c;if(text.length>262144)req.destroy();});res.on('error',()=>resolve(null));
      res.on('end',()=>{try{if(res.statusCode!==200)return resolve(null);const j=JSON.parse(text);if(j.Status!==0&&j.Status!==3)return resolve(null);resolve((j.Answer||[]).filter(r=>r.type===1&&net.isIPv4(r.data)).map(r=>r.data));}catch{resolve(null);}});
    });req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(null));
  });
  // 第一个解析器返回后再等 1.2 秒收集其他结果（合并更多 IP），不等超时的
  const got=await new Promise(done=>{const out=[];let left=urls.length,timer=null;const fin=()=>{clearTimeout(timer);done(out.slice());};
    for(const u of urls)one(u).then(v=>{if(v){out.push(v);if(!timer)timer=setTimeout(fin,1200);}if(--left===0)fin();});});
  const fake=ip=>/^198\.1[89]\./.test(ip);
  let ips=[...new Set(got.flat())].filter(ip=>!fake(ip));
  if(!got.length){try{ips=(await require('dns').promises.resolve4(name)).filter(ip=>!fake(ip));}catch{ips=[];}}
  return ips;
}
module.exports={resolveAll,resolveBootstrap,resolveStaticEch,parseEchSpec,DEFAULT_STATIC_ECH,DEFAULT_ECH_SPEC,protectConfig};
