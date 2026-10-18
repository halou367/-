'use strict';
const fs=require('fs'),path=require('path');
const REGIONS=require('../ui/region-environments.json');
const LOCKDOWN=fs.readFileSync(path.join(__dirname,'../ui/rtc-lockdown.js'),'utf8');
const canonical=zone=>{if(typeof zone!=='string'||!zone.trim())return '';try{return new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone;}catch{return '';}};
function profile(account={}){
  // A configured region wins over possibly stale account-status caches. Never infer a city from a country code.
  const country=String(account.region||'').toUpperCase(),r=REGIONS[country];
  if(!r)return {country,locale:'',timezone:'',languages:[],approximate:true,warning:'未绑定受支持地区，沿用系统时区/语言；不能声称已与出口一致'};
  const requested=canonical(account.fp?.timezone),zones=r.zones.map(canonical);
  const chosen=requested&&zones.includes(requested)?requested:'';
  const timezone=chosen||canonical(r.timezone);
  const languages=[r.locale,...new Set([r.locale.split('-')[0]])].filter((x,i,a)=>a.indexOf(x)===i);
  return {country,locale:r.locale,timezone,languages,approximate:r.zones.length>1&&!chosen,warning:r.zones.length>1&&!chosen?'多时区国家：使用地区默认时区，不代表已识别出口城市':''};
}
function chromiumSwitches(app){
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy','disable_non_proxied_udp');
  app.commandLine.appendSwitch('dns-prefetch-disable');
  app.commandLine.appendSwitch('blink-settings','dnsPrefetchingEnabled=false');
  app.commandLine.appendSwitch('disable-quic');
}
function secureResolver(app){app.configureHostResolver({enableBuiltInResolver:true,secureDnsMode:'secure',secureDnsServers:['https://1.1.1.1/dns-query']});}
function browserArgs(proxy){
  const args=['--force-webrtc-ip-handling-policy=disable_non_proxied_udp','--dns-prefetch-disable','--blink-settings=dnsPrefetchingEnabled=false','--disable-quic'];
  if(proxy?.mode!=='direct'){
    if(!proxy?.rules||proxy.pac)throw Error('登录浏览器必须使用单一账号代理，禁止 PAC/隐式直连');
    const host=new URL(proxy.rules).hostname;
    if(!/^[\w.:[\]-]+$/.test(host))throw Error('代理主机格式无效');
    args.push('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE '+host);
  }
  return args;
}
function localeScript(languages){
  // OOPIF startup fallback; native CDP still controls Intl/Date and request headers.
  // Restoring the original getter matters when leaving a configured region.
  return '('+function(values){
    const proto=Navigator.prototype,slot=Symbol.for('brana.privacy.locale');
    if(!proto[slot])Object.defineProperty(proto,slot,{value:Object.freeze({language:Object.getOwnPropertyDescriptor(proto,'language'),languages:Object.getOwnPropertyDescriptor(proto,'languages')})});
    const list=Object.freeze(values.slice());
    for(const [key,value]of [['language',list[0]],['languages',list]]){
      if(!list.length){const d=proto[slot][key];if(d)Object.defineProperty(proto,key,d);else delete proto[key];}
      else Object.defineProperty(proto,key,{get:()=>value,configurable:true,enumerable:true});
    }
  }.toString()+')('+JSON.stringify(languages)+');';
}
// Chromium keeps the time zone / locale override per renderer process, not per frame. Two cross-origin frames of the same
// site (reCAPTCHA anchor + bframe, both on google.com) share one process, so the second target is refused with
// "... override is already in effect". That is not a failure: the first frame already applied the very same override.
const ALREADY=/override is already in effect/i;
const tolerate=error=>{if(!ALREADY.test(String(error?.message||error)))throw error;};
async function applyRegion(send,p){
  await send('Emulation.setTimezoneOverride',{timezoneId:p.timezone||''}).catch(tolerate);
  await send('Emulation.setLocaleOverride',{locale:p.locale||''}).catch(tolerate);
}
async function configure(send,p,{worker=false,metadata={},ua=''}={}){
  const override={...metadata,...(ua?{userAgent:ua}:{}),...(p.languages.length?{acceptLanguage:p.languages.join(',')}:{})};
  if(!worker)await applyRegion(send,p);
  if(override.userAgent)await send(worker?'Network.setUserAgentOverride':'Emulation.setUserAgentOverride',override);
  if(worker){
    // Chromium workers normally inherit renderer timezone; unsupported CDP emulation is not misreported as success.
    if(p.timezone)await send('Emulation.setTimezoneOverride',{timezoneId:p.timezone}).catch(()=>{});
    return;
  }
  await send('Page.enable');
  // Empty overrides restore system values when an account leaves its bound region.
  const script=await send('Page.addScriptToEvaluateOnNewDocument',{source:LOCKDOWN+'\n'+localeScript(p.languages)});
  await send('Runtime.evaluate',{expression:localeScript(p.languages)}).catch(error=>{if(!/Cannot find (?:default execution )?context|Execution context was destroyed/i.test(error.message))throw error;});
  return script?.identifier;
}
module.exports={REGIONS,LOCKDOWN,canonical,profile,chromiumSwitches,secureResolver,browserArgs,configure,applyRegion,ALREADY};
