// Shared by live UI and offline recovery. No messages, login or account creation here.
const RoutePolicy = (() => {
  const State = typeof RouteState !== 'undefined' ? RouteState : require('./route-state');
  const ports = [7890,18080,7897,10809,10808,17890,7891,7893,1080,2080,20171,8889];
  const fields = a => ({ proxy: String(a?.proxy || ''), proxyIp: String(a?.proxyIp || ''), nodeId: String(a?.nodeId || ''), region: String(a?.region || '') });
  const key = a => JSON.stringify(fields(a));
  const transportError = e => !e?.responseFormat && (!e?.status ? e?.name !== 'AbortError' || !!e?.routeTimeout : [408,502,503,504].includes(+e.status));
  // 限流(429) / 超时 / 401 / 403 / 404 / 5xx / 任何连接报错 → 立即触发秒切 IP / 节点
  const shouldRotateOnError = e => {
    if (!e || e.authLocked || e.rateLimitedLocally) return false;
    const st = Number(e.status || e.httpStatus || 0);
    if ([401, 403, 404, 408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(st)) return true;
    if (e.ipLimited || e.routeTimeout || e.net) return true;
    return transportError(e);
  };
  const good = r => !!(r?.ok && r.ip && (r.service && r.realtime || r.scope === 'website' && r.website === true));
  // 不同账号不共用同一个 IP：ProxyIP、去端口的 IP、检测到的出口 IP（e.eg）都算占用
  const hostOf = v => { v=String(v||'').trim().toLowerCase(); return v[0]==='['?v.slice(0,v.indexOf(']')+1):(v.match(/:/g)||[]).length===1?v.split(':')[0]:v; };
  function takenIps(accounts,exceptId,pool) {
    const owned=new Set(),ips=pool.ips||{};
    for(const x of accounts||[]){if(!x||x.id===exceptId)continue;const k=String(x.proxyIp||'').trim().toLowerCase();if(!k)continue;owned.add(k);owned.add(hostOf(k));const ent=Object.keys(ips).find(q=>q.toLowerCase()===k),eg=ent&&ips[ent]?.eg;if(eg)owned.add(String(eg).toLowerCase());}
    return {has:(k,e)=>owned.has(String(k).toLowerCase())||owned.has(hostOf(k))||!!(e?.eg&&owned.has(String(e.eg).toLowerCase()))};
  }
  const isIpLit = v => { const s = String(v || '').trim().replace(/^\[|\]$/g, ''); return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) || (/^[0-9a-f:]+$/i.test(s) && s.includes(':')); };
  const normIp = v => { const s = String(v || '').trim().replace(/^\[|\]$/g, ''); return isIpLit(s) ? s : ''; };
  // 检测时经同一条隧道刚测到的纯净度（IPPure fs）先并进来：以前只看池里已存的评分，刚测出纯净的出口也会因为「还没评估」被拒，
  // 于是明明能用的节点在恢复时全被判「未通过」
  function withProbe(pool,r){
    const ip = normIp(r?.ip);
    if (!ip) return pool;
    const fs = +r?.pure?.fs;
    const old = pool.rep?.[ip] || {};
    const nextRep = { ...old };
    let changed = false;
    if (Number.isFinite(fs)) {
      nextRep.pu = { ...(old.pu || {}), fs, res: !!r?.pure?.res, bc: !!r?.pure?.bc, dc: !!r?.pure?.dc };
      changed = true;
    }
    if (r?.ipa && typeof r.ipa === 'object') {
      Object.assign(nextRep, { a: Date.now(), h: !!r.ipa.h, px: !!r.ipa.px, m: !!r.ipa.m, isp: String(r.ipa.isp || '').slice(0, 40) });
      changed = true;
    }
    if (!changed) return pool;
    const repView = Object.create(pool.rep || null);
    repView[ip] = nextRep;
    return { ...pool, rep: repView };
  }
  function evalRep(pool, k, e, at) {
    if (pool.trust?.[String(k).toLowerCase()]) return { ok: true, score: 100, rank: 5 };
    const hRaw = hostOf(k).replace(/^\[|\]$/g, '');
    const hIp = normIp(hRaw) || (/^\d+\.\d+\.\d+\.\d+/.exec(k) || [])[0] || '';
    const egIp = normIp(e?.eg) || hIp;
    if (!egIp) {
      const sym = Boolean(String(k || '').trim()) && !/[.:]/.test(String(k || ''));
      return { ok: sym, score: sym ? 90 : 0, rank: sym ? 3 : 0 };
    }
    const rEg = pool.rep?.[egIp] || null;
    const rHost = hIp && hIp !== egIp ? (pool.rep?.[hIp] || null) : null;
    const isRealPu = x => Boolean(x && !x.basicOnly && (x.via === 'ippure' || (x.real && (x.res || ![6, 8, 10, 12, 14, 15, 16, 22, 28, 35].includes(+x.fs))) || (!x.real && ![8, 12, 14, 15, 16, 22, 28, 35].includes(+x.fs))));
    const mergePu = (a, b) => {
      if (!a || !b) return a || b;
      const aReal = isRealPu(a);
      const bReal = isRealPu(b);
      if (aReal !== bReal) return aReal ? a : b;
      return (+b.fs > +a.fs)
        ? { ...a, ...b, fs: +b.fs, dc: Boolean(a.dc || b.dc), bc: Boolean(a.bc || b.bc) }
        : { ...b, ...a, fs: +a.fs, dc: Boolean(a.dc || b.dc), bc: Boolean(a.bc || b.bc) };
    };
    const p = (rEg && rHost) ? {
      ...rHost,
      ...rEg,
      pu: mergePu(rEg.pu, rHost.pu),
      a: rEg.a || rHost.a,
      c: rEg.c || rHost.c,
      r: Math.max(+rEg.r || 0, +rHost.r || 0),
      px: Boolean(rEg.px || rHost.px),
      h: Boolean(rEg.h || rHost.h),
      m: Boolean(rEg.m || rHost.m),
      pp: Boolean(rEg.pp || rHost.pp),
      pt: rEg.pt || rHost.pt || '',
      isp: rEg.isp || rHost.isp || '',
    } : (rEg || rHost || {});
    const q = pool.rq?.[egIp] || (hIp ? pool.rq?.[hIp] : null);
    const hasPu = Boolean(p.pu && Number.isFinite(+p.pu.fs));
    const isCloudIsp = /\b(?:akile|akilecloud|dromatics|akamai|linode|digitalocean|vultr|constant company|choopa|hetzner|ovh|oracle|amazon|aws|google cloud|microsoft|azure|cloudflare|alibaba|aliyun|tencent|aceville|\bace\b|6 collyer quay|huawei|contabo|fornex|ionos|kagoya|webhorizon|cyberverse|brainoza|eurohoster|virterion|kaopu|light\s*node|scaleway|leaseweb|m247|datacamp|cdn77|zenlayer|dmit|veesp|trabia|baxet|waicore|trunk networks|hostkey|timeweb|racknerd|hostpapa|alphavps|livi hosting|terratransit|rocketcloud|datawave|yeahtech|yeah\s*tech|ipxo|sondercloud|netcup|a2b|gcore|ufovps|packethub|psychz|sharktech|quadranet|colocrossing|frantech|buyvm|worldstream|cherry\s*servers|latitude|equinix|kamatera|upcloud|hosting|hoster|datacenter|data\s*center|server|vps|cloud|colocation|dedicated)\b/i.test((p.isp || '') + ' ' + (p.pu?.org || ''));
    const isHosting = Boolean(p.h || p.pu?.dc || isCloudIsp);
    const hasCleanPu = Boolean(hasPu && +p.pu.fs < 20 && p.pu.res === true && !p.pu.dc && !p.pu.bc && !isHosting && !p.pp && (+p.r || 0) < 33);
    let score = 100, known = false;
    if (p.a) { known = true; if (p.px && !hasCleanPu) { score -= 35; if (isHosting) score -= 15; } if (isHosting && !hasCleanPu) score -= 8; }
    if (p.c) { known = true; const risk = Math.max(0, Math.min(100, +p.r || 0)); if (risk > 33) { const pen = Math.round((risk - 33) * .9); score -= hasCleanPu && risk <= 75 ? Math.min(10, pen) : pen; } if (!(hasCleanPu && risk <= 75)) { if (p.pp && /tor|compromised|socks|http|inference|proxy/i.test(p.pt || '')) score -= 25; else if (p.pp) score -= 20; } }
    if ((egIp.includes(':') || isHosting || p.px) && !hasPu && !p.c) { known = false; score = Math.min(score, 68); }
    if ((egIp.includes(':') || isHosting || p.px) && !hasPu && p.c && (+p.r || 0) < 50 && !p.pp) { known = false; score = Math.min(score, 68); }
    if (hasPu) {
      known = true;
      const fs = +p.pu.fs;
      score = Math.min(score, 99 - fs);
      if (p.pu.dc && p.pu.bc) score -= 8;
      else if (p.pu.res && fs < 25 && !p.px) score = Math.min(100, score + 5);
      const unverifiedFallback = Boolean(p.pu.basicOnly || (!p.pu.real && [8, 12, 14, 15, 16, 22, 28, 35].includes(fs)) || (p.pu.real && !p.pu.via && !p.pu.res && [6, 10, 14, 15, 16].includes(fs)));
      if (unverifiedFallback && fs < 50 && score >= 50 && (egIp.includes(':') || isHosting || p.px || p.pu.dc || p.pu.bc)) {
        known = false;
        score = Math.min(score, 68);
      }
    }
    if (q) {
      const rcAge = at - (q.rcAt || q.at || 0);
      const effRc = rcAge > 6 * 3600000 ? 0 : rcAge > 2 * 3600000 ? Math.floor((q.rc || 0) / 2) : (q.rc || 0);
      const okCnt = q.ok || 0, n = okCnt + effRc;
      const recentPass = Boolean(q.passAt && q.passAt > (q.rcAt || 0) && (at - q.passAt < 6 * 3600000) && okCnt >= 1);
      if (n >= 3) {
        known = true;
        let best = 1;
        const rqObj = pool.rq || {};
        for (const other in rqObj) {
          if (other === egIp) continue;
          const v = rqObj[other]; if (!v) continue;
          const vn = (v.ok || 0) + (v.rc || 0);
          if (vn >= 3) { const rRate = (v.rc || 0) / vn; if (rRate < best) best = rRate; }
        }
        const rawPen = Math.max(0, Math.round((effRc / n - Math.min(.5, best)) * 65));
        score -= recentPass ? Math.round(rawPen * 0.4) : rawPen;
        if (!effRc && okCnt >= 3) score += 6;
      } else if (effRc >= 1) {
        known = true;
        score -= (effRc >= 2 && !okCnt ? 35 : (recentPass ? 8 : 20));
      }
      if (recentPass) score = Math.min(100, score + 8);
      const lAge = at - (q.lt || 0);
      const effL = lAge > 2 * 3600000 ? 0 : lAge > 45 * 60000 ? Math.floor((q.l || 0) / 2) : (q.l || 0);
      if (effL > 0) score -= Math.min(18, effL * 5);
    }
    const subParts = egIp.includes('.') ? egIp.split('.').slice(0, 3).join('.') : egIp.includes(':') ? egIp.split(':').slice(0, 4).join(':') : '';
    const subHot = Boolean(subParts && pool.subCool?.[subParts] > at);
    if (subHot) score -= 12;
    const ok = Boolean(known && score >= 75);
    const passBonus = Boolean(q?.passAt && q.passAt > (q.rcAt || 0) && (at - q.passAt < 6 * 3600000)) ? 1.35 : 0;
    const kindTier = p.pu?.res && !isHosting && !p.pu?.bc ? 2 : (isHosting || p.pu?.dc ? 0 : 1);
    const rank = !ok ? 0 : Math.max(1.1, 2 + kindTier + Math.max(0, Math.min(1, (score - 75) / 25)) + passBonus - (subHot ? 1.15 : 0));
    return { ok, score, rank, isRes: Boolean(p.pu?.res && !isHosting), recentPass: passBonus > 0, subHot };
  }
  function reputationOK(pool, k, e, at) {
    return evalRep(pool, k, e, at).ok; // 只用已评估且纯净（≥75 分，与 IPRep.PURE 一致）的出口；未评估的不用
  }
  function candidates({ account:a, nodes=[], pool={}, accounts=[] }, link, at, cursor=0) {
    const owned = takenIps(accounts,a.id,pool);
    const occupiedRegions = new Set(accounts.filter(x=>x.id!==a.id&&/^vless:/i.test(x.proxy||'')).map(x=>x.region).filter(Boolean));
    const home = a.region || a.routeHome || '';
    const ips = Object.entries(pool.ips||{}).filter(([k,e])=>e&&!e.gone&&!pool.ban?.[k.toLowerCase()]&&!owned.has(k,e)&&!(e.cool>at)&&e.ok!==false&&reputationOK(pool,k,e,at));
    ips.sort((x,y)=>{
      const rx = evalRep(pool,x[0],x[1],at), ry = evalRep(pool,y[0],y[1],at);
      if ((ry.isRes?1:0) !== (rx.isRes?1:0)) return (ry.isRes?1:0) - (rx.isRes?1:0);
      return (x[1].ms||99999)-(y[1].ms||99999) || (ry.rank - rx.rank);
    });
    const ns = nodes.filter(n=>n&&n.id).map(n=>({id:n.id,proxy:link(n)})).filter(n=>/^vless:\/\//i.test(n.proxy));
    if (/^vless:/i.test(a.proxy||'')&&!ns.some(n=>n.proxy===a.proxy)) ns.unshift({id:a.nodeId||'',proxy:a.proxy});
    if (ns.length) { const offset=cursor%ns.length; ns.push(...ns.splice(0,offset)); }
    const same=[], other=[], seen=new Set([key(a)]);
    const add=(box,n,k,e)=>{const c={proxy:n.proxy,proxyIp:k,nodeId:n.id,region:e.loc||'',kind:'node'};const sig=key(c);if(!seen.has(sig)){seen.add(sig);box.push(c);}};
    const local=ips.filter(([,e])=>e.loc===home), away=ips.filter(([,e])=>e.loc!==home&&!occupiedRegions.has(e.loc));
    // Interleave nodes before adding more exits, so one large node cannot consume the whole budget.
    for(let round=0;round<3;round++)for(const n of ns){
      if(local[round])add(same,n,...local[round]);
      if(away[round])add(other,n,...away[round]);
      if(round===0&&(!ips.length||/\/video\//i.test(n.proxy)))add(other,n,'',{loc:''}); // Only use bare node exit when no pure ProxyIPs exist or node is /video/ chain.
    }
    return { same:same.slice(0,8), other:other.slice(0,8), home, occupiedRegions };
  }
  class Engine {
    constructor(io) { this.io=io;this.job=null;this.next=0;this.cursor=0;this.health=new Map();this.recentIps=new Map();this.failures=0;this.netProblemCount=0;this.last=''; }
    run(reason='network', force=false) {
      if(this.job)return this.job;
      if(!force&&this.now()<this.next)return Promise.resolve({ok:false,cooldown:true});
      this.job=this.recover(reason).catch(e=>({ok:false,error:String(e.message||e)})).finally(()=>{this.job=null;this.next=Math.max(this.next,this.now()+15000);});return this.job;
    }
    now(){return this.io.now?this.io.now():Date.now();}
    mark(c,r){const k=key(c),old=this.health.get(k)||{};this.health.set(k,good(r)?{ms:r.ms||999,fail:0,until:0}:{ms:old.ms||9999,fail:(old.fail||0)+1,until:this.now()+Math.min(300000,15000*2**Math.min(old.fail||0,4))});if(this.health.size>128)this.health.delete(this.health.keys().next().value);}
    async probe(c,force=false){if(!force&&(this.health.get(key(c))?.until||0)>this.now())return null;let r;try{r=await this.io.probe(c);}catch(e){r={kind:e.kind||'network',error:String(e.message||e)};}this.mark(c,r);return r;}
    wait(ms){return this.io.sleep?this.io.sleep(ms):new Promise(r=>setTimeout(r,ms));}
    // Policy (user-defined):
    //  * A reachable route is NEVER replaced because it is slow, jittery or "could be faster".
    //  * Network failure (current route fails the service check twice) = node problem → switch node, KEEP the ProxyIP.
    //  * HTTP 429 / timeout / 401 / 403 / 404 / connection error = switch exit IP / node immediately (hot standby first, then parallel probe).
    plan(first,mode,at){
      const a=first.account,home=a.region||a.routeHome||'',ns=(first.nodes||[]).filter(n=>n&&n.id).map(n=>({id:n.id,proxy:this.io.link(n)})).filter(n=>/^vless:\/\//i.test(n.proxy));
      const owned=takenIps(first.accounts,a.id,first.pool||{});
      const occupied=new Set((first.accounts||[]).filter(x=>x.id!==a.id&&/^vless:/i.test(x.proxy||'')).map(x=>x.region).filter(Boolean));
      const pool=first.pool||{},cur=String(a.proxyIp||'').toLowerCase();
      const forceGlobalLowest=Boolean(this.io.forceGlobalLowestLatency?.());
      const baseEntries=Object.entries(pool.ips||{}).filter(([k,e])=>e&&!e.gone&&k.toLowerCase()!==cur&&!pool.ban?.[k.toLowerCase()]&&!owned.has(k,e)&&!(e.cool>at)&&e.ok!==false&&reputationOK(pool,k,e,at));
      const nonRecentEntries=baseEntries.filter(([k])=>!((this.recentIps?.get(k.toLowerCase())||0)>at));
      const activeEntries=nonRecentEntries.length?nonRecentEntries:baseEntries;
      // 优先同地区、家宽/高纯净分、故障少、最久未使用的可用纯净 IP 并按游标轮换
      const ips=activeEntries.slice().sort((x,y)=>{
        const locDiff = (y[1].loc===home?1:0)-(x[1].loc===home?1:0);
        if (locDiff) return locDiff;
        const rx = evalRep(pool,x[0],x[1],at), ry = evalRep(pool,y[0],y[1],at);
        if ((ry.isRes?1:0) !== (rx.isRes?1:0)) return (ry.isRes?1:0) - (rx.isRes?1:0);
        if (Math.abs(ry.score - rx.score) >= 5) return ry.score - rx.score;
        return ((x[1].fc||0)-(y[1].fc||0))||((x[1].used||0)-(y[1].used||0));
      });
      const globalLowestIps=activeEntries.slice().sort((x,y)=>{
        const rx = evalRep(pool,x[0],x[1],at), ry = evalRep(pool,y[0],y[1],at);
        if ((ry.isRes?1:0) !== (rx.isRes?1:0)) return (ry.isRes?1:0) - (rx.isRes?1:0);
        return (x[1].ms||99999)-(y[1].ms||99999) || (ry.rank - rx.rank);
      });
      const seen=new Set([key(a)]),uniq=list=>list.filter(c=>{const k=key(c);if(seen.has(k))return false;seen.add(k);return true;});
      const local=ips.filter(([,e])=>e.loc===home);
      if(local.length>1&&this.cursor>0){const off=this.cursor%local.length;local.push(...local.splice(0,off));}
      const allowCross=Boolean(this.io.allowCrossRegionEscape&&(a.routeMode!=='node'||first.forceCrossRegion));
      const awayFree=ips.filter(([,e])=>e.loc&&e.loc!==home&&!occupied.has(e.loc));
      const awayAll=ips.filter(([,e])=>e.loc&&e.loc!==home);
      const away=a.routeMode==='node'&&!first.forceCrossRegion?[]:(awayFree.length?awayFree:(allowCross?awayAll:[]));
      if(away.length>1&&this.cursor>0){const off=this.cursor%away.length;away.push(...away.splice(0,off));}
      const rotIps=[...local,...away];
      const viaNode=(n,[k,e],extra={})=>({proxy:n.proxy,proxyIp:k,nodeId:n.id,region:e.loc||'',kind:'node',...(e.loc&&e.loc!==home?{crossRegion:true}:{}),...extra});
      const others=ns.filter(n=>n.proxy!==a.proxy&&!(a.nodeId&&n.id===a.nodeId));   // 同一节点的链接文本可能不同（名字参数等）：按 id 也排除
      if(ns.length>1){const off=this.cursor%others.length||0;others.push(...others.splice(0,off));}
      // 有节点测速结果（generate_204 并发测速）：最快的通的节点排最前，测过不通的排最后——不再按订阅顺序一个个试；无测速时优先 IPv4 节点（避免无 IPv6 网络先卡在 IPv6 节点）
      if(this.io.speed&&others.length>1){const sc=n=>{let r=null;try{r=this.io.speed(n);}catch{}return r?.ok?Math.max(1,+r.ms||1):r?1e9:(this.io.allowCrossRegionEscape&&/@\[/.test(n.proxy||'')?1e8+1000:1e8);};const w=new Map(others.map(n=>[n,sc(n)]));others.sort((x,y)=>w.get(x)-w.get(y));}
      else if(this.io.allowCrossRegionEscape&&others.length>1){others.sort((x,y)=>(/@\[/.test(x.proxy||'')?1:0)-(/@\[/.test(y.proxy||'')?1:0));}
      const curNode=/^vless:/i.test(a.proxy||'')?{id:a.nodeId||'',proxy:a.proxy}:null;
      const curNodeBad=Boolean(this.io.networkFirst&&curNode&&this.io.speed&&(()=>{try{return this.io.speed(curNode)?.ok===false;}catch{return false;}})());
      const globalLowestStage=forceGlobalLowest&&(curNode||others[0])?uniq(globalLowestIps.slice(0,8).map(x=>viaNode((!curNodeBad&&curNode)||others[0]||curNode,x))):null;
      const netFirstList=this.io.networkFirst&&curNode?uniq(rotIps.slice(0,4).map(x=>viaNode(curNode,x))):null;
      const bestOtherNodeIps=this.io.networkFirst?uniq(others.slice(0,4).flatMap(n=>rotIps.slice(0,2).map(x=>viaNode(n,x)))):null;
      const bareNodeList=this.io.allowCrossRegionEscape?uniq([...(curNode&&!curNodeBad?[curNode]:[]),...others,...(curNode&&curNodeBad?[curNode]:[])].slice(0,6).map(n=>({proxy:n.proxy,nodeId:n.id,proxyIp:'',region:'',kind:'node',nativeFallback:true}))):[];
      if(mode==='ip'){
        if(!curNode&&!bareNodeList.length)return {stages:[],home,occupied,noIp:true};
        return {home,occupied,stages:[
          ...(globalLowestStage?.length?[['全库最低延迟可用纯净 ProxyIP',globalLowestStage]]:[]),
          ...(curNodeBad&&bestOtherNodeIps?.length?[['其他可用节点 + 纯净 ProxyIP',bestOtherNodeIps]]:[]),
          ...(netFirstList&&netFirstList.length?[['同地区可用纯净 ProxyIP',netFirstList]]:[]),
          ...(!curNodeBad&&bestOtherNodeIps?.length?[['其他可用节点 + 纯净 ProxyIP',bestOtherNodeIps]]:[]),
          ...(curNode?[['同地区其他 ProxyIP',uniq(local.slice(0,8).map(x=>viaNode(curNode,x)))]]:[]),
          ...(curNode&&away.length?[['其他地区 ProxyIP',uniq(away.slice(0,6).map(x=>viaNode(curNode,x,{crossRegion:true})))]]:[]),
          ['其他节点 + 新 ProxyIP',uniq(others.slice(0,4).flatMap(n=>local.slice(0,2).map(x=>viaNode(n,x))))],
          ...(allowCross&&away.length?[['其他节点 + 跨地区 ProxyIP',uniq(others.slice(0,4).flatMap(n=>away.slice(0,3).map(x=>viaNode(n,x,{crossRegion:true}))))]]:[]),
          // 自动模式、且池中确实没有可用纯净 ProxyIP 时：才退回试裸节点
          ...(State.mode(a)==='auto'&&!rotIps.length?[['其他节点（出口随节点变化）',uniq(others.slice(0,6).map(n=>({proxy:n.proxy,nodeId:n.id,proxyIp:a.proxyIp||'',region:a.region||home,kind:'node'})))]]:[]),
          ...(bareNodeList.length?[['节点自身代理兜底（无可用 ProxyIP）',bareNodeList]]:[]),
        ]};
      }
      const keep={proxyIp:a.proxyIp||'',region:a.region||home};
      const curIpEntry=a.proxyIp?pool.ips?.[a.proxyIp]:null;
      const curIpBad=Boolean((!a.proxyIp&&rotIps.length>0&&!/\/video\//i.test(a.proxy||''))||(a.proxyIp&&(pool.ban?.[cur]||curIpEntry?.gone||curIpEntry?.banned||(curIpEntry&&!reputationOK(pool,a.proxyIp,curIpEntry,at))||(this.io.networkFirst&&(curIpEntry?.cool>at||curIpEntry?.ok===false)))));
      // 节点模式：优先同地区；开启 allowCrossRegionEscape 时，若同地区全部超时/失败，最后自动逃逸到可连通的其他地区（避免死胡同）
      if(State.mode(a)==='node')return {home,occupied,stages:[
        ...(globalLowestStage?.length?[['全库最低延迟可用纯净 ProxyIP',globalLowestStage]]:[]),
        ...(!curIpBad?[['其他节点（固定地区和 ProxyIP）',uniq(others.slice(0,8).map(n=>({proxy:n.proxy,nodeId:n.id,...keep,kind:'node'})))]]:[]),
        ...(!curNodeBad&&curNode?[['当前节点 + 同地区其他 ProxyIP',uniq(local.slice(0,6).map(x=>viaNode(curNode,x)))]]:[]),
        ['其他节点 + 同地区其他 ProxyIP',uniq(others.slice(0,4).flatMap(n=>local.slice(0,2).map(x=>viaNode(n,x))))],
        ...(curNodeBad&&curNode?[['当前节点 + 同地区其他 ProxyIP',uniq(local.slice(0,6).map(x=>viaNode(curNode,x)))]]:[]),
        ...(allowCross&&away.length?[
          ['当前节点 + 跨地区可用 ProxyIP',curNode?uniq(away.slice(0,6).map(x=>viaNode(curNode,x,{crossRegion:true}))):[]],
          ['其他节点 + 跨地区可用 ProxyIP',uniq(others.slice(0,4).flatMap(n=>away.slice(0,3).map(x=>viaNode(n,x,{crossRegion:true}))))],
        ]:[]),
        ...(curIpBad&&a.proxyIp&&!pool.ban?.[cur]&&!curIpEntry?.gone?[['其他节点（固定地区和 ProxyIP）',uniq(others.slice(0,8).map(n=>({proxy:n.proxy,nodeId:n.id,...keep,kind:'node'})))]]:[]),
        ...(bareNodeList.length?[['节点自身代理兜底（无可用 ProxyIP）',bareNodeList]]:[]),
      ]};
      return {home,occupied,stages:[
        ...(globalLowestStage?.length?[['全库最低延迟可用纯净 ProxyIP',globalLowestStage]]:[]),
        ...(netFirstList&&netFirstList.length?[['当前节点 + 同地区可用 ProxyIP',netFirstList.slice(0,6)]]:[]),
        ...(!curIpBad?[['其他节点（保留当前 ProxyIP）',uniq(others.slice(0,8).map(n=>({proxy:n.proxy,nodeId:n.id,...keep,kind:'node'})))]]:[]),
        ['其他节点 + 同地区 ProxyIP',uniq(others.slice(0,4).flatMap(n=>local.slice(0,2).map(x=>viaNode(n,x))))],
        ['当前节点 + 同地区其他 ProxyIP',curNode?uniq(local.slice(0,3).map(x=>viaNode(curNode,x))):[]],
        ...(away.length?[['其他地区',uniq([...(curNode?[curNode]:[]),...others].slice(0,4).flatMap(n=>away.slice(0,3).map(x=>viaNode(n,x,{crossRegion:true}))))]]:[]),
        ...(bareNodeList.length?[['节点自身代理兜底（无可用 ProxyIP）',bareNodeList]]:[]),
      ]};
    }
    async recover(reason){
      const first=await this.io.read(), a=first.account, expected=fields(a), expectedConfig=State.signature(a), owner=a?.id;
      const isErrIpSwitch=reason==='limited'||(reason==='error-switch'&&/^vless:/i.test(a?.proxy||'')&&Boolean(a?.proxyIp));
      let mode=isErrIpSwitch?'ip':'node';
      const strategy=State.mode(a);
      const canDirectEscape=Boolean(this.io.allowCrossRegionEscape&&a&&!State.locked(a,this.now())&&!a.authLocked&&(strategy==='direct'||strategy==='proxy'||/^(?:direct|none|off)$/i.test(String(a.proxy||'').trim()))&&(first.nodes||[]).length>0);
      if(!a?.id||first.enabled===false||(!State.canRecover(a)&&!canDirectEscape)||this.io.cancelled?.())return {ok:false,disabled:true,authLocked:State.locked(a)};
      let current=null;
      if((mode==='node'&&reason!=='error-switch')||(a.routeMode==='node'&&reason!=='limited')){
        // Two independent service checks; one success = keep everything (no latency-based switching).
        // 启动时（打开账号就连不上）只复核一次当前线路，尽快换到能用的
        const checks=(reason==='startup'||this.io.fastCheck)?1:2;
        for(let i=0;i<checks;i++){
          if(i){await this.wait(this.io.retryMs??2500);if(this.io.cancelled?.())return {ok:false,cancelled:true};}
          this.io.progress?.(i?'复测当前线路':'检测当前线路');
          current=await this.probe({...expected,kind:'current'},true);
          if(good(current)){this.failures=0;this.next=this.now()+15000;return {ok:true,changed:false,probe:current};}
          // 当前线路的服务检测被 429：这是出口 IP 被限流，不是节点断网——改走「换出口 IP」的流程
          if(current?.kind==='rate-limit'){mode='ip';break;}
          if(current?.reachable||['verification','service','config','unsupported'].includes(current?.kind)){this.next=this.now()+Math.max(15000,current.retryAfterMs||0);return {ok:false,blocked:true,kind:current.kind,retryAfterMs:current.retryAfterMs,error:current.error||'服务响应不是网络故障，保留当前线路'};}
        }
        if(this.io.cancelled?.())return {ok:false,cancelled:true};
      }
      this.netProblemCount=(this.netProblemCount||0)+1;
      if(a.proxyIp)this.recentIps.set(String(a.proxyIp).toLowerCase(),this.now()+600000);
      const groups=this.plan(first,mode,this.now());this.cursor++;
      if(groups.noIp)return {ok:false,error:'当前不是「节点 + ProxyIP」连接，无法自动更换出口 IP'};
      // ① 热备兜底库秒切（0 等待）：日常与抽卡期间已预检好第二 IP / 备用节点并签发好凭证，报错立刻顶上，无需等待现场测速；若备用也失效则继续试下一个或转现场并发检测
      if(typeof this.io.standby==='function'){
        while(!this.io.cancelled?.()){
          const sb=await this.io.standby(first,mode,reason,groups);
          if(!sb?.candidate||!good(sb.result))break;
          const sw=sb.candidate,sr=sb.result;
          if(!reputationOK(withProbe(first.pool||{},sr),sw.proxyIp||sr.ip,{...(first.pool?.ips?.[sw.proxyIp]||{}),eg:sr.ip},this.now()))continue;
          const nextReg=sr.loc||sw.region||groups.home;
          const route={...fields(sw),region:nextReg,routeHome:this.io.allowCrossRegionEscape?(nextReg||groups.home):groups.home};
          const label=sw.kind==='local'?'本地代理 '+new URL(sw.proxy).port:mode==='ip'&&sw.proxy===a.proxy?'ProxyIP '+sw.proxyIp+'（'+(nextReg||'未知地区')+'）':'节点 '+(sw.nodeId||'')+(sw.proxyIp?' · ProxyIP '+sw.proxyIp:'');
          this.io.progress?.('秒切热备线路 '+label);
          const applied=await this.io.apply({id:owner,expected,expectedConfig,expectedMode:strategy,route,ticket:sr.ticket}).catch(()=>null);
          if(applied?.ok){
            if(sw.proxyIp)this.recentIps.set(String(sw.proxyIp).toLowerCase(),this.now()+600000);
            this.failures=0;this.next=this.now()+30000;this.last=label;
            return {ok:true,changed:true,standby:true,mode,from:expected,account:applied.account,probe:sr,label};
          }
        }
      }
      const valid=(c,r)=>good(r)&&(c?.nativeFallback&&!c?.proxyIp?true:((this.io.allowCrossRegionEscape?Boolean(r.loc):(strategy!=='node'||!a.region||r.loc===a.region)&&!groups.occupied.has(r.loc))&&reputationOK(withProbe(first.pool||{},r),c.proxyIp||r.ip,{eg:r.ip},this.now())));
      let winner=null,result=null,limitedN=0;
      const batchSize=this.io.allowCrossRegionEscape?(this.io.batchSize||4):2;
      const forceGlobalLowest=Boolean(this.io.forceGlobalLowestLatency?.());
      for(const [stage,list] of groups.stages){
        for(let i=0;i<list.length&&!winner;i+=batchSize){
          if(this.io.cancelled?.())return {ok:false,cancelled:true};
          this.io.progress?.('检测'+stage);
          const measured=await Promise.all(list.slice(i,i+batchSize).map(async c=>({c,r:await this.probe(c)})));
          // 候选出口自己也被 429 或检测未通过/不纯：直接拉黑该候选，跳过它继续试下一个
          limitedN+=measured.filter(x=>x.r?.kind==='rate-limit').length;
          for(const x of measured){
            if(x.c?.proxyIp&&(!good(x.r)||!reputationOK(withProbe(first.pool||{},x.r),x.c.proxyIp||x.r?.ip,{eg:x.r?.ip},this.now()))){
              try{this.io.banBadIp?.(x.c,x.r);}catch{}
            }
          }
          const validList=measured.filter(x=>valid(x.c,x.r));
          const best=forceGlobalLowest?validList.sort((x,y)=>(x.r.ms||99999)-(y.r.ms||99999))[0]:validList[0];
          if(best){winner=best.c;result=best.r;}
        }
        if(winner)break;
      }
      if(!winner&&mode==='node'&&(strategy==='auto'||canDirectEscape)){
        this.io.progress?.('检测本地代理 7890 / 18080 等端口');
        const local=await this.io.local(ports).catch(()=>[]);
        const list=local.map(x=>({...x,proxy:/^127\.0\.0\.1:\d+$/.test(x.proxy||'')?'http://'+x.proxy:x.proxy})).sort((x,y)=>(x.ms||99999)-(y.ms||99999)).filter(x=>/^socks5?:\/\/127\.0\.0\.1:\d+$|^http:\/\/127\.0\.0\.1:\d+$/.test(x.proxy||'')&&x.proxy!==a.proxy).slice(0,6);
        for(let i=0;i<list.length;i+=2){if(this.io.cancelled?.())return {ok:false,cancelled:true};const cs=list.slice(i,i+2).map(x=>({proxy:x.proxy,proxyIp:'',nodeId:'',region:'',kind:'local'}));const rs=await Promise.all(cs.map(async c=>({c,r:await this.probe(c)})));const best=rs.filter(x=>good(x.r)&&reputationOK(withProbe(first.pool||{},x.r),x.r.ip,{eg:x.r.ip},this.now()))[0];if(best){winner=best.c;result=best.r;break;}}
      }
      if(!winner){this.failures++;this.next=this.now()+Math.min(120000,15000*2**Math.min(this.failures,3));return {ok:false,limited:limitedN>0,error:limitedN&&mode==='ip'?'已检测的候选出口也被限流（429），稍后继续换':mode==='ip'?'没有可用的其他 ProxyIP（都在冷却、占用或检测未通过），保留原配置':(strategy==='node'?'其他节点和同地区 ProxyIP 都未通过检测；节点模式不换地区，不退回其他代理或直连':'本轮候选节点与本地代理均未通过服务检测，保留原配置，稍后重试')};}
      const isNativeFallback=Boolean(winner.nativeFallback&&!winner.proxyIp);
      const nextReg=isNativeFallback?'':(result.loc||winner.region||groups.home||'');
      const label=winner.kind==='local'?'本地代理 '+new URL(winner.proxy).port:isNativeFallback?'节点本身代理兜底 '+(winner.nodeId||'')+(result.loc?'（'+result.loc+'）':''):mode==='ip'&&winner.proxy===a.proxy?'ProxyIP '+winner.proxyIp+'（'+(nextReg||'未知地区')+'）':'节点 '+(winner.nodeId||'')+(winner.proxyIp?' · ProxyIP '+winner.proxyIp:'');
      if(this.io.confirm&&!isNativeFallback&&!canDirectEscape){
        const yes=await this.io.confirm({mode,reason,label,winner,result,current,from:expected});
        if(!yes){this.next=this.now()+180000;return {ok:false,declined:true,error:'已保持当前线路（3 分钟内不再提示）'};}
      }
      const fresh=await this.io.read();
      if(fresh.enabled===false||(!State.canRecover(fresh.account)&&!canDirectEscape)||State.mode(fresh.account)!==strategy||this.io.cancelled?.()||fresh.account?.id!==owner||State.signature(fresh.account)!==expectedConfig||key(fresh.account)!==key(expected))return {ok:false,stale:true,error:'账号或线路已被修改，取消自动切换'};
      if(winner.proxyIp&&winner.proxyIp!==a.proxyIp&&(fresh.accounts||[]).some(x=>x.id!==a.id&&String(x.proxyIp||'').toLowerCase()===winner.proxyIp.toLowerCase()))return {ok:false,stale:true,error:'候选出口已被占用'};
      if(winner.kind==='node'){
        if(winner.proxy!==fresh.account.proxy&&!(fresh.nodes||[]).some(n=>this.io.link(n)===winner.proxy))return {ok:false,stale:true,error:'候选节点已被修改或删除'};
        if(winner.proxyIp&&winner.proxyIp!==a.proxyIp){const p=fresh.pool||{},e=p.ips?.[winner.proxyIp];if(!e||e.gone||p.ban?.[winner.proxyIp.toLowerCase()]||e.cool>this.now()||!reputationOK(withProbe(p,result),winner.proxyIp,{...e,eg:result.ip||e.eg},this.now()))return {ok:false,stale:true,error:'候选出口已被删除、禁用或冷却'};}
      }
      const route={...fields(winner),region:nextReg,routeHome:isNativeFallback?groups.home:(this.io.allowCrossRegionEscape?(nextReg||groups.home):groups.home)};
      this.io.progress?.('应用已验证线路并续接对话');
      const applied=await this.io.apply({id:owner,expected,expectedConfig,expectedMode:strategy,route,ticket:result.ticket,...(canDirectEscape?{forceFailover:true,mode:'node'}:{})});
      if(!applied?.ok)throw Error(applied?.error||'线路应用未确认');
      if(winner.proxyIp)this.recentIps.set(String(winner.proxyIp).toLowerCase(),this.now()+600000);
      this.failures=0;this.next=this.now()+(this.io.allowCrossRegionEscape?30000:20000);this.last=label;
      return {ok:true,changed:true,nativeFallback:isNativeFallback,mode,from:expected,account:applied.account,probe:result,label};
    }
  }
  return {ports,fields,key,good,withProbe,candidates,reputationOK,transportError,shouldRotateOnError,Engine};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RoutePolicy;
