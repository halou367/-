/* Page/session ownership for fingerprint observations. This is NOT request authentication or identity proof. */
(function(root){
  'use strict';
  const SCHEMA='page-session/v1',CACHE_PREFIX='ati.v7.fp.';
  function session(value){
    if(typeof value!=='string')return null;
    const s=value.trim().toLowerCase();
    return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s)?s:null;
  }
  function sameSession(a,b){const x=session(a),y=session(b);return x!==null&&y!==null&&x===y;}
  function origin(value){
    if(typeof value!=='string')return null;
    try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;
      if(!/^(?:arena\.ai|lmarena\.ai)$/.test(u.hostname)&&!/(?:\.arena\.ai|\.lmarena\.ai)$/.test(u.hostname))return null;
      return u.origin;
    }catch(_){return null;}
  }
  function descriptor(engine){
    if(!engine||!Number.isSafeInteger(engine.version)||engine.version<6||engine.inputSchema!=='integer-list/v1')return null;
    if(typeof engine.CONFIDENT!=='number'||!Number.isFinite(engine.CONFIDENT)||engine.CONFIDENT<=0||engine.CONFIDENT>1)return null;
    return{version:engine.version,schema:engine.inputSchema,threshold:engine.CONFIDENT};
  }
  function bankMatch(result,engine){
    const d=descriptor(engine);
    return !!(d&&result&&result.ok===true&&typeof result.winnerKey==='string'&&result.winnerKey.trim()&&
      typeof result.winnerProb==='number'&&Number.isFinite(result.winnerProb)&&result.winnerProb>=d.threshold&&result.winnerProb<=1&&
      result.fpVerdict==='match'&&result.probabilityScope==='fingerprint-bank'&&result.identityVerified===false);
  }
  function cacheKey(sid){const s=session(sid);return s?CACHE_PREFIX+s:null;}
  function bind(result,context,engine){
    if(!context||context.source!=='page-dom'||!sameSession(context.targetSessionId,context.sourceSessionId)||!bankMatch(result,engine))return null;
    const site=origin(context.origin),d=descriptor(engine);if(!site)return null;
    return{...result,identityVerified:false,probeContext:{schema:SCHEMA,targetSessionId:session(context.targetSessionId),sourceSessionId:session(context.sourceSessionId),origin:site,source:'page-dom',engineVersion:d.version,parserSchema:d.schema,requestVerified:false}};
  }
  function isUsableLock(result,sid,site,engine){
    if(!bankMatch(result,engine))return false;
    const c=result.probeContext,d=descriptor(engine),expected=origin(site);
    return !!(c&&expected&&c.schema===SCHEMA&&c.source==='page-dom'&&c.requestVerified===false&&
      sameSession(c.targetSessionId,sid)&&sameSession(c.sourceSessionId,sid)&&origin(c.origin)===expected&&
      c.engineVersion===d.version&&c.parserSchema===d.schema);
  }
  const API=Object.freeze({SCHEMA,CACHE_PREFIX,session,sameSession,origin,cacheKey,bind,isUsableLock});
  root.ArenaProbeContext=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof self!=='undefined'?self:globalThis);
